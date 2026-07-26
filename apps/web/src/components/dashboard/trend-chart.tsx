import { useMemo, useState } from "react";
import { ChevronDown, LineChart as LineChartIcon } from "lucide-react";
import type { CostSeriesLine, CostSeriesOption, TrendPoint } from "@opencode-dashboard/shared";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { getModelDisplayName } from "@/lib/model-display";
import { cn } from "@/lib/utils";
import { ProviderIcon } from "./provider-icon";

const SERIES_COLORS = [
  "var(--metric-amber)",
  "var(--metric-violet)",
  "var(--metric-green)",
  "var(--metric-orange)",
];
const METRICS = [
  { key: "cost" as const, label: "Spend", noun: "spend" },
  { key: "tokens" as const, label: "Tokens", noun: "token" },
  { key: "messages" as const, label: "Messages", noun: "message" },
];
type MetricKey = (typeof METRICS)[number]["key"];

export function TrendChart({
  data,
  options,
  lines,
  selectedKeys,
  onToggle,
}: {
  data: TrendPoint[];
  options: CostSeriesOption[];
  lines: CostSeriesLine[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState<MetricKey>("cost");
  const yAxisMax = useMemo(() => computeYAxisMax(data, lines, metric), [data, lines, metric]);
  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const colorByKey = useMemo(
    () =>
      new Map(
        options.map((option, index) => [option.key, SERIES_COLORS[index % SERIES_COLORS.length]]),
      ),
    [options],
  );
  const chartLines = useMemo(
    () => buildChartLines(data, lines, yAxisMax, metric),
    [data, lines, metric, yAxisMax],
  );
  const metricConfig = METRICS.find((item) => item.key === metric) ?? METRICS[0];

  return (
    <div className="flex h-full min-w-0 flex-col space-y-4">
      <div className="flex flex-col gap-3">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            <LineChartIcon className="size-3.5" />
            Usage trend
          </p>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            Spend, tokens, and messages over time
          </h2>
          <p className="text-xs leading-5 text-[var(--muted-foreground)]">
            Compare up to four model and provider pairs without leaving the timeline.
          </p>
        </div>
        <div
          role="group"
          aria-label="Chart metric"
          className="grid w-full grid-cols-3 rounded-[10px] border border-[var(--border)] bg-[var(--panel)] p-1"
        >
          {METRICS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={metric === item.key}
              onClick={() => setMetric(item.key)}
              className={cn(
                "h-8 min-w-0 rounded-[8px] px-2 text-[10px] font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                metric === item.key
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-72 w-full min-w-0 flex-1 rounded-[10px] border border-[var(--border)] bg-[var(--chart-surface)] p-3 sm:min-h-84">
        <div className="absolute inset-x-3 top-2 flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
          <span>{formatMetricValue(yAxisMax, metric)}</span>
          <span>{chartLines.length} lines</span>
        </div>
        <svg
          role="img"
          aria-label={`Daily ${metricConfig.noun} lines`}
          viewBox="0 0 720 280"
          preserveAspectRatio="none"
          className="h-full min-h-64 w-full pt-5"
        >
          <title>{`Daily ${metricConfig.noun} lines`}</title>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1="0"
              x2="720"
              y1={ratio * 280}
              y2={ratio * 280}
              stroke="var(--chart-grid)"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {chartLines.map((line) => (
            <path
              key={line.key}
              d={line.path}
              fill="none"
              stroke={colorByKey.get(line.key) ?? "var(--chart)"}
              strokeWidth="2.5"
              strokeLinecap="square"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div className="absolute inset-x-3 bottom-2 flex justify-between text-[10px] text-[var(--muted-foreground)]">
          <span>{data[0]?.date.slice(5) ?? "Start"}</span>
          <span>{data.at(-1)?.date.slice(5) ?? "End"}</span>
        </div>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-full items-center justify-between gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--panel)] px-3 text-sm font-medium text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <span className="truncate text-left">
              {selectedKeys.length > 0
                ? `${selectedKeys.length} selected: ${options
                    .filter((option) => selectedKeySet.has(option.key))
                    .slice(0, 2)
                    .map((option) => option.label)
                    .join(", ")}${selectedKeys.length > 2 ? "..." : ""}`
                : "Choose model and provider lines"}
            </span>
            <span className="flex items-center gap-2 text-[10px] whitespace-nowrap uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {open ? "Close" : "Select"}
              <ChevronDown
                className={cn("size-4 transition-transform", open ? "rotate-180" : "")}
              />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
          <div className="max-h-64 overflow-y-auto pr-1">
            <div className="space-y-2">
              {options.map((option) => {
                const active = selectedKeySet.has(option.key);

                return (
                  <label
                    key={option.key}
                    aria-label={`Toggle ${option.label}`}
                    className={cn(
                      "flex cursor-pointer items-start justify-between gap-3 rounded-[8px] border px-3 py-2.5 transition",
                      active
                        ? "border-transparent bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-white/40 hover:bg-black/5",
                    )}
                  >
                    <span className="min-w-0 space-y-1">
                      <span className="flex items-center gap-2">
                        <ProviderIcon
                          providerId={option.providerId}
                          className="size-3.5"
                          withTooltip
                        />
                        <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
                          {getModelDisplayName(option.modelId, option.providerId)}
                        </span>
                      </span>
                      <span className="block text-xs text-[var(--muted-foreground)]">
                        {formatCurrency(option.totalCost)} •{" "}
                        {formatCompactNumber(option.totalTokens)} tokens
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => onToggle(option.key)}
                      className="mt-1 size-4 rounded border-[var(--border)] accent-[var(--accent)]"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function buildChartLines(
  data: TrendPoint[],
  lines: CostSeriesLine[],
  yAxisMax: number,
  metric: MetricKey,
) {
  const dateIndex = new Map(data.map((point, index) => [point.date, index]));
  const source =
    lines.length > 0
      ? lines
      : [{ key: "total", label: "Total spend", points: data, providerId: "", modelId: "" }];

  return source.map((line) => ({
    key: line.key,
    path: line.points
      .map((point, index) => {
        const datePosition = dateIndex.get(point.date) ?? index;
        const x = data.length === 1 ? 360 : (datePosition / Math.max(data.length - 1, 1)) * 720;
        const y = 280 - Math.min(Math.max(point[metric] / yAxisMax, 0), 1) * 280;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" "),
  }));
}

function formatCurrencyCompact(value: number) {
  if (value >= 1_000) {
    return formatCompactNumber(value);
  }

  return formatCurrency(value);
}

function formatMetricValue(value: number, metric: MetricKey) {
  return metric === "cost" ? formatCurrencyCompact(value) : formatCompactNumber(value);
}

function computeYAxisMax(data: TrendPoint[], lines: CostSeriesLine[], metric: MetricKey) {
  let maxValue = 0;

  if (lines.length > 0) {
    for (const line of lines) {
      for (const point of line.points) {
        if (Number.isFinite(point[metric]) && point[metric] > maxValue) {
          maxValue = point[metric];
        }
      }
    }
  } else {
    for (const point of data) {
      if (Number.isFinite(point[metric]) && point[metric] > maxValue) {
        maxValue = point[metric];
      }
    }
  }

  if (maxValue <= 0) {
    return 1;
  }

  const paddedMax =
    maxValue * (maxValue <= 1 ? 1.5 : maxValue <= 5 ? 1.35 : maxValue <= 20 ? 1.22 : 1.14);
  return roundUpToNiceStep(paddedMax);
}

function roundUpToNiceStep(value: number) {
  if (value <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }
  if (normalized <= 1.5) {
    return 1.5 * magnitude;
  }
  if (normalized <= 2) {
    return 2 * magnitude;
  }
  if (normalized <= 2.5) {
    return 2.5 * magnitude;
  }
  if (normalized <= 3) {
    return 3 * magnitude;
  }
  if (normalized <= 4) {
    return 4 * magnitude;
  }
  if (normalized <= 5) {
    return 5 * magnitude;
  }
  if (normalized <= 7.5) {
    return 7.5 * magnitude;
  }

  return 10 * magnitude;
}
