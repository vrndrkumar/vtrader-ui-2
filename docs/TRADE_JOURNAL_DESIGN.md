# Trade Journal — Product Design & Architecture

> Design for review. No implementation yet. Goal: a **trading diary** (review →
> annotate → learn), not an order book.

---

## 1. Recommended architecture (and where it lives)

**Recommendation: a dedicated top-level `Journal` module** — *not* buried inside
Reports — that **shares the trade/order data layer** with Reports and the Trade
terminal.

Why, from the user's perspective:

- **Different intent / mindset.** Reports answers *"how am I doing?"* (aggregate
  metrics, P&L curves, win rate). The Journal answers *"what happened on this
  trade and what do I learn?"* (per-trade reflection). Mixing a reflective,
  write-heavy workflow into an analytics page dilutes both and cramps each.
- **It will grow a lot.** Notes, tags, screenshots, emotions, checklists, lessons,
  review status, ratings, setups/playbook, insights — that's a whole surface. It
  needs its own home to scale without turning the Reports table into a monster.
- **Navigation clarity.** A `Journal` nav item signals a distinct activity, the way
  traders think of "journaling" as its own habit.
- **No data duplication.** Trades/orders come from the same source (`/trades`,
  `/trades/orders`). The Journal *consumes* that data layer and *adds* journal
  metadata (notes/tags/…) via new endpoints. Reports and Journal are two lenses on
  one dataset.

