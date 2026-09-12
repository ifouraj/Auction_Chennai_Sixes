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

    act(() => vi.advanceTimersByTime(AI_PRESENTATION_DELAY_MS))

    expect(store.getState().lastAiDecision).not.toBeNull()
    expect(store.getState().auction!.currentCard).not.toEqual(before)
    expect(store.getState().auction!.currentCard?.lastActionByTeamId['team-b'])
      .toMatch(/BID|PASS|NOT_INTERESTED/)
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
})
