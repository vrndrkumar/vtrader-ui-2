// ── Phase-5 runner: Pattern Evolution + Behaviour Quality + Evidence Audit ───
// Usage: node research/phase5.js   (reuses research/data cache)
// Output: research/out/research-report-phase5.md (+ phase5-data.json)
// NO production code, weights or schema are touched by this script.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RESEARCH } from './config.js'
import { selectUniverse, downloadAll, medianTurnoverCr } from './dataset.js'
import { extractObservations } from './features.js'
import { FEATURES } from './analyze.js'
import {
  buildSeries, findEpisodes, detectM1, baselineM1, detectM2, detectM3,
  detectM4, baselineM4, detectF2, detectM5F3, detectM6, detectM7, detectF1,
  qualityMetrics, QUALITY_DIMS, withOutcomes,
} from './phase5lib.js'
import { sma, closes } from '../src/indicators.js'
import { config } from '../src/config.js'

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')
fs.mkdirSync(OUT_DIR, { recursive: true })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const DEV_END = RESEARCH.devEndDate
const pct = (v, d = 1) => (v == null ? null : +v.toFixed(d))

const tbl = (rows, cols) => {
  if (!rows?.length) return '_no data_\n'
  const head = `| ${cols.map((c) => c.label).join(' | ')} |`
  const sep = `|${cols.map(() => '---').join('|')}|`
  const body = rows.map((r) => `| ${cols.map((c) => r[c.key] ?? '—').join(' | ')} |`).join('\n')
  return `${head}\n${sep}\n${body}\n`
}

function stats(events, labelKey = 'winB') {
  const n = events.length
  const wins = events.filter((e) => e[labelKey] === true).length
  return { n, p: n ? +((wins / n) * 100).toFixed(1) : null }
}
function splitDevVal(events) {
  return { dev: events.filter((e) => e.date <= DEV_END), val: events.filter((e) => e.date > DEV_END) }
}

/** Motif vs its baseline on dev + val, with the pre-registered decision rules. */
function judgeMotif(name, events, baseline, minSupport = 100) {
  const ev = splitDevVal(events)
  const bl = splitDevVal(baseline)
  const dB = stats(ev.dev, 'winB'), dD = stats(ev.dev, 'winD')
  const bB = stats(bl.dev, 'winB'), bD = stats(bl.dev, 'winD')
  const vB = stats(ev.val, 'winB'), vBl = stats(bl.val, 'winB')
  const liftDevB = dB.p != null && bB.p ? +(dB.p / bB.p).toFixed(2) : null
  const liftDevD = dD.p != null && bD.p ? +(dD.p / bD.p).toFixed(2) : null
  const liftValB = vB.p != null && vBl.p ? +(vB.p / vBl.p).toFixed(2) : null
  let verdict = 'INSUFFICIENT SAMPLE — no conclusion'
  if (dB.n >= minSupport) {
    const passes = liftDevB != null && liftDevB > 1 && liftDevD != null && liftDevD > 1 &&
      (vB.n >= 30 ? liftValB != null && liftValB > 1 : true)
    verdict = passes ? (vB.n >= 30 ? 'VALIDATED' : 'DEV-POSITIVE (validation sample thin)') : 'REJECTED — no edge over unordered baseline'
  }
  return {
    motif: name,
    nDev: dB.n, nVal: vB.n,
    devWinB: dB.p, baseWinB: bB.p, liftDevB,
    devWinD: dD.p, baseWinD: bD.p, liftDevD,
    valWinB: vB.p, valBaseWinB: vBl.p, liftValB,
    verdict,
  }
}

/** Failure motif: flagged win rate must be ≤ 0.67× unflagged, dev AND val. */
function judgeFailure(name, flagged, clean, minSupport = 100) {
  const f = splitDevVal(flagged), c = splitDevVal(clean)
  const fd = stats(f.dev), cd = stats(c.dev), fv = stats(f.val), cv = stats(c.val)
  const ratioDev = fd.p != null && cd.p ? +(fd.p / cd.p).toFixed(2) : null
  const ratioVal = fv.p != null && cv.p ? +(fv.p / cv.p).toFixed(2) : null
  let verdict = 'INSUFFICIENT SAMPLE — no conclusion'
  if (fd.n >= minSupport) {
    const pass = ratioDev != null && ratioDev <= 0.67 && (fv.n >= 30 ? ratioVal != null && ratioVal <= 0.67 : true)
    verdict = pass ? (fv.n >= 30 ? 'VALIDATED VETO' : 'DEV-POSITIVE (validation thin)') : 'REJECTED — not a reliable veto'
  }
  return { motif: name, nFlagDev: fd.n, flagWin: fd.p, cleanWin: cd.p, ratioDev, nFlagVal: fv.n, ratioVal, verdict }
}

