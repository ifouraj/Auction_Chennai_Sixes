import type { ParticipantKind, Player, TeamId } from '../domain/types'
import type { PublicAuctionState } from '../engine/auctionEngine'
import { auctionFlavorLine, classifyAuctionSale } from './auctionFlavor'
import { MINIMUM_LEGAL_MONEY_UNIT } from '../domain/constants'
import { formatMoney } from './money'

export type AuctionAnnouncementTone =
  | 'reveal'
  | 'turn'
  | 'bid'
  | 'pass'
  | 'out'
  | 'sold'
  | 'unsold'
  | 'transition'
  | 'complete'

interface TurnContext {
  readonly teamId: TeamId
  readonly participantKind: ParticipantKind
  readonly currentBid: number | null
}

export type AuctionPresentationEvent =
  | { readonly type: 'PLAYER_REVEAL'; readonly player: Player; readonly round: 1 | 2; readonly turn: TurnContext }
  | { readonly type: 'TURN'; readonly turn: TurnContext }
  | { readonly type: 'BID'; readonly teamId: TeamId; readonly amount: number; readonly previousBid: number | null; readonly turn: TurnContext }
  | { readonly type: 'PASS'; readonly teamId: TeamId; readonly timedOut: boolean; readonly turn: TurnContext | null }
  | { readonly type: 'NOT_INTERESTED'; readonly teamId: TeamId; readonly turn: TurnContext | null }
  | { readonly type: 'SOLD'; readonly player: Player; readonly buyerTeamId: TeamId; readonly price: number; readonly round: 1 | 2; readonly basePrice: number | null; readonly buyerBalanceAfter: number; readonly buyerPlayerCountAfter: number; readonly distinctBidderCount: number }
  | { readonly type: 'UNSOLD'; readonly player: Player; readonly round: 1 | 2 }
  | { readonly type: 'NEXT_PLAYER'; readonly player: Player; readonly round: 1 | 2; readonly turn: TurnContext }
  | { readonly type: 'ROUND_2'; readonly player: Player; readonly turn: TurnContext }
  | { readonly type: 'AUCTION_COMPLETE' }

export interface AuctionAnnouncement {
  readonly primary: string
  readonly secondary: string | null
  readonly tone: AuctionAnnouncementTone
  readonly emphasizedTeamId: TeamId | null
}

export type TeamNameFormatter = (teamId: TeamId) => string

export function getTurnContext(state: PublicAuctionState): TurnContext | null {
  const card = state.currentCard
  if (card === null) return null
  const participant = state.participants.find(({ teamId }) => teamId === card.activeTeamId)
  if (participant === undefined) return null
  return {
    teamId: card.activeTeamId,
    participantKind: participant.kind,
    currentBid: card.highestBid,
  }
}

function nextTurnLine(turn: TurnContext | null, name: TeamNameFormatter): string | null {
  if (turn === null) return null
  if (turn.participantKind === 'HUMAN_LOCAL') {
    return turn.currentBid === null
      ? 'Your turn — bid, pass or leave the auction'
      : `Your turn — current bid ${formatMoney(turn.currentBid)}`
  }
  return `${name(turn.teamId)} AI is deciding…`
}

