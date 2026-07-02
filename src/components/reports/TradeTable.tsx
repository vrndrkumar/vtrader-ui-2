import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import type { Trade } from '@/types/reports'
import { formatPnl, formatDateTime } from '@/utils/tradeStats'

interface Props {
  trades: Trade[]
  onViewOrders: (trade: Trade) => void
}

type SortKey = 'first_placed_time' | 'symbol_name' | 'realized_pnl' | 'total_quantity' | 'avg_entry_price' | 'avg_exit_price' | 'broker_name' | 'group_name'
type SortDir = 'asc' | 'desc'

const ALL_COLUMNS = [
  { key: 'first_placed_time', label: 'Date',      visible: true,  sortable: true,  align: 'left'   },
  { key: 'symbol_name',       label: 'Symbol',    visible: true,  sortable: true,  align: 'left'   },
  { key: 'group_name',        label: 'Group',     visible: true,  sortable: true,  align: 'left'   },
  { key: 'broker_name',       label: 'Broker',    visible: true,  sortable: true,  align: 'left'   },
  { key: 'total_quantity',    label: 'Qty',       visible: true,  sortable: true,  align: 'right'  },
  { key: 'avg_entry_price',   label: 'Entry',     visible: true,  sortable: true,  align: 'right'  },
  { key: 'avg_exit_price',    label: 'Exit',      visible: true,  sortable: false, align: 'right'  },
  { key: 'realized_pnl',      label: 'P&L',       visible: true,  sortable: true,  align: 'right'  },
  { key: 'status',            label: 'Status',    visible: true,  sortable: false, align: 'center' },
  { key: 'orders',            label: 'Orders',    visible: true,  sortable: false, align: 'center' },
] as const

type ColKey = typeof ALL_COLUMNS[number]['key']

// ── Export utilities ──────────────────────────────────────────────────────────

