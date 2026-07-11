import { Layers3 } from "lucide-react";
import type { TokenBreakdown } from "@opencode-dashboard/shared";
import { TOKEN_COLORS } from "@/lib/chart-colors";
import { formatCompactNumber } from "@/lib/format";

function buildTokenBreakdown(breakdown: TokenBreakdown) {
  const items = [
    { label: "Input", value: breakdown.input, color: TOKEN_COLORS.input },
    { label: "Output", value: breakdown.output, color: TOKEN_COLORS.output },
    { label: "Reasoning", value: breakdown.reasoning, color: TOKEN_COLORS.reasoning },
    {
      label: "Cache",
      value: breakdown.cacheRead + breakdown.cacheWrite,
      color: TOKEN_COLORS.cache,
    },
  ].filter((item) => item.value > 0);

  const total = items.reduce((sum, item) => sum + item.value, 0);

  return items.map((item) => ({
    ...item,
    share: total > 0 ? (item.value / total) * 100 : 0,
  }));
}

function formatShare(value: number) {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function TokenBreakdownPanel({
  breakdown,
  title = "Token breakdown",
  eyebrow = "Pinned mix",
}: {
  breakdown: TokenBreakdown;
  title?: string;
  eyebrow?: string;
}) {
  const tokenBreakdown = buildTokenBreakdown(breakdown);
  const totalTokens = tokenBreakdown.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const segments = tokenBreakdown.map((item) => {
    const start = cursor;
    cursor += item.share;
    return `${item.color} ${start}% ${cursor}%`;
  });

  return (
    <div className="flex h-auto w-full min-w-0 shrink-0 flex-col rounded-[6px] border border-[var(--border)] bg-[var(--panel)] p-5 md:h-full md:w-[38rem] md:min-w-[38rem] md:p-6">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          <Layers3 className="size-3.5" />
          {eyebrow}
        </p>
        <h3 className="text-xl font-semibold text-[var(--foreground)]">{title}</h3>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 md:items-center lg:flex-row">
        <div className="relative mx-auto size-48 shrink-0 lg:size-52">
          <div
            role="img"
            aria-label="Token breakdown chart"
            className="absolute inset-0 rounded-full"
            style={{
              background:
                segments.length > 0
                  ? `conic-gradient(${segments.join(", ")})`
                  : "var(--panel-strong)",
            }}
          />
          <div className="absolute inset-10 rounded-full border border-[var(--border)] bg-[var(--panel)]" />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Total
            </span>
            <span className="text-xl font-semibold text-[var(--foreground)]">
              {formatCompactNumber(totalTokens)}
            </span>
          </div>
        </div>
        <div className="grid w-full min-w-0 content-center gap-2 md:min-w-44 lg:w-52 lg:flex-1">
          {tokenBreakdown.map((entry) => (
            <div key={entry.label} className="ui-pill-card">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-[2px]" style={{ background: entry.color }} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  {entry.label}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-3">
                <p className="text-base font-semibold text-[var(--foreground)]">
                  {formatCompactNumber(entry.value)}
                </p>
                <p className="text-xs font-semibold text-[var(--muted-foreground)]">
                  {formatShare(entry.share)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
