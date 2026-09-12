import type { AuctionCardState, Round1AuctionState } from './auctionEngine'
import type { Money, TeamId } from '../domain/types'

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
        | 'BID_MUST_EXCEED_CURRENT'
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

  if (!Number.isInteger(amount)) {
    return { ok: false, reason: 'BID_MUST_BE_INTEGER' }
  }

  if (card.highestBid === null && amount < card.player.basePrice) {
    return { ok: false, reason: 'BID_BELOW_BASE_PRICE' }
  }

  if (card.highestBid !== null && amount <= card.highestBid) {
    return { ok: false, reason: 'BID_MUST_EXCEED_CURRENT' }
  }

  return { ok: true }
}

export function validateBid(
  state: Round1AuctionState,
  teamId: TeamId,
  amount: Money,
): BidValidationResult {
  if (state.status !== 'IN_PROGRESS' || state.currentCard === null) {
    return { ok: false, reason: 'AUCTION_NOT_ACTIVE' }
  }

  return validateCardBid(state.currentCard, teamId, amount)
}
