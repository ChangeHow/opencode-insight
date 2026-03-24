import { describe, it, expect } from "vitest";
import {
  toInputDate,
  getPresetDateRange,
  parseInputDate,
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
    it("should return start as first day of current month and end as today for 'month'", () => {
      const today = new Date();
      const result = getPresetDateRange("month");

      const expectedStart = toInputDate(new Date(today.getFullYear(), today.getMonth(), 1));
      const expectedEnd = toInputDate(today);

      expect(result.start).toBe(expectedStart);
      expect(result.end).toBe(expectedEnd);
    });

    it("should return start as first day 2 months ago and end as today for '3mo'", () => {
      const today = new Date();
      const result = getPresetDateRange("3mo");

      const expectedStart = toInputDate(new Date(today.getFullYear(), today.getMonth() - 2, 1));
      const expectedEnd = toInputDate(today);

      expect(result.start).toBe(expectedStart);
      expect(result.end).toBe(expectedEnd);
    });

    it("should return start as Jan 1 of current year and end as today for 'year'", () => {
      const today = new Date();
      const result = getPresetDateRange("year");

      const expectedStart = toInputDate(new Date(today.getFullYear(), 0, 1));
      const expectedEnd = toInputDate(today);

      expect(result.start).toBe(expectedStart);
      expect(result.end).toBe(expectedEnd);
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
});
