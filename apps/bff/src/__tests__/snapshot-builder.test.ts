import { describe, expect, test } from "vitest";
import { buildIncrementalSnapshot, buildSnapshot } from "../services/usage/snapshot-builder";
import type { UsageSnapshot } from "../services/usage/types";
import { makeRawMessage, makeTokenBreakdown } from "./factories";

function withoutScanTime(snapshot: UsageSnapshot) {
  return {
    ...snapshot,
    summary: { ...snapshot.summary, scannedAt: "" },
  };
}

describe("Incremental snapshot builder", () => {
  const paths = ["/tmp/opencode.db"];
  const refreshStartTimestampMs = Date.parse("2026-04-25T00:00:00.000Z");

  test("matches a full rebuild after recent messages change", () => {
    const historical = makeRawMessage("2026-04-24", { id: "historical" });
    const previousRecent = makeRawMessage("2026-04-26", { id: "recent" });
    const base = buildSnapshot([historical, previousRecent], "sqlite", paths);
    const updatedRecent = makeRawMessage("2026-04-26", {
      id: "recent",
      modelId: "gpt-5",
      tokens: makeTokenBreakdown({ input: 12_000, output: 3_000 }),
      estimatedCost: 0.25,
    });
    const addedRecent = makeRawMessage("2026-04-27", { id: "added" });

    const incremental = buildIncrementalSnapshot(
      base,
      [updatedRecent, addedRecent],
      refreshStartTimestampMs,
      "sqlite",
      paths,
    );
    const full = buildSnapshot([historical, updatedRecent, addedRecent], "sqlite", paths);

    expect(withoutScanTime(incremental)).toEqual(withoutScanTime(full));
    expect(incremental.breakdownByDate.get("2026-04-24")).toBe(
      base.breakdownByDate.get("2026-04-24"),
    );
  });

  test("removes prior recent activity when the refreshed window is empty", () => {
    const historical = makeRawMessage("2026-04-24", { id: "historical" });
    const previousRecent = makeRawMessage("2026-04-26", { id: "recent" });
    const base = buildSnapshot([historical, previousRecent], "sqlite", paths);

    const incremental = buildIncrementalSnapshot(
      base,
      [],
      refreshStartTimestampMs,
      "sqlite",
      paths,
    );
    const full = buildSnapshot([historical], "sqlite", paths);

    expect(withoutScanTime(incremental)).toEqual(withoutScanTime(full));
    expect(incremental.breakdownByDate.has("2026-04-26")).toBe(false);
  });
});
