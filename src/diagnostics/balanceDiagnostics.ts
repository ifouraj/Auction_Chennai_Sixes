import { DEFAULT_STARTING_PURSE } from '../domain/constants'
import type {
  AIBidderPersonality,
  AuctionParticipant,
  Player,
  SeatIndex,
  TeamId,
} from '../domain/types'
import {
  createAIAuctionDecisionContext,
  createAIDecisionRandom,
  evaluateAuctionDecision,
} from '../engine/aiBidding'
import {
  getPublicAuctionState,
  markNotInterested,
  passTurn,
  placeBid,
  startRound1Auction,
  type AuctionState,
} from '../engine/auctionEngine'
import { simulateMatch, type MatchTeamInput } from '../engine/matchSimulator'
import { createM2PlayerPool } from '../engine/playerPool'
import {
  simulateTournament,
  type TournamentTeamInput,
} from '../engine/tournamentEngine'
import type { SquadStrength } from '../engine/teamStrength'

export const BALANCE_DIAGNOSTIC_THRESHOLDS = Object.freeze({
  /** Diagnostic labels only; these do not alter bidding or auction legality. */
  largeSpend: 75,
  veryLargeSpend: 100,
  maximumActionsPerAuction: 10_000,
})

const TEAM_IDS = ['team-a', 'team-b', 'team-c', 'team-d'] as const
const STRENGTH_KEYS = [
  'overall',
  'batting',
  'bowling',
  'wicketKeeping',
  'leadership',
] as const
const PERSONALITY_KEYS: readonly (keyof AIBidderPersonality)[] = [
  'aggression',
  'thrift',
  'patience',
  'balancePreference',
  'denial',
  'riskTolerance',
  'volatility',
]

export interface NumericDistribution {
  readonly count: number
  readonly minimum: number
  readonly maximum: number
  readonly mean: number
  readonly p10: number
  readonly median: number
  readonly p90: number
}

export interface DiagnosticTeamResult {
  readonly teamId: TeamId
  readonly seatIndex: SeatIndex
  readonly normalPurchases: number
  readonly emergencyPlayers: number
  readonly moneyRemaining: number
  readonly totalSpent: number
  readonly purchasePrices: readonly number[]
  readonly averagePurchasePrice: number
  readonly highestPurchasePrice: number
  readonly bargainPurchases: number
  readonly oneUnitBargainPurchases: number
  readonly largeSpends: number
  readonly veryLargeSpends: number
  readonly bids: number
  readonly passes: number
  readonly notInterested: number
  readonly strength: SquadStrength
  readonly personality: AIBidderPersonality
  readonly leagueWins: number
  readonly strengthRank: 1 | 2 | 3 | 4
  readonly champion: boolean
}

export interface CompleteGameDiagnostic {
  readonly seed: number
  readonly actions: number
  readonly round1Sold: number
  readonly round1Unsold: number
  readonly round2Sold: number
  readonly round2Rejected: number
  readonly matchUpsets: number
  readonly unequalStrengthMatches: number
  readonly teams: readonly DiagnosticTeamResult[]
}

