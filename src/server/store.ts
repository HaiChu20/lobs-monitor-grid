// store.ts — the backend "brain". Runs inside the TanStack Start server (Nitro).
//
// It holds, IN MEMORY, one record per service. On every /ingest push it saves the
// raw snapshot; on every read it (re)derives the things a single snapshot can't
// contain — current status, uptime %, incidents, sparkline — from the history of
// pushes. This is the "cPouta = dumb sensor, Rahti = brain" split made concrete.
//
// In-memory means history is LOST on server restart/redeploy. That's fine for v1
// (Phase 5 swaps in SQLite on a PVC). The Discord alerts remain the durable backstop.

import type { IngestPayload, IngestServiceSnapshot, RawConnStat } from "@/lib/streamer/ingest";
import {
  type Channel,
  type ChannelStatus,
  type ConnectionRow,
  type FleetEvent,
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

type Cause = "vm_silent" | "process_down";

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
  /** last-seen cumulative reconnect count per connection name (to detect ticks up) */
  connCounters: Record<string, number>;
  /** timestamped reconnect ("drop") events per channel — powers the status lines */
  dropEvents: DropEvent[];
  /** last-seen {cumulative msgs, server-ms} per connection, for msgs/s rate */
  msgCounters: Record<string, { msgs: number; t: number }>;
  /** derived msgs/s per connection (latest interval) + the service total */
  connRates: Record<string, number>;
  msgsPerS: number;
}

interface DropEvent {
  channel: Channel;
  conn: string;
  t: number;
  error?: string; // the connection error that caused this drop
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
    svc.connCounters ??= {};
    svc.dropEvents ??= [];
    svc.msgCounters ??= {};
    svc.connRates ??= {};
    svc.msgsPerS ??= 0;
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
        connCounters: {},
        dropEvents: [],
        msgCounters: {},
        connRates: {},
        msgsPerS: 0,
      };
      store.services.set(snap.id, s);
    }
    s.name = snap.name ?? s.name;
    s.host = payload.host;
    if (snap.channels?.length) s.channels = snap.channels;
    s.lastSnapshot = snap;
    s.lastIngestAt = now;
    recordDrops(s, snap, now); // turn reconnect-counter ticks into timestamped drop events
    recordRates(s, snap, now); // diff msg counters → msgs/s per connection + service total
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

// ---- reconnect (drop) tracking ---------------------------------------------
/** Detect reconnect-counter ticks per connection → timestamped drop events. On
 *  first sight of a connection we adopt its cumulative count (no backfill), and a
 *  counter reset (streamer restart → count drops) logs nothing. */
function recordDrops(s: ServiceState, snap: IngestServiceSnapshot, now: number): void {
  for (const c of snap.conn_stats ?? []) {
    const prev = s.connCounters[c.name];
    if (prev === undefined) {
      s.connCounters[c.name] = c.reconnects;
      continue;
    }
    for (let i = prev; i < c.reconnects; i++) {
      s.dropEvents.push({ channel: c.channel, conn: c.name, t: now, error: c.last_error || undefined });
    }
    s.connCounters[c.name] = c.reconnects;
  }
  const cutoff = now - RETENTION_MS;
  if (s.dropEvents.length && s.dropEvents[0].t < cutoff) {
    s.dropEvents = s.dropEvents.filter((e) => e.t >= cutoff);
  }
}

/** Diff each connection's cumulative msg counter since the last push → msgs/s.
 *  Sum across connections = the service's throughput. Counter resets (streamer
 *  restart) or the first sighting yield 0 for that interval. */
function recordRates(s: ServiceState, snap: IngestServiceSnapshot, now: number): void {
  const rates: Record<string, number> = {};
  let total = 0;
  for (const c of snap.conn_stats ?? []) {
    if (typeof c.msgs !== "number") continue;
    const prev = s.msgCounters[c.name];
    if (prev && c.msgs >= prev.msgs && now > prev.t) {
      const rate = ((c.msgs - prev.msgs) * 1000) / (now - prev.t);
      rates[c.name] = Math.round(rate);
      total += rate;
    }
    s.msgCounters[c.name] = { msgs: c.msgs, t: now };
  }
  s.connRates = rates;
  s.msgsPerS = Math.round(total);
}

