import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Server } from "lucide-react";
import { AppShell } from "@/components/streamer/AppShell";
import { StatusPill } from "@/components/streamer/StatusPill";
import { Panel, StateBlock } from "@/components/streamer/Panel";
import { FreshnessHeatmap } from "@/components/streamer/FreshnessHeatmap";
import { Gauge } from "@/components/streamer/Gauge";
import { TimeAgo } from "@/components/streamer/TimeAgo";
import { getServiceDetail, POLL_MS } from "@/lib/streamer/api";
import { fmtDuration } from "@/lib/streamer/format";

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

              <Panel
                title="Freshness heatmap"
                right={
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {q.data.symbols.length} symbols × {q.data.channels.length} channels
                  </span>
                }
              >
                <FreshnessHeatmap channels={q.data.channels} symbols={q.data.symbols} />
              </Panel>

              <div className="grid gap-4 lg:grid-cols-3">
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
                <div className="rounded-lg border border-border bg-[--surface-1] p-4">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Stale streams
                  </div>
                  <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                    {q.data.symbols.reduce(
                      (a, s) =>
                        a +
                        Object.values(s.staleness_s).filter((v) => v !== undefined && v > 2)
                          .length,
                      0,
                    )}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">across all channels</div>
                </div>
              </div>

              <Panel title="Connections">
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
                            <span className={c.corrupt > 0 ? "text-[--status-degraded]" : ""}>
                              {c.corrupt}
                            </span>
                          </Td>
                          <Td right mono>
                            <span className={c.skew_ms > 150 ? "text-[--status-degraded]" : ""}>
                              {c.skew_ms}
                            </span>
                          </Td>
                          <Td>
                            <TimeAgo iso={c.last_connect} className="text-muted-foreground" />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-3">
                <Panel title="Msgs/s · 1h">
                  <ChartWrap>
                    <AreaChart data={q.data.series.msgs_per_s_1h.map(([t, v]) => ({ t, v }))}>
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="2 2" vertical={false} />
                      <XAxis dataKey="t" hide />
                      <YAxis width={40} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} stroke="var(--border)" />
                      <Tooltip content={<ChartTip />} />
                      <Area type="monotone" dataKey="v" stroke="var(--primary)" fill="url(#g1)" strokeWidth={1.5} />
                    </AreaChart>
                  </ChartWrap>
                </Panel>

                <Panel title="Reconnects · 24h">
                  <ChartWrap>
                    <BarChart data={q.data.series.reconnects_24h.map(([t, v]) => ({ t, v }))}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="2 2" vertical={false} />
                      <XAxis dataKey="t" hide />
                      <YAxis width={30} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} stroke="var(--border)" />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="v" fill="var(--status-degraded)" />
                    </BarChart>
                  </ChartWrap>
                </Panel>

                <Panel title="Consumer skew (ms) · 1h">
                  <ChartWrap>
                    <LineChart data={q.data.series.skew_ms_1h.map(([t, v]) => ({ t, v }))}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="2 2" vertical={false} />
                      <XAxis dataKey="t" hide />
                      <YAxis width={40} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} stroke="var(--border)" />
                      <Tooltip content={<ChartTip />} />
                      <Line type="monotone" dataKey="v" stroke="var(--status-degraded)" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ChartWrap>
                </Panel>
              </div>
            </>
          )}
        </StateBlock>
      </div>
    </AppShell>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[--surface-1] px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 ${right ? "text-right" : "text-left"} whitespace-nowrap`}>{children}</th>
  );
}
function Td({ children, right, mono }: { children: React.ReactNode; right?: boolean; mono?: boolean }) {
  return (
    <td
      className={`px-3 py-2 whitespace-nowrap ${right ? "text-right" : ""} ${mono ? "font-mono tabular-nums" : ""}`}
    >
      {children}
    </td>
  );
}

function ChartWrap({ children }: { children: React.ReactElement }) {
  return (
    <div className="h-40 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-[--popover] px-2 py-1 text-[11px] font-mono shadow-lg">
      <div className="text-muted-foreground">{new Date(label).toLocaleTimeString()}</div>
      <div className="text-foreground tabular-nums">{payload[0].value}</div>
    </div>
  );
}
