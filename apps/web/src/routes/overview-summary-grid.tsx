import { Activity, Coins, Flame, Gauge, MessageSquare, ShieldCheck, Wallet } from "lucide-react";
import type {
  CostSeriesOption,
  DashboardSummary,
  RemoteUsagePayload,
  TrendPoint,
} from "@opencode-dashboard/shared";
import { CombinedMetricValue } from "@/components/dashboard/combined-metric-value";
import { CompactMetric, MetricPanel } from "@/components/dashboard/metric-panel";
import { ResponsiveDisclosure } from "@/components/dashboard/responsive-disclosure";
import { Card, CardContent } from "@/components/ui/card";
import { formatCompactNumber, formatCurrency, formatDateLabel } from "@/lib/format";
import { getModelDisplayName } from "@/lib/model-display";
import { buildCombinedOverviewMetrics } from "./overview-metrics";

export function OverviewSummaryGrid({
  summary,
  trend,
  seriesOptions,
  remoteUsage,
}: {
  summary: DashboardSummary | null;
  trend: TrendPoint[];
  seriesOptions: CostSeriesOption[];
  remoteUsage: RemoteUsagePayload | null;
}) {
  const combinedMetrics = buildCombinedOverviewMetrics({
    summary,
    trend,
    seriesOptions,
    remote: remoteUsage,
  });
  const hasPeriodData = (summary?.totalTokens ?? 0) > 0 || (summary?.totalMessages ?? 0) > 0;

  return (
    <div className="px-4 sm:px-8 lg:px-10">
      <Card className="overflow-hidden">
        <CardContent className="grid divide-y divide-[var(--border)] p-0 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <MetricPanel
            title="Estimated spend"
            value={
              summary ? (
                <CombinedMetricValue breakdown={combinedMetrics.cost} format={formatCurrency} />
              ) : (
                "—"
              )
            }
            subline={
              summary
                ? combinedMetrics.tokens.total > 0
                  ? `Coverage ${Math.round(combinedMetrics.pricingCoverage * 100)}% of ${formatCompactNumber(combinedMetrics.tokens.total)} tokens`
                  : "No retained usage in this period. OpenCode may have cleaned older sessions."
                : "Waiting for local pricing data"
            }
            accent="var(--accent)"
            data={combinedMetrics.trend}
            dataKey="cost"
            icon={Wallet}
          />
          <MetricPanel
            title="Total tokens"
            value={
              summary ? (
                <CombinedMetricValue
                  breakdown={combinedMetrics.tokens}
                  format={formatCompactNumber}
                />
              ) : (
                "—"
              )
            }
            subline={
              combinedMetrics.topModel
                ? `Top model ${getModelDisplayName(combinedMetrics.topModel.modelId, combinedMetrics.topModel.providerId)}`
                : hasPeriodData
                  ? "No model usage available"
                  : "No active model usage in this range"
            }
            accent="var(--accent)"
            data={combinedMetrics.trend}
            dataKey="tokens"
            icon={Coins}
          />
          <MetricPanel
            title="Messages"
            value={
              summary ? (
                <CombinedMetricValue
                  breakdown={combinedMetrics.messages}
                  format={formatCompactNumber}
                />
              ) : (
                "—"
              )
            }
            subline={
              combinedMetrics.messages.total > 0
                ? `${formatCompactNumber(combinedMetrics.tokens.total / combinedMetrics.messages.total)} tokens per message`
                : "No assistant messages in this range"
            }
            accent="var(--accent)"
            data={combinedMetrics.trend}
            dataKey="messages"
            icon={MessageSquare}
          />
        </CardContent>
      </Card>

      <ResponsiveDisclosure label="More metrics" className="mt-3">
        <div data-testid="secondary-metrics" className="grid md:grid-cols-2 xl:grid-cols-4">
          <CompactMetric
            className="border-b border-[var(--border)] xl:border-b-0"
            title="Active days"
            value={summary ? combinedMetrics.combinedActiveDays : "—"}
            detail={
              summary
                ? `${formatCompactNumber(combinedMetrics.messages.total)} messages across all machines`
                : "No data yet"
            }
            accent="var(--muted-foreground)"
            data={combinedMetrics.trend}
            dataKey="messages"
            icon={Activity}
          />
          <CompactMetric
            className="border-b border-[var(--border)] md:border-l xl:border-b-0"
            title="Spend / 1M tokens"
            value={
              summary && combinedMetrics.tokens.total > 0
                ? formatCurrency(
                    (combinedMetrics.cost.total / combinedMetrics.tokens.total) * 1_000_000,
                  )
                : "—"
            }
            detail={
              combinedMetrics.bestDay
                ? `Peak workload ${formatDateLabel(combinedMetrics.bestDay.date)}`
                : "No best day yet"
            }
            accent="var(--muted-foreground)"
            data={combinedMetrics.trend}
            dataKey="tokens"
            icon={Gauge}
          />
          <CompactMetric
            className="border-b border-[var(--border)] md:border-b-0 xl:border-l"
            title="Pricing coverage"
            value={summary ? `${Math.round(combinedMetrics.pricingCoverage * 100)}%` : "—"}
            detail="Priced tokens across local and Remote usage"
            accent="var(--muted-foreground)"
            data={combinedMetrics.trend}
            dataKey="cost"
            icon={ShieldCheck}
          />
          <CompactMetric
            className="md:border-l md:border-[var(--border)]"
            title="Longest streak"
            value={summary ? `${combinedMetrics.longestStreak}d` : "—"}
            detail={
              summary
                ? `Current streak ${combinedMetrics.currentStreak}d across all machines`
                : "No activity streak"
            }
            accent="var(--muted-foreground)"
            data={combinedMetrics.trend}
            dataKey="messages"
            icon={Flame}
          />
        </div>
      </ResponsiveDisclosure>
    </div>
  );
}
