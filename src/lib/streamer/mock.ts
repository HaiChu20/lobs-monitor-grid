import type {
  Channel,
  ConnectionRow,
  Incident,
  IncidentsResponse,
  OverviewResponse,
  ServiceDetail,
  ServiceSummary,
  Status,
  SymbolRow,
} from "./types";
import { ALL_CHANNELS, CHANNEL_THRESHOLDS } from "./types";

// Deterministic PRNG so mock data is stable per render but evolves over time
function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const SERVICE_DEFS: Array<{ id: string; name: string; host: string; symbols: string[]; channels: Channel[] }> = [
  {
    id: "binance-futures",
    name: "Binance Futures",
    host: "cpouta-vm-1",
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "MATICUSDT", "DOTUSDT", "LTCUSDT", "TRXUSDT", "ARBUSDT"],
    channels: ["depth", "bookTicker", "trade", "aggTrade", "markPrice", "forceOrder", "snapshot"],
  },
  {
    id: "binance-spot",
    name: "Binance Spot",
    host: "cpouta-vm-2",
    symbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "MATICUSDT", "SHIBUSDT", "ATOMUSDT"],
    channels: ["depth", "bookTicker", "trade", "aggTrade", "snapshot"],
  },
  {
    id: "kraken",
    name: "Kraken",
    host: "cpouta-vm-3",
    symbols: ["BTC/USD", "ETH/USD", "SOL/USD", "XRP/USD", "ADA/USD", "DOT/USD", "LINK/USD", "ATOM/USD"],
    channels: ["depth", "bookTicker", "trade", "snapshot"],
  },
  {
    id: "okx",
    name: "OKX",
    host: "cpouta-vm-4",
    symbols: ["BTC-USDT", "ETH-USDT", "SOL-USDT", "XRP-USDT", "BNB-USDT", "DOGE-USDT", "AVAX-USDT"],
    channels: ["depth", "bookTicker", "trade", "aggTrade", "markPrice", "snapshot"],
  },
];

const CAUSES = ["reconnect_storm", "rate_limit", "network_flap", "vm_crash", "gap_in_stream", "corrupt_frames"];

function bucket(nowBin: number) {
  return Math.floor(nowBin / 10);
}

function stalenessFor(rand: () => number, ch: Channel, health: "good" | "warn" | "crit" | "off"): number | undefined {
  if (health === "off") return undefined;
  const t = CHANNEL_THRESHOLDS[ch];
  if (health === "good") return +(rand() * t.warn * 0.5).toFixed(1);
  if (health === "warn") return +(t.warn + rand() * (t.crit - t.warn)).toFixed(1);
  return +(t.crit + rand() * t.crit * 1.5).toFixed(1);
}

function computeServiceStatus(symbols: SymbolRow[]): { status: Status; stale: number } {
  let anyRed = false;
  let staleCount = 0;
  for (const s of symbols) {
    for (const ch of Object.keys(s.staleness_s) as Channel[]) {
      const v = s.staleness_s[ch];
      if (v === undefined) continue;
      const t = CHANNEL_THRESHOLDS[ch];
      if (v > t.crit) {
        anyRed = true;
        staleCount++;
      } else if (v > t.warn) {
        staleCount++;
      }
    }
  }
  if (anyRed) return { status: "DEGRADED", stale: staleCount };
  if (staleCount > 0) return { status: "DEGRADED", stale: staleCount };
  return { status: "UP", stale: 0 };
}

function buildDetail(defIdx: number, tickSeed: number): ServiceDetail {
  const def = SERVICE_DEFS[defIdx];
  const rand = seeded(defIdx * 9973 + tickSeed);
  // give kraken degraded, others mostly up; occasionally something red
  const forcedHealth: "good" | "warn" | "crit" | "off" =
    defIdx === 2 ? "warn" : rand() < 0.05 ? "warn" : "good";

  const symbols: SymbolRow[] = def.symbols.map((sym, i) => {
    const staleness: Partial<Record<Channel, number>> = {};
    for (const ch of def.channels) {
      let h: "good" | "warn" | "crit" | "off" = "good";
      const r = rand();
      if (forcedHealth === "warn" && r < 0.15) h = "warn";
      else if (r < 0.02) h = "crit";
      else if (r < 0.08) h = "warn";
      // snapshot naturally slow
      if (ch === "snapshot" && rand() < 0.3) h = "warn";
      const v = stalenessFor(rand, ch, h);
      if (v !== undefined) staleness[ch] = v;
    }
    return {
      symbol: sym,
      staleness_s: staleness,
      msgs_per_s: Math.round(80 + rand() * 400),
      producing_files: rand() > 0.05,
    };
  });

  const { status, stale } = computeServiceStatus(symbols);
  void stale;

  const connections: ConnectionRow[] = def.channels.map((ch, i) => ({
    name: `${def.id.split("-")[0]}:${ch}-${i + 1}`,
    channel: ch,
    symbols: Math.ceil(def.symbols.length / def.channels.length) + Math.floor(rand() * 3),
    state: rand() < 0.9 ? "UP" : "DEGRADED",
    reconnects_1h: Math.floor(rand() * 3),
    reconnects_24h: Math.floor(rand() * 12),
    corrupt: Math.floor(rand() * 4),
    last_connect: new Date(Date.now() - Math.floor(rand() * 3600_000)).toISOString(),
    skew_ms: Math.floor(rand() * 200),
  }));

  const now = Date.now();
  const series = {
    msgs_per_s_1h: Array.from({ length: 60 }, (_, i) => {
      const t = now - (59 - i) * 60_000;
      return [t, Math.round(6000 + Math.sin(i / 4) * 900 + rand() * 400)] as [number, number];
    }),
    reconnects_24h: Array.from({ length: 24 }, (_, i) => {
      const t = now - (23 - i) * 3600_000;
      return [t, Math.floor(rand() * 4)] as [number, number];
    }),
    skew_ms_1h: Array.from({ length: 60 }, (_, i) => {
      const t = now - (59 - i) * 60_000;
      return [t, Math.round(30 + Math.sin(i / 6) * 20 + rand() * 40)] as [number, number];
    }),
  };

  return {
    id: def.id,
    name: def.name,
    status,
    host: def.host,
    uptime_s: 82440 + Math.floor(rand() * 40000),
    restarts_24h: Math.floor(rand() * 3),
    next_rollover_s: Math.floor(20_000 + rand() * 60_000),
    channels: def.channels,
    symbols,
    connections,
    budgets: {
      connect_open: { used: Math.floor(rand() * 240), limit: 250, window_s: 300 },
      rest_weight: { used: Math.floor(rand() * 1100), limit: 1200 },
    },
    series,
  };
}

