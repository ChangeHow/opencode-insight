// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { buildOverview, buildToolPage } from "@opencode-insight/telemetry/queries";
import { createTimingView } from "./timing-view";
import { stubPopover } from "./popover.test-helper";

stubPopover();

describe("live timing refresh", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("uses one visible clock and stops it on settlement, reset and disposal", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const interval = vi.spyOn(globalThis, "setInterval");
    const clear = vi.spyOn(globalThis, "clearInterval");
    const root = document.createElement("main");
    const view = createTimingView(root, async (query) =>
      buildToolPage(input, { ...query, sessionID: input.sessionID }),
    );
    const input: SessionInsight = {
      version: 1,
      sessionID: "session",
      directory: "/local",
      revision: 1,
      updatedAt: 1000,
      interruptedCapture: false,
      tools: [],
      requests: [
        {
          id: "request",
          model: "model",
          startedAt: 0,
          status: "running",
          reasoningMode: "unknown",
          buckets: [],
          context: [],
          capture: "live",
        },
      ],
    };
    try {
      view.update(buildOverview(input));
      view.update(buildOverview(input));
      expect(interval).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1000);
      expect(root.querySelector(".trace-value")?.textContent).toBe("2 s");
      hidden.mockReturnValue(true);
      vi.advanceTimersByTime(1000);
      expect(root.querySelector(".trace-value")?.textContent).toBe("2 s");
      hidden.mockReturnValue(false);
      vi.advanceTimersByTime(1000);
      expect(root.querySelector(".trace-value")?.textContent).toBe("4 s");
      view.update(
        buildOverview({
          ...input,
          revision: 2,
          requests: [{ ...input.requests[0], status: "completed", endedAt: 3500 }],
        }),
      );
      expect(clear).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1000);
      expect(root.querySelector(".trace-value")?.textContent).toBe("3.5 s");
      view.update(buildOverview(input));
      view.reset();
      expect(clear).toHaveBeenCalledTimes(2);
      view.update(buildOverview(input));
    } finally {
      view.dispose();
    }
    expect(clear).toHaveBeenCalledTimes(3);
    expect(root.children).toHaveLength(0);
  });
});
