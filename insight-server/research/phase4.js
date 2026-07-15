// ── Phase-4 runner: Early Discovery validation ───────────────────────────────
// Usage: node research/phase4.js  (reuses research/data cache)
// Output: research/out/research-report-phase4.md (+ phase4-data.json)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RESEARCH } from './config.js'
import { selectUniverse, downloadAll, medianTurnoverCr } from './dataset.js'
import { extractObservations } from './features.js'
import { splitDevVal } from './analyze.js'
import { attachLabels } from './phase2lib.js'
import {
  attachTransitions, attachWeeklyRanks, discoveryTiming,
  priorAdvanceDecomposition, discoveryFalsePositives, ENGINE_SCORES,
} from './phase4lib.js'
import { sma, closes } from '../src/indicators.js'
import { config } from '../src/config.js'

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')
fs.mkdirSync(OUT_DIR, { recursive: true })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const tbl = (rows, cols) => {
  if (!rows?.length) return '_no data_\n'
  const head = `| ${cols.map((c) => c.label).join(' | ')} |`
  const sep = `|${cols.map(() => '---').join('|')}|`
  const body = rows.map((r) => `| ${cols.map((c) => r[c.key] ?? '—').join(' | ')} |`).join('\n')
  return `${head}\n${sep}\n${body}\n`
}

async function main() {
  log('loading data…')
  const universe = await selectUniverse()
  const sectorIdxSymbols = [...new Set(universe.map((u) => u.sector_index_symbol).filter(Boolean))]
  const { series } = await downloadAll([config.benchmarkSymbol, ...sectorIdxSymbols, ...universe.map((u) => u.symbol_code)], log)
  const nifty = series.get(config.benchmarkSymbol)
  if (!nifty) throw new Error('NIFTY missing')
  const dateOf = (c) => new Date(c.time * 1000).toISOString().slice(0, 10)
  const niftyByDate = new Map(nifty.map((c) => [dateOf(c), c.close]))
  const nSma200 = sma(closes(nifty), 200)
  const regimeByDate = new Map(nifty.map((c, i) => [dateOf(c), nSma200[i] != null ? c.close > nSma200[i] : null]))
  const sectorMaps = new Map(sectorIdxSymbols.filter((s) => series.has(s)).map((s) => [s, new Map(series.get(s).map((c) => [dateOf(c), c.close]))]))

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
  attachTransitions(observations)
  attachWeeklyRanks(observations)
  const { dev, val } = splitDevVal(observations)
  log(`obs ${observations.length} from ${used} stocks · dev ${dev.length} / val ${val.length}`)

  // 1. Discovery timing — measured on VALIDATION episodes (out-of-sample moves)
  log('discovery timing (validation episodes)…')
  const timingRows = []
  for (const target of ['+50%/120b', '+100%/250b', '+200%/250b']) {
    timingRows.push(...discoveryTiming(val, target))
  }

  // 2. Prior-advance decomposition (dev)
  log('prior-advance decomposition…')
  const decomp = priorAdvanceDecomposition(dev)

  // 3. False positives of Discovery top decile (dev)
  log('discovery false positives…')
  const fps = discoveryFalsePositives(dev, 'D')

  // Sanity: engine coverage
  const coverage = Object.entries(ENGINE_SCORES).map(([name, fn]) => {
    const nz = observations.filter((o) => fn(o) > 0).length
    return { engine: name, scoredNonZero: nz, pctOfObs: +((nz / observations.length) * 100).toFixed(1) }
  })

  const md = `# Stock Insight — Phase-4: Early Discovery Validation

Generated: ${new Date().toISOString()} · Engine prototypes are rule-based with weights fixed from Phase-3 lifts BEFORE this run. NO production code changed.

Dataset: ${used} stocks, ${observations.length} observations (dev ${dev.length} / val ${val.length}). Timing analysis uses VALIDATION-period move episodes only (out-of-sample). Ranks are weekly cross-sectional percentiles — "top 10%" means top decile of ALL stocks that week, exactly like the daily-scan product workflow.

## 0. Engine coverage

${tbl(coverage, [{ key: 'engine', label: 'Engine' }, { key: 'scoredNonZero', label: 'Obs scored > 0' }, { key: 'pctOfObs', label: '% of all obs' }])}
## 1. Discovery timing — does anything fire BEFORE the move?

For every validation move episode: when did the symbol FIRST enter each detector's weekly top decile (top-20% also shown for Discovery), scanning up to 250 bars before the move start. "% ≥90d before" = detected at least 90 trading days early.

${tbl(timingRows, [
  { key: 'target', label: 'Move' },
  { key: 'detector', label: 'Detector' },
  { key: 'episodes', label: 'Episodes' },
  { key: 'detectedPct', label: 'Detected at all %' },
  { key: 'medianLeadBars', label: 'Median lead (bars)' },
  { key: 'pct90dBefore', label: '≥90d early %' },
  { key: 'pct60dBefore', label: '≥60d early %' },
  { key: 'pct30dBefore', label: '≥30d early %' },
])}
Interpretation guide: a detector is an EARLY detector if its ≥60d-early rate is well above what random top-decile membership would give; long median leads with high detection = discovery, short leads = confirmation.

## 2. Prior-advance decomposition (dev)

Is prior advance doing all the work, or do compression/dry-up/OBV/weekly-turn add real edge on top?

Base rate (label B): ${decomp.baseB}%.

${tbl(decomp.rows, [
  { key: 'definition', label: 'Definition' },
  { key: 'n', label: 'n' },
  { key: 'pWinB', label: 'P(win +20%/40b) %' },
  { key: 'liftB', label: 'Lift' },
  { key: 'pWinD', label: 'P(+50%/120b) %' },
  { key: 'pWinE', label: 'P(+100%/250b) %' },
  { key: 'note', label: 'Note' },
])}
## 3. Discovery top-decile false positives (dev, judged on +50%/120b)

Top-decile n=${fps.topN}, hit rate ${fps.baseWin}%, losers ${fps.losersN}. 40-bar trading quality of these picks: avg ${fps.trading?.avgRet ?? '—'}%, median ${fps.trading?.medianRet ?? '—'}%, PF ${fps.trading?.profitFactor ?? '—'}.

${tbl(fps.rows, [
  { key: 'condition', label: 'Condition' },
  { key: 'pctLosers', label: '% of losers' },
  { key: 'pctWinners', label: '% of winners' },
  { key: 'vetoCandidate', label: 'Veto (≥1.5×)' },
])}
## 4. Protocol integrity

Engine weights fixed from Phase-3 §2 lifts before this run; targets, lookback offsets, gap definition (40 bars between episodes) and veto conditions declared in code. Timing uses validation-period episodes only. Caveats: stride-5 sampling quantises lead times (±5 bars); survivorship bias inflates detection rates for ALL detectors equally; ₹2cr liquidity floor already removed some future winners (bounded in Phase-3 §5 by the turnover gap).
`
  const out = path.join(OUT_DIR, 'research-report-phase4.md')
  fs.writeFileSync(out, md)
  fs.writeFileSync(path.join(OUT_DIR, 'phase4-data.json'), JSON.stringify({ coverage, timingRows, decomp, fps }, null, 2))
  log(`done → ${out}`)
  process.exit(0)
}

main().catch((e) => { console.error('phase4 failed:', e); process.exit(1) })
