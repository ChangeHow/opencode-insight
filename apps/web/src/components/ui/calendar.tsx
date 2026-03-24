import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type CalendarProps = ComponentProps<typeof DayPicker>;

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-0", className)}
      classNames={{
        root: "relative",
        months: "relative flex flex-col gap-5 sm:flex-row sm:gap-6",
        month: "flex w-[17.5rem] flex-col gap-4",
        month_caption: "relative flex h-9 items-center justify-center",
        caption_label: "text-sm font-semibold text-[var(--foreground)]",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between px-3",
        button_previous: "inline-flex size-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] transition hover:bg-black/5",
        button_next: "inline-flex size-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] transition hover:bg-black/5",
        month_grid: "w-full border-collapse",
        weekdays: "flex w-full",
        weekday: "w-9 rounded-md text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]",
        weeks: "mt-2 flex flex-col gap-1",
        week: "flex w-full",
        day: "relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected].rdp-range_end)]:rounded-r-xl [&:has([aria-selected].rdp-range_start)]:rounded-l-xl [&:has([aria-selected].rdp-range_middle)]:rounded-none",
        day_button: "inline-flex size-9 items-center justify-center rounded-xl text-sm text-[var(--foreground)] outline-none transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        selected: "bg-[var(--accent)] text-[var(--accent-foreground)]",
        today: "font-semibold",
        outside: "text-[var(--muted-foreground)] opacity-50",
        disabled: "opacity-35",
        range_start: "bg-[var(--accent-soft)]",
        range_middle: "bg-[var(--accent-soft)]",
        range_end: "bg-[var(--accent-soft)]",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: iconClassName }) =>
          orientation === "left" ? <ChevronLeft className={cn("size-4", iconClassName)} /> : <ChevronRight className={cn("size-4", iconClassName)} />,
      }}
      {...props}
    />
  );
}