export interface BalanceDiagnosticReport {
  readonly startingPurse: number
  readonly seedStart: number
  readonly seedEnd: number
  readonly games: number
  readonly tournaments: number
  readonly matches: number
  readonly matchBenchmarks: {
    readonly equal: { readonly games: number; readonly strongerWinRate: number }
    readonly clear: { readonly games: number; readonly strongerWinRate: number }
    readonly extreme: { readonly games: number; readonly strongerWinRate: number }
  }
  readonly auctionsWithEmergencyPlayers: number
  readonly teamsReceivingEmergencyPlayers: number
  readonly totalEmergencyPlayers: number
  readonly totalNormalPurchases: number
  readonly totalRound2Purchases: number
  readonly totalBargainPurchases: number
  readonly totalOneUnitBargainPurchases: number
  readonly totalLargeSpends: number
  readonly totalVeryLargeSpends: number
  readonly round1Sold: NumericDistribution
  readonly round1Unsold: NumericDistribution
  readonly round2Sold: NumericDistribution
  readonly round2Rejected: NumericDistribution
  readonly purchaseCounts: NumericDistribution
  readonly emergencyPlayersPerTeam: NumericDistribution
  readonly moneyRemaining: NumericDistribution
  readonly purchasePrices: NumericDistribution
  readonly highestPurchasePrices: NumericDistribution
  readonly bestSix: Readonly<Record<keyof SquadStrength, NumericDistribution>>
  readonly leagueWinsByStrengthRank: readonly number[]
  readonly championshipsBySeat: readonly number[]
  readonly seatMeans: readonly {
    readonly seatIndex: SeatIndex
    readonly purchases: number
    readonly emergencyPlayers: number
    readonly moneyRemaining: number
    readonly overall: number
  }[]
  readonly championshipsByStrengthRank: readonly number[]
  readonly upsetRate: number
  readonly actionRates: Readonly<Record<'BID' | 'PASS' | 'NOT_INTERESTED', number>>
  readonly personalityBehaviorCorrelations: Readonly<
    Record<keyof AIBidderPersonality, { readonly spend: number; readonly bids: number }>
  >
  readonly gamesDetail: readonly CompleteGameDiagnostic[]
}

export function createDiagnosticParticipants(
  humanSeat: SeatIndex | null = null,
): readonly AuctionParticipant[] {
  return TEAM_IDS.map((teamId, seatIndex) => ({
    id: `participant-${seatIndex}`,
    teamId,
    seatIndex: seatIndex as SeatIndex,
    kind: humanSeat === seatIndex ? 'HUMAN_LOCAL' as const : 'AI' as const,
  }))
}

function completeBestSixTeams(state: AuctionState): TournamentTeamInput[] {
  const publicState = getPublicAuctionState(state)
  return publicState.teams.map((team) => {
    const participant = publicState.participants.find(
      (candidate) => candidate.teamId === team.teamId,
    )
    if (participant === undefined || !team.bestSix.isComplete) {
      throw new Error(`Diagnostic game has no complete Best Six for ${team.teamId}`)
    }
    const selectedIds = new Set(team.bestSix.playerIds)
    const bestSix = [
      ...team.purchasedPlayers.map(({ player }) => player),
      ...team.emergencyPlayers.map(({ player }) => player),
    ].filter(({ id }) => selectedIds.has(id))
    return { teamId: team.teamId, seatIndex: participant.seatIndex, bestSix }
  })
}

function compareStrength(
  left: { readonly strength: SquadStrength; readonly seatIndex: SeatIndex },
  right: { readonly strength: SquadStrength; readonly seatIndex: SeatIndex },
): number {
  return right.strength.overall - left.strength.overall
    || right.strength.batting - left.strength.batting
    || right.strength.bowling - left.strength.bowling
    || right.strength.wicketKeeping - left.strength.wicketKeeping
    || right.strength.leadership - left.strength.leadership
    || left.seatIndex - right.seatIndex
}

