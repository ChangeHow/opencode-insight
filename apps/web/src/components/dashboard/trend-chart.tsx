import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, LineChart as LineChartIcon } from "lucide-react";
import type { CostSeriesLine, CostSeriesOption, TrendPoint } from "@opencode-dashboard/shared";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProviderIcon } from "./provider-icon";

const SERIES_COLORS = [
  "var(--metric-amber)",
  "var(--metric-violet)",
  "var(--metric-green)",
  "var(--metric-orange)",
];

export function TrendChart({
  data,
  options,
  lines,
  selectedKeys,
  onToggle,
}: {
  data: TrendPoint[];
  options: CostSeriesOption[];
  lines: CostSeriesLine[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            <LineChartIcon className="size-3.5" />
            Spend curves
          </p>
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Model and provider lines</h2>
          <p className="text-xs leading-5 text-[var(--muted-foreground)]">Toggle up to four model and provider pairs. The dashed line stays as total daily spend.</p>
        </div>
      </div>
      <div className="h-84">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={composeChartData(data, lines)}>
            <CartesianGrid vertical={false} stroke="rgba(77, 61, 44, 0.08)" />
            <XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={formatCurrencyCompact} tickLine={false} axisLine={false} width={52} />
            <Tooltip
              cursor={{ stroke: "rgba(174, 85, 43, 0.2)", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: 20,
                border: "1px solid var(--border)",
                background: "var(--panel)",
                color: "var(--foreground)",
              }}
              formatter={(value, name) => [
                typeof value === "number" ? formatCurrency(value) : value,
                name === "totalCost" ? "Total spend" : name,
              ]}
              labelFormatter={(label) => label}
            />
            <Line
              type="monotone"
              dataKey="totalCost"
              name="Total spend"
              stroke="rgba(77, 61, 44, 0.45)"
              strokeDasharray="4 4"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            {lines.map((line, index) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                strokeWidth={2.75}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-full items-center justify-between gap-3 rounded-[18px] border border-[var(--border)] bg-[var(--panel)] px-3 text-sm font-medium text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <span className="truncate text-left">
              {selectedKeys.length > 0
                ? `${selectedKeys.length} selected: ${options
                    .filter((option) => selectedKeys.includes(option.key))
                    .slice(0, 2)
                    .map((option) => option.label)
                    .join(", ")}${selectedKeys.length > 2 ? "..." : ""}`
                : "Choose model and provider lines"}
            </span>
            <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {open ? "Close" : "Select"}
              <ChevronDown className={cn("size-4 transition-transform", open ? "rotate-180" : "")} />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
          <ScrollArea className="max-h-64 pr-1">
            <div className="space-y-2">
              {options.map((option) => {
                const active = selectedKeys.includes(option.key);

                    return (
                      <label
                        key={option.key}
                    className={cn(
                      "flex cursor-pointer items-start justify-between gap-3 rounded-[16px] border px-3 py-2.5 transition",
                      active ? "border-transparent bg-[var(--accent-soft)]" : "border-[var(--border)] bg-white/40 hover:bg-black/5",
                    )}
                      >
                        <span className="min-w-0 space-y-1">
                          <span className="flex items-center gap-2">
                            <ProviderIcon providerId={option.providerId} className="size-3.5" withTooltip />
                            <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{option.modelId}</span>
                          </span>
                          <span className="block text-xs text-[var(--muted-foreground)]">
                            {formatCurrency(option.totalCost)} • {formatCompactNumber(option.totalTokens)} tokens
                      </span>
                    </span>
                        <input
                      type="checkbox"
                      checked={active}
                      onChange={() => onToggle(option.key)}
                      className="mt-1 size-4 rounded border-[var(--border)] accent-[var(--accent)]"
                    />
                  </label>
                );
              })}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function composeChartData(data: TrendPoint[], lines: CostSeriesLine[]) {
  return data.map((point) => {
    const entry: Record<string, number | string> = {
      date: point.date,
      totalCost: point.cost,
    };

    for (const line of lines) {
      entry[line.key] = line.points.find((item) => item.date === point.date)?.cost ?? 0;
    }

    return entry;
  });
}

function formatCurrencyCompact(value: number) {
  if (value >= 1_000) {
    return formatCompactNumber(value);
  }

  return formatCurrency(value);
}
