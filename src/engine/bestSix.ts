import type { Player, PlayerId } from '../domain/types'
import {
  calculateTeamStrength,
  evaluateTeamStrength,
  type SquadStrength,
} from './teamStrength'

type BestSixPlayer = Pick<
  Player,
  'id' | 'batting' | 'bowling' | 'wicketKeeping' | 'leadership'
>

export interface BestSixPlayerInput {
  readonly player: BestSixPlayer
}

export interface BestSixResult {
  readonly playerIds: readonly PlayerId[]
  readonly isComplete: boolean
  readonly strength: SquadStrength
}

interface Candidate {
  readonly purchases: readonly BestSixPlayerInput[]
  readonly playerIds: readonly PlayerId[]
  /** All categories scaled to a common denominator of 15. */
  readonly scaledCategories: readonly [number, number, number, number]
  readonly exactOverall: number
}

function makeCandidate(
  purchases: readonly BestSixPlayerInput[],
): Candidate {
  const playerIds = purchases.map(({ player }) => player.id).sort(compareIds)
  const { exact, scaledCategories } = evaluateTeamStrength(purchases)

  return {
    purchases,
    playerIds,
    scaledCategories,
    exactOverall: exact.overall,
  }
}

function compareIds(left: PlayerId, right: PlayerId): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareLexicalIds(
  left: readonly PlayerId[],
  right: readonly PlayerId[],
): number {
  for (let index = 0; index < left.length; index += 1) {
    const compared = compareIds(left[index], right[index])
    if (compared !== 0) return compared
  }
  return left.length - right.length
}

/** Positive means left is the preferred candidate. */
function compareCandidates(left: Candidate, right: Candidate): number {
  const leftOverall = left.exactOverall
  const rightOverall = right.exactOverall
  if (leftOverall !== rightOverall) return leftOverall - rightOverall

  const leftWeakest = Math.min(...left.scaledCategories)
  const rightWeakest = Math.min(...right.scaledCategories)
  if (leftWeakest !== rightWeakest) return leftWeakest - rightWeakest

  for (let index = 0; index < left.scaledCategories.length; index += 1) {
    const difference = left.scaledCategories[index] - right.scaledCategories[index]
    if (difference !== 0) return difference
  }

  // A smaller sorted ID sequence wins the final stable tie-break.
  return -compareLexicalIds(left.playerIds, right.playerIds)
}

function visitCombinations<T>(
  values: readonly T[],
  size: number,
  visit: (combination: readonly T[]) => void,
): void {
  const combination: T[] = []

  const choose = (startIndex: number): void => {
    if (combination.length === size) {
      visit([...combination])
      return
    }

    const remainingNeeded = size - combination.length
    for (
      let index = startIndex;
      index <= values.length - remainingNeeded;
      index += 1
    ) {
      combination.push(values[index])
      choose(index + 1)
      combination.pop()
    }
  }

  choose(0)
}

/**
 * Selects the fixed automatic tournament squad from current owned players.
 * Purchases, prices, rounds, and caller array ordering cannot affect the result.
 */
export function calculateBestSix(
  purchases: readonly BestSixPlayerInput[],
): BestSixResult {
  const ordered = [...purchases].sort((left, right) =>
    compareIds(left.player.id, right.player.id),
  )
  const uniqueIds = new Set(ordered.map(({ player }) => player.id))
  if (uniqueIds.size !== ordered.length) {
    throw new Error('Best Six requires unique owned player IDs')
  }

  if (ordered.length <= 6) {
    return {
      playerIds: ordered.map(({ player }) => player.id),
      isComplete: ordered.length === 6,
      strength: calculateTeamStrength(ordered),
    }
  }

  let best: Candidate | null = null
  visitCombinations(ordered, 6, (combination) => {
    const candidate = makeCandidate(combination)
    if (best === null || compareCandidates(candidate, best) > 0) best = candidate
  })

  if (best === null) throw new Error('Best Six selection produced no candidate')
  const selected: Candidate = best
  return {
    playerIds: selected.playerIds,
    isComplete: true,
    strength: calculateTeamStrength(selected.purchases),
  }
}
