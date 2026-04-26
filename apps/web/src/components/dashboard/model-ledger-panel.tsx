import React from "react";
import type { ModelBreakdown } from "@opencode-dashboard/shared";
import { Layers3 } from "lucide-react";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { Stat } from "@/components/dashboard/stat";
import { Separator } from "@/components/ui/separator";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { getModelDisplayName } from "@/lib/model-display";

export function ModelLedgerPanel({ models }: { models: ModelBreakdown[] }) {
  return (
    <div className="px-4 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[54rem] rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-5 sm:p-6">
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
        <div className="mt-5 max-h-[450px] overflow-y-auto space-y-3">
          {models.map((model) => (
            <div
              key={`${model.providerId}-${model.modelId}`}
              className="grid gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--panel-strong)] p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr]"
            >
              <div>
                <p className="font-semibold text-[var(--foreground)]">
                  {getModelDisplayName(model.modelId, model.providerId)}
                </p>
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
