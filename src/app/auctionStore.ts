import { create, type StoreApi, type UseBoundStore } from 'zustand'

import type { AuctionParticipant, Player, PlayerPool, TeamId } from '../domain/types'
import {
  createAIAuctionDecisionContext,
  createAIDecisionRandom,
  evaluateAuctionDecision,
  type AIDecisionEvaluation,
} from '../engine/aiBidding'
import {
  advanceTurnTimer,
  AuctionRuleError,
  getPublicAuctionState,
  markNotInterested,
  passTurn,
  placeBid,
  startRound1Auction,
  type AuctionCardResult,
  type AuctionState,
  type PublicAuctionState,
} from '../engine/auctionEngine'
import { createM2PlayerPool } from '../engine/playerPool'
import { simulateMatch, type MatchResult, type MatchTeamInput } from '../engine/matchSimulator'

export const DEFAULT_PARTICIPANTS: readonly AuctionParticipant[] = [
  { id: 'participant-a', teamId: 'team-a', seatIndex: 0, kind: 'HUMAN_LOCAL' },
  { id: 'participant-b', teamId: 'team-b', seatIndex: 1, kind: 'AI' },
  { id: 'participant-c', teamId: 'team-c', seatIndex: 2, kind: 'AI' },
  { id: 'participant-d', teamId: 'team-d', seatIndex: 3, kind: 'AI' },
]

export interface AITurnIdentity {
  readonly gameId: number
  readonly round: 1 | 2
  readonly cardNumber: number
  readonly teamId: TeamId
  readonly highestBid: number | null
}

export const TEAM_NAMES: Readonly<Record<TeamId, string>> = {
  'team-a': 'Team A',
  'team-b': 'Team B',
  'team-c': 'Team C',
  'team-d': 'Team D',
}

export type HarnessStage = 'WELCOME' | 'PRE_AUCTION' | 'AUCTION'

export interface AuctionHarnessState {
  readonly stage: HarnessStage
  readonly selectedPool: readonly Player[]
  readonly auction: PublicAuctionState | null
  readonly lastResult: AuctionCardResult | null
  readonly lastAiDecision: AIDecisionEvaluation | null
  readonly lastMatch: MatchResult | null
  readonly feedback: string | null
  readonly gameId: number
  createGame: (seed?: number) => void
  startAuction: () => void
  bid: (amount: number) => void
  pass: () => void
  notInterested: () => void
  actForAI: (expectedTurn: AITurnIdentity) => void
  tick: () => void
  simulateExhibition: (teamAId: TeamId, teamBId: TeamId) => void
}

const errorMessages: Readonly<Record<string, string>> = {
  AUCTION_NOT_ACTIVE: 'The auction is not active.',
  NOT_ACTIVE_TEAM: 'Only the team whose turn is shown can act.',
  TEAM_NOT_INTERESTED: 'This team has left bidding for this player.',
  HIGHEST_BIDDER_CANNOT_RAISE_SELF: 'The highest bidder cannot bid against itself.',
  BID_MUST_BE_INTEGER: 'Bid must be a whole number.',
  BID_BELOW_BASE_PRICE: 'Bid is below the Round 1 base price.',
  BID_BELOW_MINIMUM_MONEY_UNIT: 'Round 2 opening bid must be at least 1.',
  BID_MUST_EXCEED_CURRENT: 'Bid must be greater than the current highest bid.',
  BID_EXCEEDS_BALANCE: 'Bid exceeds this team\'s balance.',
  BID_MUST_LEAVE_NON_ZERO_BALANCE: 'Bank rule: this team must retain a non-zero balance.',
  INVALID_TIMER_ELAPSE: 'The timer received an invalid elapsed time.',
  INVALID_TIMER_STATE: 'The auction timer is out of sync.',
}

function resultAfterAction(
  before: AuctionState,
  after: AuctionState,
): AuctionCardResult | null {
  return after.results.length > before.results.length
    ? after.results.at(-1) ?? null
    : null
}

function friendlyError(error: unknown): string {
  if (error instanceof AuctionRuleError) {
    return errorMessages[error.code] ?? error.code
  }
  return error instanceof Error ? error.message : 'Unknown auction error.'
}

