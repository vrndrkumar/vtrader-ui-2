// ── Phase-3 report emitter: architecture recommendation with evidence ────────
const tbl = (rows, cols) => {
  if (!rows?.length) return '_no data_\n'
  const head = `| ${cols.map((c) => c.label).join(' | ')} |`
  const sep = `|${cols.map(() => '---').join('|')}|`
  const body = rows.map((r) => `| ${cols.map((c) => r[c.key] ?? '—').join(' | ')} |`).join('\n')
  return `${head}\n${sep}\n${body}\n`
}

export function renderPhase3(ctx) {
  const {
    datasetInfo, engineRows, engineFeats, breakoutSweep, reversal,
    mbStudy, capture, riskSep, universality, architecture,
  } = ctx

  return `# Stock Insight — Phase-3: Opportunity-Engine Architecture Research

Generated: ${new Date().toISOString()} · NO production code changed. This report decides Option A (universal) vs B (specialized) vs C (hybrid).

${datasetInfo}

## 1. Specialized vs universal — the architecture experiment

Each engine trained ONLY on its candidate subset (dev), then compared against the universal model on the SAME validation candidates. "Spec edge" = specialized precision@10 minus universal precision@10; positive = specialization pays.

${tbl(engineRows, [
  { key: 'engine', label: 'Engine' },
  { key: 'nDev', label: 'n dev' },
  { key: 'nVal', label: 'n val' },
  { key: 'baseVal', label: 'Base %' },
  { key: 'v1Prec', label: 'V1 prec@10' },
  { key: 'uniPrec', label: 'Universal prec@10' },
  { key: 'specPrec', label: 'Specialized prec@10' },
  { key: 'uniAuc', label: 'Uni AUC' },
  { key: 'specAuc', label: 'Spec AUC' },
  { key: 'specEdge', label: 'Spec edge (pp)' },
  { key: 'topAvgRet', label: 'Top-decile avg ret %' },
  { key: 'topPF', label: 'PF' },
  { key: 'topMaxDD', label: 'Avg max DD %' },
])}
## 2. What works inside each engine (dev candidates, univariate lift)

${tbl(engineFeats, [
  { key: 'engine', label: 'Engine' },
  { key: 'feature', label: 'Feature' },
  { key: 'n', label: 'n' },
  { key: 'pWin', label: 'P(win) %' },
  { key: 'lift', label: 'Lift in-engine' },
])}
## 3. Breakout autopsy — why base detection failed, and what fixes it

Phase 2 showed V1's base-breakout context at 0.97× (below universe). Alternative definitions (dev, label B; pWinD = same setup judged on +50%/120b):

${tbl(breakoutSweep.rows, [
  { key: 'definition', label: 'Definition' },
  { key: 'n', label: 'n' },
  { key: 'pWinB', label: 'P(win B) %' },
  { key: 'liftB', label: 'Lift' },
  { key: 'pWinD', label: 'P(win D) %' },
  { key: 'avgDD', label: 'Avg DD %' },
])}
Universe base: ${breakoutSweep.universeBase}%.

## 4. Reversal signals — which are actually predictive

Candidates: ≥30% below 52-week high (n=${reversal.candN}, base ${reversal.base}%):

${tbl(reversal.rows, [
  { key: 'signal', label: 'Signal' },
  { key: 'n', label: 'n' },
  { key: 'pWinB', label: 'P(win B) %' },
  { key: 'liftB', label: 'Lift' },
  { key: 'pWinD', label: 'P(win D) %' },
])}
## 5. Multibagger study — conditions BEFORE +100% moves (dev)

Winners (n=${mbStudy.nWinners ?? '—'}) vs all other eligible observations, profiled at signal and 30/60/90 bars earlier:

${mbStudy.insufficient ? '_insufficient winners for a reliable profile_\n' : tbl(mbStudy.rows, [
  { key: 'when', label: 'When' },
  { key: 'group', label: 'Group' },
  { key: 'n', label: 'n' },
  { key: 'weeklyUp', label: 'weeklyUp %' },
  { key: 'above200', label: '>200SMA %' },
  { key: 'obvRising', label: 'OBV up %' },
  { key: 'compressed', label: 'Compressed %' },
  { key: 'medFromHigh', label: 'Med. from-high %' },
  { key: 'medRs20', label: 'Med. RS20' },
  { key: 'medBbPct', label: 'Med. BB pct' },
  { key: 'medTurnoverCr', label: 'Med. turnover ₹cr' },
  { key: 'priceUnder100', label: 'Price<₹100 %' },
])}
## 6. Big-winner capture by engine (validation, top decile each)

${tbl(capture, [
  { key: 'move', label: 'Move' },
  { key: 'scorer', label: 'Scorer' },
  { key: 'winners', label: 'Winners' },
  { key: 'captureRate', label: 'Capture %' },
  { key: 'random', label: 'Random %' },
  { key: 'note', label: 'Note' },
])}
## 7. Risk separation test (Q4)

Universal top-decile picks split at the median ATR — does risk modulate outcome quality independently of opportunity?

${tbl(riskSep.rows, [
  { key: 'bucket', label: 'Bucket' },
  { key: 'n', label: 'n' },
  { key: 'avgRet', label: 'Avg ret %' },
  { key: 'medianRet', label: 'Median %' },
  { key: 'winRate', label: 'Win %' },
  { key: 'profitFactor', label: 'PF' },
  { key: 'avgMaxDD', label: 'Avg max DD %' },
  { key: 'worstLosingStreak', label: 'Worst streak' },
])}
## 8. Feature universality (Q5) — coefficients across models

${tbl(universality, [
  { key: 'feature', label: 'Feature' },
  { key: 'Universal', label: 'Universal' },
  { key: 'Momentum Leader', label: 'Momentum' },
  { key: 'Breakout Preparation', label: 'Breakout' },
  { key: 'Early Reversal', label: 'Reversal' },
  { key: 'Multibagger Discovery', label: 'Multibagger' },
  { key: 'classification', label: 'Class' },
])}
## 9. Architecture recommendation

${architecture}

## 10. Protocol integrity

Engine definitions, breakout variants, reversal signals, look-back offsets (30/60/90) and capture targets were declared in code before the run. Validation used once. Survivorship bias inflates absolute rates for all variants equally; the multibagger and speculative samples are affected MOST (delisted losers absent) — treat sections 5–6 as comparative, not absolute. Sector features remain untestable until index symbols are mapped.
`
}
