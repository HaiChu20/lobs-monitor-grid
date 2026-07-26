import { Link } from "@tanstack/react-router";
import { HardDrive, Zap, AlertCircle, Clock } from "lucide-react";
import { StatusPill } from "./StatusPill";
import { fmtDuration } from "@/lib/streamer/format";
import type { ServiceSummary } from "@/lib/streamer/types";

export function ServiceCard({ svc }: { svc: ServiceSummary }) {
  return (
    <Link
      to="/services/$id"
      params={{ id: svc.id }}
      className="group relative flex flex-col rounded-lg border border-border bg-[--surface-1] p-4 transition-all hover:border-[color-mix(in_oklab,var(--primary)_50%,var(--border))] hover:bg-[--surface-2]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate">
            {svc.host}
          </div>
          <div className="mt-0.5 text-[15px] font-semibold tracking-tight truncate">
            {svc.name}
          </div>
        </div>
        <StatusPill status={svc.status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
        <Stat icon={Clock} label="Uptime" value={fmtDuration(svc.uptime_s)} />
        <Stat
          icon={Zap}
          label="24h avail"
          value={`${svc.uptime_pct_24h.toFixed(2)}%`}
          accent={svc.uptime_pct_24h >= 99.9 ? "up" : svc.uptime_pct_24h >= 99 ? "warn" : "down"}
        />
        <Stat
          icon={AlertCircle}
          label="Reconn 1h"
          value={String(svc.reconnects_1h)}
          accent={svc.reconnects_1h > 5 ? "warn" : "none"}
        />
        <Stat
          icon={HardDrive}
          label="Disk free"
          value={`${svc.disk_free_pct}%`}
          accent={svc.disk_free_pct < 15 ? "down" : svc.disk_free_pct < 30 ? "warn" : "none"}
        />
      </div>

      <div className="mt-4">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">
          24h uptime
        </div>
        <div className="flex h-6 items-end gap-[2px]">
          {svc.uptime_sparkline_24h.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: v ? "100%" : "35%",
                background: v ? "var(--status-up)" : "var(--status-down)",
                opacity: v ? 0.85 : 1,
              }}
              title={`bin ${i}: ${v ? "up" : "down"}`}
            />
          ))}
        </div>
      </div>
    </Link>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent = "none",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: "none" | "up" | "warn" | "down";
}) {
  const color =
    accent === "up"
      ? "text-[--status-up]"
      : accent === "warn"
        ? "text-[--status-degraded]"
        : accent === "down"
          ? "text-[--status-down]"
          : "text-foreground";
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}</span>
      <span className={`ml-auto font-mono font-medium tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
