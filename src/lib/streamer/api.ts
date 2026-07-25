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

export function getOverview(): Promise<OverviewResponse> {
  return getJSON<OverviewResponse>("/api/overview");
}

export function getServiceDetail(id: string): Promise<ServiceDetail> {
  return getJSON<ServiceDetail>(`/api/services/${encodeURIComponent(id)}`);
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
