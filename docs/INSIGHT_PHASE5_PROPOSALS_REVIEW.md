# Stock Insight — Phase-5 Proposal Review

**Role:** Principal Quant Research Engineer · **Scope:** research evaluation only — no implementation, no architecture, no code
**Baseline under review:** engine weights `v2-2026.07`, presentation `v3` · **Evidence base:** Phases 1–4 (2020–2026, ~25k observations, walk-forward validated)

**Ground rule applied throughout:** a proposal earns approval only if it identifies *market behaviour* not already captured — not a recombination of existing indicators. Every claim below is tagged either **[measured]** (we have numbers from Phases 1–4) or **[hypothesis]** (testable, not yet tested). Nothing in this report changes production.

---

## Executive verdicts

| Proposal | Verdict | Priority | One-line reason |
|---|---|---|---|
| 1 — Pattern Evolution Engine | **APPROVE for Phase-5 research** | 1 | The weakness is real and measured: V3 is memoryless while our own data shows winners' profiles *evolve* distinctively over the 90 days before moves. |
| 2 — Evidence Engine | **PARTIAL — audit yes, redesign no** | 3 | ~70% of this proposal was already executed in V1→V2 (redundant indicators removed). Remaining value: a formal redundancy audit + score granularity for tie-breaking. |
| 3 — Forward Performance Intelligence | **APPROVE, staged with hard guardrails** | 2 | Structural weakness is real (frozen weights + measured regime variance), but naive continuous learning would destroy the platform's two best properties: explainability and overfitting discipline. |

Recommended sequence: **3-Stage-A (instrumentation) immediately → 1 (flagship Phase-5 study, runs on existing historical data) → 2 (folded into Phase 5 as an audit) → 3-Stages B/C (once forward data accumulates).**

---

# Proposal 1 — Pattern Evolution Engine

## 1. Problem statement

**Weakness:** V3 scores a stock from a single snapshot. Discovery = 80 reads identically whether the evidence assembled gradually in a coherent order (advance → rest → volume dry-up → OBV turn → weekly turn) or appeared simultaneously yesterday. All temporal ordering, duration and trajectory information is discarded.

**Does the weakness actually exist?** **Yes — [measured], from our own Phase-3 §5 time-lapse.** Future +100% winners were nearly indistinguishable from other stocks on *state* features 90 days before their moves (weeklyUp 62.0% vs 62.4%; above-200SMA actually *lower*, 65.7% vs 67.2%), but their profiles showed a distinct **gradient**: weeklyUp 62→66→69→72.5% approaching the move, distance-from-high climbing −20.4→−15.3%, while non-winners stayed flat. The *trajectory* separated winners; the *snapshot* barely did. Additional support: the "Discovery score rising for N consecutive analyses" standout — a crude trajectory measure — already exists because static scores alone felt insufficient, and Phase-4 showed detection leads vary enormously (median 155 bars, but 45% of episodes never detected), suggesting the path into a setup matters.

**Frequency:** universal — 100% of scores are memoryless by construction.
**Severity:** moderate-to-high for the *earliness* objective specifically. This is the one weakness that directly attacks the product's core promise (earlier identification), because the earliest information we have documented is a gradient, not a state.

## 2. The discretionary-trader lens — behaviours experts recognise, and whether they are measurable

Thirty-year chart readers do not describe setups as indicator values; they describe **stories in order**: *"it ran hard, went quiet for months, pullbacks kept getting shallower, volume dried to nothing, then one week it stopped making lower lows."* Each clause is a sequence claim. Which are objectively measurable from OHLCV?

| Expert-recognised behaviour | Objectively measurable? | Proposed measurable concept (no algorithm design — definition only) |
|---|---|---|
| "Rest must come *after* the run" | ✅ already partially captured statically | Order constraint: compression window begins after the 120-day advance window ends — currently we only test co-existence [hypothesis: ordering adds lift] |
| "Pullbacks keep getting shallower" (VCP proper) | ✅ | Monotonic contraction: each successive swing-high→low leg smaller than the last, ≥2 contractions. **[measured — weakly]**: Phase-1 tested contraction count statically; the *strict monotonic sequence over time* was never isolated |
| "Volume dries up as the base matures" (not just: is dry today) | ✅ | Dry-up *slope*: 10d/50d volume ratio declining across the base, reaching minimum in final third of base [hypothesis] |
| "Accumulation before markup, never after" | ✅ | Order motif: OBV-rising streak begins ≥N bars *before* the weekly turn, vs after [hypothesis — Wyckoff cause→effect made testable] |
| "The shakeout / spring" | ✅ | Undercut-recover: close below base low, reclaimed within ≤5 bars on lower volume [hypothesis — classic, never tested by us] |
| "It stopped going down on red market days" | ✅ | Down-day RS: stock's average return on NIFTY-down days over trailing 20, trending up [hypothesis — conditional behaviour no current feature sees] |
| "Higher lows are coming faster" | ✅ | Cadence: intervals between successive confirmed higher lows shortening [hypothesis] |
| "Failed breakout, then real breakout" | ✅ | Failure-then-repair motif within the base [hypothesis] |
| "It just *feels* under accumulation" | ❌ | Not measurable — excluded on principle |
| "Stopped falling on bad news" | ❌ | No news data — excluded |

