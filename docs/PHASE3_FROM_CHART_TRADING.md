# Phase 3 — From-Chart Trading (Design)

> Design proposal for review. No implementation yet — APIs to be mapped from the
> list you'll provide. Everything is built behind adapters so we start on mocks
> and swap in real endpoints with no UI changes (same pattern as the WS layer).

Goal: place and manage orders **directly on the chart** — click-to-trade, and
draggable **Entry / Stop-Loss / Target** lines that modify the order in real time,
comparable to TradingView + broker terminals. Multi-broker aware (uses the global
broker context from Point #4).

---

## 1. Layers

```
Order/Position REST + WS  ──▶  tradeAdapter (swap point)  ──▶  tradeStore (zustand)
                                                                    │ selectors (per symbol)
                                          ┌─────────────────────────┼───────────────────────┐
                                          ▼                         ▼                         ▼
                                 Chart order-line overlays   Order Ticket (from-chart)   Positions/Orders panels
                                 (draggable, KLineCharts)     (click-to-trade / 1-tap)    (right dock / bottom)
```

- **tradeStore** owns working orders, positions, and derived order-lines; nothing
  is duplicated per component.
- **tradeAdapter** is the single place REST/WS wire in later (mock until then).
- Chart panels render order-lines only for **their** assigned symbol.

---

## 2. Data model

```ts
type OrderSide = 'BUY' | 'SELL'
type OrderKind = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M'
type OrderStatus = 'PENDING' | 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED'

interface WorkingOrder {
  orderId: string
  brokerId: number
  symbolKey: string        // matches ChartSymbol.key
  side: OrderSide
  orderType: OrderKind
  qty: number
  filledQty: number
  price: number            // limit/entry price
  triggerPrice?: number    // SL trigger
  stopLoss?: number        // bracket SL price
  target?: number          // bracket target price
  product: 'Normal' | 'MIS'
  status: OrderStatus
  ts: number               // exchange/update timestamp (dedup)
}

interface Position {
  brokerId: number
  symbolKey: string
  netQty: number           // +long / -short
  avgPrice: number
  ltp: number              // from marketStore
  pnl: number              // computed client-side
  stopLoss?: number
  target?: number
}

// Derived, per chart symbol — what the overlays render.
interface OrderLine {
  id: string
  kind: 'entry' | 'sl' | 'target' | 'pending' | 'position'
  price: number
  label: string            // e.g. "BUY 75 · +₹1,240" or "SL 24,120"
  color: string
  editable: boolean        // draggable?
  orderId?: string; brokerId?: number
}
```

---

## 3. Chart order-lines (the core interaction)

Rendered as **custom KLineCharts overlays** (same mechanism as the drawing tools),
one horizontal line + a right-anchored price/label tag per line:

- **Entry** (slate) · **Stop-Loss** (red) · **Target** (green) · **Pending order**
  (amber) · **Position avg** (blue). Consistent color coding.
- Each editable line is a **1-point horizontal overlay** whose point is
  drag-locked to the Y (price) axis. Dragging updates the price; on **release**
  we read the new price and dispatch a modify.
- Labels update live from ltp (P&L, distance) without touching the backend.

**Binding:** an `overlayId → { orderId, brokerId, field }` registry. On drag-end →
`tradeAdapter.modify(...)` for that field (price / SL / target). **Optimistic**:
the line stays where dropped; on API failure it snaps back + toast.

**Sync:** a `ChartPanel` effect subscribes to `tradeStore` for its `symbolKey`,
diffs the desired order-lines against the mounted overlays, and adds/updates/removes
only what changed (no full redraw). Price-based overlays auto-reposition on
zoom/pan/timeframe changes.

---

## 4. Placing orders from the chart

Three entry points, all funneling through the existing `placeOrder()` + broker
context (Quick Trade, multi-broker fan-out, Order Window already exist):

1. **Click a price on the chart** → compact **Order Ticket** popover anchored at
   that price (limit price prefilled). Review → Place. (Quick Trade OFF)
2. **Quick Trade ON** → click price fires a 1-tap order immediately (default qty,
   selected brokers) — no popover.
3. **Buy/Sell buttons** in the chart header (already present on strike charts) →
   market order at LTP.

The Order Ticket supports optional **bracket** (attach SL + Target) so the three
lines appear immediately after placement.

---

## 5. Managing from the chart

- **Drag SL / Target** line → modify SL/TP (debounced, commit on release).
- **Drag pending limit line** → modify order price.
- **Cancel**: ✕ on the pending line's tag → cancel order.
- **Exit position**: "Exit" on the position tag → market order for `-netQty`.
- **Reverse / add**: optional quick actions on the position tag.
- Unsupported actions (broker without bracket/GTT) → drag handles hidden, tag
  shows read-only.

---

## 6. Live updates & P&L

- **Order/position status** from a realtime channel (or REST poll fallback),
  deduped by `ts`, merged into `tradeStore`.
- **P&L** computed **client-side** from the live `ltp`: `(ltp − avgPrice) × netQty`
  — recomputed on tick (rAF-batched), so labels move smoothly without API spam.
- Partial fills / rejections reflected on the line tag + a toast.

---

## 7. Multi-broker

- Orders/positions are per `brokerId`. When multiple brokers are selected and hold
  the same symbol, lines are **grouped**: one line per price with a broker-count
  chip, or stacked with broker tags when prices differ.
- A drag modifies **that broker's** order; a fan-out modify (all selected) is an
  opt-in toggle. Per-broker execution status reuses the Order Window's status list.

---

## 8. API surface the frontend expects (map your list to these)

REST (all take broker context: `accountIds[]` or `accountId`):

| # | Purpose | Method & path (suggested) | Request → Response |
|---|---|---|---|
| 1 | Place order (± bracket) | `POST /orders` | `{ accountIds[], symbol, side, orderType, qty, price?, triggerPrice?, stopLoss?, target?, product, validity }` → `{ batchId, results:[{accountId, orderId, status, message}] }` |
| 2 | Modify order (price/qty/type) | `PUT /orders/:orderId` | `{ accountId, price?, triggerPrice?, qty?, orderType? }` → `{ orderId, status }` |
| 3 | Modify SL / Target | `PUT /orders/:orderId/sl-tp` | `{ accountId, stopLoss?, target? }` → `{ status }` |
| 4 | Cancel order | `DELETE /orders/:orderId` | `{ accountId }` → `{ status }` |
| 5 | Order book | `GET /orders` | `?accountIds=&status=` → `WorkingOrder[]` |
| 6 | Trade/fill book | `GET /fills` | `?accountIds=` → fills[] |
| 7 | Positions | `GET /positions` | `?accountIds=` → `Position[]` |
| 8 | Exit / modify position | `POST /positions/:id/exit` · `PUT /positions/:id/sl-tp` | broker-dependent |
| 9 | Pre-trade margin | `POST /margin` | order/legs → `{ required, breakdown }` |

WebSocket (preferred over polling) — same gateway, new channels:

| Channel | Server → client payload |
|---|---|
| `ORDER_UPDATE_<accountId>` (auto after auth, or subscribe) | `{ orderId, status, filledQty, avgPrice, price, ts, … }` |
| `POSITION_<accountId>` | `{ symbol, netQty, avgPrice, ts, … }` |

> If order/position updates aren't on WS, the FE falls back to a REST poll
> (2–3s) for `/orders` + `/positions`. Tell me which exists and I wire accordingly.

---

## 9. State & performance decisions

- `tradeStore` (zustand) with **per-symbol selectors** so a tick/position change on
  one instrument re-renders only its overlays.
- Drag commits on **release** (never mid-drag); optimistic move + reconcile with the
  authoritative WS/REST update by `ts`.
- P&L + label math is client-side from `ltp`; only *actions* hit the backend.
- Overlays exist only for **visible panels** whose symbol matches an order/position.

---

## 10. Risks / edge cases

- Broker capability differences (bracket/GTT/SL-M support) → capability flags drive
  which handles/actions show.
- Same price / overlapping lines → label offset + stacking.
- Fast ticks during drag → commit-on-release avoids thrash.
- Order for an option strike shows **only** on that strike's chart panel (symbol-scoped).
- Rejections / partial fills → line tag reflects status, non-blocking toast.
- No WS order feed → poll fallback (kept behind the adapter).

---

## 11. Sub-phases (each shippable on mocks, then wired)

- **3a** `tradeStore` + models + `tradeAdapter` (mock orders/positions + client P&L).
- **3b** Draggable chart order-line overlays + store binding (SL/Target/entry/position).
- **3c** From-chart Order Ticket (click-to-trade) + Quick-Trade/one-tap + bracket.
- **3d** Drag → modify (debounced, optimistic), cancel, exit-position.
- **3e** Live status/P&L via WS (or poll) + partial-fill/reject handling.
- **3f** Multi-broker grouping + per-broker execution status.

---

## What I need from you

Your **API list** — map it to §8 (I'll adapt exact shapes/names in the adapter,
just like the candle/WS layers). Also confirm whether **order/position updates come
over WebSocket** (channel names) or must be **polled**. With that, I start at **3a**
on mocks and swap endpoints in as they're confirmed.
