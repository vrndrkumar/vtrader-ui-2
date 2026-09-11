// ── Dissect a replay result to find WHERE an engine loses ────────────────────
// Reads research/out/option-replay.json (from optionReplay.mjs) and prints
// per-segment P&L for v2 (and v3), sorted worst-first so failure clusters
// surface. No network — pure analysis of the trades already logged.
//   node research/analyzeReplay.mjs            # analyses v2 then v3
//   node research/analyzeReplay.mjs v3         # v3 only
import { readFileSync } from 'node:fs'

const which = (process.argv[2] || 'both').toLowerCase()
const data = JSON.parse(readFileSync(new URL('./out/option-replay.json', import.meta.url)))
const V2 = data.v2Trades || [], V3 = data.v3Trades || []

const rnd = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(d))
const sum = (a) => a.reduce((x, y) => x + y, 0)
function stat(ts) {
  const n = ts.length; if (!n) return { n: 0 }
  const p = ts.map((t) => t.pnl)
  const w = ts.filter((t) => t.pnl > 0), l = ts.filter((t) => t.pnl <= 0)
  const gW = sum(w.map((t) => t.pnl)), gL = Math.abs(sum(l.map((t) => t.pnl)))
  return {
    n, win: rnd((w.length / n) * 100, 1), exp: rnd(sum(p) / n),
    pf: gL > 0 ? rnd(gW / gL) : (gW > 0 ? 999 : 0), net: rnd(sum(p)),
    avgWin: rnd(w.length ? sum(w.map((t) => t.pnl)) / w.length : 0),
    avgLoss: rnd(l.length ? sum(l.map((t) => t.pnl)) / l.length : 0),
  }
}
const timeBlock = (m) => m < 600 ? '09:20-10:00' : m < 690 ? '10:00-11:30' : m < 780 ? '11:30-13:00' : m < 870 ? '13:00-14:30' : '14:30-15:15'
const vixB = (v) => v == null ? 'unk' : v < 12 ? 'Low(<12)' : v < 16 ? 'Norm(12-16)' : v < 20 ? 'Elev(16-20)' : 'High(20+)'
const confB = (c) => c == null ? 'unk' : c >= 80 ? '80+' : c >= 70 ? '70-79' : c >= 60 ? '60-69' : c >= 50 ? '50-59' : '<50'
const dow = (d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(d + 'T00:00:00Z').getUTCDay()]
const premB = (e) => e == null ? 'unk' : e < 30 ? '<30' : e < 80 ? '30-80' : e < 150 ? '80-150' : '150+'

function group(ts, keyFn, label, sortWorst = true) {
  const m = new Map()
  for (const t of ts) { const k = keyFn(t); if (k == null) continue; (m.get(k) || m.set(k, []).get(k)).push(t) }
  const rows = [...m.entries()].map(([k, arr]) => ({ key: k, ...stat(arr) }))
  rows.sort((a, b) => sortWorst ? (a.net - b.net) : String(a.key).localeCompare(String(b.key)))
  console.log(`\n▸ ${label}`)
  console.log('  ' + 'segment'.padEnd(20) + 'n'.padStart(5) + 'win%'.padStart(7) + 'exp'.padStart(8) + 'PF'.padStart(7) + 'net'.padStart(10) + 'avgW'.padStart(8) + 'avgL'.padStart(8))
  for (const r of rows) console.log('  ' + String(r.key).padEnd(20) + String(r.n).padStart(5) + String(r.win ?? '—').padStart(7) + String(r.exp ?? '—').padStart(8) + String(r.pf ?? '—').padStart(7) + String(r.net ?? '—').padStart(10) + String(r.avgWin ?? '—').padStart(8) + String(r.avgLoss ?? '—').padStart(8))
}

function analyse(name, ts) {
  console.log(`\n\n══════════ ${name}: ${ts.length} trades ══════════`)
  const o = stat(ts)
  console.log(`OVERALL  win ${o.win}%  exp ${o.exp}  PF ${o.pf}  net ${o.net}  avgWin ${o.avgWin}  avgLoss ${o.avgLoss}`)
  group(ts, (t) => t.status, 'by EXIT type (how trades end)')
  group(ts, (t) => `${t.action} ${t.side} ${t.moneyness}`, 'by SETUP (action/side/moneyness)')
  group(ts, (t) => timeBlock(t.openMin), 'by TIME of entry')
  group(ts, (t) => vixB(t.vix), 'by VIX regime')
  group(ts, (t) => confB(t.conf), 'by CONFIDENCE (calibration → should rise)', false)
  group(ts, (t) => premB(t.entry), 'by ENTRY premium size')
  group(ts, (t) => dow(t.day), 'by DAY of week')
  // worst individual trades
  const worst = [...ts].sort((a, b) => a.pnl - b.pnl).slice(0, 12)
  console.log('\n▸ 12 WORST trades')
  for (const t of worst) console.log(`  ${t.day} ${String(Math.floor(t.openMin/60)).padStart(2,'0')}:${String(t.openMin%60).padStart(2,'0')}  ${t.action} ${t.moneyness} ${t.side} @${t.strike}  entry ${t.entry} sl ${t.sl} → exit ${t.exit} (${t.status})  pnl ${rnd(t.pnl)}  vix ${t.vix}`)
}

if (which === 'both' || which === 'v2') analyse('v2 (opt-v2.1)', V2)
if (which === 'both' || which === 'v3') analyse('v3 (opt-v3.0)', V3)
