// ── Option Insight admin settings ────────────────────────────────────────────
// Admin-tunable parameters for the ported Option-Analysis BUYING engine.
// Persisted to a JSON file next to the server so they survive restarts and are
// shared by every run + served to all users. Defaults come straight from the
// Python reference (Option-Analysis/settings.json), MINUS all Kite/Gemini/live
// secrets and execution knobs — this engine never trades and never uses Kite.
import { kvGet, kvSet } from './optionStore.js'

export const DEFAULT_SETTINGS = {
  // strategy scope
  preference: 'BUYING',              // BUYING only for now (SELLING deferred)
  indices: ['NIFTY', 'BANKNIFTY', 'SENSEX'],
  // signal tunables (ported defaults)
  pcr_threshold: 0.15,
  gap_threshold_factor: 0.5,
  range_lookback_days: 5,            // window for gap avg-range
  historical_range_lookback_days: 15, // window for open→close historical range
  min_expected_move_points: 30,
  call_probability_threshold: 0.55,
  put_probability_threshold: 0.45,
  profit_margin_factor: 1.15,
  momentum_min_fraction: 0.25,
  momentum_max_fraction: 0.65,
  oi_change_clamp: 0.5,
  orb_minutes: 15,
  atm_oi_change_threshold: 0.1,
  // volatility-confidence weights
  volatility_confidence_ratio_scale: 50,
  volatility_confidence_orb_bonus: 15,
  volatility_confidence_momentum_scale: 20,
  volatility_confidence_oi_buildup_scale: 15,
  volatility_confidence_cpr_narrow_scale: 15,
  // ── dry-run position sizing + exit rules (ported from Option-Analysis) ──
  // P&L is in rupees: (exit-entry) × lots × lot_size (buying-only).
  lots: 4,
  lot_sizes: { NIFTY: 75, BANKNIFTY: 35, SENSEX: 20 }, // NSE/BSE lot sizes — admin-tunable
  pnl_mode: 'COMBINED',           // COMBINED (total across legs) | PERLEG
  sl_enabled: false,              // exit when P&L <= -max_loss
  max_loss: 4000.0,               // rupees
  target_enabled: false,          // exit when P&L >= target_profit
  target_profit: 1000.0,          // rupees
  time_exit_enabled: false,       // exit at time_exit HH:MM (IST)
  time_exit: '10:30',
  force_exit_time: '15:15',       // always-on day-end square-off (IST) — never skippable
  // ── auto-run (our addition, not in the Python reference) ──
  // At start_time each trading day the server auto-runs the analysis (and opens
  // dry-run positions), so no one has to click "Run analysis" every morning.
  auto_run_enabled: true,
  start_time: '09:20',            // HH:MM IST — waits for market open if earlier
}

// keys admins may override (whitelist — ignore anything else posted)
const ALLOWED = new Set(Object.keys(DEFAULT_SETTINGS))

export async function getSettings() {
  const stored = await kvGet('settings')
  return { ...DEFAULT_SETTINGS, ...(stored || {}) }
}

export async function saveSettings(patch = {}) {
  const clean = {}
  for (const [k, v] of Object.entries(patch)) if (ALLOWED.has(k) && v != null && v !== '') clean[k] = v
  const next = { ...(await getSettings()), ...clean }
  await kvSet('settings', next) // throws on DB failure → API 500 → UI shows it
  return next
}