function dropsInWindow(s: ServiceState, now: number, windowMs: number, channel?: Channel): number {
  const from = now - windowMs;
  let n = 0;
  for (const e of s.dropEvents) if (e.t >= from && (!channel || e.channel === channel)) n++;
  return n;
}

function connDropsInWindow(s: ServiceState, now: number, windowMs: number, conn: string): number {
  const from = now - windowMs;
  let n = 0;
  for (const e of s.dropEvents) if (e.t >= from && e.conn === conn) n++;
  return n;
}

// ---- status derivation ------------------------------------------------------
// Health is judged at the CONNECTION + HOST level, not per-symbol: sparse channels
// (e.g. forceOrder) make "seconds since last message" a bad alarm. A calm market
// is UP, not DEGRADED.
const BUDGET_WARN_FRAC = 0.8; // connect-open budget usage that signals reconnect pressure
const DISK_WARN_PCT = 10; // free-disk % floor
const RECONNECT_STORM_1H = 20; // reconnects/hour that signal a flapping conn (needs stats op)

/** Alive-but-degraded check (never DOWN — DOWN comes from active/dead-man). */
function healthStatus(snap: IngestServiceSnapshot, reconnects1h: number): Status {
  const b = snap.budgets?.find((x) => x.key === "connect_open");
  if (b && b.limit && b.used / b.limit > BUDGET_WARN_FRAC) return "DEGRADED";
  if (snap.disk_free_pct != null && snap.disk_free_pct < DISK_WARN_PCT) return "DEGRADED";
  if (reconnects1h > RECONNECT_STORM_1H) return "DEGRADED"; // flapping connections
  return "UP";
}

/** Recompute a service's status at time `now`, recording transitions + incidents. */
function evaluate(s: ServiceState, now: number): void {
  let status: Status;
  let cause: Cause = "process_down";
  if (now - s.lastIngestAt > DEAD_MS) {
    status = "DOWN";
    cause = "vm_silent";
  } else if (!s.lastSnapshot || !s.lastSnapshot.active) {
    status = "DOWN";
    cause = "process_down";
  } else {
    status = healthStatus(s.lastSnapshot, dropsInWindow(s, now, 3600_000));
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
      producing_files: Object.keys(staleness_s).length > 0,
    };
  });
}

// ---- connection + status-line derivation ------------------------------------
const STATUS_BINS = 48; // 48 half-hour bins over 24h for the status lines

function connState(state: string): Status {
  return state === "connected" ? "UP" : state === "reconnecting" ? "DOWN" : "DEGRADED";
}

/** The Connections table: one row per sharded socket, with reconnect rates from
 *  the drop-event history. */
function deriveConnections(s: ServiceState, now: number): ConnectionRow[] {
  return (s.lastSnapshot?.conn_stats ?? []).map((c) => ({
    name: c.name,
    channel: c.channel,
    symbols: c.symbols,
    state: connState(c.state),
    reconnects_1h: connDropsInWindow(s, now, 3600_000, c.name),
    reconnects_24h: connDropsInWindow(s, now, 24 * 3600_000, c.name),
    msgs_per_s: s.connRates[c.name] ?? 0,
    last_connect: c.last_connect_ns ? new Date(c.last_connect_ns / 1e6).toISOString() : new Date(now).toISOString(),
  }));
}

/** The status lines: one per channel, `windowMs` split into 48 bins, each bin
 *  holding the NUMBER of drops in it (0 = clean). Client colours by count. */
function deriveChannelStatus(s: ServiceState, now: number, windowMs: number): ChannelStatus[] {
  const byChannel = new Map<Channel, RawConnStat[]>();
  for (const c of s.lastSnapshot?.conn_stats ?? []) {
    const arr = byChannel.get(c.channel) ?? [];
    arr.push(c);
    byChannel.set(c.channel, arr);
  }
  const channels = s.channels.length ? s.channels : [...byChannel.keys()];
  const binMs = windowMs / STATUS_BINS;
  const start = now - windowMs;
  return channels.map((channel) => {
    const conns = byChannel.get(channel) ?? [];
    const anyDown = conns.some((c) => c.state === "reconnecting");
    const allDown = conns.length > 0 && conns.every((c) => c.state !== "connected");
    const buckets = new Array<number>(STATUS_BINS).fill(0);
    for (const e of s.dropEvents) {
      if (e.channel !== channel || e.t < start) continue;
      const idx = Math.min(STATUS_BINS - 1, Math.floor((e.t - start) / binMs));
      if (idx >= 0) buckets[idx]++;
    }
    if (anyDown) buckets[STATUS_BINS - 1] = Math.max(buckets[STATUS_BINS - 1], 1); // live outage
    return {
      channel,
      state: allDown ? "DOWN" : anyDown ? "DEGRADED" : "UP",
      conns: conns.length,
      reconnects_24h: dropsInWindow(s, now, 24 * 3600_000, channel),
      buckets,
    };
  });
}

