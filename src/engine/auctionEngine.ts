import {
  AUCTION_POOL_SIZE,
  AUCTION_TURN_SECONDS,
  DEFAULT_STARTING_PURSE,
  MINIMUM_LEGAL_MONEY_UNIT,
  TARGET_NORMAL_SQUAD_SIZE,
} from '../domain/constants'
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
import { createRandomSource } from './random'

export type AuctionAction = 'BID' | 'PASS' | 'NOT_INTERESTED'
export type AuctionStatus = 'IN_PROGRESS' | 'COMPLETE'
export type AuctionPhase = 'ROUND_1' | 'ROUND_2' | 'COMPLETE'
export type AuctionRound = 1 | 2

/**
 * Deterministic countdown data for the current turn. An application may drive
 * it from an interval, but the domain engine never reads the wall clock.
 */
export interface AuctionTurnTimerState {
  readonly teamId: TeamId
  readonly remainingSeconds: number
}

export interface PurchasedPlayer {
  readonly player: Player
  readonly pricePaid: Money
  readonly round: AuctionRound
}

export interface AuctionTeamState {
  readonly teamId: TeamId
  readonly balance: Money
  readonly purchasedPlayerCount: number
  readonly purchasedPlayers: readonly PurchasedPlayer[]
}

export interface Round1AuctionConfig {
  readonly startingPurse: Money
  /** Used when a caller supplies a pool without the originating M2 seed. */
  readonly seed?: number
}

export interface AuctionCardState {
  readonly player: Player
  /** Round 2 deliberately has no base-price floor. */
  readonly basePrice: Money | null
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
export interface AuctionState {
  readonly phase: AuctionPhase
  readonly round: AuctionRound
  readonly status: AuctionStatus
  readonly seed: number
  readonly participants: readonly AuctionParticipant[]
  readonly startingPurse: Money
  readonly teams: readonly AuctionTeamState[]
  readonly selectedPool: readonly Player[]
  readonly currentCard: AuctionCardState | null
  readonly turnTimer: AuctionTurnTimerState | null
  readonly playerIndex: number
  readonly totalPlayers: number
  readonly unsoldPlayers: readonly Player[]
  /** Players rejected for a second time and permanently removed in Round 2. */
  readonly rejectedPlayers: readonly Player[]
  readonly results: readonly AuctionCardResult[]
  readonly privateAuctionQueue: readonly Player[]
}

/** Backwards-compatible name retained for M3-M5 consumers. */
export type Round1AuctionState = AuctionState

export type PublicRound1AuctionState = Omit<
  AuctionState,
  'privateAuctionQueue' | 'seed'
>
export type PublicAuctionState = PublicRound1AuctionState

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

function assertValidStartingPurse(startingPurse: Money): void {
  if (!Number.isSafeInteger(startingPurse) || startingPurse < 0) {
    throw new Error('Starting purse must be a non-negative integer money unit')
  }
}

function participantsBySeat(
  participants: readonly AuctionParticipant[],
): readonly AuctionParticipant[] {
  return [...participants].sort((left, right) => left.seatIndex - right.seatIndex)
}

function makeCard(
  state: Pick<
    AuctionState,
    'participants' | 'privateAuctionQueue' | 'playerIndex' | 'round'
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
    basePrice: state.round === 1 ? player.basePrice : null,
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

function makeTurnTimer(teamId: TeamId): AuctionTurnTimerState {
  return { teamId, remainingSeconds: AUCTION_TURN_SECONDS }
}

function getTeamState(
  state: Pick<AuctionState, 'teams'>,
  teamId: TeamId,
): AuctionTeamState {
  const team = state.teams.find((candidate) => candidate.teamId === teamId)
  if (team === undefined) {
    throw new AuctionRuleError('UNKNOWN_TEAM')
  }
  return team
}

function minimumLegalBid(card: AuctionCardState): Money {
  if (card.highestBid !== null) {
    return card.highestBid + MINIMUM_LEGAL_MONEY_UNIT
  }
  return card.basePrice ?? MINIMUM_LEGAL_MONEY_UNIT
}

function canTeamAffordLegalBid(
  state: Pick<AuctionState, 'teams'>,
  card: AuctionCardState,
  teamId: TeamId,
): boolean {
  const team = getTeamState(state, teamId)
  const minimumBid = minimumLegalBid(card)

  return (
    minimumBid <= team.balance &&
    (team.purchasedPlayerCount >= TARGET_NORMAL_SQUAD_SIZE - 1 ||
      minimumBid < team.balance)
  )
}

/** Whether the team can afford the smallest legal bid for the current card. */
export function canTeamMakeLegalBid(
  state: AuctionState,
  teamId: TeamId,
): boolean {
  if (state.status !== 'IN_PROGRESS' || state.currentCard === null) {
    return false
  }
  const card = state.currentCard
  return (
    card.highestBidderId !== teamId &&
    !card.notInterestedTeamIds.includes(teamId) &&
    !card.passedThisCycleTeamIds.includes(teamId) &&
    canTeamAffordLegalBid(state, card, teamId)
  )
}

export function startRound1Auction(
  pool: PlayerPool,
  participants: readonly AuctionParticipant[],
  config: Round1AuctionConfig = { startingPurse: DEFAULT_STARTING_PURSE },
): AuctionState {
  assertValidPool(pool)
  assertValidParticipants(participants)
  assertValidStartingPurse(config.startingPurse)

  const orderedParticipants = participantsBySeat(participants)

  const seed = pool.seed ?? config.seed ?? 0
  if (!Number.isInteger(seed)) {
    throw new Error('Random seed must be an integer')
  }

  const initial: AuctionState = {
    phase: 'ROUND_1',
    round: 1,
    status: 'IN_PROGRESS',
    seed,
    participants: orderedParticipants,
    startingPurse: config.startingPurse,
    teams: orderedParticipants.map(({ teamId }) => ({
      teamId,
      balance: config.startingPurse,
      purchasedPlayerCount: 0,
      purchasedPlayers: [],
    })),
    selectedPool: [...pool.selectedPool],
    currentCard: null,
    turnTimer: null,
    playerIndex: 0,
    totalPlayers: pool.auctionQueue.length,
    unsoldPlayers: [],
    rejectedPlayers: [],
    results: [],
    privateAuctionQueue: [...pool.auctionQueue],
  }

  return startNextAvailableCard(initial)
}

export function getPublicAuctionState(
  state: AuctionState,
): PublicRound1AuctionState {
  return {
    phase: state.phase,
    round: state.round,
    status: state.status,
    participants: state.participants,
    startingPurse: state.startingPurse,
    teams: state.teams,
    selectedPool: state.selectedPool,
    currentCard: state.currentCard,
    turnTimer: state.turnTimer,
    playerIndex: state.playerIndex,
    totalPlayers: state.totalPlayers,
    unsoldPlayers: state.unsoldPlayers,
    rejectedPlayers: state.rejectedPlayers,
    results: state.results,
  }
}

function currentSeatIndex(
  state: AuctionState,
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
  state: AuctionState,
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
      !card.passedThisCycleTeamIds.includes(candidate.teamId) &&
      canTeamAffordLegalBid(state, card, candidate.teamId)
    ) {
      return candidate.teamId
    }
  }