**Failure sequences deserve equal attention** (the false-positive reduction lever): [hypothesis] volume expansion *before* dry-up completes (distribution → quiet = dead money, not accumulation); weekly turn with *no preceding* OBV improvement (price-led, not accumulation-led); base low undercut that does **not** recover within N bars. Phase-4's false-positive study found no *static* veto that cleared the 1.5× bar — the honest possibility is that failure signatures are sequential, which static conditions cannot see. That is a genuinely new hypothesis, not a recombination.

## 3. Expected impact on the four targets

Earlier identification: **high potential** — gradients are visible before states flip (the 90-day evidence). Ranking quality: **moderate** — sequence features are natural tie-breakers for the many joint-scores V3 produces. False positives: **moderate-to-high potential** — first credible path to vetoes since static ones failed. Explainability: **preserved or improved** — "volume has been drying for 6 weeks while pullbacks contracted twice" is *more* like an analyst's sentence than any indicator value.

## 4. Risks

Sequence-mining is an overfitting minefield: motif space is combinatorially huge, and with ~2,800 dev-set winners, per-motif samples get thin fast. Mitigation is the same protocol discipline as Phases 1–4: **pre-register ≤10 motifs** (the table above), fixed definitions before any outcome is examined, minimum support n≥100, dev/validation split + walk-forward, and the simplicity rule (a motif must beat its own static-components baseline — e.g., ordered "dry-up→weekly-turn" must beat unordered "dry-up AND weekly-turn" — otherwise the sequence adds nothing and is rejected).

## 5. Verdict

**APPROVE — flagship Phase-5 study.** It attacks a measured weakness, on the product's core objective, with concepts a discretionary expert would recognise, each reducible to an objective definition, testable on the existing stride-5 historical observation series (no new data needed), under the established anti-overfitting protocol.

---

# Proposal 2 — Evidence Engine (indicator → behavioural evidence scoring)

## 1. Problem statement

**Claimed weakness:** V3 scores many individual indicators that may measure the same underlying behaviour, hurting stability and explainability.

**Does the weakness actually exist? Only partially — and much less than the proposal assumes.** The proposal's premise ("EMA, MACD, ADX, Supertrend, RSI, OBV, ATR, Bollinger Width may overlap") describes **V1, not V3**. This consolidation already happened, empirically: **[measured]** MACD and Supertrend are not in production at all; CMF was removed for collinearity with OBV (0.99× lift, negative coefficient); volume expansion was removed as redundant-and-late; BOS points removed; the 25-indicator V1 scored AUC 0.502 — the indicator-soup problem is precisely what Phases 1–2 solved. Today's engine uses ~9 measurement families, and the v3 UI already groups evidence by behavioural theme (the "Overall evidence" dedup).

**What residual redundancy remains?** [measured, partially]: three "energy" measures coexist (BB-width percentile, range-tightness, base length) — Phase-3's sweep showed they are *not* interchangeable (tight-range alone tested 0.80×, i.e., harmful; BB+base tested differently), so naive merging would be wrong, but their pairwise information overlap was never formally quantified. ADX-low vs volume dry-up both express "quiet" [hypothesis of overlap]. WeeklyUp and above-200SMA correlate as states, yet Phase-3's coefficient table showed their signs *diverge across contexts* — evidence they carry distinct information.

