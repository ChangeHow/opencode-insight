import { useMemo } from "react";
import { CalendarRange } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { formatCalendarDate } from "@opencode-dashboard/shared";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { getPresetDateRange, parseInputDate } from "@/lib/date-range";
import { formatDateWithYearLabel } from "@/lib/format";
import type { TimeRange } from "@opencode-dashboard/shared";

export function DateRangePicker({
  range,
  value,
  onChange,
}: {
  range: TimeRange;
  value: { start: string; end: string };
  onChange: (value: { start: string; end: string }) => void;
}) {
  const selected = useMemo<DateRange | undefined>(
    () => ({
      from: parseInputDate(value.start),
      to: parseInputDate(value.end),
    }),
    [value.end, value.start],
  );

  const label = value.start
    ? `${formatDateWithYearLabel(value.start)}${value.end ? ` - ${formatDateWithYearLabel(value.end)}` : ""}`
    : "Select a date range";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 min-w-[16.5rem] justify-start rounded-[16px] border-[var(--border)] bg-[var(--panel)]/92 px-3 text-left text-[11px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <CalendarRange className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-[20px] p-4" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                Selected range
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{label}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-[14px] px-2.5 text-[11px]"
              onClick={() => onChange(getPresetDateRange(range))}
            >
              Reset preset
            </Button>
          </div>
          <Calendar
            mode="range"
            defaultMonth={selected?.from}
            selected={selected}
            onSelect={(next) => {
              onChange({
                start: next?.from ? formatCalendarDate(next.from) : "",
                end: next?.to
                  ? formatCalendarDate(next.to)
                  : next?.from
                    ? formatCalendarDate(next.from)
                    : "",
              });
            }}
            numberOfMonths={2}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
