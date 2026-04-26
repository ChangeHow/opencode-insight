import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { ProviderInsight } from "@opencode-dashboard/shared";
import { ProviderIcon } from "@/components/dashboard/provider-icon";
import { formatCompactNumber, formatCurrency } from "@/lib/format";

export function ProviderLedgerMobileCard({
  provider,
  selected,
  onSelect,
  coverage,
  topModel,
  trend,
}: {
  provider: ProviderInsight;
  selected: boolean;
  onSelect?: (providerId: string) => void;
  coverage: string;
  topModel: string;
  trend: ReactNode;
}) {
  return (
    <div
      className={`rounded-[20px] border border-[var(--border)] bg-[var(--panel-strong)]/60 p-4 ${selected ? "border-[var(--accent)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        {onSelect ? (
          <button
            type="button"
            className="inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-full px-1 py-1 text-left outline-none transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            onClick={() => onSelect(provider.providerId)}
          >
            <ProviderIcon providerId={provider.providerId} className="size-4" />
            <span className="truncate text-sm font-semibold text-[var(--foreground)]">
              {provider.providerId}
            </span>
            <ChevronRight className="size-4 shrink-0 text-[var(--muted-foreground)]" />
          </button>
        ) : (
          <div className="inline-flex min-w-0 items-center gap-2">
            <ProviderIcon providerId={provider.providerId} className="size-4" />
            <span className="truncate text-sm font-semibold text-[var(--foreground)]">
              {provider.providerId}
            </span>
          </div>
        )}
        <p className="shrink-0 text-sm font-semibold text-[var(--foreground)]">
          {formatCurrency(provider.totalCost)}
        </p>
      </div>
      <div className="mt-3">{trend}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <LedgerCell label="Tokens" value={formatCompactNumber(provider.totalTokens)} />
        <LedgerCell label="Messages" value={String(provider.totalMessages)} />
        <LedgerCell label="Coverage" value={coverage} />
        <LedgerCell label="Active days" value={String(provider.activeDays)} />
      </div>
      <p className="mt-3 text-xs text-[var(--muted-foreground)]">{topModel}</p>
    </div>
  );
}

function LedgerCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--border)]/70 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}
