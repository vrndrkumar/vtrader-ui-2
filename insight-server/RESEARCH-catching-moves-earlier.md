# Why we catch moves late — diagnosis & research plan

**Question from Viren:** we catch stocks *after* they've already moved ~15–20%; the "footprint that a stock might blast now" is arriving late. What are we missing?

**Scope:** This is a research memo, not an implementation. Every proposed signal below is a *hypothesis to test against our own stored data* before touching the frozen weights. Nothing here changes scoring.

---

## Part 1 — The lateness is structural, and it's on purpose (mostly)

I read the production engines (`engines.js`, `featureSnapshot.js`). The reason we fire late is not a bug — it's that our **strongest, highest-weighted signals are all confirmation signals**, and two of the three "opportunity" engines are gated on things that only become true *after* the first leg of a move.

### The single biggest cause: Discovery's top signal *requires* a 30%+ prior move

In `discoveryEngine`, the largest weight is `priorAdvance` (+22 for a 30–60% gain, +30 for ≥60%), and its own comment says it's "the single strongest validated early signal." But mechanically:

> `priorAdvance = f.priorGain120 >= 30` → the stock must **already be up 30%+ over ~6 months** to earn our biggest points.

So by construction, the highest-conviction Discovery names have *already banked 30%+*. That is precisely the "we're 15–20% late" symptom. Worse, `compression` and `correctionQuality` — two more Discovery signals — are **also gated on prior advance** (`compressed(f) && priorAdvance(f)`, and correction-quality is only computed when `priorGain120 >= 30`). A tight base with no prior advance scores *nothing*.

**This was a deliberate research trade-off.** The frozen-weights comments record that squeezes *without* prior strength tested at 0.95× (no edge) while the prior-advance recipe was 1.28–1.3×. We bought hit-rate by sacrificing earliness. That trade is defensible — but it's the root of the complaint, and it's worth re-testing whether a *second, earlier cohort* can be caught without wrecking the win rate (Part 3).

### Second cause: the "turn" signals are detected on a 4-week lag

Both Discovery (`weeklyTurn`, +20) and Transition (`weeklyTurn`, +25) rely on:

```
weeklyUpPrev = weeklyUpAt(weekly, wi - 4)   // state 4 completed weeks ago
weeklyTurn   = weeklyUp === true && weeklyUpPrev === false
```

We only call it a "turn" by comparing **now vs 4 completed weeks ago**. That's a built-in ~4–6 week detection lag. A real turn that happened 3 weeks ago isn't recognised yet, and by the time it is, price has usually moved.

### Third cause: Transition's top signal is a post-move confirmation

`sma200Reclaim` (+30) fires only once price has *already climbed back above* its 200-day average. In a real recovery a stock is typically up 20–40% off its low by the time it reclaims the 200-SMA. That's leadership *confirmation*, not anticipation.

### Net picture

| Engine | Top-weighted signals | Nature | Typical timing |
|---|---|---|---|
| Discovery | prior advance +30, weekly turn +20 | already moved / 4-wk lag | after first leg |
| Transition | 200-SMA reclaim +30, weekly turn +25 | post-move confirm / 4-wk lag | after recovery leg |
| Momentum | trend + advance | by design late | intentionally late |

All three lean on things that are true *after* the move begins. The genuinely *leading* signals we already compute — volume dry-up, OBV accumulation, relative strength, compression — are **underweighted, and in some cases gated or unused**.

---

## Part 2 — Leading footprints we compute but barely use (or ignore)

These are the cheapest wins because the data already exists in `featureSnapshot.js`:

1. **Relative strength is not used in Discovery at all.** `rs20`/`rs60` are computed and stored, but `discoveryEngine` never references them. RS turning up — especially the **RS line making a new high while price is still below its own highs** — is one of the most reliable *early* leadership tells (Minervini/IBD). We have the raw ratio; we don't use it where it would help most. In Transition it's worth only +5.

2. **`rangeTight20` is computed and never used anywhere.** A dead feature. It's a direct tightness measure sitting unused while we rely on the slower BB-percentile.

3. **`volRatio` never enters scoring** — it only drives a "distribution risk" tag. Daily relative volume (a stock quietly trading 1.5–2× normal while price is flat) is the classic accumulation footprint the question is asking for.

4. **Compression is treated as a static yes/no, not a *contraction sequence*.** We check "BB width ≤ 30th pctile + base ≥ 10 bars." The real pre-explosion footprint (Minervini VCP) is *successive* contractions — each pullback shallower than the last, volume falling with each. We have the bars to measure it; we don't.

---

## Part 3 — Footprints we don't compute at all (candidate new signals)

Each is a **hypothesis to validate**, not a recommendation yet:

