export function StateBlock({
  loading,
  error,
  empty,
  onRetry,
  children,
}: {
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-[--surface-1] p-8 text-xs font-mono text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-[--primary] animate-pulse mr-2" />
        loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-[color-mix(in_oklab,var(--status-down)_40%,var(--border))] bg-[color-mix(in_oklab,var(--status-down)_8%,var(--surface-1))] p-6 text-sm">
        <div className="font-semibold text-[--status-down] font-mono uppercase text-xs tracking-wider">
          Failed to load
        </div>
        <div className="mt-1 text-muted-foreground text-xs">
          {String((error as Error)?.message ?? error)}
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 inline-flex items-center rounded-md border border-border bg-[--surface-2] px-2.5 py-1 text-xs hover:bg-[--surface-3]"
          >
            Retry
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-8 text-xs font-mono text-muted-foreground">
        no data
      </div>
    );
  }
  return <>{children}</>;
}

export function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-border bg-[--surface-1] ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
          {title && (
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              {title}
            </h3>
          )}
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
