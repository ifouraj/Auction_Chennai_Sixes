import { TARGET_NORMAL_SQUAD_SIZE } from '../domain/constants'
import type {
  AIBidderPersonality,
  AuctionParticipant,
  Money,
  Player,
  TeamId,
} from '../domain/types'
import type {
  AuctionRound,
  PublicAuctionState,
  PublicAuctionTeamState,
} from './auctionEngine'
import { calculateBestSix } from './bestSix'
import { getMinimumLegalBid } from './biddingRules'
import { createRandomSource, type RandomSource } from './random'

/** M9 playtest knobs. Keep economy and behavior tuning in this one object. */
export const AI_BIDDER_TUNING = {
  personalitySeedDomain: 0x41b1dd39,
  decisionSeedDomain: 0x41dec151,
  qualityWeights: {
    batting: 0.32,
    bowling: 0.32,
    wicketKeeping: 0.18,
    leadership: 0.18,
  },
  qualityMoneyScale: 0.42,
  overallGainMoneyScale: 0.85,
  categoryGainMoneyScale: 0.08,
  missingPlayerValue: 2.2,
  sixthPlayerUrgency: 10,
  round2BargainBonus: 3,
  purseMultiplierMinimum: 0.58,
  aggressionRange: [0.82, 1.25] as const,
  thriftRange: [1.08, 0.72] as const,
  riskRange: [0.9, 1.12] as const,
  volatilityMaximumDeviation: 0.16,
  weaknessBonusMaximum: 13,
  denialBonusMaximum: 9,
  denialRivalStrengthMargin: -2,
  passThresholdRatio: 1.22,
  noValueImprovementThreshold: 0.25,
  nearLimitPassBand: 0.18,
  maximumJumpFraction: 0.28,
} as const

export type AIAuctionIntent =
  | { readonly type: 'BID'; readonly amount: Money }
  | { readonly type: 'PASS' }
  | { readonly type: 'NOT_INTERESTED' }

export interface AIAuctionDecisionContext {
  readonly round: AuctionRound
  readonly currentPlayer: Player
  readonly currentBid: Money | null
  readonly currentHighestBidderId: TeamId | null
  readonly minimumLegalBid: Money
  readonly ownTeam: PublicAuctionTeamState
  readonly opponents: readonly PublicAuctionTeamState[]
  readonly playersPurchased: number
  readonly progress: {
    readonly processedPlayers: number
    readonly totalPlayers: number
  }
}

export interface AIValuation {
  readonly estimatedValue: Money
  readonly qualityScore: number
  readonly projectedStrengthGain: number
  readonly categoryGain: number
  readonly weaknessBonus: number
  readonly completionPressure: number
  readonly denialBonus: number
}

export interface AIDecisionEvaluation extends AIValuation {
  readonly currentPrice: Money
  readonly maximumAffordableBid: Money
  readonly action: AIAuctionIntent
}

const PERSONALITY_KEYS: readonly (keyof AIBidderPersonality)[] = [
  'aggression',
  'thrift',
  'patience',
  'balancePreference',
  'denial',
  'riskTolerance',
  'volatility',
]

export function generateAIPersonalities(
  seed: number,
  participants: readonly AuctionParticipant[],
): Readonly<Partial<Record<TeamId, AIBidderPersonality>>> {
  const random = createRandomSource((seed ^ AI_BIDDER_TUNING.personalitySeedDomain) | 0)
  const personalities: Partial<Record<TeamId, AIBidderPersonality>> = {}

  for (const participant of [...participants].sort((a, b) => a.seatIndex - b.seatIndex)) {
    if (participant.kind !== 'AI') continue
    const values = PERSONALITY_KEYS.map(() => random.next())
    personalities[participant.teamId] = {
      aggression: values[0],
      thrift: values[1],
      patience: values[2],
      balancePreference: values[3],
      denial: values[4],
      riskTolerance: values[5],
      volatility: values[6],
    }
  }
  return personalities
}

