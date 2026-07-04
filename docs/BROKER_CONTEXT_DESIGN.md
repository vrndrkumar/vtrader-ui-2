# Global Broker Context — Architecture & UX Design

> Design proposal for review. No implementation yet — APIs to be integrated later.
> Goal: one reusable, app-wide broker-selection mechanism that every trading
> module consumes, driven by the login response as the single source of truth.

---

## 1. Principle

The `preferences.BROKER[]` array from `/users/api/login` is the **single source of
truth** for broker preferences. It is captured once at login, hydrated into a
**global broker store**, and every module (Order Placement, Quick Trade, Order
Window, Positions, Holdings, Order Book, Trade Book, …) reads the *current broker
context* from that store — never from its own local copy.

No screen re-implements broker selection. They all bind to the same store and the
same `<BrokerSelector/>` component.

---

## 2. Where it lives (app-level, not Trade-level)

Positions, Holdings, Order Book and Trade Book are app-wide, so the broker context
must live at the **app root**, above the Trade module:

```
App
 └─ AuthProvider            (already exists — owns token + user)
     └─ BrokerProvider      (NEW — hydrated from login preferences.BROKER)
         └─ Router / all modules  ── consume useBrokerContext()
```

Implementation vehicle: a small **Zustand store** (`brokerStore`) — consistent with
the realtime/market stores already in the app, and gives fine-grained selectors so
a broker switch only re-renders subscribers. `AuthContext.login()` populates it
from the login response; `logout()` clears it.

---

## 3. State model

```ts
interface BrokerAccount {
  id: number
  brokerName: string          // "FINVASIA"
  displayName: string         // "FINVASIA[FA30962]"
  isDefault: boolean          // from "default": true
  quantity: Record<string, number> // { nifty, banknifty, sensex, stocks }
  // room to grow: status, marginAvailable, enabled, capabilities…
}

interface BrokerState {
  accounts: BrokerAccount[]        // from login (source of truth)
  selectedIds: number[]            // active broker context (1..N)
  quickTrade: boolean              // global Quick Trade toggle
  confirmOrders: boolean           // safety confirmation

  hydrate(accounts, opts): void    // called on login
  setSelected(ids): void
  toggleSelected(id): void
  setQuickTrade(v): void
}
```

Key decisions:

- **`selectedIds` is an array**, defaulting to `[defaultBroker.id]`. Single-broker is
  just the common case of the multi-broker model — no separate code path.
- The store holds **preferences only**. Live data (positions, funds, orders) is
  fetched per module using this context; it is never stored here.

---

## 4. Hydration, persistence & reconciliation

- **Hydrate on login** from `preferences.BROKER`. Default selection =
  the account with `default: true` (fallback: first account).
- **Persist** `selectedIds`, `quickTrade`, `confirmOrders` to `localStorage` so the
  user's working context survives reloads.
- **Reconcile** on every hydrate: drop any persisted `selectedId` that no longer
  exists in the fresh login response; if the selection becomes empty, fall back to
  the default broker. This prevents a stale/removed broker from driving requests.

---

## 5. Selection semantics

One model, two consumption patterns — both driven by `selectedIds`:

| Consumer | Behaviour with N selected brokers |
|---|---|
| **Reads** (Positions, Holdings, Order Book, Trade Book) | Fetch for each selected broker, **merge** into one list with a `broker` column/tag. One selected → single broker view; many → aggregated portfolio view. |
| **Writes** (Order Placement, Quick Trade) | **Fan out** the order across all selected brokers, each with its own default qty, and show **per-broker execution status** (queued → sent → filled/failed), tolerating partial failure. |

This is exactly what "selected broker(s) drive all API requests" implies, and it
scales from 1 to N brokers with no branching in module code.

---

## 6. Quick Trade flow

`quickTrade` is a global flag (persisted). Order entry (from chart, option chain,
watchlist, anywhere) funnels through one `placeOrder(intent)` helper:

```
placeOrder(intent):
  brokers = store.selectedIds → accounts
  if quickTrade:
      for each broker: submit(intent, qty = resolveQty(broker, intent.symbol))
      (optionally gated by confirmOrders)
  else:
      open <OrderWindow> pre-filled with brokers + resolved qty for review/edit
```

So Quick Trade ON = one-tap, default qty, fan-out; OFF = shared Order Window modal.
Both use the **same** broker context and the **same** submit path.

