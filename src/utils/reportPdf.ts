// ── Reports Overview → professional PDF export ────────────────────────────────
// Builds a well-structured, branded A4 report using jsPDF + autoTable.
// Sections: cover header → KPI summary cards → P&L by strategy / index / symbol →
// daily P&L ledger. Consistent typography, spacing, coloured P&L and page footer.

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'
import type { TradeStats, TradeFilters, DailyPnl, GroupedPnl } from '@/types/reports'

// ── Brand palette (RGB) ───────────────────────────────────────────────────────
const NAVY: [number, number, number] = [17, 24, 39]
const SLATE: [number, number, number] = [100, 116, 139]
const LIGHT: [number, number, number] = [241, 245, 249]
const AMBER: [number, number, number] = [245, 158, 11]
const GREEN: [number, number, number] = [22, 163, 74]
const RED: [number, number, number] = [220, 38, 38]
const WHITE: [number, number, number] = [255, 255, 255]

const MARGIN = 40

// ── Money formatting (full ₹, grouped, signed) ────────────────────────────────
function inr(v: number): string {
  const sign = v < 0 ? '-' : ''
  const n = Math.round(Math.abs(v)).toLocaleString('en-IN')
  return `${sign}Rs ${n}`
}
function inrCompact(v: number): string {
  const a = Math.abs(v)
  const s = a >= 1e7 ? `${(a / 1e7).toFixed(2)}Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(2)}L` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : `${Math.round(a)}`
  return `${v < 0 ? '-' : ''}Rs ${s}`
}
function pnlColor(v: number): [number, number, number] { return v > 0 ? GREEN : v < 0 ? RED : SLATE }

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export interface ReportPdfData {
  stats: TradeStats
  dailyPnl: DailyPnl[]
  groupPnl: GroupedPnl[]
  indexPnl: GroupedPnl[]
  symbolPnl: GroupedPnl[]
  filters: TradeFilters
  tradeCount: number
  userName?: string
  /** Live overview DOM node — rasterised as the visual first page. */
  captureEl?: HTMLElement | null
}

// Slim branded band reused on the cover + detail pages.
function drawBand(doc: jsPDF, pageW: number, title: string, subtitle: string, right: string[]): void {
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, pageW, 92, 'F')
  doc.setFillColor(...AMBER)
  doc.rect(0, 92, pageW, 3, 'F')
  doc.setFillColor(...AMBER)
  doc.roundedRect(MARGIN, 26, 40, 40, 8, 8, 'F')
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('V', MARGIN + 20, 53, { align: 'center' })
  doc.setTextColor(...WHITE)
  doc.setFontSize(19)
  doc.text(title, MARGIN + 54, 46)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(203, 213, 225)
  doc.text(subtitle, MARGIN + 54, 64)
  doc.setFontSize(8.5)
  doc.setTextColor(148, 163, 184)
  right.forEach((line, i) => doc.text(line, pageW - MARGIN, 40 + i * 14, { align: 'right' }))
}