1. **Pocket pivot** — an up-day whose volume exceeds the highest *down-day* volume of the last ~10 days, while the stock sits in/near a base. O'Neil/Morales' canonical "institutions stepping in early" signal. Fires *before* the breakout, not after.

2. **RS-line new high before price** (see also #1 in Part 2) — flag when the stock/NIFTY ratio makes a new 3–6 month high while price is still ≥10% below its own high. Strong early-leadership tell.

3. **VCP contraction count** — number of progressively-tighter pullbacks in the current base + whether volume declined across them. Turns our static squeeze into a *maturing* signal.

4. **Closing-range strength** — repeatedly closing in the top 25% of the daily range on rising/steady volume = accumulation, visible before a daily breakout. Cheap to compute from candles we already fetch.

5. **Sector / industry-group strength** — big moves come in groups. A stock whose *sector* RS is turning is earlier evidence than the stock alone. Today the only market context is `regimeUp` (NIFTY vs its 200-SMA). Sector RS is a known early amplifier we don't have.

6. **Finer-timeframe accumulation.** Everything in production is daily+weekly. The trade module already has 15/30/60-min candle infra. Intraday block-accumulation / closing strength can lead the daily signal by days.

### The honest limit: some blasts are not footprint-able

A large share of sudden 20% moves are **earnings gaps and news events**. No technical footprint predicts those, and our fundamentals are display-only by design (score isolation is test-enforced and must stay that way). We should explicitly split outcomes into **"accumulation → expansion" moves (improvable)** vs **"event/gap" moves (not improvable technically)** so we measure ourselves only against what's actually catchable — otherwise the engine looks worse than it is and we'd be tempted to over-fit to noise.

---

## Part 4 — How to prove all this from data we already have

We now have the assets to answer this empirically instead of by intuition:

- `stock_transition` — 5,351 dated badge changes
- `transition_outcome` — forward returns per transition
- `stock_analysis_reports` — **daily feature+score snapshots over time** (the key asset)
- `paper_cohort` / `paper_holding` — cohort outcomes
- Candle API — full history for any symbol

### Study A — "How late are we, exactly?" (quantify the complaint)

1. From candles, define a **blast event**: price rises ≥20% within ≤20 trading days; mark the start bar `t0`.
2. For each blast, find the first date our engine flagged that stock (badge ≥ EARLY DISCOVERY / BUILDING STRENGTH) from `stock_analysis_reports`.
3. Measure **lead/lag = flag_date − t0**, and **% of the move already gone at flag time**.
4. Output the distribution. This turns "we're ~15–20% late" into a hard number and a baseline to beat. Also split by move type (gap vs grind, per Part 3) and by engine family.

### Study B — "What was glowing before the move?" (find the missing footprint)

1. Take the blast set from Study A. Build pre-move windows at `t0-5`, `t0-10`, `t0-20`.
2. Compute **both** current features *and* the candidate features from Part 3 (pocket pivot, RS-new-high, VCP count, closing-range, sector RS) for those windows — recomputed from candles with no look-ahead.
3. Compare each feature's distribution in **pre-blast windows vs matched non-blast windows** (same period, similar liquidity).
4. Rank features by separation (how well each distinguishes pre-blast from normal). Any candidate that separates strongly *and* is currently unused/underweighted is a real miss.

### Study C — "Can we add an earlier cohort without wrecking hit-rate?"

The prior-advance gate buys accuracy. Test whether a **relaxed early tier** — e.g. prior advance only 8–15% **but** with two confirming leading footprints (RS-new-high + pocket pivot + dry-up) — produces acceptable forward win rates in `transition_outcome`/candle backtests. If it does, that's the earlier signal we want, earned by evidence rather than by lowering the bar blindly.

### Study D — regime/holding overlay

Re-run A–C split by `regimeUp` (market up vs down) and by holding horizon (1W/2W/1M) to see whether earliness is safe in all regimes or only in uptrends.

---

## Recommended sequence (for a later decision — not now)

1. **Study A first** — it's a day or two of read-only analysis and gives us the baseline "how late" number. Nothing changes.
2. **Study B** — surfaces the specific missing footprints, ranked by real predictive separation on *our* names.
3. Only then decide whether to (a) *use* the leading features we already compute (RS in Discovery, `rangeTight20`, `volRatio`) via the research protocol, and/or (b) add validated new ones (pocket pivot, RS-new-high, VCP, sector RS).
4. Keep fundamentals display-only throughout; treat gap/event moves as a separate, non-technical bucket.

**Bottom line:** we're late because our biggest points are paid for *confirmation* (prior +30%, 200-SMA reclaim, 4-week-lagged weekly turn), while the signals that actually lead a move (relative strength, tightness, quiet-volume accumulation, pocket pivots) are unused, underweighted, or absent. The fix isn't to lower the bar — it's to **pay points for leading evidence, proven against our own blast history first.**