/** Runs one complete all-AI game through the production auction and tournament engines. */
export function simulateCompleteDiagnosticGame(seed: number): CompleteGameDiagnostic {
  if (!Number.isInteger(seed)) throw new Error('Diagnostic seed must be an integer')
  let state = startRound1Auction(
    createM2PlayerPool(seed),
    createDiagnosticParticipants(),
  )
  const decisionRandom = createAIDecisionRandom(seed)
  const actions = Object.fromEntries(TEAM_IDS.map((teamId) => [teamId, {
    BID: 0,
    PASS: 0,
    NOT_INTERESTED: 0,
  }])) as Record<TeamId, Record<'BID' | 'PASS' | 'NOT_INTERESTED', number>>
  let actionCount = 0

  while (state.status === 'IN_PROGRESS') {
    if (actionCount >= BALANCE_DIAGNOSTIC_THRESHOLDS.maximumActionsPerAuction) {
      throw new Error(`Diagnostic auction failed to terminate for seed ${seed}`)
    }
    const teamId = state.currentCard?.activeTeamId
    if (teamId === undefined) throw new Error('Active diagnostic auction has no card')
    const personality = state.aiPersonalities[teamId]
    if (personality === undefined) throw new Error(`Missing AI personality for ${teamId}`)
    const evaluation = evaluateAuctionDecision(
      createAIAuctionDecisionContext(getPublicAuctionState(state), teamId),
      personality,
      decisionRandom,
    )
    actions[teamId][evaluation.action.type] += 1
    state = evaluation.action.type === 'BID'
      ? placeBid(state, teamId, evaluation.action.amount)
      : evaluation.action.type === 'PASS'
        ? passTurn(state, teamId)
        : markNotInterested(state, teamId)
    actionCount += 1
  }

  const tournamentTeams = completeBestSixTeams(state)
  const tournament = simulateTournament(tournamentTeams, seed)
  const publicState = getPublicAuctionState(state)
  const ranked = publicState.teams.map((team) => ({
    teamId: team.teamId,
    seatIndex: state.participants.find(({ teamId }) => teamId === team.teamId)!.seatIndex,
    strength: team.strength,
  })).sort(compareStrength)
  const rankByTeam = new Map(ranked.map((team, index) => [team.teamId, index + 1]))
  const allMatches = [...tournament.leagueMatches, tournament.finalMatch]
  const strengthByTeam = new Map(publicState.teams.map((team) => [team.teamId, team.strength.overall]))
  const unequalMatches = allMatches.filter((match) =>
    strengthByTeam.get(match.teamAId) !== strengthByTeam.get(match.teamBId),
  )
  const matchUpsets = unequalMatches.filter((match) =>
    strengthByTeam.get(match.winnerTeamId)! < strengthByTeam.get(match.loserTeamId)!,
  ).length
  const round1Purchases = state.teams.flatMap((team) =>
    team.purchasedPlayers.filter(({ round }) => round === 1),
  )
  const round2Purchases = state.teams.flatMap((team) =>
    team.purchasedPlayers.filter(({ round }) => round === 2),
  )

  return {
    seed,
    actions: actionCount,
    round1Sold: round1Purchases.length,
    round1Unsold: 25 - round1Purchases.length,
    round2Sold: round2Purchases.length,
    round2Rejected: state.rejectedPlayers.length,
    matchUpsets,
    unequalStrengthMatches: unequalMatches.length,
    teams: publicState.teams.map((team) => {
      const prices = team.purchasedPlayers.map(({ pricePaid }) => pricePaid)
      return {
        teamId: team.teamId,
        seatIndex: state.participants.find(({ teamId }) => teamId === team.teamId)!.seatIndex,
        normalPurchases: team.purchasedPlayerCount,
        emergencyPlayers: team.emergencyPlayers.length,
        moneyRemaining: team.balance,
        totalSpent: state.startingPurse - team.balance,
        purchasePrices: prices,
        averagePurchasePrice: mean(prices),
        highestPurchasePrice: prices.length === 0 ? 0 : Math.max(...prices),
        bargainPurchases: team.purchasedPlayers.filter(
          ({ player, round, pricePaid }) => round === 2 && pricePaid < player.basePrice,
        ).length,
        oneUnitBargainPurchases: team.purchasedPlayers.filter(
          ({ round, pricePaid }) => round === 2 && pricePaid === 1,
        ).length,
        largeSpends: prices.filter((price) => price >= BALANCE_DIAGNOSTIC_THRESHOLDS.largeSpend).length,
        veryLargeSpends: prices.filter(
          (price) => price >= BALANCE_DIAGNOSTIC_THRESHOLDS.veryLargeSpend,
        ).length,
        bids: actions[team.teamId].BID,
        passes: actions[team.teamId].PASS,
        notInterested: actions[team.teamId].NOT_INTERESTED,
        strength: team.strength,
        personality: state.aiPersonalities[team.teamId]!,
        leagueWins: tournament.standings.find(({ teamId }) => teamId === team.teamId)!.won,
        strengthRank: rankByTeam.get(team.teamId)! as 1 | 2 | 3 | 4,
        champion: tournament.championTeamId === team.teamId,
      }
    }),
  }
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.round((sorted.length - 1) * fraction)]
}

export function distribution(values: readonly number[]): NumericDistribution {
  const sorted = [...values].sort((left, right) => left - right)
  return {
    count: sorted.length,
    minimum: sorted.at(0) ?? 0,
    maximum: sorted.at(-1) ?? 0,
    mean: mean(sorted),
    p10: percentile(sorted, 0.1),
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
  }
}