  return null
}

function findFirstActiveTeam(
  state: AuctionState,
  card: AuctionCardState,
): TeamId | null {
  const starterSeat = currentSeatIndex(state, card.startedByTeamId)

  for (let offset = 0; offset < 4; offset += 1) {
    const seatIndex = ((starterSeat + offset) % 4) as SeatIndex
    const candidate = state.participants.find(
      (participant) => participant.seatIndex === seatIndex,
    )
    if (
      candidate !== undefined &&
      canTeamAffordLegalBid(state, card, candidate.teamId)
    ) {
      return candidate.teamId
    }
  }

  return null
}

function applySoldPlayer(
  state: AuctionState,
  result: Extract<AuctionCardResult, { outcome: 'SOLD' }>,
): readonly AuctionTeamState[] {
  return state.teams.map((team) => {
    if (team.teamId !== result.buyerTeamId) {
      return team
    }

    const balance = team.balance - result.price
    if (balance < 0) {
      throw new Error('Auction invariant violated: team balance became negative')
    }

    return {
      ...team,
      balance,
      purchasedPlayerCount: team.purchasedPlayerCount + 1,
      purchasedPlayers: [
        ...team.purchasedPlayers,
        { player: result.player, pricePaid: result.price, round: state.round },
      ],
    }
  })
}

/** Domain-separated seed keeps the Round 2 stream deterministic and independent. */
const ROUND_2_SEED_DOMAIN = 0x52a2d201

export function reshuffleRound2Pool(
  unsoldPlayers: readonly Player[],
  seed: number,
): Player[] {
  if (!Number.isInteger(seed)) {
    throw new Error('Random seed must be an integer')
  }
  return createRandomSource((seed ^ ROUND_2_SEED_DOMAIN) | 0).shuffle(
    unsoldPlayers,
  )
}

function completeOrStartRound2(state: AuctionState): AuctionState {
  if (state.round === 1 && state.unsoldPlayers.length > 0) {
    const round2Queue = reshuffleRound2Pool(state.unsoldPlayers, state.seed)
    return startNextAvailableCard({
      ...state,
      phase: 'ROUND_2',
      round: 2,
      playerIndex: 0,
      totalPlayers: round2Queue.length,
      privateAuctionQueue: round2Queue,
      currentCard: null,
      turnTimer: null,
    })
  }

  return {
    ...state,
    phase: 'COMPLETE',
    status: 'COMPLETE',
    currentCard: null,
    turnTimer: null,
  }
}

