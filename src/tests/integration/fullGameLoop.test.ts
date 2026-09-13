import { describe, expect, it } from 'vitest'

import { createAuctionHarnessStore } from '../../app/auctionStore'

describe('M12 seeded full V1 gameplay loop', () => {
  it('runs auction, emergency fill, Best Six, league, final, and champion', () => {
    const store = createAuctionHarnessStore(202612)
    store.getState().createGame(202612)
    expect(store.getState().stage).toBe('PRE_AUCTION')
    store.getState().startAuction()

    let ticks = 0
    while (store.getState().auction?.status === 'IN_PROGRESS' && ticks < 3_000) {
      store.getState().tick()
      ticks += 1
    }

    const auction = store.getState().auction!
    expect(auction.status).toBe('COMPLETE')
    expect(auction.emergencySignings.length).toBeGreaterThan(0)
    expect(auction.teams).toHaveLength(4)
    expect(auction.teams.every(({ availablePlayerCount }) => availablePlayerCount >= 6)).toBe(true)
    expect(auction.teams.every(({ bestSix }) => bestSix.isComplete && bestSix.playerIds.length === 6)).toBe(true)
    expect(store.getState().tournament?.revealedLeagueMatches).toHaveLength(1)
    expect(store.getState().tournament?.finalMatch).toBeNull()
    for (let step = 0; step < 13; step += 1) store.getState().advanceTournament()
    const tournament = store.getState().tournament!
    expect(tournament.revealedLeagueMatches).toHaveLength(6)
    expect(tournament.standings).toHaveLength(4)
    expect(tournament.finalistTeamIds).toEqual(tournament.standings.slice(0, 2).map(({ teamId }) => teamId))
    expect(tournament.championTeamId).toBe(tournament.finalMatch!.winnerTeamId)
    expect(tournament.runnerUpTeamId).toBe(tournament.finalMatch!.loserTeamId)

    const replay = createAuctionHarnessStore(202612)
    replay.getState().createGame(202612)
    replay.getState().startAuction()
    while (replay.getState().auction?.status === 'IN_PROGRESS') replay.getState().tick()
    for (let step = 0; step < 13; step += 1) replay.getState().advanceTournament()
    expect(replay.getState().tournament).toEqual(tournament)
  })
})
