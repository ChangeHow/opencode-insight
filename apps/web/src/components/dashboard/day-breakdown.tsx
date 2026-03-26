import { Layers3, Pin } from "lucide-react";
import type { DayBreakdown } from "@opencode-dashboard/shared";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { CostByModelPanel, ModelTokenSharePanel } from "@/components/dashboard/model-breakdown-panels";
import { PinnedPlaceholderPanel } from "@/components/dashboard/pinned-placeholder-panel";
import { TokenBreakdownPanel } from "@/components/dashboard/token-breakdown-panel";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCompactNumber, formatCurrency, formatLongDateLabel } from "@/lib/format";

export function DayBreakdownPanel({ day, loading }: { day: DayBreakdown | null; loading: boolean }) {
  if (loading) {
    return <div className="mx-6 rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)] sm:mx-8 lg:mx-10">Loading day detail...</div>;
  }

  if (!day) {
    return <div className="mx-6 rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)] sm:mx-8 lg:mx-10">Select a day to inspect model mix, message count, and token split.</div>;
  }

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
      <div className="px-6 sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-[54rem] rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6">
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
      </div>

      <div className="w-full overflow-x-auto overflow-y-hidden">
        <div className="flex h-[26rem] w-max min-w-full gap-6 px-6 sm:px-8 lg:px-10">
          <TokenBreakdownPanel breakdown={day.breakdown} />

          <CostByModelPanel eyebrow="Pinned spend" entries={costByModel} />

          <ModelTokenSharePanel eyebrow="Pinned share" entries={modelTokenMix} />
          <PinnedPlaceholderPanel />
        </div>
      </div>

      <div className="px-6 sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-[54rem] rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6">
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