function startNextAvailableCard(state: AuctionState): AuctionState {
  let next = state

  while (next.playerIndex < next.totalPlayers) {
    const card = makeCard(next)
    const activeTeamId = findFirstActiveTeam(next, card)
    if (activeTeamId !== null) {
      return {
        ...next,
        currentCard: { ...card, activeTeamId },
        turnTimer: makeTurnTimer(activeTeamId),
      }
    }

    next = {
      ...next,
      playerIndex: next.playerIndex + 1,
      unsoldPlayers:
        next.round === 1
          ? [...next.unsoldPlayers, card.player]
          : next.unsoldPlayers,
      rejectedPlayers:
        next.round === 2
          ? [...next.rejectedPlayers, card.player]
          : next.rejectedPlayers,
      results: [
        ...next.results,
        {
          outcome: 'UNSOLD',
          player: card.player,
          cardNumber: card.cardNumber,
        },
      ],
    }
  }

  return completeOrStartRound2(next)
}

function resolveAndAdvance(
  state: AuctionState,
  card: AuctionCardState,
): AuctionState {
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
  const baseState: AuctionState = {
    ...state,
    playerIndex: nextPlayerIndex,
    teams: result.outcome === 'SOLD' ? applySoldPlayer(state, result) : state.teams,
    unsoldPlayers:
      result.outcome === 'UNSOLD' && state.round === 1
        ? [...state.unsoldPlayers, card.player]
        : state.unsoldPlayers,
    rejectedPlayers:
      result.outcome === 'UNSOLD' && state.round === 2
        ? [...state.rejectedPlayers, card.player]
        : state.rejectedPlayers,
    results: [...state.results, result],
    currentCard: null,
    turnTimer: null,
  }

  if (nextPlayerIndex === state.totalPlayers) {
    return completeOrStartRound2(baseState)
  }

  return startNextAvailableCard(baseState)
}

function advanceOrResolve(
  state: AuctionState,
  card: AuctionCardState,
  afterTeamId: TeamId,
): AuctionState {
  const nextTeamId = findNextActiveTeam(state, card, afterTeamId)
  if (nextTeamId === null) {
    return resolveAndAdvance(state, card)
  }

  return {
    ...state,
    currentCard: { ...card, activeTeamId: nextTeamId },
    turnTimer: makeTurnTimer(nextTeamId),
  }
}

function requireActiveCard(
  state: AuctionState,
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
  state: AuctionState,
  teamId: TeamId,
  amount: Money,
): AuctionState {
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
  state: AuctionState,
  teamId: TeamId,
): AuctionState {
  const card = requireActiveCard(state, teamId)
  const updatedCard: AuctionCardState = {
    ...card,
    passedThisCycleTeamIds: [...card.passedThisCycleTeamIds, teamId],
    lastActionByTeamId: { ...card.lastActionByTeamId, [teamId]: 'PASS' },
  }

  return advanceOrResolve(state, updatedCard, teamId)
}

export function markNotInterested(
  state: AuctionState,
  teamId: TeamId,
): AuctionState {
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

/**
 * Advances only the active turn's logical countdown. Reaching zero performs
 * exactly one PASS through the normal auction state machine. Any elapsed time
 * beyond that boundary is intentionally not applied to the next participant.
 */
export function advanceTurnTimer(
  state: AuctionState,
  elapsedSeconds = 1,
): AuctionState {
  if (!Number.isInteger(elapsedSeconds) || elapsedSeconds < 0) {
    throw new AuctionRuleError('INVALID_TIMER_ELAPSE')
  }
  if (state.status !== 'IN_PROGRESS' || state.currentCard === null) {
    throw new AuctionRuleError('AUCTION_NOT_ACTIVE')
  }
  if (
    state.turnTimer === null ||
    state.turnTimer.teamId !== state.currentCard.activeTeamId
  ) {
    throw new AuctionRuleError('INVALID_TIMER_STATE')
  }
  if (elapsedSeconds === 0) {
    return state
  }

  const remainingSeconds = state.turnTimer.remainingSeconds - elapsedSeconds
  if (remainingSeconds <= 0) {
    return passTurn(state, state.currentCard.activeTeamId)
  }

  return {
    ...state,
    turnTimer: { ...state.turnTimer, remainingSeconds },
  }
}

export function getCurrentPlayerId(
  state: PublicRound1AuctionState,
): PlayerId | null {
  return state.currentCard?.player.id ?? null
}
