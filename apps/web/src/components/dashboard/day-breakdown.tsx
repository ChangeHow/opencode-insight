import type { DayBreakdown } from "@opencode-dashboard/shared";
import { Badge } from "@/components/ui/badge";
import { formatCompactNumber, formatCurrency, formatLongDateLabel } from "@/lib/format";

export function DayBreakdownPanel({ day, loading }: { day: DayBreakdown | null; loading: boolean }) {
  if (loading) {
    return <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">Loading day detail...</div>;
  }

  if (!day) {
    return <div className="rounded-[28px] border border-dashed border-[var(--border)] bg-[var(--panel)] p-6 text-sm text-[var(--muted-foreground)]">Select a day to inspect model mix, message count, and token split.</div>;
  }

  return (
    <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
        <div className="space-y-3">
          <Badge>Selected day</Badge>
          <div>
            <h2 className="font-[Newsreader_Variable] text-3xl text-[var(--foreground)]">{formatLongDateLabel(day.date)}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
              {formatCompactNumber(day.tokens)} tokens across {day.messages} assistant messages.
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
      <div className="mt-5 space-y-3">
        {day.models.map((model) => (
          <div key={`${model.providerId}-${model.modelId}`} className="grid gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--panel-strong)] p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <p className="font-semibold text-[var(--foreground)]">{model.modelId}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{model.providerId}</p>
            </div>
            <Stat label="Tokens" value={formatCompactNumber(model.tokens)} />
            <Stat label="Messages" value={String(model.messages)} />
            <Stat label="Cost" value={formatCurrency(model.cost)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-2 text-base font-semibold text-[var(--foreground)]">{value}</p>
    </div>
  );
}
