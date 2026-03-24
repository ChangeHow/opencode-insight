import type { TimeRange } from "@opencode-dashboard/shared";

export function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPresetDateRange(range: TimeRange) {
  const today = new Date();
  const end = toInputDate(today);

  if (range === "month") {
    return {
      start: toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      end,
    };
  }

  if (range === "3mo") {
    return {
      start: toInputDate(new Date(today.getFullYear(), today.getMonth() - 2, 1)),
      end,
    };
  }

  return {
    start: toInputDate(new Date(today.getFullYear(), 0, 1)),
    end,
  };
}

export function parseInputDate(value: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