export async function downloadReportPdf(data: ReportPdfData): Promise<void> {
  const { stats, dailyPnl, groupPnl, indexPnl, symbolPnl, filters, tradeCount, userName, captureEl } = data
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const contentW = pageW - MARGIN * 2

  const range = filters.dateFrom && filters.dateTo
    ? `${fmtDate(filters.dateFrom)}  to  ${fmtDate(filters.dateTo)}`
    : 'All available history'
  const gen = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const rightMeta = [`Generated ${gen}`, ...(userName ? [userName] : []), `${tradeCount} trades`]

  // ── Page 1: visual snapshot of the live overview ────────────────────────────
  if (captureEl) {
    try {
      const canvas = await html2canvas(captureEl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
      drawBand(doc, pageW, 'VTrader — Performance Overview', `Period: ${range}`, rightMeta)
      const topY = 112
      const availH = pageH - topY - 46
      const scale = Math.min(contentW / canvas.width, availH / canvas.height)
      const w = canvas.width * scale
      const h = canvas.height * scale
      doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageW - w) / 2, topY, w, h)
      doc.addPage()
    } catch { /* fall through to the text report only */ }
  }

  // ── Header band (detail pages) ──────────────────────────────────────────────
  drawBand(doc, pageW, 'VTrader — Trading Performance Report', `Period: ${range}`, rightMeta)

  let y = 118

  // ── Applied filters chip line ───────────────────────────────────────────────
  const chips: string[] = []
  if (filters.brokerName) chips.push(`Broker: ${filters.brokerName}`)
  if (filters.groupName) chips.push(`Strategy: ${filters.groupName}`)
  if (filters.indexName) chips.push(`Index: ${filters.indexName}`)
  if (filters.status && filters.status !== 'ALL') chips.push(`Status: ${filters.status}`)
  if (chips.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...SLATE)
    doc.text(`Filters —  ${chips.join('    •    ')}`, MARGIN, y)
    y += 18
  }

  // ── Headline P&L card ───────────────────────────────────────────────────────
  const net = stats.totalRealizedPnl
  doc.setFillColor(...LIGHT)
  doc.roundedRect(MARGIN, y, contentW, 66, 8, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...SLATE)
  doc.text('NET REALISED P&L', MARGIN + 18, y + 24)
  doc.setFontSize(26)
  doc.setTextColor(...pnlColor(net))
  doc.text(inr(net), MARGIN + 18, y + 52)
  // unrealised on the right
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...SLATE)
  doc.text('OPEN (UNREALISED)', MARGIN + contentW - 18, y + 24, { align: 'right' })
  doc.setFontSize(15)
  doc.setTextColor(...pnlColor(stats.totalUnrealizedPnl))
  doc.text(inr(stats.totalUnrealizedPnl), MARGIN + contentW - 18, y + 50, { align: 'right' })
  y += 84

  // ── KPI grid (4 cols x 2 rows) ──────────────────────────────────────────────
  const kpis: { label: string; value: string; tone?: [number, number, number] }[] = [
    { label: 'Win Rate', value: `${stats.winRate.toFixed(1)}%`, tone: stats.winRate >= 50 ? GREEN : RED },
    { label: 'Profit Factor', value: isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞', tone: stats.profitFactor >= 1 ? GREEN : RED },
    { label: 'Avg P&L / Trade', value: inrCompact(stats.avgPnlPerTrade), tone: pnlColor(stats.avgPnlPerTrade) },
    { label: 'Total Trades', value: String(stats.totalTrades) },
    { label: 'Winners', value: String(stats.winningTrades), tone: GREEN },
    { label: 'Losers', value: String(stats.losingTrades), tone: RED },
    { label: 'Best Trade', value: inrCompact(stats.bestTrade), tone: GREEN },
    { label: 'Worst Trade', value: inrCompact(stats.worstTrade), tone: pnlColor(stats.worstTrade) },
  ]
  const cols = 4
  const gap = 10
  const cardW = (contentW - gap * (cols - 1)) / cols
  const cardH = 52
  kpis.forEach((k, i) => {
    const cx = MARGIN + (i % cols) * (cardW + gap)
    const cy = y + Math.floor(i / cols) * (cardH + gap)
    doc.setDrawColor(226, 232, 240)
    doc.setFillColor(...WHITE)
    doc.roundedRect(cx, cy, cardW, cardH, 6, 6, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...SLATE)
    doc.text(k.label.toUpperCase(), cx + 12, cy + 20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...(k.tone ?? NAVY))
    doc.text(k.value, cx + 12, cy + 40)
  })
  y += cardH * 2 + gap + 24

  // ── Section helper ──────────────────────────────────────────────────────────
  const sectionTitle = (title: string, startY: number): number => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...NAVY)
    doc.text(title, MARGIN, startY)
    doc.setDrawColor(...AMBER)
    doc.setLineWidth(2)
    doc.line(MARGIN, startY + 5, MARGIN + 28, startY + 5)
    return startY + 16
  }

  const groupRows = (rows: GroupedPnl[]) =>
    rows.map((r) => [r.name || '—', String(r.trades), inr(r.pnl)])

  const commonTable = (title: string, head: string[], body: (string | number)[][], startY: number, pnlCol: number): number => {
    const ty = sectionTitle(title, startY)
    autoTable(doc, {
      startY: ty,
      head: [head],
      body,
      margin: { left: MARGIN, right: MARGIN },
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, lineColor: [226, 232, 240], lineWidth: 0.5, textColor: NAVY },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 8.5, halign: 'left' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { [pnlCol]: { halign: 'right', fontStyle: 'bold' }, 1: { halign: 'center' } },
      didParseCell: (h) => {
        if (h.section === 'body' && h.column.index === pnlCol) {
          const raw = String(h.cell.raw)
          const neg = raw.trim().startsWith('-')
          h.cell.styles.textColor = neg ? RED : raw.includes('0') && Number(raw.replace(/[^0-9.-]/g, '')) === 0 ? SLATE : GREEN
        }
      },
    })
    // @ts-expect-error autotable augments doc
    return (doc.lastAutoTable.finalY as number) + 24
  }

  // ── P&L by Strategy ─────────────────────────────────────────────────────────
  if (groupPnl.length) {
    y = commonTable('P&L by Strategy', ['Strategy', 'Trades', 'Realised P&L'], groupRows(groupPnl), y, 2)
  }
  // ── P&L by Index ────────────────────────────────────────────────────────────
  if (indexPnl.length) {
    y = commonTable('P&L by Index', ['Index', 'Trades', 'Realised P&L'], groupRows(indexPnl), y, 2)
  }
  // ── P&L by Symbol ───────────────────────────────────────────────────────────
  if (symbolPnl.length) {
    y = commonTable('P&L by Symbol', ['Symbol', 'Trades', 'Realised P&L'], groupRows(symbolPnl.slice(0, 15)), y, 2)
  }
  // ── Daily P&L ledger ────────────────────────────────────────────────────────
  if (dailyPnl.length) {
    const body = dailyPnl.map((d) => [fmtDate(d.date), inr(d.pnl), inr(d.cumulative)])
    y = commonTable('Daily P&L Ledger', ['Date', 'Day P&L', 'Cumulative'], body, y, 1)
  }

  // ── Footer on every page ────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.5)
    doc.line(MARGIN, pageH - 34, pageW - MARGIN, pageH - 34)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...SLATE)
    doc.text('VTrader • Confidential — for personal use only. Figures are gross realised P&L; verify against broker statements.', MARGIN, pageH - 20)
    doc.text(`Page ${p} of ${pages}`, pageW - MARGIN, pageH - 20, { align: 'right' })
  }

  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(`VTrader-Report-${stamp}.pdf`)
}
