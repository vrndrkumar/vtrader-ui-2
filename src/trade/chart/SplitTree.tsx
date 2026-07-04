import { Fragment, useRef, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import type { LayoutNode } from './layouts'

// Recursive resizable split. Supports arbitrary nested trees (grids AND
// asymmetric layouts like 1-big + 2-stacked). Each split persists its sizes
// per layout+path so the workspace survives refresh & navigation.

const KEY = (layoutId: string, path: string) => `vt_split_${layoutId}_${path}`

function loadSizes(layoutId: string, path: string, n: number): number[] {
  try {
    const raw = localStorage.getItem(KEY(layoutId, path))
    if (raw) { const s = JSON.parse(raw); if (Array.isArray(s) && s.length === n) return s }
  } catch { /* ignore */ }
  return Array(n).fill(1)
}

type Branch = Extract<LayoutNode, { dir: 'h' | 'v' }>

function BranchView({ node, path, layoutId, renderCell }: {
  node: Branch; path: string; layoutId: string; renderCell: (i: number) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [sizes, setSizes] = useState(() => loadSizes(layoutId, path, node.children.length))
  const sizesRef = useRef(sizes); sizesRef.current = sizes
  const horizontal = node.dir === 'h'

  const startDrag = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    const el = ref.current; if (!el) return
    const rect = el.getBoundingClientRect()
    const px = horizontal ? rect.width : rect.height
    const base = [...sizesRef.current]
    const total = base.reduce((a, b) => a + b, 0)
    const start = horizontal ? e.clientX : e.clientY
    const a0 = base[i], b0 = base[i + 1]
    const min = total * 0.08
    document.body.style.userSelect = 'none'
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
    let latest = base

    const move = (ev: PointerEvent) => {
      const d = ((horizontal ? ev.clientX : ev.clientY) - start) / px * total
      let a = a0 + d, b = b0 - d
      if (a < min) { b -= min - a; a = min }
      if (b < min) { a -= min - b; b = min }
      const arr = [...base]; arr[i] = a; arr[i + 1] = b
      latest = arr; setSizes(arr)
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.body.style.userSelect = ''; document.body.style.cursor = ''
      try { localStorage.setItem(KEY(layoutId, path), JSON.stringify(latest)) } catch { /* ignore */ }
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }

  return (
    <div ref={ref} className={clsx('flex h-full w-full', horizontal ? 'flex-row' : 'flex-col')}>
      {node.children.map((child, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <div onPointerDown={startDrag(i - 1)}
              className={clsx('shrink-0 bg-slate-200 dark:bg-slate-800 hover:bg-brand-400 transition-colors z-20', horizontal ? 'w-[5px] cursor-col-resize' : 'h-[5px] cursor-row-resize')} />
          )}
          <div style={{ flexGrow: sizes[i], flexBasis: 0 }} className="min-w-0 min-h-0 overflow-hidden">
            {'panel' in child
              ? <div className="h-full w-full">{renderCell(child.panel)}</div>
              : <BranchView node={child} path={`${path}.${i}`} layoutId={layoutId} renderCell={renderCell} />}
          </div>
        </Fragment>
      ))}
    </div>
  )
}

export function SplitTree({ layoutId, tree, renderCell }: {
  layoutId: string; tree: LayoutNode; renderCell: (i: number) => ReactNode
}) {
  if ('panel' in tree) return <div className="h-full w-full">{renderCell(tree.panel)}</div>
  return <BranchView node={tree} path="root" layoutId={layoutId} renderCell={renderCell} />
}
