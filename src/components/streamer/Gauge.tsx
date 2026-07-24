export function Gauge({
  used,
  limit,
  label,
  sublabel,
}: {
  used: number;
  limit: number;
  label: string;
  sublabel?: string;
}) {
  const pct = Math.min(100, (used / limit) * 100);
  const color =
    pct >= 90
      ? "var(--status-down)"
      : pct >= 80
        ? "var(--status-degraded)"
        : "var(--status-up)";
  return (
    <div className="rounded-lg border border-border bg-[--surface-1] p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-[10px] font-mono text-muted-foreground">{sublabel}</div>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold tabular-nums" style={{ color }}>
          {used}
        </span>
        <span className="font-mono text-sm text-muted-foreground">/ {limit}</span>
        <span
          className="ml-auto font-mono text-xs tabular-nums"
          style={{ color }}
        >
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="mt-3 h-2 w-full rounded-full bg-[--surface-3] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
