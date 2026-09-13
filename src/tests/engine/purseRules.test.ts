import { describe, expect, it } from 'vitest'

import type { AuctionParticipant, Money, TeamId } from '../../domain/types'
import {
  AuctionRuleError,
  canTeamMakeLegalBid,
  getPublicAuctionState,
  passTurn,
  placeBid,
  startRound1Auction,
  type AuctionTeamState,
  type Round1AuctionState,
} from '../../engine/auctionEngine'
import { validateBid } from '../../engine/biddingRules'
import { createM2PlayerPool } from '../../engine/playerPool'

const participants: readonly AuctionParticipant[] = [
  { id: 'participant-a', teamId: 'team-a', seatIndex: 0, kind: 'HUMAN_LOCAL' },
  { id: 'participant-b', teamId: 'team-b', seatIndex: 1, kind: 'AI' },
  { id: 'participant-c', teamId: 'team-c', seatIndex: 2, kind: 'AI' },
  { id: 'participant-d', teamId: 'team-d', seatIndex: 3, kind: 'AI' },
]

function createAuction(startingPurse = 300): Round1AuctionState {
  return startRound1Auction(createM2PlayerPool(8675309), participants, {
    startingPurse,
  })
}

function withTeamState(
  state: Round1AuctionState,
  teamId: TeamId,
  balance: Money,
  purchasedPlayerCount: number,
): Round1AuctionState {
  const players = state.selectedPool
    .filter(({ id }) => id !== state.currentCard?.player.id)
    .slice(0, purchasedPlayerCount)
  const replacement: AuctionTeamState = {
    teamId,
    balance,
    purchasedPlayerCount,
    purchasedPlayers: players.map((player) => ({
      player,
      pricePaid: 1,
      round: 1,
    })),
    emergencyPlayers: [],
  }

  return {
    ...state,
    teams: state.teams.map((team) =>
      team.teamId === teamId ? replacement : team,
    ),
  }
}

function passUntilCurrentCardResolves(
  state: Round1AuctionState,
): Round1AuctionState {
  const cardNumber = state.currentCard!.cardNumber
  let next = state
  while (next.currentCard?.cardNumber === cardNumber) {
    next = passTurn(next, next.currentCard.activeTeamId)
  }
  return next
}

function expectAuctionError(operation: () => unknown, code: string): void {
  expect(operation).toThrowError(AuctionRuleError)
  try {
    operation()
  } catch (error) {
    expect((error as AuctionRuleError).code).toBe(code)
  }
}

