export interface RandomSource {
  next(): number
  int(min: number, max: number): number
  shuffle<T>(items: readonly T[]): T[]
}

export function createSeededRandom(seed: number): () => number {
  if (!Number.isInteger(seed)) {
    throw new Error('Random seed must be an integer')
  }

  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function createRandomSource(seed: number): RandomSource {
  const next = createSeededRandom(seed)

  return {
    next,
    int(min: number, max: number): number {
      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
        throw new Error('Random integer bounds must be integers with min <= max')
      }

      return Math.floor(next() * (max - min + 1)) + min
    },
    shuffle<T>(items: readonly T[]): T[] {
      const shuffled = [...items]

      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(next() * (index + 1))
        const current = shuffled[index]
        shuffled[index] = shuffled[swapIndex]
        shuffled[swapIndex] = current
      }

      return shuffled
    },
  }
}
