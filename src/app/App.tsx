import { useEffect, useRef, useState } from 'react'

import { AI_PRESENTATION_DELAY_MS, AUCTION_RESULT_HOLD_MS } from '../domain/constants'
import type { AuctionParticipant, TeamId } from '../domain/types'
import type { PublicAuctionState, PublicAuctionTeamState } from '../engine/auctionEngine'
import { announceAuctionEvent, type AuctionPresentationEvent } from '../presentation/auctionAnnouncer'
import { classifyMatch } from '../presentation/matchFlavor'
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
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-400">Four-team card-table auction</p>
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
        <h2 className="text-2xl font-bold">Human vs three AI bidders</h2>
        <p className="mt-2 max-w-xl text-slate-400">You control Team A. Three seeded AI bidders control the remaining seats under the same auction rules.</p>
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

function teamStatus(auction: PublicAuctionState, team: PublicAuctionTeamState): string {
  if (auction.status === 'COMPLETE') return 'SQUAD'
  const card = auction.currentCard
  if (card === null) return 'WAITING'
  if (card.activeTeamId === team.teamId) return 'TURN'
  if (card.highestBidderId === team.teamId) return 'LEADING'
  if (card.notInterestedTeamIds.includes(team.teamId)) return 'NOT INTERESTED'
  if (card.passedThisCycleTeamIds.includes(team.teamId)) return 'PASSED'
  if (!team.canAffordMinimumBid) return 'CANNOT BID'
  return 'WAITING'
}

