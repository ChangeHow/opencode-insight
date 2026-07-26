import type { TimeRange } from "@opencode-dashboard/shared";
import { cn } from "@/lib/utils";

interface RangePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  className?: string;
}

const ranges: Array<{ value: TimeRange; label: string }> = [
  { value: "7d", label: "7d" },
  { value: "month", label: "1mo" },
  { value: "3mo", label: "3mo" },
  { value: "year", label: "1yr" },
  { value: "all", label: "All" },
];

export function RangePicker({ value, onChange, className }: RangePickerProps) {
  return (
    <div
      className={cn(
        "inline-flex h-10 items-center rounded-[10px] border border-[var(--border)] bg-[var(--panel)]/92 p-1",
        className,
      )}
    >
      {ranges.map((range) => (
        <button
          key={range.value}
          type="button"
          aria-pressed={value === range.value}
          onClick={() => onChange(range.value)}
          className={cn(
            "inline-flex h-8 flex-1 items-center justify-center whitespace-nowrap rounded-[8px] px-2 text-xs leading-none font-semibold transition-colors outline-none focus:ring-2 focus:ring-[var(--ring)] md:flex-none md:px-4",
            value === range.value
              ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
              : "text-[var(--muted-foreground)] hover:bg-[var(--interactive-hover)] hover:text-[var(--foreground)]",
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
