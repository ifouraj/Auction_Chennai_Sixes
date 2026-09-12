import type { Player } from '../domain/types'

export interface SquadStrength {
  readonly batting: number
  readonly bowling: number
  readonly wicketKeeping: number
  readonly leadership: number
  readonly overall: number
}

type StrengthRating = Pick<
  Player,
  'batting' | 'bowling' | 'wicketKeeping' | 'leadership'
>

export interface PurchasedPlayerStrengthInput {
  readonly player: StrengthRating
}

function averageBestRatings(
  purchases: readonly PurchasedPlayerStrengthInput[],
  rating: keyof StrengthRating,
  contributorCount: number,
): number {
  const total = purchases
    .map(({ player }) => player[rating])
    .sort((left, right) => right - left)
    .slice(0, contributorCount)
    .reduce((sum, value) => sum + value, 0)

  // The fixed divisor makes every missing contributor a zero-rating slot.
  return total / contributorCount
}

/**
 * Calculates live strength from every purchased player, regardless of price or
 * auction round. Public values use Math.round (nearest integer, with .5 rounded
 * upward). Overall is rounded only after averaging the exact four dimensions,
 * avoiding compounded category-rounding error.
 */
export function calculateTeamStrength(
  purchases: readonly PurchasedPlayerStrengthInput[],
): SquadStrength {
  const exactBatting = averageBestRatings(purchases, 'batting', 5)
  const exactBowling = averageBestRatings(purchases, 'bowling', 3)
  const wicketKeeping = purchases.reduce(
    (best, { player }) => Math.max(best, player.wicketKeeping),
    0,
  )
  const leadership = purchases.reduce(
    (best, { player }) => Math.max(best, player.leadership),
    0,
  )
  const exactOverall =
    (exactBatting + exactBowling + wicketKeeping + leadership) / 4

  return {
    batting: Math.round(exactBatting),
    bowling: Math.round(exactBowling),
    wicketKeeping: Math.round(wicketKeeping),
    leadership: Math.round(leadership),
    overall: Math.round(exactOverall),
  }
}
