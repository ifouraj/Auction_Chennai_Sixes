import { MINIMUM_LEGAL_MONEY_UNIT, TARGET_NORMAL_SQUAD_SIZE } from '../domain/constants'
import type { AIBidderPersonality, AuctionParticipant, Money, Player, TeamId } from '../domain/types'
import type { AuctionRound, PublicAuctionState, PublicAuctionTeamState } from './auctionEngine'
import { calculateBestSix } from './bestSix'
import { getMinimumLegalBid } from './biddingRules'
import { createRandomSource, type RandomSource } from './random'

export const AI_BIDDER_TUNING = {
  personalitySeedDomain: 0x41b1dd39, decisionSeedDomain: 0x41dec151,
  qualityWeights: { batting: 0.4, bowling: 0.4, wicketKeeping: 0.12, leadership: 0.08 },
  usefulImprovementThreshold: 20, marginalMoneyScale: 0.8,
  completionBonusMaximum: 24, denialShare: 0.15, denialBonusMaximum: 20,
  personalityRange: [0.9, 1.12] as const, volatilityMaximumDeviation: 0.07,
  lateUrgencyMaximum: 0.65, passThresholdRatio: 1.18, nearLimitPassBand: 0.12,
} as const

export type AIAuctionIntent = { readonly type: 'BID'; readonly amount: Money }
  | { readonly type: 'PASS' } | { readonly type: 'NOT_INTERESTED' }
export interface AIAuctionDecisionContext {
  readonly round: AuctionRound; readonly currentPlayer: Player
  readonly currentBid: Money | null; readonly currentHighestBidderId: TeamId | null
  readonly minimumLegalBid: Money; readonly ownTeam: PublicAuctionTeamState
  readonly opponents: readonly PublicAuctionTeamState[]; readonly playersPurchased: number
  readonly progress: { readonly processedPlayers: number; readonly totalPlayers: number }
}
export interface AIValuation {
  readonly estimatedValue: Money; readonly qualityScore: number
  readonly projectedStrengthGain: number; readonly categoryGain: number
  readonly battingGain: number; readonly bowlingGain: number
  readonly wicketKeepingGain: number; readonly leadershipGain: number
  readonly ownImprovementValue: number; readonly weaknessBonus: number
  readonly completionPressure: number; readonly denialBonus: number
  readonly lateAuctionMultiplier: number
}
export interface AIDecisionEvaluation extends AIValuation {
  readonly currentPrice: Money; readonly maximumAffordableBid: Money
  readonly action: AIAuctionIntent
}

const PERSONALITY_KEYS: readonly (keyof AIBidderPersonality)[] = [
  'aggression', 'thrift', 'patience', 'balancePreference', 'denial', 'riskTolerance', 'volatility',
]
export function generateAIPersonalities(seed: number, participants: readonly AuctionParticipant[])
  : Readonly<Partial<Record<TeamId, AIBidderPersonality>>> {
  const random = createRandomSource((seed ^ AI_BIDDER_TUNING.personalitySeedDomain) | 0)
  const personalities: Partial<Record<TeamId, AIBidderPersonality>> = {}
  for (const participant of [...participants].sort((a, b) => a.seatIndex - b.seatIndex)) {
    if (participant.kind !== 'AI') continue
    const v = PERSONALITY_KEYS.map(() => random.next())
    personalities[participant.teamId] = { aggression: v[0], thrift: v[1], patience: v[2],
      balancePreference: v[3], denial: v[4], riskTolerance: v[5], volatility: v[6] }
  }
  return personalities
}

/** Uses only the public projection: no selected pool, queue, seed, or future identity. */
export function createAIAuctionDecisionContext(state: PublicAuctionState, teamId: TeamId)
  : AIAuctionDecisionContext {
  if (state.status !== 'IN_PROGRESS' || state.currentCard === null) {
    throw new Error('Cannot build AI context without an active auction card')
  }
  if (state.currentCard.activeTeamId !== teamId) throw new Error('AI context may only be built for the active team')
  const ownTeam = state.teams.find((team) => team.teamId === teamId)
  if (ownTeam === undefined) throw new Error('AI context team is missing')
  return { round: state.round, currentPlayer: state.currentCard.player,
    currentBid: state.currentCard.highestBid, currentHighestBidderId: state.currentCard.highestBidderId,
    minimumLegalBid: getMinimumLegalBid(state.currentCard), ownTeam,
    opponents: state.teams.filter((team) => team.teamId !== teamId),
    playersPurchased: state.results.filter((result) => result.outcome === 'SOLD').length,
    progress: { processedPlayers: state.playerIndex, totalPlayers: state.totalPlayers } }
}