async function main() {
  // ── data (same universe/seed as all phases) ───────────────────────────────
  log('loading universe + candles…')
  const universe = await selectUniverse()
  const sectorIdxSymbols = [...new Set(universe.map((u) => u.sector_index_symbol).filter(Boolean))]
  const { series } = await downloadAll([config.benchmarkSymbol, ...sectorIdxSymbols, ...universe.map((u) => u.symbol_code)], log)
  const nifty = series.get(config.benchmarkSymbol)
  if (!nifty) throw new Error('NIFTY missing')

  // ── stride-1 motif detection per stock ────────────────────────────────────
  log('detecting motifs (stride-1)…')
  const all = { M1: [], M1b: [], M2: [], M3: [], M4: [], M4b: [], M5: [], M6: [], M7: [], F1f: [], F1c: [], F2: [], F3: [] }
  const m1Quality = [] // {dims..., winB, winD, date}
  let used = 0
  for (const u of universe) {
    const daily = series.get(u.symbol_code)
    if (!daily || daily.length < 350 || medianTurnoverCr(daily) < RESEARCH.minTurnoverCr) continue
    used++
    const S = buildSeries(daily, nifty)
    const eps = findEpisodes(S)
    const m1 = detectM1(S, eps)
    all.M1.push(...withOutcomes(daily, m1))
    all.M1b.push(...withOutcomes(daily, baselineM1(S)))
    all.M2.push(...withOutcomes(daily, detectM2(S, eps)))
    all.M3.push(...withOutcomes(daily, detectM3(S, eps)))
    all.M4.push(...withOutcomes(daily, detectM4(S)))
    all.M4b.push(...withOutcomes(daily, baselineM4(S)))
    const { springs, failures } = detectM5F3(S, eps)
    all.M5.push(...withOutcomes(daily, springs))
    all.F3.push(...withOutcomes(daily, failures))
    all.M6.push(...withOutcomes(daily, detectM6(S)))
    all.M7.push(...withOutcomes(daily, detectM7(S)))
    const { flagged, clean } = detectF1(S, eps)
    all.F1f.push(...withOutcomes(daily, flagged))
    all.F1c.push(...withOutcomes(daily, clean))
    all.F2.push(...withOutcomes(daily, detectF2(S)))
    // behaviour quality on M1 episodes
    for (const e of withOutcomes(daily, m1)) {
      const q = qualityMetrics(S, e.ep)
      if (q) m1Quality.push({ ...q, winB: e.winB, winD: e.winD, date: e.date })
    }
  }
  log(`motifs detected across ${used} stocks · M1 ${all.M1.length} · M4 ${all.M4.length} · quality rows ${m1Quality.length}`)

  // ── motif judgements (pre-registered rules) ───────────────────────────────
  const motifRows = [
    judgeMotif('M1 Rest after run (ordered)', all.M1, all.M1b),
    judgeMotif('M2 Monotonic contraction', all.M2, all.M1), // baseline: episodes qualifying M1 (contraction must beat plain quality base)
    judgeMotif('M3 Dry-up deepening', all.M3, all.M1),
    judgeMotif('M4 Accumulation precedes turn', all.M4, all.M4b),
    judgeMotif('M5 Shakeout / spring', all.M5, all.M1),
    judgeMotif('M6 Down-day resilience', all.M6, all.M1b),
    judgeMotif('M7 Higher-low cadence', all.M7, all.M1b),
  ]
  const failureRows = [
    judgeFailure('F1 Distribution-then-quiet', all.F1f, all.F1c),
    judgeFailure('F2 Price-led turn (vs M4 turns)', all.F2, all.M4),
    judgeFailure('F3 Unrecovered undercut (vs springs)', all.F3, all.M5, 50),
  ]

  // ── behaviour quality: terciles frozen on dev ─────────────────────────────
  log('behaviour quality analysis…')
  const qDev = m1Quality.filter((q) => q.date <= DEV_END)
  const qVal = m1Quality.filter((q) => q.date > DEV_END)
  const qualityRows = []
  for (const [dim, def] of Object.entries(QUALITY_DIMS)) {
    const devVals = qDev.map((q) => q[dim]).filter((v) => v != null && Number.isFinite(v)).sort((a, b) => a - b)
    if (devVals.length < 150) { qualityRows.push({ dimension: def.label, verdict: 'INSUFFICIENT SAMPLE' }); continue }
    const t1 = devVals[Math.floor(devVals.length / 3)]
    const t2 = devVals[Math.floor((devVals.length * 2) / 3)]
    const bucket = (v) => (v == null ? null : v <= t1 ? 'good' : v >= t2 ? 'bad' : 'mid') // 'low is better' orientation
    const orient = (b) => (def.better === 'low' ? b : def.better === 'mid' ? (b === 'mid' ? 'good' : 'bad') : b === 'good' ? 'bad' : 'good')
    const rate = (set, want) => {
      const s = set.filter((q) => q[dim] != null && orient(bucket(q[dim])) === want)
      return { n: s.length, p: s.length ? +((s.filter((q) => q.winB).length / s.length) * 100).toFixed(1) : null }
    }
    const gDev = rate(qDev, 'good'), bDev = rate(qDev, 'bad')
    const gVal = rate(qVal, 'good'), bVal = rate(qVal, 'bad')
    const ratioDev = gDev.p != null && bDev.p ? +(gDev.p / bDev.p).toFixed(2) : null
    const ratioVal = gVal.p != null && bVal.p ? +(gVal.p / bVal.p).toFixed(2) : null
    let verdict = 'REJECTED'
    if (gDev.n < 100 || bDev.n < 100) verdict = 'INSUFFICIENT SAMPLE'
    else if (ratioDev != null && ratioDev >= 1.25 && (gVal.n >= 30 ? ratioVal != null && ratioVal > 1 : true)) {
      verdict = gVal.n >= 30 ? 'VALIDATED' : 'DEV-POSITIVE (validation thin)'
    }
    qualityRows.push({
      dimension: def.label, nGoodDev: gDev.n, goodWin: gDev.p, badWin: bDev.p, ratioDev,
      goodWinVal: gVal.p, ratioVal, verdict,
    })
  }
  const validatedQ = qualityRows.filter((q) => q.verdict === 'VALIDATED').length

  // ── evidence audit (stride-5 obs matrix, same as phases 1-4) ──────────────
  log('evidence audit…')
  const dateOf = (c) => new Date(c.time * 1000).toISOString().slice(0, 10)
  const niftyByDate = new Map(nifty.map((c) => [dateOf(c), c.close]))
  const nSma200 = sma(closes(nifty), 200)
  const regimeByDate = new Map(nifty.map((c, i) => [dateOf(c), nSma200[i] != null ? c.close > nSma200[i] : null]))
  const obs = []
  for (const u of universe) {
    const daily = series.get(u.symbol_code)
    if (!daily || medianTurnoverCr(daily) < RESEARCH.minTurnoverCr) continue
    obs.push(...extractObservations(u.symbol_code, u, daily, niftyByDate, regimeByDate, null))
  }
  const devObs = obs.filter((o) => o.date <= DEV_END)
  const win = (o) => o.fwdGain >= 20 && o.fwdGain > Math.abs(o.fwdDD) // label-B analogue on 40-bar window

  // (a) redundancy: phi correlation + conditional lift among production features
  const PROD = ['compressed', 'volDryUp', 'obvRising', 'weeklyUp', 'aboveSma200', 'nearHigh', 'rsImproving', 'adxLow', 'rsiMid']
  const flags = {}
  for (const f of PROD) flags[f] = devObs.map((o) => FEATURES[f](o) === true)
  const base = devObs.filter(win).length / (devObs.length || 1)
  const redundancy = []
  for (let a = 0; a < PROD.length; a++) {
    for (let b = a + 1; b < PROD.length; b++) {
      const A = flags[PROD[a]], B = flags[PROD[b]]
      let n11 = 0, n10 = 0, n01 = 0, n00 = 0
      for (let i = 0; i < A.length; i++) {
        if (A[i] && B[i]) n11++
        else if (A[i]) n10++
        else if (B[i]) n01++
        else n00++
      }
      const num = n11 * n00 - n10 * n01
      const den = Math.sqrt((n11 + n10) * (n01 + n00) * (n11 + n01) * (n10 + n00))
      const phi = den ? +(num / den).toFixed(2) : null
      if (phi != null && Math.abs(phi) > 0.5) {
        // conditional lift of A within B
        const inB = devObs.filter((o, i) => B[i])
        const inBA = inB.filter((o, idx) => FEATURES[PROD[a]](o) === true)
        const pB = inB.filter(win).length / (inB.length || 1)
        const pBA = inBA.filter(win).length / (inBA.length || 1)
        redundancy.push({ pair: `${PROD[a]} × ${PROD[b]}`, phi, condLift: pB ? +(pBA / pB).toFixed(2) : null, n: n11 })
      }
    }
  }
  // (b) new participation behaviours — evaluated on stride-1 series is costly; use per-obs recompute via phase5 arrays? Fixed: evaluate at episode signal bars is non-comparable; evaluate as static features on dev obs is impossible (fields absent). Documented decision: they were computed in buildSeries; sample at stride-5 bars here.
  const partRows = []
  {
    const defs = {
      'Down-day RS rising': (S, i) => S.downDayRS[i] != null && S.downDayRS[i - 10] != null && S.downDayRS[i] > S.downDayRS[i - 10],
      'Closing range high (>0.6)': (S, i) => S.closingRange20[i] != null && S.closingRange20[i] > 0.6,
      'Up/down volume asym (>1.3)': (S, i) => S.volAsym20[i] != null && S.volAsym20[i] > 1.3,
      'Gap-up frequency (≥10%)': (S, i) => S.gapUpFreq20[i] != null && S.gapUpFreq20[i] >= 0.1,
    }
    const acc = Object.fromEntries(Object.keys(defs).map((k) => [k, { on: [], off: [] }]))
    for (const u of universe) {
      const daily = series.get(u.symbol_code)
      if (!daily || daily.length < 350 || medianTurnoverCr(daily) < RESEARCH.minTurnoverCr) continue
      const S = buildSeries(daily, nifty)
      for (let i = 260; i < daily.length - 40; i += 5) {
        const date = new Date(daily[i].time * 1000).toISOString().slice(0, 10)
        if (date > DEV_END) continue
        const B = forwardWin(daily, i)
        if (B == null) continue
        for (const [k, fn] of Object.entries(defs)) (fn(S, i) ? acc[k].on : acc[k].off).push(B)
      }
    }
    for (const [k, v] of Object.entries(acc)) {
      const pOn = v.on.length ? (v.on.filter(Boolean).length / v.on.length) * 100 : null
      const pOff = v.off.length ? (v.off.filter(Boolean).length / v.off.length) * 100 : null
      partRows.push({ behaviour: k, n: v.on.length, pWin: pct(pOn), lift: pOn != null && pOff ? +(pOn / pOff).toFixed(2) : null })
    }
  }
  function forwardWin(daily, i) {
    if (i + 40 >= daily.length) return null
    const entry = daily[i].close
    let mg = -Infinity, ml = Infinity
    for (let k = 1; k <= 40; k++) { mg = Math.max(mg, daily[i + k].high); ml = Math.min(ml, daily[i + k].low) }
    const gain = ((mg - entry) / entry) * 100
    const dd = ((ml - entry) / entry) * 100
    return gain >= 20 && gain > Math.abs(dd)
  }

  // (c) granularity: priorGain120 strength buckets among priorAdvance bars (monotonicity)
  const granRows = []
  {
    const buckets = { 'weak 30–60%': [30, 60], 'clear 60–120%': [60, 120], 'strong >120%': [120, 1e9] }
    for (const [name, [lo, hi]] of Object.entries(buckets)) {
      const set = devObs.filter((o) => o.priorGain120 != null && o.priorGain120 >= lo && o.priorGain120 < hi)
      granRows.push({ bucket: name, n: set.length, pWin: pct(set.length ? (set.filter(win).length / set.length) * 100 : null) })
    }
  }

  // ── report ────────────────────────────────────────────────────────────────
  const md = `# Stock Insight — Phase-5 Research Report
## Pattern Evolution · Behaviour Quality · Failure Sequences · Evidence Audit

Generated: ${new Date().toISOString()} · Protocol: docs/INSIGHT_PHASE5_PROTOCOL.md (pre-registered; definitions frozen) · ${used} stocks, stride-1 sequence detection · dev ≤ ${DEV_END}, validation touched once. NO production change is authorised by this report.

## 1. Sequence motifs — ordered behaviour vs unordered baselines

Decision rule: a motif is VALIDATED only if it beats its own unordered/static baseline on dev (labels B **and** D), holds on validation, n≥100.

${tbl(motifRows, [
    { key: 'motif', label: 'Motif' }, { key: 'nDev', label: 'n dev' },
    { key: 'devWinB', label: 'Win B %' }, { key: 'baseWinB', label: 'Baseline B %' }, { key: 'liftDevB', label: 'Lift B' },
    { key: 'devWinD', label: 'Win D %' }, { key: 'liftDevD', label: 'Lift D' },
    { key: 'nVal', label: 'n val' }, { key: 'liftValB', label: 'Val lift B' }, { key: 'verdict', label: 'Verdict' },
  ])}
## 2. Failure sequences — veto candidates

Rule: flagged subset win rate ≤ 0.67× unflagged, dev AND validation.

${tbl(failureRows, [
    { key: 'motif', label: 'Failure motif' }, { key: 'nFlagDev', label: 'n flagged dev' },
    { key: 'flagWin', label: 'Flagged win %' }, { key: 'cleanWin', label: 'Clean win %' },
    { key: 'ratioDev', label: 'Ratio dev' }, { key: 'nFlagVal', label: 'n val' }, { key: 'ratioVal', label: 'Ratio val' },
    { key: 'verdict', label: 'Verdict' },
  ])}
## 3. Behaviour Quality (within M1 rest-after-run episodes, n=${m1Quality.length})

"Both stocks show the sequence — how GOOD is it?" Terciles frozen on dev; rule: good-vs-bad win ratio ≥1.25 dev, direction holds val.

${tbl(qualityRows, [
    { key: 'dimension', label: 'Quality dimension' }, { key: 'nGoodDev', label: 'n good dev' },
    { key: 'goodWin', label: 'Good-tercile win %' }, { key: 'badWin', label: 'Bad-tercile win %' },
    { key: 'ratioDev', label: 'Ratio dev' }, { key: 'ratioVal', label: 'Ratio val' }, { key: 'verdict', label: 'Verdict' },
  ])}
Composite quality grade proposed: **${validatedQ >= 3 ? `YES — ${validatedQ} dimensions validated independently` : `NO — only ${validatedQ} dimension(s) validated (≥3 required)`}**.

## 4. Evidence audit

### 4a. Redundancy (|phi| > 0.5 pairs; retirement needs |phi|>0.8 AND conditional lift ≈ 1.0)
${tbl(redundancy, [
    { key: 'pair', label: 'Feature pair' }, { key: 'phi', label: 'phi' }, { key: 'condLift', label: 'Conditional lift' }, { key: 'n', label: 'n both' },
  ])}
### 4b. Missing participation behaviours (dev, label-B analogue)
${tbl(partRows, [
    { key: 'behaviour', label: 'Behaviour' }, { key: 'n', label: 'n' }, { key: 'pWin', label: 'P(win) %' }, { key: 'lift', label: 'Lift vs off' },
  ])}
### 4c. Score granularity — prior-advance strength monotonicity (dev)
${tbl(granRows, [{ key: 'bucket', label: 'Bucket' }, { key: 'n', label: 'n' }, { key: 'pWin', label: 'P(win) %' }])}
Graded points are recommended only if win rates are monotone across buckets here AND on validation (checked at review).

## 5. Recommendations register

Every row above with verdict VALIDATED becomes a candidate recommendation in the CEO format (Observation/Pattern/Finding/Confidence/Suggested Research/Status = RESEARCH REQUIRED → CANDIDATE FOR CHALLENGER). Rows marked REJECTED are closed. Rows marked INSUFFICIENT/DEV-POSITIVE stay open for CRI forward confirmation. **No item enters production without explicit CEO approval.**

## 6. Integrity notes
Closed motif list (10) and quality-dimension list (6) executed exactly as pre-registered; no grid was widened after seeing results. Baselines for M2/M3/M5 use M1 episodes (sequence-within-sequence must beat plain sequence). Survivorship caveat applies to all absolute rates equally; CRI forward data is the clean confirmation channel.
`
  fs.writeFileSync(path.join(OUT_DIR, 'research-report-phase5.md'), md)
  fs.writeFileSync(path.join(OUT_DIR, 'phase5-data.json'), JSON.stringify({ motifRows, failureRows, qualityRows, redundancy, partRows, granRows }, null, 2))
  log(`done → ${path.join(OUT_DIR, 'research-report-phase5.md')}`)
  process.exit(0)
}

main().catch((e) => { console.error('phase5 failed:', e); process.exit(1) })
