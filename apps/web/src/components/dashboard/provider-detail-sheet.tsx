import { Activity, CalendarRange, Layers3, Wallet } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { ProviderDashboardPayload } from "@opencode-dashboard/shared";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCompactNumber,
  formatCurrency,
  formatDateLabel,
  formatDateWithYearLabel,
} from "@/lib/format";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDateSpan(start: string | undefined, end: string | undefined) {
  if (!start || !end) {
    return "Selected range";
  }

  return `${formatDateWithYearLabel(start)} - ${formatDateWithYearLabel(end)}`;
}

function DetailMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="rounded-[24px]">
      <CardContent className="space-y-2 p-5">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          <Icon className="size-3.5" />
          {label}
        </p>
        <p className="text-[1.9rem] font-semibold tracking-[-0.04em] text-[var(--foreground)]">
          {value}
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function ProviderDetailSheet({
  open,
  onOpenChange,
  providerId,
  detail,
  loading,
  error,
  customRange,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string | null;
  detail: ProviderDashboardPayload | null;
  loading: boolean;
  error: string | null;
  customRange: { start: string; end: string };
  onRetry: () => void;
}) {
  const provider = detail?.provider ?? null;
  const modelRows = [...(detail?.series.options ?? [])].toSorted(
    (left, right) => right.totalCost - left.totalCost || right.totalTokens - left.totalTokens,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <div className="flex items-start gap-4 pr-10">
            <div className="flex size-13 items-center justify-center rounded-[18px] border border-[var(--border)] bg-[var(--panel-strong)]">
              <ProviderIcon
                providerId={provider?.providerId ?? providerId ?? "unknown"}
                className="size-7"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Badge variant="muted" className="w-fit">
                Provider detail
              </Badge>
              <SheetTitle>{provider?.providerId ?? providerId ?? "Provider"}</SheetTitle>
              <SheetDescription>
                {provider
                  ? `${formatCurrency(provider.totalCost)} across ${formatDateSpan(customRange.start, customRange.end)}`
                  : "Inspect spend, coverage, and model mix for a single provider."}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {loading ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-30 rounded-[24px]" />
                ))}
              </div>
              <Skeleton className="h-56 rounded-[28px]" />
              <Skeleton className="h-72 rounded-[28px]" />
            </div>
          ) : error ? (
            <Card className="rounded-[24px] border-red-200 bg-red-50/80 shadow-none">
              <CardContent className="space-y-3 p-5">
                <p className="text-sm font-semibold text-red-800">Failed to load provider detail</p>
                <p className="text-sm text-red-700">{error}</p>
                <Button size="sm" variant="outline" onClick={onRetry}>
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : !provider || !detail ? (
            <Card className="rounded-[24px] border-dashed bg-[var(--panel-strong)]/45 shadow-none">
              <CardContent className="space-y-2 p-6">
                <p className="text-base font-semibold">Choose a provider</p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Select a row from the ledger to inspect model mix and daily spend.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <DetailMetric
                  icon={Wallet}
                  label="Total spend"
                  value={formatCurrency(provider.totalCost)}
                  detail={`Top model ${provider.topModel?.modelId ?? "-"}`}
                />
                <DetailMetric
                  icon={Activity}
                  label="Token footprint"
                  value={formatCompactNumber(provider.totalTokens)}
                  detail={`Coverage ${formatPercent(provider.pricingCoverage)}`}
                />
                <DetailMetric
                  icon={CalendarRange}
                  label="Active cadence"
                  value={`${provider.activeDays}`}
                  detail={`${provider.totalMessages} assistant messages in range`}
                />
                <DetailMetric
                  icon={Layers3}
                  label="Model mix"
                  value={`${provider.modelCount}`}
                  detail={`${modelRows.length} priced series available`}
                />
              </div>

              <Card className="rounded-[28px]">
                <CardContent className="space-y-4 p-5 sm:p-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                      Spend trajectory
                    </p>
                    <h3 className="text-xl font-semibold">Daily cost over time</h3>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Useful for spotting bursts, idle gaps, and expensive streaks.
                    </p>
                  </div>
                  <div className="h-64 rounded-[22px] border border-[var(--border)] bg-[var(--chart-surface)] p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={detail.trend}>
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatDateLabel}
                          stroke="var(--muted-foreground)"
                          fontSize={11}
                        />
                        <Tooltip
                          cursor={{ stroke: "rgba(174, 85, 43, 0.18)", strokeWidth: 1 }}
                          contentStyle={{
                            borderRadius: 18,
                            border: "1px solid var(--border)",
                            background: "var(--panel)",
                            color: "var(--foreground)",
                          }}
                          formatter={(value) => [formatCurrency(Number(value ?? 0)), "Spend"]}
                          labelFormatter={(label) => formatDateWithYearLabel(String(label))}
                        />
                        <Line
                          type="monotone"
                          dataKey="cost"
                          stroke="var(--accent)"
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[28px]">
                <CardContent className="space-y-4 p-5 sm:p-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                      Model ledger
                    </p>
                    <h3 className="text-xl font-semibold">Which models drive the bill</h3>
                  </div>
                  <Separator />
                  <ScrollArea className="w-full whitespace-nowrap">
                    <table className="min-w-full border-collapse text-left">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            Model
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
                        {modelRows.map((model) => (
                          <tr
                            key={model.key}
                            className="border-b border-[var(--border)]/70 last:border-b-0"
                          >
                            <td className="px-3 py-3">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-[var(--foreground)]">
                                  {model.modelId}
                                </p>
                                <p className="text-xs text-[var(--muted-foreground)]">
                                  {model.label}
                                </p>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right text-sm font-semibold text-[var(--foreground)]">
                              {formatCurrency(model.totalCost)}
                            </td>
                            <td className="px-3 py-3 text-right text-sm text-[var(--muted-foreground)]">
                              {formatCompactNumber(model.totalTokens)}
                            </td>
                            <td className="px-3 py-3 text-right text-sm text-[var(--muted-foreground)]">
                              {model.totalMessages}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
