import { useState } from "react";
import { sevToBg, stalenessSev } from "@/lib/streamer/format";
import type { Channel, SymbolRow } from "@/lib/streamer/types";

export function FreshnessHeatmap({
  channels,
  symbols,
}: {
  channels: Channel[];
  symbols: SymbolRow[];
}) {
  const [hover, setHover] = useState<{
    sym: string;
    ch: Channel;
    v?: number;
    rate: number;
    x: number;
    y: number;
  } | null>(null);

  return (
    <div className="relative">
      <div className="overflow-auto rounded-lg border border-border bg-[--surface-1]">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-10 bg-[--surface-2]">
            <tr>
              <th className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2 border-b border-border">
                Symbol
              </th>
              {channels.map((ch) => (
                <th
                  key={ch}
                  className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-2 border-b border-border whitespace-nowrap"
                >
                  {ch}
                </th>
              ))}
              <th className="text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2 border-b border-border">
                msg/s
              </th>
            </tr>
          </thead>
          <tbody>
            {symbols.map((s) => (
              <tr key={s.symbol} className="hover:bg-[--surface-2]/50 transition-colors">
                <td className="px-3 py-1.5 font-mono text-[12px] text-foreground border-b border-border whitespace-nowrap">
                  {s.symbol}
                  {!s.producing_files && (
                    <span
                      className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[--status-down] align-middle"
                      title="Not producing files"
                    />
                  )}
                </td>
                {channels.map((ch) => {
                  const v = s.staleness_s[ch];
                  const sev = stalenessSev(ch, v);
                  return (
                    <td key={ch} className="p-0.5 border-b border-border">
                      <div
                        onMouseEnter={(e) =>
                          setHover({
                            sym: s.symbol,
                            ch,
                            v,
                            rate: s.msgs_per_s,
                            x: e.clientX,
                            y: e.clientY,
                          })
                        }
                        onMouseMove={(e) =>
                          setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))
                        }
                        onMouseLeave={() => setHover(null)}
                        className={`h-6 w-full min-w-[52px] rounded-sm ${sevToBg(sev)} ${sev === "off" ? "opacity-40" : ""} cursor-crosshair transition-transform hover:scale-[1.06]`}
                        style={{
                          opacity: sev === "off" ? 0.25 : sev === "ok" ? 0.55 : sev === "warn" ? 0.85 : 1,
                        }}
                      />
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 font-mono text-right tabular-nums text-muted-foreground border-b border-border">
                  {s.msgs_per_s}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-border bg-[--popover] px-2.5 py-1.5 text-[11px] font-mono shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="text-foreground font-semibold">
            {hover.sym} · {hover.ch}
          </div>
          <div className="text-muted-foreground mt-0.5">
            {hover.v === undefined ? "not subscribed" : `staleness ${hover.v.toFixed(1)}s`}
          </div>
          <div className="text-muted-foreground">rate {hover.rate} msg/s</div>
        </div>
      )}

      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
      <LegendChip color="bg-[--status-up]" label="fresh" />
      <LegendChip color="bg-[--status-degraded]" label="stale" />
      <LegendChip color="bg-[--status-down]" label="silent" />
      <LegendChip color="bg-[--surface-3] opacity-40" label="off" />
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-4 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
