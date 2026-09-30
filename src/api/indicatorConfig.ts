// ── Structured-indicator config API (SMC / Liquidity Sweep) ──────────────────
// Talks to the market-data service (data.vtrader.in) that computes SMC & Liquidity
// Sweep. The Control Panel reads the current config, edits it, saves, or resets.
// Uses axiosCandle (data.vtrader.in base, no auth headers) like the candle API.

import { axiosCandle } from './axios'

export type IndKind = 'smc' | 'liquidity_sweep'

export interface IndicatorConfigResp {
  indicator: string
  label: string
  defaults: Record<string, unknown>
  stored: Record<string, unknown>
  effective: Record<string, unknown>
  types: Record<string, 'int' | 'float' | 'bool' | 'enum' | 'string'>
  enums: Record<string, string[]>
}

const unwrap = (data: unknown): IndicatorConfigResp => ((data as { data?: unknown })?.data ?? data) as IndicatorConfigResp

/** Current config: code defaults, stored overrides, effective values, and schema. */
export async function getIndicatorConfig(name: IndKind): Promise<IndicatorConfigResp> {
  const { data } = await axiosCandle.get('/data/indicator/config', { params: { indicatorName: name } })
  return unwrap(data)
}

/** Merge overrides into the stored config (persisted for all users). */
export async function saveIndicatorConfig(name: IndKind, config: Record<string, unknown>): Promise<IndicatorConfigResp> {
  const { data } = await axiosCandle.put('/data/indicator/config', { indicatorName: name, config })
  return unwrap(data)
}

/** Clear all overrides → effective returns to code defaults. */
export async function resetIndicatorConfig(name: IndKind): Promise<IndicatorConfigResp> {
  const { data } = await axiosCandle.put('/data/indicator/config', { indicatorName: name, reset: true })
  return unwrap(data)
}
