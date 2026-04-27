import { Cloud, Server } from "lucide-react";
import type { RemoteUsagePayload, RemoteUsageRow } from "@opencode-dashboard/shared";
import { Card, CardContent } from "@/components/ui/card";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { getModelDisplayName } from "@/lib/model-display";

function getTopRows(rows: RemoteUsageRow[]) {
  return [...rows]
    .toSorted((left, right) => right.tokens - left.tokens || right.cost - left.cost)
    .slice(0, 6);
}

export function RemoteUsagePanel({ remote }: { remote: RemoteUsagePayload | null }) {
  if (!remote?.enabled) {
    return null;
  }

  const topRows = getTopRows(remote.rows);
  const hasRows = topRows.length > 0;

  return (
    <div className="px-4 sm:px-8 lg:px-10">
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
                <Cloud className="size-3.5" />
                Remote machines
              </p>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                Cross-device usage summary
              </h2>
              <p className="max-w-2xl text-xs leading-5 text-[var(--muted-foreground)]">
                Remote data is aggregated by machine, provider, model, and day. Session details stay
                on each source machine.
              </p>
              {remote.status === "stale" ? (
                <p className="text-xs font-medium text-[var(--accent)]">
                  Remote sync data is stale{remote.error ? `: ${remote.error}` : "."}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-2 text-right sm:min-w-[24rem]">
              <div className="rounded-[16px] border border-[var(--border)] bg-[var(--panel-strong)]/55 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Machines
                </p>
                <p className="mt-1 text-lg font-semibold">{remote.totals.machines}</p>
              </div>
              <div className="rounded-[16px] border border-[var(--border)] bg-[var(--panel-strong)]/55 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Tokens
                </p>
                <p className="mt-1 text-lg font-semibold">
                  {formatCompactNumber(remote.totals.tokens)}
                </p>
              </div>
              <div className="rounded-[16px] border border-[var(--border)] bg-[var(--panel-strong)]/55 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Spend
                </p>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(remote.totals.cost)}</p>
              </div>
            </div>
          </div>

          {hasRows ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {topRows.map((row) => (
                <div
                  key={`${row.machineId}:${row.date}:${row.providerId}:${row.modelId}`}
                  className="rounded-[20px] border border-[var(--border)] bg-[var(--panel-strong)]/55 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="flex items-center gap-2 text-[11px] font-semibold text-[var(--muted-foreground)]">
                        <Server className="size-3.5" />
                        <span className="truncate">{row.machineLabel}</span>
                      </p>
                      <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {getModelDisplayName(row.modelId, row.providerId)}
                      </p>
                      <p className="text-[11px] text-[var(--muted-foreground)]">{row.providerId}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-[var(--foreground)]">
                      {formatCompactNumber(row.tokens)}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                    <span>{row.messages} messages</span>
                    <span>{formatCurrency(row.cost)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[20px] border border-dashed border-[var(--border)] bg-[var(--panel-strong)]/55 px-5 py-6 text-sm text-[var(--muted-foreground)]">
              No remote machine usage in this range.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
