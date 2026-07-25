// store.ts — the backend "brain". Runs inside the TanStack Start server (Nitro).
//
// It holds, IN MEMORY, one record per service. On every /ingest push it saves the
// raw snapshot; on every read it (re)derives the things a single snapshot can't
// contain — current status, uptime %, incidents, sparkline — from the history of
// pushes. This is the "cPouta = dumb sensor, Rahti = brain" split made concrete.
//
// In-memory means history is LOST on server restart/redeploy. That's fine for v1
// (Phase 5 swaps in SQLite on a PVC). The Discord alerts remain the durable backstop.

import type { IngestPayload, IngestServiceSnapshot } from "@/lib/streamer/ingest";
import {
  CHANNEL_THRESHOLDS,
  type Budgets,
  type Channel,
  type ConnectionRow,
  type Incident,
  type IncidentsResponse,
  type OverviewResponse,
  type ServiceDetail,
  type ServiceSummary,
  type Status,
  type SymbolRow,
} from "@/lib/streamer/types";
import { loadServices, saveNow, scheduleSave } from "./persist";

// ---- tuning knobs -----------------------------------------------------------
/** If we haven't heard from a service in this long, it's DOWN (dead-man switch).
 *  Agent pushes ~every 5s, so 20s = 4 missed pushes. */
const DEAD_MS = 20_000;
/** How long to keep incident history (memory + disk). Default 90 days. */
const RETENTION_MS = (Number(process.env.RETENTION_DAYS) || 90) * 24 * 3600_000;

type Cause = "vm_silent" | "process_down" | "stale_streams";

export interface ServiceState {
  id: string;
  name: string;
  host: string;
  channels: Channel[];
  lastSnapshot: IngestServiceSnapshot | null;
  lastIngestAt: number; // server clock (ms) — powers the dead-man switch
  status: Status;
  statusSince: number;
  /** append-only transition log; enough to reconstruct status at any past time */
  statusLog: Array<{ t: number; status: Status }>;
  incidents: Incident[];
  firstSeen: number;
}

interface Store {
  services: Map<string, ServiceState>;
}

// --- singleton (survives Vite HMR so state/timer aren't duplicated in dev) ----
const g = globalThis as unknown as {
  __streamerStore?: Store;
  __streamerTimer?: NodeJS.Timeout;
  __streamerSigterm?: boolean;
};
const store: Store = g.__streamerStore ?? (g.__streamerStore = createStore());

/** Create the store, rehydrating any services persisted to disk (Rahti PVC). */
function createStore(): Store {
  const s: Store = { services: new Map() };
  const now = Date.now();
  for (const svc of loadServices()) {
    // Grace after a *dashboard* restart: reset the dead-man clock so the
    // dashboard's own downtime isn't mis-attributed as a streamer outage. The
    // next real push (~5s) refreshes everything; a truly-gone streamer trips
    // the dead-man ~20s after boot, which is correct.
    svc.lastIngestAt = now;
    svc.statusLog ??= [];
    svc.incidents ??= [];
    s.services.set(svc.id, svc);
  }
  return s;
}

/** Persist the current services (debounced) — called on every mutation. */
function persist(): void {
  scheduleSave(() => [...store.services.values()]);
}

