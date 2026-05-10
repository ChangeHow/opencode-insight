import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Layers3, Wallet } from "lucide-react";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { getModelDisplayName } from "@/lib/model-display";
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
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  share: number;
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
                    {getModelDisplayName(model.modelId, model.providerId)}
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
    >
      <div className="mt-4 min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={entries} margin={{ top: 8, right: 4, left: -12, bottom: 18 }}>
            <CartesianGrid vertical={false} stroke="rgba(77, 61, 44, 0.1)" />
            <XAxis
              dataKey="modelId"
              interval={0}
              tickFormatter={formatModelAxisLabel}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(value: number) => formatCompactNumber(value)}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={54}
            />
            <Tooltip
              formatter={(value) => [formatCompactNumber(Number(value ?? 0)), "Tokens"]}
              labelFormatter={(_, payload) => payload?.[0]?.payload.label ?? "Model"}
              contentStyle={{
                borderRadius: 20,
                border: "1px solid var(--border)",
                background: "var(--panel)",
                color: "var(--foreground)",
              }}
            />
            <Bar dataKey="inputTokens" name="Input" stackId="tokens" fill={TOKEN_COLORS.input} />
            <Bar dataKey="outputTokens" name="Output" stackId="tokens" fill={TOKEN_COLORS.output} />
            <Bar
              dataKey="cacheTokens"
              name="Cache"
              stackId="tokens"
              fill={TOKEN_COLORS.cache}
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid gap-2">
        {entries.slice(0, 3).map((model) => (
          <div key={model.label} className="flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                <ProviderIcon providerId={model.providerId} className="size-3" withTooltip />
                {model.providerId}
              </p>
              <p className="truncate font-semibold text-[var(--foreground)]">
                {getModelDisplayName(model.modelId, model.providerId)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold text-[var(--foreground)]">
                {formatCompactNumber(model.tokens)}
              </p>
              <p className="text-[var(--muted-foreground)]">{model.share.toFixed(1)}%</p>
            </div>
          </div>
        ))}
      </div>
    </PinnedPanelShell>
  );
}

function formatModelAxisLabel(modelId: string) {
  return modelId.length > 10 ? `${modelId.slice(0, 10)}...` : modelId;
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
    <div className="flex h-auto w-full min-w-0 shrink-0 flex-col rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-5 md:h-full md:w-[32rem] md:min-w-[32rem] md:p-6">
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
