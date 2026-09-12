import { AUCTION_POOL_SIZE } from '../domain/constants'
import type {
  AuctionParticipant,
  Money,
  Player,
  PlayerId,
  PlayerPool,
  SeatIndex,
  TeamId,
} from '../domain/types'
import { validateBid } from './biddingRules'

export type AuctionAction = 'BID' | 'PASS' | 'NOT_INTERESTED'
export type AuctionStatus = 'IN_PROGRESS' | 'COMPLETE'

export interface AuctionCardState {
  readonly player: Player
  readonly cardNumber: number
  readonly startedByTeamId: TeamId
  readonly activeTeamId: TeamId
  readonly highestBid: Money | null
  readonly highestBidderId: TeamId | null
  readonly notInterestedTeamIds: readonly TeamId[]
  /** PASS applies for one traversal only and is cleared by the next valid bid. */
  readonly passedThisCycleTeamIds: readonly TeamId[]
  readonly lastActionByTeamId: Readonly<Partial<Record<TeamId, AuctionAction>>>
}

export type AuctionCardResult =
  | {
      readonly outcome: 'SOLD'
      readonly player: Player
      readonly buyerTeamId: TeamId
      readonly price: Money
      readonly cardNumber: number
    }
  | {
      readonly outcome: 'UNSOLD'
      readonly player: Player
      readonly cardNumber: number
    }

/**
 * Authoritative engine state. `privateAuctionQueue` is intentionally excluded
 * from `getPublicAuctionState`; application/UI code should consume that view.
 */
export interface Round1AuctionState {
  readonly round: 1
  readonly status: AuctionStatus
  readonly participants: readonly AuctionParticipant[]
  readonly selectedPool: readonly Player[]
  readonly currentCard: AuctionCardState | null
  readonly playerIndex: number
  readonly totalPlayers: number
  readonly unsoldPlayers: readonly Player[]
  readonly results: readonly AuctionCardResult[]
  readonly privateAuctionQueue: readonly Player[]
}

export type PublicRound1AuctionState = Omit<
  Round1AuctionState,
  'privateAuctionQueue'
>

export class AuctionRuleError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'AuctionRuleError'
    this.code = code
  }
}

function assertValidParticipants(
  participants: readonly AuctionParticipant[],
): void {
  if (participants.length !== 4) {
    throw new Error('Round 1 requires exactly four participants')
  }

  const ids = new Set(participants.map(({ id }) => id))
  const teamIds = new Set(participants.map(({ teamId }) => teamId))
  const seats = new Set(participants.map(({ seatIndex }) => seatIndex))

  if (ids.size !== 4 || teamIds.size !== 4 || seats.size !== 4) {
    throw new Error('Participant IDs, team IDs, and seat indexes must be unique')
  }

  if (![0, 1, 2, 3].every((seat) => seats.has(seat as SeatIndex))) {
    throw new Error('Participants must occupy seat indexes 0 through 3')
  }
}

function assertValidPool(pool: PlayerPool): void {
  if (
    pool.selectedPool.length !== AUCTION_POOL_SIZE ||
    pool.auctionQueue.length !== AUCTION_POOL_SIZE
  ) {
    throw new Error(`Round 1 requires exactly ${AUCTION_POOL_SIZE} players`)
  }

  const selectedIds = new Set(pool.selectedPool.map(({ id }) => id))
  const queueIds = new Set(pool.auctionQueue.map(({ id }) => id))

  if (
    selectedIds.size !== AUCTION_POOL_SIZE ||
    queueIds.size !== AUCTION_POOL_SIZE ||
    [...selectedIds].some((id) => !queueIds.has(id))
  ) {
    throw new Error('Selected pool and private queue must contain the same players')
  }

  if (pool.selectedPool.some(({ kind }) => kind !== 'NORMAL')) {
    throw new Error('Round 1 accepts NORMAL players only')
  }
}

function participantsBySeat(
  participants: readonly AuctionParticipant[],
): readonly AuctionParticipant[] {
  return [...participants].sort((left, right) => left.seatIndex - right.seatIndex)
}

function makeCard(
  state: Pick<
    Round1AuctionState,
    'participants' | 'privateAuctionQueue' | 'playerIndex'
  >,
): AuctionCardState {
  const cardNumber = state.playerIndex + 1
  const starterSeat = (state.playerIndex % 4) as SeatIndex
  const starter = state.participants.find(
    ({ seatIndex }) => seatIndex === starterSeat,
  )
  const player = state.privateAuctionQueue[state.playerIndex]

  if (starter === undefined || player === undefined) {
    throw new Error('Cannot create auction card from invalid state')
  }

  return {
    player,
    cardNumber,
    startedByTeamId: starter.teamId,
    activeTeamId: starter.teamId,
    highestBid: null,
    highestBidderId: null,
    notInterestedTeamIds: [],
    passedThisCycleTeamIds: [],
    lastActionByTeamId: {},
  }
}

export function startRound1Auction(
  pool: PlayerPool,
  participants: readonly AuctionParticipant[],
): Round1AuctionState {
  assertValidPool(pool)
  assertValidParticipants(participants)

  const initial: Round1AuctionState = {
    round: 1,
    status: 'IN_PROGRESS',
    participants: participantsBySeat(participants),
    selectedPool: [...pool.selectedPool],
    currentCard: null,
    playerIndex: 0,
    totalPlayers: pool.auctionQueue.length,
    unsoldPlayers: [],
    results: [],
    privateAuctionQueue: [...pool.auctionQueue],
  }

  return { ...initial, currentCard: makeCard(initial) }
}

