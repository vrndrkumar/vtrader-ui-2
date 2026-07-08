import { useRef } from 'react'
import { ChartToolbar } from './ChartToolbar'
import { ChartGrid } from './ChartGrid'

/** Shared toolbar + resizable multi-chart grid. */
export function ChartWorkspace() {
  const ref = useRef<HTMLDivElement>(null)
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) ref.current?.requestFullscreen?.()
    else document.exitFullscreen?.()
  }
  return (
    <div ref={ref} className="flex flex-col h-full w-full bg-white dark:bg-surface-dark">
      <ChartToolbar onFullscreen={toggleFullscreen} />
      <div className="flex-1 min-h-0">
        <ChartGrid />
      </div>
    </div>
  )
}