function prettyName(id: string): string {
  return id
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---- ingest -----------------------------------------------------------------
export function ingest(payload: IngestPayload): void {
  const now = Date.now();
  for (const snap of payload.services ?? []) {
    if (!snap?.id) continue;
    let s = store.services.get(snap.id);
    if (!s) {
      s = {
        id: snap.id,
        name: snap.name ?? prettyName(snap.id),
        host: payload.host,
        channels: snap.channels ?? inferChannels(snap),
        lastSnapshot: null,
        lastIngestAt: now,
        status: "UP",
        statusSince: now,
        statusLog: [],
        incidents: [],
        firstSeen: now,
      };
      store.services.set(snap.id, s);
    }
    s.name = snap.name ?? s.name;
    s.host = payload.host;
    if (snap.channels?.length) s.channels = snap.channels;
    s.lastSnapshot = snap;
    s.lastIngestAt = now;
    evaluate(s, now); // fold this reading into status/incidents immediately
  }
  persist(); // durably save latest snapshots + any transitions (debounced)
}

function inferChannels(snap: IngestServiceSnapshot): Channel[] {
  const set = new Set<Channel>();
  for (const chans of Object.values(snap.symbols ?? {})) {
    for (const ch of Object.keys(chans) as Channel[]) set.add(ch);
  }
  return [...set];
}

// ---- status derivation ------------------------------------------------------
/** Freshness-only verdict (never DOWN — DOWN comes from active/dead-man). */
function freshnessStatus(snap: IngestServiceSnapshot): { status: Status; stale: number } {
  let stale = 0;
  for (const chans of Object.values(snap.symbols ?? {})) {
    for (const [ch, v] of Object.entries(chans) as [Channel, number | null][]) {
      if (v == null) continue;
      const t = CHANNEL_THRESHOLDS[ch];
      if (t && v > t.warn) stale++;
    }
  }
  return { status: stale > 0 ? "DEGRADED" : "UP", stale };
}

/** Recompute a service's status at time `now`, recording transitions + incidents. */
function evaluate(s: ServiceState, now: number): void {
  let status: Status;
  let cause: Cause = "stale_streams";
  if (now - s.lastIngestAt > DEAD_MS) {
    status = "DOWN";
    cause = "vm_silent";
  } else if (!s.lastSnapshot || !s.lastSnapshot.active) {
    status = "DOWN";
    cause = "process_down";
  } else {
    status = freshnessStatus(s.lastSnapshot).status;
  }

  if (status === s.status) return; // no change

  // record the transition
  s.statusLog.push({ t: now, status });
  s.status = status;
  s.statusSince = now;
  pruneOld(s, now);

  // open/close incidents on the DOWN boundary
  if (status === "DOWN") {
    s.incidents.push({
      id: `inc_${s.id}_${now}`,
      service: s.id,
      started: new Date(now).toISOString(),
      duration_s: 0,
      cause,
      resolved: false,
    });
  } else {
    const open = s.incidents.find((i) => !i.resolved);
    if (open) {
      open.resolved = true;
      open.duration_s = Math.round((now - Date.parse(open.started)) / 1000);
    }
  }
  persist(); // a status change (incl. dead-man transitions from the timer) → save
}

function pruneOld(s: ServiceState, now: number): void {
  const cutoff = now - RETENTION_MS;
  s.statusLog = s.statusLog.filter((e) => e.t >= cutoff);
  s.incidents = s.incidents.filter((i) => !i.resolved || Date.parse(i.started) >= cutoff);
}

// ---- helpers to reconstruct facts over a window -----------------------------
/** Seconds a service spent DOWN within [now-windowMs, now]. */
function downSecondsInWindow(s: ServiceState, now: number, windowMs: number): number {
  const from = now - windowMs;
  let down = 0;
  for (const inc of s.incidents) {
    const start = Date.parse(inc.started);
    const end = inc.resolved ? start + inc.duration_s * 1000 : now;
    const lo = Math.max(start, from);
    const hi = Math.min(end, now);
    if (hi > lo) down += hi - lo;
  }
  return down / 1000;
}

function uptimePct(s: ServiceState, now: number, windowMs: number): number {
  const observed = Math.min(windowMs, now - s.firstSeen) || windowMs;
  const downS = downSecondsInWindow(s, now, windowMs);
  return +Math.max(0, 100 - (downS / (observed / 1000)) * 100).toFixed(2);
}

/** Continuous seconds up since the last recovery (0 if currently down). */
function uptimeSeconds(s: ServiceState, now: number): number {
  if (s.status === "DOWN") return 0;
  let lastRecovery = s.firstSeen;
  for (const inc of s.incidents) {
    if (inc.resolved) lastRecovery = Math.max(lastRecovery, Date.parse(inc.started) + inc.duration_s * 1000);
  }
  return Math.round((now - lastRecovery) / 1000);
}

/** 48 bins over 24h: 1 = up for the whole bin, 0 = any downtime in it. */
function sparkline24h(s: ServiceState, now: number): number[] {
  const bins = 48;
  const binMs = (24 * 3600_000) / bins;
  const start = now - 24 * 3600_000;
  return Array.from({ length: bins }, (_, i) => {
    const lo = start + i * binMs;
    const hi = lo + binMs;
    for (const inc of s.incidents) {
      const iStart = Date.parse(inc.started);
      const iEnd = inc.resolved ? iStart + inc.duration_s * 1000 : now;
      if (iEnd > lo && iStart < hi) return 0;
    }
    return 1;
  });
}

function staleStreams(snap: IngestServiceSnapshot | null): number {
  if (!snap) return 0;
  return freshnessStatus(snap).stale;
}

function nextRolloverSeconds(now: number): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return Math.round((next - now) / 1000);
}