function correlation(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) return 0
  const leftMean = mean(left)
  const rightMean = mean(right)
  let numerator = 0
  let leftSquares = 0
  let rightSquares = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean
    const rightDelta = right[index] - rightMean
    numerator += leftDelta * rightDelta
    leftSquares += leftDelta ** 2
    rightSquares += rightDelta ** 2
  }
  const denominator = Math.sqrt(leftSquares * rightSquares)
  return denominator === 0 ? 0 : numerator / denominator
}

function benchmarkTeam(teamId: string, rating: number): MatchTeamInput {
  const bestSix = Array.from({ length: 6 }, (_, index): Player => ({
    id: `${teamId}-${index}`,
    name: `${teamId}-${index}`,
    country: 'Diagnostic',
    age: 25,
    description: 'M15 deterministic match benchmark',
    batting: rating,
    bowling: rating,
    wicketKeeping: rating,
    leadership: rating,
    overall: rating,
    basePrice: 1,
    kind: 'NORMAL',
  }))
  return { teamId, bestSix }
}

function benchmarkWinRate(
  stronger: MatchTeamInput,
  weaker: MatchTeamInput,
  games: number,
): number {
  let wins = 0
  for (let seed = 0; seed < games; seed += 1) {
    if (simulateMatch(stronger, weaker, seed).winnerTeamId === stronger.teamId) wins += 1
  }
  return wins / games
}

function runMatchBenchmarks(): BalanceDiagnosticReport['matchBenchmarks'] {
  const equalGames = 2_000
  const clearGames = 2_000
  const extremeGames = 3_000
  return {
    equal: {
      games: equalGames,
      strongerWinRate: benchmarkWinRate(
        benchmarkTeam('equal-a', 50), benchmarkTeam('equal-b', 50), equalGames,
      ),
    },
    clear: {
      games: clearGames,
      strongerWinRate: benchmarkWinRate(
        benchmarkTeam('clear-strong', 80), benchmarkTeam('clear-average', 50), clearGames,
      ),
    },
    extreme: {
      games: extremeGames,
      strongerWinRate: benchmarkWinRate(
        benchmarkTeam('extreme-strong', 100), benchmarkTeam('extreme-weak', 0), extremeGames,
      ),
    },
  }
}