/**
 * Builds the AI's complete information boundary from the public projection.
 * selectedPool is intentionally not copied: selected does not mean currently revealed.
 */
export function createAIAuctionDecisionContext(
  state: PublicAuctionState,
  teamId: TeamId,
): AIAuctionDecisionContext {
  if (state.status !== 'IN_PROGRESS' || state.currentCard === null) {
    throw new Error('Cannot build AI context without an active auction card')
  }
  if (state.currentCard.activeTeamId !== teamId) {
    throw new Error('AI context may only be built for the active team')
  }
  const ownTeam = state.teams.find((team) => team.teamId === teamId)
  if (ownTeam === undefined) throw new Error('AI context team is missing')

  return {
    round: state.round,
    currentPlayer: state.currentCard.player,
    currentBid: state.currentCard.highestBid,
    currentHighestBidderId: state.currentCard.highestBidderId,
    minimumLegalBid: getMinimumLegalBid(state.currentCard),
    ownTeam,
    opponents: state.teams.filter((team) => team.teamId !== teamId),
    playersPurchased: state.results.filter((result) => result.outcome === 'SOLD').length,
    progress: {
      processedPlayers: state.playerIndex,
      totalPlayers: state.totalPlayers,
    },
  }
}

function interpolate([low, high]: readonly [number, number], tendency: number): number {
  return low + (high - low) * tendency
}

function categoryValues(team: PublicAuctionTeamState): readonly number[] {
  return [
    team.strength.batting,
    team.strength.bowling,
    team.strength.wicketKeeping,
    team.strength.leadership,
  ]
}

export function valueAuctionPlayer(
  context: AIAuctionDecisionContext,
  personality: AIBidderPersonality,
  random: RandomSource,
): AIValuation {
  const { currentPlayer: player, ownTeam } = context
  const weights = AI_BIDDER_TUNING.qualityWeights
  const qualityScore =
    player.batting * weights.batting +
    player.bowling * weights.bowling +
    player.wicketKeeping * weights.wicketKeeping +
    player.leadership * weights.leadership
  const projected = calculateBestSix([
    ...ownTeam.purchasedPlayers,
    { player },
  ])
  const projectedStrengthGain = Math.max(
    0,
    projected.strength.overall - ownTeam.strength.overall,
  )
  const beforeCategories = categoryValues(ownTeam)
  const afterCategories = [
    projected.strength.batting,
    projected.strength.bowling,
    projected.strength.wicketKeeping,
    projected.strength.leadership,
  ]
  const categoryGain = afterCategories.reduce(
    (sum, value, index) => sum + Math.max(0, value - beforeCategories[index]),
    0,
  )
  const weakestCategory = Math.min(...beforeCategories)
  const weakestGain = afterCategories.reduce(
    (sum, value, index) =>
      beforeCategories[index] === weakestCategory
        ? sum + Math.max(0, value - beforeCategories[index])
        : sum,
    0,
  )
  const weaknessBonus =
    Math.min(1, weakestGain / 30) *
    personality.balancePreference *
    AI_BIDDER_TUNING.weaknessBonusMaximum
  const missingPlayers = Math.max(
    0,
    TARGET_NORMAL_SQUAD_SIZE - ownTeam.purchasedPlayerCount,
  )
  const completionPressure =
    missingPlayers * AI_BIDDER_TUNING.missingPlayerValue +
    (missingPlayers === 1 ? AI_BIDDER_TUNING.sixthPlayerUrgency : 0)
  const leadingRival = context.opponents.find(
    (team) => team.teamId === context.currentHighestBidderId,
  )
  const denialBonus =
    leadingRival !== undefined &&
    leadingRival.strength.overall >=
      ownTeam.strength.overall + AI_BIDDER_TUNING.denialRivalStrengthMargin
      ? personality.denial * AI_BIDDER_TUNING.denialBonusMaximum
      : 0
  const purseRatio =
    context.ownTeam.balance / Math.max(1, context.ownTeam.balance +
      context.ownTeam.purchasedPlayers.reduce((sum, purchase) => sum + purchase.pricePaid, 0))
  const purseMultiplier =
    AI_BIDDER_TUNING.purseMultiplierMinimum +
    (1 - AI_BIDDER_TUNING.purseMultiplierMinimum) * purseRatio
  const personalityMultiplier =
    interpolate(AI_BIDDER_TUNING.aggressionRange, personality.aggression) *
    interpolate(AI_BIDDER_TUNING.thriftRange, personality.thrift) *
    interpolate(AI_BIDDER_TUNING.riskRange, personality.riskTolerance)
  const volatility =
    1 +
    (random.next() * 2 - 1) *
      personality.volatility *
      AI_BIDDER_TUNING.volatilityMaximumDeviation
  const roundBonus = context.round === 2 ? AI_BIDDER_TUNING.round2BargainBonus : 0
  const rawValue =
    (qualityScore * AI_BIDDER_TUNING.qualityMoneyScale +
      projectedStrengthGain * AI_BIDDER_TUNING.overallGainMoneyScale +
      categoryGain * AI_BIDDER_TUNING.categoryGainMoneyScale +
      weaknessBonus +
      completionPressure +
      denialBonus +
      roundBonus) *
    purseMultiplier *
    personalityMultiplier *
    volatility

  return {
    estimatedValue: Math.max(0, Math.round(rawValue)),
    qualityScore,
    projectedStrengthGain,
    categoryGain,
    weaknessBonus,
    completionPressure,
    denialBonus,
  }
}

