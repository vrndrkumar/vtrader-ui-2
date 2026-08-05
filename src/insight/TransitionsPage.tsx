import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
/// <reference types="vite/client" />
import axios from 'axios'
import { BadgeChip } from './components/Badges'
import type { Badge } from './types'

const BASE = (import.meta.env.VITE_INSIGHT_API as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3600' : 'http://164.52.201.122:3600')
const client = axios.create({ baseURL: BASE })

interface TRow {
  symbol_code: string; symbol_name: string | null; sector: string | null
  transition_date: string; from_badge: Badge | null; to_badge: Badge | null
  from_discovery: number | null; to_discovery: number | null; price: number | null; engine_version: string | null
}
interface Facets { fromBadges: string[]; toBadges: string[]; total: number }

const sel = 'px-2.5 py-2 rounded-lg text-xs bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'

export default function TransitionsPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<TRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [loading, setLoading] = useState(true)
  const [f, setF] = useState({ fromBadge: '', toBadge: '', from: '', to: '', sort: 'date' })
  const pageSize = 30

  const load = async (p = page) => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { page: p, pageSize, sort: f.sort }
      if (f.fromBadge) params.fromBadge = f.fromBadge
      if (f.toBadge) params.toBadge = f.toBadge
      if (f.from) params.from = f.from
      if (f.to) params.to = f.to
      const { data } = await client.get('/transitions', { params })
      setRows(data.rows); setTotal(data.total); setPage(data.page)
    } finally { setLoading(false) }
  }
  useEffect(() => { client.get('/transitions/facets').then((r) => setFacets(r.data)).catch(() => {}) }, [])
  useEffect(() => { void load(1) /* eslint-disable-next-line */ }, [f])

  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex-1 min-h-screen bg-slate-50 dark:bg-surface-dark">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Transitions</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Which stocks moved from one badge to another, and when. Catch the change on its day. {facets && <span className="text-slate-400">· {facets.total} logged</span>}
            </p>
          </div>
          <Link to="/insight" className="text-xs text-brand-600 dark:text-brand-400 font-semibold hover:underline">← Universe</Link>
        </div>

        {/* filters: from → to + date range */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark p-3.5 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">From</span>
          <select value={f.fromBadge} onChange={(e) => setF({ ...f, fromBadge: e.target.value })} className={sel}>
            <option value="">Any source</option>
            {facets?.fromBadges.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <span className="text-slate-300 dark:text-slate-600">→</span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">To</span>
          <select value={f.toBadge} onChange={(e) => setF({ ...f, toBadge: e.target.value })} className={sel}>
            <option value="">Any destination</option>
            {facets?.toBadges.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <span className="mx-1 text-slate-300 dark:text-slate-600">|</span>
          <label className="text-[10px] text-slate-400">From date <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={clsx(sel, 'ml-1')} /></label>
          <label className="text-[10px] text-slate-400">To date <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={clsx(sel, 'ml-1')} /></label>
          <select value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} className={sel}>
            <option value="date">Sort: Newest first</option>
            <option value="date_asc">Sort: Oldest first</option>
            <option value="discovery">Sort: Discovery score</option>
            <option value="name">Sort: Name</option>
          </select>
          <button onClick={() => setF({ fromBadge: '', toBadge: '', from: '', to: '', sort: 'date' })} className="text-xs text-slate-400 hover:text-slate-600 px-1.5">Reset</button>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Stock</th><th className="px-3 py-2.5">Sector</th>
                  <th className="px-3 py-2.5">Transition</th><th className="px-3 py-2.5 text-right">Discovery</th><th className="px-3 py-2.5 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {loading && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>}
                {!loading && rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No transitions match. The log fills as nightly analyses record badge changes (starts from when this was deployed).</td></tr>}
                {rows.map((r, i) => (
                  <tr key={`${r.symbol_code}-${r.transition_date}-${i}`} onClick={() => navigate(`/insight/${encodeURIComponent(r.symbol_code)}`)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-500 dark:text-slate-400">{String(r.transition_date).slice(0, 10)}</td>
                    <td className="px-3 py-2.5"><span className="font-bold text-slate-900 dark:text-white">{r.symbol_code}</span><span className="block text-[10px] text-slate-400 truncate max-w-[160px]">{r.symbol_name}</span></td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 truncate max-w-[130px]">{r.sector ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <BadgeChip badge={r.from_badge} /><span className="text-slate-400">→</span><BadgeChip badge={r.to_badge} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className="text-slate-400">{r.from_discovery ?? '—'}</span>
                      <span className="text-slate-300 dark:text-slate-600"> → </span>
                      <span className={clsx('font-bold', (r.to_discovery ?? 0) > (r.from_discovery ?? 0) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300')}>{r.to_discovery ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.price != null ? Number(r.price).toLocaleString('en-IN') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            <span>{total.toLocaleString('en-IN')} transitions · page {page} of {pages}</span>
            <div className="flex gap-1.5">
              <button onClick={() => void load(page - 1)} disabled={page <= 1 || loading} className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">← Prev</button>
              <button onClick={() => void load(page + 1)} disabled={page >= pages || loading} className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">Next →</button>
            </div>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 px-1 pb-4">Transitions are logged forward from deployment (no back-fill). To learn which X→Y actually pays and how fast, see the transition attribution in Strategy Lab (admin).</p>
      </div>
    </div>
  )
}
