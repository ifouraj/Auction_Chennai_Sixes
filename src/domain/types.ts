export type PlayerId = string
export type TeamId = string
export type ParticipantId = string
export type Money = number
export type SkillRating = number

export type SeatIndex = 0 | 1 | 2 | 3
export type ParticipantKind = 'HUMAN_LOCAL' | 'AI' | 'HUMAN_REMOTE'

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
  /** Seed used to reproduce private auction ordering in later rounds. */
  readonly seed?: number
  /** Public, order-neutral view of the players selected for this game. */
  readonly selectedPool: readonly Player[]
  /** Private Round 1 appearance order. Do not expose through UI selectors. */
  readonly auctionQueue: readonly Player[]
}

/** A controller occupying a team seat. Auction rules do not depend on its kind. */
export interface AuctionParticipant {
  readonly id: ParticipantId
  readonly teamId: TeamId
  readonly seatIndex: SeatIndex
  readonly kind: ParticipantKind
}
