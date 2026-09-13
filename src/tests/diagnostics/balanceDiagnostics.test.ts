import { describe, expect, it } from 'vitest'

import {
  AI_PRESENTATION_DELAY_MS,
  AUCTION_POOL_SIZE,
  AUCTION_RESULT_HOLD_MS,
  DEFAULT_STARTING_PURSE,
} from '../../domain/constants'
import type { Player, SeatIndex } from '../../domain/types'
import {
  createAIAuctionDecisionContext,
  createAIDecisionRandom,
  decideAuctionAction,
} from '../../engine/aiBidding'
import {
  getPublicAuctionState,
  passTurn,
  startRound1Auction,
  type AuctionState,
} from '../../engine/auctionEngine'
import { calculateBestSix } from '../../engine/bestSix'
import { assignEmergencyPlayers } from '../../engine/emergencySignings'
import { simulateMatch, type MatchTeamInput } from '../../engine/matchSimulator'
import { createM2PlayerPool } from '../../engine/playerPool'
import { simulateTournament, type TournamentTeamInput } from '../../engine/tournamentEngine'
import {
  createDiagnosticParticipants,
  runBalanceDiagnostics,
  simulateCompleteDiagnosticGame,
} from '../../diagnostics/balanceDiagnostics'

function uniformTeam(teamId: string, rating: number): MatchTeamInput {
  return {
    teamId,
    bestSix: Array.from({ length: 6 }, (_, index): Player => ({
      id: `${teamId}-${index}`,
      name: `${teamId}-${index}`,
      country: 'Test',
      age: 25,
      description: 'M15 fixture',
      batting: rating,
      bowling: rating,
      wicketKeeping: rating,
      leadership: rating,
      overall: rating,
      basePrice: 1,
      kind: 'NORMAL',
    })),
  }
}

function allPassToCompletion(initial: AuctionState): AuctionState {
  let state = initial
  let actions = 0
  while (state.status === 'IN_PROGRESS' && actions < 1_000) {
    state = passTurn(state, state.currentCard!.activeTeamId)
    actions += 1
  }
  expect(actions).toBeLessThan(1_000)
  return state
}

function tournamentTeams(state: AuctionState): TournamentTeamInput[] {
  return getPublicAuctionState(state).teams.map((team, seatIndex) => {
    const selected = new Set(team.bestSix.playerIds)
    const bestSix = team.emergencyPlayers.map(({ player }) => player)
      .filter(({ id }) => selected.has(id))
    return { teamId: team.teamId, seatIndex: seatIndex as SeatIndex, bestSix }
  })
}

