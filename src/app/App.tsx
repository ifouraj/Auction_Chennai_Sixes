import { useEffect, useState } from 'react'

import type { AuctionParticipant, TeamId } from '../domain/types'
import type { AuctionTeamState, PublicAuctionState } from '../engine/auctionEngine'
import { TEAM_NAMES, useAuctionHarness, type AuctionHarnessState } from './auctionStore'

type HarnessStore = typeof useAuctionHarness

function teamName(teamId: TeamId | null): string {
  return teamId === null ? 'None' : (TEAM_NAMES[teamId] ?? teamId)
}

function Header({ state }: { state: AuctionHarnessState }) {
  const auction = state.auction
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 pb-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-400">M6.5 playable harness</p>
        <h1 className="text-2xl font-black uppercase tracking-wide text-white">Chennai Sixes Auction</h1>
      </div>
      {auction && (
        <div className="flex items-center gap-8 text-sm font-bold uppercase tracking-wider text-slate-300" aria-label="Auction progress">
          <span>{auction.phase === 'COMPLETE' ? 'Auction Complete' : `Round ${auction.round}`}</span>
          <span>{auction.status === 'COMPLETE' ? `${auction.results.length} players processed` : `Player ${auction.playerIndex + 1} / ${auction.totalPlayers}`}</span>
        </div>
      )}
      <button className="rounded border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700" onClick={() => state.createGame()}>
        New Game
      </button>
    </header>
  )
}

function Welcome({ createGame }: { createGame: () => void }) {
  return (
    <section className="grid min-h-[65vh] place-items-center text-center">
      <div>
        <h2 className="text-2xl font-bold">Manual four-team auction testing</h2>
        <p className="mt-2 max-w-xl text-slate-400">One tester controls the active seat. The existing deterministic engine owns every auction rule.</p>
        <button className="mt-6 rounded bg-cyan-500 px-6 py-3 font-bold text-slate-950 hover:bg-cyan-400" onClick={() => createGame()}>
          Start New Auction Game
        </button>
      </div>
    </section>
  )
}

