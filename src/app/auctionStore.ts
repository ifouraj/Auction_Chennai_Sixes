import { create, type StoreApi, type UseBoundStore } from 'zustand'

import type { AuctionParticipant, Player, PlayerPool, TeamId } from '../domain/types'
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

export const HARNESS_PARTICIPANTS: readonly AuctionParticipant[] = [
  { id: 'participant-a', teamId: 'team-a', seatIndex: 0, kind: 'HUMAN_LOCAL' },
  { id: 'participant-b', teamId: 'team-b', seatIndex: 1, kind: 'HUMAN_LOCAL' },
  { id: 'participant-c', teamId: 'team-c', seatIndex: 2, kind: 'HUMAN_LOCAL' },
  { id: 'participant-d', teamId: 'team-d', seatIndex: 3, kind: 'HUMAN_LOCAL' },
]

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
  readonly feedback: string | null
  createGame: (seed?: number) => void
  startAuction: () => void
  bid: (amount: number) => void
  pass: () => void
  notInterested: () => void
  tick: () => void
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

  return create<AuctionHarnessState>((set) => {
    const applyEngineCommand = (
      command: (state: AuctionState, teamId: TeamId) => AuctionState,
    ): void => {
      if (engineState === null || engineState.currentCard === null) return
      const before = engineState
      const activeTeamId = engineState.currentCard.activeTeamId
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
      feedback: null,
      createGame: (seed = initialSeed ?? Date.now()) => {
        pendingPool = createM2PlayerPool(seed)
        engineState = null
        set({
          stage: 'PRE_AUCTION',
          selectedPool: pendingPool.selectedPool,
          auction: null,
          lastResult: null,
          feedback: null,
        })
      },
      startAuction: () => {
        if (pendingPool === null) return
        engineState = startRound1Auction(pendingPool, HARNESS_PARTICIPANTS)
        set({
          stage: 'AUCTION',
          auction: getPublicAuctionState(engineState),
          lastResult: null,
          feedback: null,
        })
      },
      bid: (amount) => applyEngineCommand((state, teamId) => placeBid(state, teamId, amount)),
      pass: () => applyEngineCommand(passTurn),
      notInterested: () => applyEngineCommand(markNotInterested),
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
    }
  })
}

export const useAuctionHarness = createAuctionHarnessStore()
