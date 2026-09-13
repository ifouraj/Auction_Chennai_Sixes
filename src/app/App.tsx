import { useEffect, useRef, useState } from 'react'

import { AI_PRESENTATION_DELAY_MS, AUCTION_RESULT_HOLD_MS, MINIMUM_LEGAL_MONEY_UNIT } from '../domain/constants'
import { FRANCHISES } from '../domain/franchises'
import type { AuctionParticipant, TeamId } from '../domain/types'
import type { PublicAuctionState, PublicAuctionTeamState } from '../engine/auctionEngine'
import type { MatchResult } from '../engine/matchSimulator'
import { announceAuctionEvent, type AuctionPresentationEvent } from '../presentation/auctionAnnouncer'
import { classifyMatch } from '../presentation/matchFlavor'
import { formatMoney } from '../presentation/money'
import { TEAM_NAMES, useAuctionHarness, type AuctionHarnessState } from './auctionStore'

type HarnessStore = typeof useAuctionHarness

function teamName(teamId: TeamId | null): string {
  return teamId === null ? 'None' : (TEAM_NAMES[teamId] ?? teamId)
}

function Header({ state }: { state: AuctionHarnessState }) {
  const auction = state.auction
  return (
    <header className="game-header flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 pb-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-400">Four-team card-table auction</p>
        <h1 className="text-2xl font-black uppercase tracking-wide text-white">Chennai Sixes Auction</h1>
      </div>
      {auction && (
        <div className="auction-progress flex items-center gap-8 text-sm font-bold uppercase tracking-wider text-slate-300" aria-label="Auction progress">
          <span>{auction.phase === 'COMPLETE' ? 'Auction Complete' : `Round ${auction.round}`}</span>
          <span>{auction.status === 'COMPLETE' ? `${auction.results.length} players processed` : `Player ${auction.playerIndex + 1} / ${auction.totalPlayers}`}</span>
        </div>
      )}
      {state.stage !== 'WELCOME' && state.tournament?.stage !== 'GAME_OVER' && (
        <button className="rounded border border-rose-500 bg-rose-950 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-900" onClick={state.requestQuit}>Quit</button>
      )}
    </header>
  )
}

function Welcome({ state }: { state: AuctionHarnessState }) {
  return (
    <section className="welcome-screen grid min-h-[65vh] place-items-center text-center">
      <div>
        <h2 className="text-2xl font-bold">Choose your franchise</h2>
        <p className="mt-2 max-w-2xl text-slate-400">Three distinct AI opponents will be selected from the remaining franchises. Every team starts equal.</p>
        <div className="franchise-grid mt-6 grid max-w-5xl gap-3 text-left sm:grid-cols-2 lg:grid-cols-5" role="radiogroup" aria-label="Choose franchise">
          {FRANCHISES.map((franchise) => <button aria-checked={state.selectedFranchiseId === franchise.id} className={`rounded border p-3 ${state.selectedFranchiseId === franchise.id ? 'border-cyan-300 bg-cyan-950' : 'border-slate-700 bg-slate-900'}`} key={franchise.id} onClick={() => state.selectFranchise(franchise.id)} role="radio" type="button"><span className="block font-black text-white">{franchise.name}</span><span className="mt-1 block text-xs text-slate-400">{franchise.note}</span></button>)}
        </div>
        <button className="mt-6 rounded bg-cyan-500 px-6 py-3 font-bold text-slate-950 hover:bg-cyan-400" onClick={() => state.createGame()}>
          Start New Auction Game
        </button>
      </div>
    </section>
  )
}

