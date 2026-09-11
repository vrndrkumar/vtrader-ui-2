import { useEffect, useRef, useState } from 'react'
import { TopBar } from './layout/TopBar'
import { LeftRail, type PanelKey, type TradeView } from './layout/LeftRail'
import { SidePanel } from './layout/RightDock'
import { ChartWorkspace } from './chart/ChartWorkspace'
import { StrategyBuilder } from './features/strategy/StrategyBuilder'
import { realtime } from './data/realtime/realtimeService'
import { applySymbol } from './store/chartLayoutStore'
import { OrderWindow } from '@/components/order/OrderWindow'
import { BasketPanel } from './basket/Basket'
import { ProtectModal } from './features/protect/ProtectModal'
import { GroupManager } from './features/protect/GroupManager'
import { useGroupMonitorStore } from './store/groupMonitorStore'
import { ScheduleBasketModal } from './basket/ScheduleBasketModal'
import { ScheduledBasketManager } from './basket/ScheduledBasketManager'
import { useScheduledBasketStore } from './store/scheduledBasketStore'
import { ensureLotSizes } from '@/services/orders/lotSize'
import { TradebookPanel } from './features/tradebook/TradebookPanel'
import { SYMBOLS, type ChartSymbol } from './types/market'
import { useSelectedBrokers } from '@/store/brokerStore'
import { useTradebookStore } from './features/tradebook/tradebookStore'
import { useIndexBracketStore } from './store/indexBracketStore'

export default function TradePage() {
  const [view, setView] = useState<TradeView>('chart')
  const [panel, setPanel] = useState<PanelKey | null>(null) // collapsed by default
  const lastPanel = useRef<PanelKey>('watchlist')

  // Keep the realtime cache warm for all indices for the whole session.
  useEffect(() => {
    realtime.start()
    void ensureLotSizes() // preload index lot sizes for order quantity
    void useGroupMonitorStore.getState().load() // load this user's active combined protects
    void useScheduledBasketStore.getState().load() // load this user's scheduled baskets
    const unsubs = SYMBOLS.flatMap((s) => [realtime.subscribeOptionChain(s.code), realtime.subscribeIndexTick(s.code)])
    return () => unsubs.forEach((u) => u())
  }, [])

  // When the selected broker(s) change, refresh BOTH the positions/orders and the
  // OCO monitors so the chart (strike + index) shows the chosen brokers' positions
  // and SL/Target/brackets — all of them when several brokers are selected.
  const selectedBrokers = useSelectedBrokers()
  const selKey = selectedBrokers.map((b) => b.id).join(',')
  useEffect(() => {
    void useTradebookStore.getState().load(selectedBrokers)
    void useIndexBracketStore.getState().reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey])

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
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 flex">
            {view === 'chart' ? (
              <>
                {panel && <SidePanel panel={panel} onClose={() => setPanel(null)} />}
                <div className="flex-1 min-w-0"><ChartWorkspace /></div>
              </>
            ) : (
              <div className="flex-1 min-w-0"><StrategyBuilder onOpenStrikeChart={openStrikeChart} /></div>
            )}
          </div>
          <TradebookPanel />
        </div>
      </div>
      <OrderWindow />
      <BasketPanel />
      <ProtectModal />
      <GroupManager />
      <ScheduleBasketModal />
      <ScheduledBasketManager />
    </div>
  )
}
