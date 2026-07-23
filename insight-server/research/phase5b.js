// ── Phase-5b addendum: pre-registered validation checks for the three items
// left open by research-report-phase5.md. Definitions fixed BEFORE this run:
//
//  A) Missing participation behaviours (gap-up freq ≥10%, up/down vol asym >1.3)
//     — validation split + label-D robustness (dev numbers already reported).
//  B) Two-bucket prior advance (30–60% vs ≥60%) — monotonicity on dev AND val,
//     labels B and D (three-bucket version failed monotonicity in Phase 5).
//  C) Composite Correction Quality grade on validation:
//     grade = (#good terciles) − (#bad terciles) over the 3 VALIDATED dims
//     (path efficiency, volume-on-weakness, retracement; tercile cuts frozen
//     from dev). A = ≥2 · C = ≤ −2 · B otherwise.
//     Adoption rule: A-vs-C win ratio ≥ 1.25 dev AND > 1.0 val (label B),
//     direction holds on label D.
//
// Usage: node research/phase5b.js  → research/out/research-report-phase5b.md
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RESEARCH } from './config.js'
import { selectUniverse, downloadAll, medianTurnoverCr } from './dataset.js'
import { buildSeries, findEpisodes, detectM1, qualityMetrics, withOutcomes, QUALITY_DIMS } from './phase5lib.js'
import { config } from '../src/config.js'

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')
fs.mkdirSync(OUT_DIR, { recursive: true })
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const DEV_END = RESEARCH.devEndDate
const pct = (v) => (v == null ? null : +v.toFixed(1))

const VALIDATED_DIMS = ['pathEfficiency', 'volDownCorr', 'retracement'] // all 'low is better'

const tbl = (rows, cols) => {
  if (!rows?.length) return '_no data_\n'
  return `| ${cols.map((c) => c.label).join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n${rows.map((r) => `| ${cols.map((c) => r[c.key] ?? '—').join(' | ')} |`).join('\n')}\n`
}

function outcomes40and120(daily, i) {
  if (i + 120 >= daily.length) return null
  const entry = daily[i].close
  let g40 = -Infinity, l40 = Infinity, g120 = -Infinity, l120 = Infinity
  for (let k = 1; k <= 120; k++) {
    const h = daily[i + k].high, lo = daily[i + k].low
    if (k <= 40) { g40 = Math.max(g40, h); l40 = Math.min(l40, lo) }
    g120 = Math.max(g120, h); l120 = Math.min(l120, lo)
  }
  const gainB = ((g40 - entry) / entry) * 100
  const ddB = ((l40 - entry) / entry) * 100
  const gainD = ((g120 - entry) / entry) * 100
  return { winB: gainB >= 20 && gainB > Math.abs(ddB), winD: gainD >= 50 }
}

function rate(set, key) {
  const n = set.length
  return { n, p: n ? +((set.filter((x) => x[key]).length / n) * 100).toFixed(1) : null }
}

