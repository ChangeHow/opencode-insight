import type { TimeRange } from "@opencode-dashboard/shared";
import { cn } from "@/lib/utils";

interface RangePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const ranges: Array<{ value: TimeRange; label: string }> = [
  { value: "7d", label: "7d" },
  { value: "month", label: "1m" },
  { value: "3mo", label: "last 3m" },
  { value: "year", label: "yr" },
];

export function RangePicker({ value, onChange }: RangePickerProps) {
  return (
    <div className="inline-flex h-10 items-center rounded-[16px] border border-[var(--border)] bg-[var(--panel)]/92 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {ranges.map((range) => (
        <button
          key={range.value}
          type="button"
          onClick={() => onChange(range.value)}
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-[13px] px-3 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all outline-none focus:ring-2 focus:ring-[var(--ring)] sm:px-4",
            value === range.value
              ? "bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[0_8px_20px_rgba(226,132,74,0.22)]"
              : "text-[var(--muted-foreground)] hover:bg-white/4 hover:text-[var(--foreground)]",
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
