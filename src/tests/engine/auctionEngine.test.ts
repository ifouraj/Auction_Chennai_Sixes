import { describe, expect, it } from 'vitest'

import type { AuctionParticipant } from '../../domain/types'
import {
  AuctionRuleError,
  getPublicAuctionState,
  markNotInterested,
  passTurn,
  placeBid,
  startRound1Auction,
  type Round1AuctionState,
} from '../../engine/auctionEngine'
import { validateBid } from '../../engine/biddingRules'
import { createM2PlayerPool } from '../../engine/playerPool'
import { calculateTeamStrength } from '../../engine/teamStrength'

const participants: readonly AuctionParticipant[] = [
  { id: 'participant-a', teamId: 'team-a', seatIndex: 0, kind: 'HUMAN_LOCAL' },
  { id: 'participant-b', teamId: 'team-b', seatIndex: 1, kind: 'AI' },
  { id: 'participant-c', teamId: 'team-c', seatIndex: 2, kind: 'AI' },
  { id: 'participant-d', teamId: 'team-d', seatIndex: 3, kind: 'AI' },
]

function createAuction(seed = 8675309): Round1AuctionState {
  return startRound1Auction(createM2PlayerPool(seed), participants)
}

function passUntilCardResolves(state: Round1AuctionState): Round1AuctionState {
  const cardNumber = state.currentCard!.cardNumber
  let next = state

  while (next.currentCard?.cardNumber === cardNumber) {
    next = passTurn(next, next.currentCard.activeTeamId)
  }

  return next
}

function expectAuctionError(
  operation: () => unknown,
  code: string,
): void {
  try {
    operation()
    throw new Error('Expected operation to throw')
  } catch (error) {
    expect(error).toBeInstanceOf(AuctionRuleError)
    expect((error as AuctionRuleError).code).toBe(code)
  }
}

