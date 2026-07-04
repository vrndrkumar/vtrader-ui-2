import { useChartLayoutStore } from '../store/chartLayoutStore'
import { getLayout } from './layouts'
import { ChartPanel } from './ChartPanel'
import { SplitTree } from './SplitTree'

export function ChartGrid() {
  const layoutId = useChartLayoutStore((s) => s.layoutId)
  const layout = getLayout(layoutId)
  return (
    <SplitTree
      key={layoutId}
      layoutId={layoutId}
      tree={layout.tree}
      renderCell={(i) => <ChartPanel panelId={`p${i}`} />}
    />
  )
}
