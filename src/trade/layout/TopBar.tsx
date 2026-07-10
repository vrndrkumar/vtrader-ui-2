import { IndexStrip } from './IndexStrip'
import { MarketClock } from './MarketClock'

export function TopBar() {
  return (
    <header className="flex items-stretch h-[92px] border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-card-dark shrink-0">
      <IndexStrip />
      <MarketClock />
    </header>
  )
}
