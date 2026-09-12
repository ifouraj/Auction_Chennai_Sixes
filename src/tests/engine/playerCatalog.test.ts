import { describe, expect, it } from 'vitest'

import { normalPlayerCatalog } from '../../data/playerCatalog'
import { NORMAL_PLAYER_CATALOG_SIZE } from '../../domain/constants'
import { assertValidNormalPlayerCatalog } from '../../domain/playerValidation'

describe('normal player catalog', () => {
  it('contains exactly 50 valid NORMAL players', () => {
    expect(normalPlayerCatalog).toHaveLength(NORMAL_PLAYER_CATALOG_SIZE)
    expect(() => assertValidNormalPlayerCatalog(normalPlayerCatalog)).not.toThrow()
    expect(normalPlayerCatalog.every((player) => player.kind === 'NORMAL')).toBe(
      true,
    )
  })

  it('uses stable unique non-empty IDs', () => {
    const ids = normalPlayerCatalog.map((player) => player.id)

    expect(new Set(ids)).toHaveLength(NORMAL_PLAYER_CATALOG_SIZE)
    expect(ids.every((id) => id.length > 0)).toBe(true)
  })

  it('keeps every authored rating within the integer 0-100 range', () => {
    const ratings = normalPlayerCatalog.flatMap((player) => [
      player.batting,
      player.bowling,
      player.wicketKeeping,
      player.leadership,
      player.overall,
    ])

    expect(
      ratings.every(
        (rating) =>
          Number.isInteger(rating) && rating >= 0 && rating <= 100,
      ),
    ).toBe(true)
  })

  it('uses non-negative integer base prices', () => {
    expect(
      normalPlayerCatalog.every(
        (player) =>
          Number.isInteger(player.basePrice) && player.basePrice >= 0,
      ),
    ).toBe(true)
  })
})
