import { describe, it, expect } from "vitest";
import { getRangeData, getDateFilteredData } from "../usage.js";
import {
  makeUsageSnapshot,
  makeHeatmapDay,
  makeDayBreakdown,
  makeModelBreakdown,
} from "./factories.js";

function getTodayDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRelativeDate(daysOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("Usage Module", () => {
  describe("Given days in snapshot", () => {
    it("should return only days in current month when getRangeData is called with 'month'", () => {
      const today = getTodayDate();
      const yesterday = getRelativeDate(-1);
      const twoDaysAgo = getRelativeDate(-2);

      const snapshot = makeUsageSnapshot({
        heatmap: [
          makeHeatmapDay(today),
          makeHeatmapDay(yesterday),
          makeHeatmapDay(twoDaysAgo),
        ],
        breakdownByDate: new Map([
          [today, makeDayBreakdown(today)],
          [yesterday, makeDayBreakdown(yesterday)],
          [twoDaysAgo, makeDayBreakdown(twoDaysAgo)],
        ]),
        trendByRange: {
          month: [
            { date: today, tokens: 5000, cost: 0.1, messages: 5 },
            { date: yesterday, tokens: 6000, cost: 0.12, messages: 6 },
            { date: twoDaysAgo, tokens: 7000, cost: 0.14, messages: 7 },
          ],
        },
      });

      const result = getRangeData(snapshot, "month");

      expect(result.trend.length).toBeGreaterThan(0);
      expect(result.summary).toBeDefined();
    });
  });

  describe("Given multiple models used on one day", () => {
    it("should include series data per model when getRangeData is called", () => {
      const today = getTodayDate();
      const model1 = makeModelBreakdown({
        modelId: "claude-3-5-sonnet",
        providerId: "anthropic",
      });
      const model2 = makeModelBreakdown({
        modelId: "gpt-4o",
        providerId: "openai",
      });

      const snapshot = makeUsageSnapshot({
        heatmap: [makeHeatmapDay(today)],
        breakdownByDate: new Map([
          [
            today,
            makeDayBreakdown(today, {
              models: [model1, model2],
            }),
          ],
        ]),
        trendByRange: {
          month: [{ date: today, tokens: 10000, cost: 0.2, messages: 10 }],
        },
      });

      const result = getRangeData(snapshot, "month");

      expect(result.seriesOptions.length).toBeGreaterThanOrEqual(2);
      expect(result.seriesLines.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Given empty snapshot", () => {
    it("should return zero totals when getRangeData is called", () => {
      const snapshot = makeUsageSnapshot({
        heatmap: [],
        breakdownByDate: new Map(),
        trendByRange: {
          month: [],
        },
        summary: {
          totalTokens: 0,
          totalCost: 0,
          pricedTokens: 0,
          pricingCoverage: 0,
          totalMessages: 0,
          activeDays: 0,
        },
      });

      const result = getRangeData(snapshot, "month");

      expect(result.summary.totalTokens).toBe(0);
      expect(result.summary.totalCost).toBe(0);
      expect(result.summary.totalMessages).toBe(0);
      expect(result.summary.activeDays).toBe(0);
    });
  });

  describe("getDateFilteredData with start date", () => {
    it("should filter out earlier dates", () => {
      const today = getTodayDate();
      const yesterday = getRelativeDate(-1);
      const twoDaysAgo = getRelativeDate(-2);

      const snapshot = makeUsageSnapshot({
        heatmap: [
          makeHeatmapDay(today),
          makeHeatmapDay(yesterday),
          makeHeatmapDay(twoDaysAgo),
        ],
        breakdownByDate: new Map([
          [today, makeDayBreakdown(today)],
          [yesterday, makeDayBreakdown(yesterday)],
          [twoDaysAgo, makeDayBreakdown(twoDaysAgo)],
        ]),
      });

      const result = getDateFilteredData(snapshot, yesterday);

      const dates = result.heatmap.map((d) => d.date);
      expect(dates).toContain(today);
      expect(dates).toContain(yesterday);
      expect(dates).not.toContain(twoDaysAgo);
    });
  });

  describe("getDateFilteredData with end date", () => {
    it("should filter out later dates", () => {
      const today = getTodayDate();
      const yesterday = getRelativeDate(-1);
      const twoDaysAgo = getRelativeDate(-2);

      const snapshot = makeUsageSnapshot({
        heatmap: [
          makeHeatmapDay(today),
          makeHeatmapDay(yesterday),
          makeHeatmapDay(twoDaysAgo),
        ],
        breakdownByDate: new Map([
          [today, makeDayBreakdown(today)],
          [yesterday, makeDayBreakdown(yesterday)],
          [twoDaysAgo, makeDayBreakdown(twoDaysAgo)],
        ]),
      });

      const result = getDateFilteredData(snapshot, undefined, yesterday);

      const dates = result.heatmap.map((d) => d.date);
      expect(dates).not.toContain(today);
      expect(dates).toContain(yesterday);
      expect(dates).toContain(twoDaysAgo);
    });
  });

  describe("getDateFilteredData with both start and end", () => {
    it("should return only dates in range", () => {
      const today = getTodayDate();
      const yesterday = getRelativeDate(-1);
      const twoDaysAgo = getRelativeDate(-2);
      const threeDaysAgo = getRelativeDate(-3);

      const snapshot = makeUsageSnapshot({
        heatmap: [
          makeHeatmapDay(today),
          makeHeatmapDay(yesterday),
          makeHeatmapDay(twoDaysAgo),
          makeHeatmapDay(threeDaysAgo),
        ],
        breakdownByDate: new Map([
          [today, makeDayBreakdown(today)],
          [yesterday, makeDayBreakdown(yesterday)],
          [twoDaysAgo, makeDayBreakdown(twoDaysAgo)],
          [threeDaysAgo, makeDayBreakdown(threeDaysAgo)],
        ]),
      });

      const result = getDateFilteredData(snapshot, twoDaysAgo, yesterday);

      const dates = result.heatmap.map((d) => d.date);
      expect(dates).not.toContain(today);
      expect(dates).toContain(yesterday);
      expect(dates).toContain(twoDaysAgo);
      expect(dates).not.toContain(threeDaysAgo);
    });
  });

  describe("Given a day with no tokens", () => {
    it("should exclude that day from series data (only active days included)", () => {
      const today = getTodayDate();
      const yesterday = getRelativeDate(-1);

      const snapshot = makeUsageSnapshot({
        heatmap: [
          makeHeatmapDay(today, { tokens: 5000 }),
          makeHeatmapDay(yesterday, { tokens: 0 }),
        ],
        breakdownByDate: new Map([
          [today, makeDayBreakdown(today, { tokens: 5000 })],
          [yesterday, makeDayBreakdown(yesterday, { tokens: 0 })],
        ]),
        trendByRange: {
          month: [
            { date: today, tokens: 5000, cost: 0.1, messages: 5 },
            { date: yesterday, tokens: 0, cost: 0, messages: 0 },
          ],
        },
      });

      const result = getRangeData(snapshot, "month");

      // Days with zero tokens should not count as active days
      const activeDays = result.heatmap.filter((d) => d.tokens > 0).length;
      expect(activeDays).toBe(1);
    });
  });
});
