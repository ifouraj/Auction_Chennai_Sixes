import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_PRESENTATION_DELAY_MS, AUCTION_RESULT_HOLD_MS } from '../domain/constants'
import { createM2PlayerPool } from '../engine/playerPool'
import { AuctionHarnessApp } from './App'
import { createAuctionHarnessStore, TEAM_NAMES } from './auctionStore'
import { formatMoney } from '../presentation/money'

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

  it('creates a game while keeping all 25 selected player identities secret', () => {
    const { store } = renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'Start New Auction Game' }))

    expect(store.getState().stage).toBe('PRE_AUCTION')
    expect(screen.getByText('25 secret players will be revealed one at a time.')).toBeInTheDocument()
    expect(store.getState()).not.toHaveProperty('selectedPool')
    expect(screen.queryByText('Selected player pool')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Round 1' })).toBeInTheDocument()
  })

  it('does not leak an unrevealed player or future order through public snapshots', () => {
    const seed = 8675309
    const futurePlayer = createM2PlayerPool(seed).auctionQueue[1]
    const { store } = createAndStart(seed)
    const snapshot = JSON.stringify(store.getState())

    expect(store.getState().auction).not.toHaveProperty('selectedPool')
    expect(snapshot).not.toContain(futurePlayer.id)
    expect(snapshot).not.toContain(futurePlayer.name)
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

  it('opens and closes the mobile Squads sheet using the shared auction state', () => {
    const { store } = createAndStart(202613)
    act(() => {
      while ((store.getState().auction?.results.length ?? 0) < 1) {
        store.getState().tick()
      }
    })
    const result = store.getState().auction!.results[0]

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Mobile auction information' })).getByRole('button', { name: 'SQUADS' }))
    const sheet = screen.getByRole('dialog', { name: 'Squads mobile panel' })
    expect(sheet).toBeInTheDocument()

    if (result.outcome === 'SOLD') {
      fireEvent.change(within(sheet).getByLabelText('Team'), { target: { value: result.buyerTeamId } })
      const squad = within(sheet).getByRole('list', { name: `${TEAM_NAMES[result.buyerTeamId]} purchased players` })
      expect(squad).toHaveTextContent(result.player.name)
      expect(squad).toHaveTextContent(formatMoney(result.price))
    } else {
      expect(within(sheet).getByText('No players purchased yet.')).toBeInTheDocument()
    }

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close squads' }))
    expect(screen.queryByRole('dialog', { name: 'Squads mobile panel' })).not.toBeInTheDocument()
  })

  it('shows chronological authoritative results in the mobile History sheet', () => {
    const { store } = createAndStart(202613)
    act(() => {
      while ((store.getState().auction?.results.length ?? 0) < 2) {
        store.getState().tick()
      }
    })
    const results = store.getState().auction!.results

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Mobile auction information' })).getByRole('button', { name: 'HISTORY' }))
    const sheet = screen.getByRole('dialog', { name: 'History mobile panel' })
    const historyItems = within(sheet).getAllByRole('listitem')

    expect(historyItems).toHaveLength(results.length)
    results.forEach((result, index) => {
      expect(historyItems[index]).toHaveTextContent(result.player.name)
    })
  })

  it('keeps both persistent auction side panels in the desktop composition', () => {
    const { container } = createAndStart()
    const desktopPanels = container.querySelectorAll('.desktop-auction-panel')

    expect(desktopPanels).toHaveLength(2)
    expect(within(desktopPanels[0] as HTMLElement).getByText('Bought Players / Squad')).toBeInTheDocument()
    expect(within(desktopPanels[1] as HTMLElement).getByText('Auction History')).toBeInTheDocument()
  })

  it('disables all human controls and shows deciding feedback during an AI turn', () => {
    createAndStart()
    fireEvent.click(screen.getByRole('button', { name: 'PASS' }))
    const controls = screen.getByLabelText('Auction controls')

    expect(screen.getByRole('status')).toHaveTextContent(`${TEAM_NAMES['team-b']} AI is deciding`)
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
    const activeSeat = screen.getByLabelText(`${TEAM_NAMES['team-a']} auction seat`)

    expect(activeSeat).toHaveAttribute('data-active', 'true')
    expect(within(activeSeat).getByText('TURN')).toBeInTheDocument()
    expect(currentBid).toHaveTextContent('No bid yet')
    expect(currentBid).toHaveTextContent(`Opening at ${formatMoney(card.basePrice!)}`)
    expect(within(screen.getByLabelText('Auction controls')).queryByText('Current Bid')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Bid amount' }), {
      target: { value: card.basePrice },
    })
    fireEvent.click(screen.getByRole('button', { name: 'BID' }))

    expect(currentBid).toHaveTextContent(formatMoney(card.basePrice!))
    expect(currentBid).toHaveTextContent(`${TEAM_NAMES['team-a']} leading`)
    expect(screen.getByLabelText(`${TEAM_NAMES['team-b']} auction seat`)).toHaveAttribute('data-active', 'true')
  })

  it('keeps a large auction history bounded and pinned while the auction is active', () => {
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

    const results = store.getState().auction!.results
    expect(results.length).toBeGreaterThan(0)
    expect(screen.queryByRole('list', { name: 'Auction history' })).not.toBeInTheDocument()
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
    expect(within(centralArea).getByText('Opening floor ₹10L')).toBeInTheDocument()
    expect(within(centralArea).getByLabelText('Current bid')).toHaveTextContent('No bid yet')
    expect(within(centralArea).getByLabelText('Current bid')).toHaveTextContent('Open from ₹1')
    expect(within(centralArea).queryByText(/leading/i)).not.toBeInTheDocument()
  })

  it('removes the persistent squad panel from tournament match views', () => {
    const { store } = createAndStart(202610)
    act(() => {
      let ticks = 0
      while (store.getState().auction?.status === 'IN_PROGRESS' && ticks < 3_000) {
        store.getState().tick()
        ticks += 1
      }
    })

    expect(screen.getByRole('article', { name: 'League match 1' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: `${TEAM_NAMES['team-a']} purchased players` })).not.toBeInTheDocument()
    expect(screen.queryByText('Bought Players / Squad')).not.toBeInTheDocument()
    expect(screen.queryByText('Best Six — Automatic')).not.toBeInTheDocument()
  })

  it('keeps the authoritative ten-second timer functioning', () => {
    const { store } = createAndStart()
    expect(store.getState().auction!.turnTimer?.remainingSeconds).toBe(10)

    act(() => vi.advanceTimersByTime(1_000))

    expect(store.getState().auction!.turnTimer?.remainingSeconds).toBe(9)
  })

  it('rejects stale AI work after quitting and cleans up timers on unmount', () => {
    const { store, unmount } = createAndStart()
    fireEvent.click(screen.getByRole('button', { name: 'PASS' }))
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Quit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quit Game' }))
    act(() => vi.advanceTimersByTime(AI_PRESENTATION_DELAY_MS * 2))
    expect(store.getState()).toMatchObject({
      stage: 'WELCOME',
      auction: null,
      lastAiDecision: null,
    })

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('opens Quit confirmation, lets Cancel preserve state, and confirms to main screen', () => {
    const { store } = createAndStart(90210)
    const before = structuredClone(store.getState().auction)
    fireEvent.click(screen.getByRole('button', { name: 'Quit' }))
    expect(screen.getByRole('dialog', { name: 'Quit current game?' })).toHaveTextContent('progress will be lost')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(store.getState().auction).toEqual(before)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quit Game' }))
    expect(store.getState()).toMatchObject({ stage: 'WELCOME', auction: null, tournament: null })
    expect(screen.getByRole('button', { name: 'Start New Auction Game' })).toBeInTheDocument()
  })

  it('keeps emergency assignments in state without displaying them below tournament results', () => {
    const { store } = createAndStart(202610)

    act(() => {
      let ticks = 0
      while (store.getState().auction?.status === 'IN_PROGRESS' && ticks < 3_000) {
        store.getState().tick()
        ticks += 1
      }
    })

    expect(store.getState().auction?.status).toBe('COMPLETE')
    expect(store.getState().auction!.emergencySignings.length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: 'Emergency Signings' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Auction controls')).not.toBeInTheDocument()
  })

  it('progressively reveals league standings, final matchup, and champion', () => {
    const { store } = createAndStart(202611)

    act(() => {
      let ticks = 0
      while (store.getState().auction?.status === 'IN_PROGRESS' && ticks < 3_000) {
        store.getState().tick()
        ticks += 1
      }
    })

    expect(store.getState().tournament).not.toBeNull()
    expect(store.getState().auction?.teams.every(({ bestSix }) => bestSix.isComplete)).toBe(true)
    expect(screen.getByRole('heading', { name: 'Match 1 Summary' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'League match 1' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'League match 2' })).not.toBeInTheDocument()
    expect(store.getState().tournament?.revealedLeagueMatches).toHaveLength(1)
    expect(store.getState().tournament?.finalMatch).toBeNull()
    expect(screen.queryByRole('table', { name: 'League standings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Final League Table' })).not.toBeInTheDocument()
    for (let match = 2; match <= 6; match += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
      expect(screen.getByRole('heading', { name: `Standings after Match ${match - 1}` })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'NEXT MATCH' }))
      expect(screen.getByRole('article', { name: `League match ${match}` })).toBeInTheDocument()
      expect(screen.getAllByRole('article')).toHaveLength(1)
      expect(store.getState().tournament?.revealedLeagueMatches).toHaveLength(match)
    }
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }))
    expect(screen.getByRole('heading', { name: 'Final League Table' })).toBeInTheDocument()
    expect(screen.getByText(/QUALIFIED FOR THE FINAL|KNOCKED OUT/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE TO FINAL' }))
    expect(screen.getByText(/^1st ·/)).toHaveTextContent('vs 2nd ·')
    expect(store.getState().tournament?.finalMatch).toBeNull()
    expect(screen.queryByRole('article', { name: 'League match 6' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'PLAY FINAL' }))
    expect(screen.getByRole('article', { name: 'Final match' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Tournament champion' })).toHaveTextContent(/TOURNAMENT CHAMPION/i)
    expect(screen.getByRole('status', { name: 'Tournament champion' })).toHaveTextContent(/GAME OVER/i)
    expect(screen.getByRole('button', { name: 'PLAY AGAIN' })).toBeInTheDocument()
    const tournament = store.getState().tournament!
    expect(tournament.revealedLeagueMatches).toHaveLength(6)
    expect(tournament.finalMatch!.winnerTeamId).toBe(tournament.championTeamId)
    expect(tournament.finalMatch!.loserTeamId).toBe(tournament.runnerUpTeamId)
    expect(tournament.standings.map(({ position }) => position)).toEqual([1, 2, 3, 4])
  })

  it('shows RUNNERS-UP when the qualified human loses the Final', () => {
    const { store } = createAndStart(202610)
    act(() => {
      while (store.getState().auction?.status === 'IN_PROGRESS') store.getState().tick()
      for (let step = 0; step < 13; step += 1) store.getState().advanceTournament()
    })
    const complete = store.getState().tournament!
    expect(complete.finalistTeamIds).toContain('team-a')
    const opponent = complete.finalistTeamIds!.find((teamId) => teamId !== 'team-a')!
    act(() => store.setState({
      tournament: {
        ...complete,
        championTeamId: opponent,
        runnerUpTeamId: 'team-a',
        finalMatch: {
          ...complete.finalMatch!,
          winnerTeamId: opponent,
          loserTeamId: 'team-a',
        },
      },
    }))

    expect(screen.getByRole('status', { name: 'Tournament champion' })).toHaveTextContent('RUNNERS-UP')
    expect(screen.getByRole('status', { name: 'Tournament champion' })).toHaveTextContent(
      TEAM_NAMES[opponent].toUpperCase(),
    )
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
    for (let step = 0; step < 13; step += 1) act(() => store.getState().advanceTournament())
    const oldGameId = store.getState().gameId
    fireEvent.click(screen.getByRole('button', { name: 'PLAY AGAIN' }))
    expect(store.getState()).toMatchObject({
      stage: 'PRE_AUCTION', auction: null, tournament: null, gameId: oldGameId + 1,
    })
    expect(screen.getByRole('button', { name: 'Start Round 1' })).toBeInTheDocument()
  })

  it('shows one replacing announcer beside the current player from reveal through action', () => {
    const { store } = createAndStart(141401)
    const player = store.getState().auction!.currentCard!.player
    const announcer = screen.getByRole('status', { name: 'Live auction announcer' })
    expect(announcer).toHaveTextContent(new RegExp(player.name, 'i'))
    expect(announcer).toHaveTextContent(/base price/i)
    expect(screen.getAllByLabelText('Live auction announcer')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'PASS' }))
    expect(screen.getAllByLabelText('Live auction announcer')).toHaveLength(1)
    expect(screen.getByRole('status', { name: 'Live auction announcer' })).toHaveTextContent(new RegExp(`${TEAM_NAMES['team-a']} PASSES`, 'i'))
    expect(screen.getByRole('status', { name: 'Live auction announcer' })).not.toHaveTextContent(/NEXT PLAYER/i)
  })

  it('holds SOLD before NEXT PLAYER while the authoritative timer still counts normally', () => {
    const { store } = createAndStart(141402)
    const openingBid = store.getState().auction!.currentCard!.basePrice!
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Bid amount' }), {
      target: { value: openingBid },
    })
    fireEvent.click(screen.getByRole('button', { name: 'BID' }))
    act(() => {
      while ((store.getState().auction?.results.length ?? 0) === 0) {
        store.getState().tick()
      }
    })
    const result = store.getState().auction!.results[0]
    expect(result.outcome).toBe('SOLD')
    if (result.outcome !== 'SOLD') return
    const announcer = screen.getByRole('status', { name: 'Live auction announcer' })
    expect(announcer).toHaveTextContent(result.player.name)
    expect(announcer).toHaveTextContent(`₹${result.price}`)
    expect(announcer).toHaveTextContent(TEAM_NAMES['team-a'])
    expect(store.getState().auction!.currentCard!.player.id).toBe(result.player.id)

    const timerBefore = store.getState().auction!.turnTimer!.remainingSeconds
    act(() => vi.advanceTimersByTime(1_000))
    expect(store.getState().auction!.turnTimer!.remainingSeconds).toBe(timerBefore - 1)
    expect(screen.getByRole('status', { name: 'Live auction announcer' })).toHaveTextContent(/SOLD/i)

    act(() => vi.advanceTimersByTime(AUCTION_RESULT_HOLD_MS - 1_000))
    expect(screen.getByRole('status', { name: 'Live auction announcer' })).toHaveTextContent(/NEXT PLAYER/i)
    expect(store.getState().auction!.currentCard!.player.id).not.toBe(result.player.id)
  })

  it('publishes coarse AI labels without raw seeded tendency data', () => {
    createAndStart(141403)
    const allText = document.body.textContent ?? ''
    expect(allText).toMatch(/AI · (Aggressive|Patient|Bargain Hunter|Cautious|Stubborn|Chaotic)/)
    expect(allText).not.toMatch(/aggression|thrift|riskTolerance|balancePreference|volatility/)
  })

  it('presents a clean champion state without persistent squad or Best Six sections', () => {
    const { store } = createAndStart(202610)
    act(() => {
      while (store.getState().auction?.status === 'IN_PROGRESS') store.getState().tick()
    })
    for (let step = 0; step < 13; step += 1) act(() => store.getState().advanceTournament())
    const auction = store.getState().auction!
    const tournament = store.getState().tournament!
    expect(auction.emergencySignings.length).toBeGreaterThan(0)
    expect(screen.getByRole('status', { name: 'Tournament champion' })).toHaveTextContent(
      TEAM_NAMES[tournament.championTeamId!].toUpperCase(),
    )
    expect(screen.queryByText('Bought Players / Squad')).not.toBeInTheDocument()
    expect(screen.queryByText('Best Six — Automatic')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Champion Best Six' })).not.toBeInTheDocument()
  })
})