describe('Round 1 auction engine', () => {
  it('rotates starting team A, B, C, D across cards and repeats', () => {
    let state = createAuction()
    const starters: string[] = []

    for (let card = 0; card < 5; card += 1) {
      starters.push(state.currentCard!.startedByTeamId)
      state = passUntilCardResolves(state)
    }

    expect(starters).toEqual([
      'team-a',
      'team-b',
      'team-c',
      'team-d',
      'team-a',
    ])
  })

  it('accepts a first bid exactly at base price', () => {
    const state = createAuction()
    const basePrice = state.currentCard!.player.basePrice
    const next = placeBid(state, 'team-a', basePrice)

    expect(next.currentCard).toMatchObject({
      highestBid: basePrice,
      highestBidderId: 'team-a',
      activeTeamId: 'team-b',
    })
  })

  it('rejects a first bid below base price', () => {
    const state = createAuction()
    const basePrice = state.currentCard!.player.basePrice

    expect(validateBid(state, 'team-a', basePrice - 1)).toEqual({
      ok: false,
      reason: 'BID_BELOW_BASE_PRICE',
    })
    expectAuctionError(
      () => placeBid(state, 'team-a', basePrice - 1),
      'BID_BELOW_BASE_PRICE',
    )
  })

  it('requires every later bid to strictly exceed the current bid', () => {
    const initial = createAuction()
    const basePrice = initial.currentCard!.player.basePrice
    const afterOpening = placeBid(initial, 'team-a', basePrice)

    expect(validateBid(afterOpening, 'team-b', basePrice)).toEqual({
      ok: false,
      reason: 'BID_MUST_EXCEED_CURRENT',
    })
    expect(validateBid(afterOpening, 'team-b', basePrice + 1)).toEqual({
      ok: true,
    })
  })

  it('lets a participant act again after PASS when bidding continues', () => {
    const initial = createAuction()
    const basePrice = initial.currentCard!.player.basePrice
    const afterAPass = passTurn(initial, 'team-a')

    expect(afterAPass.currentCard).toMatchObject({
      activeTeamId: 'team-b',
      passedThisCycleTeamIds: ['team-a'],
    })

    const afterBBid = placeBid(afterAPass, 'team-b', basePrice)
    expect(afterBBid.currentCard!.passedThisCycleTeamIds).toEqual([])

    const afterCPass = passTurn(afterBBid, 'team-c')
    const afterDPass = passTurn(afterCPass, 'team-d')
    expect(afterDPass.currentCard!.activeTeamId).toBe('team-a')
    expect(validateBid(afterDPass, 'team-a', basePrice + 1)).toEqual({ ok: true })
  })

  it('permanently excludes NOT_INTERESTED participants for the card', () => {
    let state = markNotInterested(createAuction(), 'team-a')
    const cardNumber = state.currentCard!.cardNumber
    const activeTeams: string[] = [state.currentCard!.activeTeamId]

    while (state.currentCard?.cardNumber === cardNumber) {
      state = passTurn(state, state.currentCard.activeTeamId)
      if (state.currentCard?.cardNumber === cardNumber) {
        activeTeams.push(state.currentCard.activeTeamId)
        expect(state.currentCard.notInterestedTeamIds).toContain('team-a')
      }
    }

    expect(activeTeams).toEqual(['team-b', 'team-c', 'team-d'])
  })

  it('never asks the current highest bidder to bid against itself', () => {
    const initial = createAuction()
    const basePrice = initial.currentCard!.player.basePrice
    let state = placeBid(initial, 'team-a', basePrice)

    expect(state.currentCard!.activeTeamId).toBe('team-b')
    state = passTurn(state, 'team-b')
    expect(state.currentCard!.activeTeamId).toBe('team-c')
    state = passTurn(state, 'team-c')
    expect(state.currentCard!.activeTeamId).toBe('team-d')

    state = placeBid(state, 'team-d', basePrice + 10)
    expect(state.currentCard!.highestBidderId).toBe('team-d')
    expect(state.currentCard!.activeTeamId).toBe('team-a')
  })

  it('resolves UNSOLD when everyone passes or exits before a bid', () => {
    const player = createAuction().currentCard!.player
    let state = createAuction()
    state = passTurn(state, 'team-a')
    state = markNotInterested(state, 'team-b')
    state = passTurn(state, 'team-c')
    state = markNotInterested(state, 'team-d')

    expect(state.results[0]).toEqual({
      outcome: 'UNSOLD',
      player,
      cardNumber: 1,
    })
  })

  it('resolves SOLD when all eligible challengers decline after a bid', () => {
    const initial = createAuction()
    const basePrice = initial.currentCard!.player.basePrice
    let state = placeBid(initial, 'team-a', basePrice)
    state = passTurn(state, 'team-b')
    state = markNotInterested(state, 'team-c')
    state = passTurn(state, 'team-d')

    expect(state.results[0]).toMatchObject({
      outcome: 'SOLD',
      buyerTeamId: 'team-a',
    })
  })

  it('records the sold price as the existing highest bid', () => {
    const initial = createAuction()
    const price = initial.currentCard!.player.basePrice + 37
    let state = placeBid(initial, 'team-a', price)
    state = passTurn(state, 'team-b')
    state = passTurn(state, 'team-c')
    state = passTurn(state, 'team-d')

    expect(state.results[0]).toMatchObject({ outcome: 'SOLD', price })
  })

  it('exposes all five live team-strength values through public auction state', () => {
    const initial = createAuction()
    const player = initial.currentCard!.player
    let state = placeBid(initial, 'team-a', player.basePrice)
    state = passTurn(state, 'team-b')
    state = passTurn(state, 'team-c')
    state = passTurn(state, 'team-d')

    const team = getPublicAuctionState(state).teams.find(
      ({ teamId }) => teamId === 'team-a',
    )!
    expect(team.strength).toEqual(calculateTeamStrength(team.purchasedPlayers))
    expect(team.strength).toEqual({
      batting: Math.round(player.batting / 5),
      bowling: Math.round(player.bowling / 3),
      wicketKeeping: player.wicketKeeping,
      leadership: player.leadership,
      overall: Math.round(
        (player.batting / 5 +
          player.bowling / 3 +
          player.wicketKeeping +
          player.leadership) /
          4,
      ),
    })
  })

  it('stores a Round 1 unsold player for future Round 2 work', () => {
    const initial = createAuction()
    const player = initial.currentCard!.player
    const state = passUntilCardResolves(initial)

    expect(state.unsoldPlayers).toEqual([player])
  })

  it('makes the next private-queue player current immediately after resolution', () => {
    const initial = createAuction()
    const expectedNext = initial.privateAuctionQueue[1]
    const state = passUntilCardResolves(initial)

    expect(state.playerIndex).toBe(1)
    expect(state.currentCard).toMatchObject({
      player: expectedNext,
      cardNumber: 2,
      startedByTeamId: 'team-b',
    })
  })

  it('progresses through all 25 private cards without exposing queue order publicly', () => {
    let state = createAuction(314159)
    const round1Queue = state.privateAuctionQueue
    const revealedIds: string[] = []

    while (state.round === 1) {
      revealedIds.push(state.currentCard!.player.id)
      const publicState = getPublicAuctionState(state)
      expect(publicState).not.toHaveProperty('privateAuctionQueue')
      expect(publicState).not.toHaveProperty('auctionQueue')
      state = passUntilCardResolves(state)
    }

    expect(revealedIds).toEqual(round1Queue.map(({ id }) => id))
    expect(state.round).toBe(2)
    expect(state.phase).toBe('ROUND_2')
  })

  it('does not mutate any previous state when applying an action', () => {
    const state = createAuction()
    const snapshot = structuredClone(state)
    const next = passTurn(state, 'team-a')

    expect(state).toEqual(snapshot)
    expect(next).not.toBe(state)
    expect(next.currentCard).not.toBe(state.currentCard)
    expect(state.currentCard!.passedThisCycleTeamIds).toEqual([])
  })
})
