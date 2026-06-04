import { describe, it, expect } from "vitest";
import {
  formatCompactNumber,
  formatCurrency,
  formatDateLabel,
  formatDuration,
  formatLongDateLabel,
} from "../lib/format";

describe("Format Functions", () => {
  describe("formatCompactNumber", () => {
    it("should show no suffix for small numbers (< 1000)", () => {
      expect(formatCompactNumber(50)).toBe("50");
      expect(formatCompactNumber(500)).toBe("500");
      expect(formatCompactNumber(999)).toBe("999");
    });

    it("should show 'K' suffix for thousands", () => {
      expect(formatCompactNumber(1000)).toBe("1K");
      expect(formatCompactNumber(1500)).toBe("1.5K");
      expect(formatCompactNumber(5000)).toBe("5K");
      expect(formatCompactNumber(50000)).toBe("50K");
    });

    it("should show 'M' suffix for millions", () => {
      expect(formatCompactNumber(1000000)).toBe("1M");
      expect(formatCompactNumber(1500000)).toBe("1.5M");
      expect(formatCompactNumber(5000000)).toBe("5M");
    });

    it("should show 'B' suffix for billions", () => {
      expect(formatCompactNumber(1000000000)).toBe("1B");
      expect(formatCompactNumber(1500000000)).toBe("1.5B");
      expect(formatCompactNumber(5000000000)).toBe("5B");
    });
  });

  describe("formatCurrency", () => {
    it("should always show 2 decimal places for amounts >= $1", () => {
      expect(formatCurrency(1)).toBe("$1.00");
      expect(formatCurrency(10.5)).toBe("$10.50");
      expect(formatCurrency(100.123)).toBe("$100.12");
      expect(formatCurrency(1000)).toBe("$1,000.00");
    });

    it("should round amounts under $1 to 2 decimal places", () => {
      expect(formatCurrency(0.5)).toBe("$0.50");
      expect(formatCurrency(0.05)).toBe("$0.05");
      expect(formatCurrency(0.005)).toBe("$0.01");
      expect(formatCurrency(0.0051)).toBe("$0.01");
      expect(formatCurrency(0.00512)).toBe("$0.01");
    });
  });

  describe("formatDuration", () => {
    it("should format milliseconds as compact durations", () => {
      expect(formatDuration(9_500)).toBe("10s");
      expect(formatDuration(65_000)).toBe("1m 5s");
      expect(formatDuration(3_900_000)).toBe("1h 5m");
    });
  });

  describe("formatDateLabel", () => {
    it("should format valid date '2025-03-15' to 'Mar 15'", () => {
      expect(formatDateLabel("2025-03-15")).toBe("Mar 15");
    });

    it("should format valid date '2025-01-01' to 'Jan 1'", () => {
      expect(formatDateLabel("2025-01-01")).toBe("Jan 1");
    });

    it("should return '—' for empty string", () => {
      expect(formatDateLabel("")).toBe("—");
    });

    it("should return the string itself for invalid date string", () => {
      expect(formatDateLabel("invalid-date")).toBe("invalid-date");
    });
  });

  describe("formatLongDateLabel", () => {
    it("should format valid date to long form with short weekday", () => {
      const result = formatLongDateLabel("2025-03-15");
      // 2025-03-15 is a Saturday, but short format shows "Sat"
      expect(result).toContain("Sat");
      expect(result).toContain("March");
      expect(result).toContain("15");
      expect(result).toContain("2025");
    });

    it("should return '—' for empty string", () => {
      expect(formatLongDateLabel("")).toBe("—");
    });

    it("should return the string itself for invalid date string", () => {
      expect(formatLongDateLabel("invalid-date")).toBe("invalid-date");
    });
  });
});
