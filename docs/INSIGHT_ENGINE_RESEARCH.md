# Stock Insight Engine — V1 → V2 Research Protocol

Status: **Phase 1 complete** (run 2026-07-12: V1 validation AUC 0.502 ≈ no edge; V2 logistic modestly better, 53.5% vs 47.5% base precision@top-decile; verdict ADOPT — but adoption is ON HOLD pending Phase 2). **Phase 2 built, awaiting run** (`npm run research:phase2`): business-aligned labels (+10%/20b … +100%/250b), winner taxonomy (continuation / base breakout / reversal / speculative), weeklyUp early-vs-late decomposition, weekly top-K ranking simulation vs random baseline, 4-fold walk-forward, big-winner capture rates, and veto-filter discovery. Output: `insight-server/research/out/research-report-phase2.md`. **No V2 code ships until the Phase-2 review is complete.**

**Phase 2 complete** (run 2026-07-12): V2 beats base rate at every horizon A–E on validation (~1.4× lift) and 4/4 walk-forward folds; weeklyUp confirmed as genuine EARLY-stage evidence (1.25× lift below prior highs); ranking sim shows V2 is a screener (top-20 PF 1.48 vs random 1.25), not a top-5 autopilot; big-winner capture 15-16% vs 10% random; no veto cleared the 1.5× bar; "near high + weekly down" identified as a trap (7.5% win). ADOPT-WITH-MODIFICATIONS recommended — held for Phase 3.

**Phase 3 complete** (run 2026-07-12): verdict Option C selective hybrid — Early Reversal specialization +10.1pp, coefficient sign-flips across contexts prove one weight vector can't serve momentum and reversal; 90-days-before profiles show chart features (weeklyUp, 200SMA) are confirmation-gradient while smallness/quietness/prior-advance are the early markers; risk separation confirmed (ATR buckets change outcome quality). Follow-up review concluded: two-engine architecture (Early Discovery + Momentum Confirmation) + shared risk layer.

**Phase 4 built, awaiting run** (`npm run research:phase4`): validates the Early Discovery concept with fixed rule-based prototypes (Discovery/Transition/Continuation, weights from Phase-3 lifts): first-entry timing into weekly cross-sectional top-decile per +50/+100/+200 move episode (median lead, %≥90/60/30d early), prior-advance decomposition (alone vs +compression/dry-up/OBV vs +weekly-turn, with no-prior controls), and Discovery false-positive study (falling knives, value traps, false accumulation, liquidity). Output: `research/out/research-report-phase4.md`.

**Phase 3 built, awaiting run** (`npm run research:phase3`): decides Option A (one universal score) vs B (specialized engines) vs C (hybrid) by training four opportunity engines — Momentum Leader, Breakout Preparation, Early Reversal, Multibagger Discovery — each on its own candidate subset and comparing specialized-vs-universal precision on the same validation candidates. Includes breakout-definition autopsy (VCP variants with prior-advance requirement), reversal-signal tests (CHOCH, higher-low, RSI recovery), multibagger precondition profiles at 0/30/60/90 bars before the move, +200%/+300% capture where sample allows, risk-separation test, and a feature-universality table. New trailing-only features: rsiRecovery, higherLow, priorGain120, rangeTight20, barsSinceHigh. Output: `research/out/research-report-phase3.md`.

Phase-1 key findings (details in `research/out/research-report.md`): weeklyUp is the dominant validated feature; compression only works inside weekly uptrends; volume expansion, CMF, BOS points and standalone RS-positive contributed ~nothing; the chasing penalty was inverted (extended names won MORE — survivorship-caveated); sectorRsPos untestable (n=0, sector index data gap); negative regime coefficient judged a 2020-23 buy-the-dip artifact, not adopted.

---

## STEP 1 — Feature audit (hypotheses, not evidence)

Every V1 feature, why it exists, what it assumes, and its expected failure modes. These are testable claims, not conclusions.

