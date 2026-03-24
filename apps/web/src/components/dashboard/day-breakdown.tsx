import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Layers3, Pin, Wallet } from "lucide-react";
import type { DayBreakdown } from "@opencode-dashboard/shared";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatCompactNumber, formatCurrency, formatLongDateLabel } from "@/lib/format";

const TOKEN_COLORS = {
  input: "var(--metric-violet)",
  output: "var(--metric-orange)",
  reasoning: "var(--metric-gold)",
  cache: "var(--metric-green)",
};

export function DayBreakdownPanel({ day, loading }: { day: DayBreakdown | null; loading: boolean }) {
  if (loading) {
    return <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">Loading day detail...</div>;
  }

  if (!day) {
    return <div className="rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">Select a day to inspect model mix, message count, and token split.</div>;
  }

  const tokenBreakdown = [
    { label: "Input", value: day.breakdown.input, color: TOKEN_COLORS.input },
    { label: "Output", value: day.breakdown.output, color: TOKEN_COLORS.output },
    { label: "Reasoning", value: day.breakdown.reasoning, color: TOKEN_COLORS.reasoning },
    { label: "Cache", value: day.breakdown.cacheRead + day.breakdown.cacheWrite, color: TOKEN_COLORS.cache },
  ].filter((item) => item.value > 0);

  const costByModel = [...day.models]
    .sort((left, right) => right.cost - left.cost)
    .slice(0, 6)
    .map((model) => ({
      label: `${model.providerId} / ${model.modelId}`,
      providerId: model.providerId,
      modelId: model.modelId,
      cost: Number(model.cost.toFixed(4)),
      tokens: model.tokens,
    }));

  const modelTokenMix = [...day.models]
    .sort((left, right) => right.cost - left.cost)
    .slice(0, 6)
    .map((model) => {
      const cache = model.breakdown.cacheRead + model.breakdown.cacheWrite;
      const total = model.breakdown.input + model.breakdown.output + cache;
      return {
        label: `${model.providerId} / ${model.modelId}`,
        providerId: model.providerId,
        modelId: model.modelId,
        cost: model.cost,
        inputShare: total > 0 ? (model.breakdown.input / total) * 100 : 0,
        outputShare: total > 0 ? (model.breakdown.output / total) * 100 : 0,
        cacheShare: total > 0 ? (cache / total) * 100 : 0,
      };
    });

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-5xl rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="gap-2">
                <Pin className="size-3" />
                Pinned day
              </Badge>
              <Badge variant="muted">Detail view</Badge>
            </div>
            <div>
              <h2 className="text-3xl font-bold tracking-[-0.02em] text-[var(--foreground)]">{formatLongDateLabel(day.date)}</h2>
              <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
                {formatCompactNumber(day.tokens)} tokens across {day.messages} assistant messages, with {formatCurrency(day.cost)} in estimated spend.
              </p>
            </div>
          </div>
          <div className="grid min-w-56 grid-cols-2 gap-4 text-sm">
            <Stat label="Input" value={formatCompactNumber(day.breakdown.input)} />
            <Stat label="Output" value={formatCompactNumber(day.breakdown.output)} />
            <Stat label="Reasoning" value={formatCompactNumber(day.breakdown.reasoning)} />
            <Stat label="Estimated cost" value={formatCurrency(day.cost)} />
          </div>
        </div>
      </div>

      <ScrollArea className="w-full pb-3">
        <div className="inline-flex min-w-max gap-6 px-2">
        <div className="w-[38rem] min-w-[38rem] shrink-0 rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Layers3 className="size-3.5" />
              Pinned mix
            </p>
            <h3 className="text-xl font-semibold text-[var(--foreground)]">Token breakdown</h3>
          </div>
          <div className="mt-4 flex min-h-64 items-center gap-4">
            <div className="h-56 min-w-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tokenBreakdown}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={52}
                    outerRadius={92}
                    paddingAngle={2}
                  >
                    {tokenBreakdown.map((entry) => (
                      <Cell key={entry.label} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [formatCompactNumber(Number(value ?? 0)), "Tokens"]}
                    contentStyle={{
                      borderRadius: 20,
                      border: "1px solid var(--border)",
                      background: "var(--panel)",
                      color: "var(--foreground)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid min-w-44 content-center gap-2">
              {tokenBreakdown.map((entry) => (
                <div key={entry.label} className="rounded-[16px] border border-[var(--border)] bg-white/35 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: entry.color }} />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{entry.label}</span>
                  </div>
                  <p className="mt-1.5 text-base font-semibold text-[var(--foreground)]">{formatCompactNumber(entry.value)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="w-[38rem] min-w-[38rem] shrink-0 rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Wallet className="size-3.5" />
              Pinned spend
            </p>
            <h3 className="text-xl font-semibold text-[var(--foreground)]">Cost by model</h3>
          </div>
          <div className="mt-4 min-h-64">
            <div className="grid content-start gap-4">
            {costByModel.map((model) => (
              <div key={model.label} className="space-y-2">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                      <ProviderIcon providerId={model.providerId} className="size-3" withTooltip />
                      {model.providerId}
                    </p>
                    <p className="truncate text-sm font-semibold text-[var(--foreground)]">{model.modelId}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-[var(--foreground)]">{formatCurrency(model.cost)}</p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">{formatCompactNumber(model.tokens)} tokens</p>
                  </div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-black/6">
                  <div
                    className="h-full rounded-full bg-[var(--metric-amber)]"
                    style={{ width: `${Math.max((model.cost / Math.max(costByModel[0]?.cost ?? 0.0001, 0.0001)) * 100, 1.5)}%` }}
                  />
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>

        <div className="w-[38rem] min-w-[38rem] shrink-0 rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Layers3 className="size-3.5" />
              Pinned share
            </p>
            <h3 className="text-xl font-semibold text-[var(--foreground)]">Model token share</h3>
          </div>
          <Separator className="mt-4 opacity-80" />
          <ScrollArea className="mt-4 h-[25vh] min-h-64 pr-3">
            <div className="grid content-start gap-4 min-h-full">
            {modelTokenMix.map((model) => (
              <div key={model.label} className="space-y-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                    <ProviderIcon providerId={model.providerId} className="size-3" withTooltip />
                    {model.providerId}
                  </p>
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">{model.modelId}</p>
                </div>
                <div className="flex h-4 overflow-hidden rounded-full bg-black/6">
                  <div style={{ width: `${model.inputShare}%`, background: TOKEN_COLORS.input }} title={`Input ${model.inputShare.toFixed(1)}%`} />
                  <div style={{ width: `${model.outputShare}%`, background: TOKEN_COLORS.output }} title={`Output ${model.outputShare.toFixed(1)}%`} />
                  <div style={{ width: `${model.cacheShare}%`, background: TOKEN_COLORS.cache }} title={`Cache ${model.cacheShare.toFixed(1)}%`} />
                </div>
              </div>
            ))}
            </div>
          </ScrollArea>
          <div className="mt-4 flex flex-wrap gap-2">
            <LegendPill label="Input" color={TOKEN_COLORS.input} />
            <LegendPill label="Output" color={TOKEN_COLORS.output} />
            <LegendPill label="Cache" color={TOKEN_COLORS.cache} />
          </div>
        </div>
        <div className="w-[16rem] min-w-[16rem] shrink-0 rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--panel-strong)]/72 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="flex min-h-64 flex-col justify-between">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Placeholder</p>
              <h3 className="text-xl font-semibold text-[var(--foreground)]">More panels</h3>
              <p className="text-xs leading-5 text-[var(--muted-foreground)]">Reserved for additional pinned breakdowns and future provider-level callouts.</p>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Coming soon</p>
          </div>
        </div>
      </div>
      </ScrollArea>

      <div className="mx-auto max-w-5xl rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            <Layers3 className="size-3.5" />
            Model ledger
          </p>
          <h3 className="text-xl font-semibold text-[var(--foreground)]">Provider and model detail</h3>
        </div>
        <Separator className="mt-4" />
        <div className="mt-5 space-y-3">
          {day.models.map((model) => (
            <div key={`${model.providerId}-${model.modelId}`} className="grid gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--panel-strong)] p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
              <div>
                <p className="font-semibold text-[var(--foreground)]">{model.modelId}</p>
                <p className="mt-1">
                  <ProviderIcon providerId={model.providerId} className="size-3.5" withTooltip />
                </p>
              </div>
              <Stat label="Tokens" value={formatCompactNumber(model.tokens)} />
              <Stat label="Messages" value={String(model.messages)} />
              <Stat label="Cost" value={formatCurrency(model.cost)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function LegendPill({ label, color }: { label: string; color: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/40 px-3 py-2 text-xs font-semibold text-[var(--foreground)]">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}
