import type { TimeRange } from "@opencode-dashboard/shared";
import { cn } from "@/lib/utils";

interface RangePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const ranges: Array<{ value: TimeRange; label: string }> = [
  { value: "month", label: "This month" },
  { value: "3mo", label: "-3 months" },
  { value: "year", label: "This year" },
];

export function RangePicker({ value, onChange }: RangePickerProps) {
  return (
    <div className="inline-flex h-10 rounded-[18px] border border-[var(--border)] bg-[var(--panel)] p-1">
      {ranges.map((range) => (
        <button
          key={range.value}
          type="button"
          onClick={() => onChange(range.value)}
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-[14px] px-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors outline-none focus:ring-2 focus:ring-[var(--ring)]",
            value === range.value ? "bg-[var(--accent)] text-[var(--accent-foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
