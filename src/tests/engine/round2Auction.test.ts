import { describe, expect, it } from 'vitest'

import { MINIMUM_LEGAL_MONEY_UNIT } from '../../domain/constants'
import type { AuctionParticipant, Player } from '../../domain/types'
import {
  advanceTurnTimer,
  getPublicAuctionState,
  markNotInterested,
  passTurn,
  placeBid,
  reshuffleRound2Pool,
  startRound1Auction,
  type AuctionState,
} from '../../engine/auctionEngine'
import { validateBid } from '../../engine/biddingRules'
import { createM2PlayerPool } from '../../engine/playerPool'

const participants: readonly AuctionParticipant[] = [
  { id: 'participant-a', teamId: 'team-a', seatIndex: 0, kind: 'HUMAN_LOCAL' },
  { id: 'participant-b', teamId: 'team-b', seatIndex: 1, kind: 'AI' },
  { id: 'participant-c', teamId: 'team-c', seatIndex: 2, kind: 'AI' },
  { id: 'participant-d', teamId: 'team-d', seatIndex: 3, kind: 'AI' },
]

function resolveWithoutBid(state: AuctionState): AuctionState {
  const round = state.round
  const { cardNumber } = state.currentCard!
  let next = state
  while (
    next.currentCard !== null &&
    next.round === round &&
    next.currentCard.cardNumber === cardNumber
  ) {
    next = passTurn(next, next.currentCard.activeTeamId)
  }
  return next
}

function resolveWithOpeningBid(state: AuctionState): AuctionState {
  const round = state.round
  const cardNumber = state.currentCard!.cardNumber
  const amount = state.currentCard!.basePrice ?? MINIMUM_LEGAL_MONEY_UNIT
  let next = placeBid(state, state.currentCard!.activeTeamId, amount)
  while (
    next.currentCard !== null &&
    next.round === round &&
    next.currentCard.cardNumber === cardNumber
  ) {
    next = passTurn(next, next.currentCard.activeTeamId)
  }
  return next
}

function reachRound2(unsoldCount = 3, seed = 445566): AuctionState {
  let state = startRound1Auction(createM2PlayerPool(seed), participants, {
    startingPurse: 1_000_000,
  })
  let handled = 0
  while (state.round === 1) {
    state =
      handled < unsoldCount
        ? resolveWithoutBid(state)
        : resolveWithOpeningBid(state)
    handled += 1
  }
  return state
}

function ids(players: readonly Player[]): string[] {
  return players.map(({ id }) => id)
}