interface Improvement { batting: number; bowling: number; wicketKeeping: number
  leadership: number; overall: number; utility: number }
function marginalImprovement(team: PublicAuctionTeamState, player: Player): Improvement {
  const after = calculateBestSix([...team.purchasedPlayers, ...team.emergencyPlayers, { player }]).strength
  const before = team.strength
  const batting = Math.max(0, after.batting - before.batting)
  const bowling = Math.max(0, after.bowling - before.bowling)
  const wicketKeeping = Math.max(0, after.wicketKeeping - before.wicketKeeping)
  const leadership = Math.max(0, after.leadership - before.leadership)
  const overall = Math.max(0, after.overall - before.overall)
  const battingNeed = 1 + Math.max(0, 65 - before.batting) / 100
  const bowlingNeed = 1 + Math.max(0, 65 - before.bowling) / 100
  const keeperNeed = before.wicketKeeping >= 70 ? 0.08 : before.wicketKeeping >= 45 ? 0.22 : 0.42
  const leadershipNeed = before.leadership >= 70 ? 0.04 : before.leadership >= 45 ? 0.1 : 0.18
  return { batting, bowling, wicketKeeping, leadership, overall,
    utility: batting * battingNeed + bowling * bowlingNeed + wicketKeeping * keeperNeed
      + leadership * leadershipNeed + overall * 0.55 }
}
function progressRatio(context: AIAuctionDecisionContext): number {
  if (context.progress.totalPlayers <= 1) return 1
  return Math.max(0, Math.min(1, context.progress.processedPlayers / (context.progress.totalPlayers - 1)))
}
function interpolate(range: readonly [number, number], value: number): number {
  return range[0] + (range[1] - range[0]) * value
}

export function valueAuctionPlayer(context: AIAuctionDecisionContext,
  personality: AIBidderPersonality, random: RandomSource): AIValuation {
  const player = context.currentPlayer
  const own = marginalImprovement(context.ownTeam, player)
  const w = AI_BIDDER_TUNING.qualityWeights
  const qualityScore = player.batting * w.batting + player.bowling * w.bowling
    + player.wicketKeeping * w.wicketKeeping + player.leadership * w.leadership
  const useful = own.utility >= AI_BIDDER_TUNING.usefulImprovementThreshold
  const missing = Math.max(0, TARGET_NORMAL_SQUAD_SIZE - context.ownTeam.purchasedPlayerCount)
  const completionPressure = useful ? Math.min(AI_BIDDER_TUNING.completionBonusMaximum, missing * 4) : 0
  const rivalOpportunity = context.opponents.reduce((best, opponent) =>
    Math.max(best, marginalImprovement(opponent, player).utility), 0)
  const denialBonus = rivalOpportunity >= AI_BIDDER_TUNING.usefulImprovementThreshold
    ? Math.min(AI_BIDDER_TUNING.denialBonusMaximum,
        rivalOpportunity * AI_BIDDER_TUNING.denialShare * personality.denial) : 0
  const progress = progressRatio(context)
  const lateAuctionMultiplier = 1 + (context.round === 2 ? progress ** 1.6 : progress ** 2 * 0.35)
    * AI_BIDDER_TUNING.lateUrgencyMaximum
  const rationalValue = own.utility * AI_BIDDER_TUNING.marginalMoneyScale + completionPressure + denialBonus
  const personalityFactor = interpolate(AI_BIDDER_TUNING.personalityRange, personality.aggression)
    * interpolate([1.05, 0.95], personality.thrift) * interpolate([0.97, 1.03], personality.riskTolerance)
  const volatility = 1 + (random.next() * 2 - 1) * personality.volatility
    * AI_BIDDER_TUNING.volatilityMaximumDeviation
  const leadershipRepair = own.leadership >= 50 && player.batting >= 30 && player.bowling >= 30
  const strategicallyUseful = useful || leadershipRepair || denialBonus >= 6
  const raw = !strategicallyUseful ? 0
    : rationalValue * lateAuctionMultiplier * personalityFactor * volatility
  return { estimatedValue: Math.max(0, Math.floor(raw / MINIMUM_LEGAL_MONEY_UNIT) * MINIMUM_LEGAL_MONEY_UNIT),
    qualityScore, projectedStrengthGain: own.overall,
    categoryGain: own.batting + own.bowling + own.wicketKeeping + own.leadership,
    battingGain: own.batting, bowlingGain: own.bowling, wicketKeepingGain: own.wicketKeeping,
    leadershipGain: own.leadership, ownImprovementValue: own.utility,
    weaknessBonus: own.batting * Math.max(0, 65 - context.ownTeam.strength.batting) / 100
      + own.bowling * Math.max(0, 65 - context.ownTeam.strength.bowling) / 100
      + own.wicketKeeping * (context.ownTeam.strength.wicketKeeping < 45 ? 0.42 : 0.08)
      + own.leadership * (context.ownTeam.strength.leadership < 45 ? 0.18 : 0.04),
    completionPressure, denialBonus, lateAuctionMultiplier }
}