// ---- endpoint builders (shapes come straight from types.ts) -----------------
export function buildOverview(windowMs = 24 * 3600_000): OverviewResponse {
  const now = Date.now();
  evaluateAll(now);
  const services: ServiceSummary[] = [...store.services.values()].map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    host: s.host,
    uptime_pct_24h: uptimePct(s, now, 24 * 3600_000),
    uptime_s: uptimeSeconds(s, now),
    reconnects_1h: dropsInWindow(s, now, 3600_000), // real, from drop events
    drops_24h: dropsInWindow(s, now, 24 * 3600_000),
    msgs_per_s: s.msgsPerS,
    disk_free_pct: s.lastSnapshot?.disk_free_pct ?? 0,
    uptime_sparkline_24h: sparkline24h(s, now),
    channel_status: deriveChannelStatus(s, now, windowMs),
  }));
  services.sort((a, b) => a.name.localeCompare(b.name));

  const up = services.filter((s) => s.status === "UP").length;
  const degraded = services.filter((s) => s.status === "DEGRADED").length;
  const down = services.filter((s) => s.status === "DOWN").length;
  const symbols = [...store.services.values()].reduce(
    (a, s) => a + Object.keys(s.lastSnapshot?.symbols ?? {}).length,
    0,
  );
  const msgs_per_s = [...store.services.values()].reduce((a, s) => a + s.msgsPerS, 0);
  const open_incidents = [...store.services.values()].reduce(
    (a, s) => a + s.incidents.filter((i) => !i.resolved).length,
    0,
  );

  return {
    fleet: { up, degraded, down, symbols, msgs_per_s, open_incidents, updated_at: new Date(now).toISOString() },
    services,
  };
}

export function buildServiceDetail(id: string, windowMs = 24 * 3600_000): ServiceDetail | null {
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
    msgs_per_s: s.msgsPerS,
    channels: s.channels,
    symbols: symbolRows(s.lastSnapshot),
    connections: deriveConnections(s, now),
    channel_status: deriveChannelStatus(s, now, windowMs),
    budgets: s.lastSnapshot?.budgets ?? [],
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
    const dropCount = dropsInWindow(s, now, windowMs);
    stats[s.id] = {
      uptime_pct: uptimePct(s, now, windowMs),
      incidents: count,
      mtbf_s: count > 0 ? Math.floor(windowMs / 1000 / count) : 0,
      mttr_s: count > 0 ? Math.floor(totalDown / count) : 0,
      drops: dropCount,
      mtbd_s: dropCount > 0 ? Math.floor(windowMs / 1000 / dropCount) : 0,
    };
  }
  incidents.sort((a, b) => Date.parse(b.started) - Date.parse(a.started));

  // Unified activity feed: incidents (outages) + individual connection drops.
  const events: FleetEvent[] = [];
  for (const s of store.services.values()) {
    for (const i of s.incidents) {
      if (Date.parse(i.started) < from && i.resolved) continue;
      events.push({
        id: i.id,
        kind: "incident",
        service: i.service,
        t: i.started,
        cause: i.cause,
        duration_s: i.resolved ? i.duration_s : Math.round((now - Date.parse(i.started)) / 1000),
        resolved: i.resolved,
      });
    }
    for (const d of s.dropEvents) {
      if (d.t < from) continue;
      events.push({
        id: `drop_${s.id}_${d.conn}_${d.t}`,
        kind: "drop",
        service: s.id,
        t: new Date(d.t).toISOString(),
        cause: "ws_drop",
        channel: d.channel,
        conn: d.conn,
        error: d.error,
      });
    }
  }
  events.sort((a, b) => Date.parse(b.t) - Date.parse(a.t));

  return { incidents, events: events.slice(0, 300), stats };
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
