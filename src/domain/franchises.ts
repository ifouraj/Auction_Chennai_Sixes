import type { TeamId } from './types'
import { createRandomSource } from '../engine/random'

export interface Franchise {
  readonly id: string
  readonly name: string
  readonly note: string
}

export const FRANCHISES: readonly Franchise[] = [
  { id: 'madras-machis', name: 'Madras Machis', note: 'Machi: mate, bro, friend' },
  { id: 'mumbai-bhidus', name: 'Mumbai Bhidus', note: 'Bhidu: buddy or mate' },
  { id: 'kolkata-bondhus', name: 'Kolkata Bondhus', note: 'Bondhu: friend' },
  { id: 'bangalore-gurus', name: 'Bangalore Gurus', note: 'Guru: a friendly mate or bro' },
  { id: 'hyderabad-miyaans', name: 'Hyderabad Miyaans', note: 'Miyaan: a familiar address for a man' },
  { id: 'lucknow-janabs', name: 'Lucknow Janabs', note: 'Janaab: gentleman or sir' },
  { id: 'kochi-chettans', name: 'Kochi Chettans', note: 'Chettan: elder brother or friendly male address' },
  { id: 'dilliwalas', name: 'Dilliwalas', note: 'The people and folks of Delhi' },
  { id: 'punjab-gabrus', name: 'Punjab Gabrus', note: 'Gabru: a spirited, strapping young man' },
  { id: 'ahmedabad-bhaibandhs', name: 'Ahmedabad Bhaibandhs', note: 'Bhaibandh: friend, companion, brotherhood' },
]

const FRANCHISE_SEED_DOMAIN = 0x6672616e
const SEAT_IDS = ['team-a', 'team-b', 'team-c', 'team-d'] as const

export function selectGameFranchises(
  humanFranchiseId: string,
  seed: number,
): Readonly<Record<TeamId, Franchise>> {
  const human = FRANCHISES.find(({ id }) => id === humanFranchiseId)
  if (human === undefined) throw new Error('Unknown franchise selection')
  const opponents = createRandomSource((seed ^ FRANCHISE_SEED_DOMAIN) | 0)
    .shuffle(FRANCHISES.filter(({ id }) => id !== human.id))
    .slice(0, 3)
  return Object.fromEntries(SEAT_IDS.map((teamId, index) => [
    teamId,
    index === 0 ? human : opponents[index - 1],
  ]))
}
