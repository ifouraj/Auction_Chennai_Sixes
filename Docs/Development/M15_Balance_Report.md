# M15 Balance Report

Status: complete. No gameplay tuning required.

## Method

- Final sweep: 10,000 complete all-AI auctions and tournaments, inclusive seeds 1-10,000.
- Tournament sample: 70,000 matches (six league matches and one final per game).
- Fixed matchup sample: 7,000 additional matches (2,000 equal, 2,000 clear, 3,000 extreme).
- The harness calls the production pool, auction, AI, emergency, Best Six, match, and tournament engines. It has no UI clock and no alternate rules.
- Large sweeps run separately with `npm run diagnostics:balance`; ordinary Vitest excludes the 10,000-game loop.
- “Bargain” means a Round 2 purchase below that player's authored base price. Large and very-large spend labels are diagnostic-only thresholds of 75 and 100 units.

## Auction and economy

| Metric | Result |
|---|---:|
| Starting purse | 300 |
| Normal purchases per team | mean 6.250; range 3-9; p10/median/p90 6/6/7 |
| Money remaining | mean 63.488; range 0-205; p10/median/p90 14/63/112 |
| Purchase price | mean 37.842; range 6-148; p10/median/p90 22/33/62 |
| Highest team purchase | mean 67.498; range 30-148; p10/median/p90 48/66/90 |
| Round 1 sold | mean 14.335; range 7-21 |
| Round 1 unsold | mean 10.665; range 4-18 |
| Round 2 sold | mean 10.665; range 4-18 |
| Round 2 rejected | 0 |
| Round 2 bargains | 104,970 / 106,650 (98.43%) |
| Exact 1-unit AI purchases | 0 |
| Large spends (>=75) | 12,415 / 250,000 (4.97%) |
| Very-large spends (>=100) | 1,439 / 250,000 (0.58%) |

The 300-unit purse creates expensive stars, ordinary prices, frequent Round 2 discounts, occasional all-in finishes, and a broad remaining-money range. It does not routinely bankrupt every team or leave AIs hoarding most of the purse. No purse change is justified.

Round 2 is heavily used rather than ignored. In this all-AI model every Round 1 unsold card eventually sold, and none sold for exactly 1. This is recorded as an anomaly, not treated as a mandate to manufacture rejects or 1-unit AI wins: 98.43% of those purchases were below base price, the 25-player supply is only one above the combined 24-player target, and the authoritative rules still allow tested 1-unit human/AI openings and twice-unsold rejection.

## Emergency signings

- 1,292 / 10,000 games (12.92%) used at least one emergency player.
- 1,306 / 40,000 teams (3.27%) received emergency players.
- 1,438 emergency players were assigned: 0.036 per team, range 0-3.

Emergency players are therefore a meaningful occasional consequence, not a universal outcome. No safeguards or forced target distribution were added.

## AI behavior

- Action mix: BID 62.2%, PASS 25.6%, NOT INTERESTED 12.2%.
- Personality differences materially affect behavior. Aggression correlated +0.621 with total spend, thrift correlated -0.572, and risk tolerance correlated +0.307. Patience also had a smaller +0.151 relationship with bid count.
- The AI buys beyond six when useful, sometimes finishes below six, participates strongly in Round 2, and retains a wide money range. No evidence supports making personalities equally optimal or flattening their mistakes.

## Best Six strength

All values below cover 40,000 automatic Best Six squads.

| Rating | Mean | Range | p10 / median / p90 |
|---|---:|---:|---:|
| Overall | 76.383 | 57-85 | 72 / 77 / 80 |
| BAT | 67.377 | 34-88 | 59 / 68 / 75 |
| BOWL | 73.579 | 39-90 | 64 / 74 / 82 |
| WK | 80.365 | 19-95 | 66 / 81 / 95 |
| LEAD | 84.122 | 52-93 | 73 / 86 / 93 |

Edge tests confirm that a weak extra purchase cannot lower Best Six, stronger combinations improve category ratings, emergency players hurt only through their low ratings, and authored player Overall, purchase price, and auction round do not affect selection. The M7/M8 formula was unchanged.

## Match and tournament outcomes

Fixed matchup validation retained the M11 targets:

- Equal 50 vs 50: first team won 50.5%.
- Clear 80 vs 50: stronger team won 78.1%.
- Extreme 100 vs 0: stronger team won 93.0%, leaving 7.0% upsets.

Auction-built squads were usually much closer than the fixed clear/extreme fixtures. When unequal rounded Overall values met, the lower-Overall side won 48.1%; this is expected to be noisy because the simulator uses direct BAT-vs-BOWL interactions, not an Overall comparison, and many Overall gaps are only one or two points.

Championships by Best Six strength rank were 32.01% / 27.57% / 22.31% / 18.11% from strongest to weakest. League wins were 15,664 / 15,162 / 14,788 / 14,386 in the same order. Strength matters substantially, the strongest is not guaranteed the title, and the weakest still produces occasional cricket upsets.

## Seat and human fairness

| Seat | Titles | Title rate | Purchases | Emergency players | Money left | Overall |
|---|---:|---:|---:|---:|---:|---:|
| A / 0 | 2,518 | 25.18% | 6.252 | 0.037 | 63.689 | 76.428 |
| B / 1 | 2,495 | 24.95% | 6.257 | 0.037 | 63.403 | 76.377 |
| C / 2 | 2,502 | 25.02% | 6.239 | 0.036 | 63.663 | 76.421 |
| D / 3 | 2,485 | 24.85% | 6.252 | 0.034 | 63.198 | 76.309 |

No persistent seat advantage appears. Tests also swap Team A between HUMAN_LOCAL and AI while applying identical engine actions; player selection/order, auction state, emergency assignment, Best Six, tournament seeds, and match results remain identical. Participant kind is not an input to Best Six, emergency, match, or tournament calculations.

## Tuning decision

Gameplay constants changed: none.

Presentation-only change: `AUCTION_RESULT_HOLD_MS` 1,400 ms -> 3,000 ms, because real-user feedback explicitly requested longer SOLD/UNSOLD visibility. `AI_PRESENTATION_DELAY_MS` remains 2,000 ms.

Deliberately untouched chaos includes the strict random 25-player pool, uneven 3-9 normal-player squads, emergency players, large and very-large overpayments, zero-balance finishes, category-skewed Best Sixes, Round 2 discounts, AI personality mistakes, close-team match volatility, and weakest-squad championships. No pool rerolls, role guarantees, purchase caps, emergency safeguards, manual Best Six, points changes, or tournament changes were introduced.
