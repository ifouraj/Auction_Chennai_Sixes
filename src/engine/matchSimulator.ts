import type { Player, TeamId } from '../domain/types'
import { createRandomSource, type RandomSource } from './random'
import { calculateTeamStrength, type SquadStrength } from './teamStrength'

export interface MatchTeamInput {
  readonly teamId: TeamId
  /** The already-selected automatic Best Six. No reserves are considered. */
  readonly bestSix: readonly Player[]
}

export interface MatchInnings {
  readonly teamId: TeamId
  readonly runs: number
  readonly wickets: number
  readonly balls: number
  /** Cricket notation: 4.2 means four overs and two balls, not a decimal. */
  readonly overs: string
}

export type MatchMargin =
  | { readonly type: 'RUNS'; readonly value: number }
  | { readonly type: 'WICKETS'; readonly value: number }
  | { readonly type: 'TIEBREAK'; readonly value: null }

export interface MatchResult {
  readonly matchId: string
  readonly seed: number
  readonly teamAId: TeamId
  readonly teamBId: TeamId
  readonly battingFirstTeamId: TeamId
  readonly firstInnings: MatchInnings
  readonly secondInnings: MatchInnings
  readonly winnerTeamId: TeamId
  readonly loserTeamId: TeamId
  readonly tiebreakRequired: boolean
  readonly margin: MatchMargin
  readonly resultText: string
}

type DeliveryOutcome = 0 | 1 | 2 | 3 | 4 | 6 | 'WICKET'

/**
 * M11 tuning surface. All material scoring coefficients live here so M15 can
 * balance distributions without hunting through simulation control flow.
 */
export const MATCH_SIMULATION_CONFIG = Object.freeze({
  oversPerInnings: 5,
  ballsPerOver: 6,
  playersPerTeam: 6,
  baseOutcomeWeights: Object.freeze({
    dot: 24,
    one: 25,
    two: 12,
    three: 1,
    four: 18,
    six: 10,
    wicket: 10,
  }),
  matchupLogit: Object.freeze({
    dot: -0.58,
    one: -0.07,
    two: 0.15,
    three: 0.04,
    four: 0.59,
    six: 0.81,
    wicket: -0.62,
  }),
  wicketKeepingLogit: Object.freeze({
    dot: 0.04,
    one: -0.02,
    two: -0.02,
    three: -0.03,
    four: -0.04,
    six: -0.02,
    wicket: 0.11,
  }),
  batBowlMatchupScale: 0.9,
  leadershipMatchupScale: 0.06,
  leadershipStabilityScale: 0.05,
  normalFormSwing: 0.12,
  chaosFormChance: 0.08,
  chaosFormSwing: 2.5,
  chasePressureThreshold: 2.15,
  chasePressureScale: 0.12,
  matchSeedDomain: 0x6d313173,
  tiebreakSeedDomain: 0x74696531,
})

const OUTCOMES: readonly DeliveryOutcome[] = [0, 1, 2, 3, 4, 6, 'WICKET']

function hashText(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash | 0
}

function matchStreamSeed(seed: number, teamA: MatchTeamInput, teamB: MatchTeamInput): number {
  const squadIdentity = (team: MatchTeamInput) => team.bestSix
    .map(({ id, batting, bowling, wicketKeeping, leadership }) =>
      `${id}:${batting}:${bowling}:${wicketKeeping}:${leadership}`,
    )
    .sort()
  const identity = [
    teamA.teamId,
    ...squadIdentity(teamA),
    teamB.teamId,
    ...squadIdentity(teamB),
  ].join('|')
  return (seed ^ MATCH_SIMULATION_CONFIG.matchSeedDomain ^ hashText(identity)) | 0
}

function assertMatchTeam(team: MatchTeamInput): void {
  if (team.bestSix.length !== MATCH_SIMULATION_CONFIG.playersPerTeam) {
    throw new Error(`Match team ${team.teamId} requires a complete automatic Best Six`)
  }
  if (new Set(team.bestSix.map(({ id }) => id)).size !== team.bestSix.length) {
    throw new Error(`Match team ${team.teamId} contains duplicate player IDs`)
  }
}

