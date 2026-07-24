import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/streamer/AppShell";
import { ServiceCard } from "@/components/streamer/ServiceCard";
import { StateBlock, Panel } from "@/components/streamer/Panel";
import { StatusPill } from "@/components/streamer/StatusPill";
import { TimeAgo } from "@/components/streamer/TimeAgo";
import { getOverview, getIncidents, POLL_MS } from "@/lib/streamer/api";
import { fmtDuration, fmtNumber } from "@/lib/streamer/format";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: OverviewPage,
});

function OverviewPage() {
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: getOverview,
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
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Fleet Overview</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Real-time status across all streamers.{" "}
                {overview.data && (
                  <>
                    Last updated{" "}
                    <TimeAgo iso={overview.data.fleet.updated_at} className="text-foreground" />
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        <FleetStrip data={overview.data?.fleet} loading={overview.isLoading} />

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Services
            </h2>
            <span className="text-[11px] font-mono text-muted-foreground">
              {overview.data?.services.length ?? 0} nodes
            </span>
          </div>
          <StateBlock
            loading={overview.isLoading}
            error={overview.error}
            onRetry={() => overview.refetch()}
            empty={overview.data?.services.length === 0}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {overview.data?.services.map((s) => <ServiceCard key={s.id} svc={s} />)}
            </div>
          </StateBlock>
        </div>

        <Panel
          title="Recent incidents · 24h"
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
            empty={incidents.data?.incidents.length === 0}
          >
            <div className="divide-y divide-border -m-4">
              {incidents.data?.incidents.slice(0, 6).map((i) => (
                <div
                  key={i.id}
                  className="flex items-center gap-4 px-4 py-2.5 text-sm hover:bg-[--surface-2]/60"
                >
                  <StatusPill status={i.resolved ? "UP" : "DOWN"} size="sm" />
                  <span className="font-mono text-xs text-foreground w-40 truncate">{i.service}</span>
                  <span className="text-xs text-muted-foreground font-mono w-20">
                    {fmtDuration(i.duration_s)}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground flex-1 truncate">
                    {i.cause}
                  </span>
                  <TimeAgo iso={i.started} className="text-xs text-muted-foreground" />
                </div>
              ))}
            </div>
          </StateBlock>
        </Panel>
      </div>
    </AppShell>
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
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {it.label}
          </div>
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
