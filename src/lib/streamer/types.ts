export type Status = "UP" | "DEGRADED" | "DOWN";

// Channel names vary by exchange (Binance depth/bookTicker…, Kraken book/level3,
// OKX books/trades…), so this is just a label.
export type Channel = string;

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
  drops_24h: number;
  msgs_per_s: number;
  disk_free_pct: number;
  uptime_sparkline_24h: number[]; // 48 bins, 1 up / 0 down
  channel_status: ChannelStatus[]; // per-channel drop lines, shown on the landing page
}

export interface OverviewResponse {
  fleet: FleetSummary;
  services: ServiceSummary[];
}

export interface SymbolRow {
  symbol: string;
  staleness_s: Partial<Record<Channel, number>>;
  producing_files: boolean;
}

export interface ConnectionRow {
  name: string;
  channel: Channel;
  symbols: number;
  state: Status;
  reconnects_1h: number;
  reconnects_24h: number;
  msgs_per_s: number;
  last_connect: string;
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

/** One status-page "line": a channel's drop history, bucketed over the selected
 *  timeframe. Each bin holds the NUMBER of drops in it (0 = clean). */
export interface ChannelStatus {
  channel: Channel;
  state: Status; // UP if all its sockets are connected right now
  conns: number; // how many sharded sockets carry this channel
  reconnects_24h: number;
  buckets: number[]; // 48 bins over the requested window; value = drop count in that bin
}

export interface ServiceDetail {
  id: string;
  name: string;
  status: Status;
  host: string;
  uptime_s: number;
  restarts_24h: number;
  next_rollover_s: number;
  msgs_per_s: number;
  channels: Channel[];
  symbols: SymbolRow[];
  connections: ConnectionRow[];
  channel_status: ChannelStatus[];
  budgets: BudgetItem[];
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
  incidents: number; // outage count in the window ('—' in the UI when 0)
  mtbf_s: number;
  mttr_s: number;
  drops: number; // connection-drop count in the window
  mtbd_s: number; // mean time between drops (window ÷ drop count)
}

/** A unified activity entry: either a service outage (incident) or a single
 *  websocket connection drop. Powers the "Recent activity" feed. */
export interface FleetEvent {
  id: string;
  kind: "incident" | "drop";
  service: string; // service id
  t: string; // ISO time (incident start, or when the drop happened)
  cause: string; // incident: process_down/vm_silent; drop: "ws_drop"
  duration_s?: number; // incident only
  resolved?: boolean; // incident only
  channel?: string; // drop only
  conn?: string; // drop only
  error?: string; // drop only — the full WS error message
}

export interface IncidentsResponse {
  incidents: Incident[];
  events: FleetEvent[]; // incidents + connection drops, newest first
  stats: Record<string, IncidentStats>;
}

