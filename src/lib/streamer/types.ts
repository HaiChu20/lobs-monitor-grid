export type Status = "UP" | "DEGRADED" | "DOWN";

export type Channel =
  | "depth"
  | "bookTicker"
  | "trade"
  | "aggTrade"
  | "markPrice"
  | "forceOrder"
  | "snapshot";

export interface FleetSummary {
  up: number;
  degraded: number;
  down: number;
  symbols: number;
  msgs_per_s: number;
  open_incidents: number;
  updated_at: string;
}

export interface ServiceSummary {
  id: string;
  name: string;
  status: Status;
  host: string;
  uptime_pct_24h: number;
  uptime_s: number;
  reconnects_1h: number;
  disk_free_pct: number;
  stale_streams: number;
  uptime_sparkline_24h: number[]; // 48 bins, 1 up / 0 down
}

export interface OverviewResponse {
  fleet: FleetSummary;
  services: ServiceSummary[];
}

export interface SymbolRow {
  symbol: string;
  staleness_s: Partial<Record<Channel, number>>;
  msgs_per_s: number;
  producing_files: boolean;
}

export interface ConnectionRow {
  name: string;
  channel: Channel;
  symbols: number;
  state: Status;
  reconnects_1h: number;
  reconnects_24h: number;
  last_connect: string;
  skew_ms: number;
}

/** One rate-limit budget/limit, exchange-specific. Rendered as a gauge when
 *  `limit` is set (e.g. connect-open, REST weight), else as a plain value with
 *  `unit` (e.g. Kraken's L3 subscribe backlog, which is a pacer not a quota). */
export interface BudgetItem {
  key: string; // "connect_open" | "rest_weight" | "l3_subscribe"
  label: string;
  used: number;
  limit?: number;
  window_s?: number;
  unit?: string;
}

export interface Series {
  msgs_per_s_1h: [number, number][];
  reconnects_24h: [number, number][];
  skew_ms_1h: [number, number][];
}

/** One status-page "line": a channel's drop history over the last 24h. */
export interface ChannelStatus {
  channel: Channel;
  state: Status; // UP if all its sockets are connected right now
  conns: number; // how many sharded sockets carry this channel
  reconnects_24h: number;
  buckets: number[]; // 48 bins over 24h; 1 = clean, 0 = a drop/reconnect in that bin
}

export interface ServiceDetail {
  id: string;
  name: string;
  status: Status;
  host: string;
  uptime_s: number;
  restarts_24h: number;
  next_rollover_s: number;
  channels: Channel[];
  symbols: SymbolRow[];
  connections: ConnectionRow[];
  channel_status: ChannelStatus[];
  budgets: BudgetItem[];
  series: Series;
}

export interface Incident {
  id: string;
  service: string;
  started: string;
  duration_s: number;
  cause: string;
  resolved: boolean;
}

export interface IncidentStats {
  uptime_pct: number;
  mtbf_s: number;
  mttr_s: number;
}

export interface IncidentsResponse {
  incidents: Incident[];
  stats: Record<string, IncidentStats>;
}

export const CHANNEL_THRESHOLDS: Record<Channel, { warn: number; crit: number }> = {
  depth: { warn: 2, crit: 5 },
  bookTicker: { warn: 2, crit: 5 },
  trade: { warn: 10, crit: 60 },
  aggTrade: { warn: 10, crit: 60 },
  markPrice: { warn: 3, crit: 10 },
  forceOrder: { warn: 120, crit: 600 },
  snapshot: { warn: 400, crit: 900 },
};

export const ALL_CHANNELS: Channel[] = [
  "depth",
  "bookTicker",
  "trade",
  "aggTrade",
  "markPrice",
  "forceOrder",
  "snapshot",
];
