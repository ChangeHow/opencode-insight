import type { TrendPoint } from "@opencode-dashboard/shared";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactNumber, formatCurrency } from "@/lib/format";

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">Rhythm</p>
        <h2 className="mt-2 font-[Newsreader_Variable] text-3xl text-[var(--foreground)]">Recent cadence</h2>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="tokensGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="var(--chart)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(77, 61, 44, 0.08)" />
            <XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={formatCompactNumber} tickLine={false} axisLine={false} width={42} />
            <Tooltip
              cursor={{ stroke: "rgba(174, 85, 43, 0.2)", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: 20,
                border: "1px solid var(--border)",
                background: "var(--panel)",
                color: "var(--foreground)",
              }}
              formatter={(value, name) => [
                name === "tokens" ? formatCompactNumber(Number(value ?? 0)) : formatCurrency(Number(value ?? 0)),
                name === "tokens" ? "Tokens" : "Cost",
              ]}
              labelFormatter={(label) => label}
            />
            <Area type="monotone" dataKey="tokens" stroke="var(--chart)" fill="url(#tokensGradient)" strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