function tickSeed() {
  // change every 10s so poll shows movement
  return bucket(Date.now());
}

export function mockOverview(): OverviewResponse {
  const ts = tickSeed();
  const services: ServiceSummary[] = SERVICE_DEFS.map((def, i) => {
    const d = buildDetail(i, ts);
    const rand = seeded(i * 131 + ts);
    return {
      id: def.id,
      name: def.name,
      status: d.status,
      host: def.host,
      uptime_pct_24h: +(99 + rand()).toFixed(2) > 100 ? 100 : +(99 + rand()).toFixed(2),
      uptime_s: d.uptime_s,
      reconnects_1h: d.connections.reduce((a, c) => a + c.reconnects_1h, 0),
      disk_free_pct: Math.floor(40 + rand() * 55),
      stale_streams: d.symbols.reduce((acc, s) => {
        return (
          acc +
          Object.entries(s.staleness_s).filter(([ch, v]) => {
            const t = CHANNEL_THRESHOLDS[ch as Channel];
            return v !== undefined && v > t.warn;
          }).length
        );
      }, 0),
      uptime_sparkline_24h: Array.from({ length: 48 }, () => (rand() < 0.97 ? 1 : 0)),
    };
  });

  const up = services.filter((s) => s.status === "UP").length;
  const degraded = services.filter((s) => s.status === "DEGRADED").length;
  const down = services.filter((s) => s.status === "DOWN").length;
  const symbols = SERVICE_DEFS.reduce((a, d) => a + d.symbols.length, 0);

  return {
    fleet: {
      up,
      degraded,
      down,
      symbols,
      msgs_per_s: 8000 + (ts % 800),
      open_incidents: degraded + down,
      updated_at: new Date().toISOString(),
    },
    services,
  };
}

export function mockServiceDetail(id: string): ServiceDetail | null {
  const idx = SERVICE_DEFS.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  return buildDetail(idx, tickSeed());
}

export function mockIncidents(windowDays: number): IncidentsResponse {
  const rand = seeded(windowDays * 7919);
  const now = Date.now();
  const count = windowDays === 1 ? 3 : windowDays === 7 ? 12 : 34;
  const incidents: Incident[] = Array.from({ length: count }, (_, i) => {
    const def = SERVICE_DEFS[Math.floor(rand() * SERVICE_DEFS.length)];
    const durS = Math.floor(60 + rand() * 1800);
    const startedAgo = Math.floor(rand() * windowDays * 86400_000);
    const resolved = rand() > 0.1 || startedAgo > 3600_000;
    return {
      id: `inc_${windowDays}_${i}`,
      service: def.id,
      started: new Date(now - startedAgo).toISOString(),
      duration_s: resolved ? durS : Math.floor((Date.now() - (now - startedAgo)) / 1000),
      cause: CAUSES[Math.floor(rand() * CAUSES.length)],
      resolved,
    };
  }).sort((a, b) => +new Date(b.started) - +new Date(a.started));

  const stats: Record<string, { uptime_pct: number; mtbf_s: number; mttr_s: number }> = {};
  for (const def of SERVICE_DEFS) {
    const svc = incidents.filter((i) => i.service === def.id);
    const totalDown = svc.reduce((a, i) => a + i.duration_s, 0);
    const windowS = windowDays * 86400;
    stats[def.id] = {
      uptime_pct: +Math.max(0, 100 - (totalDown / windowS) * 100).toFixed(2),
      mtbf_s: svc.length > 1 ? Math.floor(windowS / svc.length) : windowS,
      mttr_s: svc.length ? Math.floor(totalDown / svc.length) : 0,
    };
  }
  return { incidents, stats };
}

export function mockAllSymbols(): Array<
  SymbolRow & { service: string; serviceId: string; worst_staleness: number; channels_active: number }
> {
  const rows: Array<SymbolRow & { service: string; serviceId: string; worst_staleness: number; channels_active: number }> = [];
  const ts = tickSeed();
  SERVICE_DEFS.forEach((def, i) => {
    const detail = buildDetail(i, ts);
    for (const s of detail.symbols) {
      const values = Object.values(s.staleness_s).filter((v): v is number => v !== undefined);
      rows.push({
        ...s,
        service: def.name,
        serviceId: def.id,
        worst_staleness: values.length ? Math.max(...values) : 0,
        channels_active: values.length,
      });
    }
  });
  return rows;
}

export const SERVICE_IDS = SERVICE_DEFS.map((d) => d.id);