export function getPublicAuctionState(
  state: Round1AuctionState,
): PublicRound1AuctionState {
  return {
    round: state.round,
    status: state.status,
    participants: state.participants,
    selectedPool: state.selectedPool,
    currentCard: state.currentCard,
    playerIndex: state.playerIndex,
    totalPlayers: state.totalPlayers,
    unsoldPlayers: state.unsoldPlayers,
    results: state.results,
  }
}

function currentSeatIndex(
  state: Round1AuctionState,
  teamId: TeamId,
): SeatIndex {
  const participant = state.participants.find(
    (candidate) => candidate.teamId === teamId,
  )
  if (participant === undefined) {
    throw new AuctionRuleError('UNKNOWN_TEAM')
  }
  return participant.seatIndex
}

function findNextActiveTeam(
  state: Round1AuctionState,
  card: AuctionCardState,
  afterTeamId: TeamId,
): TeamId | null {
  const afterSeat = currentSeatIndex(state, afterTeamId)

  for (let offset = 1; offset <= 4; offset += 1) {
    const seatIndex = ((afterSeat + offset) % 4) as SeatIndex
    const candidate = state.participants.find(
      (participant) => participant.seatIndex === seatIndex,
    )

    if (
      candidate !== undefined &&
      candidate.teamId !== card.highestBidderId &&
      !card.notInterestedTeamIds.includes(candidate.teamId) &&
      !card.passedThisCycleTeamIds.includes(candidate.teamId)
    ) {
      return candidate.teamId
    }
  }

  return null
}

function resolveAndAdvance(
  state: Round1AuctionState,
  card: AuctionCardState,
): Round1AuctionState {
  const result: AuctionCardResult =
    card.highestBidderId !== null && card.highestBid !== null
      ? {
          outcome: 'SOLD',
          player: card.player,
          buyerTeamId: card.highestBidderId,
          price: card.highestBid,
          cardNumber: card.cardNumber,
        }
      : {
          outcome: 'UNSOLD',
          player: card.player,
          cardNumber: card.cardNumber,
        }
  const nextPlayerIndex = state.playerIndex + 1
  const baseState: Round1AuctionState = {
    ...state,
    playerIndex: nextPlayerIndex,
    unsoldPlayers:
      result.outcome === 'UNSOLD'
        ? [...state.unsoldPlayers, card.player]
        : state.unsoldPlayers,
    results: [...state.results, result],
    currentCard: null,
  }

  if (nextPlayerIndex === state.totalPlayers) {
    return { ...baseState, status: 'COMPLETE' }
  }

  return { ...baseState, currentCard: makeCard(baseState) }
}

function advanceOrResolve(
  state: Round1AuctionState,
  card: AuctionCardState,
  afterTeamId: TeamId,
): Round1AuctionState {
  const nextTeamId = findNextActiveTeam(state, card, afterTeamId)
  if (nextTeamId === null) {
    return resolveAndAdvance(state, card)
  }

  return {
    ...state,
    currentCard: { ...card, activeTeamId: nextTeamId },
  }
}

function requireActiveCard(
  state: Round1AuctionState,
  teamId: TeamId,
): AuctionCardState {
  if (state.status !== 'IN_PROGRESS' || state.currentCard === null) {
    throw new AuctionRuleError('AUCTION_NOT_ACTIVE')
  }
  if (state.currentCard.activeTeamId !== teamId) {
    throw new AuctionRuleError('NOT_ACTIVE_TEAM')
  }
  return state.currentCard
}

export function placeBid(
  state: Round1AuctionState,
  teamId: TeamId,
  amount: Money,
): Round1AuctionState {
  const validation = validateBid(state, teamId, amount)
  if (!validation.ok) {
    throw new AuctionRuleError(validation.reason)
  }

  const card = state.currentCard!
  const updatedCard: AuctionCardState = {
    ...card,
    highestBid: amount,
    highestBidderId: teamId,
    passedThisCycleTeamIds: [],
    lastActionByTeamId: { ...card.lastActionByTeamId, [teamId]: 'BID' },
  }

  return advanceOrResolve(state, updatedCard, teamId)
}

export function passTurn(
  state: Round1AuctionState,
  teamId: TeamId,
): Round1AuctionState {
  const card = requireActiveCard(state, teamId)
  const updatedCard: AuctionCardState = {
    ...card,
    passedThisCycleTeamIds: [...card.passedThisCycleTeamIds, teamId],
    lastActionByTeamId: { ...card.lastActionByTeamId, [teamId]: 'PASS' },
  }

  return advanceOrResolve(state, updatedCard, teamId)
}

export function markNotInterested(
  state: Round1AuctionState,
  teamId: TeamId,
): Round1AuctionState {
  const card = requireActiveCard(state, teamId)
  const updatedCard: AuctionCardState = {
    ...card,
    notInterestedTeamIds: [...card.notInterestedTeamIds, teamId],
    lastActionByTeamId: {
      ...card.lastActionByTeamId,
      [teamId]: 'NOT_INTERESTED',
    },
  }

  return advanceOrResolve(state, updatedCard, teamId)
}

export function getCurrentPlayerId(
  state: PublicRound1AuctionState,
): PlayerId | null {
  return state.currentCard?.player.id ?? null
}
