import { describe, expect, it } from 'vitest'

import { createRandomSource, createSeededRandom } from '../../engine/random'

describe('Mulberry32 random source', () => {
  it('produces a stable sequence for a known seed', () => {
    const next = createSeededRandom(123456789)

    expect([next(), next(), next(), next()]).toEqual([
      0.2577907438389957, 0.9707721115555614, 0.7853280142880976,
      0.20616457983851433,
    ])
  })

  it('normalizes seeds to unsigned 32-bit values', () => {
    const fromNegative = createSeededRandom(-1)
    const fromUnsigned = createSeededRandom(0xffffffff)

    expect([fromNegative(), fromNegative()]).toEqual([
      fromUnsigned(),
      fromUnsigned(),
    ])
  })

  it('rejects non-integer seeds', () => {
    expect(() => createSeededRandom(1.5)).toThrow('integer')
  })

  it('performs a deterministic non-mutating Fisher-Yates shuffle', () => {
    const source = Object.freeze([1, 2, 3, 4, 5, 6])
    const first = createRandomSource(42).shuffle(source)
    const second = createRandomSource(42).shuffle(source)

    expect(first).toEqual(second)
    expect(first).not.toBe(source)
    expect(source).toEqual([1, 2, 3, 4, 5, 6])
    expect([...first].sort((a, b) => a - b)).toEqual(source)
  })
})
