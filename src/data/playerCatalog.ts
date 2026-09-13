import type { Player } from '../domain/types'

function normalPlayer(
  id: string,
  name: string,
  country: string,
  age: number,
  description: string,
  batting: number,
  bowling: number,
  wicketKeeping: number,
  leadership: number,
  overall: number,
  basePrice: number,
  imageRef?: string,
): Player {
  return {
    id,
    name,
    country,
    age,
    description,
    batting,
    bowling,
    wicketKeeping,
    leadership,
    overall,
    basePrice: Math.ceil(basePrice / 10) * 10,
    kind: 'NORMAL',
    ...(imageRef === undefined ? {} : { imageRef }),
  }
}

export const normalPlayerCatalog: readonly Player[] = [
normalPlayer(
  'normal-001',
  'Viraj Kehli',
  'India',
  37,
  'Right-handed top-order batter. Occasional right-arm medium bowler.',
  96, 18, 20, 91, 94, 82,
),

normalPlayer(
  'normal-002',
  'Rohan Shyam',
  'India',
  39,
  'Right-handed opening batter. Right-arm off-break bowler.',
  93, 25, 18, 94, 93, 78,
),

normalPlayer(
  'normal-003',
  'Suryan VasuYadev',
  'India',
  35,
  'Right-handed middle-order batter. Right-arm off-break bowler.',
  97, 20, 25, 74, 94, 84,
),

normalPlayer(
  'normal-004',
  'Shuban Gell',
  'India',
  27,
  'Right-handed top-order batter. Right-arm off-break bowler.',
  91, 12, 20, 86, 89, 72,
),

normalPlayer(
  'normal-005',
  'Yash Jaiswel',
  'India',
  24,
  'Left-handed opening batter. Right-arm leg-break bowler.',
  93, 15, 18, 67, 90, 74,
),

normalPlayer(
  'normal-006',
  'Abhineet Shyama',
  'India',
  26,
  'Left-handed opening batter. Left-arm orthodox spin bowler.',
  91, 58, 15, 65, 88, 70,
),

normalPlayer(
  'normal-007',
  'Rishav Punt',
  'India',
  28,
  'Left-handed wicketkeeper-batter.',
  91, 10, 94, 80, 92, 78,
),

normalPlayer(
  'normal-008',
  'Sanju Samsen',
  'India',
  31,
  'Right-handed wicketkeeper-batter.',
  88, 8, 92, 86, 89, 68,
),

normalPlayer(
  'normal-009',
  'KL Rehul',
  'India',
  34,
  'Right-handed top-order wicketkeeper-batter.',
  89, 10, 90, 82, 89, 67,
),

normalPlayer(
  'normal-010',
  'Hardin Pandye',
  'India',
  32,
  'Right-handed batting all-rounder. Right-arm fast-medium bowler.',
  88, 82, 15, 88, 91, 82,
),

normalPlayer(
  'normal-011',
  'Ravinder Jedeja',
  'India',
  37,
  'Left-handed all-rounder. Left-arm orthodox spin bowler.',
  82, 91, 20, 86, 91, 80,
),

normalPlayer(
  'normal-012',
  'Aksar Petal',
  'India',
  32,
  'Left-handed all-rounder. Left-arm orthodox spin bowler.',
  81, 89, 15, 80, 88, 72,
),

normalPlayer(
  'normal-013',
  'Jaspreet Bamrah',
  'India',
  32,
  'Right-arm fast bowler. Right-handed lower-order batter.',
  30, 99, 10, 84, 97, 90,
),

normalPlayer(
  'normal-014',
  'Kuldeep Yadev',
  'India',
  31,
  'Left-arm wrist-spin bowler. Left-handed lower-order batter.',
  31, 94, 10, 67, 91, 70,
),

normalPlayer(
  'normal-015',
  'Varun Chakravarthi',
  'India',
  35,
  'Right-arm leg-break and mystery-spin bowler. Right-handed batter.',
  25, 95, 10, 61, 91, 72,
),

normalPlayer(
  'normal-016',
  'Mohamed Seraj',
  'India',
  32,
  'Right-arm fast bowler. Right-handed lower-order batter.',
  25, 88, 10, 67, 85, 57,
),

normalPlayer(
  'normal-017',
  'Arshdeep Sengh',
  'India',
  27,
  'Left-arm fast-medium bowler. Left-handed lower-order batter.',
  24, 91, 10, 68, 88, 64,
),

normalPlayer(
  'normal-018',
  'Rinku Sengh',
  'India',
  28,
  'Left-handed middle-order batter. Right-arm off-break bowler.',
  88, 22, 18, 65, 85, 58,
),

normalPlayer(
  'normal-019',
  'Rituraj Gaikwad',
  'India',
  29,
  'Right-handed opening batter. Right-arm off-break bowler.',
  89, 12, 20, 84, 87, 63,
),

normalPlayer(
  'normal-020',
  'Shivam Duba',
  'India',
  33,
  'Left-handed batting all-rounder. Right-arm medium bowler.',
  86, 59, 12, 62, 83, 55,
),

normalPlayer(
  'normal-021',
  'Mahen Dhoniar',
  'India',
  45,
  'Right-handed wicketkeeper-batter and former captain.',
  80, 5, 96, 99, 91, 80,
),

normalPlayer(
  'normal-022',
  'Nicolas Puran',
  'West Indies',
  30,
  'Left-handed wicketkeeper-batter.',
  94, 8, 88, 72, 92, 79,
),

normalPlayer(
  'normal-023',
  'Josh Battler',
  'England',
  36,
  'Right-handed opening wicketkeeper-batter.',
  94, 5, 94, 82, 94, 84,
),

normalPlayer(
  'normal-024',
  'Henrik Klasen',
  'South Africa',
  35,
  'Right-handed middle-order wicketkeeper-batter.',
  95, 5, 90, 73, 93, 82,
),

normalPlayer(
  'normal-025',
  'Trevis Heed',
  'Australia',
  32,
  'Left-handed top-order batter. Right-arm off-break bowler.',
  95, 39, 12, 76, 93, 82,
),

normalPlayer(
  'normal-026',
  'Sunil Nerain',
  'West Indies',
  38,
  'Left-handed batting all-rounder. Right-arm off-spin bowler.',
  88, 94, 10, 78, 95, 90,
),

normalPlayer(
  'normal-027',
  'Rasheed Kahn',
  'Afghanistan',
  27,
  'Right-handed bowling all-rounder. Right-arm leg-spin bowler.',
  78, 96, 12, 82, 94, 86,
),

normalPlayer(
  'normal-028',
  'Pat Cammens',
  'Australia',
  33,
  'Right-arm fast bowler. Right-handed lower-order batter and captain.',
  61, 94, 10, 94, 93, 84,
),

normalPlayer(
  'normal-029',
  'Andre Rassell',
  'West Indies',
  38,
  'Right-handed power-hitting all-rounder. Right-arm fast-medium bowler.',
  91, 82, 10, 73, 91, 82,
),

normalPlayer(
  'normal-030',
  'Nur Ahmed',
  'Afghanistan',
  21,
  'Left-arm wrist-spin bowler. Right-handed lower-order batter.',
  32, 91, 10, 54, 87, 58,
),

normalPlayer(
  'normal-031',
  'Ragul Druvad',
  'India',
  53,
  'Right-handed top-order batter and former captain. Occasional wicketkeeper.',
  87, 10, 38, 95, 89, 67,
),

normalPlayer(
  'normal-032',
  'AB de Vilears',
  'South Africa',
  42,
  'Right-handed middle-order batter and wicketkeeper.',
  98, 22, 86, 87, 97, 94,
),

normalPlayer(
  'normal-033',
  'Bryan Lora',
  'West Indies',
  57,
  'Left-handed top-order batter. Right-arm leg-break bowler.',
  96, 12, 15, 82, 92, 76,
),

normalPlayer(
  'normal-034',
  'Ricky Ponteng',
  'Australia',
  51,
  'Right-handed top-order batter and former captain. Right-arm medium bowler.',
  94, 14, 20, 96, 94, 84,
),

normalPlayer(
  'normal-035',
  'Kris Goyler',
  'West Indies',
  46,
  'Left-handed opening batter. Right-arm off-spin bowler.',
  99, 38, 15, 75, 96, 92,
),

normalPlayer(
  'normal-036',
  'Deepesh Devran',
  'India',
  18,
  'Right-arm medium bowler. Right-handed batter.',
  29, 78, 11, 48, 72, 25,
),

normalPlayer(
  'normal-037',
  'Abhiyan Kundu',
  'India',
  18,
  'Wicketkeeper-batter for India Under-19.',
  75, 12, 82, 57, 76, 28,
),

normalPlayer(
  'normal-038',
  'Kanish Chauhan',
  'India',
  18,
  'All-rounder for India Under-19.',
  70, 73, 14, 54, 73, 27,
),

normalPlayer(
  'normal-039',
  'Vedanth Trived',
  'India',
  18,
  'Top-order batter for India Under-19.',
  79, 19, 16, 53, 74, 28,
),

normalPlayer(
  'normal-040',
  'Mohamed Enan',
  'India',
  18,
  'Spin-bowling all-rounder for India Under-19.',
  67, 76, 12, 52, 73, 26,
),

normalPlayer(
  'normal-041',
  'Rotating Star Action Anand',
  'India',
  54,
  'Wants to promote his new film by participating in Chennai Sixes.',
  23, 8, 6, 19, 18, 8,
),

normalPlayer(
  'normal-042',
  'Dance Master Dinesh',
  'India',
  43,
  'Excellent footwork, although very little of it has been designed for cricket.',
  14, 7, 9, 12, 11, 5,
),

normalPlayer(
  'normal-043',
  'Stunt Selvam',
  'India',
  39,
  'Dives spectacularly for everything, including several balls already over the boundary.',
  11, 13, 18, 8, 13, 5,
),

normalPlayer(
  'normal-044',
  'Director Deva',
  'India',
  51,
  'Requests another take after every bad delivery and has been informed this is not permitted.',
  5, 4, 3, 23, 10, 4,
),

normalPlayer(
  'normal-045',
  'Junior Artist Jagan',
  'India',
  36,
  'Has appeared in 187 films and is hoping somebody finally leaves him in the final cut.',
  9, 8, 7, 6, 8, 3,
),

normalPlayer(
  'normal-046',
  'Muthu Sir',
  'India',
  48,
  'School PT teacher who has already threatened the entire squad with three extra laps.',
  16, 22, 10, 20, 19, 7,
),

normalPlayer(
  'normal-047',
  'Auto Mani',
  'India',
  38,
  'Claims his street-cricket record is excellent, although nobody can locate the scorebook.',
  23, 14, 8, 11, 18, 7,
),

normalPlayer(
  'normal-048',
  'Suresh Manager',
  'India',
  47,
  'Senior factory manager with no cricket skills and a mandatory pre-match review meeting.',
  8, 6, 4, 65, 24, 9,
),

normalPlayer(
  'normal-049',
  'Protein Prabhu',
  'India',
  31,
  'Was selected after somebody confused visible biceps with documented cricket ability.',
  19, 10, 5, 7, 14, 5,
),

normalPlayer(
  'normal-050',
  'Tea Kadai Sekar',
  'India',
  46,
  'Has watched cricket every afternoon for twenty years and considers this sufficient qualification.',
  15, 14, 12, 18, 16, 6,
),
]
