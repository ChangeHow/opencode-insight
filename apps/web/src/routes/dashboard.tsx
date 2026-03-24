import { useEffect } from "react";
import type { ComponentType } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Activity, ChevronLeft, Coins, Flame, Laptop, MoonStar, RefreshCcw, Rows3, Sparkles, SunMedium, Wallet } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CostSeriesLine, CostSeriesOption } from "@opencode-dashboard/shared";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { ProviderInsightsPage as ProviderInsightsPanel } from "@/components/dashboard/provider-insights-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip as UiTooltip,
  TooltipContent as UiTooltipContent,
  TooltipProvider as UiTooltipProvider,
  TooltipTrigger as UiTooltipTrigger,
} from "@/components/ui/tooltip";
import { DayBreakdownPanel } from "@/components/dashboard/day-breakdown";
import { Heatmap } from "@/components/dashboard/heatmap";
import { RangePicker } from "@/components/dashboard/range-picker";
import { TrendChart } from "@/components/dashboard/trend-chart";
import {
  customDateRangeAtom,
  dayAtom,
  detailLoadingAtom,
  errorAtom,
  heatmapAtom,
  loadingAtom,
  providerInsightsAtom,
  rangeAtom,
  refreshTickAtom,
  selectedSeriesKeysAtom,
  seriesLinesAtom,
  seriesOptionsAtom,
  summaryAtom,
  themeAtom,
  trendAtom,
} from "@/lib/atoms";
import { fetchDay, refreshSnapshot } from "@/lib/api";
import { getPresetDateRange } from "@/lib/date-range";
import { formatCompactNumber, formatCurrency, formatDateLabel } from "@/lib/format";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { useState } from "react";

