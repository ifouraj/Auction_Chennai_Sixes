import { describe, expect, it } from 'vitest'

import { DEFAULT_STARTING_PURSE, MINIMUM_LEGAL_MONEY_UNIT } from '../../domain/constants'
import { FRANCHISES, selectGameFranchises } from '../../domain/franchises'
import { normalPlayerCatalog } from '../../data/playerCatalog'
import { createAuctionHarnessStore, DEFAULT_PARTICIPANTS } from '../../app/auctionStore'
import { formatMoney } from '../../presentation/money'
import { createM2PlayerPool } from '../../engine/playerPool'
import { getMinimumLegalBid, validateBid } from '../../engine/biddingRules'
import { placeBid, startRound1Auction } from '../../engine/auctionEngine'

describe('crore money presentation and ten-lakh bidding', () => {
  it('formats lakh and crore values naturally including the ₹3Cr purse', () => {
    expect(formatMoney(DEFAULT_STARTING_PURSE)).toBe('₹3Cr')
    expect([10, 40, 90, 100, 120, 250].map(formatMoney))
      .toEqual(['₹10L', '₹40L', '₹90L', '₹1Cr', '₹1.2Cr', '₹2.5Cr'])
  })

  it('uses clean base prices and enforces clean legal bid increments', () => {
    expect(MINIMUM_LEGAL_MONEY_UNIT).toBe(10)
    expect(normalPlayerCatalog.every(({ basePrice }) => basePrice % 10 === 0)).toBe(true)
    const state = startRound1Auction(createM2PlayerPool(42), DEFAULT_PARTICIPANTS)
    const base = state.currentCard!.basePrice!
    expect(validateBid(state, 'team-a', base + 1)).toEqual({ ok: false, reason: 'BID_MUST_USE_LEGAL_INCREMENT' })
    const opened = placeBid(state, 'team-a', base)
    expect(getMinimumLegalBid(opened.currentCard!)).toBe(base + 10)
    expect(validateBid(opened, 'team-b', base + 20)).toEqual({ ok: true })
  })
})

describe('selectable franchise identities', () => {
  it('contains the exact ten requested franchises', () => {
    expect(FRANCHISES.map(({ name }) => name)).toEqual([
      'Madras Machis', 'Mumbai Bhidus', 'Kolkata Bondhus', 'Bangalore Gurus',
      'Hyderabad Miyaans', 'Lucknow Janabs', 'Kochi Chettans', 'Dilliwalas',
      'Punjab Gabrus', 'Ahmedabad Bhaibandhs',
    ])
  })

  it('selects three distinct seeded opponents without changing stable seat IDs', () => {
    for (const human of FRANCHISES) {
      const first = selectGameFranchises(human.id, 8675309)
      const replay = selectGameFranchises(human.id, 8675309)
      expect(first).toEqual(replay)
      expect(first['team-a']).toBe(human)
      expect(new Set(Object.values(first).map(({ id }) => id)).size).toBe(4)
      expect(Object.values(first).slice(1)).not.toContain(human)
      expect(Object.keys(first)).toEqual(['team-a', 'team-b', 'team-c', 'team-d'])
    }
  })

  it('starts every selected franchise with identical purse, roster and rules', () => {
    const store = createAuctionHarnessStore(99)
    store.getState().selectFranchise('ahmedabad-bhaibandhs')
    store.getState().createGame(99)
    store.getState().startAuction()
    const auction = store.getState().auction!
    expect(auction.teams.map(({ balance }) => balance)).toEqual([300, 300, 300, 300])
    expect(auction.teams.map(({ purchasedPlayerCount }) => purchasedPlayerCount)).toEqual([0, 0, 0, 0])
    expect(new Set(Object.values(store.getState().teamNames)).size).toBe(4)
  })
})
