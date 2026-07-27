// ingest.ts — the contract for what a cPouta "status-agent" POSTs to /ingest.
//
// This is deliberately a DUMB snapshot: the agent only reports what it can read
// *right now* on the VM (the control-server `list` op, systemctl, df, the budget
// file). All history/aggregation (uptime %, incidents, status) is derived on the
// server — see src/server/store.ts. Keeping this shape close to the raw `list`
// output means the real agent (Phase 2) stays a ~15-line script.

import type { BudgetItem, Channel, ConnectionRow } from "./types";

/** Raw per-connection counters from the streamer `stats` op (cumulative since
 *  start). The dashboard diffs these over time to derive reconnect rates + the
 *  per-channel status timeline. */
export interface RawConnStat {
  name: string; // e.g. "futures:depth-1"
  channel: Channel;
  symbols: number;
  state: string; // "connected" | "reconnecting" | "init"
  connects: number;
  reconnects: number; // cumulative, failure-driven (excludes midnight rotation)
  msgs: number; // cumulative frames received (dashboard diffs → msgs/s)
  last_connect_ns: number;
}

/** One service (e.g. binance-futures) as seen on the VM at one instant. */
export interface IngestServiceSnapshot {
  /** stable id, e.g. "binance-futures" — must match across pushes */
  id: string;
  /** display name, e.g. "Binance Futures" (optional; derived from id if absent) */
  name?: string;
  /** systemctl is-active === "active" */
  active: boolean;
  /** disk free % on the data volume (from `df`) */
  disk_free_pct?: number;
  /** channels this service runs — becomes the heatmap columns */
  channels?: Channel[];
  /** exchange-specific rate-limit budgets (connect-open, REST weight, L3 pacer …) */
  budgets?: BudgetItem[];
  /**
   * Straight from the control-server `list` op:
   *   { "BTCUSDT": { "depth": 0.2, "bookTicker": 0.1, "snapshot": 12.0 }, ... }
   * A value is seconds-since-last-message; null means "never seen since subscribe".
   */
  symbols: Record<string, Partial<Record<Channel, number | null>>>;

  // ---- per-connection reliability (from the streamer `stats` op) ----
  /** raw cumulative counters per socket — the dashboard derives rates + timeline */
  conn_stats?: RawConnStat[];
  /** (legacy/unused) pre-derived rows */
  connections?: ConnectionRow[];
  /** per-symbol message rate, e.g. { "BTCUSDT": 320 } */
  msgs_per_s?: Record<string, number>;
}

/** One POST from one VM's agent. A VM may host several services. */
export interface IngestPayload {
  /** the VM this came from, e.g. "cpouta-vm-1" */
  host: string;
  /** agent wall-clock ISO time (optional; server uses its own receive time) */
  ts?: string;
  services: IngestServiceSnapshot[];
}