function TeamCard({ auction, team, selected, onSelect, announcerFocus, personality }: {
  auction: PublicAuctionState
  team: PublicAuctionTeamState
  selected: boolean
  onSelect: () => void
  announcerFocus: boolean
  personality?: string
}) {
  const participant = participantForTeam(auction.participants, team.teamId)
  const isActive = auction.currentCard?.activeTeamId === team.teamId
  const status = teamStatus(auction, team)
  return (
    <article aria-label={`${teamName(team.teamId)} auction seat`} className={`relative overflow-hidden rounded-lg border p-4 transition ${isActive ? 'border-cyan-200 bg-cyan-950/80 shadow-[0_0_0_2px_rgba(103,232,249,0.35),0_0_24px_rgba(34,211,238,0.12)]' : selected ? 'border-slate-400 bg-slate-800' : 'border-slate-700 bg-slate-900'} ${announcerFocus && !isActive ? 'announcer-team-focus' : ''} ${status === 'NOT INTERESTED' ? 'opacity-60' : ''}`} data-active={isActive ? 'true' : 'false'} data-announcer-focus={announcerFocus ? 'true' : 'false'}>
      {isActive && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-cyan-300" />}
      <button className="w-full text-left" onClick={onSelect} type="button">
        <span className="flex items-center justify-between gap-2">
          <span>
            <span className="block truncate font-black uppercase tracking-wide text-white">{teamName(team.teamId)}</span>
            <span className="mt-0.5 block text-[0.65rem] font-black uppercase tracking-[0.18em] text-slate-400">{participant?.kind === 'AI' ? `AI · ${personality ?? 'AI'}` : 'YOU'}</span>
          </span>
          <span className={`rounded px-2 py-1 text-[0.65rem] font-black tracking-wider ${isActive ? 'bg-cyan-300 text-slate-950' : status === 'LEADING' ? 'bg-emerald-400/20 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>{status}</span>
        </span>
        <span className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <span><span className="block text-xs uppercase text-slate-500">Balance</span><strong className="text-lg text-white">₹{team.balance}</strong></span>
          <span><span className="block text-xs uppercase text-slate-500">Players</span><strong className="text-lg text-white">{team.availablePlayerCount}</strong></span>
        </span>
        <dl
          aria-label={`${teamName(team.teamId)} strength`}
          className="mt-3 grid grid-cols-5 gap-1 border-t border-slate-700 pt-3 text-center"
          role="group"
        >
          {([
            ['BAT', team.strength.batting],
            ['BOWL', team.strength.bowling],
            ['WK', team.strength.wicketKeeping],
            ['LEAD', team.strength.leadership],
            ['Overall', team.strength.overall],
          ] as const).map(([label, value]) => (
            <div key={label}>
              <dt className="text-[0.6rem] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className={`mt-1 font-black ${label === 'Overall' ? 'text-amber-300' : 'text-white'}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <span className="mt-2 block text-xs text-slate-500">Seat {(participant?.seatIndex ?? 0) + 1} · {participant?.kind === 'AI' ? 'AI' : 'Human'} · {team.purchasedPlayerCount} bought{team.emergencyPlayers.length > 0 ? ` + ${team.emergencyPlayers.length} emergency` : ''} · Select squad</span>
      </button>
      {isActive && (
        <div className="mt-3 flex items-end justify-between border-t border-cyan-800 pt-3">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Active turn</span>
          <span aria-label="Seconds remaining" className="text-3xl font-black leading-none text-white">{auction.turnTimer?.remainingSeconds ?? 0}s</span>
        </div>
      )}
    </article>
  )
}

function LiveAnnouncer({ event }: { event: AuctionPresentationEvent | null }) {
  if (event === null) return null
  const announcement = announceAuctionEvent(event, (teamId) => teamName(teamId))
  return (
    <section
      aria-atomic="true"
      aria-label="Live auction announcer"
      className={`live-announcer live-announcer--${announcement.tone} mx-auto mt-5 max-w-2xl rounded-lg border px-5 py-4`}
      role="status"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Live Announcer</p>
      <p className="mt-1 text-2xl font-black uppercase tracking-wide text-white">{announcement.primary}</p>
      {announcement.secondary && <p className="mt-1 text-sm font-semibold text-slate-300">{announcement.secondary}</p>}
    </section>
  )
}

function PlayerCard({ auction, announcementEvent }: { auction: PublicAuctionState; announcementEvent: AuctionPresentationEvent | null }) {
  const card = auction.currentCard
  if (card === null) return null
  const { player } = card
  const heldResult = announcementEvent?.type === 'SOLD' || announcementEvent?.type === 'UNSOLD'
    ? announcementEvent
    : null
  const stats = [['BAT', player.batting], ['BOWL', player.bowling], ['WK', player.wicketKeeping], ['LEAD', player.leadership], ['Overall', player.overall]]
  return (
    <div className="relative rounded-xl border border-amber-400/70 bg-slate-900 px-5 py-6 text-center shadow-xl shadow-black/20" aria-label="Central auction area">
      {heldResult && (
        <div className="absolute inset-0 z-10 grid place-content-center rounded-xl bg-slate-900 px-5 py-6">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">Resolved Player</p>
          <h2 className="mt-2 text-3xl font-black text-white">{heldResult.player.name}</h2>
          <LiveAnnouncer event={announcementEvent} />
        </div>
      )}
      <div aria-hidden={heldResult ? 'true' : undefined} className={heldResult ? 'invisible' : undefined}>
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
      {!heldResult && <LiveAnnouncer event={announcementEvent} />}
      <div className="mx-auto mt-5 grid max-w-xl gap-3 border-t border-slate-700 pt-5 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-950/70 px-4 py-3">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-slate-500">{card.basePrice === null ? 'Round 2 opening' : 'Round 1 base price'}</p>
          {card.basePrice === null
            ? <p className="mt-1 font-black uppercase text-violet-300">No base price <span className="block text-xs font-semibold normal-case text-slate-400">Opening floor ₹1</span></p>
            : <p className="mt-1 text-2xl font-black text-white">₹{card.basePrice}</p>}
        </div>
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-3" aria-label="Current bid">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-emerald-300">Current Bid</p>
          {card.highestBid === null ? (
            <>
              <p className="mt-1 text-xl font-black text-white">No bid yet</p>
              <p className="text-xs text-slate-400">{card.basePrice === null ? 'Open from ₹1' : `Opening at ₹${card.basePrice}`}</p>
            </>
          ) : (
            <>
              <p className="mt-1 text-3xl font-black text-white">₹{card.highestBid}</p>
              <p className="text-xs font-black uppercase tracking-wider text-emerald-300">{teamName(card.highestBidderId)} leading</p>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

function BoughtPlayers({ auction, selectedTeamId, onSelectTeam }: {
  auction: PublicAuctionState
  selectedTeamId: TeamId
  onSelectTeam: (teamId: TeamId) => void
}) {
  const selectedTeam = auction.teams.find((team) => team.teamId === selectedTeamId) ?? auction.teams[0]
  const squad = [
    ...selectedTeam.purchasedPlayers.map((purchase) => ({
      ...purchase,
      source: 'AUCTION' as const,
    })),
    ...selectedTeam.emergencyPlayers.map((assignment) => ({
      ...assignment,
      pricePaid: 0,
    })),
  ]
  return (
    <aside className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 p-4" aria-labelledby="bought-players-title">
      <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white" id="bought-players-title">Bought Players / Squad</h2>
      <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="bought-team">Team</label>
      <select className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 font-semibold text-white" id="bought-team" onChange={(event) => onSelectTeam(event.target.value)} value={selectedTeam.teamId}>
        {auction.teams.map((team) => <option key={team.teamId} value={team.teamId}>{teamName(team.teamId)}</option>)}
      </select>
      {squad.length === 0 ? <p className="mt-5 text-sm text-slate-500">No players purchased yet.</p> : (
        <ul aria-label={`${teamName(selectedTeam.teamId)} purchased players`} className="squad-scroll mt-4 divide-y divide-slate-800 pr-2" style={{ maxHeight: 'min(36rem, 58vh)', overflowY: 'auto' }} tabIndex={0}>
          {squad.map(({ player, pricePaid, source }) => (
            <li className="flex items-start justify-between gap-3 py-3 text-sm" key={player.id}>
              <span className="min-w-0 font-semibold text-slate-200">
                <span className="block truncate">{player.name}</span>
                {selectedTeam.bestSix.playerIds.includes(player.id) && (
                  <span aria-label={`${player.name} is in automatic Best Six`} className="ml-2 rounded bg-cyan-400/15 px-1.5 py-0.5 text-[0.6rem] font-black tracking-wider text-cyan-300">BEST SIX</span>
                )}
                <span className="mt-1 block text-[0.62rem] font-bold uppercase tracking-wide text-slate-500">BAT {player.batting} · BOWL {player.bowling} · WK {player.wicketKeeping} · LEAD {player.leadership}{source === 'AUCTION' ? ` · OVR ${player.overall}` : ''}</span>
                {source === 'EMERGENCY' && <span className="mt-1 block text-[0.65rem] font-black uppercase tracking-wider text-rose-300">Emergency · Overall {player.overall}</span>}
              </span><span className={`shrink-0 font-black ${source === 'EMERGENCY' ? 'text-rose-300' : 'text-amber-300'}`}>{source === 'EMERGENCY' ? 'FREE' : `₹${pricePaid}`}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function EmergencySignings({ auction }: { auction: PublicAuctionState }) {
  if (auction.emergencySignings.length === 0) return null
  return (
    <section className="mb-5 rounded-lg border border-rose-500 bg-rose-950/70 p-5" aria-labelledby="emergency-signings-title">
      <h2 className="text-xl font-black uppercase tracking-wide text-rose-200" id="emergency-signings-title">Emergency Signings</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {auction.emergencySignings.map((event) => (
          <article className="rounded border border-rose-800 bg-slate-950/50 p-4" key={event.teamId}>
            <h3 className="font-black text-white">{teamName(event.teamId)} receives {event.players.length} emergency {event.players.length === 1 ? 'player' : 'players'}</h3>
            <p className="mt-1 text-sm text-rose-200">They finished the auction with {auction.teams.find(({ teamId }) => teamId === event.teamId)?.purchasedPlayerCount ?? 0} players. The organizers found {event.players.length === 1 ? 'a replacement' : `${event.players.length} replacements`}.</p>
            <ul className="mt-3 space-y-2" aria-label={`${teamName(event.teamId)} emergency players`}>
              {event.players.map(({ player }) => (
                <li className="text-sm text-slate-200" key={player.id}>
                  <span className="font-bold text-rose-200">{player.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">{player.description}</span>
                  <span className="block text-xs text-slate-400">Overall {player.overall} · BAT {player.batting} · BOWL {player.bowling} · WK {player.wicketKeeping} · LEAD {player.leadership}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}

function BestSixReveal({ auction }: { auction: PublicAuctionState }) {
  return (
    <section className="mb-5 rounded-lg border border-cyan-600/60 bg-slate-900 p-5" aria-labelledby="best-six-title">
      <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-400">Squads locked</p>
      <h2 className="mt-1 text-2xl font-black uppercase text-white" id="best-six-title">Best Six — Automatic</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {auction.teams.map((team) => {
          const owned = [
            ...team.purchasedPlayers.map((purchase) => ({ ...purchase, source: 'AUCTION' as const })),
            ...team.emergencyPlayers,
          ]
          const selected = owned.filter(({ player }) => team.bestSix.playerIds.includes(player.id))
          const weakest = ([
            ['BAT', team.strength.batting],
            ['BOWL', team.strength.bowling],
            ['WK', team.strength.wicketKeeping],
            ['LEAD', team.strength.leadership],
          ] as const).reduce((current, candidate) => candidate[1] < current[1] ? candidate : current)
          return (
            <article className="rounded border border-slate-700 bg-slate-950/60 p-4" key={team.teamId} aria-label={`${teamName(team.teamId)} automatic Best Six`}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-black uppercase text-white">{teamName(team.teamId)}</h3>
                <span className="text-xs font-bold text-slate-400">Weakest: {weakest[0]} {weakest[1]}</span>
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {selected.map(({ player, source }) => (
                  <li className="rounded bg-slate-900 px-3 py-2 text-sm" key={player.id}>
                    <span className="font-bold text-white">{player.name}</span>
                    {source === 'EMERGENCY' && <span className="ml-2 text-[0.6rem] font-black uppercase text-rose-300">Emergency</span>}
                    <span className="block text-[0.65rem] font-bold text-slate-500">BAT {player.batting} · BOWL {player.bowling} · WK {player.wicketKeeping} · LEAD {player.leadership} · OVR {player.overall}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-slate-800 pt-3 text-xs font-black uppercase tracking-wide text-slate-400">BAT {team.strength.batting} · BOWL {team.strength.bowling} · WK {team.strength.wicketKeeping} · LEAD {team.strength.leadership} · <span className="text-amber-300">Overall {team.strength.overall}</span></p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function AuctionHistory({ auction }: { auction: PublicAuctionState }) {
  const scrollRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const history = scrollRef.current
    if (history !== null) history.scrollTop = history.scrollHeight
  }, [auction.results.length])

  return (
    <aside className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 p-4" aria-labelledby="auction-history-title">
      <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white" id="auction-history-title">Auction History</h2>
      {auction.results.length === 0 ? <p className="mt-5 text-sm text-slate-500">Results will appear here chronologically.</p> : (
        <ol aria-label="Auction history" className="auction-history-scroll mt-4 divide-y divide-slate-800 pr-2" ref={scrollRef} style={{ maxHeight: 'min(36rem, 58vh)', overflowY: 'auto' }} tabIndex={0}>
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
  const activeParticipant = participantForTeam(auction.participants, card.activeTeamId)
  const isHumanTurn = activeParticipant?.kind === 'HUMAN_LOCAL'
  return (
    <section className="border-t border-cyan-800 bg-slate-900 px-4 py-4" aria-label="Auction controls" aria-disabled={!isHumanTurn}>
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-center gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="bid-amount">Bid amount · <span>{teamName(card.activeTeamId)}</span></label>
          <input aria-label="Bid amount" className="mt-1 w-36 rounded border border-slate-600 bg-slate-950 px-3 py-2 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={!isHumanTurn} id="bid-amount" inputMode="numeric" onChange={(event) => setAmount(event.target.value)} step="1" type="number" value={amount} />
        </div>
        <button className="rounded bg-emerald-500 px-6 py-3 font-black text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40" disabled={!isHumanTurn} onClick={() => bid(Number(amount))}>BID</button>
        <button className="rounded bg-amber-500 px-6 py-3 font-black text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40" disabled={!isHumanTurn} onClick={pass}>PASS</button>
        <button className="rounded bg-rose-500 px-6 py-3 font-black text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40" disabled={!isHumanTurn} onClick={notInterested}>NOT INTERESTED</button>
      </div>
      {!isHumanTurn && <p className="mx-auto mt-3 max-w-[1500px] text-center text-sm font-bold text-cyan-300">{teamName(card.activeTeamId)} AI is deciding… · Active turn</p>}
      {feedback && <p role="alert" className="mx-auto mt-3 max-w-[1500px] rounded bg-rose-950 p-3 text-rose-200">{feedback}</p>}
    </section>
  )
}

function MatchCard({ result, label, strengths }: {
  result: NonNullable<AuctionHarnessState['tournament']>['finalMatch']
  label: string
  strengths?: Readonly<Record<TeamId, { readonly overall: number }>>
}) {
  const inningsFor = (teamId: TeamId) => result.firstInnings.teamId === teamId
    ? result.firstInnings
    : result.secondInnings
  const teamA = inningsFor(result.teamAId)
  const teamB = inningsFor(result.teamBId)
  const flavor = strengths ? classifyMatch(result, strengths) : null
  return (
    <article className="rounded border border-slate-700 bg-slate-950/60 p-4" aria-label={label}>
      <h3 className="font-black text-white">{teamName(result.teamAId)} vs {teamName(result.teamBId)}</h3>
      {flavor && <span className="mt-2 inline-block rounded bg-amber-400/15 px-2 py-1 text-[0.65rem] font-black tracking-[0.16em] text-amber-300">{flavor}</span>}
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <p><span className="block text-slate-500">{teamName(teamA.teamId)}</span><strong className="text-lg text-white">{teamA.runs}/{teamA.wickets} ({teamA.overs} ov)</strong></p>
        <p><span className="block text-slate-500">{teamName(teamB.teamId)}</span><strong className="text-lg text-white">{teamB.runs}/{teamB.wickets} ({teamB.overs} ov)</strong></p>
      </div>
      <p className="mt-3 border-t border-slate-800 pt-3 text-sm font-bold text-emerald-300">{result.resultText.replace(result.winnerTeamId, teamName(result.winnerTeamId))}</p>
    </article>
  )
}

function Tournament({ state }: { state: AuctionHarnessState }) {
  const tournament = state.tournament
  const auction = state.auction
  if (tournament === null || auction === null) return null
  const strengths = Object.fromEntries(
    auction.teams.map((team) => [team.teamId, team.strength]),
  ) as Readonly<Record<TeamId, { readonly overall: number }>>
  const champion = auction.teams.find(({ teamId }) => teamId === tournament.championTeamId)!
  const championPlayers = [...champion.purchasedPlayers, ...champion.emergencyPlayers]
    .filter(({ player }) => champion.bestSix.playerIds.includes(player.id))
  const championStanding = tournament.standings.find(({ teamId }) => teamId === tournament.championTeamId)!
  return (
    <section className="mb-5 space-y-6 rounded-lg border border-cyan-500/60 bg-cyan-950/40 p-5" aria-labelledby="tournament-title">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-400">League</p>
        <h2 className="mt-1 text-2xl font-black uppercase tracking-wide text-cyan-200" id="tournament-title">League Matches</h2>
        <p className="mt-1 text-sm text-slate-400">Six automatic league matches using each team&apos;s fixed Best Six.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Six league matches">
          {tournament.leagueMatches.map((match, index) => (
            <MatchCard key={match.matchId} label={`League match ${index + 1}`} result={match} strengths={strengths} />
          ))}
        </div>
      </div>
      <div>
        <h2 className="text-xl font-black uppercase tracking-wide text-white">Standings</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left" aria-label="League standings">
            <thead className="border-b border-slate-600 text-xs uppercase tracking-wider text-slate-400"><tr><th className="p-2">Position</th><th className="p-2">Team</th><th className="p-2">Played</th><th className="p-2">Won</th><th className="p-2">Lost</th><th className="p-2">Points</th><th className="p-2">Overall</th></tr></thead>
            <tbody>{tournament.standings.map((standing) => <tr className="border-b border-slate-800" key={standing.teamId}><td className="p-2 font-black text-amber-300">{standing.position}</td><td className="p-2 font-bold text-white">{teamName(standing.teamId)}{standing.position <= 2 && <span className="ml-2 text-[0.6rem] font-black uppercase text-emerald-300">Qualified</span>}</td><td className="p-2">{standing.played}</td><td className="p-2">{standing.won}</td><td className="p-2">{standing.lost}</td><td className="p-2 font-black">{standing.points}</td><td className="p-2 text-slate-400">{standing.strength.overall}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="rounded-lg border border-amber-400/70 bg-amber-950/30 p-5">
        <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-300">Final</p>
        <p className="mt-2 text-lg font-bold text-white">1st · {teamName(tournament.finalistTeamIds[0])} vs 2nd · {teamName(tournament.finalistTeamIds[1])}</p>
        <div className="mt-4"><MatchCard label="Final match" result={tournament.finalMatch} strengths={strengths} /></div>
      </div>
      <div className="rounded-lg bg-emerald-500 p-6 text-center text-slate-950" role="status" aria-label="Tournament champion">
        <p className="text-sm font-black uppercase tracking-[0.35em]">Champion</p>
        <h2 className="mt-2 text-4xl font-black">CHAMPION — {teamName(tournament.championTeamId).toUpperCase()}</h2>
        <p className="mt-2 font-bold">Runner-up: {teamName(tournament.runnerUpTeamId)}</p>
        <p className="mt-1 font-semibold">{tournament.finalMatch.resultText.replace(tournament.championTeamId, teamName(tournament.championTeamId))}</p>
        <p className="mt-1 text-sm font-bold">League record {championStanding.won}–{championStanding.lost} · Strength {champion.strength.overall}</p>
        <ul className="mx-auto mt-4 flex max-w-3xl flex-wrap justify-center gap-2" aria-label="Champion Best Six">
          {championPlayers.map(({ player }) => <li className="rounded bg-emerald-950/20 px-3 py-1 text-sm font-black" key={player.id}>{player.name}</li>)}
        </ul>
        <button className="mt-5 rounded bg-slate-950 px-6 py-3 font-black text-white hover:bg-slate-800" onClick={() => state.createGame()}>PLAY AGAIN</button>
      </div>
    </section>
  )
}

function Auction({ state }: { state: AuctionHarnessState }) {
  const { auction, announcementEvent } = state
  const [selectedTeamId, setSelectedTeamId] = useState<TeamId>('team-a')
  if (auction === null) return null
  const announcement = announcementEvent === null ? null : announceAuctionEvent(announcementEvent, (teamId) => teamName(teamId))
  const resultHold = announcementEvent?.type === 'SOLD' || announcementEvent?.type === 'UNSOLD'
  const showPostAuction = auction.status === 'COMPLETE'
  const renderTeam = (team: PublicAuctionTeamState) => (
    <TeamCard
      announcerFocus={announcement?.emphasizedTeamId === team.teamId}
      auction={auction}
      key={team.teamId}
      onSelect={() => setSelectedTeamId(team.teamId)}
      personality={state.publicAiPersonalities[team.teamId]}
      selected={selectedTeamId === team.teamId}
      team={team}
    />
  )

  const topTeams = auction.teams.slice(0, 2)
  const bottomTeams = auction.teams.slice(2, 4)
  return (
    <div className="mt-5">
      {showPostAuction && <section className="mb-5 rounded border border-emerald-500 bg-emerald-950 p-6 text-center"><LiveAnnouncer event={announcementEvent} /><p className="mt-3 text-emerald-100">Emergency assignments and automatic Best Six selection are complete.</p></section>}
      {showPostAuction && <EmergencySignings auction={auction} />}
      {showPostAuction && <BestSixReveal auction={auction} />}
      {showPostAuction && <Tournament state={state} />}
      <div className="auction-table-layout grid items-start gap-4 lg:grid-cols-[minmax(210px,0.72fr)_minmax(470px,2fr)] xl:grid-cols-[minmax(230px,0.72fr)_minmax(520px,2fr)_minmax(230px,0.72fr)]">
        <BoughtPlayers auction={auction} selectedTeamId={selectedTeamId} onSelectTeam={setSelectedTeamId} />
        <section aria-label="Four teams" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">{topTeams.map(renderTeam)}</div>
          {auction.status === 'IN_PROGRESS' && <PlayerCard auction={auction} announcementEvent={announcementEvent} />}
          <div className="grid gap-4 sm:grid-cols-2">{bottomTeams.map(renderTeam)}</div>
        </section>
        <div className="lg:col-start-1 xl:col-start-auto"><AuctionHistory auction={auction} /></div>
      </div>
      {auction.status === 'IN_PROGRESS' && !resultHold && <div className="-mx-6 mt-5"><Controls auction={auction} feedback={state.feedback} bid={state.bid} pass={state.pass} notInterested={state.notInterested} key={`${auction.round}-${auction.currentCard?.cardNumber}-${auction.currentCard?.highestBid}`} /></div>}
    </div>
  )
}

export function AuctionHarnessApp({ store = useAuctionHarness }: { store?: HarnessStore }) {
  const state = store()
  const auctionStatus = state.auction?.status
  const auctionRound = state.auction?.round
  const currentCard = state.auction?.currentCard
  const currentCardNumber = currentCard?.cardNumber
  const activeTeamId = currentCard?.activeTeamId
  const currentHighestBid = currentCard?.highestBid
  const activeParticipantKind = state.auction !== null && activeTeamId !== undefined
    ? participantForTeam(state.auction.participants, activeTeamId)?.kind
    : undefined
  const isResultHold = state.announcementEvent?.type === 'SOLD' || state.announcementEvent?.type === 'UNSOLD'
  const shouldScheduleAI = state.stage === 'AUCTION' && auctionStatus === 'IN_PROGRESS' && !isResultHold
  useEffect(() => {
    if (state.stage !== 'AUCTION' || state.auction?.status !== 'IN_PROGRESS') return
    const interval = window.setInterval(() => store.getState().tick(), 1_000)
    return () => window.clearInterval(interval)
  }, [state.stage, state.auction?.status, store])
  useEffect(() => {
    if (!isResultHold) return
    const expectedAnnouncementId = state.announcementId
    const timeout = window.setTimeout(
      () => store.getState().advanceAnnouncement(expectedAnnouncementId),
      AUCTION_RESULT_HOLD_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [isResultHold, state.announcementId, store])
  useEffect(() => {
    if (
      !shouldScheduleAI ||
      activeParticipantKind !== 'AI' ||
      auctionRound === undefined ||
      currentCardNumber === undefined ||
      activeTeamId === undefined
    ) return
    const expectedTurn = {
      gameId: state.gameId,
      round: auctionRound,
      cardNumber: currentCardNumber,
      teamId: activeTeamId,
      highestBid: currentHighestBid ?? null,
    }
    const timeout = window.setTimeout(
      () => store.getState().actForAI(expectedTurn),
      AI_PRESENTATION_DELAY_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [
    state.gameId,
    shouldScheduleAI,
    activeParticipantKind,
    auctionRound,
    currentCardNumber,
    activeTeamId,
    currentHighestBid,
    store,
  ])
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
