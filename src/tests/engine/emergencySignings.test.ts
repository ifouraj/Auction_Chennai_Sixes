import { describe, expect, it } from 'vitest'

import { normalPlayerCatalog } from '../../data/playerCatalog'
import { punishmentPlayerCatalog } from '../../data/punishmentPlayerCatalog'
import { MINIMUM_PUNISHMENT_PLAYER_CATALOG_SIZE } from '../../domain/constants'
import { assertValidPunishmentPlayerCatalog } from '../../domain/playerValidation'
import type { AuctionParticipant } from '../../domain/types'
import {
  getPublicAuctionState,
  passTurn,
  startRound1Auction,
  type AuctionState,
  type AuctionTeamState,
} from '../../engine/auctionEngine'
import { createAIAuctionDecisionContext } from '../../engine/aiBidding'
import { calculateBestSix } from '../../engine/bestSix'
import { assignEmergencyPlayers } from '../../engine/emergencySignings'
import { createM2PlayerPool } from '../../engine/playerPool'

const participants: readonly AuctionParticipant[] = [
  { id: 'participant-a', teamId: 'team-a', seatIndex: 0, kind: 'HUMAN_LOCAL' },
  { id: 'participant-b', teamId: 'team-b', seatIndex: 1, kind: 'AI' },
  { id: 'participant-c', teamId: 'team-c', seatIndex: 2, kind: 'AI' },
  { id: 'participant-d', teamId: 'team-d', seatIndex: 3, kind: 'AI' },
]

function team(teamId: string, normalCount: number, offset = 0): AuctionTeamState {
  return {
    teamId,
    balance: 300,
    purchasedPlayerCount: normalCount,
    purchasedPlayers: normalPlayerCatalog
      .slice(offset, offset + normalCount)
      .map((player) => ({ player, pricePaid: 1, round: 1 })),
    emergencyPlayers: [],
  }
}

