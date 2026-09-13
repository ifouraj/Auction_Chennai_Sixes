import { describe, expect, it } from 'vitest'

import { normalPlayerCatalog } from '../../data/playerCatalog'
import { simulateMatch } from '../../engine/matchSimulator'
import { calculateTeamStrength } from '../../engine/teamStrength'
import { classifyMatch } from '../../presentation/matchFlavor'

describe('M14 match flavor', () => {
  it('deterministically classifies an actual M11 result without changing it', () => {
    const teamAPlayers = normalPlayerCatalog.slice(0, 6)
    const teamBPlayers = normalPlayerCatalog.slice(6, 12)
    const result = simulateMatch(
      { teamId: 'team-a', bestSix: teamAPlayers },
      { teamId: 'team-b', bestSix: teamBPlayers },
      1414,
    )
    const snapshot = structuredClone(result)
    const strengths = {
      'team-a': calculateTeamStrength(teamAPlayers.map((player) => ({ player }))),
      'team-b': calculateTeamStrength(teamBPlayers.map((player) => ({ player }))),
    }
    expect(classifyMatch(result, strengths)).toBe(classifyMatch(result, strengths))
    expect([null, 'UPSET', 'DOMINANT', 'NAIL-BITER', 'TIEBREAK']).toContain(classifyMatch(result, strengths))
    expect(result).toEqual(snapshot)
  })
})
