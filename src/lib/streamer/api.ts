import type { IncidentsResponse, OverviewResponse, ServiceDetail, SymbolRow } from "./types";

// The backend is served at the same origin under /api/* by the TanStack Start
// server (see src/server/handler.ts). Override only if the API is on another host.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/** How often the UI re-polls (ms). Agents push ~every 5s, so 5s keeps it live. */
export const POLL_MS = 5_000;

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json() as Promise<T>;
}

export type Timeframe = "1h" | "6h" | "24h" | "7d";

/** Timeframe options for the channel-status toggle. `ms` drives bin labels. */
export const TIMEFRAMES: { value: Timeframe; ms: number }[] = [
  { value: "1h", ms: 3600_000 },
  { value: "6h", ms: 6 * 3600_000 },
  { value: "24h", ms: 24 * 3600_000 },
  { value: "7d", ms: 7 * 24 * 3600_000 },
];

export function getOverview(window: Timeframe = "24h"): Promise<OverviewResponse> {
  return getJSON<OverviewResponse>(`/api/overview?window=${window}`);
}

export function getServiceDetail(id: string, window: Timeframe = "24h"): Promise<ServiceDetail> {
  return getJSON<ServiceDetail>(`/api/services/${encodeURIComponent(id)}?window=${window}`);
}

export function getIncidents(windowDays: number): Promise<IncidentsResponse> {
  return getJSON<IncidentsResponse>(`/api/incidents?window=${windowDays}d`);
}

export type SymbolFleetRow = SymbolRow & {
  service: string;
  serviceId: string;
  worst_staleness: number;
  channels_active: number;
};

export function getAllSymbols(): Promise<SymbolFleetRow[]> {
  return getJSON<SymbolFleetRow[]>("/api/symbols");
}
