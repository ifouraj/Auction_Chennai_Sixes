import type { TeamId } from '../domain/types'
import type { MatchResult } from '../engine/matchSimulator'
import type { SquadStrength } from '../engine/teamStrength'

export type MatchFlavor = 'UPSET' | 'DOMINANT' | 'NAIL-BITER' | 'TIEBREAK'

/** Uses only the completed M11 result and the participating public strengths. */
export function classifyMatch(
  result: MatchResult,
  strengths: Readonly<Record<TeamId, Pick<SquadStrength, 'overall'>>>,
): MatchFlavor | null {
  if (result.tiebreakRequired || result.margin.type === 'TIEBREAK') return 'TIEBREAK'
  const winner = strengths[result.winnerTeamId]?.overall
  const loser = strengths[result.loserTeamId]?.overall
  if (winner !== undefined && loser !== undefined && winner + 8 <= loser) return 'UPSET'
  if (
    (result.margin.type === 'RUNS' && result.margin.value >= 25) ||
    (result.margin.type === 'WICKETS' && result.margin.value >= 4)
  ) return 'DOMINANT'
  if (
    (result.margin.type === 'RUNS' && result.margin.value <= 5) ||
    (result.margin.type === 'WICKETS' && result.margin.value <= 1)
  ) return 'NAIL-BITER'
  return null
}
