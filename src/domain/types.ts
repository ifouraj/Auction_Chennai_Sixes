export type PlayerId = string
export type Money = number
export type SkillRating = number

export interface Player {
  readonly id: PlayerId
  readonly name: string
  readonly country: string
  readonly age: number
  readonly description: string
  readonly imageRef?: string
  readonly batting: SkillRating
  readonly bowling: SkillRating
  readonly wicketKeeping: SkillRating
  readonly leadership: SkillRating
  readonly overall: SkillRating
  readonly basePrice: Money
  readonly kind: 'NORMAL' | 'PUNISHMENT'
}

export interface PlayerPool {
  /** Public, order-neutral view of the players selected for this game. */
  readonly selectedPool: readonly Player[]
  /** Private Round 1 appearance order. Do not expose through UI selectors. */
  readonly auctionQueue: readonly Player[]
}
