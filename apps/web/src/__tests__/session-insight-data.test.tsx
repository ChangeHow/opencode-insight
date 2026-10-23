import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SessionInsightQueryPayload } from "@opencode-dashboard/shared";
import { fetchSessionInsightOverview, fetchSessionInsightSeriesWindow } from "../lib/api";
import { useSessionInsight } from "../lib/use-session-insight";

vi.mock("../lib/api", () => ({
  fetchSessionInsightOverview: vi.fn(),
  fetchSessionInsightSeriesWindow: vi.fn(),
}));
const fetchInsight = vi.mocked(fetchSessionInsightOverview);
const fetchSeries = vi.mocked(fetchSessionInsightSeriesWindow);
function payload(sessionId = "ses_first"): SessionInsightQueryPayload {
  return {
    overview: {
      sessionID: sessionId,
      directory: "/project",
      revision: 1,
      unchanged: false,
      data: {
        updatedAt: 1000,
        measuredAt: 1000,
        hasActivity: true,
        running: false,
        summary: {
          usage: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
          cost: 0,
          modelMs: 0,
          toolMs: 0,
          foregroundMs: 0,
          backgroundToolMs: 0,
          capturePartial: false,
          hasUsage: false,
          hasCost: false,
        },
        tokens: {
          current: { total: 0, reported: false, groups: [] },
          cumulative: { total: 0, reported: false, groups: [] },
        },
        trace: {
          start: 1000,
          end: 1000,
          measuredAt: 1000,
          running: false,
          summary: {
            requestCount: 1,
            toolCount: 0,
            errorCount: 0,
            unknownCount: 0,
            partialUsage: true,
            partialCost: true,
          },
          groups: [],
        },
        phases: { phases: [], totalMs: 0, backgroundMs: 0, unknownCount: 0 },
      },
    },
    series: {
      sessionID: sessionId,
      directory: "/project",
      revision: 1,
      start: 0,
      end: 1000,
      running: false,
      requests: [
        {
          id: "req_one",
          model: "test",
          startedAt: 0,
          streamedAt: 1000,
          endedAt: 1000,
          status: "completed",
          reasoningMode: "visible",
          capture: "live",
          captured: true,
        },
      ],
      channels: { reasoning: false, summary: false },
      points: [
        {
          at: 1000,
          requestID: "req_one",
          model: "test",
          outputTps: 5,
          reasoningTps: 0,
          summaryTps: 0,
          quality: "estimated",
        },
      ],
    },
  };
}

describe("live session insight data", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    fetchInsight.mockReset();
    fetchSeries.mockReset();
    fetchSeries.mockImplementation(async (id) => payload(id).series);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("polls with the revision and retains points on an unchanged response", async () => {
    const initial = payload();
    fetchInsight.mockResolvedValueOnce(initial.overview).mockResolvedValue({
      sessionID: "ses_first",
      directory: "/project",
      revision: 1,
      unchanged: true,
    });
    const { result } = renderHook(() => useSessionInsight("ses_first"));
    await act(async () => {});
    expect(result.current.data?.series.points).toEqual(initial.series.points);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchInsight).toHaveBeenLastCalledWith("ses_first", 1);
    expect(result.current.data?.series.points).toEqual(initial.series.points);
    expect(result.current.data?.overview.data).toEqual(initial.overview.data);
    expect(fetchSeries).toHaveBeenCalledTimes(1);
  });

  test("unchanged idle heartbeats retain exact data references without rerendering", async () => {
    fetchInsight.mockResolvedValueOnce(payload().overview).mockResolvedValue({
      sessionID: "ses_first",
      directory: "/project",
      revision: 1,
      unchanged: true,
    });
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useSessionInsight("ses_first");
    });
    await act(async () => {});
    const data = result.current.data;
    const settledRenders = renders;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.data).toBe(data);
    expect(result.current.data?.overview).toBe(data?.overview);
    expect(result.current.data?.series).toBe(data?.series);
    expect(renders).toBe(settledRenders);
    expect(fetchSeries).toHaveBeenCalledTimes(1);
  });

  test("refreshes a running window on unchanged heartbeats, then stops when quiescent", async () => {
    const initial = payload();
    initial.overview.data.running = true;
    initial.series.running = true;
    fetchInsight.mockResolvedValueOnce(initial.overview).mockResolvedValue({
      sessionID: "ses_first",
      directory: "/project",
      revision: 1,
      unchanged: true,
    });
    fetchSeries.mockResolvedValue(initial.series);
    renderHook(() => useSessionInsight("ses_first"));
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchSeries).toHaveBeenCalledTimes(2);
    fetchInsight.mockResolvedValueOnce({ ...payload().overview, revision: 2 }).mockResolvedValue({
      sessionID: "ses_first",
      directory: "/project",
      revision: 2,
      unchanged: true,
    });
    fetchSeries.mockResolvedValue({ ...payload().series, revision: 2 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchSeries).toHaveBeenCalledTimes(3);
  });

  test("retries a failed series refresh without replacing retained data", async () => {
    fetchInsight.mockResolvedValueOnce(payload().overview).mockResolvedValue({
      ...payload().overview,
      revision: 2,
    });
    fetchSeries
      .mockResolvedValueOnce(payload().series)
      .mockRejectedValueOnce(new Error("Series unavailable"))
      .mockResolvedValue({ ...payload().series, revision: 2 });
    const { result } = renderHook(() => useSessionInsight("ses_first"));
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.error).toBe("Series unavailable");
    expect(result.current.data?.series.revision).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.error).toBeUndefined();
    expect(result.current.data?.series.revision).toBe(2);
  });

  test("keeps captured data on failure and retries without clearing it", async () => {
    fetchInsight
      .mockResolvedValueOnce(payload().overview)
      .mockRejectedValueOnce(new Error("Plugin unavailable"))
      .mockResolvedValue(payload().overview);
    const { result } = renderHook(() => useSessionInsight("ses_first"));
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.error).toBe("Plugin unavailable");
    expect(result.current.data?.overview.sessionID).toBe("ses_first");
    await act(async () => {
      result.current.retry();
    });
    expect(result.current.error).toBeUndefined();
    expect(result.current.data?.series.points).toHaveLength(1);
  });

  test("pauses while hidden and resumes when visible", async () => {
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    fetchInsight.mockResolvedValue(payload().overview);
    renderHook(() => useSessionInsight("ses_first"));
    await act(async () => {});
    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchInsight).toHaveBeenCalledTimes(1);
    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchInsight).toHaveBeenCalledTimes(2);
  });

  test("ignores a previous session response after switching targets", async () => {
    let resolveFirst!: (value: SessionInsightQueryPayload["overview"]) => void;
    fetchInsight.mockImplementation((id) =>
      id === "ses_first"
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve(payload(id).overview),
    );
    const { result, rerender } = renderHook(({ id }) => useSessionInsight(id), {
      initialProps: { id: "ses_first" },
    });
    rerender({ id: "ses_second" });
    await act(async () => {});
    expect(result.current.data?.overview.sessionID).toBe("ses_second");
    await act(async () => {
      resolveFirst(payload().overview);
    });
    expect(result.current.data?.overview.sessionID).toBe("ses_second");
  });

  test("does not overlap requests or update after unmount", async () => {
    let resolve!: (value: SessionInsightQueryPayload["overview"]) => void;
    fetchInsight.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { unmount } = renderHook(() => useSessionInsight("ses_first"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fetchInsight).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      resolve(payload().overview);
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchInsight).toHaveBeenCalledTimes(1);
  });
});
