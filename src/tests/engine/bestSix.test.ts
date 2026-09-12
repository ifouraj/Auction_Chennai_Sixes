import { describe, expect, it } from 'vitest'

import type { Player } from '../../domain/types'
import { calculateBestSix } from '../../engine/bestSix'
import {
  calculateExactTeamStrength,
  calculateTeamStrength,
} from '../../engine/teamStrength'

function player(
  id: string,
  batting: number,
  bowling: number,
  wicketKeeping: number,
  leadership: number,
  overall = 0,
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
    overall,
    basePrice: 1,
    kind: 'NORMAL',
  }
}

function purchase(
  ownedPlayer: Player,
  pricePaid = 1,
  round: 1 | 2 = 1,
) {
  return { player: ownedPlayer, pricePaid, round }
}

function uniformPlayers(count: number, rating = 50) {
  return Array.from({ length: count }, (_, index) =>
    purchase(player(`player-${index}`, rating, rating, rating, rating)),
  )
}

describe('M8 automatic Best Six', () => {
  it('returns an empty incomplete selection for zero players', () => {
    expect(calculateBestSix([])).toEqual({
      playerIds: [],
      isComplete: false,
      strength: calculateTeamStrength([]),
    })
  })

  it.each([1, 2, 3, 4, 5])(
    'selects all %i owned players as an incomplete provisional six',
    (count) => {
      const owned = uniformPlayers(count)
      const result = calculateBestSix(owned)

      expect(result.playerIds).toEqual(owned.map(({ player }) => player.id))
      expect(result.isComplete).toBe(false)
      expect(result.strength).toEqual(calculateTeamStrength(owned))
    },
  )

  it('automatically selects all six when exactly six are owned', () => {
    const owned = uniformPlayers(6)

    expect(calculateBestSix(owned)).toEqual({
      playerIds: owned.map(({ player }) => player.id),
      isComplete: true,
      strength: calculateTeamStrength(owned),
    })
  })

  it.each([7, 8, 10])('selects exactly six from %i owned players', (count) => {
    expect(calculateBestSix(uniformPlayers(count)).playerIds).toHaveLength(6)
  })

  it('chooses by exact M7 Overall before public integer rounding', () => {
    const anchors = Array.from({ length: 4 }, (_, index) =>
      purchase(player(`anchor-${index}`, 80, 80, 80, 80)),
    )
    const keeper = purchase(player('keeper', 0, 0, 100, 0))
    const lower = purchase(player('option-lower', 10, 0, 0, 0))
    const higher = purchase(player('option-higher', 11, 0, 0, 0))
    const lowerSix = [...anchors, keeper, lower]
    const higherSix = [...anchors, keeper, higher]

    expect(calculateTeamStrength(lowerSix).overall).toBe(
      calculateTeamStrength(higherSix).overall,
    )
    expect(calculateExactTeamStrength(higherSix).overall).toBeGreaterThan(
      calculateExactTeamStrength(lowerSix).overall,
    )
    expect(calculateBestSix([...lowerSix, higher]).playerIds).toContain(
      'option-higher',
    )
    expect(calculateBestSix([...lowerSix, higher]).playerIds).not.toContain(
      'option-lower',
    )
  })

  it('uses BAT/BOWL/WK/LEAD rather than authored individual Overall', () => {
    const balanced = [
      purchase(player('batter-bowler-1', 70, 70, 0, 0)),
      purchase(player('batter-bowler-2', 70, 70, 0, 0)),
      purchase(player('batter-bowler-3', 70, 70, 0, 0)),
      purchase(player('batter-keeper', 70, 0, 70, 0)),
      purchase(player('batter-5', 70, 0, 0, 0)),
      purchase(player('leader', 0, 0, 0, 70)),
    ]
    const misleading = purchase(player('misleading', 0, 0, 0, 0, 100))

    expect(calculateBestSix([...balanced, misleading]).playerIds).not.toContain(
      'misleading',
    )
  })

  it.each([
    ['wicket keeper', 'wicketKeeping', [0, 0, 100, 0]],
    ['bowler', 'bowling', [0, 100, 0, 0]],
    ['batter', 'batting', [100, 0, 0, 0]],
    ['leader', 'leadership', [0, 0, 0, 100]],
  ] as const)(
    'lets a strong %s replace a weaker player when it improves %s',
    (_label, _category, ratings) => {
      const base = uniformPlayers(6, 40)
      const specialist = purchase(
        player('specialist', ratings[0], ratings[1], ratings[2], ratings[3]),
      )

      expect(calculateBestSix([...base, specialist]).playerIds).toContain(
        'specialist',
      )
    },
  )

  it('does not let a weak seventh player replace a stronger six', () => {
    const strong = uniformPlayers(6, 70)
    const weak = purchase(player('weak', 1, 1, 1, 1))

    expect(calculateBestSix([...strong, weak]).playerIds).toEqual(
      strong.map(({ player: ownedPlayer }) => ownedPlayer.id),
    )
  })

  it('ignores price paid and purchase round', () => {
    const players = uniformPlayers(8).map(({ player: ownedPlayer }, index) =>
      player(
        ownedPlayer.id,
        20 + index * 5,
        90 - index * 4,
        index * 10,
        80 - index * 3,
      ),
    )
    const expensiveRound1 = players.map((ownedPlayer, index) =>
      purchase(ownedPlayer, 100 + index, 1),
    )
    const cheapRound2 = players.map((ownedPlayer, index) =>
      purchase(ownedPlayer, index + 1, 2),
    )

    expect(calculateBestSix(expensiveRound1)).toEqual(
      calculateBestSix(cheapRound2),
    )
  })

  it('does not mutate the owned-player array or its entries', () => {
    const owned = uniformPlayers(8)
    const snapshot = structuredClone(owned)

    calculateBestSix(owned)

    expect(owned).toEqual(snapshot)
  })

  it('returns the same ordered selection when owned input is reordered', () => {
    const owned = uniformPlayers(8).map(({ player: ownedPlayer }, index) =>
      purchase(player(ownedPlayer.id, 10 + index * 7, 90 - index * 3, index * 9, 70 - index)),
    )

    expect(calculateBestSix(owned)).toEqual(
      calculateBestSix([...owned].reverse()),
    )
  })

  it('uses weakest category and category order for an exact-strength tie', () => {
    const anchors = Array.from({ length: 5 }, (_, index) =>
      purchase(player(`anchor-${index}`, 100, 60, 0, 0)),
    )
    const unbalanced = purchase(player('a-unbalanced', 0, 0, 100, 0))
    const balanced = purchase(player('z-balanced', 0, 0, 80, 20))

    const result = calculateBestSix([...anchors, unbalanced, balanced])

    expect(result.playerIds).toContain('z-balanced')
    expect(result.playerIds).not.toContain('a-unbalanced')
  })

  it('uses sorted lexical player IDs as the final exact-tie fallback', () => {
    const tied = [
      'player-g', 'player-b', 'player-f', 'player-a',
      'player-e', 'player-d', 'player-c',
    ].map((id) => purchase(player(id, 50, 50, 50, 50)))

    expect(calculateBestSix(tied).playerIds).toEqual([
      'player-a', 'player-b', 'player-c',
      'player-d', 'player-e', 'player-f',
    ])
  })
})
