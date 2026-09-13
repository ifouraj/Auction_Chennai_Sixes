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
  /** Exact BAT, BOWL, WK and LEAD values used for stable Best Six ties. */
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
 * Exact, unrounded category values. Best-six selection consumes this same
 * calculation so its choice can never drift from the public strength model.
 */
export function evaluateTeamStrength(
  purchases: readonly PurchasedPlayerStrengthInput[],
): TeamStrengthEvaluation {
  const battingTotal = sumBestRatings(purchases, 'batting', 5)
  const bowlingTotal = sumBestRatings(purchases, 'bowling', 5)
  const wicketKeeping = purchases.reduce(
    (best, { player }) => Math.max(best, player.wicketKeeping),
    0,
  )
  const leadership = purchases.reduce(
    (best, { player }) => Math.max(best, player.leadership),
    0,
  )
  // Dividing by five preserves zero-valued missing contributor slots until a
  // squad has enough players to fill the category.
  const batting = battingTotal / 5
  const bowling = bowlingTotal / 5
  const core = batting + bowling === 0
    ? 0
    : (2 * batting * bowling) / (batting + bowling)
  const scaledCategories = [batting, bowling, wicketKeeping, leadership] as const

  return {
    exact: {
      batting,
      bowling,
      wicketKeeping,
      leadership,
      overall: 0.94 * core + 0.03 * wicketKeeping + 0.03 * leadership,
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
 * Calculates strength for the supplied player set, regardless of price or
 * auction round. Public values use Math.round (nearest integer, with .5 rounded
 * upward). Overall is rounded only after applying the harmonic BAT/BOWL core
 * and 94/3/3 weighting, avoiding compounded category-rounding error.
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