export function DashboardPage() {
  useDashboardData();

  const navigate = useNavigate();
  const [range, setRange] = useAtom(rangeAtom);
  const [customDateRange, setCustomDateRange] = useAtom(customDateRangeAtom);
  const [selectedSeriesKeys, setSelectedSeriesKeys] = useAtom(selectedSeriesKeysAtom);
  const summary = useAtomValue(summaryAtom);
  const heatmap = useAtomValue(heatmapAtom);
  const trend = useAtomValue(trendAtom);
  const seriesOptions = useAtomValue(seriesOptionsAtom);
  const seriesLines = useAtomValue(seriesLinesAtom);
  const loading = useAtomValue(loadingAtom);
  const error = useAtomValue(errorAtom);
  const bumpRefresh = useSetAtom(refreshTickAtom);
  const visibleSeriesOptions = seriesOptions.filter((option) => option.totalCost > 0 || option.totalTokens > 0 || option.totalMessages > 0).slice(0, 10);
  const visibleSeriesKeys = new Set(visibleSeriesOptions.map((option) => option.key));
  const visibleSeriesLines = seriesLines.filter((line) => visibleSeriesKeys.has(line.key));
  const selectedVisibleLines = visibleSeriesLines.filter((line) => selectedSeriesKeys.includes(line.key));
  const hasPeriodData = (summary?.totalTokens ?? 0) > 0 || (summary?.totalMessages ?? 0) > 0;

  async function handleRefresh() {
    await refreshSnapshot();
    bumpRefresh((current) => current + 1);
  }

  function handleSeriesToggle(key: string) {
    setSelectedSeriesKeys((current) => {
      if (current.includes(key)) {
        return current.length === 1 ? current : current.filter((item) => item !== key);
      }

      return [...current, key].slice(-4);
    });
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-7 lg:py-10">
        {error ? (
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-red-700">{error}</div>
        ) : null}

        <ControlBar
          currentView="overview"
          range={range}
          setRange={setRange}
          customDateRange={customDateRange}
          setCustomDateRange={setCustomDateRange}
          scannedAt={summary?.scannedAt}
          onRefresh={handleRefresh}
        />

        <div className="grid gap-3 lg:grid-cols-12">
          <MetricPanel
            className="lg:col-span-6"
            title="Estimated spend"
            value={summary ? formatCurrency(summary.totalCost) : "—"}
            subline={
              summary
                ? hasPeriodData
                  ? `Coverage ${Math.round(summary.pricingCoverage * 100)}% of ${formatCompactNumber(summary.totalTokens)} tokens`
                  : "No retained usage in this period. OpenCode may have cleaned older sessions."
                : "Waiting for local pricing data"
            }
            accent="var(--metric-amber)"
            data={trend}
            dataKey="cost"
            icon={Wallet}
          />
          <MetricPanel
            className="lg:col-span-6"
            title="Total tokens"
            value={summary ? formatCompactNumber(summary.totalTokens) : "—"}
            subline={summary?.topModel ? `Top model ${summary.topModel.modelId}` : hasPeriodData ? "No model usage available" : "No active model usage in this range"}
            accent="var(--metric-violet)"
            data={trend}
            dataKey="tokens"
            icon={Coins}
          />
          <CompactMetric
            className="lg:col-span-4"
            title="Active cadence"
            value={summary ? `${summary.activeDays}` : "—"}
            detail={summary ? `${summary.totalMessages} assistant messages` : "No data yet"}
            accent="var(--metric-green)"
            data={trend}
            dataKey="messages"
            icon={Activity}
          />
          <CompactMetric
            className="lg:col-span-4"
            title="Avg / active day"
            value={summary ? formatCompactNumber(summary.averageTokensPerActiveDay) : "—"}
            detail={summary?.bestDay ? `Peak ${formatDateLabel(summary.bestDay.date)}` : "No best day yet"}
            accent="var(--metric-orange)"
            data={trend}
            dataKey="tokens"
            icon={Sparkles}
          />
          <CompactMetric
            className="lg:col-span-4"
            title="Longest streak"
            value={summary ? `${summary.longestStreak}d` : "—"}
            detail={summary ? `Current streak ${summary.currentStreak}d` : "No activity streak"}
            accent="var(--metric-gold)"
            data={trend}
            dataKey="messages"
            icon={Flame}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
          <Card>
            <CardContent className="p-5 sm:p-6">
              {loading ? (
                <div className="grid grid-cols-7 gap-2">
                  {Array.from({ length: 42 }).map((_, index) => (
                    <div key={index} className="aspect-square animate-pulse rounded-[18px] bg-black/5" />
                  ))}
                </div>
              ) : heatmap.length === 0 ? (
                <OverviewEmptyState
                  kicker="Daily ledger"
                  title="No calendar activity in this range"
                  description="This period does not contain retained OpenCode sessions. Try a broader preset or set custom dates."
                />
              ) : (
                <Heatmap
                  days={heatmap}
                  selectedDate={null}
                  onSelect={(date) => {
                    void navigate({ to: "/detail/$date", params: { date } });
                  }}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 sm:p-6">
              {loading ? (
                <div className="h-72 animate-pulse rounded-[24px] bg-black/5" />
              ) : trend.length === 0 ? (
                <OverviewEmptyState
                  kicker="Spend curves"
                  title="No spend curve to draw"
                  description="There are no retained messages inside the selected window, so the trend view is empty."
                />
              ) : (
                <TrendChart
                  data={trend}
                  options={visibleSeriesOptions}
                  lines={selectedVisibleLines}
                  selectedKeys={selectedSeriesKeys}
                  onToggle={handleSeriesToggle}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                <Rows3 className="size-3.5" />
                Provider ledger
              </p>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">Model and provider summary</h2>
              <p className="text-xs leading-5 text-[var(--muted-foreground)]">Top 10 model and provider pairs with non-zero spend, tokens, or messages in the selected period.</p>
            </div>
            <Separator className="mt-4" />
            {visibleSeriesOptions.length === 0 ? (
              <div className="mt-5">
                <OverviewEmptyState
                  kicker="Provider ledger"
                  title="No retained model activity"
                  description="OpenCode may have cleaned older sessions for this window. Expand the preset or use a custom date range."
                />
              </div>
            ) : (
            <ScrollArea className="mt-5 w-full whitespace-nowrap">
              <table className="min-w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Model</th>
                    <th className="w-[18rem] px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Trend</th>
                    <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Spend</th>
                    <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Tokens</th>
                    <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSeriesOptions.map((option) => (
                    <tr key={option.key} className="border-b border-[var(--border)]/70 last:border-b-0">
                      <td className="max-w-[5rem] px-3 py-3">
                        <UiTooltipProvider>
                          <UiTooltip>
                            <UiTooltipTrigger asChild>
                              <div className="inline-flex max-w-full items-center gap-2">
                                <ProviderIcon providerId={option.providerId} className="size-3.5" />
                                <span className="truncate text-sm font-semibold text-[var(--foreground)]">{option.modelId}</span>
                              </div>
                            </UiTooltipTrigger>
                            <UiTooltipContent>
                              <p className="font-semibold">{option.modelId}</p>
                              <p className="mt-1 text-[11px] opacity-80">{option.providerId}</p>
                            </UiTooltipContent>
                          </UiTooltip>
                        </UiTooltipProvider>
                      </td>
                      <td className="px-3 py-3">
                        <LedgerSparkline line={visibleSeriesLines.find((line) => line.key === option.key) ?? null} />
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-semibold text-[var(--foreground)]">{formatCurrency(option.totalCost)}</td>
                      <td className="px-3 py-3 text-right text-sm text-[var(--muted-foreground)]">{formatCompactNumber(option.totalTokens)}</td>
                      <td className="px-3 py-3 text-right text-sm text-[var(--muted-foreground)]">{option.totalMessages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

export function ProvidersPage() {
  useDashboardData();

  const [range, setRange] = useAtom(rangeAtom);
  const [customDateRange, setCustomDateRange] = useAtom(customDateRangeAtom);
  const providers = useAtomValue(providerInsightsAtom);
  const summary = useAtomValue(summaryAtom);
  const loading = useAtomValue(loadingAtom);
  const error = useAtomValue(errorAtom);
  const bumpRefresh = useSetAtom(refreshTickAtom);

  async function handleRefresh() {
    await refreshSnapshot();
    bumpRefresh((current) => current + 1);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-7 lg:py-10">
        {error ? (
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-red-700">{error}</div>
        ) : null}

        <ControlBar
          currentView="providers"
          range={range}
          setRange={setRange}
          customDateRange={customDateRange}
          setCustomDateRange={setCustomDateRange}
          scannedAt={summary?.scannedAt}
          onRefresh={handleRefresh}
        />

        <ProviderInsightsPanel
          providers={providers}
          loading={loading}
          rangeLabel={formatDateSpan(customDateRange.start, customDateRange.end)}
          emptyActionLabel="Reset to this month"
          onEmptyAction={() => {
            setRange("month");
            setCustomDateRange(getPresetDateRange("month"));
          }}
        />
      </section>
    </main>
  );
}

function LedgerSparkline({ line }: { line: CostSeriesLine | null }) {
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

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");

  return (
    <div className="ml-auto w-44">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-full overflow-visible">
        <path
          d={`${path} L ${width},${height} L 0,${height} Z`}
          fill="color-mix(in oklch, var(--accent) 16%, transparent)"
        />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function DetailPage() {
  const { date } = useParams({ from: "/detail/$date" });
  const range = useAtomValue(rangeAtom);
  const customDateRange = useAtomValue(customDateRangeAtom);
  const [theme, setTheme] = useAtom(themeAtom);
  const [day, setDay] = useAtom(dayAtom);
  const [detailLoading, setDetailLoading] = useAtom(detailLoadingAtom);
  const [error, setError] = useAtom(errorAtom);

  useEffect(() => {
    let canceled = false;
    setDetailLoading(true);

    async function loadDetail() {
      try {
        const detail = await fetchDay(range, date, customDateRange);
        if (!canceled) {
          setDay(detail);
          setError(null);
        }
      } catch (loadError) {
        if (!canceled) {
          setDay(null);
          setError(loadError instanceof Error ? loadError.message : "Failed to load day detail.");
        }
      } finally {
        if (!canceled) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      canceled = true;
    };
  }, [customDateRange, date, range, setDay, setDetailLoading, setError]);

  return (
    <main className="bg-[var(--background)] text-[var(--foreground)]">
      <section className="w-full space-y-8 px-6 py-10 sm:px-8 lg:px-10 lg:py-14">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
          <div className="justify-self-start">
            <Link
              to="/overview"
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-4 text-sm font-semibold text-[var(--foreground)] outline-none transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <ChevronLeft className="size-4" />
              Back to overview
            </Link>
          </div>
          <p className="justify-self-center text-base font-semibold text-[var(--foreground)]">Daily spend detail for {date}</p>
          <div className="justify-self-end">
            <ThemeToggleButton theme={theme} onChange={setTheme} />
          </div>
        </div>

        {error && !detailLoading ? (
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-red-700">{error}</div>
        ) : null}

        <DayBreakdownPanel day={day} loading={detailLoading} />
      </section>
    </main>
  );
}

function ControlBar({
  currentView,
  range,
  setRange,
  customDateRange,
  setCustomDateRange,
  scannedAt,
  onRefresh,
}: {
  currentView: "overview" | "providers";
  range: "month" | "3mo" | "year";
  setRange: (nextRange: "month" | "3mo" | "year") => void;
  customDateRange: { start: string; end: string };
  setCustomDateRange: (value: { start: string; end: string } | ((current: { start: string; end: string }) => { start: string; end: string })) => void;
  scannedAt?: string;
  onRefresh: () => Promise<void>;
}) {
  const [theme, setTheme] = useAtom(themeAtom);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="inline-flex h-10 items-center rounded-[18px] border border-[var(--border)] bg-[var(--panel)] p-1">
          <Link
            to="/overview"
            className={`inline-flex h-8 cursor-pointer items-center rounded-[14px] px-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
              currentView === "overview"
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-black/5 hover:text-[var(--foreground)]"
            }`}
          >
            Overview
          </Link>
          <Link
            to="/providers"
            className={`inline-flex h-8 cursor-pointer items-center rounded-[14px] px-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
              currentView === "providers"
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-black/5 hover:text-[var(--foreground)]"
            }`}
          >
            Providers
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <div className="text-right text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            <p>Latest scan</p>
            <p className="mt-1.5 text-xs font-semibold normal-case tracking-normal text-[var(--foreground)]">
              {scannedAt ? new Date(scannedAt).toLocaleTimeString("en-US") : "Loading..."}
            </p>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <ThemeToggleButton theme={theme} onChange={setTheme} />
          <Button variant="outline" size="sm" onClick={() => void onRefresh()}>
            <RefreshCcw className="size-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2.5">
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

function formatDateSpan(start?: string, end?: string) {
  if (!start || !end) {
    return "Selected range";
  }

  const startLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${start}T00:00:00.000Z`));

  const endLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${end}T00:00:00.000Z`));

  return `${startLabel} - ${endLabel}`;
}

function MetricPanel({
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
          <p className="text-[2rem] font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-[2.35rem]">{value}</p>
          <p className="text-xs leading-5 text-[var(--muted-foreground)]">{subline}</p>
        </div>
        <div className="rounded-[18px] border border-[var(--border)] bg-[var(--chart-surface)] p-3">
          <MiniSparkline data={data} dataKey={dataKey} accent={accent} />
        </div>
      </CardContent>
    </Card>
  );
}

function CompactMetric({
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
          <p className="text-[1.75rem] font-semibold tracking-[-0.03em] text-[var(--foreground)]">{value}</p>
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
          <Tooltip
            cursor={{ stroke: "rgba(174, 85, 43, 0.18)", strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 18,
              border: "1px solid var(--border)",
              background: "var(--panel)",
              color: "var(--foreground)",
            }}
            formatter={(value) => [
              dataKey === "cost" ? formatCurrency(Number(value ?? 0)) : formatCompactNumber(Number(value ?? 0)),
              dataKey === "cost" ? "Spend" : dataKey === "tokens" ? "Tokens" : "Messages",
            ]}
            labelFormatter={(label) => formatDateLabel(String(label))}
          />
          <Line type="monotone" dataKey={dataKey} stroke={accent} strokeWidth={2.5} dot={false} activeDot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function OverviewEmptyState({
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">{kicker}</p>
      <h3 className="mt-3 text-xl font-semibold text-[var(--foreground)]">{title}</h3>
      <p className="mt-3 max-w-xl text-xs leading-5 text-[var(--muted-foreground)]">{description}</p>
    </div>
  );
}

function ThemeToggleButton({
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
                  selected ? "bg-[var(--accent-soft)] font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:bg-black/5 hover:text-[var(--foreground)]"
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
