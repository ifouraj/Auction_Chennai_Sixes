import { describe, expect, it } from 'vitest'

import type { Player, SeatIndex, TeamId } from '../../domain/types'
import { calculateBestSix } from '../../engine/bestSix'
import type { MatchResult } from '../../engine/matchSimulator'
import {
  simulateTournament,
  type MatchSimulator,
  type TournamentTeamInput,
} from '../../engine/tournamentEngine'

function player(id: string, batting = 50, bowling = 50, wicketKeeping = 50, leadership = 50): Player {
  return { id, name: id, country: 'Test', age: 30, description: id, batting, bowling, wicketKeeping, leadership, overall: Math.round((batting + bowling + wicketKeeping + leadership) / 4), basePrice: 1, kind: 'NORMAL' }
}

function team(teamId: TeamId, seatIndex: SeatIndex, ratings = [50, 50, 50, 50]): TournamentTeamInput {
  return {
    teamId,
    seatIndex,
    bestSix: Array.from({ length: 6 }, (_, index) => player(
      `${teamId}-${index}`, ratings[0], ratings[1], ratings[2], ratings[3],
    )),
  }
}

const teams = () => [
  team('team-a', 0), team('team-b', 1), team('team-c', 2), team('team-d', 3),
] as const

function result(teamAId: TeamId, teamBId: TeamId, winnerTeamId: TeamId, seed: number): MatchResult {
  const loserTeamId = winnerTeamId === teamAId ? teamBId : teamAId
  return {
    matchId: `fake-${seed}`,
    seed,
    teamAId,
    teamBId,
    battingFirstTeamId: teamAId,
    firstInnings: { teamId: teamAId, runs: 50, wickets: 2, balls: 30, overs: '5.0', batting: [], bowling: [] },
    secondInnings: { teamId: teamBId, runs: winnerTeamId === teamBId ? 51 : 45, wickets: 3, balls: 30, overs: '5.0', batting: [], bowling: [] },
    winnerTeamId,
    loserTeamId,
    tiebreakRequired: false,
    margin: winnerTeamId === teamBId ? { type: 'WICKETS', value: 2 } : { type: 'RUNS', value: 5 },
    resultText: `${winnerTeamId} won`,
  }
}

function mappedSimulator(winners: Readonly<Record<string, TeamId>>): MatchSimulator {
  return (teamA, teamB, seed) => result(
    teamA.teamId,
    teamB.teamId,
    winners[`${teamA.teamId}|${teamB.teamId}`] ?? teamA.teamId,
    seed,
  )
}