function exportCsv(trades: Trade[]) {
  const header = ['Date', 'Symbol', 'Group', 'Broker', 'Qty', 'Avg Entry', 'Avg Exit', 'Realized PnL', 'Unrealized PnL', 'Status', 'Trade ID']
  const rows = trades.map((t) => [
    formatDateTime(t.first_placed_time),
    t.symbol_name,
    t.group_name ?? '',
    t.broker_name,
    t.total_quantity,
    t.avg_entry_price?.toFixed(2) ?? '',
    t.avg_exit_price?.toFixed(2) ?? '',
    t.realized_pnl.toFixed(2),
    t.unrealized_pnl.toFixed(2),
    t.status,
    t.trade_id,
  ])
  const csv = [header, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `trades_${new Date().toISOString().split('T')[0]}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function exportExcel(trades: Trade[]) {
  // TSV with .xls extension — opens in Excel
  const header = ['Date', 'Symbol', 'Group', 'Broker', 'Qty', 'Avg Entry', 'Avg Exit', 'Realized PnL', 'Status', 'Trade ID']
  const rows = trades.map((t) => [
    formatDateTime(t.first_placed_time),
    t.symbol_name,
    t.group_name ?? '',
    t.broker_name,
    t.total_quantity,
    t.avg_entry_price?.toFixed(2) ?? '',
    t.avg_exit_price?.toFixed(2) ?? '',
    t.realized_pnl.toFixed(2),
    t.status,
    t.trade_id,
  ])
  const tsv  = [header, ...rows].map((r) => r.join('\t')).join('\n')
  const blob = new Blob([tsv], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `trades_${new Date().toISOString().split('T')[0]}.xls`
  link.click()
  URL.revokeObjectURL(url)
}

function exportPdf() {
  window.print()
}

// ── Column visibility dropdown ────────────────────────────────────────────────

function ColumnToggle({
  visible,
  onChange,
}: {
  visible: Set<ColKey>
  onChange: (key: ColKey) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
        Columns
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-2 w-44">
            {ALL_COLUMNS.map((col) => (
              <label key={col.key} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visible.has(col.key)}
                  onChange={() => onChange(col.key)}
                  className="h-3.5 w-3.5 rounded accent-brand-600"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300">{col.label}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Export dropdown ───────────────────────────────────────────────────────────

function ExportMenu({ trades }: { trades: Trade[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-2 w-36">
            {[
              { label: 'Export CSV', icon: '📄', action: () => { exportCsv(trades); setOpen(false) } },
              { label: 'Export Excel', icon: '📊', action: () => { exportExcel(trades); setOpen(false) } },
              { label: 'Export PDF', icon: '🖨️', action: () => { exportPdf(); setOpen(false) } },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function TradeTable({ trades, onViewOrders }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('first_placed_time')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(
    new Set(ALL_COLUMNS.filter((c) => c.visible).map((c) => c.key)),
  )
  const [perPage, setPerPage] = useState(20)

  const toggleCol = (key: ColKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const sorted = useMemo(() => [...trades].sort((a, b) => {
    const va = (a[sortKey as keyof Trade] ?? 0) as string | number
    const vb = (b[sortKey as keyof Trade] ?? 0) as string | number
    if (typeof va === 'string' && typeof vb === 'string') {
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    }
    return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number)
  }), [trades, sortKey, sortDir])

  const totalPages = Math.ceil(sorted.length / perPage)
  const paginated  = sorted.slice((page - 1) * perPage, page * perPage)

  const toggleSort = (key: SortKey) => {
    setPage(1)
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: string }) => {
    if (sortKey !== k) return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-300 dark:text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
      </svg>
    )
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        {sortDir === 'asc'
          ? <polyline points="18 15 12 9 6 15" />
          : <polyline points="6 9 12 15 18 9" />
        }
      </svg>
    )
  }

  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">No trades found</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">Try adjusting your filters to see results</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Table toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Showing <strong className="text-slate-800 dark:text-slate-200">{paginated.length}</strong> of{' '}
          <strong className="text-slate-800 dark:text-slate-200">{sorted.length}</strong> trades
        </p>
        <div className="flex items-center gap-2">
          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }}
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          >
            {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <ColumnToggle visible={visibleCols} onChange={toggleCol} />
          <ExportMenu trades={sorted} />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-slate-800">
              {ALL_COLUMNS.filter((c) => visibleCols.has(c.key)).map((col) => (
                <th
                  key={col.key}
                  onClick={col.sortable ? () => toggleSort(col.key as SortKey) : undefined}
                  className={clsx(
                    'px-4 py-3.5 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                    col.sortable ? 'cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors' : '',
                    sortKey === col.key
                      ? 'text-brand-600 dark:text-brand-400'
                      : 'text-slate-400 dark:text-slate-500',
                  )}
                >
                  <span className={clsx('inline-flex items-center gap-1', col.align === 'right' ? 'flex-row-reverse' : '')}>
                    {col.label}
                    {col.sortable && <SortIcon k={col.key} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {paginated.map((trade) => {
              const pnlPos = trade.realized_pnl >= 0
              return (
                <tr
                  key={trade.trade_id}
                  className="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors group"
                >
                  {visibleCols.has('first_placed_time') && (
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono">
                      {formatDateTime(trade.first_placed_time)}
                    </td>
                  )}
                  {visibleCols.has('symbol_name') && (
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                        {trade.symbol_name.split('_')[0]}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate max-w-[140px] mt-0.5">
                        {trade.symbol_name}
                      </p>
                    </td>
                  )}
                  {visibleCols.has('group_name') && (
                    <td className="px-4 py-3.5">
                      {trade.group_name
                        ? <span className="text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-lg">{trade.group_name}</span>
                        : <span className="text-slate-300 dark:text-slate-700 text-xs">—</span>
                      }
                    </td>
                  )}
                  {visibleCols.has('broker_name') && (
                    <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-400 font-medium">
                      {trade.broker_name}
                    </td>
                  )}
                  {visibleCols.has('total_quantity') && (
                    <td className="px-4 py-3.5 text-xs font-bold text-slate-700 dark:text-slate-300 text-right tabular-nums">
                      {trade.total_quantity.toLocaleString()}
                    </td>
                  )}
                  {visibleCols.has('avg_entry_price') && (
                    <td className="px-4 py-3.5 text-xs text-right text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                      ₹{trade.avg_entry_price?.toFixed(2) ?? '—'}
                    </td>
                  )}
                  {visibleCols.has('avg_exit_price') && (
                    <td className="px-4 py-3.5 text-xs text-right text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                      {trade.avg_exit_price ? `₹${trade.avg_exit_price.toFixed(2)}` : <span className="text-slate-300 dark:text-slate-700">—</span>}
                    </td>
                  )}
                  {visibleCols.has('realized_pnl') && (
                    <td className="px-4 py-3.5 text-right">
                      {trade.status === 'OPEN' ? (
                        <div>
                          <span className="text-xs text-slate-400 dark:text-slate-500">Open</span>
                          {trade.unrealized_pnl !== 0 && (
                            <p className={clsx('text-xs font-bold tabular-nums', trade.unrealized_pnl >= 0 ? 'text-green-500' : 'text-red-400')}>
                              {formatPnl(trade.unrealized_pnl)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className={clsx('text-sm font-bold tabular-nums', pnlPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                          {formatPnl(trade.realized_pnl)}
                        </span>
                      )}
                    </td>
                  )}
                  {visibleCols.has('status') && (
                    <td className="px-4 py-3.5 text-center">
                      <StatusBadge status={trade.status} />
                    </td>
                  )}
                  {visibleCols.has('orders') && (
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => onViewOrders(trade)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 bg-brand-50 dark:bg-brand-900/20 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        {trade.order_count ?? '?'} orders
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 py-1">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Page <strong className="text-slate-700 dark:text-slate-300">{page}</strong> of {totalPages}
            {' '}·{' '}
            {(page - 1) * perPage + 1}–{Math.min(page * perPage, sorted.length)} of {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <PageBtn label="First" disabled={page === 1} onClick={() => setPage(1)} />
            <PageBtn label="←" disabled={page === 1} onClick={() => setPage((p) => p - 1)} />
            {paginationPages(page, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-slate-400 dark:text-slate-600 text-xs">…</span>
              ) : (
                <PageBtn key={p} label={String(p)} active={p === page} onClick={() => setPage(p as number)} />
              ),
            )}
            <PageBtn label="→" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} />
            <PageBtn label="Last" disabled={page === totalPages} onClick={() => setPage(totalPages)} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function paginationPages(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (current > 3) pages.push('…')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2) pages.push('…')
  pages.push(total)
  return pages
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap',
      status === 'OPEN'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
    )}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', status === 'OPEN' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500')} />
      {status}
    </span>
  )
}

function PageBtn({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'h-7 min-w-[28px] px-2 rounded-lg text-xs font-medium transition-all',
        active
          ? 'bg-brand-600 text-white shadow-sm'
          : disabled
          ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10',
      )}
    >
      {label}
    </button>
  )
}