export function announceAuctionEvent(
  event: AuctionPresentationEvent,
  name: TeamNameFormatter,
): AuctionAnnouncement {
  switch (event.type) {
    case 'PLAYER_REVEAL':
      return {
        primary: `NEXT PLAYER — ${event.player.name.toUpperCase()}`,
        secondary: `${event.round === 1 ? `Base price ${formatMoney(event.player.basePrice)}` : `Round 2 opening ${formatMoney(MINIMUM_LEGAL_MONEY_UNIT)}`} · ${nextTurnLine(event.turn, name)}`,
        tone: 'reveal', emphasizedTeamId: event.turn.teamId,
      }
    case 'TURN':
      return event.turn.participantKind === 'HUMAN_LOCAL'
        ? { primary: 'YOUR TURN', secondary: event.turn.currentBid === null ? 'Bid, pass or leave the auction' : `Current bid ${formatMoney(event.turn.currentBid)} — bid, pass or leave the auction`, tone: 'turn', emphasizedTeamId: event.turn.teamId }
        : { primary: `${name(event.turn.teamId).toUpperCase()}'S TURN`, secondary: 'AI is deciding…', tone: 'turn', emphasizedTeamId: event.turn.teamId }
    case 'BID': {
      const jump = event.previousBid !== null && event.amount - event.previousBid >= 30
      return { primary: `${name(event.teamId).toUpperCase()} ${jump ? 'JUMPS TO' : 'BIDS'} ${formatMoney(event.amount)}`, secondary: `${name(event.teamId)} now leads · ${nextTurnLine(event.turn, name)}`, tone: 'bid', emphasizedTeamId: event.teamId }
    }
    case 'PASS':
      return { primary: `${name(event.teamId).toUpperCase()} ${event.timedOut ? 'TIMES OUT' : 'PASSES'}`, secondary: `They can return if bidding continues${event.turn ? ` · ${nextTurnLine(event.turn, name)}` : ''}`, tone: 'pass', emphasizedTeamId: event.teamId }
    case 'NOT_INTERESTED':
      return { primary: `${name(event.teamId).toUpperCase()} IS OUT`, secondary: `Not interested in this player${event.turn ? ` · ${nextTurnLine(event.turn, name)}` : ''}`, tone: 'out', emphasizedTeamId: event.teamId }
    case 'SOLD': {
      const flavor = classifyAuctionSale({
        player: event.player, price: event.price, round: event.round,
        buyerBalanceAfter: event.buyerBalanceAfter,
        buyerPlayerCountAfter: event.buyerPlayerCountAfter,
        distinctBidderCount: event.distinctBidderCount,
      })
      const flavorLine = auctionFlavorLine(flavor)
      return { primary: 'SOLD!', secondary: `${event.player.name} → ${name(event.buyerTeamId)} for ${formatMoney(event.price)}${flavorLine ? ` · ${flavorLine}` : ''}`, tone: 'sold', emphasizedTeamId: event.buyerTeamId }
    }
    case 'UNSOLD':
      return { primary: 'UNSOLD', secondary: `${event.player.name} — nobody made a valid bid${event.round === 1 ? ' · Returns in Round 2' : ''}`, tone: 'unsold', emphasizedTeamId: null }
    case 'NEXT_PLAYER':
      return { primary: 'NEXT PLAYER', secondary: `${event.player.name} enters the auction — ${event.round === 1 ? `base ${formatMoney(event.player.basePrice)}` : `opening ${formatMoney(MINIMUM_LEGAL_MONEY_UNIT)}`} · ${nextTurnLine(event.turn, name)}`, tone: 'transition', emphasizedTeamId: event.turn.teamId }
    case 'ROUND_2':
      return { primary: 'ROUND 2', secondary: `Unsold players return. Opening bid ${formatMoney(MINIMUM_LEGAL_MONEY_UNIT)}. · ${event.player.name} is first back`, tone: 'transition', emphasizedTeamId: event.turn.teamId }
    case 'AUCTION_COMPLETE':
      return { primary: 'AUCTION COMPLETE', secondary: 'The squads are locked.', tone: 'complete', emphasizedTeamId: null }
  }
}

export function eventAfterPublicAction(
  before: PublicAuctionState,
  after: PublicAuctionState,
  action: 'BID' | 'PASS' | 'NOT_INTERESTED',
  teamId: TeamId,
  timedOut = false,
): AuctionPresentationEvent {
  const oldCard = before.currentCard
  if (oldCard === null) throw new Error('Cannot narrate an action without a public card')
  const newResult = after.results.length > before.results.length ? after.results.at(-1) : null
  if (newResult?.outcome === 'SOLD') {
    const buyer = after.teams.find((team) => team.teamId === newResult.buyerTeamId)
    return {
      type: 'SOLD', player: newResult.player, buyerTeamId: newResult.buyerTeamId,
      price: newResult.price, round: before.round, basePrice: oldCard.basePrice,
      buyerBalanceAfter: buyer?.balance ?? 0,
      buyerPlayerCountAfter: buyer?.purchasedPlayerCount ?? 0,
      distinctBidderCount: Object.values(oldCard.lastActionByTeamId).filter((value) => value === 'BID').length + (action === 'BID' && oldCard.lastActionByTeamId[teamId] !== 'BID' ? 1 : 0),
    }
  }
  if (newResult?.outcome === 'UNSOLD') {
    return { type: 'UNSOLD', player: newResult.player, round: before.round }
  }
  const turn = getTurnContext(after)
  if (action === 'BID') return { type: 'BID', teamId, amount: after.currentCard?.highestBid ?? oldCard.highestBid ?? 0, previousBid: oldCard.highestBid, turn: turn! }
  if (action === 'PASS') return { type: 'PASS', teamId, timedOut, turn }
  return { type: 'NOT_INTERESTED', teamId, turn }
}

export function eventAfterResultHold(state: PublicAuctionState): AuctionPresentationEvent {
  if (state.status === 'COMPLETE') return { type: 'AUCTION_COMPLETE' }
  const card = state.currentCard
  const turn = getTurnContext(state)
  if (card === null || turn === null) throw new Error('Active auction requires a public card and turn')
  return state.phase === 'ROUND_2' && card.cardNumber === 1
    ? { type: 'ROUND_2', player: card.player, turn }
    : { type: 'NEXT_PLAYER', player: card.player, round: state.round, turn }
}
