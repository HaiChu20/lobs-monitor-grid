import { fmtExact, fmtRelative } from "@/lib/streamer/format";

export function TimeAgo({ iso, className = "" }: { iso: string; className?: string }) {
  return (
    <span title={fmtExact(iso)} className={`font-mono tabular-nums ${className}`}>
      {fmtRelative(iso)}
    </span>
  );
}