function ballsToOvers(balls: number): string {
  return `${Math.floor(balls / MATCH_SIMULATION_CONFIG.ballsPerOver)}.${balls % MATCH_SIMULATION_CONFIG.ballsPerOver}`
}

function normalized(value: number): number {
  return Math.max(-1, Math.min(1, (value - 50) / 50))
}

function chooseWeighted(random: RandomSource, weights: readonly number[]): DeliveryOutcome {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let cursor = random.next() * total
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index]
    if (cursor < 0) return OUTCOMES[index]
  }
  return OUTCOMES.at(-1)!
}

function deliveryWeights(
  batting: SquadStrength,
  fielding: SquadStrength,
  chaseTarget: number | null,
  runs: number,
  balls: number,
  formSwing: number,
): readonly number[] {
  const config = MATCH_SIMULATION_CONFIG
  const matchup = ((batting.batting - fielding.bowling) / 100)
      * config.batBowlMatchupScale
    + ((batting.leadership - fielding.leadership) / 100)
      * config.leadershipMatchupScale
    + formSwing
  const keeping = normalized(fielding.wicketKeeping)
  const battingStability = normalized(batting.leadership)

  let chasePressure = 0
  if (chaseTarget !== null) {
    const ballsLeft = config.oversPerInnings * config.ballsPerOver - balls
    const runsNeeded = Math.max(0, chaseTarget - runs)
    const requiredPerBall = ballsLeft === 0 ? runsNeeded : runsNeeded / ballsLeft
    chasePressure = Math.max(0, requiredPerBall - config.chasePressureThreshold)
      * config.chasePressureScale * (1 - battingStability * 0.35)
  }

  const base = config.baseOutcomeWeights
  const matchupLogit = config.matchupLogit
  const wkLogit = config.wicketKeepingLogit
  const logits = [
    matchupLogit.dot * matchup + wkLogit.dot * keeping - chasePressure,
    matchupLogit.one * matchup + wkLogit.one * keeping,
    matchupLogit.two * matchup + wkLogit.two * keeping,
    matchupLogit.three * matchup + wkLogit.three * keeping,
    matchupLogit.four * matchup + wkLogit.four * keeping + chasePressure * 0.45,
    matchupLogit.six * matchup + wkLogit.six * keeping + chasePressure * 0.65,
    matchupLogit.wicket * matchup + wkLogit.wicket * keeping + chasePressure * 0.55,
  ]
  const baseWeights = [base.dot, base.one, base.two, base.three, base.four, base.six, base.wicket]
  const weights = baseWeights.map((weight, index) => weight * Math.exp(logits[index]))

  // Good leadership gently compresses extremes; it cannot replace BAT/BOWL.
  const stability = Math.max(0, battingStability) * config.leadershipStabilityScale
  weights[1] += (weights[0] + weights[5] + weights[6]) * stability
  weights[0] *= 1 - stability
  weights[5] *= 1 - stability
  weights[6] *= 1 - stability
  return weights
}

function simulateInnings(
  battingTeam: MatchTeamInput,
  battingStrength: SquadStrength,
  fieldingStrength: SquadStrength,
  random: RandomSource,
  chaseTarget: number | null,
): MatchInnings {
  const maximumBalls = MATCH_SIMULATION_CONFIG.oversPerInnings
    * MATCH_SIMULATION_CONFIG.ballsPerOver
  const maximumWickets = MATCH_SIMULATION_CONFIG.playersPerTeam - 1
  let runs = 0
  let wickets = 0
  let balls = 0
  const formRange = random.next() < MATCH_SIMULATION_CONFIG.chaosFormChance
    ? MATCH_SIMULATION_CONFIG.chaosFormSwing
    : MATCH_SIMULATION_CONFIG.normalFormSwing
  const formSwing = (random.next() * 2 - 1) * formRange

  while (
    balls < maximumBalls &&
    wickets < maximumWickets &&
    (chaseTarget === null || runs < chaseTarget)
  ) {
    const outcome = chooseWeighted(
      random,
      deliveryWeights(
        battingStrength,
        fieldingStrength,
        chaseTarget,
        runs,
        balls,
        formSwing,
      ),
    )
    balls += 1
    if (outcome === 'WICKET') wickets += 1
    else runs += outcome
  }

  return { teamId: battingTeam.teamId, runs, wickets, balls, overs: ballsToOvers(balls) }
}

