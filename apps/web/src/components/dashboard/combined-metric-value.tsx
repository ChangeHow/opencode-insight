import type { ReactNode } from "react";

export interface MetricBreakdown {
  local: number;
  remote: number;
  total: number;
}

export function CombinedMetricValue({
  breakdown,
  format,
}: {
  breakdown: MetricBreakdown;
  format: (value: number) => ReactNode;
}) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span>{format(breakdown.total)}</span>
      {breakdown.remote > 0 ? (
        <span className="text-sm font-medium tracking-normal text-[var(--muted-foreground)]">
          (local {format(breakdown.local)} | remote {format(breakdown.remote)})
        </span>
      ) : null}
    </span>
  );
}
