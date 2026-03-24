import type { HeatmapDay } from "@opencode-dashboard/shared";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCompactNumber, formatDateLabel } from "@/lib/format";

const intensityClass = {
  0: "bg-[var(--heat-0)]",
  1: "bg-[var(--heat-1)]",
  2: "bg-[var(--heat-2)]",
  3: "bg-[var(--heat-3)]",
  4: "bg-[var(--heat-4)]",
} as const;

interface HeatmapProps {
  days: HeatmapDay[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
}

export function Heatmap({ days, selectedDate, onSelect }: HeatmapProps) {
  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">Daily ledger</p>
            <h2 className="mt-2 font-[Newsreader_Variable] text-3xl text-[var(--foreground)]">Calendar</h2>
          </div>
          <div className="hidden items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)] sm:flex">
            <span>Quiet</span>
            {[0, 1, 2, 3, 4].map((intensity) => (
              <span key={intensity} className={cn("size-3 rounded-full", intensityClass[intensity as keyof typeof intensityClass])} />
            ))}
            <span>Loud</span>
          </div>
        </div>
        <div>
          <div className="grid grid-cols-7 gap-2">
          {days.map((day) => (
            <Tooltip key={day.date}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelect(day.date)}
                  className={cn(
                    "group flex aspect-square cursor-pointer flex-col justify-between rounded-[18px] border p-2 text-left transition-transform duration-200 hover:-translate-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    intensityClass[day.intensity],
                    selectedDate === day.date ? "border-[var(--accent)] shadow-[0_10px_30px_rgba(174,85,43,0.18)]" : "border-transparent",
                  )}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/55">{day.date.slice(8)}</span>
                  <span className="text-[11px] font-semibold text-black/75">{day.tokens > 0 ? formatCompactNumber(day.tokens) : "0"}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">{formatDateLabel(day.date)}</p>
                <p>{formatCompactNumber(day.tokens)} tokens</p>
              </TooltipContent>
            </Tooltip>
          ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
