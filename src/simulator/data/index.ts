// Provider factory — the ONLY place that decides mock vs real. Swap the impl
// here when the VTrader historical-option API is ready; nothing else changes.
import type { OptionMarketDataProvider } from './provider'
import { MockOptionMarketDataProvider } from './mockProvider'

let instance: OptionMarketDataProvider | null = null

export function getOptionDataProvider(): OptionMarketDataProvider {
  if (!instance) instance = new MockOptionMarketDataProvider()
  return instance
}
