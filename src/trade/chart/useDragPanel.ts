// ── Draggable, non-blocking settings panel ───────────────────────────────────
// Lets an indicator settings panel float over the chart WITHOUT a dimming/blur
// backdrop, so the chart stays visible and interactive (you see edits live). Drag
// it by its header to move it out of the way; Escape closes it.

import { useCallback, useEffect, useRef, useState } from 'react'

export function useDragPanel(onClose?: () => void) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const posRef = useRef(pos)
  posRef.current = pos

  const onDragStart = useCallback((e: React.MouseEvent) => {
    // don't start a drag from an interactive control inside the header
    if ((e.target as HTMLElement).closest('button,input,select,textarea,a,label')) return
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY
    const start = posRef.current
    const move = (ev: MouseEvent) => setPos({ x: start.x + ev.clientX - sx, y: start.y + ev.clientY - sy })
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [])

  useEffect(() => {
    if (!onClose) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return { onDragStart, dragStyle: { transform: `translate(${pos.x}px, ${pos.y}px)` } as React.CSSProperties }
}
