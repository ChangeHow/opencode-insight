import {
  dateKeyToLocalDate,
  formatCalendarDate,
  formatDateInTimeZone,
  getCurrentTimeZone,
  getPresetDateRange as getSharedPresetDateRange,
} from "@opencode-dashboard/shared";
import type { TimeRange } from "@opencode-dashboard/shared";

export function toInputDate(date: Date) {
  return formatCalendarDate(date);
}

export function getPresetDateRange(range: TimeRange) {
  return getSharedPresetDateRange(range, { timeZone: getCurrentTimeZone() });
}

export function parseInputDate(value: string) {
  return dateKeyToLocalDate(value);
}

export function isTodayInputDate(value?: string) {
  if (!value) {
    return false;
  }

  return value === formatDateInTimeZone(new Date(), getCurrentTimeZone());
}

export function canRefreshDetailDate(date?: string, rangeEnd?: string) {
  return isTodayInputDate(date) && isTodayInputDate(rangeEnd);
}