function PreAuction({ pool, startAuction }: { pool: AuctionHarnessState['selectedPool']; startAuction: () => void }) {
  return (
    <section className="mt-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Selected player pool</h2>
          <p className="text-slate-400">All {pool.length} public selections are visible before the private order begins.</p>
        </div>
        <button className="rounded bg-emerald-500 px-5 py-3 font-bold text-slate-950 hover:bg-emerald-400" onClick={startAuction}>Start Round 1</button>
      </div>
      <ol aria-label="Selected 25 players" className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        {pool.map((player) => (
          <li className="rounded border border-slate-700 bg-slate-900 p-3" key={player.id}>
            <span className="font-semibold text-white">{player.name}</span>
            <span className="block text-sm text-slate-400">{player.country} · Base {player.basePrice}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function participantForTeam(participants: readonly AuctionParticipant[], teamId: TeamId) {
  return participants.find((participant) => participant.teamId === teamId)
}

function teamStatus(auction: PublicAuctionState, teamId: TeamId): string {
  const card = auction.currentCard
  if (card === null) return 'WAITING'
  if (card.activeTeamId === teamId) return 'TURN'
  if (card.highestBidderId === teamId) return 'LEADING'
  if (card.notInterestedTeamIds.includes(teamId)) return 'NOT INTERESTED'
  if (card.passedThisCycleTeamIds.includes(teamId)) return 'PASSED'
  return 'WAITING'
}

function TeamCard({ auction, team, selected, onSelect }: {
  auction: PublicAuctionState
  team: AuctionTeamState
  selected: boolean
  onSelect: () => void
}) {
  const participant = participantForTeam(auction.participants, team.teamId)
  const isActive = auction.currentCard?.activeTeamId === team.teamId
  const status = teamStatus(auction, team.teamId)
  return (
    <article className={`rounded-lg border p-4 transition ${isActive ? 'border-cyan-300 bg-cyan-950/70 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]' : selected ? 'border-slate-400 bg-slate-800' : 'border-slate-700 bg-slate-900'} ${status === 'NOT INTERESTED' ? 'opacity-55' : ''}`}>
      <button className="w-full text-left" onClick={onSelect} type="button">
        <span className="flex items-center justify-between gap-2">
          <span className="font-black uppercase tracking-wide text-white">{teamName(team.teamId)}</span>
          <span className={`rounded px-2 py-1 text-[0.65rem] font-black tracking-wider ${isActive ? 'bg-cyan-300 text-slate-950' : status === 'LEADING' ? 'bg-emerald-400/20 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>{status}</span>
        </span>
        <span className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <span><span className="block text-xs uppercase text-slate-500">Balance</span><strong className="text-lg text-white">{team.balance}</strong></span>
          <span><span className="block text-xs uppercase text-slate-500">Players</span><strong className="text-lg text-white">{team.purchasedPlayerCount}</strong></span>
        </span>
        <span className="mt-2 block text-xs text-slate-500">Seat {(participant?.seatIndex ?? 0) + 1} · Select purchases</span>
      </button>
      {isActive && (
        <div className="mt-3 flex items-end justify-between border-t border-cyan-800 pt-3">
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">Active turn</span>
          <span aria-label="Seconds remaining" className="text-3xl font-black leading-none text-white">{auction.turnTimer?.remainingSeconds ?? 0}s</span>
        </div>
      )}
    </article>
  )
}

function PlayerCard({ auction }: { auction: PublicAuctionState }) {
  const card = auction.currentCard
  if (card === null) return null
  const { player } = card
  const stats = [['BAT', player.batting], ['BOWL', player.bowling], ['WK', player.wicketKeeping], ['LEAD', player.leadership], ['Overall', player.overall]]
  return (
    <div className="rounded-xl border border-amber-400/70 bg-slate-900 px-5 py-6 text-center shadow-xl shadow-black/20">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">Current Player</p>
      <h2 className="mt-2 text-3xl font-black text-white">{player.name}</h2>
      <p className="mt-1 text-sm font-semibold text-slate-400">{player.country} · Age {player.age}</p>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-300">{player.description}</p>
      <dl className="mx-auto mt-5 grid max-w-xl grid-cols-5 gap-2">
        {stats.map(([label, value]) => (
          <div className={`rounded border px-2 py-3 ${label === 'Overall' ? 'border-amber-500/50 bg-amber-950/40' : 'border-slate-700 bg-slate-800'}`} key={label}>
            <dt className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
            <dd className="mt-1 text-xl font-black text-white">{value}</dd>
          </div>
        ))}
      </dl>
      {card.basePrice === null
        ? <p className="mt-5 text-sm font-bold uppercase tracking-wider text-violet-300">No base price (Round 2)</p>
        : <p className="mt-5 text-sm font-bold uppercase tracking-wider text-amber-300">Base price <span className="ml-2 text-xl text-white">{card.basePrice}</span></p>}
    </div>
  )
}

function BoughtPlayers({ auction, selectedTeamId, onSelectTeam }: {
  auction: PublicAuctionState
  selectedTeamId: TeamId
  onSelectTeam: (teamId: TeamId) => void
}) {
  const selectedTeam = auction.teams.find((team) => team.teamId === selectedTeamId) ?? auction.teams[0]
  return (
    <aside className="rounded-lg border border-slate-700 bg-slate-900 p-4" aria-labelledby="bought-players-title">
      <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white" id="bought-players-title">Bought Players</h2>
      <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="bought-team">Team</label>
      <select className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 font-semibold text-white" id="bought-team" onChange={(event) => onSelectTeam(event.target.value)} value={selectedTeam.teamId}>
        {auction.teams.map((team) => <option key={team.teamId} value={team.teamId}>{teamName(team.teamId)}</option>)}
      </select>
      {selectedTeam.purchasedPlayers.length === 0 ? <p className="mt-5 text-sm text-slate-500">No players purchased yet.</p> : (
        <ul aria-label={`${teamName(selectedTeam.teamId)} purchased players`} className="mt-4 divide-y divide-slate-800">
          {selectedTeam.purchasedPlayers.map(({ player, pricePaid }) => (
            <li className="flex items-start justify-between gap-3 py-3 text-sm" key={player.id}>
              <span className="font-semibold text-slate-200">{player.name}</span><span className="shrink-0 font-black text-amber-300">{pricePaid}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function AuctionHistory({ auction }: { auction: PublicAuctionState }) {
  return (
    <aside className="rounded-lg border border-slate-700 bg-slate-900 p-4" aria-labelledby="auction-history-title">
      <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white" id="auction-history-title">Auction History</h2>
      {auction.results.length === 0 ? <p className="mt-5 text-sm text-slate-500">Results will appear here chronologically.</p> : (
        <ol aria-label="Auction history" className="mt-4 divide-y divide-slate-800">
          {auction.results.map((result, index) => (
            <li className="py-3 text-sm" key={`${result.cardNumber}-${result.player.id}-${index}`}>
              <span className="block font-bold text-white">{result.player.name}</span>
              {result.outcome === 'SOLD' ? <span className="mt-1 block text-slate-400">{teamName(result.buyerTeamId)} · <strong className="text-emerald-300">{result.price}</strong></span> : <span className="mt-1 block font-black tracking-wider text-rose-300">UNSOLD</span>}
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}

function Controls({ auction, feedback, bid, pass, notInterested }: {
  auction: PublicAuctionState
  feedback: string | null
  bid: (amount: number) => void
  pass: () => void
  notInterested: () => void
}) {
  const card = auction.currentCard
  const suggestedBid = card?.highestBid === null ? (card.basePrice ?? 1) : (card?.highestBid ?? 0) + 1
  const [amount, setAmount] = useState(String(suggestedBid))
  if (card === null) return null
  return (
    <section className="border-t border-cyan-800 bg-slate-900 px-4 py-4" aria-label="Auction controls">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-end gap-4">
        <div className="mr-auto min-w-40">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Current Bid</p>
          <p className="text-3xl font-black text-white">{card.highestBid ?? '—'}</p>
          <p className="text-xs text-slate-400">{card.highestBidderId === null ? 'No bidder' : `${teamName(card.highestBidderId)} leading`}</p>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="bid-amount">Bid amount · <span>{teamName(card.activeTeamId)}</span></label>
          <input aria-label="Bid amount" className="mt-1 w-36 rounded border border-slate-600 bg-slate-950 px-3 py-2 text-lg font-bold text-white" id="bid-amount" inputMode="numeric" onChange={(event) => setAmount(event.target.value)} step="1" type="number" value={amount} />
        </div>
        <button className="rounded bg-emerald-500 px-6 py-3 font-black text-slate-950 hover:bg-emerald-400" onClick={() => bid(Number(amount))}>BID</button>
        <button className="rounded bg-amber-500 px-6 py-3 font-black text-slate-950 hover:bg-amber-400" onClick={pass}>PASS</button>
        <button className="rounded bg-rose-500 px-6 py-3 font-black text-white hover:bg-rose-400" onClick={notInterested}>NOT INTERESTED</button>
      </div>
      {feedback && <p role="alert" className="mx-auto mt-3 max-w-[1500px] rounded bg-rose-950 p-3 text-rose-200">{feedback}</p>}
    </section>
  )
}

function Auction({ state }: { state: AuctionHarnessState }) {
  const { auction, lastResult } = state
  const [selectedTeamId, setSelectedTeamId] = useState<TeamId>('team-a')
  if (auction === null) return null
  const lastResultText = lastResult?.outcome === 'SOLD' ? `SOLD: ${lastResult.player.name} to ${teamName(lastResult.buyerTeamId)} for ${lastResult.price}` : lastResult?.outcome === 'UNSOLD' ? `UNSOLD: ${lastResult.player.name}` : null

  if (auction.status === 'COMPLETE') {
    return <section className="mt-6 rounded border border-emerald-500 bg-emerald-950 p-8 text-center"><h2 className="text-4xl font-black text-emerald-200">AUCTION COMPLETE</h2><p className="mt-2 text-emerald-100">Use New Game to create another fresh auction.</p></section>
  }

  const topTeams = auction.teams.slice(0, 2)
  const bottomTeams = auction.teams.slice(2, 4)
  return (
    <div className="mt-5">
      {auction.phase === 'ROUND_2' && <p role="status" className="mb-4 rounded border border-violet-500 bg-violet-950 p-3 text-center font-bold text-violet-200">Round 2 has started — unsold players return with no base price.</p>}
      {lastResultText && <p role="status" className="mb-4 rounded border border-amber-500 bg-amber-950 p-3 text-center font-bold text-amber-200">{lastResultText}</p>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(220px,0.75fr)_minmax(520px,2fr)_minmax(220px,0.75fr)]">
        <BoughtPlayers auction={auction} selectedTeamId={selectedTeamId} onSelectTeam={setSelectedTeamId} />
        <section aria-label="Four teams" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">{topTeams.map((team) => <TeamCard auction={auction} key={team.teamId} onSelect={() => setSelectedTeamId(team.teamId)} selected={selectedTeamId === team.teamId} team={team} />)}</div>
          <PlayerCard auction={auction} />
          <div className="grid gap-4 sm:grid-cols-2">{bottomTeams.map((team) => <TeamCard auction={auction} key={team.teamId} onSelect={() => setSelectedTeamId(team.teamId)} selected={selectedTeamId === team.teamId} team={team} />)}</div>
        </section>
        <AuctionHistory auction={auction} />
      </div>
      <div className="-mx-6 mt-5"><Controls auction={auction} feedback={state.feedback} bid={state.bid} pass={state.pass} notInterested={state.notInterested} key={`${auction.round}-${auction.currentCard?.cardNumber}-${auction.currentCard?.highestBid}`} /></div>
    </div>
  )
}

export function AuctionHarnessApp({ store = useAuctionHarness }: { store?: HarnessStore }) {
  const state = store()
  useEffect(() => {
    if (state.stage !== 'AUCTION' || state.auction?.status !== 'IN_PROGRESS') return
    const interval = window.setInterval(() => store.getState().tick(), 1_000)
    return () => window.clearInterval(interval)
  }, [state.stage, state.auction?.status, store])
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-6 text-slate-100">
      <div className="mx-auto max-w-[1500px]">
        <Header state={state} />
        {state.stage === 'WELCOME' && <Welcome createGame={state.createGame} />}
        {state.stage === 'PRE_AUCTION' && <PreAuction pool={state.selectedPool} startAuction={state.startAuction} />}
        {state.stage === 'AUCTION' && <Auction state={state} />}
      </div>
    </main>
  )
}

function App() { return <AuctionHarnessApp /> }

export default App