describe('M6 Round 2 unsold auction', () => {
  it('skips Round 2 and completes when Round 1 has no unsold players', () => {
    let state = startRound1Auction(createM2PlayerPool(91), participants, {
      startingPurse: 1_000_000,
    })
    while (state.status === 'IN_PROGRESS') state = resolveWithOpeningBid(state)

    expect(state).toMatchObject({ phase: 'COMPLETE', round: 1, status: 'COMPLETE' })
    expect(state.unsoldPlayers).toEqual([])
  })

  it('transitions to Round 2 containing exactly the Round 1 unsold players', () => {
    const state = reachRound2(4)

    expect(state).toMatchObject({ phase: 'ROUND_2', round: 2, status: 'IN_PROGRESS' })
    expect(new Set(ids(state.privateAuctionQueue))).toEqual(
      new Set(ids(state.unsoldPlayers)),
    )
    expect(state.privateAuctionQueue).toHaveLength(4)
  })

  it('reshuffles deterministically without mutating its source collection', () => {
    const source = createM2PlayerPool(12).auctionQueue.slice(0, 10)
    const snapshot = [...source]
    const first = reshuffleRound2Pool(source, 12345)
    const second = reshuffleRound2Pool(source, 12345)

    expect(ids(first)).toEqual(ids(second))
    expect(first).not.toBe(source)
    expect(ids(source)).toEqual(ids(snapshot))
    expect(ids(first)).not.toEqual(ids(source))
  })

  it('does not expose the future Round 2 order through public state', () => {
    const publicState = getPublicAuctionState(reachRound2(4))

    expect(publicState).not.toHaveProperty('privateAuctionQueue')
    expect(publicState).not.toHaveProperty('auctionQueue')
    expect(publicState).not.toHaveProperty('seed')
  })

  it('removes the base-price floor and accepts the minimum legal opening bid', () => {
    const state = reachRound2(2)
    const teamId = state.currentCard!.activeTeamId

    expect(state.currentCard!.basePrice).toBeNull()
    expect(validateBid(state, teamId, 0)).toEqual({
      ok: false,
      reason: 'BID_BELOW_MINIMUM_MONEY_UNIT',
    })
    expect(validateBid(state, teamId, MINIMUM_LEGAL_MONEY_UNIT)).toEqual({ ok: true })
    expect(placeBid(state, teamId, MINIMUM_LEGAL_MONEY_UNIT).currentCard).toMatchObject({
      highestBid: MINIMUM_LEGAL_MONEY_UNIT,
      highestBidderId: teamId,
    })
  })

  it('still requires later bids to strictly exceed the current bid', () => {
    const initial = reachRound2(2)
    const state = placeBid(
      initial,
      initial.currentCard!.activeTeamId,
      MINIMUM_LEGAL_MONEY_UNIT,
    )
    const challenger = state.currentCard!.activeTeamId

    expect(validateBid(state, challenger, MINIMUM_LEGAL_MONEY_UNIT)).toEqual({
      ok: false,
      reason: 'BID_MUST_EXCEED_CURRENT',
    })
    expect(validateBid(state, challenger, MINIMUM_LEGAL_MONEY_UNIT * 2)).toEqual({ ok: true })
  })

  it('keeps M5 bank rules and financial skipping in force', () => {
    const initial = reachRound2(2)
    const active = initial.currentCard!.activeTeamId
    const state: AuctionState = {
      ...initial,
      teams: initial.teams.map((team) =>
        team.teamId === active
          ? { ...team, balance: MINIMUM_LEGAL_MONEY_UNIT, purchasedPlayerCount: 0 }
          : team,
      ),
    }

    expect(validateBid(state, active, MINIMUM_LEGAL_MONEY_UNIT)).toEqual({
      ok: false,
      reason: 'BID_MUST_LEAVE_NON_ZERO_BALANCE',
    })
    const next = passTurn(state, active)
    expect(next.currentCard!.activeTeamId).not.toBe(active)
  })

  it('keeps PASS temporary while NOT_INTERESTED is permanent for the card', () => {
    let state = reachRound2(2)
    const passer = state.currentCard!.activeTeamId
    state = passTurn(state, passer)
    const bidder = state.currentCard!.activeTeamId
    state = placeBid(state, bidder, MINIMUM_LEGAL_MONEY_UNIT)
    expect(state.currentCard!.passedThisCycleTeamIds).toEqual([])

    const exitingTeam = state.currentCard!.activeTeamId
    state = markNotInterested(state, exitingTeam)
    expect(state.currentCard!.notInterestedTeamIds).toContain(exitingTeam)
    while (state.currentCard?.highestBid === MINIMUM_LEGAL_MONEY_UNIT) {
      expect(state.currentCard.activeTeamId).not.toBe(exitingTeam)
      state = passTurn(state, state.currentCard.activeTeamId)
    }
  })

  it('treats timeout as PASS and excludes the highest bidder', () => {
    const initial = reachRound2(2)
    const bidder = initial.currentCard!.activeTeamId
    let state = placeBid(initial, bidder, MINIMUM_LEGAL_MONEY_UNIT)

    expect(state.currentCard!.activeTeamId).not.toBe(bidder)
    const timedOut = state.currentCard!.activeTeamId
    state = advanceTurnTimer(state, 10)
    expect(state.currentCard).toMatchObject({
      passedThisCycleTeamIds: [timedOut],
      highestBidderId: bidder,
    })
    expect(state.currentCard!.activeTeamId).not.toBe(bidder)
  })

  it('records a Round 2 sale in the buyer squad and deducts its exact bargain price', () => {
    const initial = reachRound2(2)
    const player = initial.currentCard!.player
    const buyerId = initial.currentCard!.activeTeamId
    const before = initial.teams.find(({ teamId }) => teamId === buyerId)!
    const state = resolveWithOpeningBid(initial)
    const buyer = state.teams.find(({ teamId }) => teamId === buyerId)!

    expect(buyer.balance).toBe(before.balance - MINIMUM_LEGAL_MONEY_UNIT)
    expect(buyer.purchasedPlayers.at(-1)).toEqual({
      player,
      pricePaid: MINIMUM_LEGAL_MONEY_UNIT,
      round: 2,
    })
  })

  it('permanently rejects a twice-unsold player and never creates Round 3', () => {
    const initial = reachRound2(1)
    const rejected = initial.currentCard!.player
    const state = resolveWithoutBid(initial)

    expect(state).toMatchObject({ phase: 'COMPLETE', round: 2, status: 'COMPLETE' })
    expect(state.rejectedPlayers).toEqual([rejected])
    expect(state.currentCard).toBeNull()
  })

  it('completes after the final Round 2 card and preserves previous state', () => {
    const initial = reachRound2(1)
    const snapshot = structuredClone(initial)
    const state = resolveWithOpeningBid(initial)

    expect(initial).toEqual(snapshot)
    expect(state).toMatchObject({ phase: 'COMPLETE', round: 2, status: 'COMPLETE' })
    expect(state.currentCard).toBeNull()
    expect(state.turnTimer).toBeNull()
  })
})
