# Chennai Sixes Auction

Technical foundation for the Chennai Sixes Auction web game. Milestone M1 is a minimal React application; game mechanics are intentionally deferred to later milestones.

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

The M1 application deliberately implements only the title screen. The game engine, catalog, store, repositories, Supabase integration, and all gameplay features remain unimplemented.
