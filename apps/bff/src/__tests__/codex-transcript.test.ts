import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildCodexMessagePayloads } from "../services/codex-transcript";
import { buildSessionMessagePayloads } from "../services/messages";

const originalCodexHome = process.env.CODEX_HOME;

describe("Codex transcript reader", () => {
  let tempRoot = "";
  let sessionDir = "";

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-transcript-"));
    process.env.CODEX_HOME = tempRoot;
    sessionDir = path.join(tempRoot, "sessions", "2026", "07", "14");
    fs.mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test("reconstructs user, assistant, reasoning, tool, and token details without duplicates", async () => {
    const entries = [
      {
        timestamp: "2026-07-14T10:00:00.000Z",
        type: "session_meta",
        payload: { id: "thread-abc", model_provider: "openai", cwd: "/repo" },
      },
      {
        timestamp: "2026-07-14T10:00:01.000Z",
        type: "turn_context",
        payload: { model: "gpt-5.4" },
      },
      {
        timestamp: "2026-07-14T10:00:02.000Z",
        type: "event_msg",
        payload: { type: "task_started", turn_id: "turn-1", started_at: 1_784_022_402 },
      },
      {
        timestamp: "2026-07-14T10:00:03.000Z",
        type: "event_msg",
        payload: { type: "user_message", message: "## My request for Codex:\nFix the parser" },
      },
      {
        timestamp: "2026-07-14T10:00:03.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "## My request for Codex:\nFix the parser" }],
        },
      },
      {
        timestamp: "2026-07-14T10:00:04.000Z",
        type: "event_msg",
        payload: { type: "agent_reasoning", text: "Inspecting the parser." },
      },
      {
        timestamp: "2026-07-14T10:00:05.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "shell_command",
          arguments: '{"command":"pnpm test"}',
          call_id: "call-1",
        },
      },
      {
        timestamp: "2026-07-14T10:00:06.000Z",
        type: "response_item",
        payload: { type: "function_call_output", call_id: "call-1", output: "Tests passed" },
      },
      {
        timestamp: "2026-07-14T10:00:07.000Z",
        type: "event_msg",
        payload: { type: "agent_message", message: "Parser fixed.", phase: "final_answer" },
      },
      {
        timestamp: "2026-07-14T10:00:08.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            last_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 20,
              output_tokens: 40,
              reasoning_output_tokens: 5,
            },
          },
        },
      },
      {
        timestamp: "2026-07-14T10:00:09.000Z",
        type: "event_msg",
        payload: {
          type: "task_complete",
          turn_id: "turn-1",
          completed_at: 1_784_022_409,
        },
      },
    ];
    fs.writeFileSync(
      path.join(sessionDir, "session-abc.jsonl"),
      entries.map((entry) => JSON.stringify(entry)).join("\n"),
      "utf8",
    );

    const payloads = await buildCodexMessagePayloads(
      [path.join(tempRoot, "sessions")],
      "codex:session-abc",
    );
    const page = payloads.listFn(0, 20);

    expect(page.total).toBe(2);
    expect(page.messages[0]).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "Fix the parser" }],
    });
    expect(page.messages[1]).toMatchObject({
      role: "assistant",
      modelId: "gpt-5.4",
      providerId: "openai",
      tokens: { input: 80, cacheRead: 20, output: 40, reasoning: 5, cacheWrite: 0 },
      parts: [
        { type: "reasoning", text: "Inspecting the parser." },
        {
          type: "tool",
          callId: "call-1",
          toolName: "shell_command",
          status: "completed",
          input: { command: "pnpm test" },
          output: "Tests passed",
        },
        { type: "text", text: "Parser fixed." },
      ],
    });
    expect(payloads.overview.totalMessages).toBe(2);
    expect(payloads.overview.toolUsage).toEqual([
      { tool: "shell_command", count: 1, totalTokens: 145 },
    ]);
    const cachedPage = (await buildSessionMessagePayloads("codex:session-abc")).listFn(0, 20);
    expect(cachedPage.total).toBe(2);
  });

  test("avoids rescanning session directories for a cached transcript", async () => {
    const filePath = path.join(sessionDir, "session-cached.jsonl");
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        timestamp: "2026-07-14T10:00:00.000Z",
        type: "event_msg",
        payload: { type: "user_message", message: "Hello" },
      }),
      "utf8",
    );

    for (let index = 0; index < 100; index++) {
      const unrelatedDir = path.join(sessionDir, "unrelated", String(index));
      fs.mkdirSync(unrelatedDir, { recursive: true });
      fs.writeFileSync(path.join(unrelatedDir, `session-${index}.jsonl`), "{}", "utf8");
    }

    const sessionDirs = [path.join(tempRoot, "sessions")];
    await buildCodexMessagePayloads(sessionDirs, "codex:session-cached");

    const readdirSync = vi.spyOn(fs, "readdirSync");
    await buildCodexMessagePayloads(sessionDirs, "codex:session-cached");

    expect(readdirSync).not.toHaveBeenCalled();
    readdirSync.mockRestore();
  });
});
