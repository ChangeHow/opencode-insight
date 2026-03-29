import { memo, useState } from "react";
import type { ComponentType } from "react";
import { useAtom } from "jotai";
import { Link } from "@tanstack/react-router";
import { Laptop, MoonStar, SunMedium } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { CostSeriesLine } from "@opencode-dashboard/shared";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { ProviderInsightsPage as ProviderInsightsPanel } from "@/components/dashboard/provider-insights-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { RangePicker } from "@/components/dashboard/range-picker";
import { themeAtom } from "@/lib/atoms";
import { getPresetDateRange } from "@/lib/date-range";
import {
  formatCompactNumber,
  formatCurrency,
  formatDateLabel,
  formatDateWithYearLabel,
} from "@/lib/format";
import { HeaderRefreshButton } from "./layout";
export function formatDateSpan(start?: string, end?: string) {
  if (!start || !end) {
    return "Selected range";
  }

  const startLabel = formatDateWithYearLabel(start);
  const endLabel = formatDateWithYearLabel(end);

  return `${startLabel} - ${endLabel}`;
}

export function ControlBar({
  currentView,
  range,
  setRange,
  customDateRange,
  setCustomDateRange,
  scannedAt,
  onRefresh,
  canRefresh = false,
  refreshDisabledReason = "Refresh is only available when the selected range includes today.",
}: {
  currentView: "overview" | "providers";
  range: "7d" | "month" | "3mo" | "year";
  setRange: (nextRange: "7d" | "month" | "3mo" | "year") => void;
  customDateRange: { start: string; end: string };
  setCustomDateRange: (
    value:
      | { start: string; end: string }
      | ((current: { start: string; end: string }) => { start: string; end: string }),
  ) => void;
  scannedAt?: string;
  onRefresh: () => Promise<void>;
  canRefresh?: boolean;
  refreshDisabledReason?: string;
}) {
  const [theme, setTheme] = useAtom(themeAtom);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefreshClick() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex h-9 items-center rounded-[16px] border border-[var(--border)] bg-[var(--panel)] p-0.5">
          <Link
            to="/overview"
            className={`inline-flex h-[1.875rem] cursor-pointer items-center rounded-[12px] px-3 text-[11px] font-semibold uppercase tracking-[0.16em] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
              currentView === "overview"
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-black/5 hover:text-[var(--foreground)]"
            }`}
          >
            Overview
          </Link>
          <Link
            to="/providers"
            className={`inline-flex h-[1.875rem] cursor-pointer items-center rounded-[12px] px-3 text-[11px] font-semibold uppercase tracking-[0.16em] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
              currentView === "providers"
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-black/5 hover:text-[var(--foreground)]"
            }`}
          >
            Providers
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="text-right text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            <p>Latest scan</p>
            <p className="mt-1 text-xs font-semibold normal-case tracking-normal text-[var(--foreground)]">
              {scannedAt ? new Date(scannedAt).toLocaleTimeString("en-US") : "Loading..."}
            </p>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <ThemeToggleButton theme={theme} onChange={setTheme} />
          <HeaderRefreshButton
            canRefresh={canRefresh}
            refreshing={refreshing}
            disabledReason={refreshDisabledReason}
            onRefresh={handleRefreshClick}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <RangePicker
          value={range}
          onChange={(nextRange) => {
            setRange(nextRange);
            setCustomDateRange(getPresetDateRange(nextRange));
          }}
        />
        <DateRangePicker range={range} value={customDateRange} onChange={setCustomDateRange} />
      </div>
    </div>
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
  value: string;
  subline: string;
  accent: string;
  data: Array<{ date: string; tokens: number; cost: number; messages: number }>;
  dataKey: "tokens" | "cost" | "messages";
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className={className}>
      <CardContent className="space-y-4 p-5">
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            <Icon className="size-3.5" />
            {title}
          </p>
          <p className="text-[2rem] font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-[2.35rem]">
            {value}
          </p>
          <p className="text-xs leading-5 text-[var(--muted-foreground)]">{subline}</p>
        </div>
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--chart-surface)] p-3">
          <MiniSparkline data={data} dataKey={dataKey} accent={accent} />
        </div>
      </CardContent>
    </Card>
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
  value: string;
  detail: string;
  accent: string;
  data: Array<{ date: string; tokens: number; cost: number; messages: number }>;
  dataKey: "tokens" | "cost" | "messages";
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className={className}>
      <CardContent className="space-y-3.5 p-5">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            <Icon className="size-3.5" />
            {title}
          </p>
          <p className="text-[1.75rem] font-semibold tracking-[-0.03em] text-[var(--foreground)]">
            {value}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">{detail}</p>
        </div>
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--chart-surface)] p-3">
          <MiniSparkline data={data} dataKey={dataKey} accent={accent} />
        </div>
      </CardContent>
    </Card>
  );
}

