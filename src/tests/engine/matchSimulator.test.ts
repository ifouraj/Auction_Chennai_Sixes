import { describe, expect, it } from 'vitest'

import type { Player } from '../../domain/types'
import {
  MATCH_SIMULATION_CONFIG,
  simulateMatch,
  type MatchResult,
  type MatchTeamInput,
} from '../../engine/matchSimulator'

function player(
  id: string,
  batting: number,
  bowling: number,
  wicketKeeping: number,
  leadership: number,
  kind: Player['kind'] = 'NORMAL',
): Player {
  return {
    id,
    name: id,
    country: 'Test',
    age: 25,
    description: 'Simulator fixture',
    batting,
    bowling,
    wicketKeeping,
    leadership,
    overall: Math.round((batting + bowling + wicketKeeping + leadership) / 4),
    basePrice: kind === 'PUNISHMENT' ? 0 : 1,
    kind,
  }
}

function team(
  teamId: string,
  batting = 50,
  bowling = 50,
  wicketKeeping = 50,
  leadership = 50,
  kind: Player['kind'] = 'NORMAL',
): MatchTeamInput {
  return {
    teamId,
    bestSix: Array.from({ length: 6 }, (_, index) => player(
      `${teamId}-player-${index}`,
      batting,
      bowling,
      wicketKeeping,
      leadership,
      kind,
    )),
  }
}

function results(
  teamA: MatchTeamInput,
  teamB: MatchTeamInput,
  count = 1_000,
): MatchResult[] {
  return Array.from({ length: count }, (_, seed) => simulateMatch(teamA, teamB, seed))
}

function firstInningsAverage(
  battingTeam: MatchTeamInput,
  opponent: MatchTeamInput,
  count = 2_000,
): number {
  const innings = results(battingTeam, opponent, count)
    .filter(({ firstInnings }) => firstInnings.teamId === battingTeam.teamId)
    .map(({ firstInnings }) => firstInnings.runs)
  return innings.reduce((sum, runs) => sum + runs, 0) / innings.length
}

describe('M11 deterministic Sixes match simulator', () => {
  it('returns an identical match for the same Best Six and seed', () => {
    const teamA = team('team-a', 70, 55, 60, 65)
    const teamB = team('team-b', 58, 72, 75, 50)

    expect(simulateMatch(teamA, teamB, 445566))
      .toEqual(simulateMatch(teamA, teamB, 445566))
  })

  it('allows different seeds to produce different plausible results', () => {
    const teamA = team('team-a')
    const teamB = team('team-b')
    const variants = new Set(results(teamA, teamB, 30).map((result) =>
      `${result.battingFirstTeamId}:${result.firstInnings.runs}:${result.secondInnings.runs}:${result.winnerTeamId}`,
    ))

    expect(variants.size).toBeGreaterThan(5)
  })

  it('selects batting first deterministically and can select either team', () => {
    const teamA = team('team-a')
    const teamB = team('team-b')
    const first = simulateMatch(teamA, teamB, 99).battingFirstTeamId

    expect(simulateMatch(teamA, teamB, 99).battingFirstTeamId).toBe(first)
    expect(new Set(results(teamA, teamB, 40).map(({ battingFirstTeamId }) => battingFirstTeamId)))
      .toEqual(new Set(['team-a', 'team-b']))
  })

  it('always returns exactly one winner and legal five-over innings', () => {
    for (const result of results(team('team-a'), team('team-b'), 500)) {
      expect(result.winnerTeamId).not.toBe(result.loserTeamId)
      expect([result.teamAId, result.teamBId]).toContain(result.winnerTeamId)
      expect([result.teamAId, result.teamBId]).toContain(result.loserTeamId)
      expect(result.firstInnings.balls).toBeLessThanOrEqual(30)
      expect(result.secondInnings.balls).toBeLessThanOrEqual(30)
      expect(result.firstInnings.wickets).toBeLessThanOrEqual(5)
      expect(result.secondInnings.wickets).toBeLessThanOrEqual(5)
    }
  })

  it('stops a successful chase immediately after the target is passed', () => {
    const successfulChases = results(team('team-a'), team('team-b'), 500)
      .filter(({ secondInnings, firstInnings }) => secondInnings.runs > firstInnings.runs)

    expect(successfulChases.some(({ secondInnings }) => secondInnings.balls < 30)).toBe(true)
    expect(successfulChases.every(({ secondInnings, firstInnings }) =>
      secondInnings.runs > firstInnings.runs && secondInnings.balls <= 30,
    )).toBe(true)
  })

  it('publishes deterministic individual scorecards that reconcile with innings totals', () => {
    const result = simulateMatch(team('team-a'), team('team-b'), 1234)

    expect(result).toMatchObject({
      matchId: expect.stringMatching(/^match-/),
      seed: 1234,
      teamAId: 'team-a',
      teamBId: 'team-b',
      battingFirstTeamId: expect.any(String),
      firstInnings: {
        runs: expect.any(Number), wickets: expect.any(Number),
        balls: expect.any(Number), overs: expect.stringMatching(/^\d\.\d$/),
      },
      secondInnings: {
        runs: expect.any(Number), wickets: expect.any(Number),
        balls: expect.any(Number), overs: expect.stringMatching(/^\d\.\d$/),
      },
      winnerTeamId: expect.any(String),
      loserTeamId: expect.any(String),
      tiebreakRequired: expect.any(Boolean),
      resultText: expect.any(String),
    })
    for (const innings of [result.firstInnings, result.secondInnings]) {
      expect(innings.batting.reduce((sum, batter) => sum + batter.runs, 0)).toBe(innings.runs)
      expect(innings.bowling.reduce((sum, bowler) => sum + bowler.wickets, 0)).toBe(innings.wickets)
      expect(innings.bowling.reduce((sum, bowler) => sum + bowler.runsConceded, 0)).toBe(innings.runs)
      expect(innings.bowling.reduce((sum, bowler) => sum + bowler.balls, 0)).toBe(innings.balls)
    }
  })

  it('invokes a deterministic decisive tiebreak when regulation totals tie', () => {
    const teamA = team('team-a')
    const teamB = team('team-b')
    const tied = results(teamA, teamB, 3_000).find(({ tiebreakRequired }) => tiebreakRequired)

    expect(tied).toBeDefined()
    expect(tied!.firstInnings.runs).toBe(tied!.secondInnings.runs)
    expect(tied!.margin).toEqual({ type: 'TIEBREAK', value: null })
    expect(simulateMatch(teamA, teamB, tied!.seed)).toEqual(tied)
    expect([teamA.teamId, teamB.teamId]).toContain(tied!.winnerTeamId)
  })

  it('accepts emergency players with no simulator-specific penalty or branch', () => {
    const emergency = team('team-a', 35, 30, 25, 20, 'PUNISHMENT')
    const sameRatingsNormal = team('team-a', 35, 30, 25, 20, 'NORMAL')
    const opponent = team('team-b', 50, 50, 50, 50)

    expect(simulateMatch(emergency, opponent, 8080))
      .toEqual(simulateMatch(sameRatingsNormal, opponent, 8080))
  })

  it('requires two distinct completed Best Six inputs', () => {
    expect(() => simulateMatch(
      { teamId: 'team-a', bestSix: team('team-a').bestSix.slice(0, 5) },
      team('team-b'),
      1,
    )).toThrow(/complete automatic Best Six/)
    expect(() => simulateMatch(team('team-a'), team('team-a'), 1))
      .toThrow(/different teams/)
  })
})

