import { Activity, Coins, Flame, Sparkles, Wallet } from "lucide-react";
import type {
  CostSeriesOption,
  DashboardSummary,
  RemoteUsagePayload,
  TrendPoint,
} from "@opencode-dashboard/shared";
import { CombinedMetricValue } from "@/components/dashboard/combined-metric-value";
import { formatCompactNumber, formatCurrency, formatDateLabel } from "@/lib/format";
import { getModelDisplayName } from "@/lib/model-display";
import { CompactMetric, MetricPanel } from "./shared";
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
    <div className="grid gap-3 px-4 sm:px-8 lg:grid-cols-12 lg:px-10">
      <MetricPanel
        className="lg:col-span-6"
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
        accent="var(--metric-amber)"
        data={combinedMetrics.trend}
        dataKey="cost"
        icon={Wallet}
      />
      <MetricPanel
        className="lg:col-span-6"
        title="Total tokens"
        value={
          summary ? (
            <CombinedMetricValue breakdown={combinedMetrics.tokens} format={formatCompactNumber} />
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
        accent="var(--metric-violet)"
        data={combinedMetrics.trend}
        dataKey="tokens"
        icon={Coins}
      />
      <CompactMetric
        className="lg:col-span-4"
        title="Active cadence"
        value={summary ? summary.activeDays : "—"}
        detail={
          summary
            ? `${Math.round(summary.totalMessages)} assistant messages · Local only`
            : "No data yet"
        }
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
          summary?.bestDay
            ? `Peak ${formatDateLabel(summary.bestDay.date)} · Local only`
            : "No best day yet"
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
        detail={
          summary ? `Current streak ${summary.currentStreak}d · Local only` : "No activity streak"
        }
        accent="var(--metric-gold)"
        data={trend}
        dataKey="messages"
        icon={Flame}
      />
    </div>
  );
}
