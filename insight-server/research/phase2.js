// ── Phase-2 runner ───────────────────────────────────────────────────────────
// Usage: node research/phase2.js   (reuses research/data cache; downloads what's missing)
// Output: research/out/research-report-phase2.md (+ phase2-data.json)
// NO production engine code is touched by this script.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RESEARCH } from './config.js'
import { selectUniverse, downloadAll, medianTurnoverCr } from './dataset.js'
import { extractObservations, v1Score } from './features.js'
import { splitDevVal, designMatrix, predict } from './analyze.js'
import {
  LABELS, PRIMARY, attachLabels, labelSummaries, categoryAnalysis,
  earlyLateAnalysis, rankingSimulation, captureRates, walkForward, failureVetoes,
} from './phase2lib.js'
import { renderPhase2 } from './phase2report.js'
import { sma, closes } from '../src/indicators.js'
import { config } from '../src/config.js'

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')
fs.mkdirSync(OUT_DIR, { recursive: true })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

async function main() {
  // 1. Data (same universe/seed as phase 1; cache reused)
  log('selecting universe…')
  const universe = await selectUniverse()
  const sectorIdxSymbols = [...new Set(universe.map((u) => u.sector_index_symbol).filter(Boolean))]
  log(`downloading/loading ${universe.length} stocks + NIFTY + ${sectorIdxSymbols.length} sector indices…`)
  const { series, failures } = await downloadAll([config.benchmarkSymbol, ...sectorIdxSymbols, ...universe.map((u) => u.symbol_code)], log)
  fs.writeFileSync(path.join(OUT_DIR, 'download-failures.json'), JSON.stringify(failures, null, 2))
  const sectorFailures = failures.filter((f) => sectorIdxSymbols.includes(f.sym))
  if (sectorFailures.length) log(`⚠ sector index data missing for: ${sectorFailures.map((f) => f.sym).join(', ')} — sector features stay untestable`)

  const nifty = series.get(config.benchmarkSymbol)
  if (!nifty) throw new Error('NIFTY missing')
  const dateOf = (c) => new Date(c.time * 1000).toISOString().slice(0, 10)
  const niftyByDate = new Map(nifty.map((c) => [dateOf(c), c.close]))
  const nSma200 = sma(closes(nifty), 200)
  const regimeByDate = new Map(nifty.map((c, i) => [dateOf(c), nSma200[i] != null ? c.close > nSma200[i] : null]))
  const sectorMaps = new Map(sectorIdxSymbols.filter((s) => series.has(s)).map((s) => [s, new Map(series.get(s).map((c) => [dateOf(c), c.close]))]))

  // 2. Observations + multi-horizon labels
  log('extracting observations + attaching labels A–E…')
  const dailyBySymbol = new Map()
  const observations = []
  let used = 0
  for (const u of universe) {
    const candles = series.get(u.symbol_code)
    if (!candles || medianTurnoverCr(candles) < RESEARCH.minTurnoverCr) continue
    dailyBySymbol.set(u.symbol_code, candles)
    const secMap = u.sector_index_symbol ? sectorMaps.get(u.sector_index_symbol) ?? null : null
    observations.push(...extractObservations(u.symbol_code, u, candles, niftyByDate, regimeByDate, secMap))
    used++
  }
  attachLabels(observations, dailyBySymbol)
  const { dev, val } = splitDevVal(observations)
  log(`obs ${observations.length} from ${used} stocks · dev ${dev.length} / val ${val.length}`)

  // 3. Section 1: label summaries (+ per-label V2 models)
  log('label summaries + per-label models…')
  const { rows: labelRows, models } = labelSummaries(dev, val)

  // V2 primary scorer for sims/vetoes (trained on dev, primary label)
  const primaryModel = models[PRIMARY]
  const v2ScoreFn = primaryModel
    ? (o) => predict(primaryModel.model, designMatrix([o], primaryModel.stats).X[0])
    : v1Score
  if (!primaryModel) log('⚠ primary V2 model unavailable (insufficient data) — sims fall back to V1')

  // 4. Section 2 & 3
  log('taxonomy + early/late analysis…')
  const catDev = categoryAnalysis(dev, PRIMARY)
  const earlyLate = earlyLateAnalysis(dev, ['B', 'D'])

  // 5. Section 4 & 6: ranking sim + capture (VALIDATION only, single pass)
  log('ranking simulation on validation…')
  const scorers = { 'V1 Explosion': v1Score, 'V2 (research)': v2ScoreFn }
  const rankRowsVal = rankingSimulation(val, scorers)
  const captureVal = captureRates(val, scorers)

  // 6. Section 5: walk-forward
  log('walk-forward folds…')
  const walkRows = walkForward(observations, PRIMARY)

  // 7. Section 7: failure vetoes (dev)
  const vetoes = failureVetoes(dev, v2ScoreFn, PRIMARY)

  // 8. Auto-drafted answers (flagged for human review)
  const answers = buildAnswers({ labelRows, catDev, earlyLate, rankRowsVal, captureVal, walkRows, vetoes })

  const datasetInfo = `Dataset: ${used} liquid stocks (of ${universe.length} sampled, seed ${RESEARCH.seed}); ${observations.length} observations; ${failures.length} download failures (${sectorFailures.length} of them sector indices — see download-failures.json). Survivorship caveat applies to all absolute numbers.`
  const md = renderPhase2({ datasetInfo, labelRows, catDev, earlyLate, rankRowsVal, captureVal, walkRows, vetoes, answers })
  const out = path.join(OUT_DIR, 'research-report-phase2.md')
  fs.writeFileSync(out, md)
  fs.writeFileSync(path.join(OUT_DIR, 'phase2-data.json'), JSON.stringify({ labelRows, catDev, earlyLate, rankRowsVal, captureVal, walkRows, vetoes }, null, 2))
  log(`done → ${out}`)
  process.exit(0) // mysql pool would otherwise keep the event loop alive
}

