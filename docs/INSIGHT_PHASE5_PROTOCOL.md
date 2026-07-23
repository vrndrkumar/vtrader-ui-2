# Stock Insight — Phase-5 Research Protocol (CEO-Approved Scope)

**Status:** COMPLETE — Phase 5 + 5b executed 2026-07-17. Outcomes: all sequence motifs and failure vetoes REJECTED (order doesn't matter); Behaviour Quality VALIDATED (A-vs-C 1.96× dev → 2.17× val) and shipped as the Correction Quality grade in engine **v2.1-2026.07** together with two-tier prior advance (both CEO-approved); gap-up frequency VALIDATED in backtest, instrumentation-only pending CRI forward confirmation; volume asymmetry rejected at the pre-registered bar. CRI live. Phase-5 harness: `npm run research:phase5` (research-only). CRI: daily capture live on server startup + `/cri/*` endpoints (recommendations only; weights remain frozen). One implementation-correctness amendment recorded during synthetic testing, before any outcome data was examined: M5/F3 undercut requires the base low to be established over ≥20 bars and broken by >0.5% (prevents ordinary base wiggle from triggering).
**Baseline:** conclusions of `INSIGHT_PHASE5_PROPOSALS_REVIEW.md` are accepted and are not re-argued here
**Workstreams:** ① Pattern Evolution (flagship: sequences + **behaviour quality** + failure sequences) · ② Continuous Research Intelligence (CRI) · ③ Evidence Audit (supporting, folded into ①)

> 🔒 **Pre-registration discipline.** Every definition, threshold, bucket and decision rule in this document is fixed *before* any outcome data is examined. Widening a grid, adding a motif, or re-bucketing a quality metric after seeing results invalidates that result. Additions require a new pre-registered amendment section, never an edit.

---

## Workstream ① — Pattern Evolution Engine

### 1.1 Objective

Determine whether **temporal information** — the order, duration and *quality* of behavioural events — adds predictive power for early discovery beyond V3's snapshot scoring, and whether **failure sequences** provide the veto power that static conditions could not (Phase-4 finding).

### 1.2 Dataset & units

* Historical observation series, 2020–2026, same universe/seed as Phases 1–4 (reproducibility).
* **Sampling density decision (fixed now):** sequence detection uses **stride-1 daily resolution within each stock's series** (sequences are corrupted by 5-bar sampling); outcome labelling and dev/validation splits remain identical to Phases 2–4 (labels B = +20%/40b primary; D and E for robustness; dev ≤ 2023-12-31; validation touched once).
* Minimum support for any conclusion: **n ≥ 100 dev events**; motifs below support are reported as "insufficient sample — no conclusion", never as weak positives.

### 1.3 Pre-registered sequence motifs (closed list — 10)

Each motif has a fixed objective definition. **M** = success-hypothesis motif, **F** = failure-hypothesis motif.

| # | Motif | Fixed definition (all windows in trading days) |
|---|---|---|
| M1 | **Rest after run (ordered)** | ≥30% advance completing at bar *t*; compression window (BB ≤30th pct + base ≥10) beginning at *t* < start ≤ *t*+60 |
| M2 | **Monotonic contraction (true VCP)** | ≥2 successive swing-high→low legs, each depth < previous, within one base |
| M3 | **Dry-up deepening** | 10d/50d volume ratio declining across the base and reaching its base-minimum in the final third of the base |
| M4 | **Accumulation precedes turn** | OBV-rising streak (slope>0) established ≥15 bars *before* the weekly turn bar |
| M5 | **Shakeout / spring** | close < base low, reclaimed within ≤5 bars, undercut volume < 1.2× 20-bar average |
| M6 | **Down-day resilience** | trailing-20 average return on NIFTY-down days rising for ≥10 bars while price in base |
| M7 | **Higher-low cadence** | ≥3 consecutive higher lows with strictly shortening intervals |
| F1 | **Distribution-then-quiet** | volume expansion (≥1.4×) with falling OBV occurring *before* dry-up begins, within the same base |
| F2 | **Price-led turn** | weekly turn with no OBV-rising streak in the prior 30 bars |
| F3 | **Unrecovered undercut** | close < base low, not reclaimed within 5 bars |

**Decision rule per motif (fixed):** a sequence motif is validated only if it beats **its own unordered-components baseline** (e.g., M4 must beat plain "OBV rising AND weekly turn") on dev, holds direction on validation, satisfies n≥100, and is direction-consistent at labels B *and* D. Failure motifs (F1–F3) are validated as vetoes only if the flagged subset's win rate is ≤0.67× the unflagged subset's (mirroring the 1.5× bar, inverted), on both dev and validation.

### 1.4 Behaviour Quality (CEO addition — mandatory)

**Research question:** among stocks where the *same* sequence occurred, does the **quality** of the sequence separate outcomes? ("One correction is beautiful, the other is ugly.")

Six pre-registered quality dimensions, each with a fixed metric and fixed tercile bucketing (buckets computed on dev distribution only, frozen, then applied to validation):

| Dimension | Fixed metric | Expert intuition being measured |
|---|---|---|
| **Duration proportion** | correction/base length ÷ prior advance length | Rest should be proportionate — too short = no cause built; too long = dead money |
| **Smoothness** | path efficiency: net correction depth ÷ sum of absolute daily moves within it; plus worst single-day drop as % of correction depth | Orderly stair-step decline vs panicked gap-down decline |
| **Volatility profile** | ATR% trend across the correction (falling = good) | A correction that *calms down* as it matures |
| **Volume behaviour** | correlation of volume with down-moves inside the correction (negative = supply exhausting) | Selling drying up on weakness, not accelerating |
| **Structural integrity** | depth retracement of prior advance (≤ 50% vs deeper); count of violated prior swing lows | The advance's structure survives the correction |
| **Recovery character** | recovery half: low-volume undercuts recovered, no failed breakout inside; rounded (multi-touch) vs single V | Bases that "build a floor" vs snap back untested |

**Decision rule (fixed):** for each validated motif, quality dimensions are tested *conditionally* — top-tercile quality vs bottom-tercile quality within motif-satisfying stocks. A quality dimension is validated if top-vs-bottom win-rate ratio ≥ 1.25 on dev with n≥100 per tercile, direction holds on validation, and holds at labels B and D. A composite "sequence quality grade" (A/B/C) is only proposed if ≥3 dimensions validate independently.

### 1.5 Evidence Audit (Workstream ③, folded here — per CEO directive, no re-justification)

Fixed tasks, executed on the same dev matrix: **(a) Redundancy audit** — pairwise Spearman correlation + conditional lift (feature X's lift within X∧Y vs X alone) across the ~9 surviving features; retirement recommendation if |ρ| > 0.8 *and* conditional lift indistinguishable from 1.0. **(b) Missing participation behaviours** — four pre-registered additions tested exactly like motifs: down-day RS level, closing-range position (20-bar mean of (close−low)/(high−low)), up/down-day volume asymmetry ratio, gap-up frequency in base. **(c) Granularity** — for each surviving evidence item, test 3-bucket graded strength (weak/clear/strong) for outcome monotonicity on dev *and* validation; graded points recommended only where monotone in both, solely to reduce ranking ties.

### 1.6 Deliverable & success criteria

One report, `research-report-phase5.md`, same format discipline as Phases 1–4: per-motif and per-quality tables (n, win rates, lift vs baseline, dev/val), veto tables for F1–F3, audit results, and a **recommendation list** where each recommended change is expressed as a proposed evidence line + point value with its measured basis. Phase 5 is a success even if most motifs fail — a validated "sequences add nothing beyond states" is itself a valuable, publishable-quality negative result. **No recommendation enters production without explicit CEO approval.**

---

## Workstream ② — Continuous Research Intelligence (CRI)

### 2.1 Objective & stance

Convert live forward outcomes into **scientific research recommendations** — never dashboards for their own sake, never automatic model updates. Production weights remain frozen; CRI's only output is knowledge with a suggested next experiment.

### 2.2 Cadence protocol

| Cadence | Activity | Output |
|---|---|---|
| **Daily** | Record forward observations: for every stored snapshot whose 20/40/120/250-bar windows complete that day, log realised max-gain, max-drawdown, close-return against the snapshot's evidence lines, scores, badge, rank, regime tag | Silent accumulation (no report) |
| **Weekly** | Per-evidence forward lift vs its backtest-validated lift; top-decile forward hit-rate vs base; anomaly scan (any evidence whose 8-week forward lift diverges from backtest by the trigger rule) | Weekly research summary (≤1 page, recommendation format §2.3) |
| **Monthly** | Regime analysis: evidence performance conditioned on regime states (NIFTY vs 200-SMA; realised index volatility tercile); breadth of Discovery signals as a market-cycle observation | Monthly regime note |
| **Quarterly** | Challenger evaluation: shadow variant(s) embodying accumulated validated recommendations scored side-by-side (invisible to users) vs frozen champion on forward data only — precision@top-decile, big-winner capture, rank stability | Quarterly challenger verdict + consolidated research agenda |

### 2.3 Research Recommendation format (fixed)

Every CRI finding is expressed in exactly this structure — the CEO-specified format:

```
Observation        During the last 120 trading days
Pattern            Orderly Pullback → Dry-up → Higher Low → Weekly Turn
Finding            Forward win rate +18% vs baseline
Confidence         Moderate  (n=214; single regime episode)
Suggested Research Investigate whether pullback duration contributes additional predictive power
Status             RESEARCH REQUIRED   (never: "weights updated")
```

**Confidence grading (fixed):** *Insufficient* n<100 (finding suppressed, only logged) · *Low* 100–299 or single regime episode · *Moderate* 300–999 and stable across two non-overlapping windows · *High* ≥1000, stable across windows AND ≥2 regime states. Status vocabulary: `RESEARCH REQUIRED` · `MONITORING` · `CANDIDATE FOR CHALLENGER` · `REJECTED`.

### 2.4 Pre-registered recommendation triggers

CRI raises a recommendation only when: an evidence line's 8-week forward lift diverges from its backtest lift by >0.15 with n≥100 (decay or improvement alarm); a regime-conditional split shows opposite-direction lifts with n≥100 per side across ≥2 episodes; a Phase-5-validated motif's forward performance confirms or contradicts its backtest result; or top-decile forward hit-rate drifts >5pp from expectation over a quarter. Everything else is silence — CRI must not manufacture noise.

### 2.5 Governance (hard rules)

Champion (frozen v2 weights) is never modified automatically. Challenger promotion requires: ≥2 consecutive quarterly wins on forward data (both precision@top-decile and D/E-winner capture, n≥ the quarterly pick count), full explainability of every challenger evidence line, and **explicit CEO approval**. Rollback to champion is always retained. CRI reports are research artifacts; if a report is ignored, nothing changes — that asymmetry is by design.

---

## Sequencing & interlocks

1. **CRI Daily capture starts immediately** — it is pure instrumentation, and every later stage starves without it (forward data accumulates only in real time).
2. **Phase 5 runs now on historical data** — it does not wait for forward data.
3. Evidence Audit executes inside Phase 5's first pass (shared matrix, zero extra data cost).
4. Phase-5 validated findings become CRI's first challenger candidates; CRI's forward data becomes Phase 5's out-of-time confirmation. The two workstreams close each other's loops.

## Overfitting & integrity register

Closed motif list (10) and closed quality-dimension list (6) — additions only via pre-registered amendment · quality terciles frozen from dev distribution · all sequence definitions use confirmed-pivot logic (no repainting) · validation set touched once per study · forward data is survivorship-free by construction (snapshots are recorded before outcomes exist) — CRI lifts will therefore run *below* backtest lifts, and that expected gap will be reported, not hidden · negative results are deliverables, not failures.

*Signed off for research only. No production code, weights, schema or UI change is authorised by this document.*
