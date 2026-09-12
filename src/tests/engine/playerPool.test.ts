import { describe, expect, it } from 'vitest'

import { normalPlayerCatalog } from '../../data/playerCatalog'
import { AUCTION_POOL_SIZE } from '../../domain/constants'
import type { Player } from '../../domain/types'
import { createM2PlayerPool, selectRandomPlayers } from '../../engine/playerPool'
import type { RandomSource } from '../../engine/random'

const ids = (players: readonly Player[]) => players.map((player) => player.id)

describe('M2 player pool', () => {
  it('selects exactly 25 unique players from the 50-player catalog', () => {
    const pool = createM2PlayerPool(20260912)
    const selectedIds = ids(pool.selectedPool)

    expect(pool.selectedPool).toHaveLength(AUCTION_POOL_SIZE)
    expect(new Set(selectedIds)).toHaveLength(AUCTION_POOL_SIZE)
    expect(
      selectedIds.every((id) =>
        normalPlayerCatalog.some((player) => player.id === id),
      ),
    ).toBe(true)
  })

  it('does not mutate the source catalog', () => {
    const before = structuredClone(normalPlayerCatalog)

    createM2PlayerPool(18)

    expect(normalPlayerCatalog).toEqual(before)
  })

  it('repeats both selection and private order for the same seed', () => {
    const first = createM2PlayerPool(8675309)
    const second = createM2PlayerPool(8675309)

    expect(ids(first.selectedPool)).toEqual(ids(second.selectedPool))
    expect(ids(first.auctionQueue)).toEqual(ids(second.auctionQueue))
  })

  it('allows different seeds to produce different selections and orders', () => {
    const first = createM2PlayerPool(1)
    const second = createM2PlayerPool(2)

    expect(ids(first.selectedPool)).not.toEqual(ids(second.selectedPool))
    expect(ids(first.auctionQueue)).not.toEqual(ids(second.auctionQueue))
  })

  it('keeps the public pool and private queue as separate order concepts', () => {
    const pool = createM2PlayerPool(314159)

    expect(pool.selectedPool).not.toBe(pool.auctionQueue)
    expect(new Set(ids(pool.selectedPool))).toEqual(
      new Set(ids(pool.auctionQueue)),
    )
    expect(ids(pool.selectedPool)).not.toEqual(ids(pool.auctionQueue))
  })

  it('selects exclusively by shuffled position with no balancing filters', () => {
    const players = normalPlayerCatalog.slice(0, 30)
    const forcedOrder = [...players].reverse()
    const random: RandomSource = {
      next: () => 0,
      int: () => 0,
      shuffle: <T>() => [...forcedOrder] as T[],
    }

    const selected = selectRandomPlayers(players, 25, random)

    expect(selected).toEqual(forcedOrder.slice(0, 25))
  })
})
