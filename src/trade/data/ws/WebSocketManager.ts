// ── Global WebSocket manager (singleton) ─────────────────────────────────────
// One shared connection for the whole app. Modules never open sockets directly;
// they subscribe to channels (ref-counted) and listen for messages. Handles
// reconnect with backoff+jitter, heartbeat, online/offline, offline frame
// queueing, and full resubscribe on reconnect.
//
// DIAGNOSTICS: with WS_CONFIG.debug on, every lifecycle event and the first
// message per channel is logged as "[VT-WS] …" so we can confirm whether the
// server connects, whether it needs a subscribe frame, and in what format.

import type { WsEnvelope } from './messages'

export type ConnState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

/**
 * Central connection config. The exact subscribe handshake is the one thing
 * only the backend can confirm — everything here is adjustable in one place:
 *  - if the server auto-pushes channels on connect, set sendSubscribeFrames=false
 *  - if it needs a different frame shape, edit subscribeFrame/unsubscribeFrame
 *  - if token must go somewhere other than ?token=, edit the connect() URL
 */
export const WS_CONFIG = {
  url: 'wss://api.vtrader.in',
  attachToken: true,
  sendSubscribeFrames: true,
  debug: true,
  heartbeat: false,        // server has no app-level ping; data frames keep it alive
  heartbeatMs: 25_000,
  maxBackoffMs: 15_000,
  baseBackoffMs: 500,
  subscribeFrame: (channel: string): unknown => ({ action: 'subscribe', channel }),
  unsubscribeFrame: (channel: string): unknown => ({ action: 'unsubscribe', channel }),
  heartbeatFrame: (): unknown => ({ action: 'ping' }),
}

function log(...a: unknown[]) { if (WS_CONFIG.debug) console.info('[VT-WS]', ...a) }

type MsgListener = (env: WsEnvelope) => void
type StateListener = (s: ConnState) => void

class WebSocketManager {
  private ws: WebSocket | null = null
  private state: ConnState = 'idle'
  private readonly msgListeners = new Set<MsgListener>()
  private readonly stateListeners = new Set<StateListener>()
  private readonly channels = new Map<string, number>() // channel -> refcount
  private readonly seenChannels = new Set<string>()      // for first-message logging
  private queue: string[] = []
  private retries = 0
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private manualClose = false
  private wired = false

  private wireGlobalEvents() {
    if (this.wired || typeof window === 'undefined') return
    this.wired = true
    window.addEventListener('online', () => { log('network online → reconnect'); this.retries = 0; this.connect() })
    window.addEventListener('offline', () => { log('network offline'); this.setState('reconnecting') })
  }

  connect(): void {
    this.wireGlobalEvents()
    if (this.ws && (this.state === 'open' || this.state === 'connecting')) return
    this.manualClose = false
    this.setState(this.retries ? 'reconnecting' : 'connecting')

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vtrader_token') : null
    const url = WS_CONFIG.attachToken && token ? `${WS_CONFIG.url}?token=${encodeURIComponent(token)}` : WS_CONFIG.url
    log('connecting', url)

    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (err) {
      log('construct failed', err)
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      log('OPEN')
      this.retries = 0
      this.setState('open')
      this.resubscribeAll()
      this.flushQueue()
      this.startHeartbeat()
    }
    ws.onmessage = (e) => {
      const data = typeof e.data === 'string' ? e.data : ''
      let msg: { type?: string; channel?: string; payload?: unknown } | null = null
      try { msg = JSON.parse(data) } catch { log('non-JSON frame', data.slice(0, 120)); return }
      if (!msg || typeof msg !== 'object') return

      // Only `type: "data"` frames carry a payload; everything else
      // (subscribed / unsubscribed / connected / pong) is a control ack — ignore.
      if (msg.type === 'data' && typeof msg.channel === 'string' && 'payload' in msg) {
        const env = msg as WsEnvelope
        if (!this.seenChannels.has(env.channel)) {
          this.seenChannels.add(env.channel)
          log('first data on', env.channel)
        }
        this.msgListeners.forEach((l) => { try { l(env) } catch { /* isolate listener errors */ } })
      } else if (msg.type === 'error') {
        log('server error', (msg as { message?: string }).message)
      }
    }
    ws.onclose = (e) => {
      log('CLOSE', { code: e.code, reason: e.reason, wasClean: e.wasClean })
      this.stopHeartbeat()
      if (this.ws === ws) this.ws = null
      if (!this.manualClose) this.scheduleReconnect()
    }
    ws.onerror = () => { log('ERROR'); try { ws.close() } catch { /* noop */ } }
  }

  private scheduleReconnect(): void {
    this.setState('reconnecting')
    const backoff = Math.min(WS_CONFIG.maxBackoffMs, WS_CONFIG.baseBackoffMs * 2 ** this.retries)
    const delay = backoff * (0.7 + Math.random() * 0.6) // jitter
    this.retries++
    log(`reconnect in ${Math.round(delay)}ms (attempt ${this.retries})`)
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    if (!WS_CONFIG.heartbeat) return
    this.heartbeatTimer = setInterval(() => this.rawSend(WS_CONFIG.heartbeatFrame()), WS_CONFIG.heartbeatMs)
  }
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = undefined
  }

  private setState(s: ConnState): void {
    if (this.state === s) return
    this.state = s
    this.stateListeners.forEach((l) => { try { l(s) } catch { /* noop */ } })
  }

  private rawSend(obj: unknown): void {
    const str = JSON.stringify(obj)
    if (this.ws && this.state === 'open') {
      try { this.ws.send(str) } catch { this.queue.push(str) }
    } else {
      this.queue.push(str)
    }
  }

  private flushQueue(): void {
    const q = this.queue
    this.queue = []
    q.forEach((s) => { try { this.ws?.send(s) } catch { /* dropped */ } })
  }

  private resubscribeAll(): void {
    if (!WS_CONFIG.sendSubscribeFrames) return
    for (const ch of this.channels.keys()) { log('subscribe →', ch); this.rawSend(WS_CONFIG.subscribeFrame(ch)) }
  }

  /** Subscribe to a server channel (ref-counted). Returns an unsubscribe fn. */
  subscribeChannel(channel: string): () => void {
    const count = this.channels.get(channel) ?? 0
    this.channels.set(channel, count + 1)
    if (count === 0) {
      this.connect()
      if (WS_CONFIG.sendSubscribeFrames) { log('subscribe →', channel); this.rawSend(WS_CONFIG.subscribeFrame(channel)) }
    }
    let released = false
    return () => {
      if (released) return
      released = true
      const c = this.channels.get(channel) ?? 0
      if (c <= 1) {
        this.channels.delete(channel)
        if (WS_CONFIG.sendSubscribeFrames) this.rawSend(WS_CONFIG.unsubscribeFrame(channel))
      } else {
        this.channels.set(channel, c - 1)
      }
    }
  }

  onMessage(l: MsgListener): () => void {
    this.msgListeners.add(l)
    return () => { this.msgListeners.delete(l) }
  }

  onState(l: StateListener): () => void {
    this.stateListeners.add(l)
    l(this.state)
    return () => { this.stateListeners.delete(l) }
  }

  getState(): ConnState { return this.state }
}

export const wsManager = new WebSocketManager()
