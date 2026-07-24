import { cn } from "@/lib/utils";
import type { Status } from "@/lib/streamer/types";

const styles: Record<Status, string> = {
  UP: "bg-[color-mix(in_oklab,var(--status-up)_18%,transparent)] text-[--status-up] ring-1 ring-[color-mix(in_oklab,var(--status-up)_35%,transparent)]",
  DEGRADED:
    "bg-[color-mix(in_oklab,var(--status-degraded)_18%,transparent)] text-[--status-degraded] ring-1 ring-[color-mix(in_oklab,var(--status-degraded)_35%,transparent)]",
  DOWN: "bg-[color-mix(in_oklab,var(--status-down)_18%,transparent)] text-[--status-down] ring-1 ring-[color-mix(in_oklab,var(--status-down)_40%,transparent)]",
};

const dot: Record<Status, string> = {
  UP: "bg-[--status-up]",
  DEGRADED: "bg-[--status-degraded]",
  DOWN: "bg-[--status-down]",
};

export function StatusPill({
  status,
  size = "md",
  className,
}: {
  status: Status;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sz =
    size === "lg"
      ? "text-xs px-2.5 py-1"
      : size === "sm"
        ? "text-[10px] px-1.5 py-0.5"
        : "text-[11px] px-2 py-0.5";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-mono uppercase tracking-wider font-medium",
        styles[status],
        sz,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", dot[status])} />
      {status}
    </span>
  );
}
