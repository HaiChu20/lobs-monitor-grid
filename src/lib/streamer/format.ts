import type { Channel, Status } from "./types";
import { CHANNEL_THRESHOLDS } from "./types";

export function fmtDuration(s: number): string {
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return `${d}d ${h}h`;
}

export function fmtRelative(iso: string): string {
  const diff = (Date.now() - +new Date(iso)) / 1000;
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function fmtExact(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export type Sev = "ok" | "warn" | "crit" | "off";

export function stalenessSev(ch: Channel, s: number | undefined): Sev {
  if (s === undefined) return "off";
  const t = CHANNEL_THRESHOLDS[ch];
  if (s <= t.warn) return "ok";
  if (s <= t.crit) return "warn";
  return "crit";
}

export function sevToBg(sev: Sev): string {
  switch (sev) {
    case "ok":
      return "bg-[--status-up]";
    case "warn":
      return "bg-[--status-degraded]";
    case "crit":
      return "bg-[--status-down]";
    case "off":
      return "bg-[--surface-3]";
  }
}

export function statusColor(s: Status): string {
  return s === "UP"
    ? "var(--status-up)"
    : s === "DEGRADED"
      ? "var(--status-degraded)"
      : "var(--status-down)";
}