/** Convert the raw `list` map into the frontend's SymbolRow[]. */
function symbolRows(snap: IngestServiceSnapshot | null): SymbolRow[] {
  if (!snap) return [];
  return Object.entries(snap.symbols ?? {}).map(([symbol, chans]) => {
    const staleness_s: Partial<Record<Channel, number>> = {};
    for (const [ch, v] of Object.entries(chans) as [Channel, number | null][]) {
      if (v != null) staleness_s[ch] = v; // null => omit => grey/not-subscribed in UI
    }
    return {
      symbol,
      staleness_s,
      msgs_per_s: snap.msgs_per_s?.[symbol] ?? 0, // 0 in v1 (no counters yet)
      producing_files: Object.keys(staleness_s).length > 0,
    };
  });
}

const EMPTY_BUDGETS: Budgets = {
  connect_open: { used: 0, limit: 250, window_s: 300 },
  rest_weight: { used: 0, limit: 1200 },
};

// ---- endpoint builders (shapes come straight from types.ts) -----------------
export function buildOverview(): OverviewResponse {
  const now = Date.now();
  evaluateAll(now);
  const services: ServiceSummary[] = [...store.services.values()].map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    host: s.host,
    uptime_pct_24h: uptimePct(s, now, 24 * 3600_000),
    uptime_s: uptimeSeconds(s, now),
    reconnects_1h: sumReconnects1h(s), // 0 in v1 (needs stats op)
    disk_free_pct: s.lastSnapshot?.disk_free_pct ?? 0,
    stale_streams: staleStreams(s.lastSnapshot),
    uptime_sparkline_24h: sparkline24h(s, now),
  }));
  services.sort((a, b) => a.name.localeCompare(b.name));

  const up = services.filter((s) => s.status === "UP").length;
  const degraded = services.filter((s) => s.status === "DEGRADED").length;
  const down = services.filter((s) => s.status === "DOWN").length;
  const symbols = [...store.services.values()].reduce(
    (a, s) => a + Object.keys(s.lastSnapshot?.symbols ?? {}).length,
    0,
  );
  const msgs_per_s = [...store.services.values()].reduce((a, s) => a + serviceMsgsPerS(s), 0);
  const open_incidents = [...store.services.values()].reduce(
    (a, s) => a + s.incidents.filter((i) => !i.resolved).length,
    0,
  );

  return {
    fleet: { up, degraded, down, symbols, msgs_per_s, open_incidents, updated_at: new Date(now).toISOString() },
    services,
  };
}

