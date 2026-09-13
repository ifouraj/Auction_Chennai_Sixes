import { expect, it } from 'vitest'

import { formatBalanceReport, runBalanceDiagnostics } from './balanceDiagnostics'

it('runs the requested deterministic large balance sweep', () => {
  const environment = (globalThis as typeof globalThis & {
    process?: { readonly env: Readonly<Record<string, string | undefined>> }
  }).process?.env ?? {}
  const seedStart = Number(environment.BALANCE_SEED_START ?? 1)
  const gameCount = Number(environment.BALANCE_GAME_COUNT ?? 1_000)
  const report = runBalanceDiagnostics(seedStart, seedStart + gameCount - 1)

  console.log(formatBalanceReport({ ...report, gamesDetail: [] }))
  expect(report.games).toBe(gameCount)
}, 120_000)
