import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

type MetricDatum = { date: string; tokens: number; cost: number; messages: number };
type MetricKey = "tokens" | "cost" | "messages";

function MetricSparkline({
  data,
  dataKey,
  accent,
  label,
}: {
  data: MetricDatum[];
  dataKey: MetricKey;
  accent: string;
  label: string;
}) {
  return (
    <Sparkline
      points={data.map((point) => ({ date: point.date, value: point[dataKey] }))}
      label={`${label} trend`}
      accent={accent}
    />
  );
}

export function MetricPanel({
  className,
  title,
  value,
  subline,
  accent,
  data,
  dataKey,
  icon: Icon,
}: {
  className?: string;
  title: string;
  value: ReactNode;
  subline: ReactNode;
  accent: string;
  data: MetricDatum[];
  dataKey: MetricKey;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <section className={cn("flex h-full flex-col p-5", className)}>
      <div className="min-w-0">
        <p className="metric-label">
          <span
            className="grid size-8 place-items-center rounded-[8px]"
            style={{
              background: `color-mix(in oklch, ${accent} 12%, transparent)`,
              color: accent,
            }}
          >
            <Icon className="size-4" />
          </span>
          {title}
        </p>
        <p className="metric-value mt-5 text-[2rem] sm:text-[2.4rem]">{value}</p>
        <p className="mt-2 min-h-10 text-xs leading-5 text-[var(--muted-foreground)]">{subline}</p>
      </div>
      <div className="mt-auto hidden pt-5 md:block">
        <MetricSparkline data={data} dataKey={dataKey} accent={accent} label={title} />
      </div>
    </section>
  );
}

export function CompactMetric({
  className,
  title,
  value,
  detail,
  accent,
  data,
  dataKey,
  icon: Icon,
}: {
  className?: string;
  title: string;
  value: ReactNode;
  detail: ReactNode;
  accent: string;
  data: MetricDatum[];
  dataKey: MetricKey;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <section className={cn("grid h-full grid-cols-[1fr_6rem] gap-4 p-4 sm:p-5", className)}>
      <p className="metric-label">
        <Icon className="size-3.5" />
        {title}
      </p>
      <div className="col-start-1">
        <p className="metric-value text-[1.65rem]">{value}</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{detail}</p>
      </div>
      <div className="col-start-2 row-span-2 row-start-1 self-end">
        <MetricSparkline data={data} dataKey={dataKey} accent={accent} label={title} />
      </div>
    </section>
  );
}
