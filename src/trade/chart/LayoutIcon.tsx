import type { LayoutNode } from './layouts'

// Auto-generates a mini preview from any layout tree (nested flex boxes).
function Node({ node }: { node: LayoutNode }) {
  if ('panel' in node) return <div className="flex-1 min-w-0 min-h-0 rounded-[1px] bg-current" />
  return (
    <div className={node.dir === 'h' ? 'flex flex-row gap-[1.5px] w-full h-full' : 'flex flex-col gap-[1.5px] w-full h-full'}>
      {node.children.map((c, i) => (
        <div key={i} className="flex-1 min-w-0 min-h-0 flex"><Node node={c} /></div>
      ))}
    </div>
  )
}

export function LayoutIcon({ tree, size = 18 }: { tree: LayoutNode; size?: number }) {
  return (
    <div style={{ width: size, height: size }} className="flex">
      <Node node={tree} />
    </div>
  )
}
