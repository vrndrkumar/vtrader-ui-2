// ── Engine registry ──────────────────────────────────────────────────────────
// Lets the single shared toolbar act on the ACTIVE panel's chart engine without
// prop-drilling. Each ChartPanel registers/unregisters its engine by panel id.

import type { ChartEngine } from './ChartEngine'

const registry = new Map<string, ChartEngine>()

export const engineRegistry = {
  set: (panelId: string, engine: ChartEngine) => registry.set(panelId, engine),
  get: (panelId: string) => registry.get(panelId),
  delete: (panelId: string) => registry.delete(panelId),
}
