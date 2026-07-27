import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/streamer/AppShell";
import { StateBlock, Panel } from "@/components/streamer/Panel";
import { StatusPill } from "@/components/streamer/StatusPill";
import { TimeAgo } from "@/components/streamer/TimeAgo";
import { ChannelLines, TimeframeToggle } from "@/components/streamer/ChannelLines";
import { getOverview, getIncidents, POLL_MS, TIMEFRAMES, type Timeframe } from "@/lib/streamer/api";
import { fmtDuration, fmtNumber } from "@/lib/streamer/format";
import type { FleetEvent, ServiceSummary } from "@/lib/streamer/types";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: OverviewPage,
});

const TF_VALUES = TIMEFRAMES.map((t) => t.value);

function OverviewPage() {
  const [tf, setTf] = useState<Timeframe>("24h");
  const tfMs = TIMEFRAMES.find((t) => t.value === tf)!.ms;

  const overview = useQuery({
    queryKey: ["overview", tf],
    queryFn: () => getOverview(tf),
    refetchInterval: POLL_MS,
  });
  const incidents = useQuery({
    queryKey: ["incidents", 1],
    queryFn: () => getIncidents(1),
    refetchInterval: POLL_MS,
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fleet Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time status across all streamers.{" "}
            {overview.data && (
              <>
                Last updated <TimeAgo iso={overview.data.fleet.updated_at} className="text-foreground" />
              </>
            )}
          </p>
        </div>

        <FleetStrip data={overview.data?.fleet} loading={overview.isLoading} />

        <div>
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Services · channel drops
            </h2>
            <TimeframeToggle options={TF_VALUES} value={tf} onChange={setTf} />
          </div>
          <StateBlock
            loading={overview.isLoading}
            error={overview.error}
            onRetry={() => overview.refetch()}
            empty={overview.data?.services.length === 0}
          >
            <div className="space-y-3">
              {overview.data?.services.map((s) => <ServiceRow key={s.id} svc={s} timeframeMs={tfMs} />)}
            </div>
          </StateBlock>
        </div>

        <Panel
          title="Recent activity · 24h"
          right={
            <Link
              to="/incidents"
              className="inline-flex items-center gap-1 text-[11px] font-mono text-[--primary] hover:underline"
            >
              view all <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <StateBlock
            loading={incidents.isLoading}
            error={incidents.error}
            onRetry={() => incidents.refetch()}
            empty={incidents.data?.events.length === 0}
          >
            <div className="divide-y divide-border -m-4">
              {incidents.data?.events.slice(0, 8).map((e) => <EventRow key={e.id} e={e} />)}
            </div>
          </StateBlock>
        </Panel>
      </div>
    </AppShell>
  );
}

/** One service as a status-page row: header stats + its channel drop lines. */
function ServiceRow({ svc, timeframeMs }: { svc: ServiceSummary; timeframeMs: number }) {
  return (
    <div className="rounded-lg border border-border bg-[--surface-1] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <StatusPill status={svc.status} />
          <div className="min-w-0">
            <Link
              to="/services/$id"
              params={{ id: svc.id }}
              className="truncate text-[15px] font-semibold tracking-tight hover:underline"
            >
              {svc.name}
            </Link>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{svc.host}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-mono">
          <RowStat label="uptime" value={fmtDuration(svc.uptime_s)} />
          <RowStat label="msgs/s" value={fmtNumber(svc.msgs_per_s)} />
          <RowStat label="reconn 1h" value={String(svc.reconnects_1h)} accent={svc.reconnects_1h > 5} />
          <RowStat label="drops 24h" value={String(svc.drops_24h)} />
          <RowStat label="disk" value={`${svc.disk_free_pct}%`} accent={svc.disk_free_pct < 15} />
        </div>
      </div>
      <ChannelLines channels={svc.channel_status} timeframeMs={timeframeMs} />
    </div>
  );
}

function RowStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${accent ? "text-[--status-degraded]" : "text-foreground"}`}>{value}</span>
    </span>
  );
}

/** One row in the "Recent activity" feed — a service outage or a WS drop. */
function EventRow({ e }: { e: FleetEvent }) {
  const isDrop = e.kind === "drop";
  return (
    <div className="flex items-center gap-4 px-4 py-2.5 text-sm hover:bg-[--surface-2]/60">
      {isDrop ? (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono uppercase bg-[--status-degraded]/15 text-[--status-degraded]">
          drop
        </span>
      ) : (
        <StatusPill status={e.resolved ? "UP" : "DOWN"} size="sm" />
      )}
      <span className="font-mono text-xs text-foreground w-40 truncate">{e.service}</span>
      <span className="text-xs text-muted-foreground font-mono w-32 truncate">
        {isDrop ? e.conn : fmtDuration(e.duration_s ?? 0)}
      </span>
      <span className="text-xs font-mono text-muted-foreground flex-1 truncate" title={isDrop ? e.error : undefined}>
        {isDrop ? (e.error ?? `ws drop · ${e.channel}`) : e.cause}
      </span>
      <TimeAgo iso={e.t} className="text-xs text-muted-foreground" />
    </div>
  );
}

function FleetStrip({
  data,
  loading,
}: {
  data?: { up: number; degraded: number; down: number; symbols: number; msgs_per_s: number; open_incidents: number };
  loading: boolean;
}) {
  const items = [
    { label: "Up", value: data?.up ?? "—", color: "var(--status-up)" },
    { label: "Degraded", value: data?.degraded ?? "—", color: "var(--status-degraded)" },
    { label: "Down", value: data?.down ?? "—", color: "var(--status-down)" },
    { label: "Symbols", value: data ? fmtNumber(data.symbols) : "—" },
    { label: "Msgs / s", value: data ? fmtNumber(data.msgs_per_s) : "—" },
    { label: "Open incidents", value: data?.open_incidents ?? "—" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px rounded-lg overflow-hidden border border-border bg-border">
      {items.map((it) => (
        <div key={it.label} className="bg-[--surface-1] px-4 py-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{it.label}</div>
          <div
            className="mt-1 font-mono text-2xl font-semibold tabular-nums"
            style={{ color: it.color ?? "inherit" }}
          >
            {loading ? <span className="text-muted-foreground">…</span> : it.value}
          </div>
        </div>
      ))}
    </div>
  );
}
