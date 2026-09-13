import type { Player, SeatIndex, TeamId } from '../domain/types'
import { simulateMatch, type MatchResult, type MatchTeamInput } from './matchSimulator'
import { calculateTeamStrength, type SquadStrength } from './teamStrength'

export interface TournamentTeamInput extends MatchTeamInput {
  readonly seatIndex: SeatIndex
  readonly bestSix: readonly Player[]
}

export interface LeagueStanding {
  readonly position: number
  readonly teamId: TeamId
  readonly played: number
  readonly won: number
  readonly lost: number
  readonly points: number
  /** Snapshot of the automatic Best Six strength used for deterministic ties. */
  readonly strength: SquadStrength
}

export interface TournamentResult {
  readonly tournamentId: string
  readonly seed: number
  readonly leagueMatches: readonly MatchResult[]
  readonly standings: readonly LeagueStanding[]
  readonly finalistTeamIds: readonly [TeamId, TeamId]
  readonly finalMatch: MatchResult
  readonly championTeamId: TeamId
  readonly runnerUpTeamId: TeamId
}

export type MatchSimulator = (
  teamA: MatchTeamInput,
  teamB: MatchTeamInput,
  seed: number,
) => MatchResult

const LEAGUE_SEED_DOMAIN = 0x4c454147
const FINAL_SEED_DOMAIN = 0x46494e4c
const TOURNAMENT_ID_DOMAIN = 0x4d313269

function hashText(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash | 0
}

function orderedTeams(teams: readonly TournamentTeamInput[]): TournamentTeamInput[] {
  return [...teams].sort((left, right) =>
    left.seatIndex - right.seatIndex || left.teamId.localeCompare(right.teamId),
  )
}

function assertTournamentTeams(teams: readonly TournamentTeamInput[]): void {
  if (teams.length !== 4) throw new Error('Tournament requires exactly four teams')
  if (new Set(teams.map(({ teamId }) => teamId)).size !== 4) {
    throw new Error('Tournament team IDs must be unique')
  }
  if (new Set(teams.map(({ seatIndex }) => seatIndex)).size !== 4) {
    throw new Error('Tournament seat indexes must be unique')
  }
}

function deriveSeed(
  tournamentSeed: number,
  domain: number,
  sequence: number,
  teamAId: TeamId,
  teamBId: TeamId,
  used: Set<number>,
): number {
  let candidate = (
    tournamentSeed
    ^ domain
    ^ Math.imul(sequence + 1, 0x9e3779b9)
    ^ hashText(`${teamAId}|${teamBId}`)
  ) | 0
  while (used.has(candidate)) candidate = (candidate + 1) | 0
  used.add(candidate)
  return candidate
}

function compareStanding(
  left: LeagueStanding & { readonly seatIndex: SeatIndex },
  right: LeagueStanding & { readonly seatIndex: SeatIndex },
): number {
  return right.points - left.points
    || right.strength.overall - left.strength.overall
    || right.strength.batting - left.strength.batting
    || right.strength.bowling - left.strength.bowling
    || right.strength.wicketKeeping - left.strength.wicketKeeping
    || right.strength.leadership - left.strength.leadership
    || left.seatIndex - right.seatIndex
    || left.teamId.localeCompare(right.teamId)
}

/** Builds the public table after any revealed prefix of the six league games. */
export function calculateLeagueStandings(
  teams: readonly TournamentTeamInput[],
  leagueMatches: readonly MatchResult[],
): readonly LeagueStanding[] {
  assertTournamentTeams(teams)
  const participants = orderedTeams(teams)
  const participantIds = new Set(participants.map(({ teamId }) => teamId))
  if (leagueMatches.some(({ teamAId, teamBId }) =>
    !participantIds.has(teamAId) || !participantIds.has(teamBId),
  )) throw new Error('League result contains an unknown tournament team')

  const table = participants.map((team) => {
    const matches = leagueMatches.filter((match) =>
      match.teamAId === team.teamId || match.teamBId === team.teamId,
    )
    const won = matches.filter(({ winnerTeamId }) => winnerTeamId === team.teamId).length
    return {
      position: 0,
      teamId: team.teamId,
      played: matches.length,
      won,
      lost: matches.length - won,
      points: won * 2,
      strength: calculateTeamStrength(team.bestSix.map((player) => ({ player }))),
      seatIndex: team.seatIndex,
    }
  }).sort(compareStanding)

  return table.map((standing, index) => ({
    position: index + 1,
    teamId: standing.teamId,
    played: standing.played,
    won: standing.won,
    lost: standing.lost,
    points: standing.points,
    strength: standing.strength,
  }))
}

function tournamentIdentifier(seed: number, teams: readonly TournamentTeamInput[]): string {
  const identity = orderedTeams(teams).map((team) => [
    team.teamId,
    team.seatIndex,
    ...team.bestSix.map(({ id, batting, bowling, wicketKeeping, leadership }) =>
      `${id}:${batting}:${bowling}:${wicketKeeping}:${leadership}`,
    ).sort(),
  ].join(':')).join('|')
  return `tournament-${((seed ^ TOURNAMENT_ID_DOMAIN ^ hashText(identity)) >>> 0)
    .toString(16).padStart(8, '0')}`
}

/**
 * Runs the complete M12 league and final by orchestrating the authoritative
 * M11 match simulator. It contains no cricket scoring rules of its own.
 */
export function simulateTournament(
  teams: readonly TournamentTeamInput[],
  seed: number,
  matchSimulator: MatchSimulator = simulateMatch,
): TournamentResult {
  if (!Number.isInteger(seed)) throw new Error('Tournament seed must be an integer')
  assertTournamentTeams(teams)
  const participants = orderedTeams(teams)
  const usedSeeds = new Set<number>()
  const leagueMatches: MatchResult[] = []

  for (let left = 0; left < participants.length - 1; left += 1) {
    for (let right = left + 1; right < participants.length; right += 1) {
      const teamA = participants[left]
      const teamB = participants[right]
      leagueMatches.push(matchSimulator(
        teamA,
        teamB,
        deriveSeed(seed, LEAGUE_SEED_DOMAIN, leagueMatches.length, teamA.teamId, teamB.teamId, usedSeeds),
      ))
    }
  }

  const standings = calculateLeagueStandings(participants, leagueMatches)

  const finalistTeamIds = [standings[0].teamId, standings[1].teamId] as const
  const finalistA = participants.find(({ teamId }) => teamId === finalistTeamIds[0])!
  const finalistB = participants.find(({ teamId }) => teamId === finalistTeamIds[1])!
  const finalMatch = matchSimulator(
    finalistA,
    finalistB,
    deriveSeed(seed, FINAL_SEED_DOMAIN, leagueMatches.length, finalistA.teamId, finalistB.teamId, usedSeeds),
  )

  return {
    tournamentId: tournamentIdentifier(seed, participants),
    seed,
    leagueMatches,
    standings,
    finalistTeamIds,
    finalMatch,
    championTeamId: finalMatch.winnerTeamId,
    runnerUpTeamId: finalMatch.loserTeamId,
  }
}