/** Deterministic aggregation for an inclusive integer seed range. */
export function runBalanceDiagnostics(seedStart: number, seedEnd: number): BalanceDiagnosticReport {
  if (!Number.isInteger(seedStart) || !Number.isInteger(seedEnd) || seedEnd < seedStart) {
    throw new Error('Diagnostic seed range must be inclusive ascending integers')
  }
  const games = Array.from(
    { length: seedEnd - seedStart + 1 },
    (_, index) => simulateCompleteDiagnosticGame(seedStart + index),
  )
  const teams = games.flatMap(({ teams: gameTeams }) => gameTeams)
  const purchasePrices = teams.flatMap((team) => team.purchasePrices)
  const championshipsBySeat = [0, 0, 0, 0]
  const championshipsByStrengthRank = [0, 0, 0, 0]
  const leagueWinsByStrengthRank = [0, 0, 0, 0]
  for (const team of teams) {
    leagueWinsByStrengthRank[team.strengthRank - 1] += team.leagueWins
    if (team.champion) {
      championshipsBySeat[team.seatIndex] += 1
      championshipsByStrengthRank[team.strengthRank - 1] += 1
    }
  }
  const totalActions = teams.reduce(
    (total, team) => total + team.bids + team.passes + team.notInterested,
    0,
  )
  const personalityBehaviorCorrelations = Object.fromEntries(
    PERSONALITY_KEYS.map((key) => [key, {
      spend: correlation(teams.map(({ personality }) => personality[key]), teams.map(({ totalSpent }) => totalSpent)),
      bids: correlation(teams.map(({ personality }) => personality[key]), teams.map(({ bids }) => bids)),
    }]),
  ) as BalanceDiagnosticReport['personalityBehaviorCorrelations']
  const bestSix = Object.fromEntries(STRENGTH_KEYS.map((key) => [
    key,
    distribution(teams.map(({ strength }) => strength[key])),
  ])) as BalanceDiagnosticReport['bestSix']
  const seatMeans = ([0, 1, 2, 3] as const).map((seatIndex) => {
    const seatTeams = teams.filter((team) => team.seatIndex === seatIndex)
    return {
      seatIndex,
      purchases: mean(seatTeams.map(({ normalPurchases }) => normalPurchases)),
      emergencyPlayers: mean(seatTeams.map(({ emergencyPlayers }) => emergencyPlayers)),
      moneyRemaining: mean(seatTeams.map(({ moneyRemaining }) => moneyRemaining)),
      overall: mean(seatTeams.map(({ strength }) => strength.overall)),
    }
  })

  return {
    startingPurse: DEFAULT_STARTING_PURSE,
    seedStart,
    seedEnd,
    games: games.length,
    tournaments: games.length,
    matches: games.length * 7,
    matchBenchmarks: runMatchBenchmarks(),
    auctionsWithEmergencyPlayers: games.filter(({ teams: gameTeams }) =>
      gameTeams.some(({ emergencyPlayers }) => emergencyPlayers > 0),
    ).length,
    teamsReceivingEmergencyPlayers: teams.filter(({ emergencyPlayers }) => emergencyPlayers > 0).length,
    totalEmergencyPlayers: teams.reduce((sum, { emergencyPlayers }) => sum + emergencyPlayers, 0),
    totalNormalPurchases: teams.reduce((sum, { normalPurchases }) => sum + normalPurchases, 0),
    totalRound2Purchases: games.reduce((sum, { round2Sold }) => sum + round2Sold, 0),
    totalBargainPurchases: teams.reduce((sum, { bargainPurchases }) => sum + bargainPurchases, 0),
    totalOneUnitBargainPurchases: teams.reduce(
      (sum, { oneUnitBargainPurchases }) => sum + oneUnitBargainPurchases,
      0,
    ),
    totalLargeSpends: teams.reduce((sum, { largeSpends }) => sum + largeSpends, 0),
    totalVeryLargeSpends: teams.reduce((sum, { veryLargeSpends }) => sum + veryLargeSpends, 0),
    round1Sold: distribution(games.map(({ round1Sold }) => round1Sold)),
    round1Unsold: distribution(games.map(({ round1Unsold }) => round1Unsold)),
    round2Sold: distribution(games.map(({ round2Sold }) => round2Sold)),
    round2Rejected: distribution(games.map(({ round2Rejected }) => round2Rejected)),
    purchaseCounts: distribution(teams.map(({ normalPurchases }) => normalPurchases)),
    emergencyPlayersPerTeam: distribution(teams.map(({ emergencyPlayers }) => emergencyPlayers)),
    moneyRemaining: distribution(teams.map(({ moneyRemaining }) => moneyRemaining)),
    purchasePrices: distribution(purchasePrices),
    highestPurchasePrices: distribution(teams.map(({ highestPurchasePrice }) => highestPurchasePrice)),
    bestSix,
    leagueWinsByStrengthRank,
    championshipsBySeat,
    seatMeans,
    championshipsByStrengthRank,
    upsetRate: games.reduce((sum, { matchUpsets }) => sum + matchUpsets, 0)
      / Math.max(1, games.reduce((sum, { unequalStrengthMatches }) => sum + unequalStrengthMatches, 0)),
    actionRates: {
      BID: teams.reduce((sum, { bids }) => sum + bids, 0) / Math.max(1, totalActions),
      PASS: teams.reduce((sum, { passes }) => sum + passes, 0) / Math.max(1, totalActions),
      NOT_INTERESTED: teams.reduce((sum, team) => sum + team.notInterested, 0) / Math.max(1, totalActions),
    },
    personalityBehaviorCorrelations,
    gamesDetail: games,
  }
}

export function formatBalanceReport(report: BalanceDiagnosticReport): string {
  const rounded = (value: number) => Number(value.toFixed(3))
  return JSON.stringify(report, (_key, value) =>
    typeof value === 'number' && !Number.isInteger(value) ? rounded(value) : value,
  2)
}
