import { useMemo } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { Activity, Coins, Flame, Rows3, Sparkles, Wallet } from "lucide-react";
import { ListLayoutShell } from "@/components/dashboard/list-layout-shell";
import { Heatmap } from "@/components/dashboard/heatmap";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
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
  selectedSeriesKeysAtom,
  seriesLinesAtom,
  seriesOptionsAtom,
  summaryAtom,
  trendAtom,
} from "@/lib/atoms";
import { formatCompactNumber, formatCurrency, formatDateLabel } from "@/lib/format";
import { useDashboardData } from "@/lib/use-dashboard-data";
import {
  CompactMetric,
  MemoLedgerSparkline,
  MemoTrendChart,
  MetricPanel,
  OverviewEmptyState,
} from "./shared";

export function DashboardPage() {
  useDashboardData();

  const navigate = useNavigate();
  const [selectedSeriesKeys, setSelectedSeriesKeys] = useAtom(selectedSeriesKeysAtom);
  const summary = useAtomValue(summaryAtom);
  const heatmap = useAtomValue(heatmapAtom);
  const trend = useAtomValue(trendAtom);
  const seriesOptions = useAtomValue(seriesOptionsAtom);
  const seriesLines = useAtomValue(seriesLinesAtom);
  const loading = useAtomValue(loadingAtom);
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
  const selectedVisibleLines = useMemo(
    () => visibleSeriesLines.filter((line) => selectedSeriesKeys.includes(line.key)),
    [selectedSeriesKeys, visibleSeriesLines],
  );
  const hasPeriodData = (summary?.totalTokens ?? 0) > 0 || (summary?.totalMessages ?? 0) > 0;

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
      <div className="grid gap-3 px-6 sm:px-8 lg:grid-cols-12 lg:px-10">
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
          subline={
            summary?.topModel
              ? `Top model ${summary.topModel.modelId}`
              : hasPeriodData
                ? "No model usage available"
                : "No active model usage in this range"
          }
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
          detail={
            summary?.bestDay ? `Peak ${formatDateLabel(summary.bestDay.date)}` : "No best day yet"
          }
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

      <div className="grid gap-5 px-6 sm:px-8 lg:px-10 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
        <Card>
          <CardContent className="flex h-full p-5 sm:p-6">
            {loading ? (
              <div className="grid w-full grid-cols-7 gap-2">
                {Array.from({ length: 42 }).map((_, index) => (
                  <div
                    key={index}
                    className="aspect-square animate-pulse rounded-[18px] bg-black/5"
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

        <Card>
          <CardContent className="w-full p-5 sm:p-6">
            {loading ? (
              <div className="h-72 animate-pulse rounded-[24px] bg-black/5" />
            ) : trend.length === 0 ? (
              <OverviewEmptyState
                kicker="Spend curves"
                title="No spend curve to draw"
                description="There are no retained messages inside the selected window, so the trend view is empty."
              />
            ) : (
              <MemoTrendChart
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

      <div className="px-6 sm:px-8 lg:px-10">
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                <Rows3 className="size-3.5" />
                Provider ledger
              </p>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                Model and provider summary
              </h2>
              <p className="text-xs leading-5 text-[var(--muted-foreground)]">
                Top 10 model and provider pairs with non-zero spend, tokens, or messages in the
                selected period.
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
              <ScrollArea className="mt-5 w-full whitespace-nowrap">
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
                      <tr
                        key={option.key}
                        className="border-b border-[var(--border)]/70 last:border-b-0"
                      >
                        <td className="max-w-[5rem] px-3 py-3">
                          <UiTooltipProvider>
                            <UiTooltip>
                              <UiTooltipTrigger asChild>
                                <div className="inline-flex max-w-full items-center gap-2">
                                  <ProviderIcon
                                    providerId={option.providerId}
                                    className="size-3.5"
                                  />
                                  <span className="truncate text-sm font-semibold text-[var(--foreground)]">
                                    {option.modelId}
                                  </span>
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
                          <MemoLedgerSparkline
                            line={
                              visibleSeriesLines.find((line) => line.key === option.key) ?? null
                            }
                          />
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
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </ListLayoutShell>
  );
}