describe('M12 tournament engine', () => {
  it('requires exactly four unique teams', () => {
    expect(() => simulateTournament(teams().slice(0, 3), 1)).toThrow('exactly four')
    expect(() => simulateTournament([teams()[0], teams()[0], teams()[2], teams()[3]], 1)).toThrow('unique')
  })

  it('creates six unique pairs, each pair once and each team three times', () => {
    const tournament = simulateTournament(teams(), 10)
    const pairs = tournament.leagueMatches.map(({ teamAId, teamBId }) => [teamAId, teamBId].sort().join('|'))
    expect(tournament.leagueMatches).toHaveLength(6)
    expect(new Set(pairs).size).toBe(6)
    for (const { teamId } of teams()) {
      expect(pairs.filter((pair) => pair.includes(teamId))).toHaveLength(3)
    }
  })

  it('awards two points per win, zero per loss, and never records a draw', () => {
    const tournament = simulateTournament(teams(), 11)
    for (const standing of tournament.standings) {
      expect(standing).toMatchObject({ played: 3, lost: 3 - standing.won, points: standing.won * 2 })
      expect(Object.hasOwn(standing, 'nrr')).toBe(false)
    }
    expect(tournament.leagueMatches.every(({ winnerTeamId, loserTeamId }) => winnerTeamId !== loserTeamId)).toBe(true)
  })

  it('sorts by points before strength', () => {
    const inputs = [team('team-a', 0, [100, 100, 100, 100]), ...teams().slice(1)]
    const simulator = mappedSimulator({
      'team-a|team-b': 'team-b', 'team-a|team-c': 'team-c', 'team-a|team-d': 'team-d',
    })
    const tournament = simulateTournament(inputs, 12, simulator)
    expect(tournament.standings.at(-1)?.teamId).toBe('team-a')
  })

  it.each([
    ['Overall', [60, 60, 60, 60], [50, 50, 50, 50]],
    ['BAT', [51, 50, 50, 50], [50, 50, 50, 50]],
    ['BOWL', [50, 51, 50, 50], [50, 50, 50, 50]],
    ['WK', [50, 50, 60, 50], [50, 50, 50, 50]],
    ['LEAD', [50, 50, 50, 60], [50, 50, 50, 50]],
  ])('uses %s in the strength tiebreak ladder', (_label, aRatings, bRatings) => {
    const inputs = [team('team-a', 0, aRatings), team('team-b', 1, bRatings), teams()[2], teams()[3]]
    const simulator = mappedSimulator({
      'team-a|team-b': 'team-b', 'team-a|team-c': 'team-a', 'team-a|team-d': 'team-a',
      'team-b|team-c': 'team-b', 'team-b|team-d': 'team-d',
    })
    const tied = simulateTournament(inputs, 13, simulator).standings.filter(({ points }) => points === 4)
    expect(tied.map(({ teamId }) => teamId)).toEqual(['team-a', 'team-b'])
  })

  it('uses seat order then team ID as its stable final fallback', () => {
    const inputs = [team('z-team', 0), team('a-team', 1), team('team-c', 2), team('team-d', 3)]
    const simulator = mappedSimulator({
      'z-team|a-team': 'a-team', 'z-team|team-c': 'z-team', 'z-team|team-d': 'z-team',
      'a-team|team-c': 'a-team', 'a-team|team-d': 'team-d',
    })
    const tied = simulateTournament(inputs, 14, simulator).standings.filter(({ points }) => points === 4)
    expect(tied.map(({ teamId }) => teamId)).toEqual(['z-team', 'a-team'])
  })

  it('qualifies exactly the top two, runs one final, and names winner and loser', () => {
    const tournament = simulateTournament(teams(), 15)
    expect(tournament.finalistTeamIds).toEqual(tournament.standings.slice(0, 2).map(({ teamId }) => teamId))
    expect(tournament.championTeamId).toBe(tournament.finalMatch.winnerTeamId)
    expect(tournament.runnerUpTeamId).toBe(tournament.finalMatch.loserTeamId)
    expect(tournament.finalMatch).toBeDefined()
  })

  it('is replayable, seed-sensitive, and assigns a distinct seed to all seven M11 calls', () => {
    expect(simulateTournament(teams(), 2026)).toEqual(simulateTournament(teams(), 2026))
    const outcomes = new Set(Array.from({ length: 40 }, (_, seed) => {
      const tournament = simulateTournament(teams(), seed)
      return `${tournament.championTeamId}:${tournament.leagueMatches.map(({ winnerTeamId }) => winnerTeamId).join(',')}`
    }))
    expect(outcomes.size).toBeGreaterThan(1)
    const tournament = simulateTournament(teams(), 2026)
    const seeds = [...tournament.leagueMatches, tournament.finalMatch].map(({ seed }) => seed)
    expect(new Set(seeds)).toHaveLength(7)
  })

  it('delegates all six league matches and the final to the M11 simulator', () => {
    const calls: string[] = []
    const simulator: MatchSimulator = (teamA, teamB, seed) => {
      calls.push(`${teamA.teamId}|${teamB.teamId}`)
      return result(teamA.teamId, teamB.teamId, teamA.teamId, seed)
    }
    const tournament = simulateTournament(teams(), 16, simulator)
    expect(calls).toHaveLength(7)
    expect(calls.slice(0, 6)).toEqual([
      'team-a|team-b', 'team-a|team-c', 'team-a|team-d',
      'team-b|team-c', 'team-b|team-d', 'team-c|team-d',
    ])
    expect(calls[6]).toBe(tournament.finalistTeamIds.join('|'))
  })

  it('accepts emergency players normally and consumes only an automatic Best Six from 7+ owned players', () => {
    const owned = Array.from({ length: 7 }, (_, index) => ({
      player: { ...player(`owned-${index}`, 30 + index), kind: index === 0 ? 'PUNISHMENT' as const : 'NORMAL' as const },
    }))
    const selected = calculateBestSix(owned)
    const selectedPlayers = owned.map(({ player: candidate }) => candidate).filter(({ id }) => selected.playerIds.includes(id))
    const inputs = [
      { teamId: 'team-a', seatIndex: 0 as const, bestSix: selectedPlayers },
      ...teams().slice(1),
    ]
    const tournament = simulateTournament(inputs, 17)
    expect(selected.isComplete).toBe(true)
    expect(selectedPlayers).toHaveLength(6)
    expect(tournament.leagueMatches.filter(({ teamAId, teamBId }) => teamAId === 'team-a' || teamBId === 'team-a')).toHaveLength(3)
  })

  it('exposes the compact complete public tournament result', () => {
    const tournament = simulateTournament(teams(), 18)
    expect(tournament).toMatchObject({
      tournamentId: expect.stringMatching(/^tournament-/),
      seed: 18,
      leagueMatches: expect.any(Array),
      standings: expect.any(Array),
      finalistTeamIds: expect.any(Array),
      finalMatch: expect.objectContaining({ matchId: expect.any(String) }),
      championTeamId: expect.any(String),
      runnerUpTeamId: expect.any(String),
    })
    expect(tournament.leagueMatches).toHaveLength(6)
  })
})