**Frequency/severity:** low-moderate. The practical symptom that *is* real: **coarse additive points produce heavy ties** (many joint-#1 Discovery scores — visible in production ranks). That is a granularity problem downstream of the point design, and the strongest concrete argument in this proposal.

## 2. Assessment of the proposed evidence taxonomy

The five categories (Structure / Participation / Volatility-Energy / Relative Strength / Confirmation) are a **good documentation and UI taxonomy** — and map almost 1:1 onto what production already computes: structure = pivots/higher-lows/CHOCH/trend; participation = OBV, dry-up, volume ratio; energy = BB percentile, base, tightness, ATR; RS = vs-NIFTY slopes; confirmation = weekly state, 200-SMA state. Renaming the scoring around this taxonomy would change **no ranks** (same inputs, same thresholds) — so claims that it improves ranking quality are unsupported. Its genuine benefits are explainability polish and a cleaner frame for Proposal 1's sequence work (sequences are naturally described as *orderings of behavioural evidence*, not of indicators).

**Which behaviours are missing** (the valuable question in this proposal): down-day relative strength; intra-bar closing position (accumulation days close in the upper range); up-day vs down-day volume asymmetry (finer than OBV); gap behaviour. All are participation-family behaviours an expert reads at a glance and none are in V3. These belong in the Phase-5 pre-registered test list alongside the sequence motifs.

## 3. Verdict

**PARTIAL APPROVAL.** Reject the framing "evolve from indicator scoring to evidence scoring" as a redesign — that evolution substantially happened in V2 and is measured. Approve three bounded actions inside Phase 5: **(a)** a formal redundancy audit (pairwise correlation / conditional information of the ~9 surviving features on the historical observation matrix — retire anything conditionally uninformative); **(b)** test the four missing participation behaviours under the standard protocol; **(c)** if Phase 5 changes any weights anyway, move scoring to finer granularity to break ties — evidence-strength gradations rather than binary points, only where the data supports monotonicity. Complexity budget: net-zero or negative (audit may *remove* features).

---

# Proposal 3 — Forward Performance Intelligence (continuous learning)

## 1. Problem statement

**Weakness:** weights are frozen as of July 2026 from a survivorship-biased backtest; the market is non-stationary. Every static system decays; V3 has no mechanism to notice its own decay, no per-evidence health monitoring, and no disciplined path for confidence to rise or fall with live results.

**Does the weakness actually exist? Structurally yes — [measured] in kind, [unknown] in current magnitude.** Phase-2's walk-forward showed real regime variance (fold precision 31.0%–45.0% against moving base rates); Phase-1 showed the regime feature itself inverting across eras (the 2020-23 buy-the-dip artifact we refused to ship). Both prove evidence effectiveness is time-varying. What we cannot yet measure is whether v2's edge is *currently* decaying — because no forward-outcome measurement exists. **The severity is therefore literally unknown, which is itself the strongest indictment:** the platform is flying without a fuel gauge.

**Frequency:** continuous and cumulative — decay risk compounds monthly.

## 2. Research assessment — can this be learning rather than reporting?

Yes, but the proposal's ambition needs three honest constraints before any learning loop is designed:

**Sample-size reality [measured arithmetic].** A weekly top-decile of a ~2,500-stock universe yields ~250 flagged names; with 40-bar outcomes, a quarter produces roughly 3,000 outcome-labelled picks, heavily overlapping (the same stock flagged repeatedly). Per-evidence-*combination* cells (the proposal's "which combinations consistently succeed?") fragment this into dozens of cells — many below the n≥100 floor for a year or more. Conclusion: the learnable unit for the first 12 months is **per-evidence forward lift** (9–15 cells, well-powered), not per-combination. Combination learning becomes feasible only as history accumulates.

**Regime-conditioning is where static systems die [measured precedent].** "Which evidence loses effectiveness in which regime" is the right question — and exactly where Phase 1 almost shipped an artifact. Any regime-conditional confidence must clear the same bar we set then: consistency across multiple regime episodes, not one.

**Explainability is non-negotiable.** Continuously drifting weights make yesterday's report unexplainable today. The resolution: **confidence displayed ≠ weights changed.** Each evidence line can carry a live, forward-measured confidence ("validated 1.28× historically; running at 1.19× over the last 2 quarters") without any score changing. Scores change only through gated promotion.

**The sound design pattern is champion–challenger [hypothesis, standard practice]:** frozen v2 remains the champion; a shadow variant with forward-updated evidence confidences scores everything in parallel, invisible to users; promotion only if the challenger beats the champion on ranking quality over ≥2 consecutive quarters of *forward* (not backtest) data, with human sign-off. Rollback always available. This converts "continuous learning" from a self-overfitting loop into a disciplined evolution channel — the research protocol, made permanent and fed by clean, survivorship-free data that accumulates automatically.

## 3. Expected impact

Earlier identification: indirect. Ranking quality: **the only proposal that can prove (not argue) ranking improvements**, because promotion is gated on live forward data. False positives: high long-term potential — forward data will show which evidence lines fire in losers, on clean samples, where the backtest's veto search failed. Explainability: improved if display-first is respected (users see evidence "health"); destroyed if weights drift silently — the guardrails are the proposal.

## 4. Verdict

**APPROVE — staged.** Stage A (prerequisite, trivially small): record forward outcomes for every stored snapshot as time passes — this is instrumentation, not learning, and every later ambition depends on it; it should start immediately because data accumulates only in real time. Stage B (after ~1 quarter): per-evidence forward lift measurement, displayed as confidence, changing nothing. Stage C (after ≥2 quarters): champion–challenger shadow scoring with gated promotion. Reject any variant with ungated automatic weight updates.

---

## Closing note — what was rejected and why

Applying the proposal's own standard ("if it merely combines existing indicators without discovering new market behaviour, reject it"): Proposal 2's rescoring redesign is rejected on exactly that ground — the consolidation it seeks is already measured and shipped, and relabeling moves no information. Proposal 1 passes the standard fully (ordering, duration, and conditional behaviours are genuinely new measurable information), and Proposal 3 passes it in a different dimension (the new information is *live forward outcomes*, the one data source no backtest can fake). The unifying principle for Phase 5: **the next edge is in time — sequences within the chart's past, and outcomes within the platform's future — not in more indicators.**
