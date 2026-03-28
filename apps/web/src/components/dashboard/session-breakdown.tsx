import type { SessionBreakdown } from "@opencode-dashboard/shared";
import { Layers3, Pin } from "lucide-react";
import { HorizontalPanelRail } from "@/components/dashboard/horizontal-panel-rail";
import {
  CostByModelPanel,
  ModelTokenSharePanel,
} from "@/components/dashboard/model-breakdown-panels";
import { TokenBreakdownPanel } from "@/components/dashboard/token-breakdown-panel";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Stat } from "@/components/dashboard/stat";
import { formatCompactNumber, formatCurrency, formatLongDateLabel } from "@/lib/format";

export function SessionBreakdownPanel({
  date,
  session,
}: {
  date: string;
  session: SessionBreakdown;
}) {
  const sortedModels = [...session.models].toSorted((a, b) => b.cost - a.cost);
  const costByModel = sortedModels.slice(0, 6).map((model) => ({
    label: `${model.providerId} / ${model.modelId}`,
    providerId: model.providerId,
    modelId: model.modelId,
    cost: Number(model.cost.toFixed(4)),
    tokens: model.tokens,
  }));

  const modelTokenMix = sortedModels.slice(0, 6).map((model) => {
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
                  Session
                </Badge>
                <Badge variant="muted">Detail view</Badge>
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-[-0.02em] text-[var(--foreground)]">
                  {session.title || "Untitled session"}
                </h2>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{session.directory}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
                  {formatLongDateLabel(date)} • {formatCompactNumber(session.tokens)} tokens across{" "}
                  {session.messages} assistant messages, with {formatCurrency(session.cost)} in
                  estimated spend.
                </p>
              </div>
            </div>
            <div className="grid min-w-56 grid-cols-2 gap-4 text-sm">
              <Stat label="Input" value={formatCompactNumber(session.breakdown.input)} />
              <Stat label="Output" value={formatCompactNumber(session.breakdown.output)} />
              <Stat label="Reasoning" value={formatCompactNumber(session.breakdown.reasoning)} />
              <Stat label="Estimated cost" value={formatCurrency(session.cost)} />
            </div>
          </div>
        </div>
      </div>

      <HorizontalPanelRail contentClassName="h-[26rem] gap-6 px-6 sm:px-8 lg:px-10">
        <TokenBreakdownPanel breakdown={session.breakdown} eyebrow="Token mix" />
        <CostByModelPanel eyebrow="Session spend" entries={costByModel} />
        <ModelTokenSharePanel eyebrow="Model share" entries={modelTokenMix} />
      </HorizontalPanelRail>

      <div className="px-6 sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-[54rem] rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              <Layers3 className="size-3.5" />
              Model ledger
            </p>
            <h3 className="text-xl font-semibold text-[var(--foreground)]">
              Provider and model detail
            </h3>
          </div>
          <Separator className="mt-4" />
          <div className="mt-5 space-y-3">
            {sortedModels.map((model) => (
              <div
                key={`${model.providerId}-${model.modelId}`}
                className="grid gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--panel-strong)] p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr]"
              >
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
