// ── Phase-3 runner ───────────────────────────────────────────────────────────
// Usage: node research/phase3.js  (reuses research/data cache)
// Output: research/out/research-report-phase3.md (+ phase3-data.json)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RESEARCH } from './config.js'
import { selectUniverse, downloadAll, medianTurnoverCr } from './dataset.js'
import { extractObservations } from './features.js'
import { splitDevVal, designMatrix } from './analyze.js'
import { attachLabels } from './phase2lib.js'
import {
  trainUniversal, engineComparison, engineFeatureTable, breakoutDefinitionSweep,
  reversalSignalTest, multibaggerStudy, engineCapture, riskSeparationTest, featureUniversality,
} from './phase3lib.js'
import { renderPhase3 } from './phase3report.js'
import { sma, closes } from '../src/indicators.js'
import { config } from '../src/config.js'

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')
fs.mkdirSync(OUT_DIR, { recursive: true })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

async function main() {
  log('selecting universe…')
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

  log('extracting observations + labels…')
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

  log('training universal model…')
  const universal = trainUniversal(dev, 'B')

  log('engine comparison (specialized vs universal)…')
  const { rows: engineRows, engineModels } = engineComparison(dev, val, universal)

  log('per-engine feature tables, breakout sweep, reversal signals…')
  const engineFeats = engineFeatureTable(dev)
  const breakoutSweep = breakoutDefinitionSweep(dev)
  const reversal = reversalSignalTest(dev)

  log('multibagger study…')
  const mbStudy = multibaggerStudy(dev, 'E')

  log('capture + risk separation (validation)…')
  const capture = engineCapture(val, engineModels, universal)
  const riskSep = riskSeparationTest(val, universal)

  const { names } = designMatrix(dev.slice(0, 5))
  const universality = featureUniversality(engineModels, universal, names)

  // Auto architecture verdict from pre-declared rule:
  // count engines where specialization beats universal by >2pp on validation
  const valid = engineRows.filter((r) => r.specEdge != null)
  const specWins = valid.filter((r) => r.specEdge > 2).length
  const specLosses = valid.filter((r) => r.specEdge < -2).length
  let architecture
  if (specWins >= 3) {
    architecture = `**Option B/C — specialization pays.** ${specWins}/${valid.length} engines beat the universal model by >2pp on their own validation candidates. Recommend Option C (hybrid): common regime/liquidity/risk layer + specialized engine scores, because the universality table (section 8) still shows shared core features.`
  } else if (specWins >= 1 && specLosses === 0) {
    architecture = `**Option C — selective hybrid.** Specialization helps in ${specWins} engine(s) and never hurts materially. Recommend: keep ONE universal opportunity model as the backbone, add specialized scoring only where the edge appeared (see section 1), present per-engine context labels in the UI rather than four separate models.`
  } else {
    architecture = `**Option A — one universal score.** Specialized models failed to beat the universal model out-of-sample (${specWins} wins, ${specLosses} losses of ${valid.length}). The taxonomy differences seen in Phase 2 are contexts the universal model already prices via its features. Recommend: single score + context TAGS (momentum/breakout/reversal/speculative) for explanation, not separate engines. Simpler model preferred per the overfitting rules.`
  }
  architecture += `\n\nRisk separation (section 7): ${riskSep.rows[0]?.profitFactor != null && riskSep.rows[1]?.profitFactor != null ? (Math.abs((riskSep.rows[0].profitFactor ?? 0) - (riskSep.rows[1].profitFactor ?? 0)) > 0.15 ? 'ATR buckets materially change outcome quality at equal opportunity score — keep Opportunity and Risk as SEPARATE displayed scores (confirms V1 design choice).' : 'ATR buckets show similar outcome quality — risk affects position sizing more than signal validity; keep the separate risk score for sizing guidance.') : 'insufficient data.'}`

  const datasetInfo = `Dataset: ${used} liquid stocks, ${observations.length} observations (dev ${dev.length} / val ${val.length}), same universe/seed as Phases 1–2. Engines share the candidate universe; an observation may qualify for several engines.`
  const md = renderPhase3({ datasetInfo, engineRows, engineFeats, breakoutSweep, reversal, mbStudy, capture, riskSep, universality, architecture })
  const out = path.join(OUT_DIR, 'research-report-phase3.md')
  fs.writeFileSync(out, md)
  fs.writeFileSync(path.join(OUT_DIR, 'phase3-data.json'), JSON.stringify({ engineRows, breakoutSweep, reversal, mbStudy, capture, riskSep, universality }, null, 2))
  log(`done → ${out}`)
  process.exit(0)
}

main().catch((e) => { console.error('phase3 failed:', e); process.exit(1) })