describe('M11 deterministic statistical validation', () => {
  it('makes stronger batting score more against the same defense', () => {
    const defense = team('defense', 50, 55, 55, 50)
    const weakAverage = firstInningsAverage(team('weak-bat', 25, 50, 50, 50), defense)
    const strongAverage = firstInningsAverage(team('strong-bat', 85, 50, 50, 50), defense)

    expect(strongAverage).toBeGreaterThan(weakAverage + 12)
  })

  it('makes stronger bowling suppress the same opposition batting', () => {
    const batting = team('batting', 62, 50, 50, 50)
    const weakDefenseAverage = firstInningsAverage(batting, team('weak-bowl', 50, 25, 50, 50))
    const strongDefenseAverage = firstInningsAverage(batting, team('strong-bowl', 50, 85, 50, 50))

    expect(strongDefenseAverage).toBeLessThan(weakDefenseAverage - 12)
  })

  it('gives wicket keeping a modest controlled defensive effect', () => {
    const batting = team('batting', 60, 50, 50, 50)
    const poorKeeping = firstInningsAverage(batting, team('poor-wk', 50, 55, 0, 50))
    const eliteKeeping = firstInningsAverage(batting, team('elite-wk', 50, 55, 100, 50))

    expect(eliteKeeping).toBeLessThan(poorKeeping)
    expect(poorKeeping - eliteKeeping).toBeLessThan(8)
  })

  it('keeps leadership useful but materially weaker than BAT/BOWL', () => {
    const defense = team('defense', 50, 55, 55, 50)
    const lowLead = firstInningsAverage(team('low-lead', 55, 50, 50, 0), defense)
    const highLead = firstInningsAverage(team('high-lead', 55, 50, 50, 100), defense)
    const lowBat = firstInningsAverage(team('low-bat', 25, 50, 50, 50), defense)
    const highBat = firstInningsAverage(team('high-bat', 85, 50, 50, 50), defense)

    expect(highLead).toBeGreaterThan(lowLead)
    expect(highLead - lowLead).toBeLessThan((highBat - lowBat) * 0.5)
  })

  it('keeps equal teams broadly balanced over many seeds', () => {
    const sample = results(team('team-a'), team('team-b'), 2_000)
    const teamAWins = sample.filter(({ winnerTeamId }) => winnerTeamId === 'team-a').length
    const rate = teamAWins / sample.length

    expect(rate).toBeGreaterThan(0.45)
    expect(rate).toBeLessThan(0.55)
  })

  it('makes a clearly stronger team win a substantial majority', () => {
    const sample = results(
      team('strong', 82, 82, 78, 76),
      team('average', 50, 50, 50, 50),
      2_000,
    )
    const rate = sample.filter(({ winnerTeamId }) => winnerTeamId === 'strong').length / sample.length

    expect(rate).toBeGreaterThan(0.7)
    expect(rate).toBeLessThan(0.92)
  })

  it('heavily favors an extreme mismatch while retaining some upsets', () => {
    const sample = results(
      team('extreme-strong', 100, 100, 100, 100),
      team('extreme-weak', 0, 0, 0, 0),
      3_000,
    )
    const strongWins = sample.filter(({ winnerTeamId }) => winnerTeamId === 'extreme-strong').length
    const rate = strongWins / sample.length

    expect(rate).toBeGreaterThan(0.88)
    expect(rate).toBeLessThan(0.99)
    expect(strongWins).toBeLessThan(sample.length)
  })

  it('centralizes the locked five-over format and tuning coefficients', () => {
    expect(MATCH_SIMULATION_CONFIG).toMatchObject({
      oversPerInnings: 5,
      ballsPerOver: 6,
      playersPerTeam: 6,
      baseOutcomeWeights: expect.any(Object),
      matchupLogit: expect.any(Object),
      wicketKeepingLogit: expect.any(Object),
    })
  })
})
