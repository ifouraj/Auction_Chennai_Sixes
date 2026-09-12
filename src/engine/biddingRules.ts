import type { AuctionCardState, AuctionState } from './auctionEngine'
import type { Money, TeamId } from '../domain/types'
import {
  MINIMUM_LEGAL_MONEY_UNIT,
  TARGET_NORMAL_SQUAD_SIZE,
} from '../domain/constants'

export type BidValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly reason:
        | 'AUCTION_NOT_ACTIVE'
        | 'NOT_ACTIVE_TEAM'
        | 'TEAM_NOT_INTERESTED'
        | 'HIGHEST_BIDDER_CANNOT_RAISE_SELF'
        | 'BID_MUST_BE_INTEGER'
        | 'BID_BELOW_BASE_PRICE'
        | 'BID_BELOW_MINIMUM_MONEY_UNIT'
        | 'BID_MUST_EXCEED_CURRENT'
        | 'BID_EXCEEDS_BALANCE'
        | 'BID_MUST_LEAVE_NON_ZERO_BALANCE'
    }

function validateCardBid(
  card: AuctionCardState,
  teamId: TeamId,
  amount: Money,
): BidValidationResult {
  if (card.activeTeamId !== teamId) {
    return { ok: false, reason: 'NOT_ACTIVE_TEAM' }
  }

  if (card.notInterestedTeamIds.includes(teamId)) {
    return { ok: false, reason: 'TEAM_NOT_INTERESTED' }
  }

  if (card.highestBidderId === teamId) {
    return { ok: false, reason: 'HIGHEST_BIDDER_CANNOT_RAISE_SELF' }
  }

  if (!Number.isSafeInteger(amount)) {
    return { ok: false, reason: 'BID_MUST_BE_INTEGER' }
  }

  if (
    card.highestBid === null &&
    card.basePrice !== null &&
    amount < card.basePrice
  ) {
    return { ok: false, reason: 'BID_BELOW_BASE_PRICE' }
  }

  if (
    card.highestBid === null &&
    card.basePrice === null &&
    amount < MINIMUM_LEGAL_MONEY_UNIT
  ) {
    return { ok: false, reason: 'BID_BELOW_MINIMUM_MONEY_UNIT' }
  }

  if (card.highestBid !== null && amount <= card.highestBid) {
    return { ok: false, reason: 'BID_MUST_EXCEED_CURRENT' }
  }

  return { ok: true }
}

export function validateBid(
  state: AuctionState,
  teamId: TeamId,
  amount: Money,
): BidValidationResult {
  if (state.status !== 'IN_PROGRESS' || state.currentCard === null) {
    return { ok: false, reason: 'AUCTION_NOT_ACTIVE' }
  }

  const cardValidation = validateCardBid(state.currentCard, teamId, amount)
  if (!cardValidation.ok) {
    return cardValidation
  }

  const team = state.teams.find((candidate) => candidate.teamId === teamId)
  if (team === undefined) {
    return { ok: false, reason: 'NOT_ACTIVE_TEAM' }
  }

  if (amount > team.balance) {
    return { ok: false, reason: 'BID_EXCEEDS_BALANCE' }
  }

  if (
    team.purchasedPlayerCount < TARGET_NORMAL_SQUAD_SIZE - 1 &&
    amount === team.balance
  ) {
    return { ok: false, reason: 'BID_MUST_LEAVE_NON_ZERO_BALANCE' }
  }

  return { ok: true }
}