| # | Feature (V1 pts) | Market behaviour targeted | Core assumption | Expected to work when | Expected to fail when |
|---|---|---|---|---|---|
| 1 | BB-width compression ≤30th pctile (18) | Volatility clustering: quiet precedes expansion | Low realised vol = energy building, not death | After a prior trend, inside a healthy base, liquid stock | Illiquid/dead stocks stay compressed forever; bear regimes resolve squeezes DOWN |
| 2 | Weekly squeeze confluence (+7) | Higher-TF energy | Multi-TF compression = bigger move | Long consolidations after multi-year trends | Rare signal; sample size may be too small to trust |
| 3 | Base length ≥10 bars near 20SMA | Accumulation takes time | Long sideways = strong hands absorbing | Institutional names in rotation | "Dead money" stocks; conglomerate holdcos |
| 4 | Volume dry-up <0.75× (4) | Supply exhaustion (Wyckoff) | Sellers finished, float locked | End of base, before markup | Disinterest looks identical to absorption |
| 5 | Volume expansion ≥1.4× (6) | Institutional footprint | Big volume = smart money entering | Breakout day / early markup | It's a LATE signal — may flag moves already gone (contradicts "before the move" objective). Suspected V1 design flaw |
| 6 | CMF > 0.05 (8) | Buying pressure at closes | Close location × volume proxies accumulation | Steady accumulation phases | Gap-driven stocks, high-beta noise |
| 7 | OBV slope > 0 (6) | Cumulative volume flow | OBV leads price | Divergence at base end | Single huge-volume days distort; collinear with CMF — one may be redundant |
| 8 | RS vs NIFTY improving (15) | Momentum/leadership persistence | Relative winners keep winning ~3-12 months | Trending markets | Regime turns; sharp rotations; high-beta bounces in bear rallies |
| 9 | Bullish CHOCH (12) | Earliest trend-reversal evidence | First LH break = character change | V-bottoms with volume | HIGH false-positive rate expected in downtrends (bear rallies constantly break minor LHs) |
| 10 | BOS with trend (10) | Continuation confirmation | Breaking swing extremes = trend intact | Established uptrends | Later signal, worse entry price; overlaps #8 and #12 |
| 11 | Daily base in weekly uptrend (7) | Continuation-base pattern | Pullback bases in uptrends resolve up | Stage-2 stocks | Late-stage bases (3rd/4th base) fail more often — V1 doesn't count base stage |
| 12 | MTF alignment ≥3/4 (10) | Confluence | Aligned TFs = robust trend | — | Intraday TFs unavailable historically → **cannot be backtested as designed**; also alignment often means move already visible (late) |
| 13 | Historical analogue win rate (15) | Pattern recurrence per stock | A stock repeats its own behaviour | Stocks with stable character | Self-referential inside the score; per-stock samples are small (5-20) → noisy. Excluded from V2 fitting, evaluated separately |
| 14 | Chasing penalty −12 (>80% off 52w low, RSI>72) | Mean reversion of extended moves | Late entries have poor forward RR | Parabolic tops | Strongest momentum stocks stay "overbought" for months — penalty may cut the best winners |
| 15 | 200SMA / weekly trend inputs (in Health score) | Regime/stage filter | Stage 2 uptrends outperform | Almost always per literature | Whipsaw around the line |

**Pre-registered suspicions to test** (so we can't move goalposts later): (a) volume *expansion* is late and should move from Explosion to a separate "trigger" concept or be dropped; (b) CHOCH at 12 pts is too generous for its expected false-positive rate; (c) CMF and OBV are collinear — keep one; (d) market regime (NIFTY vs its 200SMA) is a missing feature with likely large interaction effects; (e) compression alone is weak but compression × strong sector / regime is strong (interaction hypothesis); (f) the chasing penalty threshold is arbitrary.

---

## Methodology (what the harness actually does)

**Universe.** All active `stock_mstr` equities, deterministic pseudo-random sample (default 250, seed fixed, reproducible), then a liquidity floor (median daily turnover ≥ ₹2cr) applied *after* download; exclusions logged. No cherry-picking: universe is drawn before any outcome is seen.

**Observation points.** Every 5th daily bar per stock (stride reduces autocorrelation), starting at bar 260 (enough indicator history), ending 40 bars before the last bar (room for the outcome window). Every observation gets the full feature vector computed **only from data up to that bar** — swing pivots count as confirmed only 3 bars after they form; rolling percentiles use trailing windows only.

**Label.** Forward 40 sessions: `win = maxGain ≥ 8% AND maxGain > |maxDrawdown|` (V1's definition), with alternative labels at 5/10/15% computed in the same pass to test robustness of conclusions to the label choice.

**Split.** Development = observations dated ≤ 2023-12-31. Validation = 2024-01-01 onward, **touched only once**, after V2 is frozen on dev data. If V2 is not better than V1 on validation (precision in top decile), the report says REJECT.

**Metrics.** Per feature: support n, P(win|feature), base rate, lift. Per combo: same. Threshold sweeps on a fixed grid declared in config (not expanded after seeing results). Model: L2-regularised logistic regression (plain JS, standardized features) — chosen because coefficients are interpretable as evidence weights, matching the additive structure of the Explosion score. Model quality: AUC + precision@top-10% vs the V1 score computed on the same observations.

**Failure analysis.** Among high-V1-score observations that lost: tabulate co-conditions (regime down, sector RS negative, extended from 52w low, no flow confirmation, low turnover) and report frequencies.

**Overfitting guards.** One seed, one grid, declared up front; stride sampling; time-based split (no shuffling — avoids leakage across the same market phase); simple linear model; minimum support n≥100 dev observations for any threshold/weight recommendation; robustness check across the 4 label definitions; explicit REJECT gate on validation.

**Known limitations (honest).** Intraday TFs can't be backtested (data depth) — MTF alignment is evaluated in daily+weekly form only. Sector indices only where `sector_index_symbol` is mapped. 2020–2026 contains one large bull phase; regime feature partially controls for this but the validation window (2024–26) is the real test. Survivorship: `stock_mstr` reflects today's actives; delisted losers are missing — stated in the report because it biases win rates UP.
