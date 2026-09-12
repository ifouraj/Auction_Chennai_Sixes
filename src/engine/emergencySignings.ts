import { punishmentPlayerCatalog } from '../data/punishmentPlayerCatalog'
import { TARGET_NORMAL_SQUAD_SIZE } from '../domain/constants'
import { assertValidPunishmentPlayerCatalog } from '../domain/playerValidation'
import type { Player, TeamId } from '../domain/types'
import { createRandomSource } from './random'

export interface EmergencyPlayerAssignment {
  readonly player: Player
  readonly source: 'EMERGENCY'
}

export interface EmergencyEligibleTeam {
  readonly teamId: TeamId
  readonly purchasedPlayerCount: number
  readonly emergencyPlayers: readonly EmergencyPlayerAssignment[]
}

export interface EmergencySigningEvent {
  readonly type: 'EMERGENCY_SIGNINGS'
  readonly teamId: TeamId
  readonly players: readonly EmergencyPlayerAssignment[]
}

export interface EmergencyAssignmentResult<T extends EmergencyEligibleTeam> {
  readonly teams: readonly T[]
  readonly events: readonly EmergencySigningEvent[]
}

/** Domain-separated from pool, Round 2, AI personality, and AI decision streams. */
export const EMERGENCY_SIGNINGS_SEED_DOMAIN = 0x4d10e911

export function assignEmergencyPlayers<T extends EmergencyEligibleTeam>(
  teams: readonly T[],
  seed: number,
  catalog: readonly Player[] = punishmentPlayerCatalog,
): EmergencyAssignmentResult<T> {
  if (!Number.isInteger(seed)) throw new Error('Random seed must be an integer')
  assertValidPunishmentPlayerCatalog(catalog)

  const required = teams.reduce(
    (total, team) =>
      total + Math.max(0, TARGET_NORMAL_SQUAD_SIZE - team.purchasedPlayerCount),
    0,
  )
  if (required > catalog.length) {
    throw new Error('Punishment player catalog cannot fill every incomplete squad')
  }

  const shuffled = createRandomSource(
    (seed ^ EMERGENCY_SIGNINGS_SEED_DOMAIN) | 0,
  ).shuffle(catalog)
  const events: EmergencySigningEvent[] = []
  let cursor = 0
  const assignedTeams = teams.map((team) => {
    const needed = Math.max(
      0,
      TARGET_NORMAL_SQUAD_SIZE - team.purchasedPlayerCount,
    )
    if (needed === 0) return team

    const players = shuffled.slice(cursor, cursor + needed).map((player) => ({
      player,
      source: 'EMERGENCY' as const,
    }))
    cursor += needed
    events.push({ type: 'EMERGENCY_SIGNINGS', teamId: team.teamId, players })
    return { ...team, emergencyPlayers: [...team.emergencyPlayers, ...players] }
  })

  return { teams: assignedTeams, events }
}
