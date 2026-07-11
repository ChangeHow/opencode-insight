import { describe, expect, test } from "vitest";
import { calculateLongestTaskDuration } from "../services/session-tasks";

function session(id: string, parentId: string | null = null, timeCreated = 0) {
  return { id, parent_id: parentId, time_created: timeCreated, depth: parentId ? 1 : 0 };
}

function message(
  id: string,
  sessionId: string,
  role: "user" | "assistant",
  createdAt: number,
  completedAt = createdAt,
  options?: { error?: unknown },
) {
  return {
    id,
    session_id: sessionId,
    time_created: createdAt,
    time_updated: completedAt,
    data: JSON.stringify({
      role,
      time: { created: createdAt, completed: completedAt },
      ...(options?.error === undefined ? {} : { error: options.error }),
    }),
  };
}

describe("session task duration", () => {
  test("returns the longest task inside one session", () => {
    const duration = calculateLongestTaskDuration(
      [session("parent")],
      [
        message("u1", "parent", "user", 0),
        message("a1", "parent", "assistant", 1_000, 11_000),
        message("u2", "parent", "user", 20_000),
        message("a2", "parent", "assistant", 21_000, 51_000),
      ],
      "parent",
    );

    expect(duration).toBe(30_000);
  });

  test("adds continuation assistant time to the previous task without idle time", () => {
    const duration = calculateLongestTaskDuration(
      [session("parent"), session("child", "parent", 120_000)],
      [
        message("u1", "parent", "user", 0),
        message("a1", "parent", "assistant", 1_000, 11_000),
        message("resume", "child", "user", 120_000),
        message("a2", "child", "assistant", 121_000, 151_000),
        message("u2", "child", "user", 160_000),
        message("a3", "child", "assistant", 161_000, 166_000),
      ],
      "parent",
    );

    expect(duration).toBe(40_000);
  });

  test("adds same-session assistant time after an assistant error to the previous task", () => {
    const duration = calculateLongestTaskDuration(
      [session("parent")],
      [
        message("u1", "parent", "user", 0),
        message("a1", "parent", "assistant", 1_000, 11_000, {
          error: { name: "MessageAbortedError" },
        }),
        message("resume", "parent", "user", 120_000),
        message("a2", "parent", "assistant", 121_000, 151_000),
        message("u2", "parent", "user", 160_000),
        message("a3", "parent", "assistant", 161_000, 166_000),
      ],
      "parent",
    );

    expect(duration).toBe(40_000);
  });

  test("keeps a task continuous across promoted steer messages", () => {
    const duration = calculateLongestTaskDuration(
      [session("parent")],
      [
        message("u1", "parent", "user", 0),
        message("a1", "parent", "assistant", 1_000, 11_000),
        message("steer", "parent", "user", 12_000),
        message("a2", "parent", "assistant", 13_000, 43_000),
        message("u2", "parent", "user", 50_000),
        message("a3", "parent", "assistant", 51_000, 56_000),
      ],
      "parent",
      new Map([["parent:steer", "steer"]]),
    );

    expect(duration).toBe(40_000);
  });

  test("does not double count overlapping subagent work", () => {
    const duration = calculateLongestTaskDuration(
      [session("parent"), session("child", "parent", 2_000)],
      [
        message("u1", "parent", "user", 0),
        message("child-u1", "child", "user", 1_000),
        message("a1", "parent", "assistant", 2_000, 32_000),
        message("child-a1", "child", "assistant", 5_000, 25_000),
      ],
      "parent",
    );

    expect(duration).toBe(30_000);
  });
});
