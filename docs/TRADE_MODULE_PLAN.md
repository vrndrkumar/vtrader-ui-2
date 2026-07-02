# VTrader — "Trade" Module

## System Analysis & Implementation Plan (for approval)

> Status: **Design proposal. No code will be written until this is approved.**
> Author: Architecture pass over the existing `vtrader-ui` codebase.
> Scope: A professional, TradingView-class trading terminal integrated with broker execution, added as a new module to the current app **without breaking existing modules**.

---

## 1. Executive summary

The Trade module is a real-time trading terminal: multi-chart candlesticks with tick-by-tick streaming, order placement and management directly from the chart (draggable entry / SL / target lines), live positions and P&L, a watchlist, an option chain, an options strategy builder with payoff analytics, indicators, drawing tools, and multi-account execution.

This is by far the heaviest module in the app. Its defining constraint is **performance under continuous streaming** — thousands of ticks/second across many symbols must update the UI without jank and without re-rendering unrelated components. That single constraint drives every architectural choice below: the charting engine, the state layer, the WebSocket design, and the rendering strategy.

The plan is designed to slot cleanly into the current stack (React 18 + TS + Vite + Tailwind, react-router v6, JWT auth, per-domain `api/` + `types/` modules) and to be delivered in **approvable phases**, each independently shippable.

---

## 2. Design principles

1. **Streaming state never touches React Context.** High-frequency data lives in stores that components subscribe to with fine-grained selectors, so a tick on symbol A never re-renders symbol B's row.
2. **The canvas owns the hot path.** Price rendering happens on a canvas chart engine, updated imperatively. React manages *chrome* (panels, toolbars, dialogs), not per-tick pixels.
3. **Batch, coalesce, and rAF-throttle.** Incoming ticks are buffered and flushed once per animation frame. The UI renders at most ~60fps regardless of feed rate.
4. **Isolated, feature-first module.** Everything lives under `src/trade/`. Existing modules are untouched except for three small, additive integration points (route, sidebar entry, optional shared theme tokens).
5. **Backend-agnostic frontend.** The FE talks to your normalized backend contract; broker specifics stay server-side (per your direction).
6. **Lighter than the reference screenshots.** More whitespace, thinner chrome, fewer heavy borders, a calmer color system, and denser-but-cleaner data tables. Reference screenshots define *functionality and layout*, not the final visual weight.

---

## 3. Recommended technology decisions

### 3.1 Charting engine — **Recommendation: KLineCharts (primary), behind a thin `ChartEngine` abstraction**

You asked me to recommend. Here is the reasoning across the realistic options:

| Option | Indicators | Drawing tools | Draggable order/SL/TP lines | Licensing | Custom work needed | Streaming perf |
|---|---|---|---|---|---|---|
| **KLineCharts** (open source) | Built-in (MA/EMA/SMA/BOLL/MACD/RSI/KDJ/CCI/DMI-ADX/SAR/OBV/VWAP…) + custom API | Built-in overlays (trend/H-line/V-line/rect/Fibonacci/segment/rayline…) + custom | Yes — custom overlays with drag events | Free (Apache-2.0) | Low–Medium | Excellent (canvas, incremental update APIs) |
| **TradingView Lightweight Charts** | None built-in (compute series yourself) | None built-in (v5 "primitives" API — build each) | Build via primitives | Free | High | Best-in-class |
| **TradingView Charting Library** | Everything out of the box | Everything out of the box | Built-in order-line tools | Proprietary — requires TradingView approval/repo access | Lowest | Excellent |

**Why KLineCharts:** it hits the sweet spot for *this* feature list. It ships the indicators and drawing tools you enumerated (sections 10–11) and exposes an overlay/annotation API with drag events that maps directly to draggable entry/SL/target and pending-order lines (section 3). That removes the largest chunk of custom work while staying free of licensing and delivering canvas-based streaming performance. TradingView's Charting Library would be marginally faster to feature-parity but adds a licensing/approval dependency and a heavier integration; Lightweight Charts is the performance ceiling but forces us to hand-build every indicator and drawing tool.

**Risk mitigation:** all chart code sits behind a `ChartEngine` interface (`setData`, `updateLastCandle`, `appendHistory`, `addIndicator`, `addOverlay`, `on(event)`…). If we ever hit a wall, we can swap the engine (e.g. to Lightweight Charts or the TV Charting Library) without touching feature code. This is a cheap insurance policy and I recommend we build it from day one.

