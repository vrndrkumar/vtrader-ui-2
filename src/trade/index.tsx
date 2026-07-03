import { useEffect, useRef, useState } from 'react'
import { TopBar } from './layout/TopBar'
import { LeftRail, type PanelKey, type TradeView } from './layout/LeftRail'
import { SidePanel } from './layout/RightDock'
import { ChartContainer } from './chart/ChartContainer'
import { StrategyBuilder } from './features/strategy/StrategyBuilder'
import { realtime } from './data/realtime/realtimeService'
import { SYMBOLS } from './types/market'

export default function TradePage() {
  // Keep the realtime cache warm for all indices for the whole Trade session,
  // so switching views/panels never shows stale-then-rebuild.
  useEffect(() => {
    realtime.start()
    const unsubs = SYMBOLS.flatMap((s) => [realtime.subscribeOptionChain(s.code), realtime.subscribeIndexTick(s.code)])
    return () => unsubs.forEach((u) => u())
  }, [])

  const [view, setView] = useState<TradeView>('chart')
  const [panel, setPanel] = useState<PanelKey | null>('watchlist')
  const lastPanel = useRef<PanelKey>('watchlist')

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

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 dark:bg-surface-dark">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        <LeftRail view={view} panel={panel} onPanel={onPanel} onStrategy={onStrategy} onToggleCollapse={toggleCollapse} />
        {view === 'chart' ? (
          <>
            {panel && <SidePanel panel={panel} onClose={() => setPanel(null)} />}
            <div className="flex-1 min-w-0"><ChartContainer /></div>
          </>
        ) : (
          <div className="flex-1 min-w-0"><StrategyBuilder /></div>
        )}
      </div>
    </div>
  )
}
