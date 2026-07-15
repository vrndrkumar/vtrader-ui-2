// ── Research report emitter (markdown) ───────────────────────────────────────
import { RESEARCH } from './config.js'

const tbl = (rows, cols) => {
  if (!rows.length) return '_no data_\n'
  const head = `| ${cols.map((c) => c.label).join(' | ')} |`
  const sep = `|${cols.map(() => '---').join('|')}|`
  const body = rows.map((r) => `| ${cols.map((c) => r[c.key] ?? '—').join(' | ')} |`).join('\n')
  return `${head}\n${sep}\n${body}\n`
}

export function renderReport(ctx) {
  const {
    universeInfo, devN, valN, uniDev, uniByLabel, comboDev, sweepDev,
    failures, modelEval, coefTable, v2Weights, verdict,
  } = ctx

  return `# Stock Insight Engine — V1 Evaluation & V2 Research Report

Generated: ${new Date().toISOString()} · seed ${RESEARCH.seed} · primary label: max gain ≥ ${RESEARCH.primaryGainPct}% within ${RESEARCH.forwardBars} sessions AND gain > |drawdown|

## 0. Dataset

${universeInfo}

Observations: **${devN} development** (≤ ${RESEARCH.devEndDate}) · **${valN} validation** (after, touched once at the end). Stride ${RESEARCH.stride} bars. Survivorship caveat: universe is today's active list; delisted names are absent, which biases win rates upward for ALL variants equally.

## 1. Base rate

Dev-set base rate: **${uniDev.baseRate}%** of all observations were "wins" under the primary label (n=${uniDev.baseN}). Every lift below is relative to this. A feature is only useful if its lift is meaningfully > 1.0 with adequate support.

## 2. Univariate feature evaluation (dev set)

${tbl(uniDev.rows, [
  { key: 'feature', label: 'Feature' },
  { key: 'n', label: 'n' },
  { key: 'pWin', label: 'P(win) %' },
  { key: 'lift', label: 'Lift' },
  { key: 'avgGain', label: 'Avg fwd gain %' },
  { key: 'avgDD', label: 'Avg fwd DD %' },
])}
Robustness across label definitions (lift per feature at 5/8/10/15% gain thresholds):

${tbl(uniByLabel, [
  { key: 'feature', label: 'Feature' },
  { key: 'lift5', label: 'Lift@5%' },
  { key: 'lift8', label: 'Lift@8%' },
  { key: 'lift10', label: 'Lift@10%' },
  { key: 'lift15', label: 'Lift@15%' },
])}
A feature whose lift holds or grows at higher gain thresholds is genuinely tied to explosive moves, not noise.

## 3. Feature combinations (dev set)

${tbl(comboDev.slice(0, 25), [
  { key: 'combo', label: 'Combination' },
  { key: 'n', label: 'n' },
  { key: 'pWin', label: 'P(win) %' },
  { key: 'lift', label: 'Lift' },
  { key: 'reliable', label: `n≥${RESEARCH.minSupport}` },
])}
## 4. Failure patterns (dev set, V1 score ≥ 55 that LOST)

High-scoring observations: ${failures.highScoreN}; of which losers: ${failures.losersN}. Condition frequency among losers vs winners — a condition much more common in losers is a candidate veto/filter:

${tbl(failures.rows, [
  { key: 'condition', label: 'Condition' },
  { key: 'pctOfLosers', label: '% of losers' },
  { key: 'pctOfWinners', label: '% of winners' },
])}
## 5. Threshold sweeps (dev set)

### BB-width percentile (with base ≥10 bars)
${tbl(sweepDev.grids.bbPct, [{ key: 'threshold', label: 'Threshold' }, { key: 'n', label: 'n' }, { key: 'pWin', label: 'P(win) %' }, { key: 'lift', label: 'Lift' }])}
### RSI band (inside squeeze)
${tbl(sweepDev.grids.rsiBand, [{ key: 'threshold', label: 'Band' }, { key: 'n', label: 'n' }, { key: 'pWin', label: 'P(win) %' }, { key: 'lift', label: 'Lift' }])}
### Volume ratio
${tbl(sweepDev.grids.volRatio, [{ key: 'threshold', label: 'Threshold' }, { key: 'n', label: 'n' }, { key: 'pWin', label: 'P(win) %' }, { key: 'lift', label: 'Lift' }])}
### Base length (inside squeeze)
${tbl(sweepDev.grids.baseLen, [{ key: 'threshold', label: 'Threshold' }, { key: 'n', label: 'n' }, { key: 'pWin', label: 'P(win) %' }, { key: 'lift', label: 'Lift' }])}
### Volume dry-up ratio
${tbl(sweepDev.grids.dryUp, [{ key: 'threshold', label: 'Threshold' }, { key: 'n', label: 'n' }, { key: 'pWin', label: 'P(win) %' }, { key: 'lift', label: 'Lift' }])}
### Chasing-penalty trigger
${tbl(sweepDev.grids.extended, [{ key: 'threshold', label: 'Trigger' }, { key: 'n', label: 'n' }, { key: 'pWin', label: 'P(win) %' }, { key: 'lift', label: 'Lift' }])}
Rule: adopt a threshold change only if the alternative shows higher lift with n ≥ ${RESEARCH.minSupport} AND the direction is consistent at the 10% and 15% labels.

## 6. Model comparison — THE decision table

Fitted on dev only; validation touched once:

${tbl(modelEval, [
  { key: 'model', label: 'Model' },
  { key: 'set', label: 'Set' },
  { key: 'auc', label: 'AUC' },
  { key: 'precisionTop10', label: 'Precision@top-10% (%)' },
  { key: 'baseRate', label: 'Base rate (%)' },
])}
**Verdict: ${verdict}**

## 7. Fitted evidence weights (logistic, standardized features)

Positive coefficient = evidence FOR a forthcoming move; magnitude = importance after controlling for all other features (unlike univariate lift):

${tbl(coefTable, [
  { key: 'feature', label: 'Feature' },
  { key: 'coef', label: 'Coefficient' },
  { key: 'direction', label: 'Direction' },
])}
## 8. Proposed V2 scoring weights

Derived from coefficients (positive, rescaled to a 100-point additive scheme; negatives become penalties). Stored in \`research/out/v2-weights.json\` — review before adopting into the engine:

${tbl(v2Weights, [
  { key: 'feature', label: 'Feature' },
  { key: 'v1Points', label: 'V1 pts' },
  { key: 'v2Points', label: 'V2 pts' },
  { key: 'change', label: 'Change' },
])}
## 9. Overfitting risk register

1. 2020–2023 dev window is bull-heavy; validation 2024–26 is the honest check — trust the validation column above over everything else.
2. Survivorship bias inflates ALL win rates; comparisons between models remain valid, absolute numbers do not.
3. n < ${RESEARCH.minSupport} rows are shown for completeness but must not drive decisions.
4. The label definition itself is a modelling choice; conclusions that flip between the 8% and 10% labels should be treated as fragile.
5. Grids were declared before running. Widening them after seeing results invalidates the protocol.

## 10. Recommended next steps

1. Review sections 2–5 and adopt only changes passing the decision rule.
2. If the verdict above is ADOPT, wire \`v2-weights.json\` into \`engine.js\` behind a config flag and A/B the two scores in the UI for a few weeks of live forward data.
3. Re-run this protocol quarterly with \`--refetch\` — regime drift is real.
4. Extend the universe beyond ${RESEARCH.universeSize} once the API rate limits allow; more cross-sectional breadth reduces sector bias.
`
}
