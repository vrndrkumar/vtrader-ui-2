// Removed: the Option Simulator no longer fetches index candles. The option-chain
// snapshot at time T is the single source of price/spot (see provider.ts, store.ts,
// mockProvider.ts). This stub remains only to avoid a dangling module reference.
export {}
