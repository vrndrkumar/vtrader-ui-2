// ── SMC — Pine color constants + default inputs (exact) ──────────────────────
import type { SmcInputs } from './types'

// Pine CONSTANTS
export const GREEN = '#089981'
export const RED = '#F23645'
export const BLUE = '#2157f3'
export const GRAY = '#878b94'
export const MONO_BULLISH = '#b2b5be'
export const MONO_BEARISH = '#5d606b'

/** Pine `color.new(hex, transp)` → rgba string. transp 0..100 (higher = more transparent). */
export function pineColor(hex: string, transp: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const a = Math.max(0, Math.min(1, (100 - transp) / 100))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** Every default matches the Pine `input(...)` defaults exactly. */
export const DEFAULT_SMC_INPUTS: SmcInputs = {
  mode: 'Historical',
  style: 'Colored',
  showTrend: false,

  showInternals: true,
  showInternalBull: 'All',
  internalBullColor: GREEN,
  showInternalBear: 'All',
  internalBearColor: RED,
  internalFilterConfluence: false,
  internalStructureSize: 'tiny',

  showStructure: true,
  showSwingBull: 'All',
  swingBullColor: GREEN,
  showSwingBear: 'All',
  swingBearColor: RED,
  swingStructureSize: 'small',
  showSwings: false,
  swingsLength: 50,
  showHighLowSwings: true,

  showInternalOrderBlocks: true,
  internalOrderBlocksSize: 5,
  showSwingOrderBlocks: false,
  swingOrderBlocksSize: 5,
  orderBlockFilter: 'Atr',
  orderBlockMitigation: 'High/Low',
  internalBullishOrderBlockColor: pineColor('#3179f5', 80),
  internalBearishOrderBlockColor: pineColor('#f77c80', 80),
  swingBullishOrderBlockColor: pineColor('#1848cc', 80),
  swingBearishOrderBlockColor: pineColor('#b22833', 80),

  showEqualHighsLows: true,
  equalHighsLowsLength: 3,
  equalHighsLowsThreshold: 0.1,
  equalHighsLowsSize: 'tiny',

  showFairValueGaps: false,
  fairValueGapsThreshold: true,
  fairValueGapsTimeframe: '',
  fairValueGapsBullColor: pineColor('#00ff68', 70),
  fairValueGapsBearColor: pineColor('#ff0008', 70),
  fairValueGapsExtend: 1,

  showDailyLevels: false,
  dailyLevelsStyle: 'solid',
  dailyLevelsColor: BLUE,
  showWeeklyLevels: false,
  weeklyLevelsStyle: 'solid',
  weeklyLevelsColor: BLUE,
  showMonthlyLevels: false,
  monthlyLevelsStyle: 'solid',
  monthlyLevelsColor: BLUE,

  showPremiumDiscountZones: false,
  premiumZoneColor: RED,
  equilibriumZoneColor: GRAY,
  discountZoneColor: GREEN,
}