function MiniSparkline({
  data,
  dataKey,
  accent,
}: {
  data: Array<{ date: string; tokens: number; cost: number; messages: number }>;
  dataKey: "tokens" | "cost" | "messages";
  accent: string;
}) {
  return (
    <div className="h-16">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="date" hide />
          <Tooltip
            cursor={{ stroke: "rgba(174, 85, 43, 0.18)", strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 18,
              border: "1px solid var(--border)",
              background: "var(--panel)",
              color: "var(--foreground)",
            }}
            formatter={(value) => [
              dataKey === "cost"
                ? formatCurrency(Number(value ?? 0))
                : formatCompactNumber(Number(value ?? 0)),
              dataKey === "cost" ? "Spend" : dataKey === "tokens" ? "Tokens" : "Messages",
            ]}
            labelFormatter={(label) => formatDateLabel(String(label))}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={accent}
            strokeWidth={2.5}
            dot={false}
            activeDot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LedgerSparkline({ line }: { line: CostSeriesLine | null }) {
  if (!line || line.points.length === 0) {
    return <div className="ml-auto h-8 w-40 rounded-full bg-black/5" />;
  }

  const width = 176;
  const height = 32;
  const max = Math.max(...line.points.map((point) => point.cost), 0);
  const points = line.points.map((point, index) => {
    const x = (index / Math.max(line.points.length - 1, 1)) * width;
    const y = max > 0 ? height - (point.cost / max) * (height - 4) - 2 : height - 4;
    return { x, y };
  });

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");

  return (
    <div className="ml-auto w-44">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-full overflow-visible">
        <path
          d={`${path} L ${width},${height} L 0,${height} Z`}
          fill="color-mix(in oklch, var(--accent) 16%, transparent)"
        />
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export const MemoLedgerSparkline = memo(LedgerSparkline);

export function OverviewEmptyState({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-72 flex-col items-start justify-center rounded-[22px] border border-dashed border-[var(--border)] bg-[var(--panel-strong)]/55 px-6 py-8 text-left">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
        {kicker}
      </p>
      <h3 className="mt-3 text-xl font-semibold text-[var(--foreground)]">{title}</h3>
      <p className="mt-3 max-w-xl text-xs leading-5 text-[var(--muted-foreground)]">
        {description}
      </p>
    </div>
  );
}

export function ThemeToggleButton({
  theme,
  onChange,
}: {
  theme: "light" | "dark" | "system";
  onChange: (value: "light" | "dark" | "system") => void;
}) {
  const [open, setOpen] = useState(false);
  const items = [
    { value: "light" as const, label: "Light", icon: SunMedium },
    { value: "dark" as const, label: "Dark", icon: MoonStar },
    { value: "system" as const, label: "System", icon: Laptop },
  ];
  const active = items.find((item) => item.value === theme) ?? items[2];
  const ActiveIcon = active.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Theme mode">
          <ActiveIcon className="size-4" />
          {active.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1.5" align="end">
        <div className="space-y-1">
          {items.map((item) => {
            const ItemIcon = item.icon;
            const selected = item.value === theme;

            return (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                className={`flex h-9 w-full items-center gap-2 rounded-[14px] px-3 text-sm outline-none transition ${
                  selected
                    ? "bg-[var(--accent-soft)] font-semibold text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)] hover:bg-black/5 hover:text-[var(--foreground)]"
                }`}
              >
                <ItemIcon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const MemoTrendChart = memo(TrendChart);
export const MemoProviderInsightsPanel = memo(ProviderInsightsPanel);
