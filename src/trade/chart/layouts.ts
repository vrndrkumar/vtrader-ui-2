// ── Layout definitions (nested trees, incl. asymmetric splits) ───────────────

export type LayoutNode = { panel: number } | { dir: 'h' | 'v'; children: LayoutNode[] }

export interface LayoutDef {
  id: string
  count: number
  tree: LayoutNode
}

const h = (...c: LayoutNode[]): LayoutNode => ({ dir: 'h', children: c })
const v = (...c: LayoutNode[]): LayoutNode => ({ dir: 'v', children: c })
const p = (n: number): LayoutNode => ({ panel: n })

export const LAYOUTS: LayoutDef[] = [
  // 1
  { id: '1', count: 1, tree: p(0) },
  // 2
  { id: '2h', count: 2, tree: h(p(0), p(1)) },
  { id: '2v', count: 2, tree: v(p(0), p(1)) },
  // 3
  { id: '3h', count: 3, tree: h(p(0), p(1), p(2)) },
  { id: '3v', count: 3, tree: v(p(0), p(1), p(2)) },
  { id: '3-1l2r', count: 3, tree: h(p(0), v(p(1), p(2))) },
  { id: '3-2l1r', count: 3, tree: h(v(p(0), p(1)), p(2)) },
  { id: '3-1t2b', count: 3, tree: v(p(0), h(p(1), p(2))) },
  { id: '3-2t1b', count: 3, tree: v(h(p(0), p(1)), p(2)) },
  // 4
  { id: '4', count: 4, tree: v(h(p(0), p(1)), h(p(2), p(3))) },
  { id: '4h', count: 4, tree: h(p(0), p(1), p(2), p(3)) },
  { id: '4v', count: 4, tree: v(p(0), p(1), p(2), p(3)) },
  { id: '4-1l3r', count: 4, tree: h(p(0), v(p(1), p(2), p(3))) },
  { id: '4-3l1r', count: 4, tree: h(v(p(0), p(1), p(2)), p(3)) },
  { id: '4-1t3b', count: 4, tree: v(p(0), h(p(1), p(2), p(3))) },
  // 5
  { id: '5-1l4r', count: 5, tree: h(p(0), v(h(p(1), p(2)), h(p(3), p(4)))) },
  { id: '5-1t4b', count: 5, tree: v(p(0), h(p(1), p(2), p(3), p(4))) },
  { id: '5h', count: 5, tree: h(p(0), p(1), p(2), p(3), p(4)) },
  { id: '5v', count: 5, tree: v(p(0), p(1), p(2), p(3), p(4)) },
  // 6
  { id: '6', count: 6, tree: v(h(p(0), p(1), p(2)), h(p(3), p(4), p(5))) },
  { id: '6h', count: 6, tree: h(p(0), p(1), p(2), p(3), p(4), p(5)) },
  { id: '6v', count: 6, tree: v(p(0), p(1), p(2), p(3), p(4), p(5)) },
  { id: '6-3x2', count: 6, tree: h(v(p(0), p(1)), v(p(2), p(3)), v(p(4), p(5))) },
  // 7
  { id: '7', count: 7, tree: v(h(p(0), p(1), p(2)), h(p(3), p(4), p(5), p(6))) },
  // 8
  { id: '8', count: 8, tree: v(h(p(0), p(1), p(2), p(3)), h(p(4), p(5), p(6), p(7))) },
  { id: '8-4x2', count: 8, tree: h(v(p(0), p(1)), v(p(2), p(3)), v(p(4), p(5)), v(p(6), p(7))) },
]

export const getLayout = (id: string): LayoutDef => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0]
export const layoutPanelCount = (id: string): number => getLayout(id).count

/** Layouts grouped by panel count for the selector (1..8). */
export function layoutsByCount(): { count: number; layouts: LayoutDef[] }[] {
  const groups: Record<number, LayoutDef[]> = {}
  for (const l of LAYOUTS) (groups[l.count] ??= []).push(l)
  return Object.keys(groups).map(Number).sort((a, b) => a - b).map((count) => ({ count, layouts: groups[count] }))
}
