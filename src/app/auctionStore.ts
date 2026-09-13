import { create, type StoreApi, type UseBoundStore } from 'zustand'

import type { AuctionParticipant, Player, PlayerPool, TeamId } from '../domain/types'
import { FRANCHISES, selectGameFranchises } from '../domain/franchises'
import {
  createAIAuctionDecisionContext,
  createAIDecisionRandom,
  evaluateAuctionDecision,
  type AIDecisionEvaluation,
} from '../engine/aiBidding'
import {
  advanceTurnTimer,
  AuctionRuleError,
  getPublicAuctionState,
  markNotInterested,
  passTurn,
  placeBid,
  startRound1Auction,
  type AuctionCardResult,
  type AuctionState,
  type PublicAuctionState,
} from '../engine/auctionEngine'
import { createM2PlayerPool } from '../engine/playerPool'
import {
  calculateLeagueStandings,
  simulateTournament,
  type LeagueStanding,
  type TournamentResult,
  type TournamentTeamInput,
} from '../engine/tournamentEngine'
import type { MatchResult } from '../engine/matchSimulator'
import {
  eventAfterPublicAction,
  eventAfterResultHold,
  getTurnContext,
  type AuctionPresentationEvent,
} from '../presentation/auctionAnnouncer'
import {
  getPublicAIPersonalityLabel,
  type PublicAIPersonalityLabel,
} from '../presentation/aiPersonality'

export const DEFAULT_PARTICIPANTS: readonly AuctionParticipant[] = [
  { id: 'participant-a', teamId: 'team-a', seatIndex: 0, kind: 'HUMAN_LOCAL' },
  { id: 'participant-b', teamId: 'team-b', seatIndex: 1, kind: 'AI' },
  { id: 'participant-c', teamId: 'team-c', seatIndex: 2, kind: 'AI' },
  { id: 'participant-d', teamId: 'team-d', seatIndex: 3, kind: 'AI' },
]

export interface AITurnIdentity {
  readonly gameId: number
  readonly round: 1 | 2
  readonly cardNumber: number
  readonly teamId: TeamId
  readonly highestBid: number | null
}

export const TEAM_NAMES: Readonly<Record<TeamId, string>> = {
  'team-a': FRANCHISES[0].name,
  'team-b': FRANCHISES[1].name,
  'team-c': FRANCHISES[2].name,
  'team-d': FRANCHISES[3].name,
}

export type HarnessStage = 'WELCOME' | 'PRE_AUCTION' | 'AUCTION'
export type TournamentStage = 'MATCH' | 'STANDINGS' | 'LEAGUE_COMPLETE' | 'FINAL_READY' | 'GAME_OVER'

export interface PublicTournamentProgress {
  readonly tournamentId: string
  readonly stage: TournamentStage
  readonly revealedLeagueMatches: readonly MatchResult[]
  readonly standings: readonly LeagueStanding[]
  readonly finalistTeamIds: readonly [TeamId, TeamId] | null
  readonly finalMatch: MatchResult | null
  readonly championTeamId: TeamId | null
  readonly runnerUpTeamId: TeamId | null
}

export interface AuctionHarnessState {
  readonly stage: HarnessStage
  readonly auctionPlayerCount: number
  readonly auction: PublicAuctionState | null
  readonly lastResult: AuctionCardResult | null
  readonly lastAiDecision: AIDecisionEvaluation | null
  readonly tournament: PublicTournamentProgress | null
  readonly feedback: string | null
  readonly announcementEvent: AuctionPresentationEvent | null
  readonly announcementId: number
  readonly publicAiPersonalities: Readonly<Partial<Record<TeamId, PublicAIPersonalityLabel>>>
  readonly gameId: number
  readonly selectedFranchiseId: string
  readonly teamNames: Readonly<Record<TeamId, string>>
  selectFranchise: (franchiseId: string) => void
  createGame: (seed?: number) => void
  startAuction: () => void
  bid: (amount: number) => void
  pass: () => void
  notInterested: () => void
  actForAI: (expectedTurn: AITurnIdentity) => void
  tick: () => void
  advanceAnnouncement: (expectedAnnouncementId: number) => void
  advanceTournament: () => void
  readonly quitConfirmationOpen: boolean
  requestQuit: () => void
  cancelQuit: () => void
  confirmQuit: () => void
  mainMenu: () => void
}

