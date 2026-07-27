import type { CSSProperties } from "react";
import type { ChannelStatus } from "@/lib/streamer/types";

const BINS = 48;

/** Colour a bin by its drop count: 0 = green, else red deepening with count. */
function binStyle(count: number): CSSProperties {
  if (count === 0) return { background: "var(--status-up)", opacity: 0.8 };
  return { background: "var(--status-down)", opacity: Math.min(1, 0.5 + count * 0.15) };
}

/** "3h ago"-style label for bin i within a window of `totalMs`. */
function binLabel(i: number, totalMs: number): string {
  const perBinMs = totalMs / BINS;
  const mins = Math.round(((BINS - 1 - i) * perBinMs + perBinMs / 2) / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return `${h}h${m ? ` ${m}m` : ""} ago`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return `${d}d${hh ? ` ${hh}h` : ""} ago`;
}

/** Status-page style lines: one per channel, bins coloured by drop count. */
export function ChannelLines({ channels, timeframeMs }: { channels: ChannelStatus[]; timeframeMs: number }) {
  return (
    <div className="space-y-1.5">
      {channels.map((cs) => {
        const total = cs.buckets.reduce((a, b) => a + b, 0);
        return (
          <div key={cs.channel} className="flex items-center gap-3">
            <div className="w-24 shrink-0 truncate font-mono text-xs">{cs.channel}</div>
            <div className="flex h-6 min-w-0 flex-1 items-stretch gap-[2px]">
              {cs.buckets.map((count, i) => (
                <div key={i} className="group/bin relative flex-1 rounded-[1px]" style={binStyle(count)}>
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded border border-border bg-[--surface-3] px-1.5 py-0.5 text-[10px] font-mono text-foreground shadow-lg group-hover/bin:block">
                    {binLabel(i, timeframeMs)} · {count === 0 ? "ok" : `${count} drop${count > 1 ? "s" : ""}`}
                  </span>
                </div>
              ))}
            </div>
            <div className="w-24 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
              {cs.conns} conn · {total} drop{total === 1 ? "" : "s"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Shared timeframe toggle (1h / 6h / 24h / 7d). */
export function TimeframeToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-[--surface-1] p-0.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`px-2.5 py-1 text-xs font-mono rounded-sm ${value === o ? "bg-[--surface-3] text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
