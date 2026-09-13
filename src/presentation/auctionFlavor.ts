import type { Player } from '../domain/types'

export type AuctionFlavor =
  | 'BARGAIN?'
  | 'BIG SPEND'
  | 'VERY BIG SPEND'
  | 'DESPERATE'
  | 'BIDDING WAR'
  | 'QUICK SALE'

export interface AuctionSaleFlavorInput {
  readonly player: Pick<Player, 'overall' | 'basePrice'>
  readonly price: number
  readonly round: 1 | 2
  readonly buyerBalanceAfter: number
  readonly buyerPlayerCountAfter: number
  readonly distinctBidderCount: number
}

/** Conservative, deterministic presentation labels. They make no value claim. */
export function classifyAuctionSale(
  input: AuctionSaleFlavorInput,
): AuctionFlavor | null {
  const { price, round, player } = input
  if (price >= Math.max(100, player.basePrice * 3)) return 'VERY BIG SPEND'
  if (input.buyerBalanceAfter <= 5 && input.buyerPlayerCountAfter < 6) {
    return 'DESPERATE'
  }
  if (input.distinctBidderCount >= 3) return 'BIDDING WAR'
  if (price >= Math.max(65, player.basePrice * 2)) return 'BIG SPEND'
  if (round === 2 && price <= Math.max(7, Math.floor(player.overall / 12))) {
    return 'BARGAIN?'
  }
  if (input.distinctBidderCount <= 1) return 'QUICK SALE'
  return null
}

export function auctionFlavorLine(flavor: AuctionFlavor | null): string | null {
  switch (flavor) {
    case 'BARGAIN?': return 'A bargain. Probably.'
    case 'BIG SPEND': return 'The purse has noticed.'
    case 'VERY BIG SPEND': return 'Apparently money is no longer a concern.'
    case 'DESPERATE': return 'That leaves very little room for dignity.'
    case 'BIDDING WAR': return 'Nobody wanted to blink.'
    case 'QUICK SALE': return 'One bid. One buyer. Efficient.'
    default: return null
  }
}