describe('M15 deterministic balance diagnostics', () => {
  it('holds auction results for 3 seconds without changing the 2-second AI delay', () => {
    expect(AUCTION_RESULT_HOLD_MS).toBe(3_000)
    expect(AI_PRESENTATION_DELAY_MS).toBe(2_000)
  })

  it('repeats complete-game and aggregate diagnostics for the same seed range', () => {
    expect(simulateCompleteDiagnosticGame(1200)).toEqual(simulateCompleteDiagnosticGame(1200))
    expect(runBalanceDiagnostics(1200, 1209)).toEqual(runBalanceDiagnostics(1200, 1209))
  })

  it('terminates complete seeded games with legal purses and measurable emergency frequency', () => {
    const report = runBalanceDiagnostics(1300, 1339)
    expect(report.games).toBe(40)
    expect(report.totalEmergencyPlayers).toBeGreaterThan(0)
    expect(report.teamsReceivingEmergencyPlayers).toBeGreaterThan(0)
    expect(report.gamesDetail.every(({ actions }) => actions < 10_000)).toBe(true)
    expect(report.gamesDetail.flatMap(({ teams }) => teams)
      .every(({ moneyRemaining }) => moneyRemaining >= 0)).toBe(true)
  })

  it('keeps Team A participant kind out of pool order, auction rules, emergency assignment, and Best Six', () => {
    const seed = 1400
    const pool = createM2PlayerPool(seed)
    const human = startRound1Auction(pool, createDiagnosticParticipants(0))
    const ai = startRound1Auction(pool, createDiagnosticParticipants())
    expect(human.privateAuctionQueue).toEqual(ai.privateAuctionQueue)
    expect(human.currentCard).toEqual(ai.currentCard)
    expect(human.teams).toEqual(ai.teams)

    const humanComplete = allPassToCompletion(human)
    const aiComplete = allPassToCompletion(ai)
    expect(humanComplete.teams).toEqual(aiComplete.teams)
    expect(humanComplete.emergencySignings).toEqual(aiComplete.emergencySignings)
    expect(getPublicAuctionState(humanComplete).teams.map(({ bestSix }) => bestSix))
      .toEqual(getPublicAuctionState(aiComplete).teams.map(({ bestSix }) => bestSix))
    expect(simulateTournament(tournamentTeams(humanComplete), seed))
      .toEqual(simulateTournament(tournamentTeams(aiComplete), seed))
  })

  it('keeps future order outside AI context and decisions', () => {
    const initial = startRound1Auction(createM2PlayerPool(1500), createDiagnosticParticipants())
    const changed: AuctionState = {
      ...initial,
      privateAuctionQueue: [initial.privateAuctionQueue[0], ...initial.privateAuctionQueue.slice(1).reverse()],
    }
    const context = createAIAuctionDecisionContext(getPublicAuctionState(initial), 'team-a')
    const changedContext = createAIAuctionDecisionContext(getPublicAuctionState(changed), 'team-a')
    expect(changedContext).toEqual(context)
    expect(decideAuctionAction(context, initial.aiPersonalities['team-a']!, createAIDecisionRandom(77)))
      .toEqual(decideAuctionAction(changedContext, changed.aiPersonalities['team-a']!, createAIDecisionRandom(77)))
  })

  it('keeps all seats competitive while strength matters and upsets survive', () => {
    const report = runBalanceDiagnostics(1600, 1799)
    expect(report.championshipsBySeat.every((wins) => wins > 10)).toBe(true)
    expect(report.championshipsByStrengthRank[0])
      .toBeGreaterThan(report.championshipsByStrengthRank[3])
    expect(report.championshipsByStrengthRank[3]).toBeGreaterThan(0)
    expect(report.leagueWinsByStrengthRank[0])
      .toBeGreaterThan(report.leagueWinsByStrengthRank[3])
    expect(report.upsetRate).toBeGreaterThan(0.05)
    expect(report.upsetRate).toBeLessThan(0.5)
    expect(Number.isFinite(report.personalityBehaviorCorrelations.aggression.spend)).toBe(true)
    expect(Number.isFinite(report.personalityBehaviorCorrelations.thrift.spend)).toBe(true)
  })

  it('confirms equal and extreme matchups retain the locked broad behavior', () => {
    const equalA = uniformTeam('equal-a', 50)
    const equalB = uniformTeam('equal-b', 50)
    const strong = uniformTeam('strong', 100)
    const weak = uniformTeam('weak', 0)
    const seeds = Array.from({ length: 600 }, (_, seed) => seed)
    const equalRate = seeds.filter((seed) =>
      simulateMatch(equalA, equalB, seed).winnerTeamId === equalA.teamId,
    ).length / seeds.length
    const strongRate = seeds.filter((seed) =>
      simulateMatch(strong, weak, seed).winnerTeamId === strong.teamId,
    ).length / seeds.length
    expect(equalRate).toBeGreaterThan(0.42)
    expect(equalRate).toBeLessThan(0.58)
    expect(strongRate).toBeGreaterThan(0.85)
    expect(strongRate).toBeLessThan(1)
  })

  it('reports deterministic equal, modest, clear, and extreme matchup bands', () => {
    const benchmarks = runBalanceDiagnostics(1801, 1810).matchBenchmarks
    expect(benchmarks.equal.strongerWinRate).toBeGreaterThan(0.45)
    expect(benchmarks.equal.strongerWinRate).toBeLessThan(0.55)
    expect(benchmarks.modest.strongerWinRate).toBeGreaterThanOrEqual(0.6)
    expect(benchmarks.modest.strongerWinRate).toBeLessThanOrEqual(0.7)
    expect(benchmarks.clear.strongerWinRate).toBeGreaterThanOrEqual(0.75)
    expect(benchmarks.clear.strongerWinRate).toBeLessThanOrEqual(0.85)
    expect(benchmarks.extreme.strongerWinRate).toBeGreaterThan(0.95)
    expect(benchmarks.extreme.strongerWinRate).toBeLessThan(1)
  })

  it('preserves strict random 25-player selection, Best Six inputs, and emergency identity', () => {
    const pool = createM2PlayerPool(1800)
    expect(pool.selectedPool).toHaveLength(AUCTION_POOL_SIZE)
    expect(new Set(pool.selectedPool.map(({ id }) => id))).toHaveLength(AUCTION_POOL_SIZE)
    const seven = pool.selectedPool.slice(0, 7).map((player, index) => ({
      player: { ...player, overall: index % 2 ? 0 : 100 },
      pricePaid: index % 2 ? 1 : DEFAULT_STARTING_PURSE,
      round: index % 2 ? 2 as const : 1 as const,
    }))
    const neutral = seven.map(({ player, ...purchase }) => ({
      ...purchase,
      player: { ...player, overall: 50 },
    }))
    expect(calculateBestSix(seven)).toEqual(calculateBestSix(neutral))

    const incomplete: Array<{
      teamId: string
      purchasedPlayerCount: number
      emergencyPlayers: readonly { player: Player; source: 'EMERGENCY' }[]
    }> = createDiagnosticParticipants().map(({ teamId }, index) => ({
      teamId,
      purchasedPlayerCount: index + 2,
      emergencyPlayers: [],
    }))
    const assignment = assignEmergencyPlayers(incomplete, 1800)
    expect(assignment.teams.every((team) =>
      team.purchasedPlayerCount + team.emergencyPlayers.length === 6,
    )).toBe(true)
    expect(assignment.teams.flatMap(({ emergencyPlayers }) => emergencyPlayers)
      .every(({ player }) => player.kind === 'PUNISHMENT')).toBe(true)
  })

  it('observes Round 2 discounts while the engine retains legal 1-unit bargains', () => {
    const report = runBalanceDiagnostics(1900, 1949)
    expect(report.totalRound2Purchases).toBeGreaterThan(0)
    expect(report.totalBargainPurchases).toBeGreaterThan(0)
    expect(report.totalBargainPurchases).toBeLessThanOrEqual(report.totalRound2Purchases)
  })

  it.each([0, 1, 2, 3] as const)('can place the human in seat %i without changing its seat index', (seat) => {
    const participants = createDiagnosticParticipants(seat as SeatIndex)
    expect(participants[seat].kind).toBe('HUMAN_LOCAL')
    expect(participants.map(({ seatIndex }) => seatIndex)).toEqual([0, 1, 2, 3])
  })
})
