// ── Research runner ──────────────────────────────────────────────────────────
// Usage:
//   node research/run.js              # full run (downloads on first run, then cached)
//   node research/run.js --refetch    # clear cache and re-download
//
// Output: research/out/research-report.md, v2-weights.json, observations.json
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RESEARCH } from './config.js'
import { selectUniverse, downloadAll, dataDir, medianTurnoverCr } from './dataset.js'
import { extractObservations, v1Score } from './features.js'
import {
  splitDevVal, univariate, combos, sweeps, failureAnalysis,
  designMatrix, trainLogistic, predict, evaluate, win, FEATURES,
} from './analyze.js'
import { renderReport } from './report.js'
import { sma, closes } from '../src/indicators.js'
import { config } from '../src/config.js'

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')
fs.mkdirSync(OUT_DIR, { recursive: true })

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

async function main() {
  if (process.argv.includes('--refetch')) {
    fs.rmSync(dataDir(), { recursive: true, force: true })
    log('cache cleared')
  }

  // 1. Universe
  log('selecting universe from stock_mstr…')
  const universe = await selectUniverse()
  log(`universe: ${universe.length} equities (seed ${RESEARCH.seed})`)

  // 2. Download stock + benchmark + sector index data
  const sectorIdxSymbols = [...new Set(universe.map((u) => u.sector_index_symbol).filter(Boolean))]
  log(`downloading candles: ${universe.length} stocks + NIFTY + ${sectorIdxSymbols.length} sector indices…`)
  const { series, failures: dlFailures } = await downloadAll(
    [config.benchmarkSymbol, ...sectorIdxSymbols, ...universe.map((u) => u.symbol_code)],
    log,
  )
  log(`downloaded ${series.size} series; ${dlFailures.length} failures`)

  const nifty = series.get(config.benchmarkSymbol)
  if (!nifty) throw new Error('NIFTY data missing — cannot compute RS/regime')
  const dateOf = (c) => new Date(c.time * 1000).toISOString().slice(0, 10)
  const niftyByDate = new Map(nifty.map((c) => [dateOf(c), c.close]))
  const niftySma200 = sma(closes(nifty), 200)
  const niftyRegimeByDate = new Map(nifty.map((c, i) => [dateOf(c), niftySma200[i] != null ? c.close > niftySma200[i] : null]))
  const sectorMaps = new Map(
    sectorIdxSymbols
      .filter((s) => series.has(s))
      .map((s) => [s, new Map(series.get(s).map((c) => [dateOf(c), c.close]))]),
  )

  // 3. Liquidity floor + observation extraction
  log('extracting observations…')
  const observations = []
  let excludedIlliquid = 0
  let usedStocks = 0
  for (const u of universe) {
    const candles = series.get(u.symbol_code)
    if (!candles) continue
    if (medianTurnoverCr(candles) < RESEARCH.minTurnoverCr) { excludedIlliquid++; continue }
    const secMap = u.sector_index_symbol ? sectorMaps.get(u.sector_index_symbol) ?? null : null
    observations.push(...extractObservations(u.symbol_code, u, candles, niftyByDate, niftyRegimeByDate, secMap))
    usedStocks++
  }
  log(`observations: ${observations.length} from ${usedStocks} stocks (${excludedIlliquid} excluded for liquidity)`)
  fs.writeFileSync(path.join(OUT_DIR, 'observations.json'), JSON.stringify(observations))

  // 4. Dev/val split — validation NOT used until step 7
  const { dev, val } = splitDevVal(observations)
  log(`dev ${dev.length} · val ${val.length}`)

  // 5. Dev-set analysis
  const uniDev = univariate(dev)
  const uniByLabel = uniDev.rows.map((r) => {
    const row = { feature: r.feature }
    for (const g of RESEARCH.gainThresholdsPct) {
      const u = univariate(dev, g)
      const found = u.rows.find((x) => x.feature === r.feature)
      row[`lift${g}`] = found?.lift ?? null
    }
    return row
  })
  const comboDev = combos(dev, uniDev)
  const sweepDev = sweeps(dev)
  const failures = failureAnalysis(dev)

  // 6. Fit V2 logistic on dev
  log('fitting logistic model on dev…')
  const { X: Xdev, names, stats } = designMatrix(dev)
  const ydev = dev.map((o) => (win(o) ? 1 : 0))
  const model = trainLogistic(Xdev, ydev)
  const coefTable = names
    .map((f, i) => ({ feature: f, coef: +model.w[i].toFixed(3), direction: model.w[i] > 0.02 ? 'FOR' : model.w[i] < -0.02 ? 'AGAINST' : 'negligible' }))
    .sort((a, b) => Math.abs(b.coef) - Math.abs(a.coef))

  // 7. THE single validation pass
  log('evaluating on validation (single pass)…')
  const { X: Xval } = designMatrix(val, stats)
  const yval = val.map((o) => (win(o) ? 1 : 0))
  const rows = []
  const evalModel = (label, scoresDev, scoresVal) => {
    rows.push({ model: label, set: 'dev', ...evaluate(scoresDev, ydev.map(Boolean)) })
    rows.push({ model: label, set: 'VALIDATION', ...evaluate(scoresVal, yval.map(Boolean)) })
  }
  evalModel('V1 Explosion score', dev.map(v1Score), val.map(v1Score))
  evalModel('V2 logistic', Xdev.map((x) => predict(model, x)), Xval.map((x) => predict(model, x)))

  const v1Val = rows.find((r) => r.model === 'V1 Explosion score' && r.set === 'VALIDATION')
  const v2Val = rows.find((r) => r.model === 'V2 logistic' && r.set === 'VALIDATION')
  const verdict =
    v2Val.precisionTop10 > v1Val.precisionTop10 && (v2Val.auc ?? 0) >= (v1Val.auc ?? 0)
      ? 'ADOPT V2 — it outperforms V1 on unseen data'
      : v2Val.precisionTop10 > v1Val.precisionTop10
        ? 'PARTIAL — better precision but not AUC; adopt cautiously, prefer threshold/veto changes only'
        : 'REJECT V2 model — V1 held up better on unseen data; adopt only individual threshold/veto changes that passed the decision rule'

  // 8. V2 weight proposal from boolean coefficients
  const V1_POINTS = {
    is_compressed: 18, is_volDryUp: 4, is_cmfPos: 8, is_obvRising: 6, is_rsImproving: 6,
    is_rsPositive: 9, is_sectorRsPos: 0, is_dailyUptrend: 0, is_chochInDown: 12,
    is_bosWithTrend: 10, is_weeklyUp: 7, is_aboveSma200: 0, is_regimeUp: 0,
    is_relVolAccel: 0, is_nearHigh: 0, is_extended: -12,
  }
  const boolCoefs = coefTable.filter((c) => c.feature.startsWith('is_'))
  const posSum = boolCoefs.filter((c) => c.coef > 0).reduce((s, c) => s + c.coef, 0) || 1
  const v2Weights = boolCoefs.map((c) => {
    const v2pts = c.coef > 0 ? Math.round((c.coef / posSum) * 85) : c.coef < -0.02 ? Math.round(c.coef * 10) : 0
    const v1pts = V1_POINTS[c.feature] ?? 0
    return {
      feature: c.feature.replace('is_', ''),
      v1Points: v1pts,
      v2Points: v2pts,
      change: v2pts === v1pts ? '=' : v2pts > v1pts ? `+${v2pts - v1pts}` : `${v2pts - v1pts}`,
    }
  }).sort((a, b) => b.v2Points - a.v2Points)
  fs.writeFileSync(path.join(OUT_DIR, 'v2-weights.json'), JSON.stringify({ generatedAt: new Date().toISOString(), verdict, weights: v2Weights, logistic: { names, w: model.w, b: model.b, stats } }, null, 2))

  // 9. Report
  const universeInfo = `Universe: ${universe.length} sampled equities (deterministic, seed ${RESEARCH.seed}); ${usedStocks} used after liquidity floor (median turnover ≥ ₹${RESEARCH.minTurnoverCr}cr); ${excludedIlliquid} excluded illiquid; ${dlFailures.length} download failures.`
  const md = renderReport({
    universeInfo, devN: dev.length, valN: val.length,
    uniDev, uniByLabel, comboDev, sweepDev, failures,
    modelEval: rows, coefTable, v2Weights, verdict,
  })
  const reportPath = path.join(OUT_DIR, 'research-report.md')
  fs.writeFileSync(reportPath, md)
  log(`done → ${reportPath}`)
  console.log('\n════ VERDICT ════\n' + verdict)
  process.exit(0)
}

main().catch((e) => {
  console.error('research run failed:', e)
  process.exit(1)
})
