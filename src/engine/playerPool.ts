import { normalPlayerCatalog } from '../data/playerCatalog'
import { AUCTION_POOL_SIZE } from '../domain/constants'
import { assertValidNormalPlayerCatalog } from '../domain/playerValidation'
import type { Player, PlayerPool } from '../domain/types'
import { createRandomSource, type RandomSource } from './random'

export function selectRandomPlayers<T>(
  players: readonly T[],
  count: number,
  random: RandomSource,
): T[] {
  if (!Number.isInteger(count) || count < 0 || count > players.length) {
    throw new Error('Selection count must be an integer within the catalog size')
  }

  return random.shuffle(players).slice(0, count)
}

export function createM2PlayerPool(
  seed: number,
  catalog: readonly Player[] = normalPlayerCatalog,
): PlayerPool {
  assertValidNormalPlayerCatalog(catalog)

  const random = createRandomSource(seed)
  const selectedDraw = selectRandomPlayers(
    catalog,
    AUCTION_POOL_SIZE,
    random,
  )
  const catalogPosition = new Map(
    catalog.map((player, index) => [player.id, index]),
  )

  // Preserve catalog order for the public view so it cannot imply auction order.
  const selectedPool = [...selectedDraw].sort(
    (left, right) =>
      catalogPosition.get(left.id)! - catalogPosition.get(right.id)!,
  )
  const auctionQueue = random.shuffle(selectedDraw)

  return { selectedPool, auctionQueue }
}
