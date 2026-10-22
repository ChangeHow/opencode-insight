import { describe, expect, test, vi } from "vitest";
import { buildOverview, buildToolPage, type ToolPage } from "@opencode-insight/telemetry/queries";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { createTraceData, type ToolPageReader } from "./trace-data";

function fixture(sessionID = "one"): SessionInsight {
  return {
    version: 1,
    sessionID,
    directory: "/local",
    revision: 1,
    updatedAt: 100,
    requests: [],
    interruptedCapture: false,
    tools: Array.from({ length: 25 }, (_, index) => ({
      id: `${sessionID}-${index}`,
      name: "shell",
      startedAt: index,
      endedAt: index + 1,
      status: "completed",
      background: false,
    })),
  };
}

describe("bounded trace disclosures", () => {
  test("retains the current page on failure and retries without shifting it on append", async () => {
    const raw = fixture();
    let failed = false;
    const read = vi.fn<ToolPageReader>(async (input) => {
      if (failed) throw new Error("Details offline");
      return buildToolPage(raw, { ...input, sessionID: raw.sessionID });
    });
    const data = createTraceData(read, () => {});
    data.update(buildOverview(raw, 100));
    expect(read).not.toHaveBeenCalled();
    data.open("shell");
    await vi.waitFor(() => expect(data.state.page?.entries[0].id).toBe("one-5"));
    const latest = data.state.page;
    failed = true;
    data.move(1);
    await vi.waitFor(() => expect(data.state.error).toBe("Details offline"));
    expect(data.state.page).toBe(latest);
    expect(data.state.pageIndex).toBe(0);
    failed = false;
    data.retry();
    await vi.waitFor(() => expect(data.state.pageIndex).toBe(1));
    const ids = data.state.page!.entries.map((tool) => tool.id);
    expect(ids).toEqual(["one-0", "one-1", "one-2", "one-3", "one-4"]);
    raw.tools.push({ ...raw.tools[0], id: "new-backdated-call" });
    raw.revision++;
    data.update(buildOverview(raw, 100));
    await vi.waitFor(() => expect(data.state.page?.revision).toBe(2));
    expect(data.state.page!.entries.map((tool) => tool.id)).toEqual(ids);
    expect(data.state.page!.total).toBe(25);
    expect(data.state.error).toBeUndefined();
    data.dispose();
  });

  test("discards old target results and coalesces in-flight page refreshes", async () => {
    const first = fixture();
    const second = fixture("two");
    const pending: Array<{ value: ToolPage; resolve(value: ToolPage): void }> = [];
    let raw = first;
    const read = vi.fn<ToolPageReader>(
      (input) =>
        new Promise((resolve) => {
          pending.push({
            value: buildToolPage(raw, { ...input, sessionID: raw.sessionID }),
            resolve,
          });
        }),
    );
    const data = createTraceData(read, vi.fn());
    data.update(buildOverview(first, 100));
    data.open("shell");
    first.revision++;
    data.update(buildOverview(first, 100));
    expect(read).toHaveBeenCalledTimes(1);
    raw = second;
    data.update(buildOverview(second, 100));
    data.open("shell");
    const stale = pending.shift()!;
    stale.resolve(stale.value);
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(data.state.page).toBeUndefined();
    const current = pending.shift()!;
    current.resolve(current.value);
    await vi.waitFor(() => expect(data.state.page?.sessionID).toBe("two"));
    data.dispose();
    expect(data.state.page).toBeUndefined();
  });
});
