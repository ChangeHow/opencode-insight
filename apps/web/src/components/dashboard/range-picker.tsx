import type { TimeRange } from "@opencode-dashboard/shared";
import { cn } from "@/lib/utils";

interface RangePickerProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const ranges: TimeRange[] = ["7d", "30d", "90d"];

export function RangePicker({ value, onChange }: RangePickerProps) {
  return (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--panel)] p-1">
      {ranges.map((range) => (
        <button
          key={range}
          type="button"
          onClick={() => onChange(range)}
          className={cn(
            "rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors",
            value === range ? "bg-[var(--accent)] text-[var(--accent-foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
          )}
        >
          {range}
        </button>
      ))}
    </div>
  );
}
