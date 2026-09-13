import {
  MINIMUM_LEGAL_MONEY_UNIT,
  MINIMUM_PUNISHMENT_PLAYER_CATALOG_SIZE,
  NORMAL_PLAYER_CATALOG_SIZE,
} from './constants'
import type { Player } from './types'

const ratingFields = [
  'batting',
  'bowling',
  'wicketKeeping',
  'leadership',
  'overall',
] as const

export function assertValidNormalPlayerCatalog(
  catalog: readonly Player[],
): void {
  if (catalog.length !== NORMAL_PLAYER_CATALOG_SIZE) {
    throw new Error(
      `Normal player catalog must contain exactly ${NORMAL_PLAYER_CATALOG_SIZE} players`,
    )
  }

  const ids = new Set<string>()

  for (const player of catalog) {
    if (player.kind !== 'NORMAL') {
      throw new Error(`Normal catalog contains non-normal player: ${player.id}`)
    }

    if (!player.id.trim()) {
      throw new Error('Every normal player must have a non-empty ID')
    }

    if (ids.has(player.id)) {
      throw new Error(`Duplicate player ID: ${player.id}`)
    }
    ids.add(player.id)

    if (!player.name.trim() || !player.country.trim() || !player.description.trim()) {
      throw new Error(`Player ${player.id} has incomplete identity data`)
    }

    if (!Number.isInteger(player.age) || player.age < 0) {
      throw new Error(`Player ${player.id} has an invalid age`)
    }

    for (const field of ratingFields) {
      const rating = player[field]
      if (!Number.isInteger(rating) || rating < 0 || rating > 100) {
        throw new Error(`Player ${player.id} has an invalid ${field} rating`)
      }
    }

    if (!Number.isInteger(player.basePrice) || player.basePrice < 0 ||
      player.basePrice % MINIMUM_LEGAL_MONEY_UNIT !== 0) {
      throw new Error(`Player ${player.id} has an invalid base price`)
    }

    if (player.imageRef !== undefined && !player.imageRef.trim()) {
      throw new Error(`Player ${player.id} has an empty image reference`)
    }
  }
}

export function assertValidPunishmentPlayerCatalog(
  catalog: readonly Player[],
): void {
  if (catalog.length < MINIMUM_PUNISHMENT_PLAYER_CATALOG_SIZE) {
    throw new Error(
      `Punishment player catalog must contain at least ${MINIMUM_PUNISHMENT_PLAYER_CATALOG_SIZE} players`,
    )
  }

  const ids = new Set<string>()
  for (const player of catalog) {
    if (player.kind !== 'PUNISHMENT') {
      throw new Error(`Punishment catalog contains non-punishment player: ${player.id}`)
    }
    if (!player.id.trim() || ids.has(player.id)) {
      throw new Error(`Invalid or duplicate punishment player ID: ${player.id}`)
    }
    ids.add(player.id)
    if (!player.name.trim() || !player.country.trim() || !player.description.trim()) {
      throw new Error(`Player ${player.id} has incomplete identity data`)
    }
    if (!Number.isInteger(player.age) || player.age < 0) {
      throw new Error(`Player ${player.id} has an invalid age`)
    }
    for (const field of ratingFields) {
      const rating = player[field]
      if (!Number.isInteger(rating) || rating < 0 || rating > 100) {
        throw new Error(`Player ${player.id} has an invalid ${field} rating`)
      }
    }
    if (player.basePrice !== 0) {
      throw new Error(`Punishment player ${player.id} must be free`)
    }
    if (player.imageRef !== undefined && !player.imageRef.trim()) {
      throw new Error(`Player ${player.id} has an empty image reference`)
    }
  }
}
