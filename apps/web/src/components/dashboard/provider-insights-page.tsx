import { useMemo } from "react";
import { Activity, Building2, ChevronRight, Wallet } from "lucide-react";
import type { ProviderInsight } from "@opencode-dashboard/shared";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCompactNumber, formatCurrency, formatDateLabel } from "@/lib/format";
import { getModelDisplayName } from "@/lib/model-display";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function buildSummary(providers: ProviderInsight[]) {
  const totalCost = providers.reduce((sum, provider) => sum + provider.totalCost, 0);
  const totalTokens = providers.reduce((sum, provider) => sum + provider.totalTokens, 0);
  const totalMessages = providers.reduce((sum, provider) => sum + provider.totalMessages, 0);
  const totalPricedTokens = providers.reduce((sum, provider) => sum + provider.pricedTokens, 0);
  const activeProviders = providers.filter(
    (provider) => provider.totalTokens > 0 || provider.totalMessages > 0,
  ).length;
  const averageCoverage = totalTokens === 0 ? 0 : totalPricedTokens / totalTokens;
  const topProvider =
    [...providers].toSorted(
      (left, right) => right.totalCost - left.totalCost || right.totalTokens - left.totalTokens,
    )[0] ?? null;

  return {
    totalCost,
    totalTokens,
    totalMessages,
    averageCoverage,
    activeProviders,
    topProvider,
  };
}

