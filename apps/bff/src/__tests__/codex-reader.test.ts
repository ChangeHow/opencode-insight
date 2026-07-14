import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readCodexMessages } from "../services/usage/codex-reader";

function writeSession(root: string, directory: "sessions" | "archived_sessions", name: string) {
  const sessionDir = path.join(root, directory, "2026", "07", "14");
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionPath = path.join(sessionDir, `${name}.jsonl`);
  fs.writeFileSync(
    sessionPath,
    [
      {
        timestamp: "2026-07-14T10:00:00.000Z",
        type: "session_meta",
        payload: {
          id: `meta-${name}`,
          source: "interactive",
          model_provider: "openai",
          cwd: "/Users/alice/project",
        },
      },
      {
        timestamp: "2026-07-14T10:00:01.000Z",
        type: "turn_context",
        payload: { model_info: { slug: "gpt-4o" } },
      },
      {
        timestamp: "2026-07-14T10:00:04.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 40,
              output_tokens: 20,
              reasoning_output_tokens: 5,
            },
            last_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 40,
              output_tokens: 20,
              reasoning_output_tokens: 5,
            },
          },
        },
      },
      {
        timestamp: "2026-07-14T10:00:05.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 40,
              output_tokens: 20,
              reasoning_output_tokens: 5,
            },
            last_token_usage: {
              input_tokens: 10,
              cached_input_tokens: 2,
              output_tokens: 1,
              reasoning_output_tokens: 0,
            },
          },
        },
      },
      {
        timestamp: "2026-07-14T10:00:08.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 130,
              cache_read_input_tokens: 50,
              output_tokens: 28,
              reasoning_output_tokens: 7,
            },
          },
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n"),
    "utf8",
  );
  return sessionPath;
}

function usageEntry(timestamp: string, total: number, last: number) {
  return {
    timestamp,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: { input_tokens: total },
        last_token_usage: { input_tokens: last },
      },
    },
  };
}

describe("Codex usage reader", () => {
  let tempRoot = "";

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-usage-"));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test("converts cumulative Codex token snapshots into deduplicated usage increments", () => {
    writeSession(tempRoot, "sessions", "session-abc");

    const messages = readCodexMessages([
      path.join(tempRoot, "sessions"),
      path.join(tempRoot, "archived_sessions"),
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      sessionId: "codex:session-abc",
      sessionTitle: "Codex CLI session",
      sessionDirectory: "/Users/alice/project",
      runtime: "codex",
      modelId: "gpt-4o",
      providerId: "openai",
      tokens: { input: 60, cacheRead: 40, output: 20, reasoning: 5, cacheWrite: 0 },
    });
    expect(messages[1]).toMatchObject({
      timestampMs: Date.parse("2026-07-14T10:00:08.000Z"),
      tokens: { input: 20, cacheRead: 10, output: 8, reasoning: 2, cacheWrite: 0 },
    });
  });

  test("keeps the cumulative baseline when filtering a recent refresh window", () => {
    writeSession(tempRoot, "archived_sessions", "session-archived");

    const messages = readCodexMessages(
      [path.join(tempRoot, "sessions"), path.join(tempRoot, "archived_sessions")],
      { fromTimestampMs: Date.parse("2026-07-14T10:00:06.000Z") },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      sessionId: "codex:session-archived",
      tokens: { input: 20, cacheRead: 10, output: 8, reasoning: 2, cacheWrite: 0 },
    });
  });

  test("ignores a slightly older cumulative snapshot replayed out of order", () => {
    const sessionDir = path.join(tempRoot, "sessions");
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, "session-replay.jsonl"),
      [
        {
          timestamp: "2026-07-14T10:00:00.000Z",
          type: "turn_context",
          payload: { model: "gpt-4o" },
        },
        usageEntry("2026-07-14T10:00:01.000Z", 1_000, 100),
        usageEntry("2026-07-14T10:00:02.000Z", 990, 50),
        usageEntry("2026-07-14T10:00:03.000Z", 1_100, 100),
      ]
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
      "utf8",
    );

    const messages = readCodexMessages([sessionDir]);

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.tokens.input)).toEqual([100, 100]);
  });
});
