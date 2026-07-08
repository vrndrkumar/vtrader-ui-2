import { IndexStrip } from './IndexStrip'
import { MarketClock } from './MarketClock'
import { BrokerSelector } from '@/components/broker/BrokerSelector'

export function TopBar() {
  return (
    <header className="flex items-stretch h-[92px] border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark shrink-0">
      <IndexStrip />
      <MarketClock />
      <div className="shrink-0 flex items-center px-3 border-l border-slate-200 dark:border-slate-800">
        <BrokerSelector />
      </div>
    </header>
  )
}
