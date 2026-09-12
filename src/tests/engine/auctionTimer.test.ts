import { describe, expect, it } from 'vitest'

import { AUCTION_TURN_SECONDS } from '../../domain/constants'
import type { AuctionParticipant } from '../../domain/types'
import {
  advanceTurnTimer,
  markNotInterested,
  passTurn,
  placeBid,
  startRound1Auction,
  type Round1AuctionState,
} from '../../engine/auctionEngine'
import { createM2PlayerPool } from '../../engine/playerPool'

const participants: readonly AuctionParticipant[] = [
  { id: 'participant-a', teamId: 'team-a', seatIndex: 0, kind: 'HUMAN_LOCAL' },
  { id: 'participant-b', teamId: 'team-b', seatIndex: 1, kind: 'AI' },
  { id: 'participant-c', teamId: 'team-c', seatIndex: 2, kind: 'AI' },
  { id: 'participant-d', teamId: 'team-d', seatIndex: 3, kind: 'AI' },
]

function createAuction(): Round1AuctionState {
  return startRound1Auction(createM2PlayerPool(8675309), participants)
}

function expectFreshTimer(state: Round1AuctionState, teamId: string): void {
  expect(state.turnTimer).toEqual({
    teamId,
    remainingSeconds: AUCTION_TURN_SECONDS,
  })
}

describe('auction turn timer', () => {
  it('starts an active participant turn with 10 seconds', () => {
    expectFreshTimer(createAuction(), 'team-a')
  })

  it('decrements deterministically without reading the wall clock', () => {
    const state = createAuction()
    const next = advanceTurnTimer(state, 3)

    expect(next.turnTimer).toEqual({
      teamId: 'team-a',
      remainingSeconds: 7,
    })
  })

  it('reaching zero triggers PASS and never NOT_INTERESTED', () => {
    const state = advanceTurnTimer(createAuction(), AUCTION_TURN_SECONDS)

    expect(state.currentCard).toMatchObject({
      activeTeamId: 'team-b',
      passedThisCycleTeamIds: ['team-a'],
      notInterestedTeamIds: [],
      lastActionByTeamId: { 'team-a': 'PASS' },
    })
    expectFreshTimer(state, 'team-b')
  })

  it('resets to 10 after a valid BID moves the turn', () => {
    const ticking = advanceTurnTimer(createAuction(), 6)
    const next = placeBid(
      ticking,
      'team-a',
      ticking.currentCard!.player.basePrice,
    )

    expectFreshTimer(next, 'team-b')
  })

  it('resets to 10 after PASS moves the turn', () => {
    const ticking = advanceTurnTimer(createAuction(), 6)

    expectFreshTimer(passTurn(ticking, 'team-a'), 'team-b')
  })

  it('resets to 10 after NOT_INTERESTED moves the turn', () => {
    const ticking = advanceTurnTimer(createAuction(), 6)

    expectFreshTimer(markNotInterested(ticking, 'team-a'), 'team-b')
  })

  it('never gives the highest bidder a timer against itself', () => {
    const initial = createAuction()
    const price = initial.currentCard!.player.basePrice
    let state = placeBid(initial, 'team-a', price)
    state = advanceTurnTimer(state, AUCTION_TURN_SECONDS)
    state = advanceTurnTimer(state, AUCTION_TURN_SECONDS)
    state = placeBid(state, 'team-d', price + 1)

    expect(state.currentCard).toMatchObject({
      highestBidderId: 'team-d',
      activeTeamId: 'team-a',
    })
    expectFreshTimer(state, 'team-a')
    expect(state.turnTimer!.teamId).not.toBe(state.currentCard!.highestBidderId)
  })

  it('never gives a NOT_INTERESTED participant another timer for the card', () => {
    let state = markNotInterested(createAuction(), 'team-a')
    const cardNumber = state.currentCard!.cardNumber
    const timedTeams: string[] = [state.turnTimer!.teamId]

    while (state.currentCard?.cardNumber === cardNumber) {
      state = advanceTurnTimer(state, AUCTION_TURN_SECONDS)
      if (state.currentCard?.cardNumber === cardNumber) {
        timedTeams.push(state.turnTimer!.teamId)
      }
    }

    expect(timedTeams).toEqual(['team-b', 'team-c', 'team-d'])
  })

  it('can resolve SOLD when the final challenger times out', () => {
    const initial = createAuction()
    const price = initial.currentCard!.player.basePrice
    let state = placeBid(initial, 'team-a', price)
    state = passTurn(state, 'team-b')
    state = markNotInterested(state, 'team-c')
    state = advanceTurnTimer(state, AUCTION_TURN_SECONDS)

    expect(state.results[0]).toMatchObject({
      outcome: 'SOLD',
      buyerTeamId: 'team-a',
      price,
    })
    expectFreshTimer(state, 'team-b')
  })

  it('can resolve UNSOLD when every participant times out or passes before a bid', () => {
    const player = createAuction().currentCard!.player
    let state = createAuction()
    state = advanceTurnTimer(state, AUCTION_TURN_SECONDS)
    state = passTurn(state, 'team-b')
    state = advanceTurnTimer(state, AUCTION_TURN_SECONDS)
    state = passTurn(state, 'team-d')

    expect(state.results[0]).toEqual({
      outcome: 'UNSOLD',
      player,
      cardNumber: 1,
    })
    expectFreshTimer(state, 'team-b')
  })

  it('does not mutate previous timer or auction state', () => {
    const state = createAuction()
    const snapshot = structuredClone(state)
    const next = advanceTurnTimer(state, 1)

    expect(state).toEqual(snapshot)
    expect(next).not.toBe(state)
    expect(next.turnTimer).not.toBe(state.turnTimer)
    expect(state.turnTimer!.remainingSeconds).toBe(AUCTION_TURN_SECONDS)
  })
})