function legalJump(context: AIAuctionDecisionContext, ceiling: number, valuation: AIValuation,
  personality: AIBidderPersonality, random: RandomSource): number {
  const minimum = context.minimumLegalBid
  const comfortSteps = Math.floor((ceiling - minimum) / MINIMUM_LEGAL_MONEY_UNIT)
  if (comfortSteps <= 0) return minimum
  const desiredSteps = Math.max(0, Math.round(Math.min(3, valuation.ownImprovementValue / 22)
    + Math.min(1.5, valuation.denialBonus / 15) + (valuation.lateAuctionMultiplier - 1) * 3
    + personality.aggression * 2 + random.next() * 2 - 1))
  return minimum + Math.min(comfortSteps, desiredSteps) * MINIMUM_LEGAL_MONEY_UNIT
}
export function evaluateAuctionDecision(context: AIAuctionDecisionContext,
  personality: AIBidderPersonality, random: RandomSource): AIDecisionEvaluation {
  const valuation = valueAuctionPlayer(context, personality, random)
  const reserve = context.ownTeam.purchasedPlayerCount < TARGET_NORMAL_SQUAD_SIZE - 1
    ? MINIMUM_LEGAL_MONEY_UNIT : 0
  const maximumAffordableBid = Math.max(0, context.ownTeam.balance - reserve)
  const currentPrice = context.minimumLegalBid
  const maximumBid = Math.min(valuation.estimatedValue, maximumAffordableBid)
  let action: AIAuctionIntent
  if (valuation.estimatedValue === 0) action = { type: 'NOT_INTERESTED' }
  else if (currentPrice <= maximumBid) {
    const discomfort = maximumBid === 0 ? 1 : currentPrice / maximumBid
    const passChance = discomfort > 1 - AI_BIDDER_TUNING.nearLimitPassBand
      ? (1 - personality.patience) * 0.35 : 0
    action = random.next() < passChance ? { type: 'PASS' }
      : { type: 'BID', amount: legalJump(context, maximumBid, valuation, personality, random) }
  } else action = currentPrice > valuation.estimatedValue * AI_BIDDER_TUNING.passThresholdRatio
    ? { type: 'NOT_INTERESTED' } : { type: 'PASS' }
  return { ...valuation, currentPrice, maximumAffordableBid, action }
}
export function decideAuctionAction(context: AIAuctionDecisionContext,
  personality: AIBidderPersonality, random: RandomSource): AIAuctionIntent {
  return evaluateAuctionDecision(context, personality, random).action
}
export function createAIDecisionRandom(seed: number): RandomSource {
  return createRandomSource((seed ^ AI_BIDDER_TUNING.decisionSeedDomain) | 0)
}
