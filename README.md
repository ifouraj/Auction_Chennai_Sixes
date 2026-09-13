# Chennai Sixes Auction

Chennai Sixes Auction V1 is a single-player, browser-based cricket auction strategy game. One local human franchise competes with three seeded AI franchises through a hidden-pool auction and a complete, progressively revealed Sixes tournament.

V1 is intentionally local-state only. It has no account system, persistence, backend, Supabase integration, network dependency, or multiplayer. Multiplayer is future work and is not part of V1.

## Prerequisites

- Node.js 22.12 or newer
- npm 10 or newer

## Install and run locally

Install the locked dependencies:

```sh
npm ci
```

Start the Vite development server:

```sh
npm run dev
```

Open the local URL printed by Vite. Game progress is held only in the current browser tab's memory and is lost on refresh, navigation away, or Quit.

## Test and validate

Run the complete automated suite once:

```sh
npm test
```

Run tests in watch mode during development:

```sh
npm run test:watch
```

Run ESLint:

```sh
npm run lint
```

Run the standalone deterministic balance sweep (1,000 games by default):

```sh
npm run diagnostics:balance
```

`BALANCE_SEED_START` and `BALANCE_GAME_COUNT` can select a different inclusive seed range or game count. The large balance sweep is deliberately excluded from the ordinary Vitest suite and is a diagnostic, not a different rules implementation.

## Production build

Create an optimized production build:

```sh
npm run build
```

Vite writes the deployable output to `dist/`. Preview that exact build locally:

```sh
npm run preview
```

The app mounts at `/` and does not currently expose client-side URL routes. Refreshing or directly loading the root URL works normally, and the Vercel SPA rewrite keeps any direct/deep load on the same `index.html` entry point. Vite's default root-relative asset paths are appropriate for a Vercel root deployment.

## V1 game flow

1. Start a new game and select one of ten franchises. Three different opponent franchises are selected for the AI seats.
2. Round 1 reveals the 25 selected players one at a time. The selected identities and private future order remain hidden until each card is revealed.
3. Each franchise begins with ₹3Cr. Bids use ₹10L increments. Round 1 enforces each player's base price and the auction bank rule.
4. Players left unsold return in a privately reshuffled Round 2. Base-price protection is removed, but the ₹10L opening floor/increment and bank rules still apply. A player unsold again leaves the auction.
5. After the auction, any franchise below six normal players receives free automatic Emergency Signings until it has six available players. These players come from a separate punishment catalog and do not affect its purse.
6. The game automatically selects each franchise's Best Six. There is no manual lineup selection.
7. Six league matches are revealed one at a time, each with reconciled batting and bowling scorecards, followed by updated standings.
8. The top two franchises qualify for the Final. Playing the Final reveals its scorecard, champion, runner-up, and Game Over state.
9. `PLAY AGAIN` starts a fresh game at franchise selection, `MAIN MENU` returns to the welcome screen, and `Quit` uses a confirmation dialog before abandoning in-progress state.

### Locked V1 rules and model

- The normal catalog contains 50 fictional players; exactly 25 are selected strictly at random for a game, with no balancing reroll or role guarantee.
- Public player ratings are BAT, BOWL, WK, LEAD, and authored Overall. Auction price and purchase round never contribute to squad strength or Best Six selection.
- Team BAT and BOWL use the best five ratings while retaining zero-valued missing slots. Overall uses a harmonic BAT/BOWL core weighted 94%, plus 3% WK and 3% LEAD, then rounds only for public display.
- Automatic Best Six evaluates combinations with the same exact strength model and stable tie-breaks.
- Matches are deterministic for a seed, use six-player teams and five-over innings, resolve BAT directly against opposition BOWL with smaller WK/LEAD and bounded-form effects, and always produce a decisive result.
- The league awards two points for a win and zero for a loss. Strength values and stable seat/team fallbacks break standings ties.

The ten selectable franchises are Madras Machis, Mumbai Bhidus, Kolkata Bondhus, Bangalore Gurus, Hyderabad Miyaans, Lucknow Janabs, Kochi Chettans, Dilliwalas, Punjab Gabrus, and Ahmedabad Bhaibandhs.

## Architecture

- `src/app` composes the React screens and the in-memory Zustand game store.
- `src/domain` defines shared types, franchises, validation, and locked constants.
- `src/data` contains the normal and punishment player catalogs.
- `src/engine` contains framework-independent seeded auction, AI, strength, Best Six, emergency-signing, match, and tournament rules.
- `src/presentation` derives display-only money, announcer, AI-personality, and match-flavor text.
- `src/diagnostics` contains the separate deterministic balance-sweep harness.
- `src/tests` contains engine, integration, presentation, and diagnostic tests; `src/app/App.test.tsx` covers the rendered flow and controls.
- `src/styles` contains the Tailwind entry point and global responsive/scroll styling.

React 19 renders the UI, Zustand coordinates ephemeral local state, Vite builds and serves the app, Tailwind supplies styling, and Vitest plus Testing Library provide automated validation. The rules engines remain pure TypeScript and can run independently of React.

No environment variables are required for V1.

## Deploy to Vercel

Vercel can detect this repository as a Vite application. The checked-in `vercel.json` contains only the SPA fallback recommended for Vite deep links; no serverless function, backend, or environment variable is required.

1. Push the intended V1 checkpoint commit to the Git provider connected to Vercel.
2. In Vercel, import that repository.
3. Keep the detected framework preset as **Vite**.
4. Use `npm run build` as the build command and `dist` as the output directory (the detected defaults should already match).
5. Leave environment variables empty.
6. Deploy, then verify the root URL on desktop and mobile and complete a smoke game.

For a local CLI check without deploying, install or invoke the Vercel CLI separately and run its build command only after authenticating; Vercel account creation, linking, and deployment are intentionally outside this repository workflow.

## Documentation authority

This README and the implementation/tests are authoritative for V1. See `Docs/README.md` for the status of earlier design snapshots and the completed M15 balance report.
