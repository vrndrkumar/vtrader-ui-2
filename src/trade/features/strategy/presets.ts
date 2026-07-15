// ── Strategy presets ─────────────────────────────────────────────────────────

import type { OcRow, OptionChain, OptType, Side, StrategyLeg } from '../../types/options'
import { defaultLegQty } from '../../store/strategyStore'

export const PRESETS = ['Short Straddle', 'Short Strangle', 'Iron Condor', 'Iron Fly', 'Bull Call Spread', 'Bear Put Spread'] as const
export type PresetName = typeof PRESETS[number]

let seq = 0
function leg(row: OcRow, optType: OptType, side: Side, expiry: string, qty: number, lot: number): StrategyLeg | null {
  const d = optType === 'CE' ? row.call : row.put
  if (!d) return null // side not present in the live chain yet
  return { id: `p_${Date.now()}_${seq++}`, side, expiry, strike: row.strike, optType, qty, lot, priceType: 'Market', price: d.ltp, ltp: d.ltp, iv: d.iv ?? 0 }
}

export function buildPreset(name: PresetName, chain: OptionChain): StrategyLeg[] {
  const { qty, lot } = defaultLegQty(chain.symbolCode)
  const step = chain.symbolCode === 'SENSEX' ? 100 : 50
  const at = (offset: number) => chain.rows.find((r) => r.strike === chain.atm + offset * step)
  const L = (r: OcRow | undefined, t: OptType, s: Side): StrategyLeg[] => {
    if (!r) return []
    const lg = leg(r, t, s, chain.expiry, qty, lot)
    return lg ? [lg] : []
  }

  switch (name) {
    case 'Short Straddle':
      return [...L(at(0), 'CE', 'SELL'), ...L(at(0), 'PE', 'SELL')]
    case 'Short Strangle':
      return [...L(at(2), 'CE', 'SELL'), ...L(at(-2), 'PE', 'SELL')]
    case 'Iron Condor':
      return [...L(at(2), 'CE', 'SELL'), ...L(at(4), 'CE', 'BUY'), ...L(at(-2), 'PE', 'SELL'), ...L(at(-4), 'PE', 'BUY')]
    case 'Iron Fly':
      return [...L(at(0), 'CE', 'SELL'), ...L(at(0), 'PE', 'SELL'), ...L(at(3), 'CE', 'BUY'), ...L(at(-3), 'PE', 'BUY')]
    case 'Bull Call Spread':
      return [...L(at(0), 'CE', 'BUY'), ...L(at(3), 'CE', 'SELL')]
    case 'Bear Put Spread':
      return [...L(at(0), 'PE', 'BUY'), ...L(at(-3), 'PE', 'SELL')]
    default:
      return []
  }
}