const errorMessages: Readonly<Record<string, string>> = {
  AUCTION_NOT_ACTIVE: 'The auction is not active.',
  NOT_ACTIVE_TEAM: 'Only the team whose turn is shown can act.',
  TEAM_NOT_INTERESTED: 'This team has left bidding for this player.',
  HIGHEST_BIDDER_CANNOT_RAISE_SELF: 'The highest bidder cannot bid against itself.',
  BID_MUST_BE_INTEGER: 'Bid must be a whole number.',
  BID_MUST_USE_LEGAL_INCREMENT: 'Bids must use clean ₹10 lakh increments.',
  BID_BELOW_BASE_PRICE: 'Bid is below the Round 1 base price.',
  BID_BELOW_MINIMUM_MONEY_UNIT: 'Round 2 opening bid must be at least ₹10 lakh.',
  BID_MUST_EXCEED_CURRENT: 'Bid must be greater than the current highest bid.',
  BID_EXCEEDS_BALANCE: 'Bid exceeds this team\'s balance.',
  BID_MUST_LEAVE_NON_ZERO_BALANCE: 'Bank rule: this team must retain a non-zero balance.',
  INVALID_TIMER_ELAPSE: 'The timer received an invalid elapsed time.',
  INVALID_TIMER_STATE: 'The auction timer is out of sync.',
}

function resultAfterAction(
  before: AuctionState,
  after: AuctionState,
): AuctionCardResult | null {
  return after.results.length > before.results.length
    ? after.results.at(-1) ?? null
    : null
}

function friendlyError(error: unknown): string {
  if (error instanceof AuctionRuleError) {
    return errorMessages[error.code] ?? error.code
  }
  return error instanceof Error ? error.message : 'Unknown auction error.'
}