export function evaluateAuctionDecision(
  context: AIAuctionDecisionContext,
  personality: AIBidderPersonality,
  random: RandomSource,
): AIDecisionEvaluation {
  const valuation = valueAuctionPlayer(context, personality, random)
  const maximumAffordableBid = Math.max(
    0,
    context.ownTeam.balance -
      (context.ownTeam.purchasedPlayerCount < TARGET_NORMAL_SQUAD_SIZE - 1 ? 1 : 0),
  )
  const currentPrice = context.minimumLegalBid
  const maximumBid = Math.min(valuation.estimatedValue, maximumAffordableBid)
  let action: AIAuctionIntent

  if (currentPrice <= maximumBid) {
    const comfortRemaining = Math.max(0, maximumBid - currentPrice)
    const discomfort = maximumBid === 0 ? 1 : currentPrice / maximumBid
    const passChance =
      discomfort > 1 - AI_BIDDER_TUNING.nearLimitPassBand
        ? (1 - personality.patience) * 0.45
        : 0
    if (random.next() < passChance) {
      action = { type: 'PASS' }
    } else {
      const jumpFraction =
        random.next() *
        AI_BIDDER_TUNING.maximumJumpFraction *
        (0.35 + personality.aggression * 0.65)
      const amount = Math.min(
        maximumBid,
        currentPrice + Math.floor(comfortRemaining * jumpFraction),
      )
      action = { type: 'BID', amount }
    }
  } else {
    const providesLittleValue =
      valuation.projectedStrengthGain <=
        AI_BIDDER_TUNING.noValueImprovementThreshold &&
      context.ownTeam.purchasedPlayerCount >= TARGET_NORMAL_SQUAD_SIZE
    const clearlyTooExpensive =
      currentPrice >
      Math.max(1, valuation.estimatedValue) * AI_BIDDER_TUNING.passThresholdRatio
    action = providesLittleValue || clearlyTooExpensive
      ? { type: 'NOT_INTERESTED' }
      : { type: 'PASS' }
  }

  return {
    ...valuation,
    currentPrice,
    maximumAffordableBid,
    action,
  }
}

export function decideAuctionAction(
  context: AIAuctionDecisionContext,
  personality: AIBidderPersonality,
  random: RandomSource,
): AIAuctionIntent {
  return evaluateAuctionDecision(context, personality, random).action
}

export function createAIDecisionRandom(seed: number): RandomSource {
  return createRandomSource((seed ^ AI_BIDDER_TUNING.decisionSeedDomain) | 0)
}
