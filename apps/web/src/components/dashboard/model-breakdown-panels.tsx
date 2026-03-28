import type { ReactNode } from "react";
import { Layers3, Wallet } from "lucide-react";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { TOKEN_COLORS } from "./token-breakdown-panel";

export interface CostByModelEntry {
  label: string;
  providerId: string;
  modelId: string;
  cost: number;
  tokens: number;
}

export interface ModelTokenShareEntry {
  label: string;
  providerId: string;
  modelId: string;
  inputShare: number;
  outputShare: number;
  cacheShare: number;
}

export function CostByModelPanel({
  eyebrow,
  entries,
}: {
  eyebrow: string;
  entries: CostByModelEntry[];
}) {
  const maxCost = Math.max(entries[0]?.cost ?? 0.0001, 0.0001);

  return (
    <PinnedPanelShell
      icon={<Wallet className="size-3.5" />}
      eyebrow={eyebrow}
      title="Cost by model"
    >
      <ScrollArea className="mt-4 min-h-0 flex-1 pr-3">
        <div className="grid content-start gap-4 pb-1">
          {entries.map((model) => (
            <div key={model.label} className="space-y-2">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                    <ProviderIcon providerId={model.providerId} className="size-3" withTooltip />
                    {model.providerId}
                  </p>
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                    {model.modelId}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {formatCurrency(model.cost)}
                  </p>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    {formatCompactNumber(model.tokens)} tokens
                  </p>
                </div>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-black/6">
                <div
                  className="h-full rounded-full bg-[var(--metric-amber)]"
                  style={{ width: `${Math.max((model.cost / maxCost) * 100, 1.5)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </PinnedPanelShell>
  );
}

export function ModelTokenSharePanel({
  eyebrow,
  entries,
}: {
  eyebrow: string;
  entries: ModelTokenShareEntry[];
}) {
  return (
    <PinnedPanelShell
      icon={<Layers3 className="size-3.5" />}
      eyebrow={eyebrow}
      title="Model token share"
      separator
      footer={
        <>
          <LegendPill label="Input" color={TOKEN_COLORS.input} />
          <LegendPill label="Output" color={TOKEN_COLORS.output} />
          <LegendPill label="Cache" color={TOKEN_COLORS.cache} />
        </>
      }
    >
      <ScrollArea className="mt-4 min-h-0 flex-1 pr-3">
        <div className="grid content-start gap-4 pb-1">
          {entries.map((model) => (
            <div key={model.label} className="space-y-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  <ProviderIcon providerId={model.providerId} className="size-3" withTooltip />
                  {model.providerId}
                </p>
                <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                  {model.modelId}
                </p>
              </div>
              <div className="flex h-4 overflow-hidden rounded-full bg-black/6">
                <div
                  style={{ width: `${model.inputShare}%`, background: TOKEN_COLORS.input }}
                  title={`Input ${model.inputShare.toFixed(1)}%`}
                />
                <div
                  style={{ width: `${model.outputShare}%`, background: TOKEN_COLORS.output }}
                  title={`Output ${model.outputShare.toFixed(1)}%`}
                />
                <div
                  style={{ width: `${model.cacheShare}%`, background: TOKEN_COLORS.cache }}
                  title={`Cache ${model.cacheShare.toFixed(1)}%`}
                />
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </PinnedPanelShell>
  );
}

function PinnedPanelShell({
  icon,
  eyebrow,
  title,
  children,
  footer,
  separator = false,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  separator?: boolean;
}) {
  return (
    <div className="flex h-full w-[32rem] min-w-[32rem] shrink-0 flex-col rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          {icon}
          {eyebrow}
        </p>
        <h3 className="text-xl font-semibold text-[var(--foreground)]">{title}</h3>
      </div>
      {separator ? <Separator className="mt-4 opacity-80" /> : null}
      {children}
      {footer ? <div className="mt-4 flex flex-wrap gap-2 pt-1">{footer}</div> : null}
    </div>
  );
}

function LegendPill({ label, color }: { label: string; color: string }) {
  return (
    <div className="ui-pill-chip">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}
