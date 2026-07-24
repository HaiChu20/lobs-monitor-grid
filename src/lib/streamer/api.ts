import {
  mockAllSymbols,
  mockIncidents,
  mockOverview,
  mockServiceDetail,
} from "./mock";
import type { IncidentsResponse, OverviewResponse, ServiceDetail } from "./types";

// Swap this to your real backend base URL to go live.
export const API_BASE = "";
export const USE_MOCK = !API_BASE;

const REAL_DELAY = 120;

async function fake<T>(v: T): Promise<T> {
  await new Promise((r) => setTimeout(r, REAL_DELAY));
  return v;
}

export async function getOverview(): Promise<OverviewResponse> {
  if (USE_MOCK) return fake(mockOverview());
  const r = await fetch(`${API_BASE}/api/overview`);
  if (!r.ok) throw new Error(`overview ${r.status}`);
  return r.json();
}

export async function getServiceDetail(id: string): Promise<ServiceDetail> {
  if (USE_MOCK) {
    const m = mockServiceDetail(id);
    if (!m) throw new Error("Service not found");
    return fake(m);
  }
  const r = await fetch(`${API_BASE}/api/services/${id}`);
  if (!r.ok) throw new Error(`service ${r.status}`);
  return r.json();
}

export async function getIncidents(windowDays: number): Promise<IncidentsResponse> {
  if (USE_MOCK) return fake(mockIncidents(windowDays));
  const r = await fetch(`${API_BASE}/api/incidents?window=${windowDays}d`);
  if (!r.ok) throw new Error(`incidents ${r.status}`);
  return r.json();
}

export type SymbolFleetRow = ReturnType<typeof mockAllSymbols>[number];

export async function getAllSymbols(): Promise<SymbolFleetRow[]> {
  if (USE_MOCK) return fake(mockAllSymbols());
  // Real endpoint would be added here.
  const r = await fetch(`${API_BASE}/api/symbols`);
  if (!r.ok) throw new Error(`symbols ${r.status}`);
  return r.json();
}

export const POLL_MS = 10_000;
