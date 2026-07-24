import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/streamer/AppShell";
import { Panel, StateBlock } from "@/components/streamer/Panel";
import { StatusPill } from "@/components/streamer/StatusPill";
import { TimeAgo } from "@/components/streamer/TimeAgo";
import { getIncidents, POLL_MS } from "@/lib/streamer/api";
import { SERVICE_IDS } from "@/lib/streamer/mock";
import { fmtDuration } from "@/lib/streamer/format";

export const Route = createFileRoute("/incidents")({
  head: () => ({
    meta: [
      { title: "Incidents — Streamer Status" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: IncidentsPage,
});

const WINDOWS = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

function IncidentsPage() {
  const [win, setWin] = useState(7);
  const [svcFilter, setSvcFilter] = useState<string>("");
  const [causeFilter, setCauseFilter] = useState<string>("");

  const q = useQuery({
    queryKey: ["incidents", win],
    queryFn: () => getIncidents(win),
    refetchInterval: POLL_MS,
  });

  const causes = useMemo(
    () => Array.from(new Set(q.data?.incidents.map((i) => i.cause) ?? [])),
    [q.data],
  );

  const filtered = useMemo(() => {
    return (q.data?.incidents ?? []).filter(
      (i) => (!svcFilter || i.service === svcFilter) && (!causeFilter || i.cause === causeFilter),
    );
  }, [q.data, svcFilter, causeFilter]);

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6 space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Incidents</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Outages, degradations, and their causes across the fleet.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-[--surface-1] p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                onClick={() => setWin(w.days)}
                className={`px-2.5 py-1 text-xs font-mono rounded-sm ${win === w.days ? "bg-[--surface-3] text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {SERVICE_IDS.map((id) => {
            const s = q.data?.stats[id];
            return (
              <div key={id} className="rounded-lg border border-border bg-[--surface-1] p-4">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate">
                  {id}
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <div>
                    <div
                      className="font-mono text-xl font-semibold tabular-nums"
                      style={{
                        color:
                          s && s.uptime_pct >= 99.9
                            ? "var(--status-up)"
                            : s && s.uptime_pct >= 99
                              ? "var(--status-degraded)"
                              : "var(--status-down)",
                      }}
                    >
                      {s ? `${s.uptime_pct.toFixed(2)}%` : "—"}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">uptime</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs tabular-nums text-muted-foreground">
                      MTBF {s ? fmtDuration(s.mtbf_s) : "—"}
                    </div>
                    <div className="font-mono text-xs tabular-nums text-muted-foreground">
                      MTTR {s ? fmtDuration(s.mttr_s) : "—"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <Panel
          title={`${filtered.length} incidents`}
          right={
            <div className="flex items-center gap-2">
              <FilterSelect value={svcFilter} onChange={setSvcFilter} options={SERVICE_IDS} placeholder="All services" />
              <FilterSelect value={causeFilter} onChange={setCauseFilter} options={causes} placeholder="All causes" />
            </div>
          }
        >
          <StateBlock
            loading={q.isLoading}
            error={q.error}
            onRetry={() => q.refetch()}
            empty={filtered.length === 0}
          >
            <div className="overflow-auto -m-4">
              <table className="w-full text-xs">
                <thead className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2">Service</th>
                    <th className="text-left px-3 py-2">Started</th>
                    <th className="text-right px-3 py-2">Duration</th>
                    <th className="text-left px-3 py-2">Cause</th>
                    <th className="text-left px-3 py-2">State</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((i) => (
                    <tr key={i.id} className="border-b border-border hover:bg-[--surface-2]/60">
                      <td className="px-3 py-2 font-mono">{i.service}</td>
                      <td className="px-3 py-2">
                        <TimeAgo iso={i.started} className="text-muted-foreground" />
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {fmtDuration(i.duration_s)}
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{i.cause}</td>
                      <td className="px-3 py-2">
                        <StatusPill status={i.resolved ? "UP" : "DOWN"} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </StateBlock>
        </Panel>
      </div>
    </AppShell>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-[--surface-2] px-2 py-1 text-xs font-mono"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
