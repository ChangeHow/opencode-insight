import { useEffect, useMemo, useRef, useState } from "react";
import { DayButton as DayPickerDayButton, type DayButtonProps } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, format, isAfter, isBefore, startOfMonth } from "date-fns";
import { formatCalendarDate } from "@opencode-dashboard/shared";
import type { HeatmapDay } from "@opencode-dashboard/shared";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { parseInputDate } from "@/lib/date-range";
import { formatCompactNumber, formatCurrency, formatDateLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const intensityClass = {
  0: "bg-[var(--heat-0)] text-[var(--heat-fg-0)]",
  1: "bg-[var(--heat-1)] text-[var(--heat-fg-1)]",
  2: "bg-[var(--heat-2)] text-[var(--heat-fg-2)]",
  3: "bg-[var(--heat-3)] text-[var(--heat-fg-3)]",
  4: "bg-[var(--heat-4)] text-[var(--heat-fg-4)]",
} as const;

const spendClass = {
  0: "text-[var(--heat-token-0)]",
  1: "text-[var(--heat-token-1)]",
  2: "text-[var(--heat-token-2)]",
  3: "text-[var(--heat-token-3)]",
  4: "text-[var(--heat-token-4)]",
} as const;

interface HeatmapProps {
  days: HeatmapDay[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
}

export function Heatmap({ days, selectedDate, onSelect }: HeatmapProps) {
  const dayMap = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const start = parseInputDate(days[0]?.date ?? "");
  const end = parseInputDate(days.at(-1)?.date ?? "");
  const selected = parseInputDate(selectedDate ?? "");
  const initialMonth = useMemo(
    () => startOfMonth(selected ?? end ?? start ?? new Date()),
    [selected, end, start],
  );
  const [month, setMonth] = useState(() => initialMonth);
  const initialMonthKey = format(initialMonth, "yyyy-MM");
  const previousInitialMonthKeyRef = useRef(initialMonthKey);
  const startMonth = start ? startOfMonth(start) : undefined;
  const endMonth = end ? startOfMonth(end) : undefined;
  const previousMonth = addMonths(month, -1);
  const nextMonth = addMonths(month, 1);
  const canGoPrevious = startMonth ? !isBefore(previousMonth, startMonth) : true;
  const canGoNext = endMonth ? !isAfter(nextMonth, endMonth) : true;

  useEffect(() => {
    if (previousInitialMonthKeyRef.current !== initialMonthKey) {
      setMonth(initialMonth);
      previousInitialMonthKeyRef.current = initialMonthKey;
    }
  }, [initialMonth, initialMonthKey]);

  function HeatmapDayButton(props: DayButtonProps) {
    const dateKey = formatCalendarDate(props.day.date);
    const entry = dayMap.get(dateKey);

    if (!entry) {
      return (
        <DayPickerDayButton
          {...props}
          className={cn(
            "group relative flex size-full flex-col items-start justify-between rounded-[8px] border border-transparent bg-transparent p-1.5 text-left text-[var(--heat-empty-fg)] outline-none sm:p-2",
            props.modifiers.outside && "opacity-42",
          )}
        >
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--heat-empty-date)] sm:text-[10px]">
            {dateKey.slice(8)}
          </span>
        </DayPickerDayButton>
      );
    }

    const isDisabled = props.modifiers.disabled;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <DayPickerDayButton
            {...props}
            className={cn(
              "group relative flex size-full flex-col items-start justify-between rounded-[8px] border p-1.5 text-left outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:p-2",
              intensityClass[entry.intensity],
              isDisabled
                ? "cursor-not-allowed opacity-80 saturate-75"
                : "cursor-pointer hover:-translate-y-0.5",
              props.modifiers.selected
                ? "border-[var(--accent)] shadow-[0_10px_30px_rgba(174,85,43,0.18)]"
                : "border-transparent",
              props.modifiers.outside && "opacity-48 saturate-75",
            )}
          >
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] sm:text-[10px]">
              {dateKey.slice(8)}
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold sm:text-[11px]",
                spendClass[entry.intensity],
              )}
            >
              {formatCurrency(entry.cost)}
            </span>
          </DayPickerDayButton>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-semibold">{formatDateLabel(entry.date)}</p>
          <p>{formatCurrency(entry.cost)} estimated spend</p>
          <p>{formatCompactNumber(entry.tokens)} tokens</p>
          <p>{entry.messages} assistant messages</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-[27rem] min-w-0 flex-col space-y-4 sm:min-h-[32rem]">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
              Daily ledger
            </p>
            <h2 className="mt-2 font-[Newsreader_Variable] text-3xl text-[var(--foreground)]">
              Calendar
            </h2>
          </div>
          <div className="hidden items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)] sm:flex">
            <span>Quiet</span>
            {[0, 1, 2, 3, 4].map((intensity) => (
              <span
                key={intensity}
                className={cn(
                  "size-3 rounded-full",
                  intensityClass[intensity as keyof typeof intensityClass],
                )}
              />
            ))}
            <span>Loud</span>
          </div>
        </div>

        <div className="rounded-[24px] bg-[var(--chart-surface)]/55 p-4">
          <div className="flex items-start justify-center overflow-x-auto">
            <div className="w-full max-w-[42rem] min-w-0 px-1 sm:px-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-10 rounded-full p-0"
                  onClick={() => setMonth(previousMonth)}
                  disabled={!canGoPrevious}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <p className="text-lg font-semibold text-[var(--foreground)]">
                  {format(month, "MMMM yyyy")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="size-10 rounded-full p-0"
                  onClick={() => setMonth(nextMonth)}
                  disabled={!canGoNext}
                  aria-label="Next month"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <Calendar
                mode="single"
                month={month}
                disableNavigation
                selected={selected ?? undefined}
                onSelect={(date) => {
                  if (date) {
                    onSelect(formatCalendarDate(date));
                  }
                }}
                numberOfMonths={1}
                fixedWeeks
                showOutsideDays
                disabled={(date) => {
                  const dateKey = formatCalendarDate(date);
                  const entry = dayMap.get(dateKey);
                  return !entry || entry.messages === 0;
                }}
                className="w-full [--heatmap-day-gap:0.5rem] [--heatmap-day-size:2.625rem] sm:[--heatmap-day-gap:0.55rem] sm:[--heatmap-day-size:3.75rem]"
                classNames={{
                  root: "mx-auto w-fit min-w-fit",
                  months: "flex w-fit",
                  month: "flex w-fit flex-col gap-4",
                  month_caption: "hidden",
                  caption_label: "hidden",
                  nav: "hidden",
                  weekdays: "grid grid-cols-7 gap-[var(--heatmap-day-gap)]",
                  weekday:
                    "flex h-7 w-[var(--heatmap-day-size)] items-center justify-center rounded-md text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]",
                  weeks: "mt-2 flex flex-col gap-[var(--heatmap-day-gap)]",
                  week: "grid grid-cols-7 gap-[var(--heatmap-day-gap)]",
                  day: "size-[var(--heatmap-day-size)] p-0",
                  day_button: "size-full",
                  hidden: "invisible",
                  disabled: "opacity-100",
                }}
                components={{
                  DayButton: HeatmapDayButton,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
