import type { AIBidderPersonality } from '../domain/types'

export type PublicAIPersonalityLabel =
  | 'Aggressive'
  | 'Patient'
  | 'Bargain Hunter'
  | 'Cautious'
  | 'Stubborn'
  | 'Chaotic'

/** Converts private seeded tendencies into one coarse public presentation label. */
export function getPublicAIPersonalityLabel(
  personality: AIBidderPersonality,
): PublicAIPersonalityLabel {
  const candidates: readonly [PublicAIPersonalityLabel, number][] = [
    ['Aggressive', personality.aggression + personality.riskTolerance * 0.55],
    ['Patient', personality.patience + personality.thrift * 0.35],
    ['Bargain Hunter', personality.thrift + personality.balancePreference * 0.35],
    ['Cautious', personality.thrift * 0.65 + (1 - personality.riskTolerance)],
    ['Stubborn', personality.denial + personality.patience * 0.35],
    ['Chaotic', personality.volatility + personality.riskTolerance * 0.5],
  ]
  return candidates.reduce((best, candidate) =>
    candidate[1] > best[1] ? candidate : best,
  )[0]
}
