import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_PRESENTATION_DELAY_MS } from '../domain/constants'
import { AuctionHarnessApp } from './App'
import { createAuctionHarnessStore } from './auctionStore'

function renderHarness(seed = 8675309) {
  const store = createAuctionHarnessStore(seed)
  const rendered = render(<AuctionHarnessApp store={store} />)
  return { store, ...rendered }
}

function createAndStart(seed = 8675309) {
  const harness = renderHarness(seed)
  fireEvent.click(screen.getByRole('button', { name: 'Start New Auction Game' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start Round 1' }))
  return harness
}

describe('M9 human vs AI auction harness', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('creates a game and shows all 25 public selected players', () => {
    const { store } = renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'Start New Auction Game' }))

    expect(store.getState().stage).toBe('PRE_AUCTION')
    expect(within(screen.getByRole('list', { name: 'Selected 25 players' })).getAllByRole('listitem')).toHaveLength(25)
    expect(screen.getByRole('button', { name: 'Start Round 1' })).toBeInTheDocument()
  })

  it('renders one human seat, three AI seats, current player, and no future-player hint', () => {
    const { store } = createAndStart()
    const auction = store.getState().auction!

    expect(auction.participants.map(({ kind }) => kind)).toEqual([
      'HUMAN_LOCAL', 'AI', 'AI', 'AI',
    ])
    expect(screen.getByRole('heading', { name: auction.currentCard!.player.name })).toBeInTheDocument()
    const teams = within(screen.getByLabelText('Four teams')).getAllByRole('article')
    expect(teams).toHaveLength(4)
    expect(within(teams[0]).getByText(/Seat 1 · Human/)).toBeInTheDocument()
    expect(within(teams[1]).getByText(/Seat 2 · AI/)).toBeInTheDocument()
    expect(screen.queryByText(/Up Next/i)).not.toBeInTheDocument()
  })

  it('keeps human controls enabled and routes a human bid through the engine', () => {
    const { store } = createAndStart()
    const openingBid = store.getState().auction!.currentCard!.basePrice!
    const controls = screen.getByLabelText('Auction controls')

    expect(within(controls).getByRole('button', { name: 'BID' })).toBeEnabled()
    expect(within(controls).getByRole('button', { name: 'PASS' })).toBeEnabled()
    expect(within(controls).getByRole('button', { name: 'NOT INTERESTED' })).toBeEnabled()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Bid amount' }), {
      target: { value: openingBid },
    })
    fireEvent.click(within(controls).getByRole('button', { name: 'BID' }))

    expect(store.getState().auction!.currentCard).toMatchObject({
      highestBid: openingBid,
      highestBidderId: 'team-a',
      activeTeamId: 'team-b',
    })
  })

  it('disables all human controls and shows deciding feedback during an AI turn', () => {
    createAndStart()
    fireEvent.click(screen.getByRole('button', { name: 'PASS' }))
    const controls = screen.getByLabelText('Auction controls')

    expect(screen.getByRole('status')).toHaveTextContent('Team B AI is deciding')
    expect(within(controls).getByRole('spinbutton', { name: 'Bid amount' })).toBeDisabled()
    expect(within(controls).getByRole('button', { name: 'BID' })).toBeDisabled()
    expect(within(controls).getByRole('button', { name: 'PASS' })).toBeDisabled()
    expect(within(controls).getByRole('button', { name: 'NOT INTERESTED' })).toBeDisabled()
  })

  it('automatically advances an AI turn after the presentation delay', () => {
    const { store } = createAndStart()
    fireEvent.click(screen.getByRole('button', { name: 'PASS' }))
    const before = structuredClone(store.getState().auction!.currentCard)

    act(() => vi.advanceTimersByTime(AI_PRESENTATION_DELAY_MS - 1))
    expect(store.getState().lastAiDecision).toBeNull()

    act(() => vi.advanceTimersByTime(1))

    expect(store.getState().lastAiDecision).not.toBeNull()
    expect(store.getState().auction!.currentCard).not.toEqual(before)
    expect(store.getState().auction!.currentCard?.lastActionByTeamId['team-b'])
      .toMatch(/BID|PASS|NOT_INTERESTED/)
  })

  it('marks the active seat clearly and moves current bid information beside the player', () => {
    const { store } = createAndStart()
    const auction = store.getState().auction!
    const card = auction.currentCard!
    const centralArea = screen.getByLabelText('Central auction area')
    const currentBid = within(centralArea).getByLabelText('Current bid')
    const activeSeat = screen.getByLabelText('Team A auction seat')

    expect(activeSeat).toHaveAttribute('data-active', 'true')
    expect(within(activeSeat).getByText('TURN')).toBeInTheDocument()
    expect(currentBid).toHaveTextContent('No bid yet')
    expect(currentBid).toHaveTextContent(`Opening at ₹${card.basePrice}`)
    expect(within(screen.getByLabelText('Auction controls')).queryByText('Current Bid')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Bid amount' }), {
      target: { value: card.basePrice },
    })
    fireEvent.click(screen.getByRole('button', { name: 'BID' }))

    expect(currentBid).toHaveTextContent(`₹${card.basePrice}`)
    expect(currentBid).toHaveTextContent('Team A leading')
    expect(screen.getByLabelText('Team B auction seat')).toHaveAttribute('data-active', 'true')
  })

  it('keeps a large history bounded, scrollable, complete, and pinned to its newest result', () => {
    const { store } = createAndStart(202613)

    act(() => {
      while ((store.getState().auction?.results.length ?? 0) < 1) {
        store.getState().tick()
      }
    })
    const history = screen.getByRole('list', { name: 'Auction history' })
    Object.defineProperty(history, 'scrollHeight', { configurable: true, value: 840 })

    act(() => {
      while ((store.getState().auction?.results.length ?? 0) < 2) {
        store.getState().tick()
      }
    })
    expect(history.scrollTop).toBe(840)

    act(() => {
      let ticks = 0
      while (store.getState().auction?.status === 'IN_PROGRESS' && ticks < 3_000) {
        store.getState().tick()
        ticks += 1
      }
    })

    const completedHistory = screen.getByRole('list', { name: 'Auction history' })
    const results = store.getState().auction!.results
    expect(completedHistory).toHaveStyle({ overflowY: 'auto' })
    expect(completedHistory.style.maxHeight).not.toBe('')
    expect(within(completedHistory).getAllByRole('listitem')).toHaveLength(results.length)
    expect(within(completedHistory).getAllByRole('listitem').at(-1)).toHaveTextContent(results.at(-1)!.player.name)
  })

  it('renders the Round 2 no-base opening state without inventing a leader', () => {
    const { store } = createAndStart(202614)

    act(() => {
      let ticks = 0
      while (store.getState().auction?.phase === 'ROUND_1' && ticks < 2_000) {
        store.getState().tick()
        ticks += 1
      }
    })

    expect(store.getState().auction).toMatchObject({ phase: 'ROUND_2', round: 2 })
    const centralArea = screen.getByLabelText('Central auction area')
    expect(within(centralArea).getByText('No base price')).toBeInTheDocument()
    expect(within(centralArea).getByText('Opening floor ₹1')).toBeInTheDocument()
    expect(within(centralArea).getByLabelText('Current bid')).toHaveTextContent('No bid yet')
    expect(within(centralArea).getByLabelText('Current bid')).toHaveTextContent('Open from ₹1')
    expect(within(centralArea).queryByText(/leading/i)).not.toBeInTheDocument()
  })

  it('keeps a full squad inspectable with ratings, free emergency labels, and Best Six badges', () => {
    const { store } = createAndStart(202610)
    act(() => {
      let ticks = 0
      while (store.getState().auction?.status === 'IN_PROGRESS' && ticks < 3_000) {
        store.getState().tick()
        ticks += 1
      }
    })

    const squad = screen.getByRole('list', { name: 'Team A purchased players' })
    expect(squad).toHaveStyle({ overflowY: 'auto' })
    expect(squad.style.maxHeight).not.toBe('')
    expect(within(squad).getAllByRole('listitem')).toHaveLength(6)
    expect(within(squad).getAllByText('FREE')).toHaveLength(6)
    expect(within(squad).getAllByText('BEST SIX')).toHaveLength(6)
    expect(within(squad).getAllByText(/BAT \d+ · BOWL \d+ · WK \d+ · LEAD \d+/)).toHaveLength(6)
  })

  it('keeps the authoritative ten-second timer functioning', () => {
    const { store } = createAndStart()
    expect(store.getState().auction!.turnTimer?.remainingSeconds).toBe(10)

    act(() => vi.advanceTimersByTime(1_000))

    expect(store.getState().auction!.turnTimer?.remainingSeconds).toBe(9)
  })

  it('rejects stale AI work after restart and cleans up timers on unmount', () => {
    const { store, unmount } = createAndStart()
    fireEvent.click(screen.getByRole('button', { name: 'PASS' }))
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'New Game' }))
    act(() => vi.advanceTimersByTime(AI_PRESENTATION_DELAY_MS * 2))
    expect(store.getState()).toMatchObject({
      stage: 'PRE_AUCTION',
      auction: null,
      lastAiDecision: null,
    })

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('visibly shows automatic emergency signings and marks them FREE without controls', () => {
    const { store } = createAndStart(202610)

    act(() => {
      let ticks = 0
      while (store.getState().auction?.status === 'IN_PROGRESS' && ticks < 3_000) {
        store.getState().tick()
        ticks += 1
      }
    })

    expect(store.getState().auction?.status).toBe('COMPLETE')
    const emergencyPanel = screen.getByRole('heading', {
      name: 'Emergency Signings',
    }).closest('section')!
    expect(emergencyPanel).toBeInTheDocument()
    expect(screen.getByText('Team A receives 6 emergency players')).toBeInTheDocument()
    expect(screen.getAllByText('FREE')).toHaveLength(6)
    expect(screen.getAllByText(/Emergency · Overall/)).toHaveLength(6)
    expect(screen.queryByLabelText('Auction controls')).not.toBeInTheDocument()
    expect(within(emergencyPanel).queryByRole('button')).not.toBeInTheDocument()
  })

  it('connects auction completion through Best Six to league, final, and champion', () => {
    const { store } = createAndStart(202611)

    act(() => {
      let ticks = 0
      while (store.getState().auction?.status === 'IN_PROGRESS' && ticks < 3_000) {
        store.getState().tick()
        ticks += 1
      }
    })

    const tournament = store.getState().tournament!
    expect(tournament).not.toBeNull()
    expect(store.getState().auction?.teams.every(({ bestSix }) => bestSix.isComplete)).toBe(true)
    expect(screen.getByRole('heading', { name: 'League Matches' })).toBeInTheDocument()
    expect(within(screen.getByLabelText('Six league matches')).getAllByRole('article')).toHaveLength(6)
    expect(screen.getByRole('table', { name: 'League standings' })).toBeInTheDocument()
    expect(screen.getByText(/^1st ·/)).toHaveTextContent('vs 2nd ·')
    expect(screen.getByRole('article', { name: 'Final match' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Tournament champion' })).toHaveTextContent('CHAMPION — TEAM')
    expect(screen.getByRole('button', { name: 'PLAY AGAIN' })).toBeInTheDocument()
    expect(tournament.leagueMatches).toHaveLength(6)
    expect(tournament.finalMatch.winnerTeamId).toBe(tournament.championTeamId)
    expect(tournament.finalMatch.loserTeamId).toBe(tournament.runnerUpTeamId)
    expect(tournament.standings.map(({ position }) => position)).toEqual([1, 2, 3, 4])
  })

  it('Play Again starts a fresh game through the existing reset path', () => {
    const { store } = createAndStart(202612)
    act(() => {
      let ticks = 0
      while (store.getState().auction?.status === 'IN_PROGRESS' && ticks < 3_000) {
        store.getState().tick()
        ticks += 1
      }
    })
    const oldGameId = store.getState().gameId
    fireEvent.click(screen.getByRole('button', { name: 'PLAY AGAIN' }))
    expect(store.getState()).toMatchObject({
      stage: 'PRE_AUCTION', auction: null, tournament: null, gameId: oldGameId + 1,
    })
    expect(screen.getByRole('button', { name: 'Start Round 1' })).toBeInTheDocument()
  })
})
