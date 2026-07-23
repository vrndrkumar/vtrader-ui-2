# Stock Insight Server

Research-intelligence micro-service for the VTrader UI **Stock Insight** platform. Ranks a stock universe by *discovery potential* — hidden gem candidates before major expansion — using three independent engines plus a separate risk layer, all with weights frozen from a four-phase research protocol (2020–2026, ~25k observations, walk-forward validated).

**This is NOT a trading system.** No buy signals, entries, stops or targets. Output ranks "deserves investigation" and explains why, with honest hit-rate disclosure (~32% of top-decile Discovery candidates historically advanced +50% within ~6 months; median detection lead ~7 months).

## v3 presentation layer (weights unchanged)

Evidence items carry themes (UI de-duplicates signals shared across engines), badges are evidence-driven (HIDDEN GEM CANDIDATE, EARLY DISCOVERY, QUIET ACCUMULATION, TRANSITION STARTED, BUILDING STRENGTH, LEADERSHIP EMERGING, MOMENTUM ESTABLISHED, WATCHLIST, QUIET) plus warning tags (DISTRIBUTION RISK, WEAK STRUCTURE, THIN LIQUIDITY, HIGH VOLATILITY). Each report includes: executive summary (analyst note), opportunity lifecycle (Discovery → Transition → Momentum with earliness), overall conviction (1–5★, blends best-engine score, market percentile, risk), market/sector/industry ranks + percentiles per engine, "why it stands out today", and score history with trends. `GET /dashboard` powers the market-intelligence view: top hidden gems, top discovery, biggest improvers, new signals, momentum leaders, highest risk, sector leaders, recently upgraded/downgraded (movement lists need ≥2 snapshots per stock). Conviction + rank snapshots are stored per analysis for future performance studies.

## Engines (v2.1-2026.07 weights)

**v2.1 amendment** (CEO-approved via the Phase-5/5b protocol — the first weight change since the v2 freeze): prior advance is two-tier (30–60% → +22, ≥60% → +30; validated monotone dev + out-of-sample); **Correction Quality grade A/B/C** added to Discovery (+10/+4/0 with a grade-C caution line) — computed from three frozen metrics (path efficiency ≤0.0694/≥0.1771, volume-on-weakness ≤−0.0326/≥0.1940, retracement ≤0.3478/≥0.4985) in rest-after-run contexts; A-vs-C validated 1.96× dev → 2.17× out-of-sample. Gap-up frequency is stored as instrumentation only (CRI forward confirmation pending). All sequence-order motifs, failure vetoes, volume asymmetry, down-day RS and closing range were tested and permanently closed (see `research/out/research-report-phase5.md` and `-phase5b.md`).

## Engine baseline (v2-2026.07 weights)

**Discovery** (primary): prior strong advance +30, weekly turn +20, compression-with-prior-advance +15, volume dry-up +15, OBV rising +10, under-followed location +10. **Transition**: 200-SMA reclaim +30, weekly turn +25, dry-up +15, higher-low +10, OBV +10, CHOCH +10, RS improving +5. **Momentum** (gated to weekly-uptrend + above-200SMA stocks): established trend +30, sustained advance +20, quiet pullback +15, more. **Risk layer** (separate, never a veto): volatility, liquidity, drawdown, structure, regime → LOW/MEDIUM/HIGH + factors. Badges: HIDDEN GEM CANDIDATE / BUILDING STRENGTH / CONFIRMED LEADER / WATCHLIST / QUIET.

Weights change ONLY through the research protocol (`npm run research`, `research:phase2..5`); see `docs/INSIGHT_ENGINE_RESEARCH.md` and `docs/INSIGHT_PHASE5_PROTOCOL.md`.

**Phase 5 — Pattern Evolution** (`npm run research:phase5`): pre-registered sequence motifs (M1–M7, F1–F3) vs unordered baselines, behaviour-quality terciles on rest-after-run episodes, evidence audit → `research/out/research-report-phase5.md`.

**CRI — Continuous Research Intelligence** (in-server, research recommendations only, weights frozen): daily forward-outcome capture into `snapshot_outcomes` (auto on startup + every 24h; `POST /cri/capture`, `GET /cri/state`), `GET /cri/summary/weekly` (per-evidence forward lift vs backtest; auto-raises recommendations on ±0.15 divergence with n≥100), `GET /cri/summary/monthly` (regime split), `GET /cri/summary/quarterly` (challenger readiness — never promotes), `GET /cri/recommendations`.

## Fundamentals (display-only)

`GET /stock/:symbol/fundamentals` (`?refresh=1` bypasses the 24h DB cache) serves company snapshot, valuation, profitability, financial health, growth, dividends, ownership and risk metrics from **Yahoo Finance** (via `yahoo-finance2`; NSE codes map `SBIN-EQ → SBIN.NS`, `.BO` fallback), plus a heuristic Fundamental Health Summary. **Hard isolation guarantee** (enforced by `test/fundamentals.offline.test.js`): engines, scoring, rankings, batch and CRI never reference fundamentals — informational context only. Missing metrics render as N/A, never guessed. Requires `npm install` (new dependency).

## Run

```bash
cd insight-server
npm install
npm start        # port 3600; creates stock_analysis_reports table on first start
```

## API

- `GET /universe?page=&pageSize=&q=&sector=&industry=&badge=&riskLevel=&minDiscovery=&analyzed=1&sort=discovery|transition|momentum|recent|name` — paginated universe joined with latest stored analysis.
- `GET /universe/facets` — sectors/industries/badges for filters.
- `GET /rankings` — Top Hidden Gems, Building Strength, Momentum Leaders, Discovery+Contained-Risk.
- `GET /stock/:symbol/insight` — latest stored analysis + weekly chart + history; `?refresh=1` recomputes now.
- `GET /stock/:symbol/history` — score history snapshots.
- `POST /analyze {symbols:[…]}` / `POST /analyze/all` — background batch (3 concurrent, throttled); `GET /analyze/status`, `POST /analyze/stop`.
- `GET /symbols?q=`, `GET /symbols/all` — symbol search. `GET /report?symbol=` — legacy v1 deep-dive (unused by new UI).

## Storage

`stock_analysis_reports` (auto-created): snapshot per run with `is_latest` flag — universe reads are instant, history is preserved for score-change tracking. Evidence and risk factors stored as JSON.

## Tests

```bash
node test/engines.offline.test.js    # production engines
npm run test:engine                  # legacy v1 engine
node test/research.offline.test.js && node test/phase2.offline.test.js && node test/phase3.offline.test.js && node test/phase4.offline.test.js
```

## First-run checklist

1. `npm start`, then in the UI open Stock Insight → "Analyse Entire Universe" (background; full NSE equity list takes ~30–60 min throttled).
2. Review Top Hidden Gems — are the explanations meaningful? Log issues before touching weights.
3. Known gaps: sector relative strength inactive until `stock_mstr.sector_index_symbol` values are mapped to candle-API index symbols; no fundamentals/news (never guessed); market cap not in `stock_mstr` (liquidity shown instead).
