# Documentation status

The repository implementation, automated tests, and root `README.md` are the authoritative V1 specification.

## Current supporting document

- `Development/M15_Balance_Report.md` records the completed pre-freeze balance analysis. Its tuning decision remains relevant, but individual economy measurements are historical where the later approved post-playtest pass changed presentation or legal bid granularity.

## Historical design snapshots

- `Chennai_Sixes_Auction_GDD_v0.2.docx`
- `Chennai_Sixes_Auction_Technical_Design_v0.2.docx`
- everything under `Old versions/`

The Word files are retained as design history, not as current V1 instructions. Any provisional/TBD language or older statements in them—including references to a planned Supabase backend, multiplayer, visible pre-auction pool inspection, generic integer bidding, provisional strength formulas, automatic full-tournament reveal, or the absence of individual scorecards—has been superseded.

Current V1 is single-player and local-state only. It uses ten selectable franchises, a hidden random 25-of-50 normal-player pool, ₹3Cr per franchise, ₹10L bidding, the locked 94/3/3 harmonic strength model, automatic Emergency Signings and Best Six, progressively revealed league matches and standings, individual batting/bowling scorecards, one Final, and Game Over. Multiplayer and any backend remain future work, not V1.
