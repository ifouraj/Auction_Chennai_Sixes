import { describe, expect, it } from 'vitest'

import { normalPlayerCatalog } from '../../data/playerCatalog'
import type { AIBidderPersonality, TeamId } from '../../domain/types'
import {
  announceAuctionEvent,
  type AuctionPresentationEvent,
} from '../../presentation/auctionAnnouncer'
import { classifyAuctionSale } from '../../presentation/auctionFlavor'
import { getPublicAIPersonalityLabel } from '../../presentation/aiPersonality'

const player = normalPlayerCatalog[0]
const name = (teamId: TeamId) => ({
  'team-a': 'Team A', 'team-b': 'Team B', 'team-c': 'Team C', 'team-d': 'Team D',
}[teamId] ?? teamId)
const humanTurn = { teamId: 'team-a', participantKind: 'HUMAN_LOCAL', currentBid: 34 } as const
const aiTurn = { teamId: 'team-b', participantKind: 'AI', currentBid: 34 } as const

function text(event: AuctionPresentationEvent): string {
  const message = announceAuctionEvent(event, name)
  return `${message.primary} ${message.secondary ?? ''}`
}

describe('M14 auction announcer', () => {
  it('narrates player reveal without future-player information', () => {
    const event = { type: 'PLAYER_REVEAL', player, round: 1, turn: humanTurn } as const
    expect(text(event)).toMatch(new RegExp(player.name, 'i'))
    expect(text(event)).toContain(`₹${player.basePrice}`)
    expect(JSON.stringify(event)).not.toMatch(/queue|nextPlayer|private/i)
  })

  it('narrates human and AI turns', () => {
    expect(text({ type: 'TURN', turn: humanTurn })).toMatch(/YOUR TURN/i)
    expect(text({ type: 'TURN', turn: aiTurn })).toMatch(/TEAM B.*AI is deciding/i)
  })

  it('narrates bids, large raises, passes, and leaving the card', () => {
    expect(text({ type: 'BID', teamId: 'team-b', amount: 35, previousBid: 34, turn: humanTurn })).toMatch(/TEAM B.*BIDS.*₹35/i)
    expect(text({ type: 'BID', teamId: 'team-c', amount: 70, previousBid: 35, turn: aiTurn })).toMatch(/TEAM C.*JUMPS TO.*₹70/i)
    expect(text({ type: 'PASS', teamId: 'team-b', timedOut: false, turn: humanTurn })).toMatch(/PASSES.*return/i)
    expect(text({ type: 'NOT_INTERESTED', teamId: 'team-d', turn: humanTurn })).toMatch(/TEAM D IS OUT.*Not interested/i)
  })

  it('puts actual player, buyer, and price in SOLD and actual player in UNSOLD', () => {
    const sold = text({
      type: 'SOLD', player, buyerTeamId: 'team-c', price: 70, round: 1,
      basePrice: player.basePrice, buyerBalanceAfter: 230,
      buyerPlayerCountAfter: 1, distinctBidderCount: 3,
    })
    expect(sold).toContain('SOLD')
    expect(sold).toContain(player.name)
    expect(sold).toContain('Team C')
    expect(sold).toContain('₹70')
    expect(text({ type: 'UNSOLD', player, round: 1 })).toMatch(new RegExp(`UNSOLD.*${player.name}`, 'i'))
  })

  it('narrates next player, Round 2, and auction completion', () => {
    expect(text({ type: 'NEXT_PLAYER', player, round: 1, turn: humanTurn })).toMatch(/NEXT PLAYER.*enters the auction/i)
    expect(text({ type: 'ROUND_2', player, turn: aiTurn })).toMatch(/ROUND 2.*Opening bid ₹1/i)
    expect(text({ type: 'AUCTION_COMPLETE' })).toMatch(/AUCTION COMPLETE.*squads are locked/i)
  })

  it('exposes neither raw AI tendency names nor values through announcements', () => {
    const announcement = JSON.stringify(announceAuctionEvent({ type: 'TURN', turn: aiTurn }, name))
    expect(announcement).not.toMatch(/aggression|thrift|patience|denial|volatility|riskTolerance|balancePreference/)
    expect(announcement).not.toMatch(/0\.\d+/)
  })

  it('classifies auction flavor deterministically without mutating input', () => {
    const input = Object.freeze({
      player: Object.freeze({ overall: 82, basePrice: 20 }),
      price: 110, round: 1 as const, buyerBalanceAfter: 190,
      buyerPlayerCountAfter: 2, distinctBidderCount: 2,
    })
    const before = structuredClone(input)
    expect(classifyAuctionSale(input)).toBe('VERY BIG SPEND')
    expect(classifyAuctionSale(input)).toBe('VERY BIG SPEND')
    expect(input).toEqual(before)
  })

  it('derives a stable coarse public AI label only', () => {
    const personality: AIBidderPersonality = {
      aggression: 0.9, thrift: 0.2, patience: 0.3,
      balancePreference: 0.4, denial: 0.5, riskTolerance: 0.8, volatility: 0.6,
    }
    const label = getPublicAIPersonalityLabel(personality)
    expect(getPublicAIPersonalityLabel(personality)).toBe(label)
    expect(['Aggressive', 'Patient', 'Bargain Hunter', 'Cautious', 'Stubborn', 'Chaotic']).toContain(label)
    expect(label).not.toMatch(/\d/)
  })
})
