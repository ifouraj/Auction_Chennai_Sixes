import { useEffect, useState } from 'react'

import type { AuctionParticipant, TeamId } from '../domain/types'
import type { PublicAuctionState } from '../engine/auctionEngine'
import {
  TEAM_NAMES,
  useAuctionHarness,
  type AuctionHarnessState,
} from './auctionStore'

type HarnessStore = typeof useAuctionHarness

function teamName(teamId: TeamId | null): string {
  return teamId === null ? 'None' : (TEAM_NAMES[teamId] ?? teamId)
}

function Header({ createGame }: { createGame: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 pb-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-400">M6.5 development harness</p>
        <h1 className="text-3xl font-bold text-white">Chennai Sixes Auction</h1>
      </div>
      <button className="rounded bg-slate-700 px-4 py-2 font-semibold hover:bg-slate-600" onClick={() => createGame()}>
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
        <button className="rounded bg-emerald-500 px-5 py-3 font-bold text-slate-950 hover:bg-emerald-400" onClick={startAuction}>
          Start Round 1
        </button>
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

function Teams({ auction }: { auction: PublicAuctionState }) {
  const card = auction.currentCard
  return (
    <section aria-labelledby="teams-title">
      <h2 className="mb-3 text-lg font-bold" id="teams-title">Four teams</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {auction.teams.map((team) => {
          const participant = participantForTeam(auction.participants, team.teamId)
          const isActive = card?.activeTeamId === team.teamId
          const status = isActive
            ? 'ACTIVE TURN'
            : card?.highestBidderId === team.teamId
              ? 'HIGHEST BIDDER'
              : card?.notInterestedTeamIds.includes(team.teamId)
                ? 'NOT INTERESTED'
                : card?.passedThisCycleTeamIds.includes(team.teamId)
                  ? 'PASSED THIS CYCLE'
                  : 'WAITING'
          return (
            <article className={`rounded border p-4 ${isActive ? 'border-cyan-400 bg-cyan-950/50' : 'border-slate-700 bg-slate-900'}`} key={team.teamId}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-white">{teamName(team.teamId)}</h3>
                <span className="text-xs font-bold text-cyan-300">Seat {(participant?.seatIndex ?? 0) + 1}</span>
              </div>
              <p className="mt-2 text-2xl font-bold">{team.balance}</p>
              <p className="text-sm text-slate-400">Balance · {team.purchasedPlayerCount} purchased</p>
              <p className="mt-2 text-xs font-bold tracking-wide text-amber-300">{status}</p>
              {team.purchasedPlayers.length > 0 && (
                <ul aria-label={`${teamName(team.teamId)} purchased players`} className="mt-3 border-t border-slate-700 pt-2 text-sm text-slate-300">
                  {team.purchasedPlayers.map(({ player, pricePaid }) => <li key={player.id}>{player.name} · {pricePaid}</li>)}
                </ul>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function PlayerCard({ auction }: { auction: PublicAuctionState }) {
  const card = auction.currentCard
  if (card === null) return null
  const { player } = card
  const stats = [
    ['Batting', player.batting], ['Bowling', player.bowling],
    ['Wicket keeping', player.wicketKeeping], ['Leadership', player.leadership],
    ['Overall', player.overall],
  ]
  return (
    <article className="rounded border border-slate-700 bg-slate-900 p-5">
      <p className="text-sm font-bold uppercase tracking-wider text-cyan-400">Current player</p>
      <h2 className="mt-1 text-3xl font-bold text-white">{player.name}</h2>
      <p className="text-slate-400">{player.country} · Age {player.age}</p>
      <p className="mt-4 text-slate-300">{player.description}</p>
      <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {stats.map(([label, value]) => <div className="rounded bg-slate-800 p-2" key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="font-bold">{value}</dd></div>)}
      </dl>
      <p className="mt-5 text-lg font-bold text-amber-300">
        {card.basePrice === null ? 'No base price (Round 2)' : `Base price: ${card.basePrice}`}
      </p>
    </article>
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
    <section className="rounded border border-cyan-700 bg-slate-900 p-5" aria-label="Auction controls">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">Current Turn</p>
          <h2 className="text-3xl font-bold text-cyan-300">{teamName(card.activeTeamId)}</h2>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-400">Turn timer</p>
          <p aria-label="Seconds remaining" className="text-4xl font-black text-white">{auction.turnTimer?.remainingSeconds ?? 0}s</p>
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input aria-label="Bid amount" className="rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white" inputMode="numeric" onChange={(event) => setAmount(event.target.value)} step="1" type="number" value={amount} />
        <button className="rounded bg-emerald-500 px-5 py-2 font-bold text-slate-950 hover:bg-emerald-400" onClick={() => bid(Number(amount))}>BID</button>
        <button className="rounded bg-amber-500 px-5 py-2 font-bold text-slate-950 hover:bg-amber-400" onClick={pass}>PASS</button>
        <button className="rounded bg-rose-500 px-5 py-2 font-bold text-white hover:bg-rose-400" onClick={notInterested}>NOT INTERESTED</button>
      </div>
      {feedback && <p role="alert" className="mt-3 rounded bg-rose-950 p-3 text-rose-200">{feedback}</p>}
    </section>
  )
}

function Auction({ state }: { state: AuctionHarnessState }) {
  const { auction, lastResult } = state
  if (auction === null) return null
  const lastResultText = lastResult?.outcome === 'SOLD'
    ? `SOLD: ${lastResult.player.name} to ${teamName(lastResult.buyerTeamId)} for ${lastResult.price}`
    : lastResult?.outcome === 'UNSOLD'
      ? `UNSOLD: ${lastResult.player.name}`
      : null

  return (
    <div className="mt-6 space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded bg-slate-800 p-4" aria-label="Auction progress">
        <strong>{auction.phase === 'COMPLETE' ? 'AUCTION COMPLETE' : `Round ${auction.round}`}</strong>
        <span>{auction.status === 'COMPLETE' ? `${auction.results.length} players processed` : `Player ${auction.playerIndex + 1} of ${auction.totalPlayers}`}</span>
      </section>
      {auction.phase === 'ROUND_2' && <p role="status" className="rounded border border-violet-500 bg-violet-950 p-4 font-bold text-violet-200">Round 2 has started — unsold players return with no base price.</p>}
      {lastResultText && <p role="status" className="rounded border border-amber-500 bg-amber-950 p-4 font-bold text-amber-200">{lastResultText}</p>}
      {auction.status === 'COMPLETE' ? (
        <section className="rounded border border-emerald-500 bg-emerald-950 p-8 text-center">
          <h2 className="text-4xl font-black text-emerald-200">AUCTION COMPLETE</h2>
          <p className="mt-2 text-emerald-100">Use New Game to create another fresh auction.</p>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <PlayerCard auction={auction} />
          <Controls auction={auction} feedback={state.feedback} bid={state.bid} pass={state.pass} notInterested={state.notInterested} key={`${auction.round}-${auction.currentCard?.cardNumber}-${auction.currentCard?.highestBid}`} />
        </div>
      )}
      <Teams auction={auction} />
      <section className="rounded border border-slate-700 bg-slate-900 p-4" aria-label="Bid state">
        <h2 className="font-bold">Bid state</h2>
        <p className="mt-1 text-slate-300">Highest bid: {auction.currentCard?.highestBid ?? 'None'} · Highest bidder: {teamName(auction.currentCard?.highestBidderId ?? null)}</p>
      </section>
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
      <div className="mx-auto max-w-7xl">
        <Header createGame={state.createGame} />
        {state.stage === 'WELCOME' && <Welcome createGame={state.createGame} />}
        {state.stage === 'PRE_AUCTION' && <PreAuction pool={state.selectedPool} startAuction={state.startAuction} />}
        {state.stage === 'AUCTION' && <Auction state={state} />}
      </div>
    </main>
  )
}

function App() {
  return <AuctionHarnessApp />
}

export default App