### 3.2 State & data layer — **Zustand + TanStack Query + a dedicated WebSocket layer**

You approved best-fit libraries. Recommendation:

- **Zustand** for all high-frequency / terminal state (ticks, order book of the user's own orders, positions, P&L, chart config, layout). Transient-update patterns (`setState` without React re-render, plus selector subscriptions) are exactly what tick streaming needs and are the main reason not to use Context here.
- **TanStack Query (React Query)** for REST reads that benefit from caching, dedup, and background refresh (symbol search, option-chain snapshots, historical candles, account lists, holdings). This coexists with the existing raw-axios modules — we don't rip anything out.
- **Native WebSocket** wrapped in a small connection manager (reconnect, heartbeat, subscription multiplexing, backpressure). No socket library needed unless your backend uses socket.io (then we add its client).

**Impact on current modules:** additive only. We reuse `axiosPrivate`/`axiosPublic`, the JWT interceptor, `AuthContext`, and the `toArray` normalizer conventions. No existing page changes behavior. (If we later choose to migrate an existing page to React Query it would be optional and isolated.)

### 3.3 Supporting libraries

- **Virtualization:** `@tanstack/react-virtual` for the option chain (100+ strikes × many columns) and long watchlists — render only visible rows.
- **Layout / resizing:** `react-resizable-panels` for dock/undock, resize, collapse, and multi-chart grids (section 12–13). Lightweight and controlled.
- **Web Worker** for indicator math on large history windows (keeps the main thread free). Optional, introduced in the performance phase.
- **Decimal-safe math** for money/greeks where needed (reuse existing formatting conventions; avoid float display bugs like the earlier P&L rounding issue).

---

## 4. Module architecture & folder layout

Everything is namespaced under `src/trade/` so it's self-contained and easy to lazy-load.

```
src/trade/
  index.tsx                     # TradePage shell (route target), lazy-loaded
  layout/
    TerminalLayout.tsx          # resizable panel grid: left rail, charts, right dock
    ChartGrid.tsx               # 1/2/4/6/8 chart layouts
    LeftRail.tsx                # Scalper/Options/Stocks/Strategy/Watch (per screenshots, left-aligned)
    RightDock.tsx               # Watchlist / Option Chain / panels (mutually-exclusive toggle)
    TopBar.tsx                  # index switcher, 1-Tap, Holdings/Orders/Positions, P&L
  chart/
    ChartEngine.ts              # engine-agnostic interface
    KLineChartEngine.ts         # KLineCharts implementation
    ChartContainer.tsx          # one chart instance (symbol + timeframe + indicators + drawings)
    overlays/                   # order line, SL line, target line, position marker
    indicators/                 # indicator registry + custom defs
    drawings/                   # drawing tool registry
  data/
    ws/WebSocketManager.ts      # connection, reconnect, heartbeat
    ws/subscriptions.ts         # subscribe/unsubscribe multiplexing + ref-counting
    ws/tickBuffer.ts            # rAF-batched flush
    rest/                       # marketData.ts, orders.ts, optionChain.ts, watchlist.ts, strategy.ts, accounts.ts
  store/
    marketStore.ts              # LTP/quote map by token
    chartStore.ts               # per-chart config, active chart, layout
    orderStore.ts               # working/pending/filled orders, live updates
    positionStore.ts            # open positions + live P&L
    watchlistStore.ts
    optionChainStore.ts
    strategyStore.ts            # builder legs, payoff, margin
    accountStore.ts             # connected broker accounts + multi-select
    tradePrefsStore.ts          # 1-tap, default qty, confirmations, risk settings (persisted)
  features/
    watchlist/  optionchain/  strategy/  orders/  positions/  oneclick/  multiaccount/
  types/                        # trade-domain TS types (mirrors existing types/ style)
  utils/                        # formatters, throttle, payoff math, greeks
  hooks/                        # useSymbolQuote, useOrderLine, useChartInstance, useWsSubscription…
```

Integration points with the existing app (the only edits outside `src/trade/`):

1. `routes/AppRouter.tsx` — add a lazy route `/trade` inside the existing `ProtectedRoute → AppLayout` block.
2. `components/layout/Sidebar.tsx` — add a "Trade" nav item (new icon).
3. `tailwind.config.js` — optionally extend a few semantic tokens (bull/bear/grid colors) reused by the terminal. Non-breaking.

> Note on layout: the reference screenshots use a **left action rail** (Scalper, Options Trader, Stocks, Options Strategy, Market Watch, Custom) and a **right dock** (Watchlist ↔ Option Chain toggling in the same slot). You also said you prefer the strategy builder and option chain **on the left**. The `TerminalLayout` will make dock side configurable (left/right) and remember the choice in `tradePrefsStore`, so the option chain / strategy / watchlist can live on the left as you prefer.

---

## 5. Real-time data layer (the heart of the module)

**Connection manager (`WebSocketManager`)**
- Single shared socket (or a small pool) authenticated with the JWT.
- Auto-reconnect with exponential backoff; heartbeat/ping; resubscribe-on-reconnect from the current subscription set.
- Emits normalized messages: `tick`, `quote`, `depth`, `orderUpdate`, `positionUpdate`.

**Subscription multiplexing (`subscriptions.ts`)**
- Ref-counted subscribe/unsubscribe by instrument token. Ten chart panels + watchlist + option chain all watching NIFTY subscribe once.
- On component unmount, decrement; unsubscribe when count hits zero.

**Tick batching (`tickBuffer.ts`)**
- Incoming ticks write into a mutable buffer keyed by token.
- A single `requestAnimationFrame` loop flushes the buffer: updates `marketStore` (for tables) and calls `chartEngine.updateLastCandle()` (for charts) at most once per frame.
- Result: a 5,000 msg/sec feed still paints at ~60fps. This is the core anti-jank mechanism.

**Store fan-out**
- Tables/watchlist/option-chain subscribe to `marketStore` with **per-token selectors** → only the changed row re-renders.
- Charts bypass React entirely for price updates (imperative canvas), so streaming a chart costs ~0 React renders.

---

## 6. Feature-by-feature frontend design

**1. Trading chart** — `ChartContainer` wraps `KLineChartEngine`. Live candles via `updateLastCandle`; timeframe switch refetches history; infinite scroll triggers `appendHistory` when the user pans past the loaded left edge (loads older candles in pages). Smooth zoom/pan is native to the engine.

**2. Trading from chart** — click-to-trade: clicking a price on the chart opens a compact order ticket (Market/Limit/Stop, qty, product). One-tap mode (see feature 5) skips the ticket. Buy/Sell buttons in the chart header mirror the screenshots.

**3. Interactive SL/Target** — after an order/position exists, the engine draws three draggable overlays: **Entry**, **Stop Loss**, **Target**. Dragging an overlay fires a debounced `modifyOrder` / `modifySlTp` API call; the line snaps to confirmation or reverts on failure. Pending-order price is itself a draggable line. This is the "pro terminal" behavior you specified.

**4. Position visualization** — open positions, pending and filled orders, entry price, qty, and live P&L render as chart overlays *and* in the Orders/Positions panels. All driven by `orderStore`/`positionStore`, updated live from WS `orderUpdate`/`positionUpdate`.

**5. One-click trading** — `tradePrefsStore` holds 1-tap on/off, default/quick quantities, risk settings (max qty, auto-SL distance), and a confirmation toggle. One-Click Buy/Sell fires immediately using those defaults (matching the "1-Tap OFF/ON" control in the screenshots).

**6. Multi-broker / multi-account** — `accountStore` lists connected broker accounts (from the existing `/broker` data). An account multi-select lets the user fire one order across several accounts. We show a **per-account execution status** grid (queued → sent → filled/failed) and handle partial failures without blocking the others. Requires a backend "basket/fan-out" order endpoint (section 7).

**7. Watchlist** — searchable, add/remove, pin favorites, live LTP/%chg/volume, click-to-load-chart. Virtualized list; each row is a selector-subscribed component. Clicking the Watchlist tab toggles the dock open and shrinks the charts (per your screenshot note "when click on watch list, toggle open, chart shrink").

**8. Option chain** — full Calls/Puts grid with OI, ΔOI, volume, IV, LTP, greeks (if the feed provides them), PCR, and ATM highlighting. Virtualized rows, ATM auto-centered. Opening it closes the Watchlist in the same dock slot (per screenshot: "watch list close and same place option chain open"). Hovering a strike reveals inline Buy/Sell + "apply to chart" actions (per screenshot).

**9. Option strategy builder** — build Iron Condor / Iron Fly / Straddle / Strangle / Bull Call / Bear Put / Custom by adding legs (from the option chain, all single legs addable in one place per your preference). Live **payoff chart** (reuse `recharts`, already installed), **max profit / max loss / breakeven / margin / live P&L**, and greeks. Presets scaffold the legs; everything stays editable.

**10. Technical indicators** — registry-based. EMA/SMA/VWAP/RSI/MACD/Bollinger/ATR/ADX/Stochastic via built-ins; SuperTrend/Ichimoku via KLineCharts' custom-indicator API. Adding a new indicator = one registry entry, satisfying "easily extensible."

**11. Drawing tools** — trend line, horizontal, vertical, rectangle, Fibonacci retracement/extension, pitchfork, text, arrow, brush, measurement — mapped to engine overlays. Drawings are per-chart and persisted (section 12).

**12. Multi-chart layout** — `ChartGrid` supports 1/2/4/6/8 charts, each with independent symbol, timeframe, indicators, and drawings. Layout + per-chart config persisted (localStorage first; optional backend sync later so it follows the user across devices).

**13. Chart resize / docking** — `react-resizable-panels` for resizable/collapsible panels, fullscreen a chart, and dock/undock the side panels (left or right, your choice).

**14. Performance** — covered in section 8.

---

## 7. Backend API surface required by the frontend

This is the **complete list of endpoints the Trade frontend needs**. You said you already have some of this — please map these against what exists; anything missing becomes a backend task. Paths are suggestions in your existing style (`https://api.vtrader.in`, JWT bearer). All REST responses may use your existing envelope (`{data|result|records|...}`) — the FE already normalizes that.

### 7.1 Market data (REST)

| Purpose | Method & path | Request | Response (shape) |
|---|---|---|---|
| Historical candles | `GET /trade/candles` | `symbolToken, exchange, interval, from, to` (or `limit`) | `[{ time, open, high, low, close, volume }]` |
| Older candles (infinite scroll) | same endpoint, paged | `...&to=<oldest loaded>&limit=N` | same |
| Quote snapshot | `GET /trade/quote` | `tokens=comma,separated` | `[{ token, ltp, chg, chgPct, volume, oi?, bid, ask }]` |
| Symbol search | `GET /trade/search` | `q, exchange?, segment?` | `[{ token, symbol, name, exchange, segment, lot, tickSize }]` |
| Indices list | `GET /trade/indices` *(exists)* | — | index master |
| Instrument/expiry master | `GET /trade/instruments` | `underlying, segment?` | `[{ token, symbol, expiry, strike, optionType, lot, tickSize }]` |

### 7.2 Option chain (REST + stream)

| Purpose | Method & path | Request | Response |
|---|---|---|---|
| Option chain snapshot | `GET /trade/option-chain` | `underlying, expiry` | `{ underlying, expiry, spot, pcr, atmStrike, rows: [{ strike, call:{ltp,oi,oiChg,volume,iv,greeks?}, put:{...} }] }` |
| Expiry dates | `GET /trade/expiries` | `underlying` | `[ "2026-07-07", ... ]` |
| Live OC updates | via WS `optionChain` channel | subscribe `underlying+expiry` | per-strike diffs |

### 7.3 Orders & execution (REST)

| Purpose | Method & path | Request | Response |
|---|---|---|---|
| Place order | `POST /trade/orders` | `{ accountIds[], symbolToken, exchange, txnType, orderType(MARKET/LIMIT/SL/SL-M), qty, price?, triggerPrice?, product, validity }` | `{ batchId, results:[{ accountId, orderId, status, message }] }` |
| Modify order | `PUT /trade/orders/:orderId` | `{ accountId, price?, triggerPrice?, qty?, orderType? }` | `{ orderId, status }` |
| Cancel order | `DELETE /trade/orders/:orderId` | `accountId` | `{ orderId, status }` |
| Modify SL/Target (bracket) | `PUT /trade/orders/:orderId/sl-tp` | `{ accountId, stopLoss?, target? }` | `{ status }` |
| Order book | `GET /trade/orders` | `accountIds?, status?` | `[{ orderId, accountId, symbol, txnType, orderType, qty, filledQty, price, avgPrice, status, time }]` |
| Trade/fill book | `GET /trade/fills` | `accountIds?` | `[{ orderId, fillPrice, qty, time }]` |

> Multi-account fan-out (feature 6) is expressed by `accountIds[]` on placement and a per-account `results[]`. If your current backend is single-account, the fan-out/basket capability is the main new server-side piece.

### 7.4 Positions, holdings, funds (REST)

| Purpose | Method & path | Request | Response |
|---|---|---|---|
| Open positions | `GET /trade/positions` | `accountIds?` | `[{ accountId, symbolToken, symbol, netQty, avgPrice, ltp, pnl, product }]` |
| Holdings | `GET /trade/holdings` | `accountIds?` | `[{ symbol, qty, avgPrice, ltp, pnl }]` |
| Funds / margin available | `GET /trade/funds` | `accountIds?` | `[{ accountId, available, used, total }]` |
| Order margin (pre-trade) | `POST /trade/margin` | order/legs payload | `{ required, breakdown }` |

### 7.5 Strategy builder (REST)

| Purpose | Method & path | Request | Response |
|---|---|---|---|
| Payoff / analytics | `POST /trade/strategy/payoff` | `{ legs:[{ token, optionType, strike, expiry, side, qty, price }], spot }` | `{ maxProfit, maxLoss, breakevens[], margin, greeks, curve:[{ price, pnlToday, pnlExpiry }] }` |
| Basket margin | `POST /trade/strategy/margin` | legs | `{ required, benefit }` |
| Place basket | `POST /trade/strategy/execute` | `{ accountIds[], legs[] }` | per-leg per-account results |

### 7.6 Accounts / watchlist (REST)

| Purpose | Method & path | Request | Response |
|---|---|---|---|
| Connected accounts | `GET /broker` *(exists)* | — | user brokers (reused for account selector) |
| Watchlists | `GET /trade/watchlists` | — | `[{ id, name, items:[{ token, symbol }] }]` |
| Add/remove/pin item | `POST/DELETE/PATCH /trade/watchlists/:id/items` | `{ token }` | updated list |
| Layout persistence (optional) | `GET/PUT /trade/layout` | layout JSON | layout JSON |

### 7.7 WebSocket (single normalized socket)

| Channel | Client → server | Server → client |
|---|---|---|
| Connect/auth | JWT on connect | `connected` |
| Market ticks | `{ action:"subscribe", tokens:[...], mode:"ltp"\|"quote"\|"depth" }` | `{ type:"tick", token, ltp, chg, vol, bid?, ask?, ts }` |
| Option chain | `{ action:"subscribe", channel:"optionChain", underlying, expiry }` | `{ type:"oc", strike, call{...}, put{...} }` |
| Order updates | auto after auth | `{ type:"order", orderId, accountId, status, filledQty, avgPrice }` |
| Position/P&L updates | auto after auth | `{ type:"position", accountId, token, netQty, pnl }` |

> If your existing market-data API differs (naming, snake_case, socket.io vs raw WS, single vs multi-account), share the contract and I'll adapt the adapter layer — the FE is built to normalize, exactly like the current `toArray`/alias pattern.

---

## 8. Performance plan

- **rAF-batched tick flush** (section 5) — the primary defense against jank.
- **Selector-level subscriptions** — Zustand selectors so only changed rows/cells re-render; `React.memo` on row components with token-scoped equality.
- **Canvas-only price path** — chart price updates never enter the React render cycle.
- **Virtualized tables** — option chain and watchlist render only visible rows.
- **Web Worker indicators** — heavy indicator recomputation on large history off the main thread.
- **Bounded buffers** — cap in-memory candles per chart (e.g. rolling window) and evict off-screen history; unsubscribe unseen instruments.
- **Render budget target** — steady-state ≤ a handful of React commits/second regardless of feed rate; interaction (pan/zoom/drag) stays at 60fps.
- **Bundle isolation** — the whole module is lazy-loaded (`/trade` route split), so existing pages' load time is unaffected.

---

## 9. Design / UI direction (lighter than the references)

The reference screenshots define layout and features. The delivered UI will be **visually lighter**: more breathing room, thinner 1px hairline borders (reusing `border.light/dark` tokens), a restrained accent palette built on the existing `brand` scale, semantic bull/bear greens/reds tuned for calm contrast, consistent 12–13px tabular numerics for data grids, and subtle motion (the existing `fade-in`/`slide-up` keyframes). Full light/dark parity via the current `darkMode: 'class'` setup and `ThemeToggle`. Dense data (option chain) stays readable through alignment and weight, not heavy gridlines.

---

## 10. Proposed implementation phases

Each phase is independently shippable and separately approvable. Nothing in existing modules breaks at any phase.

**Phase 0 — Foundations & scaffolding**
Module skeleton under `src/trade/`, `/trade` route + sidebar entry, `TerminalLayout` with resizable panels, `ChartEngine` interface + KLineCharts wired to *historical* candles (no streaming yet), Zustand + React Query set up. *Deliverable:* navigable Trade page rendering a real historical chart with timeframe switching.

**Phase 1 — Live streaming core**
`WebSocketManager`, subscription multiplexing, `tickBuffer` rAF flush, `marketStore`. Live last-candle updates + a minimal live watchlist. *Deliverable:* a chart that streams tick-by-tick smoothly; proves the performance model.

**Phase 2 — Watchlist & Option Chain**
Full watchlist (search/add/remove/pin/virtualized) and full option chain (virtualized, ATM, PCR, live OC), with the dock-toggle behavior from your screenshots. *Deliverable:* both right/left-dock panels complete.

**Phase 3 — Order execution & from-chart trading**
Order ticket, Market/Limit/Stop, order book & positions panels, click-to-trade, draggable entry/SL/target + pending-order lines with live modify, position overlays. *Deliverable:* full single-account trading from the chart.

**Phase 4 — One-click & multi-account**
1-tap mode, quick qty, risk/confirmation settings, account multi-select, basket fan-out with per-account status and partial-failure handling. *Deliverable:* one order across multiple accounts.

**Phase 5 — Strategy builder**
Presets (Iron Condor/Fly, Straddle/Strangle, spreads) + custom legs, payoff chart, max P/L, breakeven, margin, greeks, live P&L, basket execution. *Deliverable:* complete options strategy workflow.

**Phase 6 — Indicators & drawing tools**
Indicator registry (all listed) + drawing toolbar (all listed), per-chart persistence. *Deliverable:* full analysis toolset.

**Phase 7 — Multi-chart layouts & polish**
1/2/4/6/8 grids with independent config, fullscreen, dock/undock, layout persistence, Web Worker indicators, final performance pass + visual polish. *Deliverable:* production-grade terminal.

*(Phases can be reordered — e.g. pull Strategy builder earlier — based on your priorities.)*

---

## 11. Risks & open items

- **Backend contract confirmation** — the biggest unknown. Once you share your existing market-data/order APIs and WS format, I'll finalize the adapter layer and mark exactly which section-7 endpoints are missing.
- **Multi-account fan-out** — likely the main new server-side capability if the current backend is single-account.
- **Greeks & IV availability** — depends on whether your feed provides them or we compute client-side (Black-Scholes) as a fallback.
- **Feed shape** — raw WS vs socket.io, LTP vs full-depth modes, throttling on the server side all affect the client subscription design.
- **Charting engine escape hatch** — the `ChartEngine` abstraction keeps a swap to Lightweight Charts / TV Charting Library cheap if a specific feature demands it.

---

## 12. What I need from you to proceed

1. **Approval** of this architecture and the phase plan (or edits).
2. **Your existing backend contracts** — market-data/history endpoints, order APIs, and the WebSocket message format. I'll reconcile them against section 7.
3. **Priority ordering** of phases (default is the order above).
4. Confirmation of the **charting engine** recommendation (KLineCharts) or a preference for one of the alternatives.

Once approved, I'll start at **Phase 0** and keep each phase isolated so the current app keeps working throughout.

---

## 13. Addendum — Redis feed integration (post-clarification)

Following clarification: no paid TradingView library (**KLineCharts confirmed**), and market data is available via **Redis** — index ticks as keyed values and option chain via a pub/sub channel.

### 13.1 Observed Redis data shapes

**Index tick** (`GET 'Nifty 50'`, `GET SENSEX`):
```json
{ "index":"NIFTY", "displayName":"NIFTY", "symbol":"Nifty 50",
  "ltp":24072.6, "bidPrice":0, "askPrice":0, "exchange_timestamp":1782972772000 }
```
- `exchange_timestamp` is epoch **ms**. Index spot carries no volume; bid/ask are 0.

**Option chain** (`SUBSCRIBE OptionChainData`), one message per strike-leg:
```json
{ "index":"SENSEX", "expiry":"02JUL26", "optionType":"CE", "strikePrice":"78700",
  "symbol":"SENSEX_02JUL26_CE_78700", "ltp":2.15, "volume":7083740,
  "buyQty":2112380, "sellQty":228860, "bidPrice":2.1, "askPrice":2.15,
  "exchange_timestamp":1782972809000 }
```
- The channel is a **firehose of all indices/expiries/strikes mixed together** (SENSEX, MIDCPNIFTY, BANKEX observed in one stream).
- **Missing fields vs. requirements:** no `OI`, no `OI change`, no `IV`, no `greeks`. PCR/ATM-OI visualizations depend on OI. This is a decision point (see 13.4-C).

### 13.2 Critical architectural consequence — a WebSocket gateway is required

Browsers cannot connect to Redis. A **server-side WS gateway** is mandatory and becomes the backbone of the live data layer:

```
Redis (ticks + OptionChainData)  →  WS Gateway (server)  →  Browser WS
                                     • JWT auth
                                     • per-client subscription registry
                                     • server-side FILTER (index + expiry)
                                     • optional coalescing/throttle
```

The gateway must not broadcast the raw firehose. A client subscribes to a specific `index + expiry` (option chain) or a set of index/equity symbols (ticks); the gateway forwards only matching messages. The browser-side `WebSocketManager` + `tickBuffer` (sections 5, 8) sit behind this unchanged.

### 13.3 Historical data & broker rate limits

Broker historical calls **must be decoupled from user count** via a server-side candle store:
- Past candles are immutable → cache indefinitely; only the latest/forming candle needs refresh (and it can be built from the tick stream).
- Cached: broker hit ≈ once per `(symbol, timeframe)` warm-up (~hundreds one-time), independent of users.
- Uncached: scales with users (100 users × 4 charts = 400 burst calls) → breaches typical broker limits.
- Frontend adds React Query + in-memory cache per `(symbol, timeframe)`; timeframe/symbol re-selection refetches nothing.
- Per-user session estimate: ~20–60 historical requests total (1/load, 1/timeframe, 1/symbol, 1/scroll-page, N for N-chart grids).

### 13.4 Revised backend requirements (what's still needed)

- **A. WS gateway (new, top priority):** Redis→browser bridge with JWT auth, per-client subscribe protocol, server-side filtering by `index+expiry` (option chain) and by symbol (ticks); ideally also carries order/position updates.
- **B. Historical candles API:** confirm exact request/response, intervals, max bars, pagination for infinite scroll, and server-side caching (13.3).
- **C. Option-chain enrichment:** source for **OI, ChgOI, IV, Greeks, PCR**. OI cannot be derived — must come from the feed/backend. IV/greeks can be computed (Black-Scholes) server- or client-side from ltp+spot+strike+expiry+rate.
- **D. Option-chain seed snapshot (REST)** + **expiries list** per index, so the grid renders instantly then the stream patches it (avoids waiting to accumulate strikes from the firehose).
- **E. Instrument master / symbol search** for equities + options (symbol↔token), beyond existing `/trade/indices`.
- **F. Order execution (not in Redis):** place/modify/cancel, order book, positions, holdings, funds, pre-trade margin, multi-account fan-out; confirm whether order/position updates arrive via Redis/WS or require polling.
- **G. Equity ticks:** confirm whether the `GET 'Nifty 50'` keyed-tick pattern also exists for individual stocks (watchlist LTP beyond indices).

### 13.5 Frontend adapters this enables (no change to broker specifics)

- `redisTick → NormalizedQuote` — map `{index, symbol, ltp, exchange_timestamp}`; treat ts as ms; ignore 0 bid/ask for indices.
- `optionChainMsg → OptionChainRow` — group by `index+expiry`, pivot CE/PE onto a shared `strikePrice`, sort ascending, compute ATM from spot (from index tick), compute PCR when OI is available.
- Forming-candle builder — aggregate index/option ticks into the active timeframe bucket on top of cached history.

