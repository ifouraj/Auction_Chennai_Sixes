import { describe, expect, it } from 'vitest'

import type { Player } from '../../domain/types'
import {
  calculateTeamStrength,
  type PurchasedPlayerStrengthInput,
} from '../../engine/teamStrength'

function player(
  id: string,
  batting: number,
  bowling = 0,
  wicketKeeping = 0,
  leadership = 0,
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
    basePrice: 1,
    kind: 'NORMAL',
  }
}

function purchases(
  ratings: readonly (readonly [number, number?, number?, number?])[],
): PurchasedPlayerStrengthInput[] {
  return ratings.map(
    ([batting, bowling = 0, wicketKeeping = 0, leadership = 0], index) => ({
      player: player(
        `player-${index}`,
        batting,
        bowling,
        wicketKeeping,
        leadership,
      ),
    }),
  )
}

describe('M7 team strength', () => {
  it('returns all zeroes for an empty team', () => {
    expect(calculateTeamStrength([])).toEqual({
      batting: 0,
      bowling: 0,
      wicketKeeping: 0,
      leadership: 0,
      overall: 0,
    })
  })

  it.each([
    ['one player and four missing BAT slots', [90], 18],
    ['two players and three missing BAT slots', [90, 80], 34],
    ['five-player BAT average', [90, 80, 70, 60, 50], 70],
    ['best five BAT from more than five players', [1, 90, 50, 80, 60, 70, 2], 70],
  ])('%s', (_name, battingRatings, expected) => {
    const input = purchases(battingRatings.map((value) => [value]))
    expect(calculateTeamStrength(input).batting).toBe(expected)
  })

  it.each([
    ['one player and four missing BOWL slots', [90], 18],
    ['two players and three missing BOWL slots', [90, 60], 30],
    ['five-player BOWL average', [90, 60, 30, 20, 10], 42],
    ['best five BOWL from more than five players', [10, 90, 30, 80, 70, 60, 2], 66],
  ])('%s', (_name, bowlingRatings, expected) => {
    const input = purchases(bowlingRatings.map((value) => [0, value]))
    expect(calculateTeamStrength(input).bowling).toBe(expected)
  })

  it('uses the highest wicket-keeping and leadership ratings', () => {
    const strength = calculateTeamStrength(purchases([
      [0, 0, 20, 91],
      [0, 0, 87, 40],
      [0, 0, 60, 75],
    ]))

    expect(strength.wicketKeeping).toBe(87)
    expect(strength.leadership).toBe(91)
  })

  it('uses the harmonic BAT/BOWL core and 94/3/3 weighting before public rounding', () => {
    const strength = calculateTeamStrength(purchases([
      [80, 90, 70, 60],
      [80, 60],
      [80, 30],
      [80],
      [80],
    ]))

    expect(strength).toEqual({
      batting: 80,
      bowling: 36,
      wicketKeeping: 70,
      leadership: 60,
      overall: 51,
    })
  })

  it('uses nearest-integer rounding, rounds .5 upward, and avoids compounded rounding', () => {
    const exactHalf = calculateTeamStrength(purchases([[10, 10, 50, 50]]))
    expect(exactHalf.overall).toBe(5) // core 2 plus the two 3% modifiers

    const noCompounding = calculateTeamStrength(purchases([
      [2, 1, 0, 0],
      [2, 1],
    ]))
    expect(noCompounding.batting).toBe(1)
    expect(noCompounding.bowling).toBe(0)
    // Exact BAT 0.8 and BOWL 0.4 produce a harmonic core of 0.533...;
    // Overall is calculated from exact categories rather than rounded display.
    expect(noCompounding.overall).toBe(1)
  })

  it('penalizes severe imbalance and prevents WK/LEAD from dominating', () => {
    const balanced = calculateTeamStrength(purchases(Array(5).fill([70, 70, 20, 20])))
    const unbalanced = calculateTeamStrength(purchases(Array(5).fill([96, 12, 100, 100])))
    const modifiersOnly = calculateTeamStrength(purchases(Array(5).fill([0, 0, 100, 100])))

    expect(balanced.overall).toBe(67)
    expect(unbalanced.overall).toBe(26)
    expect(modifiersOnly.overall).toBe(6)
    expect(balanced.overall).toBeGreaterThan(unbalanced.overall)
  })

  it('does not mutate purchase or player arrays while selecting top ratings', () => {
    const input = purchases([[10, 30, 20, 40], [90, 5, 80, 1], [50, 70, 6, 60]])
    const snapshot = structuredClone(input)

    calculateTeamStrength(input)

    expect(input).toEqual(snapshot)
  })

  it('allows a seventh or later player to improve strength', () => {
    const firstSix = purchases([
      [60, 60, 60, 60], [60, 60, 60, 60], [60, 60, 60, 60],
      [60, 0, 0, 0], [60, 0, 0, 0], [1, 0, 0, 0],
    ])
    const before = calculateTeamStrength(firstSix)
    const improved = calculateTeamStrength([
      ...firstSix,
      ...purchases([[100, 100, 100, 100]]),
    ])

    expect(improved.batting).toBeGreaterThan(before.batting)
    expect(improved.bowling).toBeGreaterThan(before.bowling)
    expect(improved.wicketKeeping).toBe(100)
    expect(improved.leadership).toBe(100)
    expect(improved.overall).toBeGreaterThan(before.overall)
  })

  it('does not let a weak extra player reduce top-N or maximum strength', () => {
    const strong = purchases([
      [90, 90, 90, 90], [80, 80, 80, 80], [70, 70, 70, 70],
      [60, 10, 10, 10], [50, 10, 10, 10], [40, 10, 10, 10],
    ])

    expect(calculateTeamStrength([...strong, ...purchases([[1, 1, 1, 1]])]))
      .toEqual(calculateTeamStrength(strong))
  })

  it('ignores price paid and treats Round 1 and Round 2 purchases identically', () => {
    const ratedPlayer = player('same-player', 90, 60, 80, 70)
    const round1 = [{ player: ratedPlayer, pricePaid: 99, round: 1 as const }]
    const round2 = [{ player: ratedPlayer, pricePaid: 1, round: 2 as const }]

    expect(calculateTeamStrength(round1)).toEqual(calculateTeamStrength(round2))
  })
})
