import { describe, expect, it } from 'vitest'

import type { AIBidderPersonality, AuctionParticipant, Player } from '../../domain/types'
import {
  createAIAuctionDecisionContext,
  createAIDecisionRandom,
  decideAuctionAction,
  evaluateAuctionDecision,
  type AIAuctionDecisionContext,
} from '../../engine/aiBidding'
import {
  getPublicAuctionState,
  markNotInterested,
  passTurn,
  placeBid,
  startRound1Auction,
  type AuctionState,
  type PublicAuctionTeamState,
} from '../../engine/auctionEngine'
import { validateBid } from '../../engine/biddingRules'
import { calculateBestSix } from '../../engine/bestSix'
import { createM2PlayerPool } from '../../engine/playerPool'
import type { RandomSource } from '../../engine/random'

const participants: readonly AuctionParticipant[] = [
  { id: 'participant-a', teamId: 'team-a', seatIndex: 0, kind: 'HUMAN_LOCAL' },
  { id: 'participant-b', teamId: 'team-b', seatIndex: 1, kind: 'AI' },
  { id: 'participant-c', teamId: 'team-c', seatIndex: 2, kind: 'AI' },
  { id: 'participant-d', teamId: 'team-d', seatIndex: 3, kind: 'AI' },
]

const neutral: AIBidderPersonality = {
  aggression: 0.5,
  thrift: 0.5,
  patience: 1,
  balancePreference: 0.5,
  denial: 0.5,
  riskTolerance: 0.5,
  volatility: 0,
}

function random(value = 0.5): RandomSource {
  return {
    next: () => value,
    int: (min) => min,
    shuffle: (items) => [...items],
  }
}

function player(
  id: string,
  batting: number,
  bowling: number,
  wicketKeeping: number,
  leadership: number,
  basePrice = 1,
): Player {
  return {
    id,
    name: id,
    country: 'Test',
    age: 25,
    description: 'Test player',
    batting,
    bowling,
    wicketKeeping,
    leadership,
    overall: 0,
    basePrice,
    kind: 'NORMAL',
  }
}

function team(
  teamId: string,
  owned: readonly Player[] = [],
  balance = 300,
): PublicAuctionTeamState {
  const purchasedPlayers = owned.map((ownedPlayer) => ({
    player: ownedPlayer,
    pricePaid: 1,
    round: 1 as const,
  }))
  const bestSix = calculateBestSix(purchasedPlayers)
  return {
    teamId,
    balance,
    purchasedPlayerCount: owned.length,
    purchasedPlayers,
    emergencyPlayers: [],
    availablePlayerCount: owned.length,
    canAffordMinimumBid: true,
    bestSix,
    strength: bestSix.strength,
  }
}

function context(
  currentPlayer: Player,
  ownTeam = team('team-b'),
  minimumLegalBid = 1,
  round: 1 | 2 = 1,
): AIAuctionDecisionContext {
  return {
    round,
    currentPlayer,
    currentBid: minimumLegalBid > 1 ? minimumLegalBid - 1 : null,
    currentHighestBidderId: null,
    minimumLegalBid,
    ownTeam,
    opponents: [team('team-a'), team('team-c'), team('team-d')],
    playersPurchased: 0,
    progress: { processedPlayers: 0, totalPlayers: 25 },
  }
}

function createAuction(seed = 42): AuctionState {
  return startRound1Auction(createM2PlayerPool(seed), participants)
}

