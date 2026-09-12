import type { Player } from '../domain/types'

export interface SquadStrength {
  readonly batting: number
  readonly bowling: number
  readonly wicketKeeping: number
  readonly leadership: number
  readonly overall: number
}

export interface ExactSquadStrength {
  readonly batting: number
  readonly bowling: number
  readonly wicketKeeping: number
  readonly leadership: number
  readonly overall: number
}

export interface TeamStrengthEvaluation {
  readonly exact: ExactSquadStrength
  /** BAT, BOWL, WK and LEAD on a shared exact denominator of 15. */
  readonly scaledCategories: readonly [number, number, number, number]
}

type StrengthRating = Pick<
  Player,
  'batting' | 'bowling' | 'wicketKeeping' | 'leadership'
>

export interface PurchasedPlayerStrengthInput {
  readonly player: StrengthRating
}

function sumBestRatings(
  purchases: readonly PurchasedPlayerStrengthInput[],
  rating: keyof StrengthRating,
  contributorCount: number,
): number {
  return purchases
    .map(({ player }) => player[rating])
    .sort((left, right) => right - left)
    .slice(0, contributorCount)
    .reduce((sum, value) => sum + value, 0)
}

/**
 * Exact, unrounded M7 category values. Best-six selection consumes this same
 * calculation so its choice can never drift from the public strength model.
 */
export function evaluateTeamStrength(
  purchases: readonly PurchasedPlayerStrengthInput[],
): TeamStrengthEvaluation {
  const battingTotal = sumBestRatings(purchases, 'batting', 5)
  const bowlingTotal = sumBestRatings(purchases, 'bowling', 3)
  const wicketKeeping = purchases.reduce(
    (best, { player }) => Math.max(best, player.wicketKeeping),
    0,
  )
  const leadership = purchases.reduce(
    (best, { player }) => Math.max(best, player.leadership),
    0,
  )
  const scaledCategories = [
    battingTotal * 3,
    bowlingTotal * 5,
    wicketKeeping * 15,
    leadership * 15,
  ] as const
  const batting = scaledCategories[0] / 15
  const bowling = scaledCategories[1] / 15

  return {
    exact: {
      batting,
      bowling,
      wicketKeeping,
      leadership,
      overall:
        scaledCategories.reduce((sum, category) => sum + category, 0) / 60,
    },
    scaledCategories,
  }
}

export function calculateExactTeamStrength(
  purchases: readonly PurchasedPlayerStrengthInput[],
): ExactSquadStrength {
  return evaluateTeamStrength(purchases).exact
}

/**
 * Calculates M7 strength for the supplied player set, regardless of price or
 * auction round. Public values use Math.round (nearest integer, with .5 rounded
 * upward). Overall is rounded only after averaging the exact four dimensions,
 * avoiding compounded category-rounding error.
 */
export function calculateTeamStrength(
  purchases: readonly PurchasedPlayerStrengthInput[],
): SquadStrength {
  const exact = calculateExactTeamStrength(purchases)

  return {
    batting: Math.round(exact.batting),
    bowling: Math.round(exact.bowling),
    wicketKeeping: Math.round(exact.wicketKeeping),
    leadership: Math.round(exact.leadership),
    overall: Math.round(exact.overall),
  }
}
