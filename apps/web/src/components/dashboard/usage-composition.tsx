import { Cpu, DatabaseZap } from "lucide-react";
import type { HeatmapDay, RemoteUsageRow, TokenBreakdown } from "@opencode-dashboard/shared";
import { ResponsiveDisclosure } from "@/components/dashboard/responsive-disclosure";
import { formatCompactNumber } from "@/lib/format";

const TOKEN_GROUPS = [
  { key: "input", label: "Input", color: "var(--metric-violet)" },
  { key: "output", label: "Output", color: "var(--metric-orange)" },
  { key: "reasoning", label: "Reasoning", color: "var(--metric-gold)" },
  { key: "cacheRead", label: "Cache read", color: "var(--metric-green)" },
  { key: "cacheWrite", label: "Cache write", color: "var(--metric-teal)" },
] as const;

function sumBreakdowns(items: Array<{ breakdown: TokenBreakdown }>) {
  return items.reduce<TokenBreakdown>(
    (total, item) => ({
      input: total.input + item.breakdown.input,
      output: total.output + item.breakdown.output,
      reasoning: total.reasoning + item.breakdown.reasoning,
      cacheRead: total.cacheRead + item.breakdown.cacheRead,
      cacheWrite: total.cacheWrite + item.breakdown.cacheWrite,
    }),
    { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
  );
}

function totalTokens(breakdown: TokenBreakdown) {
  return TOKEN_GROUPS.reduce((total, group) => total + breakdown[group.key], 0);
}

export function UsageComposition({
  localDays,
  remoteRows,
}: {
  localDays: HeatmapDay[];
  remoteRows: RemoteUsageRow[];
}) {
  const local = sumBreakdowns(localDays);
  const remote = sumBreakdowns(remoteRows);
  const combined = TOKEN_GROUPS.reduce<TokenBreakdown>(
    (total, group) => ({ ...total, [group.key]: local[group.key] + remote[group.key] }),
    { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
  );
  const total = totalTokens(combined);
  const cacheTokens = combined.cacheRead + combined.cacheWrite;

  return (
    <div className="px-4 sm:px-8 lg:px-10">
      <ResponsiveDisclosure label="Token details">
        <section className="grid gap-6 border-y border-[var(--border)] py-5 lg:grid-cols-[0.72fr_1.28fr] lg:py-6">
          <div>
            <p className="metric-label">
              <Cpu className="size-3.5" />
              Token mix
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
              How tokens are used
            </h2>
            <p className="mt-2 max-w-lg text-xs leading-5 text-[var(--muted-foreground)]">
              Input, output, reasoning, and cache activity across local and Remote usage.
            </p>
            <div className="mt-6 grid grid-cols-2 divide-x divide-[var(--border)] border-y border-[var(--border)]">
              <CompositionStat label="Cache share" value={total > 0 ? cacheTokens / total : 0} />
              <CompositionStat
                label="Reasoning share"
                value={total > 0 ? combined.reasoning / total : 0}
              />
            </div>
          </div>

          <div className="grid content-start gap-3">
            <div
              role="img"
              aria-label="Combined token composition"
              className="flex h-3 overflow-hidden rounded-full bg-[var(--panel-strong)]"
            >
              {TOKEN_GROUPS.map((group) => (
                <span
                  key={group.key}
                  style={{
                    width: `${total > 0 ? (combined[group.key] / total) * 100 : 0}%`,
                    background: group.color,
                  }}
                />
              ))}
            </div>
            <div className="grid divide-y divide-[var(--border)] border-y border-[var(--border)] sm:grid-cols-5 sm:divide-x sm:divide-y-0">
              {TOKEN_GROUPS.map((group) => (
                <div key={group.key} className="p-3">
                  <p className="flex items-center gap-2 text-[10px] font-medium text-[var(--muted-foreground)]">
                    <span className="size-2 rounded-full" style={{ background: group.color }} />
                    {group.label}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">
                    {formatCompactNumber(combined[group.key])}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                    {total > 0 ? `${Math.round((combined[group.key] / total) * 100)}%` : "0%"}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
              <span className="inline-flex items-center gap-2">
                <DatabaseZap className="size-3.5" /> Local {formatCompactNumber(totalTokens(local))}
              </span>
              <span>Remote {formatCompactNumber(totalTokens(remote))}</span>
              <span className="ml-auto font-medium text-[var(--foreground)]">
                Total {formatCompactNumber(total)}
              </span>
            </div>
          </div>
        </section>
      </ResponsiveDisclosure>
    </div>
  );
}

function CompositionStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3">
      <p className="text-[10px] font-medium text-[var(--muted-foreground)]">{label}</p>
      <p className="metric-value mt-2 text-xl">{Math.round(value * 100)}%</p>
    </div>
  );
}