describe('M9 AI bidders', () => {
  it('creates one human and three AI seats with a personality for every AI', () => {
    const state = createAuction()
    expect(state.participants.map(({ kind }) => kind)).toEqual([
      'HUMAN_LOCAL', 'AI', 'AI', 'AI',
    ])
    expect(Object.keys(state.aiPersonalities).sort()).toEqual([
      'team-b', 'team-c', 'team-d',
    ])
    expect(state.aiPersonalities).not.toHaveProperty('team-a')
  })

  it('generates the same personalities for the same seed and variation across seeds', () => {
    expect(createAuction(123).aiPersonalities).toEqual(createAuction(123).aiPersonalities)
    expect(createAuction(123).aiPersonalities).not.toEqual(createAuction(124).aiPersonalities)
  })

  it('keeps personalities, seed, selected pool, and both future queues out of AI context', () => {
    const initial = createAuction(7788)
    const state = passTurn(initial, 'team-a')
    const aiContext = createAIAuctionDecisionContext(
      getPublicAuctionState(state),
      'team-b',
    )
    expect(aiContext).not.toHaveProperty('seed')
    expect(aiContext).not.toHaveProperty('aiPersonalities')
    expect(aiContext).not.toHaveProperty('selectedPool')
    expect(aiContext).not.toHaveProperty('privateAuctionQueue')
    expect(aiContext).not.toHaveProperty('auctionQueue')
  })

  it('cannot change a decision by changing only unrevealed future order', () => {
    const first = passTurn(createAuction(991), 'team-a')
    const changedFuture: AuctionState = {
      ...first,
      privateAuctionQueue: [
        first.privateAuctionQueue[0],
        ...first.privateAuctionQueue.slice(1).reverse(),
      ],
    }
    const firstContext = createAIAuctionDecisionContext(getPublicAuctionState(first), 'team-b')
    const changedContext = createAIAuctionDecisionContext(getPublicAuctionState(changedFuture), 'team-b')
    expect(changedContext).toEqual(firstContext)
    expect(decideAuctionAction(firstContext, first.aiPersonalities['team-b']!, createAIDecisionRandom(991)))
      .toEqual(decideAuctionAction(changedContext, first.aiPersonalities['team-b']!, createAIDecisionRandom(991)))
  })

  it('returns only normal auction intents', () => {
    const actions = [
      decideAuctionAction(context(player('good', 80, 80, 80, 80)), neutral, random()),
      decideAuctionAction(context(player('pricey', 30, 30, 30, 30), team('team-b'), 200), neutral, random()),
    ]
    expect(actions.every(({ type }) => ['BID', 'PASS', 'NOT_INTERESTED'].includes(type))).toBe(true)
  })

  it('always submits a legal affordable BID under the M5 bank rule', () => {
    const initial = passTurn(createAuction(201), 'team-a')
    const aiContext = createAIAuctionDecisionContext(getPublicAuctionState(initial), 'team-b')
    const action = decideAuctionAction(aiContext, neutral, random())
    expect(action.type).toBe('BID')
    if (action.type !== 'BID') return
    expect(action.amount).toBeLessThan(initial.teams[1].balance)
    expect(validateBid(initial, 'team-b', action.amount)).toEqual({ ok: true })
    expect(() => placeBid(initial, 'team-b', action.amount)).not.toThrow()
  })

  it('never bids above the purse and respects the zero-balance rule', () => {
    const candidate = player('star', 100, 100, 100, 100)
    const fiveOwned = Array.from({ length: 5 }, (_, index) => player(`owned-${index}`, 20, 20, 20, 20))
    const allIn = decideAuctionAction(context(candidate, team('team-b', fiveOwned, 1)), neutral, random())
    const empty = decideAuctionAction(context(candidate, team('team-b', [], 1)), neutral, random())
    expect(allIn).toEqual({ type: 'BID', amount: 1 })
    expect(empty.type).not.toBe('BID')
  })

  it('values player quality and squad improvement without using authored Overall', () => {
    const weak = evaluateAuctionDecision(context(player('weak', 10, 10, 10, 10)), neutral, random())
    const strong = evaluateAuctionDecision(context(player('strong', 90, 90, 90, 90)), neutral, random())
    expect(strong.estimatedValue).toBeGreaterThan(weak.estimatedValue)
    expect(strong.projectedStrengthGain).toBeGreaterThan(weak.projectedStrengthGain)
  })

  it('raises valuation when a player repairs the current weakest category', () => {
    const batterHeavy = Array.from({ length: 6 }, (_, index) =>
      player(`bat-${index}`, 90, 70, 5, 60),
    )
    const balanced = Array.from({ length: 6 }, (_, index) =>
      player(`balanced-${index}`, 90, 70, 90, 60),
    )
    const keeper = player('keeper', 40, 40, 100, 40)
    const needsKeeper = evaluateAuctionDecision(context(keeper, team('team-b', batterHeavy)), neutral, random())
    const hasKeeper = evaluateAuctionDecision(context(keeper, team('team-b', balanced)), neutral, random())
    expect(needsKeeper.weaknessBonus).toBeGreaterThan(hasKeeper.weaknessBonus)
    expect(needsKeeper.estimatedValue).toBeGreaterThan(hasKeeper.estimatedValue)
  })

  it('can bid for a sixth player and for a seventh that improves Best Six', () => {
    const weakOwned = Array.from({ length: 6 }, (_, index) =>
      player(`weak-${index}`, 15, 15, 15, 15),
    )
    const star = player('star', 95, 95, 95, 95)
    const fifth = decideAuctionAction(context(star, team('team-b', weakOwned.slice(0, 5))), neutral, random())
    const seventh = decideAuctionAction(context(star, team('team-b', weakOwned)), neutral, random())
    expect(fifth.type).toBe('BID')
    expect(seventh.type).toBe('BID')
  })

  it('ignores a weak extra player that cannot improve a strong Best Six', () => {
    const strongOwned = Array.from({ length: 6 }, (_, index) =>
      player(`strong-${index}`, 90, 90, 90, 90),
    )
    const action = decideAuctionAction(
      context(player('bench', 1, 1, 1, 1), team('team-b', strongOwned), 100),
      neutral,
      random(),
    )
    expect(action).toEqual({ type: 'NOT_INTERESTED' })
  })

  it('can PASS at the edge of its valuation without converting PASS to NI', () => {
    const baseContext = context(player('moderate', 55, 55, 55, 55))
    const valuation = evaluateAuctionDecision(baseContext, neutral, random()).estimatedValue
    const impatient = { ...neutral, patience: 0 }
    const action = decideAuctionAction(
      { ...baseContext, currentBid: valuation - 1, minimumLegalBid: valuation },
      impatient,
      random(0),
    )
    expect(action).toEqual({ type: 'PASS' })
    expect(action.type).not.toBe('NOT_INTERESTED')
  })

  it('deliberately uses NOT_INTERESTED when price is clearly beyond value', () => {
    const action = decideAuctionAction(
      context(player('ordinary', 40, 40, 40, 40), team('team-b'), 250),
      neutral,
      random(),
    )
    expect(action).toEqual({ type: 'NOT_INTERESTED' })
  })

  it('changes valuation and action with deterministic personality tendencies', () => {
    const candidateContext = context(player('contested', 65, 65, 65, 65), team('team-b'), 55)
    const cautious: AIBidderPersonality = {
      ...neutral,
      aggression: 0,
      thrift: 1,
      riskTolerance: 0,
    }
    const bold: AIBidderPersonality = {
      ...neutral,
      aggression: 1,
      thrift: 0,
      riskTolerance: 1,
    }
    const cautiousResult = evaluateAuctionDecision(candidateContext, cautious, random())
    const boldResult = evaluateAuctionDecision(candidateContext, bold, random())
    expect(boldResult.estimatedValue).toBeGreaterThan(cautiousResult.estimatedValue)
    expect(cautiousResult.action.type).not.toBe('BID')
    expect(boldResult.action.type).toBe('BID')
  })

  it('allows an extremely cheap Round 2 bid without reusing Round 1 base price', () => {
    const expensivePlayer = player('round-two-star', 80, 80, 80, 80, 60)
    const action = decideAuctionAction(
      context(expensivePlayer, team('team-b'), 1, 2),
      neutral,
      random(),
    )
    expect(action.type).toBe('BID')
    if (action.type === 'BID') {
      expect(action.amount).toBeGreaterThanOrEqual(1)
      expect(action.amount).toBeLessThan(expensivePlayer.basePrice)
    }
  })

  it('produces the same action for the same full seeded scenario', () => {
    const first = passTurn(createAuction(31415), 'team-a')
    const second = passTurn(createAuction(31415), 'team-a')
    const firstContext = createAIAuctionDecisionContext(getPublicAuctionState(first), 'team-b')
    const secondContext = createAIAuctionDecisionContext(getPublicAuctionState(second), 'team-b')
    expect(decideAuctionAction(firstContext, first.aiPersonalities['team-b']!, createAIDecisionRandom(31415)))
      .toEqual(decideAuctionAction(secondContext, second.aiPersonalities['team-b']!, createAIDecisionRandom(31415)))
  })

  it('can complete a full seeded auction using only normal engine commands', () => {
    let state = createAuction(24680)
    const decisionRandom = createAIDecisionRandom(24680)
    let actionCount = 0

    while (state.status === 'IN_PROGRESS' && actionCount < 2_000) {
      const teamId = state.currentCard!.activeTeamId
      const participant = state.participants.find((candidate) => candidate.teamId === teamId)!
      if (participant.kind === 'AI') {
        const personality = state.aiPersonalities[teamId]!
        const action = decideAuctionAction(
          createAIAuctionDecisionContext(getPublicAuctionState(state), teamId),
          personality,
          decisionRandom,
        )
        state = action.type === 'BID'
          ? placeBid(state, teamId, action.amount)
          : action.type === 'PASS'
            ? passTurn(state, teamId)
            : markNotInterested(state, teamId)
      } else {
        state = passTurn(state, teamId)
      }
      actionCount += 1
    }

    expect(state.status).toBe('COMPLETE')
    expect(actionCount).toBeLessThan(2_000)
    expect(state.teams.every(({ balance }) => balance >= 0)).toBe(true)
    expect(state.results.length).toBeGreaterThanOrEqual(25)
  })
})
