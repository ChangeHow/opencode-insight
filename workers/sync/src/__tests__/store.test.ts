import { describe, expect, test } from "vitest";
import type { UsageSyncPushPayload } from "@opencode-dashboard/shared";

class MemoryUsageStore {
  private rows = new Map<string, unknown>();

  replaceDays(payload: UsageSyncPushPayload) {
    for (const day of payload.days) {
      for (const key of this.rows.keys()) {
        if (key.startsWith(`${payload.machine.id}:${day.date}:`)) {
          this.rows.delete(key);
        }
      }

      for (const row of day.rows) {
        this.rows.set(`${payload.machine.id}:${day.date}:${row.providerId}:${row.modelId}`, {
          machineId: payload.machine.id,
          date: day.date,
          providerId: row.providerId,
          modelId: row.modelId,
          tokens: row.tokens,
        });
      }
    }
  }

  list() {
    return [...this.rows.values()];
  }
}

describe("Sync Worker Store", () => {
  test("replaces a machine day instead of appending duplicates", () => {
    const store = new MemoryUsageStore();
    const basePayload = {
      schemaVersion: 1,
      machine: { id: "mac-mini", label: "Mac mini" },
      mode: "replace-days",
      generatedAt: "2026-04-27T10:00:00.000Z",
    } satisfies Omit<UsageSyncPushPayload, "days">;

    store.replaceDays({
      ...basePayload,
      days: [
        {
          date: "2026-04-27",
          hash: "first",
          rows: [
            {
              providerId: "anthropic",
              modelId: "claude-sonnet-4",
              tokens: 100,
              pricedTokens: 100,
              cost: 0.1,
              messages: 1,
              breakdown: { input: 100, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
            },
          ],
        },
      ],
    });
    store.replaceDays({
      ...basePayload,
      days: [
        {
          date: "2026-04-27",
          hash: "second",
          rows: [
            {
              providerId: "anthropic",
              modelId: "claude-sonnet-4",
              tokens: 150,
              pricedTokens: 150,
              cost: 0.15,
              messages: 1,
              breakdown: { input: 150, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
            },
          ],
        },
      ],
    });

    expect(store.list()).toEqual([
      {
        machineId: "mac-mini",
        date: "2026-04-27",
        providerId: "anthropic",
        modelId: "claude-sonnet-4",
        tokens: 150,
      },
    ]);
  });
});