function ProviderTrend({ provider }: { provider: ProviderInsight }) {
  if (provider.trend.length === 0) {
    return (
      <div
        role="img"
        aria-label={`No daily spend trend for ${provider.providerId}`}
        className="h-8 w-full min-w-28 rounded-[8px] bg-black/5 md:ml-auto md:w-44"
      />
    );
  }

  const width = 176;
  const height = 32;
  const costs = provider.trend.map((point) => point.cost);
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  const spread = max - min;
  const points = provider.trend.map((point, index) => ({
    x: provider.trend.length === 1 ? width / 2 : (index / (provider.trend.length - 1)) * width,
    y: spread === 0 ? height / 2 : height - 2 - ((point.cost - min) / spread) * (height - 4),
  }));
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");
  const description = provider.trend
    .map((point) => `${formatDateLabel(point.date)} ${formatCurrency(point.cost)}`)
    .join(", ");

  return (
    <div className="h-8 w-full min-w-28 md:ml-auto md:w-44">
      <svg
        role="img"
        aria-label={`Daily spend trend for ${provider.providerId}`}
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full overflow-visible"
      >
        <title>{description}</title>
        {points.length === 1 ? (
          <circle cx={points[0]?.x} cy={points[0]?.y} r="2" fill="var(--accent)" />
        ) : (
          <path
            d={path}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </div>
  );
}

export function ProviderInsightsPage({
  providers,
  loading = false,
  rangeLabel = "Selected range",
  emptyTitle = "No provider activity in this period",
  emptyDescription = "OpenCode may have cleaned older sessions. Try a wider preset or adjust the custom date range.",
  emptyActionLabel,
  onEmptyAction,
  selectedProviderId,
  onSelectProvider,
}: {
  providers: ProviderInsight[];
  loading?: boolean;
  rangeLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  selectedProviderId?: string | null;
  onSelectProvider?: (providerId: string) => void;
}) {
  const summary = useMemo(() => buildSummary(providers), [providers]);
  const ledgerProviders = useMemo(
    () => providers.filter((provider) => provider.totalTokens > 0),
    [providers],
  );
  const hasLedgerData = ledgerProviders.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          Provider insights
        </p>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--foreground)]">
          Provider usage summary
        </h1>
        <p className="text-xs text-[var(--muted-foreground)]">{rangeLabel}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-[18px]">
          <CardContent className="space-y-2 p-4 sm:p-5">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Wallet className="size-3.5" />
              Total spend
            </p>
            <p className="text-3xl font-semibold tracking-[-0.03em]">
              {formatCurrency(summary.totalCost)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {summary.topProvider
                ? `Top ${summary.topProvider.providerId}`
                : "No top provider yet"}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[18px]">
          <CardContent className="space-y-2 p-4 sm:p-5">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Building2 className="size-3.5" />
              Active providers
            </p>
            <p className="text-3xl font-semibold tracking-[-0.03em]">{summary.activeProviders}</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {formatCompactNumber(summary.totalMessages)} messages in scope
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[18px]">
          <CardContent className="space-y-2 p-4 sm:p-5">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Activity className="size-3.5" />
              Total tokens
            </p>
            <p className="text-3xl font-semibold tracking-[-0.03em]">
              {formatCompactNumber(summary.totalTokens)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Coverage {formatPercent(summary.averageCoverage)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[18px]">
          <CardContent className="space-y-2 p-4 sm:p-5">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Building2 className="size-3.5" />
              Provider count
            </p>
            <p className="text-3xl font-semibold tracking-[-0.03em]">{providers.length}</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Distinct providers in selected range
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[18px]">
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              Provider ledger
            </p>
            <h2 className="text-xl font-semibold text-[var(--foreground)]">
              Cost, token, and message footprint
            </h2>
            <p className="text-xs leading-5 text-[var(--muted-foreground)]">
              Compare each provider under the same period. Trend sparkline reflects daily spend.
            </p>
          </div>
          <Separator className="mt-4" />

          {loading ? (
            <div className="mt-5 space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-[10px] bg-black/5" />
              ))}
            </div>
          ) : !hasLedgerData ? (
            <div className="mt-6 rounded-[12px] border border-dashed border-[var(--border)] bg-[var(--panel-strong)]/55 px-5 py-7">
              <p className="text-lg font-semibold text-[var(--foreground)]">{emptyTitle}</p>
              <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">
                {emptyDescription}
              </p>
              {emptyActionLabel && onEmptyAction ? (
                <Button variant="outline" size="sm" className="mt-4" onClick={onEmptyAction}>
                  {emptyActionLabel}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 overflow-visible pb-2">
              <div className="w-full overflow-x-auto md:whitespace-nowrap">
                <table className="block min-w-full border-collapse text-left md:table">
                  <thead className="sr-only md:not-sr-only md:table-header-group">
                    <tr className="border-b border-[var(--border)]">
                      <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        Provider
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
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        Coverage
                      </th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        Active days
                      </th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        Models
                      </th>
                      <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        Top model
                      </th>
                    </tr>
                  </thead>
                  <tbody className="grid gap-3 md:table-row-group">
                    {ledgerProviders.map((provider) => (
                      <tr
                        key={provider.providerId}
                        className={`grid grid-cols-2 gap-x-4 gap-y-3 rounded-[12px] border p-4 transition md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:p-0 md:last:border-b-0 ${selectedProviderId === provider.providerId ? "border-[var(--accent)] bg-[var(--panel-strong)]/75 md:bg-[var(--panel-strong)]/75" : "border-[var(--border)] bg-[var(--panel-strong)]/60 md:bg-transparent"}`}
                      >
                        <td className="col-span-2 p-0 md:table-cell md:px-3 md:py-3">
                          {onSelectProvider ? (
                            <button
                              type="button"
                              className="inline-flex max-w-[14rem] cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1 text-left outline-none transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                              onClick={() => onSelectProvider(provider.providerId)}
                            >
                              <ProviderIcon providerId={provider.providerId} className="size-4" />
                              <span className="truncate text-sm font-semibold text-[var(--foreground)]">
                                {provider.providerId}
                              </span>
                              <ChevronRight className="size-4 shrink-0 text-[var(--muted-foreground)]" />
                            </button>
                          ) : (
                            <div className="inline-flex max-w-[14rem] items-center gap-2">
                              <ProviderIcon providerId={provider.providerId} className="size-4" />
                              <span className="truncate text-sm font-semibold text-[var(--foreground)]">
                                {provider.providerId}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="col-span-2 p-0 md:table-cell md:w-[18rem] md:px-3 md:py-3">
                          <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)] md:hidden">
                            Daily spend trend
                          </span>
                          <ProviderTrend provider={provider} />
                        </td>
                        <td className="p-0 md:table-cell md:px-3 md:py-3 md:text-right">
                          <span className="block text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)] md:hidden">
                            Spend
                          </span>
                          <span className="text-sm font-semibold text-[var(--foreground)]">
                            {formatCurrency(provider.totalCost)}
                          </span>
                        </td>
                        <td className="p-0 md:table-cell md:px-3 md:py-3 md:text-right">
                          <span className="block text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)] md:hidden">
                            Tokens
                          </span>
                          <span className="text-sm text-[var(--muted-foreground)]">
                            {formatCompactNumber(provider.totalTokens)}
                          </span>
                        </td>
                        <td className="p-0 md:table-cell md:px-3 md:py-3 md:text-right">
                          <span className="block text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)] md:hidden">
                            Messages
                          </span>
                          <span className="text-sm text-[var(--muted-foreground)]">
                            {provider.totalMessages}
                          </span>
                        </td>
                        <td className="p-0 md:table-cell md:px-3 md:py-3 md:text-right">
                          <span className="block text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)] md:hidden">
                            Coverage
                          </span>
                          <span className="text-sm text-[var(--muted-foreground)]">
                            {formatPercent(provider.pricingCoverage)}
                          </span>
                        </td>
                        <td className="p-0 md:table-cell md:px-3 md:py-3 md:text-right">
                          <span className="block text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)] md:hidden">
                            Active days
                          </span>
                          <span className="text-sm text-[var(--muted-foreground)]">
                            {provider.activeDays}
                          </span>
                        </td>
                        <td className="p-0 md:table-cell md:px-3 md:py-3 md:text-right">
                          <span className="block text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)] md:hidden">
                            Models
                          </span>
                          <span className="text-sm text-[var(--muted-foreground)]">
                            {provider.modelCount}
                          </span>
                        </td>
                        <td className="col-span-2 p-0 md:table-cell md:px-3 md:py-3">
                          <span className="block text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)] md:hidden">
                            Top model
                          </span>
                          {provider.topModel ? (
                            <span className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                              <span className="truncate">
                                {getModelDisplayName(
                                  provider.topModel.modelId,
                                  provider.providerId,
                                )}
                              </span>
                              <span className="text-[11px] opacity-75">
                                {formatCurrency(provider.topModel.cost)}
                              </span>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
