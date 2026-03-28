import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Layers3 } from "lucide-react";
import type { TokenBreakdown } from "@opencode-dashboard/shared";
import { formatCompactNumber } from "@/lib/format";

export const TOKEN_COLORS = {
  input: "var(--metric-violet)",
  output: "var(--metric-orange)",
  reasoning: "var(--metric-gold)",
  cache: "var(--metric-green)",
};

function buildTokenBreakdown(breakdown: TokenBreakdown) {
  return [
    { label: "Input", value: breakdown.input, color: TOKEN_COLORS.input },
    { label: "Output", value: breakdown.output, color: TOKEN_COLORS.output },
    { label: "Reasoning", value: breakdown.reasoning, color: TOKEN_COLORS.reasoning },
    {
      label: "Cache",
      value: breakdown.cacheRead + breakdown.cacheWrite,
      color: TOKEN_COLORS.cache,
    },
  ].filter((item) => item.value > 0);
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

  return (
    <div className="flex h-full w-[38rem] min-w-[38rem] shrink-0 flex-col rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-6">
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          <Layers3 className="size-3.5" />
          {eyebrow}
        </p>
        <h3 className="text-xl font-semibold text-[var(--foreground)]">{title}</h3>
      </div>
      <div className="mt-4 flex min-h-0 flex-1 items-center gap-4">
        <div className="h-52 min-w-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={tokenBreakdown}
                dataKey="value"
                nameKey="label"
                innerRadius={52}
                outerRadius={92}
                paddingAngle={2}
              >
                {tokenBreakdown.map((entry) => (
                  <Cell key={entry.label} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [formatCompactNumber(Number(value ?? 0)), "Tokens"]}
                contentStyle={{
                  borderRadius: 20,
                  border: "1px solid var(--border)",
                  background: "var(--panel)",
                  color: "var(--foreground)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="grid min-w-44 content-center gap-2">
          {tokenBreakdown.map((entry) => (
            <div key={entry.label} className="ui-pill-card">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: entry.color }} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  {entry.label}
                </span>
              </div>
              <p className="mt-1.5 text-base font-semibold text-[var(--foreground)]">
                {formatCompactNumber(entry.value)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