export function createAuctionHarnessStore(
  initialSeed?: number,
): UseBoundStore<StoreApi<AuctionHarnessState>> {
  let pendingPool: PlayerPool | null = null
  let engineState: AuctionState | null = null
  let decisionRandom = createAIDecisionRandom(initialSeed ?? 0)
  let gameId = 0
  let currentGameSeed = initialSeed ?? 0
  let announcementId = 0
  let fullTournament: TournamentResult | null = null
  let tournamentTeams: readonly TournamentTeamInput[] = []
  let heldResultPlayer: Player | null = null
  let selectedFranchiseId = FRANCHISES[0].id

  const auctionForPresentation = (state: PublicAuctionState): PublicAuctionState =>
    heldResultPlayer === null || state.currentCard === null
      ? state
      : { ...state, currentCard: { ...state.currentCard, player: heldResultPlayer } }

  const publicTournament = (
    stage: TournamentStage,
    revealedCount: number,
  ): PublicTournamentProgress | null => {
    if (fullTournament === null) return null
    const revealedLeagueMatches = fullTournament.leagueMatches.slice(0, revealedCount)
    const leagueComplete = revealedCount === fullTournament.leagueMatches.length
    return {
      tournamentId: fullTournament.tournamentId,
      stage,
      revealedLeagueMatches,
      standings: calculateLeagueStandings(tournamentTeams, revealedLeagueMatches),
      finalistTeamIds: leagueComplete ? fullTournament.finalistTeamIds : null,
      finalMatch: stage === 'GAME_OVER' ? fullTournament.finalMatch : null,
      championTeamId: stage === 'GAME_OVER' ? fullTournament.championTeamId : null,
      runnerUpTeamId: stage === 'GAME_OVER' ? fullTournament.runnerUpTeamId : null,
    }
  }

  const tournamentFromAuction = (): PublicTournamentProgress | null => {
    if (engineState?.status !== 'COMPLETE') return null
    if (fullTournament !== null) return publicTournament('MATCH', 1)
    const publicState = getPublicAuctionState(engineState)
    tournamentTeams = publicState.teams.map((team): TournamentTeamInput => {
      const participant = publicState.participants.find(
        (candidate) => candidate.teamId === team.teamId,
      )
      if (participant === undefined || !team.bestSix.isComplete) {
        throw new Error(`Completed auction has no complete Best Six for ${team.teamId}`)
      }
      const selectedIds = new Set(team.bestSix.playerIds)
      const bestSix = [
        ...team.purchasedPlayers.map(({ player }) => player),
        ...team.emergencyPlayers.map(({ player }) => player),
      ].filter(({ id }) => selectedIds.has(id))
      return { teamId: team.teamId, seatIndex: participant.seatIndex, bestSix }
    })
    fullTournament = simulateTournament(tournamentTeams, currentGameSeed)
    return publicTournament('MATCH', 1)
  }

  return create<AuctionHarnessState>((set) => {
    const applyEngineCommand = (
      command: (state: AuctionState, teamId: TeamId) => AuctionState,
      action: 'BID' | 'PASS' | 'NOT_INTERESTED',
      expectedKind?: AuctionParticipant['kind'],
    ): void => {
      if (engineState === null || engineState.currentCard === null) return
      const before = engineState
      const activeTeamId = engineState.currentCard.activeTeamId
      const participant = engineState.participants.find(
        (candidate) => candidate.teamId === activeTeamId,
      )
      if (expectedKind !== undefined && participant?.kind !== expectedKind) return
      try {
        const beforePublic = getPublicAuctionState(before)
        engineState = command(before, activeTeamId)
        const afterPublic = getPublicAuctionState(engineState)
        announcementId += 1
        const result = resultAfterAction(before, engineState)
        const event = eventAfterPublicAction(
            beforePublic,
            afterPublic,
            action,
            activeTeamId,
          )
        heldResultPlayer = result?.player ?? null
        set({
          auction: auctionForPresentation(afterPublic),
          lastResult: result,
          announcementEvent: event,
          announcementId,
          tournament: tournamentFromAuction(),
          feedback: null,
        })
      } catch (error) {
        set({ feedback: friendlyError(error) })
      }
    }

    return {
      stage: 'WELCOME',
      auctionPlayerCount: 25,
      auction: null,
      lastResult: null,
      lastAiDecision: null,
      tournament: null,
      feedback: null,
      announcementEvent: null,
      announcementId,
      publicAiPersonalities: {},
      gameId,
      selectedFranchiseId,
      teamNames: TEAM_NAMES,
      selectFranchise: (franchiseId) => {
        if (FRANCHISES.some(({ id }) => id === franchiseId)) {
          selectedFranchiseId = franchiseId
          set({ selectedFranchiseId: franchiseId })
        }
      },
      quitConfirmationOpen: false,
      createGame: (seed = initialSeed ?? Date.now()) => {
        gameId += 1
        currentGameSeed = seed
        pendingPool = createM2PlayerPool(seed)
        engineState = null
        fullTournament = null
        tournamentTeams = []
        heldResultPlayer = null
        decisionRandom = createAIDecisionRandom(seed)
        const franchises = selectGameFranchises(selectedFranchiseId, seed)
        const teamNames = Object.fromEntries(Object.entries(franchises).map(([teamId, franchise]) =>
          [teamId, franchise.name],
        ))
        Object.assign(TEAM_NAMES, teamNames)
        set({
          stage: 'PRE_AUCTION',
          auctionPlayerCount: pendingPool.selectedPool.length,
          auction: null,
          lastResult: null,
          lastAiDecision: null,
          tournament: null,
          feedback: null,
          announcementEvent: null,
          announcementId,
          publicAiPersonalities: {},
          gameId,
          teamNames,
          quitConfirmationOpen: false,
        })
      },
      startAuction: () => {
        if (pendingPool === null) return
        engineState = startRound1Auction(pendingPool, DEFAULT_PARTICIPANTS)
        const publicState = getPublicAuctionState(engineState)
        const turn = getTurnContext(publicState)
        const publicAiPersonalities = Object.fromEntries(
          Object.entries(engineState.aiPersonalities).flatMap(([teamId, personality]) =>
            personality === undefined
              ? []
              : [[teamId, getPublicAIPersonalityLabel(personality)]],
          ),
        )
        announcementId += 1
        set({
          stage: 'AUCTION',
          auction: publicState,
          lastResult: null,
          lastAiDecision: null,
          tournament: null,
          feedback: null,
          announcementEvent: turn === null || publicState.currentCard === null ? null : {
            type: 'PLAYER_REVEAL',
            player: publicState.currentCard.player,
            round: publicState.round,
            turn,
          },
          announcementId,
          publicAiPersonalities,
        })
      },
      bid: (amount) => applyEngineCommand(
        (state, teamId) => placeBid(state, teamId, amount),
        'BID',
        'HUMAN_LOCAL',
      ),
      pass: () => applyEngineCommand(passTurn, 'PASS', 'HUMAN_LOCAL'),
      notInterested: () => applyEngineCommand(markNotInterested, 'NOT_INTERESTED', 'HUMAN_LOCAL'),
      actForAI: (expectedTurn) => {
        if (
          engineState === null ||
          engineState.currentCard === null ||
          expectedTurn.gameId !== gameId ||
          engineState.round !== expectedTurn.round ||
          engineState.currentCard.cardNumber !== expectedTurn.cardNumber ||
          engineState.currentCard.activeTeamId !== expectedTurn.teamId ||
          engineState.currentCard.highestBid !== expectedTurn.highestBid
        ) return
        const participant = engineState.participants.find(
          ({ teamId }) => teamId === expectedTurn.teamId,
        )
        const personality = engineState.aiPersonalities[expectedTurn.teamId]
        if (participant?.kind !== 'AI' || personality === undefined) return

        const publicState = getPublicAuctionState(engineState)
        const evaluation = evaluateAuctionDecision(
          createAIAuctionDecisionContext(publicState, expectedTurn.teamId),
          personality,
          decisionRandom,
        )
        const before = engineState
        try {
          engineState = evaluation.action.type === 'BID'
            ? placeBid(before, expectedTurn.teamId, evaluation.action.amount)
            : evaluation.action.type === 'PASS'
              ? passTurn(before, expectedTurn.teamId)
              : markNotInterested(before, expectedTurn.teamId)
          const beforePublic = getPublicAuctionState(before)
          const afterPublic = getPublicAuctionState(engineState)
          announcementId += 1
          const result = resultAfterAction(before, engineState)
          const event = eventAfterPublicAction(
              beforePublic,
              afterPublic,
              evaluation.action.type,
              expectedTurn.teamId,
            )
          heldResultPlayer = result?.player ?? null
          set({
            auction: auctionForPresentation(afterPublic),
            lastResult: result,
            lastAiDecision: evaluation,
            announcementEvent: event,
            announcementId,
            tournament: tournamentFromAuction(),
            feedback: null,
          })
        } catch (error) {
          set({ feedback: friendlyError(error), lastAiDecision: evaluation })
        }
      },
      tick: () => {
        if (engineState === null || engineState.status !== 'IN_PROGRESS') return
        const before = engineState
        try {
          engineState = advanceTurnTimer(before, 1)
          const timerResult = resultAfterAction(before, engineState)
          const afterPublic = getPublicAuctionState(engineState)
          const timedOut = before.turnTimer?.remainingSeconds === 1
          if (timedOut) announcementId += 1
          if (timerResult !== null) heldResultPlayer = timerResult.player
          set({
            auction: auctionForPresentation(afterPublic),
            ...(timerResult === null ? {} : { lastResult: timerResult }),
            ...(timedOut ? {
              announcementEvent: eventAfterPublicAction(
                getPublicAuctionState(before), afterPublic, 'PASS',
                before.currentCard!.activeTeamId, true,
              ),
              announcementId,
            } : {}),
            tournament: tournamentFromAuction(),
            feedback: null,
          })
        } catch (error) {
          set({ feedback: friendlyError(error) })
        }
      },
      advanceAnnouncement: (expectedAnnouncementId) => {
        if (
          engineState === null ||
          expectedAnnouncementId !== announcementId
        ) return
        announcementId += 1
        heldResultPlayer = null
        set({
          auction: getPublicAuctionState(engineState),
          announcementEvent: eventAfterResultHold(getPublicAuctionState(engineState)),
          announcementId,
        })
      },
      advanceTournament: () => set((state) => {
        const tournament = state.tournament
        if (tournament === null || fullTournament === null) return state
        const revealedCount = tournament.revealedLeagueMatches.length
        if (tournament.stage === 'MATCH') {
          return { tournament: publicTournament(
            revealedCount === fullTournament.leagueMatches.length ? 'LEAGUE_COMPLETE' : 'STANDINGS',
            revealedCount,
          ) }
        }
        if (tournament.stage === 'STANDINGS') {
          const nextCount = Math.min(fullTournament.leagueMatches.length, revealedCount + 1)
          return {
            tournament: publicTournament('MATCH', nextCount),
          }
        }
        if (tournament.stage === 'LEAGUE_COMPLETE') {
          return { tournament: publicTournament('FINAL_READY', revealedCount) }
        }
        if (tournament.stage === 'FINAL_READY') {
          return { tournament: publicTournament('GAME_OVER', revealedCount) }
        }
        return state
      }),
      requestQuit: () => set((state) => state.stage === 'WELCOME'
        || state.tournament?.stage === 'GAME_OVER'
        ? state
        : { quitConfirmationOpen: true }),
      cancelQuit: () => set({ quitConfirmationOpen: false }),
      confirmQuit: () => {
        gameId += 1
        pendingPool = null
        engineState = null
        fullTournament = null
        tournamentTeams = []
        heldResultPlayer = null
        set({
          stage: 'WELCOME',
          auction: null,
          lastResult: null,
          lastAiDecision: null,
          tournament: null,
          feedback: null,
          announcementEvent: null,
          publicAiPersonalities: {},
          gameId,
          quitConfirmationOpen: false,
        })
      },
      mainMenu: () => {
        gameId += 1
        pendingPool = null
        engineState = null
        fullTournament = null
        tournamentTeams = []
        heldResultPlayer = null
        set({
          stage: 'WELCOME', auction: null, tournament: null,
          announcementEvent: null, publicAiPersonalities: {}, gameId,
          quitConfirmationOpen: false,
        })
      },
    }
  })
}

export const useAuctionHarness = createAuctionHarnessStore()