describe('M5 purse and bank rules', () => {
  it('starts all four teams with the same configured integer purse', () => {
    const state = createAuction(417)

    expect(state.startingPurse).toBe(417)
    expect(state.teams.map(({ balance }) => balance)).toEqual([
      417, 417, 417, 417,
    ])
    expect(state.teams.every(({ purchasedPlayerCount }) => purchasedPlayerCount === 0)).toBe(true)
  })

  it('rejects fractional starting purses and bids', () => {
    expect(() => createAuction(300.5)).toThrow(
      'Starting purse must be a non-negative integer money unit',
    )

    const state = createAuction()
    const fractionalBid = state.currentCard!.player.basePrice + 0.5
    expect(validateBid(state, 'team-a', fractionalBid)).toEqual({
      ok: false,
      reason: 'BID_MUST_BE_INTEGER',
    })
  })

  it('exposes balances and purchased-player counts/lists publicly', () => {
    const publicState = getPublicAuctionState(createAuction(417))

    expect(publicState.teams).toHaveLength(4)
    expect(publicState.teams[0]).toMatchObject({
      teamId: 'team-a',
      balance: 417,
      purchasedPlayerCount: 0,
      purchasedPlayers: [],
    })
  })

  it('does not reduce balance when a valid bid is merely placed', () => {
    const state = createAuction()
    const price = state.currentCard!.player.basePrice
    const next = placeBid(state, 'team-a', price)

    expect(next.results).toHaveLength(0)
    expect(next.teams[0].balance).toBe(300)
    expect(next.teams[0].purchasedPlayers).toEqual([])
  })

  it('deducts exactly the SOLD price and adds the player exactly once', () => {
    const initial = createAuction()
    const player = initial.currentCard!.player
    const price = player.basePrice + 20
    let state = placeBid(initial, 'team-a', price)
    state = passUntilCurrentCardResolves(state)

    const buyer = state.teams.find(({ teamId }) => teamId === 'team-a')!
    expect(buyer.balance).toBe(300 - price)
    expect(buyer.purchasedPlayerCount).toBe(1)
    expect(buyer.purchasedPlayers).toEqual([{ player, pricePaid: price, round: 1 }])
  })

  it.each([0, 1, 2, 3, 4])(
    'rejects an all-in bid while the team owns %i players',
    (purchasedPlayerCount) => {
      const initial = createAuction()
      const price = initial.currentCard!.player.basePrice
      const state = withTeamState(initial, 'team-a', price, purchasedPlayerCount)

      expect(validateBid(state, 'team-a', price)).toEqual({
        ok: false,
        reason: 'BID_MUST_LEAVE_NON_ZERO_BALANCE',
      })
    },
  )

  it('allows a team with exactly five players to buy all-in to zero', () => {
    const initial = createAuction()
    const price = initial.currentCard!.player.basePrice
    let state = withTeamState(initial, 'team-a', price, 5)
    state = placeBid(state, 'team-a', price)
    state = passUntilCurrentCardResolves(state)

    const buyer = state.teams.find(({ teamId }) => teamId === 'team-a')!
    expect(buyer.balance).toBe(0)
    expect(buyer.purchasedPlayerCount).toBe(6)
  })

  it('allows a team with six players to spend all-in and buy a seventh', () => {
    const initial = createAuction()
    const price = initial.currentCard!.player.basePrice
    let state = withTeamState(initial, 'team-a', price, 6)
    state = placeBid(state, 'team-a', price)
    state = passUntilCurrentCardResolves(state)

    const buyer = state.teams.find(({ teamId }) => teamId === 'team-a')!
    expect(buyer.balance).toBe(0)
    expect(buyer.purchasedPlayerCount).toBe(7)
    expect(buyer.purchasedPlayers).toHaveLength(7)
  })

  it('rejects a bid above balance without mutation or a negative balance', () => {
    const initial = createAuction()
    const balance = initial.currentCard!.player.basePrice
    const state = withTeamState(initial, 'team-a', balance, 5)
    const snapshot = structuredClone(state)

    expect(validateBid(state, 'team-a', balance + 1)).toEqual({
      ok: false,
      reason: 'BID_EXCEEDS_BALANCE',
    })
    expectAuctionError(
      () => placeBid(state, 'team-a', balance + 1),
      'BID_EXCEEDS_BALANCE',
    )
    expect(state).toEqual(snapshot)
    expect(state.teams.every(({ balance }) => balance >= 0)).toBe(true)
  })

  it('automatically skips a financially incapable participant', () => {
    const initial = createAuction()
    const price = initial.currentCard!.player.basePrice
    const state = withTeamState(initial, 'team-b', price + 1, 0)

    expect(canTeamMakeLegalBid(state, 'team-b')).toBe(true)
    const next = placeBid(state, 'team-a', price)

    expect(canTeamMakeLegalBid(next, 'team-b')).toBe(false)
    expect(next.currentCard!.activeTeamId).toBe('team-c')
  })

  it('continues to skip the highest bidder independently of finances', () => {
    const initial = createAuction()
    const price = initial.currentCard!.player.basePrice
    let state = placeBid(initial, 'team-a', price)
    state = passTurn(state, 'team-b')
    state = passTurn(state, 'team-c')
    state = placeBid(state, 'team-d', price + 10)

    expect(state.currentCard).toMatchObject({
      highestBidderId: 'team-d',
      activeTeamId: 'team-a',
    })
  })

  it('resolves SOLD when financial skipping leaves no challenger', () => {
    const initial = createAuction()
    const player = initial.currentCard!.player
    const price = player.basePrice
    let state = initial
    for (const teamId of ['team-b', 'team-c', 'team-d']) {
      state = withTeamState(state, teamId, price + 1, 0)
    }

    const next = placeBid(state, 'team-a', price)

    expect(next.results[0]).toEqual({
      outcome: 'SOLD',
      player,
      buyerTeamId: 'team-a',
      price,
      cardNumber: 1,
    })
  })

  it('assigns the timer only to the next genuinely eligible challenger', () => {
    const initial = createAuction()
    const price = initial.currentCard!.player.basePrice
    const state = withTeamState(initial, 'team-b', price + 1, 0)
    const next = placeBid(state, 'team-a', price)

    expect(next.currentCard!.activeTeamId).toBe('team-c')
    expect(next.turnTimer).toEqual({ teamId: 'team-c', remainingSeconds: 10 })
  })

  it('keeps every previous nested team/squad state immutable through SOLD', () => {
    const initial = createAuction()
    const snapshot = structuredClone(initial)
    const price = initial.currentCard!.player.basePrice
    let bidding = placeBid(initial, 'team-a', price)
    const biddingSnapshot = structuredClone(bidding)
    bidding = passUntilCurrentCardResolves(bidding)

    expect(initial).toEqual(snapshot)
    expect(biddingSnapshot.teams[0]).toEqual(snapshot.teams[0])
    expect(bidding.teams[0]).not.toBe(initial.teams[0])
    expect(bidding.teams[0].purchasedPlayers).not.toBe(initial.teams[0].purchasedPlayers)
  })
})
