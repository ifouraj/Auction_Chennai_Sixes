# Chennai Sixes Auction

Playable M11 foundation for the Chennai Sixes Auction web game: one local human competes with three seeded, personality-driven AI bidders through the complete two-round auction, followed by automatic emergency signings and deterministic five-over exhibition matches between completed automatic Best Six squads.

## Prerequisites

- Node.js 22.12 or newer
- npm 10 or newer

## Commands

Install dependencies:

```sh
npm install
```

Start the development server:

```sh
npm run dev
```

Run the test suite once:

```sh
npm test
```

Run tests in watch mode:

```sh
npm run test:watch
```

Check lint rules:

```sh
npm run lint
```

Create a production build:

```sh
npm run build
```

Preview the production build locally:

```sh
npm run preview
```

## Architecture

The project follows the Technical Design Document's layer boundaries:

- `src/app` contains application composition and screens.
- `src/components` contains declarative UI components.
- `src/domain` contains framework-independent domain types and constants.
- `src/engine` contains pure TypeScript game rules and state transitions.
- `src/store` coordinates application state with Zustand.
- `src/repositories` defines persistence boundaries and adapters.
- `src/data` contains local static catalog data.
- `src/lib` contains external-client setup and shared infrastructure.
- `src/tests` contains shared test setup plus future integration tests.

M2-M11 currently provide the fictional normal-player catalog, seeded player pool and private order, authoritative auction/bank/timer rules, Round 2, live team strength and automatic Best Six, the playable auction harness, pure TypeScript AI bidding, deterministic free emergency assignments from a separate punishment-player catalog, and a pure seeded Sixes match simulator. The post-auction development tester can run compact team-total exhibition matches; league/tournament play, persistence, multiplayer, and final presentation remain later milestones.

The M11 simulator resolves 30-ball innings from direct BAT-vs-BOWL interactions, with smaller WK, LEAD, chase-pressure, and bounded form effects. It exposes only innings totals and a decisive result; there are no auction-price inputs, manual cricket controls, or individual scorecards. Major coefficients are centralized in `MATCH_SIMULATION_CONFIG` for M15 balancing.
