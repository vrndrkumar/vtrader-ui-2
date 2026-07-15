// ── Phase-2 report emitter — answers the 9 review questions with data ────────
import { LABELS, PRIMARY } from './phase2lib.js'

const tbl = (rows, cols) => {
  if (!rows?.length) return '_no data_\n'
  const head = `| ${cols.map((c) => c.label).join(' | ')} |`
  const sep = `|${cols.map(() => '---').join('|')}|`
  const body = rows.map((r) => `| ${cols.map((c) => r[c.key] ?? '—').join(' | ')} |`).join('\n')
  return `${head}\n${sep}\n${body}\n`
}

export function renderPhase2(ctx) {
  const {
    datasetInfo, labelRows, catDev, earlyLate, rankRowsVal, captureVal,
    walkRows, vetoes, answers,
  } = ctx

  return `# Stock Insight — Phase-2 Research: Business-Objective Validation

Generated: ${new Date().toISOString()} · Primary business label: ${PRIMARY} (+${LABELS[PRIMARY].gain}% within ${LABELS[PRIMARY].bars} sessions). NO engine changes have been made — this is research only.

${datasetInfo}

## 1. Multi-horizon labels

Each label answers "can the score find THIS kind of move". V1/V2 precision = wins inside the top decile of scores on the VALIDATION set (V2 retrained per label on dev only):

${tbl(labelRows, [
  { key: 'label', label: 'Label' },
  { key: 'nDev', label: 'n dev' },
  { key: 'nVal', label: 'n val' },
  { key: 'winRateDev', label: 'Base dev %' },
  { key: 'winRateVal', label: 'Base val %' },
  { key: 'avgMaxGain', label: 'Avg max gain %' },
  { key: 'avgDD', label: 'Avg DD %' },
  { key: 'avgTimeToPeak', label: 'Time to peak (bars)' },
  { key: 'v1PrecVal', label: 'V1 prec@10 val' },
  { key: 'v2PrecVal', label: 'V2 prec@10 val' },
])}
Read: a score is only useful for a label if its precision beats that label's validation base rate.

## 2. Winner taxonomy (dev, label ${PRIMARY})

${tbl(catDev.rows, [
  { key: 'category', label: 'Setup type' },
  { key: 'n', label: 'n' },
  { key: 'winRate', label: 'Win %' },
  { key: 'liftVsUniverse', label: 'Lift vs universe' },
  { key: 'avgMaxGain', label: 'Avg max gain %' },
  { key: 'avgDD', label: 'Avg DD %' },
  { key: 'topFeatures', label: 'Best features inside this setup' },
])}
Universe base rate: ${catDev.baseRate}%.

## 3. Is weeklyUp a real edge or a late-stage selector?

Win rates by stage (distance from 52-week high), with weeklyUp ON vs OFF inside each stage. If weeklyUp's lift survives in the EARLY bucket, it is genuine early evidence; if it only works in LATE, it just selects existing leaders:

${tbl(earlyLate, [
  { key: 'label', label: 'Label' },
  { key: 'stage', label: 'Stage' },
  { key: 'n', label: 'n' },
  { key: 'stageWinRate', label: 'Stage base %' },
  { key: 'weeklyUpWinRate', label: 'weeklyUp ON %' },
  { key: 'weeklyDownWinRate', label: 'weeklyUp OFF %' },
  { key: 'weeklyUpLiftInStage', label: 'Lift in stage' },
])}
## 4. Ranking simulation (VALIDATION set only)

Weekly scan; top-K by score; outcome = ${LABELS.B.bars}-session close-to-close return per pick:

${tbl(rankRowsVal, [
  { key: 'scorer', label: 'Scorer' },
  { key: 'topK', label: 'Top K' },
  { key: 'n', label: 'Picks' },
  { key: 'avgRet', label: 'Avg ret %' },
  { key: 'medianRet', label: 'Median %' },
  { key: 'winRate', label: 'Win %' },
  { key: 'profitFactor', label: 'Profit factor' },
  { key: 'maxGain', label: 'Best %' },
  { key: 'maxLoss', label: 'Worst %' },
  { key: 'avgMaxDD', label: 'Avg max DD %' },
  { key: 'worstLosingStreak', label: 'Worst streak' },
])}
### Capture of big winners (validation)

Of all +50%/120b and +100%/250b movers, how many were in each scorer's top decile beforehand (random = 10%):

${tbl(captureVal, [
  { key: 'label', label: 'Move' },
  { key: 'scorer', label: 'Scorer' },
  { key: 'winners', label: 'Total winners' },
  { key: 'captured', label: 'Captured' },
  { key: 'captureRate', label: 'Capture %' },
  { key: 'randomExpectation', label: 'Random %' },
])}
## 5. Walk-forward validation (label ${PRIMARY})

${tbl(walkRows, [
  { key: 'fold', label: 'Fold' },
  { key: 'nTrain', label: 'n train' },
  { key: 'nTest', label: 'n test' },
  { key: 'base', label: 'Base %' },
  { key: 'v1Auc', label: 'V1 AUC' },
  { key: 'v1Prec10', label: 'V1 prec@10' },
  { key: 'v2Auc', label: 'V2 AUC' },
  { key: 'v2Prec10', label: 'V2 prec@10' },
])}
Consistency matters more than any single fold. A model that only wins in one regime is a regime bet, not an edge.

## 6. Failure vetoes (V2 top-decile losers, label ${PRIMARY}, dev)

Conditions marked YES appear ≥1.5× more often in losers than winners — candidate veto filters for the production engine:

${tbl(vetoes.rows, [
  { key: 'condition', label: 'Condition' },
  { key: 'pctLosers', label: '% of losers' },
  { key: 'pctWinners', label: '% of winners' },
  { key: 'vetoCandidate', label: 'Veto candidate' },
])}
Top-decile n=${vetoes.topN}, losers=${vetoes.losersN}.

## 7. Answers to the review questions (auto-computed; human review required)

${answers.map((a, i) => `**Q${i + 1}. ${a.q}**\n\n${a.a}\n`).join('\n')}

## 8. Explainability commitment

Regardless of the decision, the production engine stays a transparent additive evidence system ("scored X because: weekly structure improving +30, compression in weekly uptrend +12, …; risks: …"). The logistic models here are research instruments for measuring evidence weights — they are not shipped.

## 9. Protocol integrity notes

Labels A–E, category definitions, stage buckets, folds and veto conditions were all declared in code before this run. Survivorship bias affects all scorers equally; comparisons remain valid, absolute win rates are inflated. The Random-baseline row in section 4 is the honest floor — any scorer must clearly beat it after costs to matter.
`
}
