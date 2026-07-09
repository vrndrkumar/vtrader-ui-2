// ── Interpret the Place Order response ───────────────────────────────────────
// The API returns HTTP 200 with { status: true, data: {...} } even when the
// broker REJECTS the order (data.orderStatus === "error", orderId "null", and a
// rejectionRegion/reason). Success must be judged from the order status, not the
// HTTP envelope.

export interface ParsedOrder {
  ok: boolean
  status?: string
  orderId?: string
  message?: string
}

const REJECT = /error|reject|cancel|fail/i

function cleanReason(r?: unknown): string {
  if (!r) return 'Order rejected'
  // Strip a leading risk-colour prefix like "RED:" / "GREEN:".
  return String(r).replace(/^(RED|GREEN|AMBER|YELLOW):\s*/i, '').trim() || 'Order rejected'
}

function parseOne(o: Record<string, unknown>): ParsedOrder {
  const status = String(o.orderStatus ?? o.status ?? '').trim()
  const reason = o.rejectionRegion ?? o.rejectionReason ?? o.message ?? o.remarks
  const oid = o.orderId
  const badId = oid == null || String(oid).toLowerCase() === 'null' || oid === '' || oid === '0'
  const rejected = REJECT.test(status) || (reason != null && reason !== '' && badId)
  return {
    ok: !rejected,
    status: status || undefined,
    orderId: oid != null ? String(oid) : undefined,
    message: rejected ? cleanReason(reason) : undefined,
  }
}

/** Normalize any envelope shape to a single pass/fail verdict + message. */
export function interpretOrderResponse(raw: unknown): ParsedOrder {
  let node: unknown = raw
  if (node && typeof node === 'object' && 'data' in node) node = (node as Record<string, unknown>).data
  if (Array.isArray(node)) {
    const parts = node.map((n) => parseOne((n ?? {}) as Record<string, unknown>))
    return parts.find((p) => !p.ok) ?? parts[0] ?? { ok: true }
  }
  if (node && typeof node === 'object') return parseOne(node as Record<string, unknown>)
  return { ok: true }
}