function buildAnswers({ labelRows, catDev, earlyLate, rankRowsVal, captureVal, walkRows, vetoes }) {
  const fmt = (v) => (v == null ? '—' : v)
  // Q1: objective match — per-label edge of V2 over base
  const edges = labelRows
    .filter((r) => r.v2PrecVal != null)
    .map((r) => `${r.label.split(' — ')[0]}: V2 ${fmt(r.v2PrecVal)}% vs base ${fmt(r.winRateVal)}%`)
  // Q2: weeklyUp early-stage evidence
  const earlyB = earlyLate.find((r) => r.label === 'B' && r.stage.startsWith('EARLY'))
  const lateB = earlyLate.find((r) => r.label === 'B' && r.stage.startsWith('LATE'))
  const weeklyVerdict = earlyB && earlyB.weeklyUpLiftInStage != null && earlyB.weeklyUpLiftInStage >= 1.03
    ? `weeklyUp retains lift ${earlyB.weeklyUpLiftInStage}× even in EARLY-stage names (below prior highs) — it is genuine evidence, not only a late-stage selector. Keep it as anchor, but stage-aware weighting is justified.`
    : `weeklyUp lift in EARLY-stage names is ${fmt(earlyB?.weeklyUpLiftInStage)}× vs ${fmt(lateB?.weeklyUpLiftInStage)}× late-stage — its dominance mostly selects existing leaders. REDUCE its weight and pair it with early-stage conditions.`
  // Q3/Q4: setup types
  const goodCats = catDev.rows.filter((r) => (r.liftVsUniverse ?? 0) >= 1.05).map((r) => r.category)
  const badCats = catDev.rows.filter((r) => (r.liftVsUniverse ?? 2) < 1).map((r) => r.category)
  // Q5-9 depend on walk-forward consistency
  const validFolds = walkRows.filter((r) => r.v2Prec10 != null)
  const v2Beats = validFolds.filter((r) => r.v2Prec10 > r.base && r.v2Prec10 >= (r.v1Prec10 ?? 0)).length
  const consistency = `${v2Beats}/${validFolds.length} folds where V2 beat both the base rate and V1`
  const vetoList = vetoes.rows.filter((r) => r.vetoCandidate === 'YES').map((r) => r.condition)
  const captureLines = captureVal.map((c) => `${c.scorer} captured ${c.captureRate}% of ${c.label} winners (random 10%)`)

  return [
    { q: 'Does V2 match the Stock Insight objective (early significant moves, not just +8%)?', a: `Per-label validation precision: ${edges.join(' · ') || 'insufficient data'}. Big-winner capture: ${captureLines.join(' · ') || 'insufficient data'}. If V2's capture of D/E movers is materially above 10% (random) it aligns with the objective; otherwise it only ranks short-horizon momentum.` },
    { q: 'Should weeklyUp dominance remain?', a: weeklyVerdict },
    { q: 'Which setup types does the engine find well?', a: goodCats.length ? `Contexts with above-universe win rates: ${goodCats.join('; ')} (see section 2 for the features that work inside each).` : 'No category shows a clearly above-universe win rate — see section 2.' },
    { q: 'Which setup types does it miss?', a: badCats.length ? `${badCats.join('; ')} underperform the universe — the current feature set does not capture what drives these.` : 'No category clearly underperforms; gaps are more about weighting than missing contexts.' },
    { q: 'Recommended final scoring architecture?', a: 'Keep the additive, explainable evidence system. Three changes worth reviewing: (1) stage-aware context — score evidence differently for continuation vs base-breakout vs reversal candidates (section 2 shows different features matter per context); (2) veto layer — hard filters from section 6 candidates rather than negative points; (3) per-horizon scores — section 1 shows the same score cannot serve 20-bar and 250-bar objectives equally.' },
    { q: 'Features to keep?', a: 'Those with stable positive contribution across labels AND walk-forward folds (compare section 1 models with phase-1 coefficients). weeklyUp (subject to Q2), obvRising, volDryUp, aboveSma200, nearHigh, compression-inside-weekly-uptrend interaction.' },
    { q: 'Features to remove?', a: 'Phase 1 already showed volExpansion, cmfPos, bosWithTrend, standalone rsPositive ≈ zero contribution. Phase 2 must confirm they stay flat across labels A–E before final removal (check section 2 per-category tables — a feature dead overall may live inside one setup type).' },
    { q: 'Features requiring more testing?', a: `sectorRsPos is still UNTESTED (data gap — sector index candles; see download-failures.json). The chasing penalty/extended flag needs a decision per horizon: phase 1 showed it inverts for large moves. Category-D (speculative) features have small n — need a dedicated penny-stock universe run.` },
    { q: 'Adopt, modify, or reject V2?', a: `Walk-forward consistency: ${consistency}. Veto candidates found: ${vetoList.length ? vetoList.join('; ') : 'none cleared the 1.5× bar'}. Recommendation rule: ADOPT-WITH-MODIFICATIONS if V2 beat base+V1 in ≥3 folds AND capture of D/E winners > 15%; otherwise MODIFY (adopt only per-feature findings + vetoes, keep score structure) — final call is a human review of sections 1–6.` },
  ]
}

main().catch((e) => { console.error('phase2 failed:', e); process.exit(1) })
