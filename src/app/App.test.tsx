import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuctionHarnessApp } from './App'
import { createAuctionHarnessStore } from './auctionStore'

function renderHarness(seed = 8675309) {
  const store = createAuctionHarnessStore(seed)
  render(<AuctionHarnessApp store={store} />)
  return store
}

function createAndStart(seed = 8675309) {
  const store = renderHarness(seed)
  fireEvent.click(screen.getByRole('button', { name: 'Start New Auction Game' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start Round 1' }))
  return store
}

function passCurrentCard(store: ReturnType<typeof createAuctionHarnessStore>) {
  const startingResultCount = store.getState().auction!.results.length
  while (store.getState().auction!.results.length === startingResultCount) {
    store.getState().pass()
  }
}

describe('M6.5 auction harness', () => {
  it('creates a game and shows all 25 selected players before auction', () => {
    const store = renderHarness()

    fireEvent.click(screen.getByRole('button', { name: 'Start New Auction Game' }))

    expect(store.getState().stage).toBe('PRE_AUCTION')
    expect(within(screen.getByRole('list', { name: 'Selected 25 players' })).getAllByRole('listitem')).toHaveLength(25)
    expect(screen.getByRole('button', { name: 'Start Round 1' })).toBeInTheDocument()
  })

  it('starts the engine and renders the current player, four teams, and active participant', () => {
    const store = createAndStart()
    const auction = store.getState().auction!

    expect(auction.phase).toBe('ROUND_1')
    expect(screen.getByRole('heading', { name: auction.currentCard!.player.name })).toBeInTheDocument()
    expect(within(screen.getByLabelText('Auction controls')).getByText('Team A')).toBeInTheDocument()
    const teams = within(screen.getByLabelText('Four teams')).getAllByRole('article')
    expect(teams).toHaveLength(4)
    expect(within(teams[0]).getByLabelText('Seconds remaining')).toHaveTextContent('10s')
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveLength(4)
    expect(screen.getByRole('heading', { name: 'Auction History' })).toBeInTheDocument()
    expect(screen.queryByText(/Up Next/i)).not.toBeInTheDocument()
  })

  it('dispatches BID, PASS, and NOT INTERESTED through the engine', () => {
    const store = createAndStart()
    const openingBid = store.getState().auction!.currentCard!.basePrice!

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Bid amount' }), { target: { value: openingBid } })
    fireEvent.click(screen.getByRole('button', { name: 'BID' }))
    expect(store.getState().auction!.currentCard).toMatchObject({ highestBid: openingBid, highestBidderId: 'team-a', activeTeamId: 'team-b' })

    fireEvent.click(screen.getByRole('button', { name: 'PASS' }))
    expect(store.getState().auction!.currentCard!.passedThisCycleTeamIds).toContain('team-b')

    fireEvent.click(screen.getByRole('button', { name: 'NOT INTERESTED' }))
    expect(store.getState().auction!.currentCard!.notInterestedTeamIds).toContain('team-c')
  })

  it('displays engine validation feedback for an invalid bid', () => {
    const store = createAndStart()
    const basePrice = store.getState().auction!.currentCard!.basePrice!

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Bid amount' }), { target: { value: basePrice - 1 } })
    fireEvent.click(screen.getByRole('button', { name: 'BID' }))

    expect(screen.getByRole('alert')).toHaveTextContent('below the Round 1 base price')
    expect(store.getState().auction!.currentCard!.highestBid).toBeNull()
  })

  it('shows a SOLD result and updated buyer squad', () => {
    const store = createAndStart()
    const player = store.getState().auction!.currentCard!.player
    const price = store.getState().auction!.currentCard!.basePrice!

    fireEvent.click(screen.getByRole('button', { name: 'BID' }))
    fireEvent.click(screen.getByRole('button', { name: 'PASS' }))
    fireEvent.click(screen.getByRole('button', { name: 'PASS' }))
    fireEvent.click(screen.getByRole('button', { name: 'PASS' }))

    expect(screen.getByText(new RegExp(`SOLD: ${player.name} to Team A for ${price}`))).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Team A purchased players' })).getByText(new RegExp(player.name))).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Auction history' })).getByText(player.name)).toBeInTheDocument()

    fireEvent.click(within(screen.getByLabelText('Four teams')).getByRole('button', { name: /Team B/ }))
    expect(screen.getByRole('combobox', { name: 'Team' })).toHaveValue('team-b')
    expect(screen.getByText('No players purchased yet.')).toBeInTheDocument()
  })

  it('shows Round 2 and its no-base-price current player', () => {
    const store = createAndStart()

    act(() => {
      while (store.getState().auction!.round === 1) passCurrentCard(store)
    })

    expect(store.getState().auction!.phase).toBe('ROUND_2')
    expect(screen.getByText(/Round 2 has started/)).toBeInTheDocument()
    expect(screen.getByText('No base price (Round 2)')).toBeInTheDocument()
  })

  it('shows COMPLETE after the last Round 2 card resolves', () => {
    const store = createAndStart()

    act(() => {
      while (store.getState().auction!.status === 'IN_PROGRESS') passCurrentCard(store)
    })

    expect(store.getState().auction!.phase).toBe('COMPLETE')
    expect(screen.getByRole('heading', { name: 'AUCTION COMPLETE' })).toBeInTheDocument()
  })
})
