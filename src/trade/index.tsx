import { useEffect, useRef, useState } from 'react'
import { TopBar } from './layout/TopBar'
import { LeftRail, type PanelKey, type TradeView } from './layout/LeftRail'
import { SidePanel } from './layout/RightDock'
import { ChartWorkspace } from './chart/ChartWorkspace'
import { StrategyBuilder } from './features/strategy/StrategyBuilder'
import { realtime } from './data/realtime/realtimeService'
import { applySymbol } from './store/chartLayoutStore'
import { OrderWindow } from '@/components/order/OrderWindow'
import { ensureLotSizes } from '@/services/orders/lotSize'
import { SYMBOLS, type ChartSymbol } from './types/market'

export default function TradePage() {
  const [view, setView] = useState<TradeView>('chart')
  const [panel, setPanel] = useState<PanelKey | null>(null) // collapsed by default
  const lastPanel = useRef<PanelKey>('watchlist')

  // Keep the realtime cache warm for all indices for the whole session.
  useEffect(() => {
    realtime.start()
    void ensureLotSizes() // preload index lot sizes for order quantity
    const unsubs = SYMBOLS.flatMap((s) => [realtime.subscribeOptionChain(s.code), realtime.subscribeIndexTick(s.code)])
    return () => unsubs.forEach((u) => u())
  }, [])

  const onPanel = (k: PanelKey) => {
    setView('chart')
    setPanel((cur) => {
      const next = cur === k && view === 'chart' ? null : k
      if (next) lastPanel.current = next
      return next
    })
  }
  const onStrategy = () => setView('strategy')
  const toggleCollapse = () => {
    if (view !== 'chart') { setView('chart'); return }
    setPanel((cur) => (cur ? null : lastPanel.current))
  }
  // Assign a strike to the active chart panel (respects symbol-sync).
  const openStrikeChart = (cs: ChartSymbol) => { applySymbol(cs); setView('chart') }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 dark:bg-surface-dark">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        <LeftRail view={view} panel={panel} onPanel={onPanel} onStrategy={onStrategy} onToggleCollapse={toggleCollapse} />
        {view === 'chart' ? (
          <>
            {panel && <SidePanel panel={panel} onClose={() => setPanel(null)} />}
            <div className="flex-1 min-w-0"><ChartWorkspace /></div>
          </>
        ) : (
          <div className="flex-1 min-w-0"><StrategyBuilder onOpenStrikeChart={openStrikeChart} /></div>
        )}
      </div>
      <OrderWindow />
    </div>
  )
}