export function createAuctionHarnessStore(
  initialSeed?: number,
): UseBoundStore<StoreApi<AuctionHarnessState>> {
  let pendingPool: PlayerPool | null = null
  let engineState: AuctionState | null = null
  let decisionRandom = createAIDecisionRandom(initialSeed ?? 0)
  let gameId = 0
  let currentGameSeed = initialSeed ?? 0
  let exhibitionSequence = 0

  return create<AuctionHarnessState>((set) => {
    const applyEngineCommand = (
      command: (state: AuctionState, teamId: TeamId) => AuctionState,
      expectedKind?: AuctionParticipant['kind'],
    ): void => {
      if (engineState === null || engineState.currentCard === null) return
      const before = engineState
      const activeTeamId = engineState.currentCard.activeTeamId
      const participant = engineState.participants.find(
        (candidate) => candidate.teamId === activeTeamId,
      )
      if (expectedKind !== undefined && participant?.kind !== expectedKind) return
      try {
        engineState = command(before, activeTeamId)
        set({
          auction: getPublicAuctionState(engineState),
          lastResult: resultAfterAction(before, engineState),
          feedback: null,
        })
      } catch (error) {
        set({ feedback: friendlyError(error) })
      }
    }

    return {
      stage: 'WELCOME',
      selectedPool: [],
      auction: null,
      lastResult: null,
      lastAiDecision: null,
      lastMatch: null,
      feedback: null,
      gameId,
      createGame: (seed = initialSeed ?? Date.now()) => {
        gameId += 1
        currentGameSeed = seed
        exhibitionSequence = 0
        pendingPool = createM2PlayerPool(seed)
        engineState = null
        decisionRandom = createAIDecisionRandom(seed)
        set({
          stage: 'PRE_AUCTION',
          selectedPool: pendingPool.selectedPool,
          auction: null,
          lastResult: null,
          lastAiDecision: null,
          lastMatch: null,
          feedback: null,
          gameId,
        })
      },
      startAuction: () => {
        if (pendingPool === null) return
        engineState = startRound1Auction(pendingPool, DEFAULT_PARTICIPANTS)
        set({
          stage: 'AUCTION',
          auction: getPublicAuctionState(engineState),
          lastResult: null,
          lastAiDecision: null,
          lastMatch: null,
          feedback: null,
        })
      },
      bid: (amount) => applyEngineCommand(
        (state, teamId) => placeBid(state, teamId, amount),
        'HUMAN_LOCAL',
      ),
      pass: () => applyEngineCommand(passTurn, 'HUMAN_LOCAL'),
      notInterested: () => applyEngineCommand(markNotInterested, 'HUMAN_LOCAL'),
      actForAI: (expectedTurn) => {
        if (
          engineState === null ||
          engineState.currentCard === null ||
          expectedTurn.gameId !== gameId ||
          engineState.round !== expectedTurn.round ||
          engineState.currentCard.cardNumber !== expectedTurn.cardNumber ||
          engineState.currentCard.activeTeamId !== expectedTurn.teamId ||
          engineState.currentCard.highestBid !== expectedTurn.highestBid
        ) return
        const participant = engineState.participants.find(
          ({ teamId }) => teamId === expectedTurn.teamId,
        )
        const personality = engineState.aiPersonalities[expectedTurn.teamId]
        if (participant?.kind !== 'AI' || personality === undefined) return

        const publicState = getPublicAuctionState(engineState)
        const evaluation = evaluateAuctionDecision(
          createAIAuctionDecisionContext(publicState, expectedTurn.teamId),
          personality,
          decisionRandom,
        )
        const before = engineState
        try {
          engineState = evaluation.action.type === 'BID'
            ? placeBid(before, expectedTurn.teamId, evaluation.action.amount)
            : evaluation.action.type === 'PASS'
              ? passTurn(before, expectedTurn.teamId)
              : markNotInterested(before, expectedTurn.teamId)
          set({
            auction: getPublicAuctionState(engineState),
            lastResult: resultAfterAction(before, engineState),
            lastAiDecision: evaluation,
            feedback: null,
          })
        } catch (error) {
          set({ feedback: friendlyError(error), lastAiDecision: evaluation })
        }
      },
      tick: () => {
        if (engineState === null || engineState.status !== 'IN_PROGRESS') return
        const before = engineState
        try {
          engineState = advanceTurnTimer(before, 1)
          const timerResult = resultAfterAction(before, engineState)
          set({
            auction: getPublicAuctionState(engineState),
            ...(timerResult === null ? {} : { lastResult: timerResult }),
            feedback: null,
          })
        } catch (error) {
          set({ feedback: friendlyError(error) })
        }
      },
      simulateExhibition: (teamAId, teamBId) => {
        if (engineState?.status !== 'COMPLETE' || teamAId === teamBId) return
        const toMatchTeam = (teamId: TeamId): MatchTeamInput | null => {
          const team = getPublicAuctionState(engineState!).teams.find(
            (candidate) => candidate.teamId === teamId,
          )
          if (team === undefined || !team.bestSix.isComplete) return null
          const selectedIds = new Set(team.bestSix.playerIds)
          const bestSix = [
            ...team.purchasedPlayers.map(({ player }) => player),
            ...team.emergencyPlayers.map(({ player }) => player),
          ].filter(({ id }) => selectedIds.has(id))
          return { teamId, bestSix }
        }
        const teamA = toMatchTeam(teamAId)
        const teamB = toMatchTeam(teamBId)
        if (teamA === null || teamB === null) return
        exhibitionSequence += 1
        set({
          lastMatch: simulateMatch(
            teamA,
            teamB,
            (currentGameSeed + exhibitionSequence) | 0,
          ),
        })
      },
    }
  })
}

export const useAuctionHarness = createAuctionHarnessStore()
