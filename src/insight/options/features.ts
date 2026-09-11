// ── Shared feature extraction + model evaluator (ML candidate scorer) ────────
// The feature encodings here MUST match research/buildDataset.mjs exactly — the
// model was trained on those columns. The full replay is the parity check: a
// mismatch makes the model pick badly and lose to v2, so it can't silently ship.
import type { OptionInsightsReport, StrategyEval } from './engine'

type Num = number | null
const ordVix: Record<string, number> = { 'Very Low': 0, Low: 1, Normal: 2, Elevated: 3, High: 4, Extreme: 5 }
const ordGap: Record<string, number> = { 'Gap Down': -1, Flat: 0, 'Gap Up': 1 }
const ordOr: Record<string, number> = { 'Below OR': -1, 'Inside OR': 0, 'Above OR': 1 }
const ordTrend: Record<string, number> = { DOWN: -1, SIDEWAYS: 0, UP: 1 }
const ordLiq: Record<string, number> = { Poor: 0, Acceptable: 1, Good: 2 }
const ordRich: Record<string, number> = { Cheap: -1, Fair: 0, Rich: 1 }
const ordMoney: Record<string, number> = { ITM: 1, ATM: 0, OTM: -1 }
const b01 = (v: boolean | null | undefined): Num => (v === true ? 1 : v === false ? 0 : null)
const enc = (map: Record<string, number>, k: string | null | undefined): Num => (k != null && k in map ? map[k] : null)
const nz = (v: number | null | undefined): Num => (v == null || !Number.isFinite(v) ? null : +v)

export interface LegGreeks { delta?: number | null; gamma?: number | null; theta?: number | null; vega?: number | null; iv?: number | null; oi?: number | null }

/** Build the {feature: value} map for one candidate — mirrors buildDataset.mjs. */
export function featuresFromReport(rep: OptionInsightsReport, cand: StrategyEval, leg: LegGreeks | null | undefined, nowIst: { y: number; m: number; d: number; hh: number; mm: number }): Record<string, Num> {
  const s = (i: number) => rep.structure[i] || ({} as OptionInsightsReport['structure'][number])
  const kl = rep.keyLevels, spot = rep.projection.current
  const rel = (lvl: number | null): Num => (spot != null && lvl != null && spot > 0 ? ((spot - lvl) / spot) * 100 : null)
  const dow = new Date(Date.UTC(nowIst.y, nowIst.m, nowIst.d)).getUTCDay()
  return {
    mins: nowIst.hh * 60 + nowIst.mm, dow,
    dte: rep.expiry.dte ?? null, isExpiry: rep.expiry.isExpiryDay ? 1 : 0,
    vix: nz(rep.vix.value), vixChg: nz(rep.vix.changePct), vixBand: enc(ordVix, rep.vix.band),
    gap: nz(rep.session.gapPct), gapType: enc(ordGap, rep.session.gapType), orState: enc(ordOr, rep.session.orState),
    upTfs: rep.structure.filter((x) => x.trend === 'UP').length, dnTfs: rep.structure.filter((x) => x.trend === 'DOWN').length,
    t3trend: enc(ordTrend, s(0).trend), t3rsi: nz(s(0).rsi), t3adx: nz(s(0).adx), t3atr: nz(s(0).atrPts), t3st: b01(s(0).supertrendUp), t3macd: b01(s(0).macdBull), t3vwap: b01(s(0).aboveVwap),
    t5trend: enc(ordTrend, s(1).trend), t5rsi: nz(s(1).rsi), t5adx: nz(s(1).adx), t5atr: nz(s(1).atrPts), t5st: b01(s(1).supertrendUp), t5macd: b01(s(1).macdBull),
    t15trend: enc(ordTrend, s(2).trend), t15rsi: nz(s(2).rsi), t15adx: nz(s(2).adx), t15atr: nz(s(2).atrPts), t15st: b01(s(2).supertrendUp), t15macd: b01(s(2).macdBull), t15e20: b01(s(2).ema20), t15e50: b01(s(2).ema50), t15e200: b01(s(2).ema200),
    t30trend: enc(ordTrend, s(3).trend), t30adx: nz(s(3).adx), t30st: b01(s(3).supertrendUp),
    bull: rep.probabilities.bullish, bear: rep.probabilities.bearish, range: rep.probabilities.rangebound, hv: rep.probabilities.highVol,
    sentConf: rep.sentiment.confidencePct, mqs: rep.quality.score ?? null,
    straddlePct: nz(rep.chain.straddlePctOfSpot), impRange: nz(rep.projection.expectedRangePts), pcr: nz(rep.chain.pcrVolume), atmSpread: nz(rep.chain.atmSpreadPct), liq: enc(ordLiq, rep.chain.liquidity),
    relPivot: rel(kl.pivot), relS1: rel(kl.s1), relR1: rel(kl.r1),
    action: cand.action === 'BUY' ? 1 : 0, side: cand.side === 'CE' ? 1 : 0, moneyness: enc(ordMoney, cand.moneyness),
    premium: nz(cand.premium), delta: nz(leg?.delta != null ? Math.abs(leg.delta) : null), gamma: nz(leg?.gamma), theta: nz(leg?.theta), vega: nz(leg?.vega), civ: nz(leg?.iv), coi: nz(leg?.oi),
    cspread: nz(cand.spreadPct), rich: enc(ordRich, cand.premiumRichness), rr: nz(cand.rr), trendConf: b01(cand.trendConfirm), volConf: b01(cand.volumeConfirm),
    stars: cand.stars, v2score: cand.score, v2prob: cand.probPct, rejected: cand.rejected ? 1 : 0,
  }
}

export interface OptModel { kind: string; features: string[]; medians: number[]; base: number; lr: number; tradeThreshold: number; trees: Array<{ f: number[]; thr: number[]; l: number[]; r: number[]; v: number[] }> }

/** Predict forward P&L for one feature map. NaN/unknown → trained median. */
export function predict(model: OptModel, feat: Record<string, Num>): number {
  const x: number[] = new Array(model.features.length)
  for (let i = 0; i < model.features.length; i++) {
    const v = feat[model.features[i]]
    x[i] = v == null || !Number.isFinite(v) ? model.medians[i] : (v as number)
  }
  let s = model.base
  for (const t of model.trees) {
    let n = 0
    while (t.f[n] !== -2) n = x[t.f[n]] <= t.thr[n] ? t.l[n] : t.r[n]
    s += model.lr * t.v[n]
  }
  return s
}
