import { describe, expect, test } from "vitest";
import { buildLocalSyncData, selectDaysToPush } from "../services/sync/local";
import { mergeRemoteUsageForDisplay } from "../services/sync/remote";
import { makeRawMessage, makeUsageSnapshot } from "./factories";

describe("Usage Sync", () => {
  test("builds local daily model summaries without session details", () => {
    const snapshot = makeUsageSnapshot({
      messages: [
        makeRawMessage("2026-04-26", {
          id: "msg_1",
          providerId: "anthropic",
          modelId: "claude-sonnet-4",
        }),
        makeRawMessage("2026-04-26", {
          id: "msg_2",
          providerId: "anthropic",
          modelId: "claude-sonnet-4",
        }),
      ],
    });

    const result = buildLocalSyncData(snapshot, {
      windowDays: 2,
      now: new Date("2026-04-27T10:00:00.000Z"),
    });

    expect(result.days).toHaveLength(2);
    expect(result.days[0]).toMatchObject({
      date: "2026-04-26",
      rows: [
        {
          providerId: "anthropic",
          modelId: "claude-sonnet-4",
          tokens: 13000,
          messages: 2,
        },
      ],
    });
    expect(result.days[1]).toMatchObject({ date: "2026-04-27", rows: [] });
    expect(JSON.stringify(result)).not.toContain("Session title");
  });

  test("builds first-sync history without empty days", () => {
    const snapshot = makeUsageSnapshot({
      messages: [makeRawMessage("2026-01-01"), makeRawMessage("2026-04-27")],
    });

    const result = buildLocalSyncData(snapshot, { mode: "history" });

    expect(result.days.map((day) => day.date)).toEqual(["2026-01-01", "2026-04-27"]);
  });

  test("selects only days whose hash changed", () => {
    const days = [
      { date: "2026-04-26", hash: "a", rows: [] },
      { date: "2026-04-27", hash: "b", rows: [] },
    ];

    expect(selectDaysToPush(days, { "2026-04-26": "a" }).map((day) => day.date)).toEqual([
      "2026-04-27",
    ]);
  });

  test("excludes the local machine from remote display totals", () => {
    const result = mergeRemoteUsageForDisplay({
      localMachineId: "local-mac",
      fetchedAt: "2026-04-27T10:00:00.000Z",
      remote: {
        machines: [
          { id: "local-mac", label: "Local Mac" },
          { id: "remote-mac", label: "Remote Mac" },
        ],
        rows: [
          {
            machineId: "local-mac",
            machineLabel: "Local Mac",
            date: "2026-04-27",
            providerId: "anthropic",
            modelId: "claude-sonnet-4",
            tokens: 100,
            pricedTokens: 100,
            cost: 0.1,
            messages: 1,
            breakdown: { input: 100, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
            updatedAt: "2026-04-27T10:00:00.000Z",
          },
          {
            machineId: "remote-mac",
            machineLabel: "Remote Mac",
            date: "2026-04-27",
            providerId: "anthropic",
            modelId: "claude-sonnet-4",
            tokens: 200,
            pricedTokens: 200,
            cost: 0.2,
            messages: 2,
            breakdown: { input: 200, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
            updatedAt: "2026-04-27T10:00:00.000Z",
          },
        ],
      },
    });

    expect(result.machines).toEqual([{ id: "remote-mac", label: "Remote Mac" }]);
    expect(result.totals).toMatchObject({ machines: 1, tokens: 200, messages: 2 });
  });
});
