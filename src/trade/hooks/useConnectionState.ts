import { useSyncExternalStore } from 'react'
import { realtime } from '../data/realtime/realtimeService'
import type { ConnState } from '../data/ws/WebSocketManager'

/** Live WebSocket connection state for status indicators. */
export function useConnectionState(): ConnState {
  return useSyncExternalStore(
    (cb) => realtime.onState(cb),
    () => realtime.getState(),
    () => 'idle' as ConnState,
  )
}
