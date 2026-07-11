import { Cloud, Server } from "lucide-react";
import type { RemoteUsagePayload, RemoteUsageRow } from "@opencode-dashboard/shared";
import { ResponsiveDisclosure } from "@/components/dashboard/responsive-disclosure";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { getModelDisplayName } from "@/lib/model-display";

type MachineUsageCard = {
  machineId: string;
  machineLabel: string;
  tokens: number;
  cost: number;
  messages: number;
  topModelName: string;
};

function getTopRows(rows: RemoteUsageRow[]): MachineUsageCard[] {
  const machineMap = new Map<
    string,
    {
      machineId: string;
      machineLabel: string;
      tokens: number;
      cost: number;
      messages: number;
      modelTokens: Map<string, number>;
    }
  >();

  for (const row of rows) {
    const machine = machineMap.get(row.machineId) ?? {
      machineId: row.machineId,
      machineLabel: row.machineLabel,
      tokens: 0,
      cost: 0,
      messages: 0,
      modelTokens: new Map<string, number>(),
    };

    machine.tokens += row.tokens;
    machine.cost += row.cost;
    machine.messages += row.messages;

    const modelKey = `${row.providerId}:${row.modelId}`;
    const nextModelTokens = (machine.modelTokens.get(modelKey) ?? 0) + row.tokens;
    machine.modelTokens.set(modelKey, nextModelTokens);

    machineMap.set(row.machineId, machine);
  }

  return [...machineMap.values()]
    .map((machine) => {
      let topModelKey = "";
      let topModelTokens = -1;
      for (const [key, tokens] of machine.modelTokens) {
        if (tokens > topModelTokens) {
          topModelKey = key;
          topModelTokens = tokens;
        }
      }

      const [providerId = "", modelId = ""] = topModelKey.split(":");

      return {
        machineId: machine.machineId,
        machineLabel: machine.machineLabel,
        tokens: machine.tokens,
        cost: machine.cost,
        messages: machine.messages,
        topModelName: getModelDisplayName(modelId, providerId),
      };
    })
    .toSorted((left, right) => right.tokens - left.tokens || right.cost - left.cost)
    .slice(0, 6);
}

export function RemoteUsagePanel({ remote }: { remote: RemoteUsagePayload | null }) {
  if (!remote?.enabled) {
    return null;
  }

  const topRows = getTopRows(remote.rows);
  const hasRows = topRows.length > 0;
  const coverage =
    remote.totals.tokens > 0
      ? Math.round((remote.totals.pricedTokens / remote.totals.tokens) * 100)
      : 0;

  return (
    <div className="px-4 sm:px-8 lg:px-10">
      <section className="border-y border-[var(--border)] py-5 sm:py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="metric-label">
              <Cloud className="size-3.5" />
              Remote machines
            </p>
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
              Cross-device usage
            </h2>
            <p className="max-w-2xl text-xs leading-5 text-[var(--muted-foreground)]">
              Remote totals by machine. Session content stays on each source device.
            </p>
            {remote.status === "stale" ? (
              <div
                role="status"
                className="border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-xs font-semibold text-[var(--danger)]"
              >
                Cloudflare remote data is not reachable. Remote sync data is stale
                {remote.error ? `: ${remote.error}` : "."}
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 text-right sm:min-w-[25rem] sm:grid-cols-4">
            <div className="border-b border-[var(--border)] px-3 py-2 sm:border-b-0">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Machines
              </p>
              <p className="mt-1 text-lg font-semibold">{remote.totals.machines}</p>
            </div>
            <div
              data-testid="remote-token-stat"
              className="border-b border-l border-[var(--border)] px-3 py-2 sm:border-b-0"
            >
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Tokens
              </p>
              <p className="mt-1 text-lg font-semibold">
                {formatCompactNumber(remote.totals.tokens)}
              </p>
            </div>
            <div className="px-3 py-2 sm:border-l sm:border-[var(--border)]">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Spend
              </p>
              <p className="mt-1 text-lg font-semibold">{formatCurrency(remote.totals.cost)}</p>
            </div>
            <div className="border-l border-[var(--border)] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                Coverage
              </p>
              <p className="mt-1 text-lg font-semibold">{coverage}%</p>
            </div>
          </div>
        </div>

        <ResponsiveDisclosure label={`Remote machines (${topRows.length})`} className="mt-5">
          {hasRows ? (
            <div className="divide-y divide-[var(--border)] border-y border-[var(--border)] md:grid md:grid-cols-2 md:divide-x xl:grid-cols-3">
              {topRows.map((row) => (
                <div key={row.machineId} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)]">
                      <Server className="size-3.5" />
                      <span className="truncate">{row.machineLabel}</span>
                    </p>
                    <p className="shrink-0 text-sm font-semibold text-[var(--foreground)]">
                      {formatCompactNumber(row.tokens)}
                    </p>
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold text-[var(--foreground)]">
                    {row.topModelName}
                  </p>
                  <div className="mt-4 flex items-end justify-between">
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {formatCompactNumber(row.messages)} messages
                    </span>
                    <span className="text-base font-semibold text-[var(--foreground)]">
                      {formatCurrency(row.cost)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 border border-dashed border-[var(--border)] bg-[var(--panel-strong)]/55 px-5 py-6 text-sm text-[var(--muted-foreground)]">
              No remote machine usage in this range.
            </div>
          )}
        </ResponsiveDisclosure>
      </section>
    </div>
  );
}