---

## 7. Default quantity resolver

Quantities are per-broker, per instrument class. A single resolver maps a symbol to
its class, then reads that broker's quantity:

```
resolveQty(broker, symbol):
  class = classify(symbol)   // NIFTY→nifty, BANKNIFTY→banknifty,
                             // SENSEX→sensex, else → stocks
  return broker.quantity[class] ?? broker.quantity.stocks ?? 1
```

`classify()` is the one place that knows index-vs-stock rules, so adding a class
(e.g. `finnifty`) later is a one-line change and every module benefits.

---

## 8. API integration layer (broker-aware requests)

Modules must not pass broker params by hand. A thin **broker-aware request layer**
injects the current context:

- **Single-broker calls:** a helper reads `selectedIds` and adds
  `brokerName`/`accountId` to the request (query or body). Modules call
  `brokerApi.get('/positions')` and the broker is attached automatically.
- **Fan-out calls:** `withBrokers(fn)` runs `fn` once per selected broker
  (bounded concurrency, like the candle scheduler) and returns
  `{ brokerId, ok, data | error }[]` — used for both aggregated reads and order
  fan-out with per-account status.

This keeps the broker context in exactly one place; swapping/adding a broker never
touches module code.

---

## 9. Reusable UI

**`<BrokerSelector/>`** — one component, used in the global app header and the Trade
top bar (and anywhere else). States:

- **Trigger:** shows the active broker's `displayName`; when multiple are selected,
  shows `"FINVASIA +1"` / `"3 brokers"` with a count chip.
- **Panel:** a row per broker — broker initial/logo, `displayName`, a **Default**
  badge, a checkbox (multi-select) and a "make primary" affordance. A subtle line
  shows that broker's default qty (e.g. `N 225 · BN 70 · SX 60`).
- **Footer of panel:** the **Quick Trade** toggle + **Confirm orders** toggle, so
  execution behaviour is discoverable right where the broker is chosen.
- **Empty/edge states:** "No brokers connected → Add a broker" deep-link when the
  login response has none.

**`<OrderWindow/>`** — shared modal (Quick Trade OFF): pre-filled with selected
brokers, resolved qty, order type, price; shows margin per broker and a single
Place button that fans out. One implementation, reused everywhere.

**Multi-broker execution feedback** — a compact per-broker status list
(broker → status) shown after submit, reused by Quick Trade and Order Window.

---

## 10. How a module consumes it (illustrative)

```
// Positions screen — zero broker plumbing of its own
const brokers = useSelectedBrokers()
const { data } = useBrokerFanout(brokers, (b) => positionsApi(b))  // aggregated + tagged

// Order from chart
placeOrder({ symbol, side: 'BUY', orderType: 'MARKET' })  // uses global context + Quick Trade
```

Every new module follows the same two lines — that's the extensibility guarantee.

---

## 11. Extensibility

- **New brokers:** appear automatically — they're just more entries in the login
  response. No code change.
- **New modules:** consume `useBrokerContext()` / `useSelectedBrokers()` — inherit
  selection, quick-trade, qty resolution, fan-out for free.
- **New per-broker data** (margin, status, capabilities): add fields to
  `BrokerAccount`; UI/logic degrade gracefully if absent.
- **New instrument classes:** extend `classify()` only.

---

## 12. Edge cases handled by design

- No brokers in login → selector shows empty state; order entry disabled.
- Persisted broker removed/disabled next login → reconciled to default.
- Selection emptied by user → auto-fallback to default (never zero context).
- Multi-broker partial failure → other brokers still execute; failures surfaced.
- Symbol with no matching qty class → falls back to `stocks` qty, then `1`.
- Token/session refresh → store re-hydrates from the new login response.

---

## 13. Data flow (summary)

```
/users/api/login ──▶ AuthContext.login()
                          │ hydrate
                          ▼
                    brokerStore  ◀── localStorage (selectedIds, quickTrade)
                          │ selectors
        ┌─────────────────┼───────────────────────────────┐
        ▼                 ▼                                 ▼
 <BrokerSelector/>   broker-aware request layer      placeOrder() / OrderWindow
 (header + trade)    (auto-inject + fan-out)          (quick vs window)
        │                 │                                 │
        ▼                 ▼                                 ▼
   every module: Positions · Holdings · Order Book · Trade Book · Order Placement
```
