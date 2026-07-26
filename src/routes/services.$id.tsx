import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Server } from "lucide-react";
import { AppShell } from "@/components/streamer/AppShell";
import { StatusPill } from "@/components/streamer/StatusPill";
import { Panel, StateBlock } from "@/components/streamer/Panel";
import { Gauge } from "@/components/streamer/Gauge";
import { TimeAgo } from "@/components/streamer/TimeAgo";
import { getServiceDetail, POLL_MS } from "@/lib/streamer/api";
import { fmtDuration } from "@/lib/streamer/format";
import type { Channel, SymbolRow } from "@/lib/streamer/types";

export const Route = createFileRoute("/services/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.id} — Streamer Status` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ServiceDetailPage,
});

function ServiceDetailPage() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["service", id],
    queryFn: () => getServiceDetail(id),
    refetchInterval: POLL_MS,
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6 space-y-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> back to fleet
        </Link>

        <StateBlock loading={q.isLoading} error={q.error} onRetry={() => q.refetch()}>
          {q.data && (
            <>
              <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
                <div className="min-w-0 flex items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[--surface-2] border border-border">
                    <Server className="h-5 w-5 text-[--primary]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      {q.data.host}
                    </div>
                    <h1 className="truncate text-xl sm:text-2xl font-semibold tracking-tight">
                      {q.data.name}
                    </h1>
                  </div>
                </div>
                <StatusPill status={q.data.status} size="lg" />
              </header>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-lg overflow-hidden border border-border bg-border">
                <HeaderStat label="Uptime" value={fmtDuration(q.data.uptime_s)} />
                <HeaderStat label="Restarts 24h" value={String(q.data.restarts_24h)} />
                <HeaderStat label="Next rollover" value={fmtDuration(q.data.next_rollover_s)} />
                <HeaderStat label="Connections" value={String(q.data.connections.length)} />
              </div>

              {/* Hero: per-connection reliability — how often each socket dies. */}
              <Panel
                title="Connections"
                right={
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {q.data.connections.length} sockets
                  </span>
                }
              >
                {q.data.connections.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-6 text-center text-xs font-mono text-muted-foreground">
                    Per-connection reliability (reconnects, state, corrupt frames, last
                    reconnect) appears here once the streamer <code>stats</code> op is
                    deployed.
                  </div>
                ) : (
                  <div className="overflow-auto -m-4">
                    <table className="w-full text-xs">
                      <thead className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        <tr className="border-b border-border">
                          <Th>Name</Th>
                          <Th>Channel</Th>
                          <Th right>Symbols</Th>
                          <Th>State</Th>
                          <Th right>Reconn 1h/24h</Th>
                          <Th right>Corrupt</Th>
                          <Th right>Skew ms</Th>
                          <Th>Last connect</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {q.data.connections.map((c) => (
                          <tr key={c.name} className="border-b border-border hover:bg-[--surface-2]/60">
                            <Td mono>{c.name}</Td>
                            <Td mono>{c.channel}</Td>
                            <Td right mono>{c.symbols}</Td>
                            <Td><StatusPill status={c.state} size="sm" /></Td>
                            <Td right mono>
                              <span className={c.reconnects_1h > 3 ? "text-[--status-degraded]" : ""}>
                                {c.reconnects_1h}
                              </span>
                              <span className="text-muted-foreground"> / {c.reconnects_24h}</span>
                            </Td>
                            <Td right mono>
                              <span className={c.corrupt > 0 ? "text-[--status-degraded]" : ""}>{c.corrupt}</span>
                            </Td>
                            <Td right mono>
                              <span className={c.skew_ms > 150 ? "text-[--status-degraded]" : ""}>{c.skew_ms}</span>
                            </Td>
                            <Td><TimeAgo iso={c.last_connect} className="text-muted-foreground" /></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>

              {/* Neutral liveness: last message per channel. Info only — never an
                  alarm, since sparse channels are quiet by nature. */}
              <Panel title="Channel liveness" right={<span className="text-[10px] font-mono text-muted-foreground">last message · info only</span>}>
                <div className="overflow-auto -m-4">
                  <table className="w-full text-xs">
                    <thead className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      <tr className="border-b border-border">
                        <Th>Channel</Th>
                        <Th right>Symbols</Th>
                        <Th right>Freshest last msg</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelLiveness(q.data.channels, q.data.symbols).map((r) => (
                        <tr key={r.channel} className="border-b border-border hover:bg-[--surface-2]/60">
                          <Td mono>{r.channel}</Td>
                          <Td right mono>{r.count}</Td>
                          <Td right mono className="text-muted-foreground">{fmtAge(r.freshest)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-2">
                <Gauge
                  label="Connection open budget"
                  sublabel={`${q.data.budgets.connect_open.window_s / 60}m window`}
                  used={q.data.budgets.connect_open.used}
                  limit={q.data.budgets.connect_open.limit}
                />
                <Gauge
                  label="REST weight budget"
                  used={q.data.budgets.rest_weight.used}
                  limit={q.data.budgets.rest_weight.limit}
                />
              </div>
            </>
          )}
        </StateBlock>
      </div>
    </AppShell>
  );
}

/** Per-channel liveness from the `list` staleness: the freshest symbol on each
 *  channel (a busy symbol getting messages ⇒ the channel is alive). */
function channelLiveness(channels: Channel[], symbols: SymbolRow[]) {
  return channels.map((channel) => {
    const vals = symbols
      .map((s) => s.staleness_s[channel])
      .filter((v): v is number => v !== undefined);
    return {
      channel,
      count: vals.length,
      freshest: vals.length ? Math.min(...vals) : null,
    };
  });
}

function fmtAge(seconds: number | null): string {
  if (seconds == null) return "—";
  return seconds < 60 ? `${seconds.toFixed(1)}s ago` : `${fmtDuration(Math.round(seconds))} ago`;
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[--surface-1] px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2 ${right ? "text-right" : "text-left"} whitespace-nowrap`}>{children}</th>;
}
function Td({ children, right, mono, className = "" }: { children: React.ReactNode; right?: boolean; mono?: boolean; className?: string }) {
  return (
    <td className={`px-3 py-2 whitespace-nowrap ${right ? "text-right" : ""} ${mono ? "font-mono tabular-nums" : ""} ${className}`}>
      {children}
    </td>
  );
}
