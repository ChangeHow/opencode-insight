import { describe, expect, test } from "vitest";
import type { ToolInsight } from "@opencode-insight/telemetry";
import { toolMetadata } from "./events";

describe("native Code Mode call metadata", () => {
  test("records three reported calls without inventing IDs, timing, or retaining inputs", () => {
    const tool: ToolInsight = {
      id: "execute-call",
      name: "execute",
      startedAt: 1000,
      status: "running",
      background: false,
    };
    toolMetadata(tool, {
      toolCalls: Array.from({ length: 3 }, () => ({
        tool: "files.read_text_file",
        status: "completed",
        input: { path: "SECRET_PATH" },
      })),
    });
    expect(tool.reportedCalls).toEqual(
      Array.from({ length: 3 }, () => ({ name: "files.read_text_file", status: "completed" })),
    );
    expect(tool.endedAt).toBeUndefined();
    expect(JSON.stringify(tool)).not.toContain("SECRET");
    expect(tool.reportedCalls?.every((call) => !("startedAt" in call) && !("id" in call))).toBe(
      true,
    );
  });

  test("replaces progress snapshots rather than double-counting repeated metadata", () => {
    const tool: ToolInsight = {
      id: "execute-call",
      name: "execute",
      startedAt: 1000,
      status: "running",
      background: false,
    };
    toolMetadata(tool, { toolCalls: [{ tool: "search", status: "running" }] });
    toolMetadata(tool, { toolCalls: [{ tool: "search", status: "completed" }] });
    expect(tool.reportedCalls).toEqual([{ name: "search", status: "completed" }]);
  });

  test("bounds reported call details and preserves unknown status explicitly", () => {
    const tool: ToolInsight = {
      id: "execute-call",
      name: "execute",
      startedAt: 1000,
      status: "running",
      background: false,
    };
    toolMetadata(tool, {
      toolCalls: [
        { tool: "files.read_text_file" },
        ...Array.from({ length: 2048 }, () => ({ tool: "files.read_text_file", status: "failed" })),
      ],
    });
    expect(tool.reportedCalls).toHaveLength(2048);
    expect(tool.reportedCalls?.[0].status).toBe("unknown");
    expect(tool.reportedCalls?.[1].status).toBe("error");
    expect(tool.reportedCallsTruncated).toBe(true);
  });
});