export function buildServiceDetail(id: string): ServiceDetail | null {
  const s = store.services.get(id);
  if (!s) return null;
  const now = Date.now();
  evaluate(s, now);
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    host: s.host,
    uptime_s: uptimeSeconds(s, now),
    restarts_24h: s.incidents.filter((i) => Date.parse(i.started) >= now - 24 * 3600_000).length,
    next_rollover_s: nextRolloverSeconds(now),
    channels: s.channels,
    symbols: symbolRows(s.lastSnapshot),
    connections: (s.lastSnapshot?.connections ?? []) as ConnectionRow[], // [] in v1
    budgets: { ...EMPTY_BUDGETS, ...(s.lastSnapshot?.budgets ?? {}) },
    series: { msgs_per_s_1h: [], reconnects_24h: [], skew_ms_1h: [] }, // filled in v2
  };
}

export function buildIncidents(windowDays: number): IncidentsResponse {
  const now = Date.now();
  evaluateAll(now);
  const windowMs = windowDays * 86400_000;
  const from = now - windowMs;

  const incidents: Incident[] = [];
  const stats: IncidentsResponse["stats"] = {};
  for (const s of store.services.values()) {
    const svcIncidents = s.incidents
      .filter((i) => Date.parse(i.started) >= from || !i.resolved)
      .map((i) => (i.resolved ? i : { ...i, duration_s: Math.round((now - Date.parse(i.started)) / 1000) }));
    incidents.push(...svcIncidents);

    const count = svcIncidents.length;
    const totalDown = downSecondsInWindow(s, now, windowMs);
    stats[s.id] = {
      uptime_pct: uptimePct(s, now, windowMs),
      mtbf_s: count > 0 ? Math.floor(windowMs / 1000 / count) : Math.floor(windowMs / 1000),
      mttr_s: count > 0 ? Math.floor(totalDown / count) : 0,
    };
  }
  incidents.sort((a, b) => Date.parse(b.started) - Date.parse(a.started));
  return { incidents, stats };
}

export function buildSymbols(): Array<
  SymbolRow & { service: string; serviceId: string; worst_staleness: number; channels_active: number }
> {
  const rows: Array<SymbolRow & { service: string; serviceId: string; worst_staleness: number; channels_active: number }> = [];
  for (const s of store.services.values()) {
    for (const row of symbolRows(s.lastSnapshot)) {
      const values = Object.values(row.staleness_s).filter((v): v is number => v !== undefined);
      rows.push({
        ...row,
        service: s.name,
        serviceId: s.id,
        worst_staleness: values.length ? Math.max(...values) : 0,
        channels_active: values.length,
      });
    }
  }
  return rows;
}

// ---- v2 placeholders (return 0/empty until the streamer stats op exists) ----
function sumReconnects1h(s: ServiceState): number {
  return (s.lastSnapshot?.connections ?? []).reduce((a, c) => a + (c.reconnects_1h ?? 0), 0);
}
function serviceMsgsPerS(s: ServiceState): number {
  const m = s.lastSnapshot?.msgs_per_s;
  return m ? Object.values(m).reduce((a, v) => a + v, 0) : 0;
}

function evaluateAll(now: number): void {
  for (const s of store.services.values()) evaluate(s, now);
}

// Background sweep so DOWN transitions are detected even when nobody is viewing
// the dashboard. Guarded so HMR doesn't stack timers.
if (!g.__streamerTimer) {
  g.__streamerTimer = setInterval(() => evaluateAll(Date.now()), 5000);
  // don't keep the process alive just for this timer
  (g.__streamerTimer as { unref?: () => void }).unref?.();
}

// Flush immediately on shutdown. OpenShift/Rahti sends SIGTERM before killing a
// pod, so the very latest state lands on the PVC even between debounced saves.
if (!g.__streamerSigterm && typeof process !== "undefined" && process.once) {
  g.__streamerSigterm = true;
  process.once("SIGTERM", () => saveNow([...store.services.values()]));
}

/** Test/dev helper: wipe all state. */
export function __reset(): void {
  store.services.clear();
}
