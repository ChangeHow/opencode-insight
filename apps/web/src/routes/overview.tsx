import { useMemo } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { Rows3 } from "lucide-react";
import type { CostSeriesLine, CostSeriesOption } from "@opencode-dashboard/shared";
import { ListLayoutShell } from "@/components/dashboard/list-layout-shell";
import { Heatmap } from "@/components/dashboard/heatmap";
import { OverviewEmptyState } from "@/components/dashboard/overview-empty-state";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { RemoteUsagePanel } from "@/components/dashboard/remote-usage-panel";
import { ResponsiveDisclosure } from "@/components/dashboard/responsive-disclosure";
import { LedgerSparkline } from "@/components/dashboard/sparkline";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { UsageComposition } from "@/components/dashboard/usage-composition";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip as UiTooltip,
  TooltipContent as UiTooltipContent,
  TooltipProvider as UiTooltipProvider,
  TooltipTrigger as UiTooltipTrigger,
} from "@/components/ui/tooltip";
import {
  heatmapAtom,
  loadingAtom,
  rangeAtom,
  remoteUsageAtom,
  selectedSeriesKeysAtom,
  seriesLinesAtom,
  seriesOptionsAtom,
  summaryAtom,
  trendAtom,
} from "@/lib/atoms";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { formatDateSpan } from "@/lib/format";
import { getPresetDateRange } from "@/lib/date-range";
import { getModelDisplayName } from "@/lib/model-display";
import { useDashboardData } from "@/lib/use-dashboard-data";
import { OverviewSummaryGrid } from "./overview-summary-grid";