Division of responsibility (avoids overlap with today's Reports → Trades):

| Surface | Owns |
|---|---|
| **Reports** | Aggregate analytics — P&L curve, win rate, by-strategy / by-symbol charts. The "numbers". |
| **Journal** (new) | The browsable **trade list** + per-trade **review & annotation** workflow. The "story". |
| **Trade terminal** | Live trading. Deep-links "Review in Journal" for a filled trade. |

Cross-links everywhere: Reports row / terminal position → **Open in Journal**.

---

## 2. Navigation

Add **`Journal`** to the sidebar (top level). Inside it, a two-pane workflow:

```
Journal
 ├─ Trade list          (filter/search, grouped by strategy/date; review-status badges)
 ├─ Trade Review        (detail: orders + the diary — notes/tags/emotions/checklist/lessons/screenshots)
 ├─ (later) Insights    (journal-driven analytics: win-rate by tag/setup/emotion)
 └─ (later) Playbook     (library of setups/strategies)
```

Trade Review opens as a **right-side drawer** over the list (fast next/prev
review) with a deep-linkable route `/journal/:tradeId` (shareable, back-button
friendly). List stays as context.

---

## 3. Entities & relationships

```
Order (existing — vtrader_ledger row)
  id, userId, brokerName, indexName, symbolName, orderId,
  quantity, price, txnType(BUY/SELL), orderType, orderStatus, placedTime, groupName
        │  N
        │
Trade (aggregate, derived by /trades — one decision/round-trip)
  tradeId(stable), symbolName, groupName, orders[], avgEntry, avgExit,
  realizedPnl, unrealizedPnl, status(OPEN/CLOSED), first/last time
        │  1─1
        ▼
JournalEntry (NEW — the diary for a trade)
  tradeId(FK), reviewStatus(NEW|REVIEWED|FLAGGED), rating(1–5),
  notes(rich text), tags[]  ─── N:N ──▶ Tag(id, name, color)
  setupId(FK)               ─────────▶ Setup/Playbook (later)
  meta: { emotions[], checklist[], lessonsLearned, mistakes[], ... }  ← extensible bag
  attachments[]             ─── 1:N ──▶ Attachment(id, url, caption)  (screenshots)
  createdAt, updatedAt
```

Key decisions:

- **Journal metadata attaches at the TRADE level** (the trade is the decision/story
  unit), with **optional per-order micro-notes** (`Order.note`) for granular
  annotations ("scaled out too early on this exit"). This is the "trade-level with
  optional order-level" you hinted at — best of both.
- **Stable `tradeId` — confirmed.** `/trades` returns a persistent string id (the
  same one shown in Reports → Trades), e.g.
  `U31BPAPER-TRADE_BTC_08JUL26_PE_61800_DELT`. A trade can hold multiple BUY/SELL
  orders. **All journal metadata keys to this `tradeId`** — this is the linchpin.
- **Notes = trade-level (confirmed for now).** `JournalEntry.notes` lives on the
  trade. **Per-order notes are pre-provisioned** for later with *no refactor*:
  `Order.note?` is an optional field, and the diary's section registry can surface
  an order-notes affordance whenever we enable it — because journal metadata is
  keyed at the trade level and everything qualitative lives in the extensible model.
- **`meta` as a flexible JSON bag** for evolving qualitative fields (emotions,
  checklist, lessons, mistakes). First-class columns only for things we filter on
  (tags, reviewStatus, rating, setupId). → new journal fields = additive, no schema
  churn on the frontend.

---

## 4. UI/UX flow

1. **Land on Journal → Trade list.** Filter/search by date, strategy/group, symbol,
   tag, review status, win/loss, P&L range. Sort by date/P&L. Review-status badges
   (New / Reviewed / Flagged) make "what still needs journaling" obvious.
2. **Bulk actions** from the list: assign/change strategy (group), apply tags,
   mark reviewed.
3. **Open a trade → Review drawer:**
   - **Header:** symbol · strategy · P&L · dates · status · review badge · rating.
   - **Orders:** entry/exit table — edit an order (price/qty/txn/type), **add a
     manual order**, change strategy. (This alone is fully doable with today's APIs.)
   - **Diary sections:** Notes (rich text), Tags, Setup, Emotions, Checklist,
     Lessons learned / Mistakes, Screenshots, Review status + rating.
   - **Next/Prev** to review trades one after another; "Mark reviewed" advances.
4. **Add manual trade** (missed/off-platform): add order(s) → they aggregate into a
   trade → journal it.
5. Filters + last view **persist**; the flow optimizes for the repeated "review my
   day's trades" habit.

---

## 5. Component hierarchy

```
JournalPage  (/journal)
 ├─ JournalFilters        (search, date range, strategy, tag, review status, win/loss, P&L)
 ├─ JournalToolbar        (Add trade/order, bulk: assign group / tag / mark reviewed)
 ├─ JournalList
 │    └─ TradeRow / TradeCard  (summary + review-status badge)
 └─ TradeReviewDrawer  (/journal/:tradeId)
      ├─ TradeSummaryHeader
      ├─ OrdersPanel
      │    ├─ OrderRow ·  AddOrderModal ·  EditOrderModal
      │    └─ StrategyAssign
      └─ JournalMeta  (section registry — see §8)
           ├─ NotesEditor
           ├─ TagPicker
           ├─ SetupPicker
           ├─ EmotionPicker
           ├─ Checklist
           ├─ LessonsPanel
           ├─ Screenshots
           └─ ReviewStatus + Rating

Data layer:  journalApi  →  journalStore (zustand)  →  components
             (wraps /trades, /trades/orders, group-assign, update + future journal APIs)
```

---

## 6. Which existing APIs go where

| Action (in Journal) | Existing API |
|---|---|
| Trade list | `GET /trades?brokerName=&groupName=&fromDate=&toDate=` |
| Trade's orders (detail) | `GET /trades/orders?tradeId=` |
| **Add manual order** | `POST /trades/orders` |
| **Edit / update order** (price, qty, txn, type, group) | `PUT /trades/orders/{id}` |
| **Assign / change strategy** (single or bulk) | `POST /trades/orders/group-assign` |

→ **Order management + strategy assignment + trade browsing is 100% supported by
today's APIs.** That's Phase 1, buildable now.

---

## 7. Additional APIs likely needed (for later phases)

Journal metadata is what needs new endpoints. Suggested shapes:

| Purpose | Suggested endpoint |
|---|---|
| Stable trade identity | `/trades` returns a persistent `tradeId` (or confirm a deterministic key) |
| Journal entry (notes, review, rating, meta) | `GET/PUT /trades/{tradeId}/journal` — one doc per trade (notes + `meta` bag) |
| Per-order note (optional) | `PUT /trades/orders/{id}` gains a `note` field, or `/orders/{id}/note` |
| Tags — library | `GET /tags`, `POST /tags`, `DELETE /tags/{id}` |
| Tags — assign to trade | `PUT /trades/{tradeId}/tags { tagIds[] }` |
| Screenshots / attachments | `POST /trades/{tradeId}/attachments` (multipart → URL), `GET`, `DELETE` (needs file storage) |
| Review status / rating | folded into the journal doc, or `PUT /trades/{tradeId}/review` |
| Setups / Playbook (later) | `CRUD /setups`, link `journal.setupId` |
| Server-side filter + pagination (scale) | `GET /trades` with rich query params + cursor/page |
| Journal insights (later) | `GET /journal/insights?groupBy=tag|setup|emotion` → win-rate/PnL breakdowns |

---

## 8. Scalable implementation plan

Design principle: **extensible JournalEntry + a section registry**, so new journal
features are *additive*.

- **Data:** a single `JournalEntry` per trade with typed core fields (reviewStatus,
  rating, tags, setupId, notes) + a flexible `meta` object for evolving qualitative
  data (emotions, checklist, lessons, mistakes). New qualitative field = new `meta`
  key, no migration on the frontend.
- **UI:** the diary panel renders from a **section registry**
  (`{ id, title, component, order }[]`). Adding "Emotions" or "Checklist" later =
  register a section; no rewrite of the detail view.
- **API:** everything behind a `journalApi` adapter (same pattern as the WS/candle
  layers), so real endpoints swap in without touching stores/components.

Phased delivery (each shippable):

- **Phase 1 — Trade Journal core (current APIs).** Journal module + nav; trade list
  with filters/search; Trade Review drawer with orders (view/add/edit), strategy
  assign. Fully backed by existing APIs. Journal-only annotations kept behind the
  adapter (disabled/placeholder until Phase 2 endpoints exist).
- **Phase 2 — Diary metadata.** Notes (trade-level + optional per-order), tags
  (library + assign), review status + rating. Needs the journal doc + tags APIs.
- **Phase 3 — Rich journaling.** Screenshots (upload), emotions, checklist, lessons/
  mistakes — all as registered sections + `meta` fields.
- **Phase 4 — Learning loop.** Journal-driven **Insights** (win-rate by tag/setup/
  emotion), **Playbook** of setups, calendar/heatmap. This is where the "diary →
  better decisions" payoff lands.

---

## Reports vs Journal — recommendation (decision #3)

**Recommendation: they coexist, but with reassigned responsibilities so there is
exactly ONE place to browse and inspect individual trades — the Journal.** Reports
becomes **analytics-only**.

Concretely:
- **Journal owns the per-trade surface:** the browsable/searchable trade list *and*
  the per-trade review/detail (orders + diary). Today's Reports → Trades table logic
  (list, order detail, add/edit order, group-assign) **moves into the Journal** and
  is reused — not duplicated.
- **Reports keeps aggregate analytics only:** P&L curve, win rate, by-strategy /
  by-symbol / by-broker charts. Its detailed trades *table* is retired in favour of
  a compact **"recent trades → Open in Journal"** link-out (so Reports stays a
  dashboard, not a second trade browser).

Why this scales best for the product goal (review → analyze → learn → improve):
- **One mental model, one destination.** "Review my trades" always means the Journal.
  Two trade lists (Reports + Journal) would confuse users and split the annotation
  workflow.
- **Journal features accrete cleanly.** Tags, review status, emotions, checklists,
  lessons, and later **Insights** (win-rate by tag/setup/emotion) all live where the
  trades live — Reports never bloats.
- **No data duplication.** Both read the same `/trades` data; Journal adds metadata.
  Eventually Reports' charts and Journal's Insights can even converge, but keeping
  Reports for broker/strategy P&L reporting now is a clean, low-risk split.
- **Not a hard "replace".** We don't delete Reports; we *narrow* it to analytics and
  *move* trade browsing to its natural home. Least disruption, clearest UX.

Rejected alternatives: *(a) Journal fully replaces Reports* — loses the dedicated
analytics dashboards traders expect. *(b) Both keep full trade tables* — duplicative,
splits journaling, doesn't scale.

---

## Locked decisions

1. **`tradeId`** — stable string from `/trades` (e.g.
   `U31BPAPER-TRADE_BTC_08JUL26_PE_61800_DELT`); all journal metadata keys to it. ✓
2. **Notes** — trade-level now; per-order pre-provisioned for later (no refactor). ✓
3. **Location** — dedicated `Journal` module owns trade browsing + review; Reports
   narrows to analytics-only with a link-out. ✓

Next: implement **Phase 1** (trade list + review drawer + order management via the
existing three APIs), step by step.