async function main() {
  log('loading data…')
  const universe = await selectUniverse()
  const { series } = await downloadAll([config.benchmarkSymbol, ...universe.map((u) => u.symbol_code)], log)
  const nifty = series.get(config.benchmarkSymbol)
  if (!nifty) throw new Error('NIFTY missing')

  // ── collect stride-5 behaviour samples + M1 quality rows ──────────────────
  const beh = { gap: [], asym: [], all: [] } // {dev, winB, winD}
  const priorBuckets = { 'weak 30–60%': [], 'strong ≥60%': [] }
  const qRows = [] // {dims..., winB, winD, dev}
  let used = 0
  for (const u of universe) {
    const daily = series.get(u.symbol_code)
    if (!daily || daily.length < 350 || medianTurnoverCr(daily) < RESEARCH.minTurnoverCr) continue
    used++
    const S = buildSeries(daily, nifty)
    for (let i = 260; i < daily.length - 120; i += 5) {
      const o = outcomes40and120(daily, i)
      if (!o) continue
      const dev = new Date(daily[i].time * 1000).toISOString().slice(0, 10) <= DEV_END
      const row = { dev, ...o }
      beh.all.push(row)
      if (S.gapUpFreq20[i] != null && S.gapUpFreq20[i] >= 0.1) beh.gap.push(row)
      if (S.volAsym20[i] != null && S.volAsym20[i] > 1.3) beh.asym.push(row)
      if (S.priorGain120[i] != null && S.priorGain120[i] >= 30) {
        ;(S.priorGain120[i] < 60 ? priorBuckets['weak 30–60%'] : priorBuckets['strong ≥60%']).push(row)
      }
    }
    const eps = findEpisodes(S)
    for (const e of withOutcomes(daily, detectM1(S, eps))) {
      const q = qualityMetrics(S, e.ep)
      if (q) qRows.push({ ...q, winB: e.winB, winD: e.winD, dev: e.date <= DEV_END })
    }
  }
  log(`samples: all ${beh.all.length} · gap ${beh.gap.length} · asym ${beh.asym.length} · quality ${qRows.length} · stocks ${used}`)

  // ── A) behaviours: dev + VALIDATION + label D ─────────────────────────────
  const behRows = []
  for (const [name, set] of [['Gap-up frequency ≥10%', beh.gap], ['Up/down volume asym >1.3', beh.asym]]) {
    for (const phase of ['dev', 'val']) {
      const inPhase = set.filter((x) => x.dev === (phase === 'dev'))
      const basePhase = beh.all.filter((x) => x.dev === (phase === 'dev'))
      const rB = rate(inPhase, 'winB'), bB = rate(basePhase, 'winB')
      const rD = rate(inPhase, 'winD'), bD = rate(basePhase, 'winD')
      behRows.push({
        behaviour: name, phase,
        n: rB.n, winB: rB.p, liftB: rB.p != null && bB.p ? +(rB.p / bB.p).toFixed(2) : null,
        winD: rD.p, liftD: rD.p != null && bD.p ? +(rD.p / bD.p).toFixed(2) : null,
      })
    }
  }
  const judgeBeh = (name) => {
    const d = behRows.find((r) => r.behaviour === name && r.phase === 'dev')
    const v = behRows.find((r) => r.behaviour === name && r.phase === 'val')
    if (!d || d.n < 100) return 'INSUFFICIENT'
    const pass = d.liftB > 1.1 && d.liftD > 1 && v.n >= 100 && v.liftB > 1 && v.liftD > 1
    return pass ? 'VALIDATED — candidate for CRI forward confirmation' : 'REJECTED'
  }

  // ── B) two-bucket prior advance ───────────────────────────────────────────
  const priorRows = []
  for (const [bucket, set] of Object.entries(priorBuckets)) {
    for (const phase of ['dev', 'val']) {
      const s = set.filter((x) => x.dev === (phase === 'dev'))
      priorRows.push({ bucket, phase, n: s.length, winB: rate(s, 'winB').p, winD: rate(s, 'winD').p })
    }
  }
  const mono = (phase, key) => {
    const w = priorRows.find((r) => r.bucket.startsWith('weak') && r.phase === phase)?.[key]
    const s = priorRows.find((r) => r.bucket.startsWith('strong') && r.phase === phase)?.[key]
    return w != null && s != null && s > w
  }
  const priorVerdict = mono('dev', 'winB') && mono('val', 'winB') && mono('dev', 'winD') && mono('val', 'winD')
    ? 'VALIDATED — two-tier prior-advance grading recommended'
    : 'REJECTED — keep single-tier points'

  // ── C) composite quality grade (dev-frozen tercile cuts) ──────────────────
  const cuts = {}
  for (const dim of VALIDATED_DIMS) {
    const vals = qRows.filter((q) => q.dev && q[dim] != null && Number.isFinite(q[dim])).map((q) => q[dim]).sort((a, b) => a - b)
    cuts[dim] = { t1: vals[Math.floor(vals.length / 3)], t2: vals[Math.floor((vals.length * 2) / 3)] }
  }
  const gradeOf = (q) => {
    let score = 0
    for (const dim of VALIDATED_DIMS) {
      const v = q[dim]
      if (v == null || !Number.isFinite(v)) continue
      if (v <= cuts[dim].t1) score++       // 'low is better' for all three dims
      else if (v >= cuts[dim].t2) score--
    }
    return score >= 2 ? 'A' : score <= -2 ? 'C' : 'B'
  }
  const gradeRows = []
  for (const phase of ['dev', 'val']) {
    for (const g of ['A', 'B', 'C']) {
      const s = qRows.filter((q) => q.dev === (phase === 'dev') && gradeOf(q) === g)
      gradeRows.push({ phase, grade: g, n: s.length, winB: rate(s, 'winB').p, winD: rate(s, 'winD').p })
    }
  }
  const g = (phase, grade, key) => gradeRows.find((r) => r.phase === phase && r.grade === grade)?.[key]
  const ratioDev = g('dev', 'A', 'winB') && g('dev', 'C', 'winB') ? +(g('dev', 'A', 'winB') / g('dev', 'C', 'winB')).toFixed(2) : null
  const ratioVal = g('val', 'A', 'winB') && g('val', 'C', 'winB') ? +(g('val', 'A', 'winB') / g('val', 'C', 'winB')).toFixed(2) : null
  const dirD = g('dev', 'A', 'winD') != null && g('dev', 'C', 'winD') != null && g('dev', 'A', 'winD') > g('dev', 'C', 'winD')
  const gradeVerdict = ratioDev != null && ratioDev >= 1.25 && ratioVal != null && ratioVal > 1 && dirD
    ? 'VALIDATED — Correction Quality grade (A/B/C) recommended for production (CEO approval required)'
    : 'REJECTED — grade does not hold out of sample'

  const md = `# Stock Insight — Phase-5b Addendum Report

Generated: ${new Date().toISOString()} · Pre-registered addendum to Phase-5 (definitions in research/phase5b.js header, fixed before run) · ${used} stocks · dev ≤ ${DEV_END} · NO production change authorised.

## A. Missing participation behaviours — validation + label-D robustness

${tbl(behRows, [
    { key: 'behaviour', label: 'Behaviour' }, { key: 'phase', label: 'Set' }, { key: 'n', label: 'n' },
    { key: 'winB', label: 'Win B %' }, { key: 'liftB', label: 'Lift B' },
    { key: 'winD', label: 'Win D %' }, { key: 'liftD', label: 'Lift D' },
  ])}
Verdicts: Gap-up frequency → **${judgeBeh('Gap-up frequency ≥10%')}** · Volume asymmetry → **${judgeBeh('Up/down volume asym >1.3')}**

## B. Two-bucket prior advance (30–60% vs ≥60%)

${tbl(priorRows, [
    { key: 'bucket', label: 'Bucket' }, { key: 'phase', label: 'Set' }, { key: 'n', label: 'n' },
    { key: 'winB', label: 'Win B %' }, { key: 'winD', label: 'Win D %' },
  ])}
Verdict: **${priorVerdict}**

## C. Composite Correction Quality grade (A/B/C) — the Phase-5 discovery, out of sample

Grade = (#good) − (#bad) terciles over the 3 validated dimensions (path efficiency, volume-on-weakness, retracement); cuts frozen on dev. A = ≥2, C = ≤ −2.

${tbl(gradeRows, [
    { key: 'phase', label: 'Set' }, { key: 'grade', label: 'Grade' }, { key: 'n', label: 'n' },
    { key: 'winB', label: 'Win B %' }, { key: 'winD', label: 'Win D %' },
  ])}
A-vs-C ratio: dev **${ratioDev ?? '—'}** · validation **${ratioVal ?? '—'}** · label-D direction holds: **${dirD ? 'yes' : 'no'}**

Verdict: **${gradeVerdict}**

## Frozen tercile cuts (for any approved production implementation)
${VALIDATED_DIMS.map((d) => `- ${QUALITY_DIMS[d].label}: good ≤ ${cuts[d].t1?.toFixed(4)} · bad ≥ ${cuts[d].t2?.toFixed(4)}`).join('\n')}

## Integrity
Addendum items, thresholds and the composite rule were declared before this run. Items REJECTED here are closed; VALIDATED items become CEO-approval candidates, with CRI forward confirmation as the ongoing check.
`
  fs.writeFileSync(path.join(OUT_DIR, 'research-report-phase5b.md'), md)
  fs.writeFileSync(path.join(OUT_DIR, 'phase5b-data.json'), JSON.stringify({ behRows, priorRows, gradeRows, cuts, ratioDev, ratioVal }, null, 2))
  log(`done → ${path.join(OUT_DIR, 'research-report-phase5b.md')}`)
  process.exit(0)
}

main().catch((e) => { console.error('phase5b failed:', e); process.exit(1) })
