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
import {
  simulateTournament,
  type TournamentResult,
  type TournamentTeamInput,
} from '../engine/tournamentEngine'
import {
  eventAfterPublicAction,
  eventAfterResultHold,
  getTurnContext,
  type AuctionPresentationEvent,
} from '../presentation/auctionAnnouncer'
import {
  getPublicAIPersonalityLabel,
  type PublicAIPersonalityLabel,
} from '../presentation/aiPersonality'

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
  readonly tournament: TournamentResult | null
  readonly feedback: string | null
  readonly announcementEvent: AuctionPresentationEvent | null
  readonly announcementId: number
  readonly publicAiPersonalities: Readonly<Partial<Record<TeamId, PublicAIPersonalityLabel>>>
  readonly gameId: number
  createGame: (seed?: number) => void
  startAuction: () => void
  bid: (amount: number) => void
  pass: () => void
  notInterested: () => void
  actForAI: (expectedTurn: AITurnIdentity) => void
  tick: () => void
  advanceAnnouncement: (expectedAnnouncementId: number) => void
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
  let announcementId = 0

  const tournamentFromAuction = (): TournamentResult | null => {
    if (engineState?.status !== 'COMPLETE') return null
    const publicState = getPublicAuctionState(engineState)
    const teams = publicState.teams.map((team): TournamentTeamInput => {
      const participant = publicState.participants.find(
        (candidate) => candidate.teamId === team.teamId,
      )
      if (participant === undefined || !team.bestSix.isComplete) {
        throw new Error(`Completed auction has no complete Best Six for ${team.teamId}`)
      }
      const selectedIds = new Set(team.bestSix.playerIds)
      const bestSix = [
        ...team.purchasedPlayers.map(({ player }) => player),
        ...team.emergencyPlayers.map(({ player }) => player),
      ].filter(({ id }) => selectedIds.has(id))
      return { teamId: team.teamId, seatIndex: participant.seatIndex, bestSix }
    })
    return simulateTournament(teams, currentGameSeed)
  }

  return create<AuctionHarnessState>((set) => {
    const applyEngineCommand = (
      command: (state: AuctionState, teamId: TeamId) => AuctionState,
      action: 'BID' | 'PASS' | 'NOT_INTERESTED',
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
        const beforePublic = getPublicAuctionState(before)
        engineState = command(before, activeTeamId)
        const afterPublic = getPublicAuctionState(engineState)
        announcementId += 1
        set({
          auction: afterPublic,
          lastResult: resultAfterAction(before, engineState),
          announcementEvent: eventAfterPublicAction(
            beforePublic,
            afterPublic,
            action,
            activeTeamId,
          ),
          announcementId,
          tournament: tournamentFromAuction(),
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
      tournament: null,
      feedback: null,
      announcementEvent: null,
      announcementId,
      publicAiPersonalities: {},
      gameId,
      createGame: (seed = initialSeed ?? Date.now()) => {
        gameId += 1
        currentGameSeed = seed
        pendingPool = createM2PlayerPool(seed)
        engineState = null
        decisionRandom = createAIDecisionRandom(seed)
        set({
          stage: 'PRE_AUCTION',
          selectedPool: pendingPool.selectedPool,
          auction: null,
          lastResult: null,
          lastAiDecision: null,
          tournament: null,
          feedback: null,
          announcementEvent: null,
          announcementId,
          publicAiPersonalities: {},
          gameId,
        })
      },
      startAuction: () => {
        if (pendingPool === null) return
        engineState = startRound1Auction(pendingPool, DEFAULT_PARTICIPANTS)
        const publicState = getPublicAuctionState(engineState)
        const turn = getTurnContext(publicState)
        const publicAiPersonalities = Object.fromEntries(
          Object.entries(engineState.aiPersonalities).flatMap(([teamId, personality]) =>
            personality === undefined
              ? []
              : [[teamId, getPublicAIPersonalityLabel(personality)]],
          ),
        )
        announcementId += 1
        set({
          stage: 'AUCTION',
          auction: publicState,
          lastResult: null,
          lastAiDecision: null,
          tournament: null,
          feedback: null,
          announcementEvent: turn === null || publicState.currentCard === null ? null : {
            type: 'PLAYER_REVEAL',
            player: publicState.currentCard.player,
            round: publicState.round,
            turn,
          },
          announcementId,
          publicAiPersonalities,
        })
      },
      bid: (amount) => applyEngineCommand(
        (state, teamId) => placeBid(state, teamId, amount),
        'BID',
        'HUMAN_LOCAL',
      ),
      pass: () => applyEngineCommand(passTurn, 'PASS', 'HUMAN_LOCAL'),
      notInterested: () => applyEngineCommand(markNotInterested, 'NOT_INTERESTED', 'HUMAN_LOCAL'),
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
          const beforePublic = getPublicAuctionState(before)
          const afterPublic = getPublicAuctionState(engineState)
          announcementId += 1
          set({
            auction: afterPublic,
            lastResult: resultAfterAction(before, engineState),
            lastAiDecision: evaluation,
            announcementEvent: eventAfterPublicAction(
              beforePublic,
              afterPublic,
              evaluation.action.type,
              expectedTurn.teamId,
            ),
            announcementId,
            tournament: tournamentFromAuction(),
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
          const afterPublic = getPublicAuctionState(engineState)
          const timedOut = before.turnTimer?.remainingSeconds === 1
          if (timedOut) announcementId += 1
          set({
            auction: afterPublic,
            ...(timerResult === null ? {} : { lastResult: timerResult }),
            ...(timedOut ? {
              announcementEvent: eventAfterPublicAction(
                getPublicAuctionState(before), afterPublic, 'PASS',
                before.currentCard!.activeTeamId, true,
              ),
              announcementId,
            } : {}),
            tournament: tournamentFromAuction(),
            feedback: null,
          })
        } catch (error) {
          set({ feedback: friendlyError(error) })
        }
      },
      advanceAnnouncement: (expectedAnnouncementId) => {
        if (
          engineState === null ||
          expectedAnnouncementId !== announcementId
        ) return
        announcementId += 1
        set({
          announcementEvent: eventAfterResultHold(getPublicAuctionState(engineState)),
          announcementId,
        })
      },
    }
  })
}

export const useAuctionHarness = createAuctionHarnessStore()
