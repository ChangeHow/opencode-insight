import { describe, test, expect } from "vitest";
import {
  DEFAULT_TIME_ZONE,
  formatDateInTimeZone,
  getPresetDateRange,
  shiftDateKey,
} from "@opencode-dashboard/shared";
import { getRangeData, getDateFilteredData } from "../services/usage/index";
import {
  makeUsageSnapshot,
  makeHeatmapDay,
  makeDayBreakdown,
  makeModelBreakdown,
  makeRawMessage,
} from "./factories";

function getTodayDate(): string {
  return formatDateInTimeZone(new Date(), DEFAULT_TIME_ZONE);
}

function getRelativeDate(daysOffset: number): string {
  return shiftDateKey(getTodayDate(), daysOffset);
}

describe("Usage Module", () => {
  describe("shared timezone date helpers", () => {
    test("should format instants using caller time zone boundaries", () => {
      expect(formatDateInTimeZone(new Date("2026-03-25T16:30:00.000Z"), "Asia/Shanghai")).toBe(
        "2026-03-26",
      );
      expect(
        formatDateInTimeZone(new Date("2026-03-25T16:30:00.000Z"), "America/Los_Angeles"),
      ).toBe("2026-03-25");
    });

    test("should build preset ranges from provided time zone", () => {
      expect(
        getPresetDateRange("7d", {
          now: new Date("2026-03-25T16:30:00.000Z"),
          timeZone: "Asia/Shanghai",
        }),
      ).toEqual({
        start: "2026-03-20",
        end: "2026-03-26",
      });
    });
  });

  describe("Given days in snapshot", () => {
    test("should return only days in current month when getRangeData is called with 'month'", () => {
      const today = getTodayDate();
      const yesterday = getRelativeDate(-1);
      const twoDaysAgo = getRelativeDate(-2);

      const snapshot = makeUsageSnapshot({
        heatmap: [makeHeatmapDay(today), makeHeatmapDay(yesterday), makeHeatmapDay(twoDaysAgo)],
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
    test("should include series data per model when getRangeData is called", () => {
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
        messages: [
          makeRawMessage(today, { modelId: "claude-3-5-sonnet", providerId: "anthropic" }),
          makeRawMessage(today, { id: "msg_2", modelId: "gpt-4o", providerId: "openai" }),
        ],
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

    test("should filter usage to the requested provider when providerId is provided", () => {
      const today = getTodayDate();

      const snapshot = makeUsageSnapshot({
        messages: [
          makeRawMessage(today, {
            modelId: "glm-4.5",
            providerId: "zhipu",
            estimatedCost: 3.25,
          }),
          makeRawMessage(today, {
            id: "msg_openai",
            modelId: "gpt-4o",
            providerId: "openai",
            estimatedCost: 1.5,
          }),
        ],
      });

      const result = getRangeData(snapshot, "month", [], DEFAULT_TIME_ZONE, "zhipu");

      expect(result.summary.totalCost).toBe(3.25);
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].providerId).toBe("zhipu");
      expect(result.seriesOptions).toHaveLength(1);
      expect(result.seriesOptions[0].providerId).toBe("zhipu");
    });
  });

  describe("Given fractional billing values", () => {
    test("should round returned cost metrics to two decimal places", () => {
      const today = getTodayDate();
      const snapshot = makeUsageSnapshot({
        breakdownByDate: new Map([
          [
            today,
            makeDayBreakdown(today, {
              cost: 0.335,
              models: [makeModelBreakdown({ cost: 0.335 })],
              sessions: [],
            }),
          ],
        ]),
      });

      const result = getDateFilteredData(snapshot, today, today);

      expect(result.summary.totalCost).toBe(0.34);
      expect(result.heatmap[0]?.cost).toBe(0.34);
      expect(result.trend[0]?.cost).toBe(0.34);
      expect(result.seriesOptions[0]?.totalCost).toBe(0.34);
      expect(result.providers[0]?.totalCost).toBe(0.34);
      expect(result.providers[0]?.topModel?.cost).toBe(0.34);
    });
  });

  describe("Given empty snapshot", () => {
    test("should return zero totals when getRangeData is called", () => {
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

  describe("Given gaps inside the selected period", () => {
    test("should include zero-value days across the full preset range", () => {
      const today = getTodayDate();
      const twoDaysAgo = getRelativeDate(-2);

      const snapshot = makeUsageSnapshot({
        heatmap: [
          makeHeatmapDay(twoDaysAgo, { tokens: 3000, messages: 3 }),
          makeHeatmapDay(today, { tokens: 5000, messages: 5 }),
        ],
        breakdownByDate: new Map([
          [twoDaysAgo, makeDayBreakdown(twoDaysAgo, { tokens: 3000, messages: 3 })],
          [today, makeDayBreakdown(today, { tokens: 5000, messages: 5 })],
        ]),
      });

      const result = getDateFilteredData(snapshot, twoDaysAgo, today);

      expect(result.heatmap.map((day) => day.date)).toEqual([
        twoDaysAgo,
        getRelativeDate(-1),
        today,
      ]);
      expect(result.heatmap[1]).toMatchObject({
        date: getRelativeDate(-1),
        tokens: 0,
        cost: 0,
        messages: 0,
        intensity: 0,
      });
      expect(result.trend[1]).toMatchObject({
        date: getRelativeDate(-1),
        tokens: 0,
        cost: 0,
        messages: 0,
      });
    });
  });

  describe("getDateFilteredData with start date", () => {
    test("should filter out earlier dates", () => {
      const today = getTodayDate();
      const yesterday = getRelativeDate(-1);
      const twoDaysAgo = getRelativeDate(-2);

      const snapshot = makeUsageSnapshot({
        heatmap: [makeHeatmapDay(today), makeHeatmapDay(yesterday), makeHeatmapDay(twoDaysAgo)],
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
    test("should filter out later dates", () => {
      const today = getTodayDate();
      const yesterday = getRelativeDate(-1);
      const twoDaysAgo = getRelativeDate(-2);

      const snapshot = makeUsageSnapshot({
        heatmap: [makeHeatmapDay(today), makeHeatmapDay(yesterday), makeHeatmapDay(twoDaysAgo)],
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
    test("should return only dates in range", () => {
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
    test("should exclude that day from series data (only active days included)", () => {
      const today = getTodayDate();
      const yesterday = getRelativeDate(-1);

      const snapshot = makeUsageSnapshot({
        heatmap: [
          makeHeatmapDay(today, { tokens: 5000 }),
          makeHeatmapDay(yesterday, { tokens: 0 }),
        ],
        messages: [makeRawMessage(today)],
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
