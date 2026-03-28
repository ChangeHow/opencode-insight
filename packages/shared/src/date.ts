import type { TimeRange } from "./index";

export const DEFAULT_TIME_ZONE = "UTC";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function getFormatter(timeZone: string) {
  const resolved = resolveTimeZone(timeZone);
  const cached = formatterCache.get(resolved);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: resolved,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  formatterCache.set(resolved, formatter);
  return formatter;
}

export function resolveTimeZone(timeZone?: string) {
  if (!timeZone) {
    return DEFAULT_TIME_ZONE;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function getCurrentTimeZone() {
  return resolveTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export function formatDateKey(year: number, month: number, day: number) {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function formatDateInTimeZone(value: Date | number, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = getFormatter(timeZone).formatToParts(date);
  return formatDateKey(
    Number(getPart(parts, "year")),
    Number(getPart(parts, "month")),
    Number(getPart(parts, "day")),
  );
}

export function formatCalendarDate(value: Date) {
  return formatDateKey(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

export function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function dateKeyToLocalDate(value: string) {
  const parts = parseDateKey(value);
  if (!parts) {
    return undefined;
  }

  return new Date(parts.year, parts.month - 1, parts.day);
}

export function dateKeyToUtcNoon(value: string) {
  const parts = parseDateKey(value);
  if (!parts) {
    return null;
  }

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
}

export function shiftDateKey(value: string, days: number) {
  const date = dateKeyToUtcNoon(value);
  if (!date) {
    return value;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return formatDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function startOfDateKeyMonth(value: string, offsetMonths = 0) {
  const parts = parseDateKey(value);
  if (!parts) {
    return value;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1 + offsetMonths, 1, 12));
  return formatDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

export function startOfDateKeyYear(value: string) {
  const parts = parseDateKey(value);
  if (!parts) {
    return value;
  }

  return formatDateKey(parts.year, 1, 1);
}

export function getPresetDateRange(
  range: TimeRange,
  options?: { now?: Date | number; timeZone?: string },
) {
  const now = options?.now ?? new Date();
  const timeZone = options?.timeZone ?? getCurrentTimeZone();
  const end = formatDateInTimeZone(now, timeZone);

  if (range === "7d") {
    return { start: shiftDateKey(end, -6), end };
  }

  if (range === "month") {
    return { start: startOfDateKeyMonth(end), end };
  }

  if (range === "3mo") {
    return { start: startOfDateKeyMonth(end, -2), end };
  }

  return { start: startOfDateKeyYear(end), end };
}

export function getDateKeyWeekday(value: string) {
  const date = dateKeyToUtcNoon(value);
  return date ? date.getUTCDay() : 0;
}

export function formatDateLabelInTimeZone(
  value: string,
  options: Intl.DateTimeFormatOptions,
  timeZone?: string,
) {
  const date = dateKeyToUtcNoon(value);
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimeZone(timeZone),
    ...options,
  }).format(date);
}
