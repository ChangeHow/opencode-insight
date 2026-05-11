import { bench, describe } from "vitest";
import type { CostSeriesLine, TrendPoint } from "@opencode-dashboard/shared";

function generateTrendData(days: number): TrendPoint[] {
  const data: TrendPoint[] = [];
  const baseDate = new Date("2026-01-01");
  for (let i = 0; i < days; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    data.push({
      date: date.toISOString().split("T")[0],
      cost: Math.random() * 100,
      tokens: Math.floor(Math.random() * 1_000_000),
      messages: Math.floor(Math.random() * 100),
    });
  }
  return data;
}

function generateLines(count: number, days: number): CostSeriesLine[] {
  const baseDate = new Date("2026-01-01");
  return Array.from({ length: count }, (_unused, lineIndex) => {
    const points = Array.from({ length: days }, (_unusedDay, dayIndex) => {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + dayIndex);
      return {
        date: date.toISOString().split("T")[0],
        cost: Math.random() * 100,
        tokens: Math.floor(Math.random() * 1_000_000),
        messages: Math.floor(Math.random() * 100),
      };
    });
    return {
      key: `line_${lineIndex}`,
      label: `Line ${lineIndex}`,
      providerId: `provider_${lineIndex}`,
      modelId: `model_${lineIndex}`,
      points,
    };
  });
}

function composeChartDataMap(data: TrendPoint[], lines: CostSeriesLine[]) {
  const lineMaps = lines.map((line) => ({
    key: line.key,
    pointMap: new Map(line.points.map((p) => [p.date, p.cost])),
  }));

  return data.map((point) => {
    const entry: Record<string, number | string> = {
      date: point.date,
    };
    for (const { key, pointMap } of lineMaps) {
      entry[key] = pointMap.get(point.date) ?? 0;
    }
    return entry;
  });
}

function composeChartDataFind(data: TrendPoint[], lines: CostSeriesLine[]) {
  return data.map((point) => {
    const entry: Record<string, number | string> = {
      date: point.date,
    };
    for (const line of lines) {
      entry[line.key] = line.points.find((item) => item.date === point.date)?.cost ?? 0;
    }
    return entry;
  });
}

function computeYAxisMaxOptimized(data: TrendPoint[], lines: CostSeriesLine[]) {
  let maxValue = 0;
  if (lines.length > 0) {
    for (const line of lines) {
      for (const point of line.points) {
        if (Number.isFinite(point.cost) && point.cost > maxValue) {
          maxValue = point.cost;
        }
      }
    }
  } else {
    for (const point of data) {
      if (Number.isFinite(point.cost) && point.cost > maxValue) {
        maxValue = point.cost;
      }
    }
  }
  return maxValue;
}

function computeYAxisMaxOriginal(data: TrendPoint[], lines: CostSeriesLine[]) {
  const primaryValues =
    lines.length > 0
      ? lines.flatMap((line) => line.points.map((point) => point.cost))
      : data.map((point) => point.cost);
  const values = primaryValues.filter((value) => Number.isFinite(value) && value >= 0);
  return Math.max(...values, 0);
}

describe("trend chart data composition", () => {
  const smallData = generateTrendData(30);
  const smallLines = generateLines(4, 30);
  const largeData = generateTrendData(365);
  const largeLines = generateLines(10, 365);

  bench(
    "composeChartData with Map (optimized) - 30 days, 4 lines",
    () => {
      composeChartDataMap(smallData, smallLines);
    },
    { iterations: 1000 },
  );

  bench(
    "composeChartData with find (original) - 30 days, 4 lines",
    () => {
      composeChartDataFind(smallData, smallLines);
    },
    { iterations: 1000 },
  );

  bench(
    "composeChartData with Map (optimized) - 365 days, 10 lines",
    () => {
      composeChartDataMap(largeData, largeLines);
    },
    { iterations: 100 },
  );

  bench(
    "composeChartData with find (original) - 365 days, 10 lines",
    () => {
      composeChartDataFind(largeData, largeLines);
    },
    { iterations: 100 },
  );
});

describe("y-axis max computation", () => {
  const smallData = generateTrendData(30);
  const smallLines = generateLines(4, 30);
  const largeData = generateTrendData(365);
  const largeLines = generateLines(10, 365);

  bench(
    "computeYAxisMax optimized - 30 days, 4 lines",
    () => {
      computeYAxisMaxOptimized(smallData, smallLines);
    },
    { iterations: 10000 },
  );

  bench(
    "computeYAxisMax original - 30 days, 4 lines",
    () => {
      computeYAxisMaxOriginal(smallData, smallLines);
    },
    { iterations: 10000 },
  );

  bench(
    "computeYAxisMax optimized - 365 days, 10 lines",
    () => {
      computeYAxisMaxOptimized(largeData, largeLines);
    },
    { iterations: 5000 },
  );

  bench(
    "computeYAxisMax original - 365 days, 10 lines",
    () => {
      computeYAxisMaxOriginal(largeData, largeLines);
    },
    { iterations: 5000 },
  );
});