function tiebreakWinner(
  seed: number,
  teamA: MatchTeamInput,
  teamB: MatchTeamInput,
): TeamId {
  const orderedIds = [teamA.teamId, teamB.teamId].sort()
  const random = createRandomSource(
    (matchStreamSeed(seed, teamA, teamB)
      ^ MATCH_SIMULATION_CONFIG.tiebreakSeedDomain
      ^ hashText(orderedIds.join('|'))) | 0,
  )

  // Seeded sudden-death abstraction: paired attempts continue until one wins.
  while (true) {
    const teamAScore = random.int(0, 6)
    const teamBScore = random.int(0, 6)
    if (teamAScore !== teamBScore) {
      return teamAScore > teamBScore ? teamA.teamId : teamB.teamId
    }
  }
}

function deterministicMatchId(
  seed: number,
  teamA: MatchTeamInput,
  teamB: MatchTeamInput,
): string {
  const hash = matchStreamSeed(seed, teamA, teamB) >>> 0
  return `match-${hash.toString(16).padStart(8, '0')}`
}

/** Pure, automatic 5-over Sixes match resolution. */
export function simulateMatch(
  teamA: MatchTeamInput,
  teamB: MatchTeamInput,
  seed: number,
): MatchResult {
  if (!Number.isInteger(seed)) throw new Error('Match seed must be an integer')
  if (teamA.teamId === teamB.teamId) throw new Error('A match requires two different teams')
  assertMatchTeam(teamA)
  assertMatchTeam(teamB)

  const teamAStrength = calculateTeamStrength(teamA.bestSix.map((player) => ({ player })))
  const teamBStrength = calculateTeamStrength(teamB.bestSix.map((player) => ({ player })))
  const random = createRandomSource(matchStreamSeed(seed, teamA, teamB))
  const teamABatsFirst = random.next() < 0.5
  const firstTeam = teamABatsFirst ? teamA : teamB
  const secondTeam = teamABatsFirst ? teamB : teamA
  const firstStrength = teamABatsFirst ? teamAStrength : teamBStrength
  const secondStrength = teamABatsFirst ? teamBStrength : teamAStrength
  const firstInnings = simulateInnings(firstTeam, firstStrength, secondStrength, random, null)
  const secondInnings = simulateInnings(
    secondTeam,
    secondStrength,
    firstStrength,
    random,
    firstInnings.runs + 1,
  )

  const tiebreakRequired = firstInnings.runs === secondInnings.runs
  const winnerTeamId = tiebreakRequired
    ? tiebreakWinner(seed, teamA, teamB)
    : secondInnings.runs > firstInnings.runs
      ? secondTeam.teamId
      : firstTeam.teamId
  const loserTeamId = winnerTeamId === teamA.teamId ? teamB.teamId : teamA.teamId
  const margin: MatchMargin = tiebreakRequired
    ? { type: 'TIEBREAK', value: null }
    : winnerTeamId === firstTeam.teamId
      ? { type: 'RUNS', value: firstInnings.runs - secondInnings.runs }
      : {
          type: 'WICKETS',
          value: MATCH_SIMULATION_CONFIG.playersPerTeam - 1 - secondInnings.wickets,
        }
  const resultText = margin.type === 'TIEBREAK'
    ? `${winnerTeamId} won after a tiebreak`
    : `${winnerTeamId} won by ${margin.value} ${
        margin.type === 'RUNS'
          ? margin.value === 1 ? 'run' : 'runs'
          : margin.value === 1 ? 'wicket' : 'wickets'
      }`

  return {
    matchId: deterministicMatchId(seed, teamA, teamB),
    seed,
    teamAId: teamA.teamId,
    teamBId: teamB.teamId,
    battingFirstTeamId: firstTeam.teamId,
    firstInnings,
    secondInnings,
    winnerTeamId,
    loserTeamId,
    tiebreakRequired,
    margin,
    resultText,
  }
}