function resolveCurrentWithoutBid(state: AuctionState): AuctionState {
  const round = state.round
  const cardNumber = state.currentCard!.cardNumber
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

function reachFinalRound2Card(seed = 202610): AuctionState {
  let state = startRound1Auction(createM2PlayerPool(seed), participants)
  while (
    !(
      state.round === 2 &&
      state.playerIndex === state.totalPlayers - 1
    )
  ) {
    state = resolveCurrentWithoutBid(state)
  }
  return state
}

describe('M10 punishment player catalog', () => {
  it('contains at least 24 valid, unique fictional players', () => {
    expect(() => assertValidPunishmentPlayerCatalog(punishmentPlayerCatalog))
      .not.toThrow()
    expect(punishmentPlayerCatalog.length)
      .toBeGreaterThanOrEqual(MINIMUM_PUNISHMENT_PLAYER_CATALOG_SIZE)
    expect(new Set(punishmentPlayerCatalog.map(({ id }) => id)).size)
      .toBe(punishmentPlayerCatalog.length)
    expect(punishmentPlayerCatalog.every(({ country }) => country === 'India'))
      .toBe(true)
  })

  it('is separate from the normal 50-player catalog', () => {
    const normalIds = new Set(normalPlayerCatalog.map(({ id }) => id))
    expect(punishmentPlayerCatalog.every(({ id, kind, basePrice }) =>
      kind === 'PUNISHMENT' && basePrice === 0 && !normalIds.has(id),
    )).toBe(true)
    expect(normalPlayerCatalog.every(({ kind }) => kind === 'NORMAL')).toBe(true)
  })

  it('does not introduce an explicit cricket role field', () => {
    expect(punishmentPlayerCatalog.every((player) => !('role' in player)))
      .toBe(true)
  })
})

describe('M10 deterministic emergency assignment', () => {
  it.each([
    [6, 0],
    [7, 0],
    [5, 1],
    [4, 2],
    [0, 6],
  ])('gives a team with %i normal players exactly %i emergency players', (
    normalCount,
    expectedEmergencyCount,
  ) => {
    const original = team('team-a', normalCount)
    const result = assignEmergencyPlayers([original], 91)
    expect(result.teams[0].emergencyPlayers).toHaveLength(expectedEmergencyCount)
    expect(result.teams[0].purchasedPlayerCount).toBe(normalCount)
    if (normalCount >= 6) expect(result.teams[0]).toBe(original)
  })

  it('fills every incomplete team to six without duplicate players', () => {
    const result = assignEmergencyPlayers([
      team('team-a', 0),
      team('team-b', 3, 6),
      team('team-c', 4, 9),
      team('team-d', 7, 13),
    ], 450)
    const ids = result.teams.flatMap(({ emergencyPlayers }) =>
      emergencyPlayers.map(({ player }) => player.id),
    )

    expect(result.teams.every((candidate) =>
      candidate.purchasedPlayerCount + candidate.emergencyPlayers.length >= 6,
    )).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(result.teams[3].emergencyPlayers).toEqual([])
    expect(result.teams[3].purchasedPlayerCount).toBe(7)
  })

  it('is deterministic for the same seed/outcome and varies between seeds', () => {
    const teams = [team('team-a', 4), team('team-b', 5, 4)]
    const idsFor = (seed: number) => assignEmergencyPlayers(teams, seed).teams
      .flatMap(({ emergencyPlayers }) => emergencyPlayers.map(({ player }) => player.id))

    expect(idsFor(123456)).toEqual(idsFor(123456))
    expect(idsFor(123456)).not.toEqual(idsFor(654321))
    expect(teams.every(({ emergencyPlayers }) => emergencyPlayers.length === 0))
      .toBe(true)
  })
})

describe('M10 auction completion integration', () => {
  it('assigns after the auction without changing purse or SOLD history', () => {
    const before = reachFinalRound2Card()
    const balances = before.teams.map(({ balance }) => balance)
    const resultCount = before.results.length
    const after = resolveCurrentWithoutBid(before)

    expect(after).toMatchObject({ phase: 'COMPLETE', status: 'COMPLETE' })
    expect(after.teams.map(({ balance }) => balance)).toEqual(balances)
    expect(after.teams.every(({ purchasedPlayerCount }) => purchasedPlayerCount === 0))
      .toBe(true)
    expect(after.teams.every(({ emergencyPlayers }) => emergencyPlayers.length === 6))
      .toBe(true)
    expect(after.results).toHaveLength(resultCount + 1)
    expect(after.results.every(({ player }) => player.kind === 'NORMAL')).toBe(true)
    expect(after.results.filter(({ outcome }) => outcome === 'SOLD')).toEqual([])
  })

  it('makes emergency players available to strength and completes Best Six', () => {
    const before = reachFinalRound2Card(8181)
    expect(getPublicAuctionState(before).teams.every(({ bestSix }) => !bestSix.isComplete))
      .toBe(true)

    const after = resolveCurrentWithoutBid(before)
    const publicState = getPublicAuctionState(after)
    for (const publicTeam of publicState.teams) {
      expect(publicTeam.availablePlayerCount).toBe(6)
      expect(publicTeam.bestSix.isComplete).toBe(true)
      expect(publicTeam.bestSix).toEqual(calculateBestSix(publicTeam.emergencyPlayers))
      expect(publicTeam.strength).toEqual(publicTeam.bestSix.strength)
    }
  })

  it('publicly distinguishes emergency events and assignments from purchases', () => {
    const publicState = getPublicAuctionState(
      resolveCurrentWithoutBid(reachFinalRound2Card(5150)),
    )
    expect(publicState.emergencySignings).toHaveLength(4)
    expect(publicState.emergencySignings.every(({ type }) =>
      type === 'EMERGENCY_SIGNINGS',
    )).toBe(true)
    expect(publicState.teams.every(({ purchasedPlayers, emergencyPlayers }) =>
      purchasedPlayers.length === 0 &&
      emergencyPlayers.every(({ source, player }) =>
        source === 'EMERGENCY' && player.kind === 'PUNISHMENT',
      ),
    )).toBe(true)
  })

  it('does not expose a punishment catalog or future order to AI during bidding', () => {
    const initial = startRound1Auction(createM2PlayerPool(777), participants)
    const activeAIState = passTurn(initial, 'team-a')
    const context = createAIAuctionDecisionContext(
      getPublicAuctionState(activeAIState),
      'team-b',
    )
    expect(context).not.toHaveProperty('punishmentPlayerCatalog')
    expect(context).not.toHaveProperty('punishmentOrder')
    expect(context.ownTeam.emergencyPlayers).toEqual([])
    expect(activeAIState).not.toHaveProperty('privateEmergencyQueue')
  })
})