export function DashboardPage() {
  useDashboardData();

  const navigate = useNavigate();
  const [selectedSeriesKeys, setSelectedSeriesKeys] = useAtom(selectedSeriesKeysAtom);
  const range = useAtomValue(rangeAtom);
  const summary = useAtomValue(summaryAtom);
  const heatmap = useAtomValue(heatmapAtom);
  const trend = useAtomValue(trendAtom);
  const seriesOptions = useAtomValue(seriesOptionsAtom);
  const seriesLines = useAtomValue(seriesLinesAtom);
  const remoteUsage = useAtomValue(remoteUsageAtom);
  const loading = useAtomValue(loadingAtom);
  const presetDateRange = getPresetDateRange(range);
  const visibleSeriesOptions = useMemo(
    () =>
      seriesOptions
        .filter(
          (option) => option.totalCost > 0 || option.totalTokens > 0 || option.totalMessages > 0,
        )
        .slice(0, 10),
    [seriesOptions],
  );
  const visibleSeriesKeys = useMemo(
    () => new Set(visibleSeriesOptions.map((option) => option.key)),
    [visibleSeriesOptions],
  );
  const visibleSeriesLines = useMemo(
    () => seriesLines.filter((line) => visibleSeriesKeys.has(line.key)),
    [seriesLines, visibleSeriesKeys],
  );
  const visibleSeriesLineMap = useMemo(
    () => new Map(visibleSeriesLines.map((line) => [line.key, line])),
    [visibleSeriesLines],
  );
  const selectedSeriesKeySet = useMemo(() => new Set(selectedSeriesKeys), [selectedSeriesKeys]);
  const selectedVisibleLines = useMemo(
    () => visibleSeriesLines.filter((line) => selectedSeriesKeySet.has(line.key)),
    [selectedSeriesKeySet, visibleSeriesLines],
  );
  function handleSeriesToggle(key: string) {
    setSelectedSeriesKeys((current) => {
      if (current.includes(key)) {
        return current.length === 1 ? current : current.filter((item) => item !== key);
      }

      return [...current, key].slice(-4);
    });
  }

  return (
    <ListLayoutShell currentView="overview">
      <header className="px-4 pt-2 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="metric-label">OpenCode analytics</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[var(--foreground)] sm:text-4xl">
              Usage overview
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">
              Spend, throughput, and model efficiency across local and Remote usage.
            </p>
          </div>
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--muted-foreground)] sm:text-right">
            <p>
              {range === "all"
                ? "All retained history"
                : formatDateSpan(presetDateRange.start, presetDateRange.end)}
            </p>
            <p className="mt-1 font-medium text-[var(--foreground)]">
              Local {summary?.source.kind ?? "loading"} / Remote {remoteUsage?.status ?? "loading"}
            </p>
          </div>
        </div>
      </header>

      <OverviewSummaryGrid
        summary={summary}
        trend={trend}
        seriesOptions={seriesOptions}
        remoteUsage={remoteUsage}
      />

      <UsageComposition localDays={heatmap} remoteRows={remoteUsage?.rows ?? []} />

      <div
        data-testid="activity-panels"
        className="grid gap-5 px-4 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:px-10"
      >
        <Card data-testid="activity-calendar-panel" className="min-w-0">
          <CardContent className="flex h-full w-full p-3 sm:p-6">
            {loading ? (
              <div className="grid w-full grid-cols-7 gap-2">
                {Array.from({ length: 42 }).map((_, index) => (
                  <div
                    key={index}
                    className="aspect-square animate-pulse rounded-[8px] bg-black/5"
                  />
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

        <Card data-testid="activity-trend-panel" className="min-w-0">
          <CardContent className="flex h-full w-full p-4 sm:p-6">
            {loading ? (
              <div className="h-72 animate-pulse rounded-[10px] bg-black/5" />
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

      <RemoteUsagePanel remote={remoteUsage} />

      <div className="px-4 sm:px-8 lg:px-10">
        <ResponsiveDisclosure label="All model metrics">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                  <Rows3 className="size-3.5" />
                  Model metrics
                </p>
                <h2 className="text-xl font-semibold text-[var(--foreground)]">Model efficiency</h2>
                <p className="text-xs leading-5 text-[var(--muted-foreground)]">
                  Compare spend, throughput, and message volume for the ten busiest model routes.
                </p>
              </div>
              <div className="mt-4 border-t border-[var(--border)]" />
              {visibleSeriesOptions.length === 0 ? (
                <div className="mt-5">
                  <OverviewEmptyState
                    kicker="Provider ledger"
                    title="No retained model activity"
                    description="OpenCode may have cleaned older sessions for this window. Expand the preset or use a custom date range."
                  />
                </div>
              ) : (
                <>
                  <div className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)] md:hidden">
                    {visibleSeriesOptions.map((option) => (
                      <div key={option.key} className="py-4">
                        <div className="flex items-start justify-between gap-3">
                          <UiTooltipProvider>
                            <UiTooltip>
                              <UiTooltipTrigger asChild>
                                <div className="inline-flex min-w-0 items-center gap-2">
                                  <ProviderIcon
                                    providerId={option.providerId}
                                    className="size-3.5"
                                  />
                                  <span className="truncate text-sm font-semibold text-[var(--foreground)]">
                                    {getModelDisplayName(option.modelId, option.providerId)}
                                  </span>
                                </div>
                              </UiTooltipTrigger>
                              <UiTooltipContent>
                                <p className="font-semibold">
                                  {getModelDisplayName(option.modelId, option.providerId)}
                                </p>
                                <p className="mt-1 text-[11px] opacity-80">{option.providerId}</p>
                              </UiTooltipContent>
                            </UiTooltip>
                          </UiTooltipProvider>
                          <p className="shrink-0 text-sm font-semibold text-[var(--foreground)]">
                            {formatCurrency(option.totalCost)}
                          </p>
                        </div>
                        <div className="mt-3">
                          <LedgerSparkline line={visibleSeriesLineMap.get(option.key) ?? null} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 divide-x divide-[var(--border)] border-t border-[var(--border)] pt-3 text-xs">
                          <div className="pr-3">
                            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                              Tokens
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                              {formatCompactNumber(option.totalTokens)}
                            </p>
                          </div>
                          <div className="pl-3">
                            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                              Messages
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                              {option.totalMessages}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <ScrollArea className="mt-5 hidden w-full whitespace-nowrap md:block">
                    <table className="min-w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            Model
                          </th>
                          <th className="w-[18rem] px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            Trend
                          </th>
                          <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            Spend
                          </th>
                          <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            Tokens
                          </th>
                          <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            Messages
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleSeriesOptions.map((option) => (
                          <ModelMetricTableRow
                            key={option.key}
                            option={option}
                            line={visibleSeriesLineMap.get(option.key) ?? null}
                          />
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </>
              )}
            </CardContent>
          </Card>
        </ResponsiveDisclosure>
      </div>
    </ListLayoutShell>
  );
}

function ModelMetricTableRow({
  option,
  line,
}: {
  option: CostSeriesOption;
  line: CostSeriesLine | null;
}) {
  const modelName = getModelDisplayName(option.modelId, option.providerId);

  return (
    <tr className="border-b border-[var(--border)]/70 last:border-b-0">
      <td className="max-w-[5rem] px-3 py-3">
        <UiTooltipProvider>
          <UiTooltip>
            <UiTooltipTrigger asChild>
              <div className="inline-flex max-w-full items-center gap-2">
                <ProviderIcon providerId={option.providerId} className="size-3.5" />
                <span className="truncate text-sm font-semibold text-[var(--foreground)]">
                  {modelName}
                </span>
              </div>
            </UiTooltipTrigger>
            <UiTooltipContent>
              <p className="font-semibold">{modelName}</p>
              <p className="mt-1 text-[11px] opacity-80">{option.providerId}</p>
            </UiTooltipContent>
          </UiTooltip>
        </UiTooltipProvider>
      </td>
      <td className="px-3 py-3">
        <LedgerSparkline line={line} />
      </td>
      <td className="px-3 py-3 text-right text-sm font-semibold text-[var(--foreground)]">
        {formatCurrency(option.totalCost)}
      </td>
      <td className="px-3 py-3 text-right text-sm text-[var(--muted-foreground)]">
        {formatCompactNumber(option.totalTokens)}
      </td>
      <td className="px-3 py-3 text-right text-sm text-[var(--muted-foreground)]">
        {option.totalMessages}
      </td>
    </tr>
  );
}
