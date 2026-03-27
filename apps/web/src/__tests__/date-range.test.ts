import { describe, it, expect } from "vitest";
import { formatDateInTimeZone, getCurrentTimeZone, getPresetDateRange as getSharedPresetDateRange, shiftDateKey } from "@opencode-dashboard/shared";
import {
  canRefreshDetailDate,
  toInputDate,
  getPresetDateRange,
  parseInputDate,
  isTodayInputDate,
} from "../lib/date-range.js";

describe("Date Range Functions", () => {
  describe("toInputDate", () => {
    it("should convert Date to 'YYYY-MM-DD' string using LOCAL time", () => {
      const date = new Date(2025, 0, 15); // January 15, 2025 (month is 0-indexed)
      expect(toInputDate(date)).toBe("2025-01-15");
    });

    it("should pad single-digit months and days with zeros", () => {
      const date = new Date(2025, 2, 5); // March 5, 2025
      expect(toInputDate(date)).toBe("2025-03-05");
    });
  });

  describe("getPresetDateRange", () => {
    it("should return start as 6 days before today and end as today for '7d'", () => {
      const result = getPresetDateRange("7d");

      expect(result).toEqual(getSharedPresetDateRange("7d"));
    });

    it("should return start as first day of current month and end as today for 'month'", () => {
      const result = getPresetDateRange("month");

      expect(result).toEqual(getSharedPresetDateRange("month"));
    });

    it("should return start as first day 2 months ago and end as today for '3mo'", () => {
      const result = getPresetDateRange("3mo");

      expect(result).toEqual(getSharedPresetDateRange("3mo"));
    });

    it("should return start as Jan 1 of current year and end as today for 'year'", () => {
      const result = getPresetDateRange("year");

      expect(result).toEqual(getSharedPresetDateRange("year"));
    });
  });

  describe("parseInputDate", () => {
    it("should return Date object for valid date string", () => {
      const result = parseInputDate("2025-01-15");
      
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2025);
      expect(result?.getMonth()).toBe(0); // January is 0
      expect(result?.getDate()).toBe(15);
    });

    it("should return undefined for empty string", () => {
      expect(parseInputDate("")).toBeUndefined();
    });

    it("should return undefined for invalid date string", () => {
      expect(parseInputDate("invalid-date")).toBeUndefined();
    });
  });

  describe("isTodayInputDate", () => {
    it("should return true for today's current timezone date", () => {
      expect(isTodayInputDate(formatDateInTimeZone(new Date(), getCurrentTimeZone()))).toBe(true);
    });
  });

  describe("canRefreshDetailDate", () => {
    it("should allow refresh only when viewed date and range end are both today", () => {
      const today = formatDateInTimeZone(new Date(), getCurrentTimeZone());
      const yesterday = shiftDateKey(today, -1);

      expect(canRefreshDetailDate(today, today)).toBe(true);
      expect(canRefreshDetailDate(yesterday, today)).toBe(false);
      expect(canRefreshDetailDate(today, yesterday)).toBe(false);
    });
  });
});
