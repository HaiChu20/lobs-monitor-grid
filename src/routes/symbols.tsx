import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowUpDown, Search } from "lucide-react";
import { AppShell } from "@/components/streamer/AppShell";
import { Panel, StateBlock } from "@/components/streamer/Panel";
import { getAllSymbols, POLL_MS } from "@/lib/streamer/api";

export const Route = createFileRoute("/symbols")({
  head: () => ({
    meta: [
      { title: "Symbols — Streamer Status" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SymbolsPage,
});

type SortKey = "symbol" | "service" | "channels" | "worst" | "rate";

function SymbolsPage() {
  const q = useQuery({
    queryKey: ["all-symbols"],
    queryFn: getAllSymbols,
    refetchInterval: POLL_MS,
  });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ k: SortKey; dir: "asc" | "desc" }>({
    k: "worst",
    dir: "desc",
  });

  const rows = useMemo(() => {
    const list = (q.data ?? []).filter((r) =>
      search
        ? r.symbol.toLowerCase().includes(search.toLowerCase()) ||
          r.service.toLowerCase().includes(search.toLowerCase())
        : true,
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const k = sort.k;
      let av: number | string, bv: number | string;
      if (k === "symbol") (av = a.symbol), (bv = b.symbol);
      else if (k === "service") (av = a.service), (bv = b.service);
      else if (k === "channels") (av = a.channels_active), (bv = b.channels_active);
      else if (k === "worst") (av = a.worst_staleness), (bv = b.worst_staleness);
      else (av = a.msgs_per_s), (bv = b.msgs_per_s);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  }, [q.data, search, sort]);

  const flip = (k: SortKey) =>
    setSort((s) => (s.k === k ? { k, dir: s.dir === "asc" ? "desc" : "asc" } : { k, dir: "desc" }));

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Symbols</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All symbols across all services, cross-referenced.
          </p>
        </div>

        <Panel
          title={`${rows.length} symbols`}
          right={
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="filter BTCUSDT, kraken…"
                className="rounded-md border border-border bg-[--surface-2] pl-7 pr-2 py-1 text-xs font-mono w-56 focus:outline-none focus:ring-1 focus:ring-[--primary]"
              />
            </div>
          }
        >
          <StateBlock
            loading={q.isLoading}
            error={q.error}
            onRetry={() => q.refetch()}
            empty={rows.length === 0}
          >
            <div className="overflow-auto -m-4">
              <table className="w-full text-xs">
                <thead className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-[--surface-2] sticky top-0">
                  <tr className="border-b border-border">
                    <SortTh label="Symbol" onClick={() => flip("symbol")} />
                    <SortTh label="Service" onClick={() => flip("service")} />
                    <SortTh label="Channels" right onClick={() => flip("channels")} />
                    <SortTh label="Worst stale (s)" right onClick={() => flip("worst")} />
                    <SortTh label="Msgs/s" right onClick={() => flip("rate")} />
                    <th className="text-left px-3 py-2">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={`${r.serviceId}-${r.symbol}`}
                      className="border-b border-border hover:bg-[--surface-2]/60"
                    >
                      <td className="px-3 py-1.5 font-mono">{r.symbol}</td>
                      <td className="px-3 py-1.5 font-mono">
                        <Link
                          to="/services/$id"
                          params={{ id: r.serviceId }}
                          className="text-muted-foreground hover:text-[--primary]"
                        >
                          {r.service}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                        {r.channels_active}
                      </td>
                      <td
                        className="px-3 py-1.5 text-right font-mono tabular-nums"
                        style={{
                          color:
                            r.worst_staleness > 60
                              ? "var(--status-down)"
                              : r.worst_staleness > 10
                                ? "var(--status-degraded)"
                                : "var(--foreground)",
                        }}
                      >
                        {r.worst_staleness.toFixed(1)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                        {r.msgs_per_s}
                      </td>
                      <td className="px-3 py-1.5">
                        {r.producing_files ? (
                          <span className="font-mono text-[--status-up] text-[11px]">yes</span>
                        ) : (
                          <span className="font-mono text-[--status-down] text-[11px]">no</span>
                        )}
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

function SortTh({ label, onClick, right }: { label: string; onClick: () => void; right?: boolean }) {
  return (
    <th className={`px-3 py-2 ${right ? "text-right" : "text-left"} whitespace-nowrap`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground ${right ? "flex-row-reverse" : ""}`}
      >
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );
}
