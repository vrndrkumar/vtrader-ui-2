import { ChartToolbar } from './ChartToolbar'
import { ChartGrid } from './ChartGrid'

/** Shared toolbar + resizable multi-chart grid. */
export function ChartWorkspace() {
  // Fullscreen the whole TRADE module, not just this chart column and not the
  // whole app. The native Fullscreen API paints only the fullscreened element's
  // subtree, so targeting the chart alone hides the trade toolbar, the
  // positions/orders panel and order popups — while targeting the document also
  // shows the global app nav. The trade-module root holds exactly what we want.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) { document.exitFullscreen?.(); return }
    const target = document.getElementById('trade-module-root') ?? document.documentElement
    target.requestFullscreen?.()
  }
  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-surface-dark">
      <ChartToolbar onFullscreen={toggleFullscreen} />
      <div className="flex-1 min-h-0">
        <ChartGrid />
      </div>
    </div>
  )
}
