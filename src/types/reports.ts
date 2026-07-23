// ── Trade (from vtrader_ledger via GET /trades) ─────────────────────────────

export interface Trade {
  trade_id: string
  user_id: number
  broker_name: string
  symbol_name: string
  group_name: string
  total_quantity: number
  avg_entry_price: number
  avg_exit_price: number | null
  realized_pnl: number
  unrealized_pnl: number
  status: string   // 'CLOSED' = fully closed; anything else (LONG, SHORT, OPEN, …) = running
  first_placed_time: string
  last_updated_time: string | null
  order_count: number
  orders?: TradeOrder[]
}

// ── Order (from GET /trades/orders?tradeId=) ─────────────────────────────────

export interface TradeOrder {
  id: number
  userId: number
  brokerName: string
  indexName: string
  symbolName: string
  orderId: string
  quantity: number
  orderStatus: string
  txnType: 'BUY' | 'SELL'
  orderType: string
  price: number
  placedTime: string
  groupName: string
}

// ── Sync order payload (POST /trades/orders) ─────────────────────────────────

export interface SyncOrderPayload {
  price: number
  brokerName: string
  txnType: 'BUY' | 'SELL'
  quantity: number
  placedTime: string
  symbolName: string
  orderStatus: string
  groupName: string
  orderType: string
}

// ── Update order payload (PUT /trades/orders/:id) ────────────────────────────

export interface UpdateOrderPayload {
  price: number
  id: number
  userId: number
  brokerName: string
  indexName: string
  symbolName: string
  orderId: string
  quantity: number
  orderStatus: string
  txnType: 'BUY' | 'SELL'
  orderType: string
  placedTime: string
  groupName: string
}

// ── Assign group payload (POST /trades/orders/group-assign) ──────────────────

export interface GroupAssignPayload {
  orderIds: number[]
  groupName: string
}

// ── Filter state ──────────────────────────────────────────────────────────────

export interface TradeFilters {
  brokerName: string
  groupName: string
  status: 'ALL' | 'OPEN' | 'CLOSED'
  symbolSearch: string
  dateFrom: string
  dateTo: string
  indexName: string   // '' = all; 'NIFTY' / 'BANKNIFTY' / …; 'EQ' = non-index
}

// ── Computed analytics ────────────────────────────────────────────────────────

export interface TradeStats {
  totalRealizedPnl: number
  totalUnrealizedPnl: number
  totalTrades: number
  closedTrades: number
  openTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  profitFactor: number
  avgPnlPerTrade: number
  bestTrade: number
  worstTrade: number
  largestWin: Trade | null
  largestLoss: Trade | null
}

export interface DailyPnl {
  date: string
  pnl: number
  cumulative: number
}

export interface GroupedPnl {
  name: string
  pnl: number
  trades: number
}
