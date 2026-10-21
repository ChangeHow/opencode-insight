import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SessionInsightPayload } from "@opencode-dashboard/shared";
import { fetchSessionInsight } from "../lib/api";
import { useSessionInsight } from "../lib/use-session-insight";

vi.mock("../lib/api", () => ({ fetchSessionInsight: vi.fn() }));
const fetchInsight = vi.mocked(fetchSessionInsight);
function payload(sessionId = "ses_first"): SessionInsightPayload {
  return {
    session: {
      version: 1,
      sessionID: sessionId,
      directory: "/project",
      updatedAt: 1000,
      revision: 1,
      requests: [],
      tools: [],
      interruptedCapture: false,
    },
    series: {
      revision: 1,
      unchanged: false,
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
  });
  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("polls with the revision and retains points on an unchanged response", async () => {
    const initial = payload();
    fetchInsight
      .mockResolvedValueOnce(initial)
      .mockResolvedValue({ ...initial, series: { revision: 1, unchanged: true, points: [] } });
    const { result } = renderHook(() => useSessionInsight("ses_first"));
    await act(async () => {});
    expect(result.current.data?.series.points).toEqual(initial.series.points);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetchInsight).toHaveBeenLastCalledWith("ses_first", 1);
    expect(result.current.data?.series.points).toEqual(initial.series.points);
  });

  test("keeps captured data on failure and retries without clearing it", async () => {
    fetchInsight
      .mockResolvedValueOnce(payload())
      .mockRejectedValueOnce(new Error("Plugin unavailable"))
      .mockResolvedValue(payload());
    const { result } = renderHook(() => useSessionInsight("ses_first"));
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.error).toBe("Plugin unavailable");
    expect(result.current.data?.session.sessionID).toBe("ses_first");
    await act(async () => {
      result.current.retry();
    });
    expect(result.current.error).toBeUndefined();
    expect(result.current.data?.series.points).toHaveLength(1);
  });

  test("pauses while hidden and resumes when visible", async () => {
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    fetchInsight.mockResolvedValue(payload());
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
    let resolveFirst!: (value: SessionInsightPayload) => void;
    fetchInsight.mockImplementation((id) =>
      id === "ses_first"
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve(payload(id)),
    );
    const { result, rerender } = renderHook(({ id }) => useSessionInsight(id), {
      initialProps: { id: "ses_first" },
    });
    rerender({ id: "ses_second" });
    await act(async () => {});
    expect(result.current.data?.session.sessionID).toBe("ses_second");
    await act(async () => {
      resolveFirst(payload());
    });
    expect(result.current.data?.session.sessionID).toBe("ses_second");
  });

  test("does not overlap requests or update after unmount", async () => {
    let resolve!: (value: SessionInsightPayload) => void;
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
      resolve(payload());
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchInsight).toHaveBeenCalledTimes(1);
  });
});
