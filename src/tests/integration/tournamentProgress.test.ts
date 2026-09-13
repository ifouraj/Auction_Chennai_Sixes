import { describe, expect, it } from 'vitest'

import { createAuctionHarnessStore } from '../../app/auctionStore'
import { simulateTournament, type TournamentTeamInput } from '../../engine/tournamentEngine'

function completedStore(seed: number) {
  const store = createAuctionHarnessStore(seed)
  store.getState().createGame(seed)
  store.getState().startAuction()
  let ticks = 0
  while (store.getState().auction?.status === 'IN_PROGRESS' && ticks < 4_000) {
    store.getState().tick()
    ticks += 1
  }
  expect(store.getState().auction?.status).toBe('COMPLETE')
  return store
}

function tournamentInputs(store: ReturnType<typeof completedStore>): readonly TournamentTeamInput[] {
  const auction = store.getState().auction!
  return auction.teams.map((team) => {
    const participant = auction.participants.find(({ teamId }) => teamId === team.teamId)!
    const selectedIds = new Set(team.bestSix.playerIds)
    const bestSix = [...team.purchasedPlayers, ...team.emergencyPlayers]
      .map(({ player }) => player)
      .filter(({ id }) => selectedIds.has(id))
    return { teamId: team.teamId, seatIndex: participant.seatIndex, bestSix }
  })
}

describe('progressive public tournament state', () => {
  it('reveals one league result and its updated standings per manual advance', () => {
    const store = completedStore(202611)
    const completeResult = simulateTournament(tournamentInputs(store), 202611)
    expect(store.getState().tournament).toMatchObject({
      stage: 'LEAGUE',
      revealedLeagueMatches: [expect.any(Object)],
      finalistTeamIds: null,
      finalMatch: null,
      championTeamId: null,
    })
    const initialSnapshot = JSON.stringify(store.getState().tournament)
    completeResult.leagueMatches.slice(1).forEach(({ matchId, resultText }) => {
      expect(initialSnapshot).not.toContain(matchId)
      expect(initialSnapshot).not.toContain(resultText)
    })
    expect(initialSnapshot).not.toContain(completeResult.finalMatch.matchId)

    for (let count = 2; count <= 6; count += 1) {
      const previousIds = store.getState().tournament!.revealedLeagueMatches.map(({ matchId }) => matchId)
      store.getState().advanceTournament()
      const progress = store.getState().tournament!
      expect(progress.revealedLeagueMatches).toHaveLength(count)
      expect(progress.revealedLeagueMatches.slice(0, -1).map(({ matchId }) => matchId)).toEqual(previousIds)
      expect(progress.standings.reduce((sum, standing) => sum + standing.played, 0)).toBe(count * 2)
      expect(progress.standings.reduce((sum, standing) => sum + standing.won, 0)).toBe(count)
      expect(progress.finalMatch).toBeNull()
    }

    expect(store.getState().tournament?.stage).toBe('LEAGUE_COMPLETE')
    expect(store.getState().tournament?.finalistTeamIds).toEqual(
      store.getState().tournament?.standings.slice(0, 2).map(({ teamId }) => teamId),
    )
    expect(store.getState().tournament?.revealedLeagueMatches).toEqual(completeResult.leagueMatches)
    expect(store.getState().tournament?.standings).toEqual(completeResult.standings)
  })

  it('supports both human knockout and finalist flows before revealing the champion', () => {
    const flows = new Map<boolean, { store: ReturnType<typeof completedStore>; seed: number }>()
    for (let seed = 1; seed <= 20 && flows.size < 2; seed += 1) {
      const store = completedStore(seed)
      for (let step = 0; step < 5; step += 1) store.getState().advanceTournament()
      const qualified = store.getState().tournament!.finalistTeamIds!.includes('team-a')
      if (!flows.has(qualified)) flows.set(qualified, { store, seed })
    }
    expect([...flows.keys()].sort()).toEqual([false, true])

    for (const [humanQualified, { store, seed }] of flows) {
      const completeResult = simulateTournament(tournamentInputs(store), seed)
      store.getState().advanceTournament()
      expect(store.getState().tournament).toMatchObject({ stage: 'FINAL_READY', finalMatch: null })
      expect(store.getState().tournament!.finalistTeamIds!.includes('team-a')).toBe(humanQualified)
      expect(JSON.stringify(store.getState().tournament)).not.toContain(completeResult.finalMatch.matchId)
      store.getState().advanceTournament()
      const complete = store.getState().tournament!
      expect(complete.stage).toBe('GAME_OVER')
      expect(complete.championTeamId).toBe(complete.finalMatch!.winnerTeamId)
      expect(complete.runnerUpTeamId).toBe(complete.finalMatch!.loserTeamId)
      expect(complete.finalMatch).toEqual(completeResult.finalMatch)
      if (humanQualified) {
        expect([complete.championTeamId, complete.runnerUpTeamId]).toContain('team-a')
      } else {
        expect(complete.finalistTeamIds).not.toContain('team-a')
      }
    }
  })
})
