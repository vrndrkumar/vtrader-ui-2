// ── Research configuration ───────────────────────────────────────────────────
// DECLARED UP FRONT. Do not widen grids after seeing results (overfitting guard).

export const RESEARCH = {
  seed: 42,
  universeSize: 250,            // deterministic sample from stock_mstr equities
  minTurnoverCr: 2,             // liquidity floor: median daily turnover (₹ crore)
  dataFrom: '2020-01-01',
  stride: 5,                    // observation every N daily bars (autocorrelation guard)
  warmupBars: 260,              // min history before first observation
  forwardBars: 40,              // outcome window

  // Label definitions (primary = 8; others for robustness checks)
  gainThresholdsPct: [5, 8, 10, 15],
  primaryGainPct: 8,

  // Dev / validation split — validation is touched ONCE, after V2 is frozen
  devEndDate: '2023-12-31',

  // Threshold sweep grids (fixed)
  grids: {
    bbPct: [15, 20, 25, 30, 35, 40],
    rsiBand: [[35, 55], [40, 60], [45, 65], [50, 70]],
    volRatio: [1.2, 1.4, 1.6, 2.0],
    baseLen: [5, 10, 15, 20],
    dryUpRatio: [0.6, 0.75, 0.9],
    extendedPct: [50, 80, 120],  // % above 52w low for the chasing penalty
  },

  // Minimum dev-set support for any recommendation
  minSupport: 100,

  // Logistic regression
  l2Lambda: 0.01,
  gdIterations: 600,
  gdLearningRate: 0.1,

  // Throttling for the candle API
  fetchConcurrency: 3,
  fetchGapMs: 250,
}
