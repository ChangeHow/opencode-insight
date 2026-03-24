import { Activity, Building2, Wallet } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ProviderInsight } from "@opencode-dashboard/shared";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatCompactNumber, formatCurrency, formatDateLabel } from "@/lib/format";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function buildSummary(providers: ProviderInsight[]) {
  const totalCost = providers.reduce((sum, provider) => sum + provider.totalCost, 0);
  const totalTokens = providers.reduce((sum, provider) => sum + provider.totalTokens, 0);
  const totalMessages = providers.reduce((sum, provider) => sum + provider.totalMessages, 0);
  const totalPricedTokens = providers.reduce((sum, provider) => sum + provider.pricedTokens, 0);
  const activeProviders = providers.filter((provider) => provider.totalTokens > 0 || provider.totalMessages > 0).length;
  const averageCoverage = totalTokens === 0 ? 0 : totalPricedTokens / totalTokens;
  const topProvider = [...providers].sort((left, right) => right.totalCost - left.totalCost || right.totalTokens - left.totalTokens)[0] ?? null;

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
    return <div className="ml-auto h-8 w-44 rounded-full bg-black/5" />;
  }

  return (
    <div className="ml-auto h-8 w-44">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={provider.trend}>
          <Tooltip
            cursor={{ stroke: "rgba(174, 85, 43, 0.18)", strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "var(--panel)",
              color: "var(--foreground)",
            }}
            formatter={(value) => [formatCurrency(Number(value ?? 0)), "Spend"]}
            labelFormatter={(label) => formatDateLabel(String(label))}
          />
          <Line
            type="monotone"
            dataKey="cost"
            stroke="var(--accent)"
            strokeWidth={2.2}
            dot={false}
            activeDot={false}
          />
        </LineChart>
      </ResponsiveContainer>
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
}: {
  providers: ProviderInsight[];
  loading?: boolean;
  rangeLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}) {
  const summary = buildSummary(providers);
  const hasData = providers.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Provider insights</p>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--foreground)]">Provider usage summary</h1>
        <p className="text-xs text-[var(--muted-foreground)]">{rangeLabel}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Wallet className="size-3.5" />
              Total spend
            </p>
            <p className="text-3xl font-semibold tracking-[-0.03em]">{formatCurrency(summary.totalCost)}</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {summary.topProvider ? `Top ${summary.topProvider.providerId}` : "No top provider yet"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Building2 className="size-3.5" />
              Active providers
            </p>
            <p className="text-3xl font-semibold tracking-[-0.03em]">{summary.activeProviders}</p>
            <p className="text-xs text-[var(--muted-foreground)]">{formatCompactNumber(summary.totalMessages)} messages in scope</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Activity className="size-3.5" />
              Total tokens
            </p>
            <p className="text-3xl font-semibold tracking-[-0.03em]">{formatCompactNumber(summary.totalTokens)}</p>
            <p className="text-xs text-[var(--muted-foreground)]">Coverage {formatPercent(summary.averageCoverage)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Building2 className="size-3.5" />
              Provider count
            </p>
            <p className="text-3xl font-semibold tracking-[-0.03em]">{providers.length}</p>
            <p className="text-xs text-[var(--muted-foreground)]">Distinct providers in selected range</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Provider ledger</p>
            <h2 className="text-xl font-semibold text-[var(--foreground)]">Cost, token, and message footprint</h2>
            <p className="text-xs leading-5 text-[var(--muted-foreground)]">
              Compare each provider under the same period. Trend sparkline reflects daily spend.
            </p>
          </div>
          <Separator className="mt-4" />

            {loading ? (
              <div className="mt-5 space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-12 animate-pulse rounded-[14px] bg-black/5" />
                ))}
              </div>
            ) : !hasData ? (
              <div className="mt-6 rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--panel-strong)]/55 px-5 py-7">
                <p className="text-lg font-semibold text-[var(--foreground)]">{emptyTitle}</p>
                <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">{emptyDescription}</p>
                {emptyActionLabel && onEmptyAction ? (
                  <Button variant="outline" size="sm" className="mt-4" onClick={onEmptyAction}>
                    {emptyActionLabel}
                  </Button>
                ) : null}
              </div>
            ) : (
              <ScrollArea className="mt-5 w-full whitespace-nowrap">
                <table className="min-w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Provider</th>
                      <th className="w-[18rem] px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Trend</th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Spend</th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Tokens</th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Messages</th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Coverage</th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Active days</th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Models</th>
                      <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Top model</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((provider) => (
                      <tr key={provider.providerId} className="border-b border-[var(--border)]/70 last:border-b-0">
                        <td className="px-3 py-3">
                          <div className="inline-flex max-w-[12rem] items-center gap-2">
                            <ProviderIcon providerId={provider.providerId} className="size-4" />
                            <span className="truncate text-sm font-semibold text-[var(--foreground)]">{provider.providerId}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <ProviderTrend provider={provider} />
                        </td>
                        <td className="px-3 py-3 text-right text-sm font-semibold text-[var(--foreground)]">{formatCurrency(provider.totalCost)}</td>
                        <td className="px-3 py-3 text-right text-sm text-[var(--muted-foreground)]">{formatCompactNumber(provider.totalTokens)}</td>
                        <td className="px-3 py-3 text-right text-sm text-[var(--muted-foreground)]">{provider.totalMessages}</td>
                        <td className="px-3 py-3 text-right text-sm text-[var(--muted-foreground)]">{formatPercent(provider.pricingCoverage)}</td>
                        <td className="px-3 py-3 text-right text-sm text-[var(--muted-foreground)]">{provider.activeDays}</td>
                        <td className="px-3 py-3 text-right text-sm text-[var(--muted-foreground)]">{provider.modelCount}</td>
                        <td className="px-3 py-3 text-sm text-[var(--muted-foreground)]">
                          {provider.topModel ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="truncate">{provider.topModel.modelId}</span>
                              <span className="text-[11px] opacity-75">{formatCurrency(provider.topModel.cost)}</span>
                            </span>
                          ) : (
                            "—"
                          )}
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
  );
}