function PreAuction({ playerCount, startAuction }: { playerCount: number; startAuction: () => void }) {
  return (
    <section className="mt-6">
      <div className="pre-auction-header flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Auction briefing</h2>
          <p className="text-slate-400">{playerCount} secret players will be revealed one at a time.</p>
        </div>
        <button className="rounded bg-emerald-500 px-5 py-3 font-bold text-slate-950 hover:bg-emerald-400" onClick={startAuction}>Start Round 1</button>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Auction rules summary">
        <div className="rounded border border-slate-700 bg-slate-900 p-4"><dt className="text-xs uppercase text-slate-500">Players</dt><dd className="mt-1 text-2xl font-black">{playerCount}</dd></div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4"><dt className="text-xs uppercase text-slate-500">Team seats</dt><dd className="mt-1 text-2xl font-black">4</dd></div>
        <div className="rounded border border-slate-700 bg-slate-900 p-4"><dt className="text-xs uppercase text-slate-500">Starting purse</dt><dd className="mt-1 text-2xl font-black">{formatMoney(300)}</dd></div>
      </dl>
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
    <article aria-label={`${teamName(team.teamId)} auction seat`} className={`team-card relative overflow-hidden rounded-lg border p-4 transition ${isActive ? 'border-cyan-200 bg-cyan-950/80 shadow-[0_0_0_2px_rgba(103,232,249,0.35),0_0_24px_rgba(34,211,238,0.12)]' : selected ? 'border-slate-400 bg-slate-800' : 'border-slate-700 bg-slate-900'} ${announcerFocus && !isActive ? 'announcer-team-focus' : ''} ${status === 'NOT INTERESTED' ? 'opacity-60' : ''}`} data-active={isActive ? 'true' : 'false'} data-announcer-focus={announcerFocus ? 'true' : 'false'}>
      {isActive && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-cyan-300" />}
      <button className="w-full text-left" onClick={onSelect} type="button">
        <span className="flex items-center justify-between gap-2">
          <span>
            <span className="block truncate font-black uppercase tracking-wide text-white">{teamName(team.teamId)}</span>
            <span className="mt-0.5 block text-[0.65rem] font-black uppercase tracking-[0.18em] text-slate-400">{participant?.kind === 'AI' ? `AI · ${personality ?? 'AI'}` : 'YOU'}</span>
          </span>
          <span className={`rounded px-2 py-1 text-[0.65rem] font-black tracking-wider ${isActive ? 'bg-cyan-300 text-slate-950' : status === 'LEADING' ? 'bg-emerald-400/20 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>{status}</span>
        </span>
        <span className="team-card-summary mt-3 grid grid-cols-2 gap-3 text-sm">
          <span><span className="block text-xs uppercase text-slate-500">Balance</span><strong className="text-lg text-white">{formatMoney(team.balance)}</strong></span>
          <span><span className="block text-xs uppercase text-slate-500">Players</span><strong className="text-lg text-white">{team.availablePlayerCount}</strong></span>
        </span>
        <dl
          aria-label={`${teamName(team.teamId)} strength`}
          className="team-card-strength mt-3 grid grid-cols-5 gap-1 border-t border-slate-700 pt-3 text-center"
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
        <span className="team-card-detail mt-2 block text-xs text-slate-500">Seat {(participant?.seatIndex ?? 0) + 1} · {participant?.kind === 'AI' ? 'AI' : 'Human'} · {team.purchasedPlayerCount} bought{team.emergencyPlayers.length > 0 ? ` + ${team.emergencyPlayers.length} emergency` : ''} · Select squad</span>
      </button>
      {isActive && (
        <div className="team-card-timer mt-3 flex items-end justify-between border-t border-cyan-800 pt-3">
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
    <div className="player-card relative rounded-xl border border-amber-400/70 bg-slate-900 px-5 py-6 text-center shadow-xl shadow-black/20" aria-label="Central auction area">
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
      <p className="player-description mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-300">{player.description}</p>
      <dl className="player-ratings mx-auto mt-5 grid max-w-xl grid-cols-5 gap-2">
        {stats.map(([label, value]) => (
          <div className={`rounded border px-2 py-3 ${label === 'Overall' ? 'border-amber-500/50 bg-amber-950/40' : 'border-slate-700 bg-slate-800'}`} key={label}>
            <dt className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
            <dd className="mt-1 text-xl font-black text-white">{value}</dd>
          </div>
        ))}
      </dl>
      {!heldResult && <LiveAnnouncer event={announcementEvent} />}
      <div className="player-prices mx-auto mt-5 grid max-w-xl gap-3 border-t border-slate-700 pt-5 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-950/70 px-4 py-3">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-slate-500">{card.basePrice === null ? 'Round 2 opening' : 'Round 1 base price'}</p>
          {card.basePrice === null
            ? <p className="mt-1 font-black uppercase text-violet-300">No base price <span className="block text-xs font-semibold normal-case text-slate-400">Opening floor {formatMoney(MINIMUM_LEGAL_MONEY_UNIT)}</span></p>
            : <p className="mt-1 text-2xl font-black text-white">{formatMoney(card.basePrice)}</p>}
        </div>
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-3" aria-label="Current bid">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-emerald-300">Current Bid</p>
          {card.highestBid === null ? (
            <>
              <p className="mt-1 text-xl font-black text-white">No bid yet</p>
              <p className="text-xs text-slate-400">{card.basePrice === null ? `Open from ${formatMoney(MINIMUM_LEGAL_MONEY_UNIT)}` : `Opening at ${formatMoney(card.basePrice)}`}</p>
            </>
          ) : (
            <>
              <p className="mt-1 text-3xl font-black text-white">{formatMoney(card.highestBid)}</p>
              <p className="text-xs font-black uppercase tracking-wider text-emerald-300">{teamName(card.highestBidderId)} leading</p>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

function BoughtPlayers({ auction, selectedTeamId, onSelectTeam, idSuffix = '' }: {
  auction: PublicAuctionState
  selectedTeamId: TeamId
  onSelectTeam: (teamId: TeamId) => void
  idSuffix?: string
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
    <aside className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 p-4" aria-labelledby={`bought-players-title${idSuffix}`}>
      <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white" id={`bought-players-title${idSuffix}`}>Bought Players / Squad</h2>
      <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor={`bought-team${idSuffix}`}>Team</label>
      <select className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 font-semibold text-white" id={`bought-team${idSuffix}`} onChange={(event) => onSelectTeam(event.target.value)} value={selectedTeam.teamId}>
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
              </span><span className={`shrink-0 font-black ${source === 'EMERGENCY' ? 'text-rose-300' : 'text-amber-300'}`}>{source === 'EMERGENCY' ? 'FREE' : formatMoney(pricePaid)}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function AuctionHistory({ auction, idSuffix = '' }: { auction: PublicAuctionState; idSuffix?: string }) {
  const scrollRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const history = scrollRef.current
    if (history !== null) history.scrollTop = history.scrollHeight
  }, [auction.results.length])

  return (
    <aside className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 p-4" aria-labelledby={`auction-history-title${idSuffix}`}>
      <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white" id={`auction-history-title${idSuffix}`}>Auction History</h2>
      {auction.results.length === 0 ? <p className="mt-5 text-sm text-slate-500">Results will appear here chronologically.</p> : (
        <ol aria-label="Auction history" className="auction-history-scroll mt-4 divide-y divide-slate-800 pr-2" ref={scrollRef} style={{ maxHeight: 'min(36rem, 58vh)', overflowY: 'auto' }} tabIndex={0}>
          {auction.results.map((result, index) => (
            <li className="py-3 text-sm" key={`${result.cardNumber}-${result.player.id}-${index}`}>
              <span className="block font-bold text-white">{result.player.name}</span>
              {result.outcome === 'SOLD' ? <span className="mt-1 block text-slate-400">{teamName(result.buyerTeamId)} · <strong className="text-emerald-300">{formatMoney(result.price)}</strong></span> : <span className="mt-1 block font-black tracking-wider text-rose-300">UNSOLD</span>}
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}

type MobilePanel = 'SQUADS' | 'HISTORY' | null

function MobileAuctionAccess({ auction, selectedTeamId, onSelectTeam }: {
  auction: PublicAuctionState
  selectedTeamId: TeamId
  onSelectTeam: (teamId: TeamId) => void
}) {
  const [panel, setPanel] = useState<MobilePanel>(null)

  useEffect(() => {
    if (panel === null) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [panel])

  return (
    <div className="mobile-auction-access">
      <nav aria-label="Mobile auction information" className="grid grid-cols-2 gap-2">
        <button className="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-black tracking-[0.16em] text-cyan-200" onClick={() => setPanel('SQUADS')} type="button">SQUADS</button>
        <button className="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-black tracking-[0.16em] text-cyan-200" onClick={() => setPanel('HISTORY')} type="button">HISTORY</button>
      </nav>
      {panel !== null && (
        <div className="mobile-sheet-backdrop fixed inset-0 z-40 flex items-end bg-black/70" onClick={() => setPanel(null)}>
          <section aria-label={`${panel === 'SQUADS' ? 'Squads' : 'History'} mobile panel`} aria-modal="true" className="mobile-sheet max-h-[82dvh] w-full overflow-y-auto rounded-t-2xl border border-slate-600 bg-slate-950 p-3 pb-6 shadow-2xl" onClick={(event) => event.stopPropagation()} role="dialog">
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">{panel}</p>
              <button aria-label={`Close ${panel.toLowerCase()}`} className="rounded border border-slate-600 px-3 py-1.5 text-sm font-black text-white" onClick={() => setPanel(null)} type="button">CLOSE</button>
            </div>
            {panel === 'SQUADS'
              ? <BoughtPlayers auction={auction} idSuffix="-mobile" onSelectTeam={onSelectTeam} selectedTeamId={selectedTeamId} />
              : <AuctionHistory auction={auction} idSuffix="-mobile" />}
          </section>
        </div>
      )}
    </div>
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
  const suggestedBid = card?.highestBid === null ? (card.basePrice ?? MINIMUM_LEGAL_MONEY_UNIT) : (card?.highestBid ?? 0) + MINIMUM_LEGAL_MONEY_UNIT
  const [amount, setAmount] = useState(String(suggestedBid))
  if (card === null) return null
  const activeParticipant = participantForTeam(auction.participants, card.activeTeamId)
  const isHumanTurn = activeParticipant?.kind === 'HUMAN_LOCAL'
  return (
    <section className="auction-controls border-t border-cyan-800 bg-slate-900 px-4 py-4" aria-label="Auction controls" aria-disabled={!isHumanTurn}>
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-center gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="bid-amount">Bid amount · <span>{teamName(card.activeTeamId)}</span></label>
          <input aria-label="Bid amount" className="mt-1 w-36 rounded border border-slate-600 bg-slate-950 px-3 py-2 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={!isHumanTurn} id="bid-amount" inputMode="numeric" onChange={(event) => setAmount(event.target.value)} step={MINIMUM_LEGAL_MONEY_UNIT} type="number" value={amount} />
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
  result: MatchResult
  label: string
  strengths?: Readonly<Record<TeamId, { readonly overall: number }>>
}) {
  const flavor = strengths ? classifyMatch(result, strengths) : null
  const inningsBlock = (innings: typeof result.firstInnings) => (
    <section className="rounded border border-slate-800 bg-slate-900/70 p-3" key={innings.teamId}>
      <div className="flex items-baseline justify-between gap-3"><h4 className="font-black uppercase text-white">{teamName(innings.teamId)}</h4><strong className="text-xl text-white">{innings.runs}/{innings.wickets}</strong></div>
      <p className="text-xs text-slate-500">{innings.overs} overs</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div><p className="text-[0.65rem] font-black uppercase tracking-wider text-cyan-300">Batting</p>{innings.batting.map((batter) => <p className="mt-1 flex justify-between gap-3 text-sm" key={batter.playerId}><span className="text-slate-300">{batter.playerName}</span><strong>{batter.runs}{batter.notOut ? '*' : ''}</strong></p>)}</div>
        <div><p className="text-[0.65rem] font-black uppercase tracking-wider text-amber-300">Opposition bowling</p>{innings.bowling.map((bowler) => <p className="mt-1 flex justify-between gap-3 text-sm" key={bowler.playerId}><span className="text-slate-300">{bowler.playerName}</span><strong>{bowler.wickets}/{bowler.runsConceded}</strong></p>)}</div>
      </div>
    </section>
  )
  return (
    <article className="rounded border border-slate-700 bg-slate-950/60 p-4" aria-label={label}>
      <h3 className="font-black text-white">{teamName(result.teamAId)} vs {teamName(result.teamBId)}</h3>
      {flavor && <span className="mt-2 inline-block rounded bg-amber-400/15 px-2 py-1 text-[0.65rem] font-black tracking-[0.16em] text-amber-300">{flavor}</span>}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">{inningsBlock(result.firstInnings)}{inningsBlock(result.secondInnings)}</div>
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
  const currentLeagueMatch = tournament.revealedLeagueMatches.at(-1)!
  const showingMatch = tournament.stage === 'MATCH'
  const showingStandings = tournament.stage === 'STANDINGS' || tournament.stage === 'LEAGUE_COMPLETE'
  const leagueComplete = tournament.stage === 'LEAGUE_COMPLETE'
  const humanQualified = tournament.finalistTeamIds?.includes('team-a') ?? false
  const gameOver = tournament.stage === 'GAME_OVER'
  return (
    <section className="mb-5 space-y-6 rounded-lg border border-cyan-500/60 bg-cyan-950/40 p-5" aria-labelledby="tournament-title">
      {showingMatch && <>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-400">Match {tournament.revealedLeagueMatches.length} of 6</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-wide text-cyan-200" id="tournament-title">Match {tournament.revealedLeagueMatches.length} Summary</h2>
          <div className="mt-4" aria-label="Current league match">
            <MatchCard label={`League match ${tournament.revealedLeagueMatches.length}`} result={currentLeagueMatch} strengths={strengths} />
          </div>
        </div>
        <button className="w-full rounded bg-cyan-400 px-5 py-3 font-black text-slate-950 hover:bg-cyan-300" onClick={state.advanceTournament}>CONTINUE</button>
      </>}
      {showingStandings && <>
        <div>
          <h2 className="text-xl font-black uppercase tracking-wide text-white">{leagueComplete ? 'Final League Table' : `Standings after Match ${tournament.revealedLeagueMatches.length}`}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left" aria-label="League standings">
              <thead className="border-b border-slate-600 text-xs uppercase tracking-wider text-slate-400"><tr><th className="p-2">Position</th><th className="p-2">Team</th><th className="p-2">Played</th><th className="p-2">Won</th><th className="p-2">Lost</th><th className="p-2">Points</th></tr></thead>
              <tbody>{tournament.standings.map((standing) => <tr className="border-b border-slate-800" key={standing.teamId}><td className="p-2 font-black text-amber-300">{standing.position}</td><td className="p-2 font-bold text-white">{teamName(standing.teamId)}{leagueComplete && standing.position <= 2 && <span className="ml-2 text-[0.6rem] font-black uppercase text-emerald-300">Qualified</span>}</td><td className="p-2">{standing.played}</td><td className="p-2">{standing.won}</td><td className="p-2">{standing.lost}</td><td className="p-2 font-black">{standing.points}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        {tournament.stage === 'STANDINGS' && <button className="w-full rounded bg-cyan-400 px-5 py-3 font-black text-slate-950 hover:bg-cyan-300" onClick={state.advanceTournament}>NEXT MATCH</button>}
        {leagueComplete && <div className="rounded-lg border border-amber-400/70 bg-amber-950/30 p-5 text-center">
          <p className={`text-2xl font-black ${humanQualified ? 'text-emerald-300' : 'text-rose-300'}`}>{humanQualified ? 'QUALIFIED FOR THE FINAL' : 'KNOCKED OUT'}</p>
          <button className="mt-4 rounded bg-amber-400 px-5 py-3 font-black text-slate-950 hover:bg-amber-300" onClick={state.advanceTournament}>CONTINUE TO FINAL</button>
        </div>}
      </>}
      {tournament.stage === 'FINAL_READY' && tournament.finalistTeamIds && <div className="rounded-lg border border-amber-400/70 bg-amber-950/30 p-6 text-center">
        <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-300">The Final</p>
        <h2 className="mt-2 text-3xl font-black uppercase text-white" id="tournament-title">Finalists</h2>
        <p className="mt-4 text-xl font-bold text-white">1st · {teamName(tournament.finalistTeamIds[0])} vs 2nd · {teamName(tournament.finalistTeamIds[1])}</p>
        <p className="mt-2 text-sm text-slate-400">The result remains hidden until you play the Final.</p>
        <button className="mt-5 rounded bg-amber-400 px-6 py-3 font-black text-slate-950 hover:bg-amber-300" onClick={state.advanceTournament}>PLAY FINAL</button>
      </div>}
      {gameOver && tournament.finalMatch && <>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">Final Result</p>
          <h2 className="mt-1 text-2xl font-black uppercase tracking-wide text-white" id="tournament-title">Tournament Final</h2>
          <div className="mt-4"><MatchCard label="Final match" result={tournament.finalMatch} strengths={strengths} /></div>
        </div>
        <div className="rounded-lg bg-emerald-500 p-6 text-center text-slate-950" role="status" aria-label="Tournament champion">
          {humanQualified && <p className="text-xl font-black uppercase tracking-[0.25em]">{tournament.championTeamId === 'team-a' ? 'CHAMPIONS' : 'RUNNERS-UP'}</p>}
          <p className="mt-2 text-sm font-black uppercase tracking-[0.35em]">Tournament Champion</p>
          <h2 className="mt-2 text-4xl font-black">{teamName(tournament.championTeamId).toUpperCase()}</h2>
          <p className="mt-2 font-bold">Runner-up: {teamName(tournament.runnerUpTeamId)}</p>
          <p className="mt-5 text-sm font-black uppercase tracking-[0.3em]">Game Over</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3"><button className="rounded bg-slate-950 px-6 py-3 font-black text-white hover:bg-slate-800" onClick={() => state.createGame()}>PLAY AGAIN</button><button className="rounded border border-slate-950 px-6 py-3 font-black hover:bg-emerald-400" onClick={state.mainMenu}>MAIN MENU</button></div>
        </div>
      </>}
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
      {showPostAuction && <Tournament state={state} />}
      {!showPostAuction && <div className="auction-table-layout grid items-start gap-4 lg:grid-cols-[minmax(210px,0.72fr)_minmax(470px,2fr)] xl:grid-cols-[minmax(230px,0.72fr)_minmax(520px,2fr)_minmax(230px,0.72fr)]">
        <div className="desktop-auction-panel"><BoughtPlayers auction={auction} selectedTeamId={selectedTeamId} onSelectTeam={setSelectedTeamId} /></div>
        <section aria-label="Four teams" className="auction-center space-y-4">
          <div className="team-row team-row-top grid gap-4 sm:grid-cols-2">{topTeams.map(renderTeam)}</div>
          {auction.status === 'IN_PROGRESS' && <PlayerCard auction={auction} announcementEvent={announcementEvent} />}
          <div className="team-row team-row-bottom grid gap-4 sm:grid-cols-2">{bottomTeams.map(renderTeam)}</div>
        </section>
        <div className="desktop-auction-panel lg:col-start-1 xl:col-start-auto"><AuctionHistory auction={auction} /></div>
      </div>}
      {!showPostAuction && <MobileAuctionAccess auction={auction} onSelectTeam={setSelectedTeamId} selectedTeamId={selectedTeamId} />}
      {auction.status === 'IN_PROGRESS' && !resultHold && <div className="auction-controls-shell -mx-6 mt-5"><Controls auction={auction} feedback={state.feedback} bid={state.bid} pass={state.pass} notInterested={state.notInterested} key={`${auction.round}-${auction.currentCard?.cardNumber}-${auction.currentCard?.highestBid}`} /></div>}
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
    <main className="app-shell min-h-screen bg-slate-950 px-6 py-6 text-slate-100">
      <div className="mx-auto max-w-[1500px]">
        <Header state={state} />
        {state.stage === 'WELCOME' && <Welcome state={state} />}
        {state.stage === 'PRE_AUCTION' && <PreAuction playerCount={state.auctionPlayerCount} startAuction={state.startAuction} />}
        {state.stage === 'AUCTION' && <Auction state={state} />}
        {state.quitConfirmationOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-labelledby="quit-title">
          <div className="w-full max-w-md rounded-lg border border-rose-500 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-xl font-black text-white" id="quit-title">Quit current game?</h2>
            <p className="mt-2 text-slate-300">Your current auction/tournament progress will be lost.</p>
            <div className="mt-5 flex justify-end gap-3"><button className="rounded border border-slate-600 px-4 py-2 font-bold" onClick={state.cancelQuit}>Cancel</button><button className="rounded bg-rose-500 px-4 py-2 font-black text-white" onClick={state.confirmQuit}>Quit Game</button></div>
          </div>
        </div>}
      </div>
    </main>
  )
}

function App() { return <AuctionHarnessApp /> }

export default App
