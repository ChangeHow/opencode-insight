import { describe, expect, test, vi } from "vitest";
import type { Plugin } from "@opencode/plugin";
import { Collector } from "./collector";

function setup() {
  const data = new Map<string, unknown>();
  const storage = {
    get: vi.fn(async (key: string) => structuredClone(data.get(key))),
    set: vi.fn(async (key: string, value: unknown) => {
      data.set(key, structuredClone(value));
    }),
  };
  return {
    storage,
    collector: new Collector(storage as unknown as Plugin.Context["storage"], "/a"),
  };
}

describe("idle telemetry ownership", () => {
  test("releases persisted detail despite unchanged-series polling and restores it exactly", async () => {
    vi.useFakeTimers();
    const { storage, collector } = setup();
    try {
      const session = await collector.session("s1");
      const request = collector.start(session, "r1", "fixture/model", Date.now());
      collector.delta(session, request, "text", "output", "hello world", Date.now());
      request.status = "completed";
      request.endedAt = Date.now();
      collector.release(session, request);
      collector.touch(session, Date.now());
      await collector.flush();
      const expected = JSON.parse(JSON.stringify(session));
      for (let second = 0; second < 20; second++) {
        await vi.advanceTimersByTimeAsync(1000);
        await collector.serialize(async () => {
          if (!collector.unchanged("s1", session.revision)) await collector.session("s1");
        });
      }
      expect(collector.unchanged("s1", session.revision)).toEqual({
        revision: session.revision,
        unchanged: true,
        points: [],
      });
      expect(storage.get).toHaveBeenCalledTimes(1);
      const restored = await collector.session("s1");
      expect(restored).not.toBe(session);
      expect(JSON.parse(JSON.stringify(restored))).toEqual(expected);
      const resumed = collector.start(restored, "r2", "fixture/model", Date.now());
      expect(resumed.status).toBe("running");
      expect(restored.requests[0]).toEqual(request);
    } finally {
      await collector.close();
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    }
  });

  test("retains active work, pending context, and never-persisted empty sessions", async () => {
    vi.useFakeTimers();
    const { collector } = setup();
    try {
      const active = await collector.session("active");
      collector.start(active, "r1", "fixture/model", Date.now());
      const pending = await collector.session("pending");
      collector.touch(pending, Date.now());
      collector.context(pending, [
        { kind: "user", id: "u1", label: "user", tokens: 7, quality: "estimated" },
      ]);
      const empty = await collector.session("empty");
      await collector.flush();
      await vi.advanceTimersByTimeAsync(30000);
      expect(await collector.session("active")).toBe(active);
      expect(await collector.session("pending")).toBe(pending);
      expect(await collector.session("empty")).toBe(empty);
      expect(collector.start(pending, "r2", "fixture/model", Date.now()).context[0].tokens).toBe(7);
    } finally {
      await collector.close();
      vi.useRealTimers();
    }
  });

  test("never discards the only copy after persistence fails", async () => {
    vi.useFakeTimers();
    const { storage, collector } = setup();
    try {
      const session = await collector.session("s1");
      collector.touch(session, Date.now());
      storage.set.mockRejectedValue(new Error("Disk unavailable"));
      await vi.advanceTimersByTimeAsync(30000);
      expect(() => collector.assertHealthy()).toThrow("persistence failed");
      expect(await collector.session("s1")).toBe(session);
      expect(collector.unchanged("s1", session.revision)).toBeUndefined();
    } finally {
      storage.set.mockImplementation(async () => {});
      await collector.close();
      vi.useRealTimers();
    }
  });

  test("releases settled detail on reconnect and restarts periodic persistence", async () => {
    vi.useFakeTimers();
    const { storage, collector } = setup();
    try {
      const original = await collector.session("s1");
      collector.start(original, "r1", "fixture/model", Date.now());
      await collector.close();
      const restored = await collector.session("s1");
      expect(restored).not.toBe(original);
      expect(restored.requests[0].status).toBe("interrupted");
      const next = collector.start(restored, "r2", "fixture/model", Date.now());
      collector.delta(restored, next, "text", "output", "Resumed capture", Date.now());
      await vi.advanceTimersByTimeAsync(1100);
      expect(storage.set.mock.lastCall?.[1]).toMatchObject({
        requests: [
          { id: "r1", status: "interrupted" },
          { id: "r2", status: "running" },
        ],
      });
    } finally {
      await collector.close();
      vi.useRealTimers();
    }
  });
});
