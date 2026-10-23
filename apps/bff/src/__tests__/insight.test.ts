import { describe, expect, test, vi } from "vitest";
import {
  BridgeError,
  type SessionInsight,
  createInsightQueryReader,
} from "@opencode-insight/client";
import { createInsightController } from "../controllers/insight";
import { readSessionInsight, readSessionInsightQuery } from "../services/insight";

const snapshot: SessionInsight = {
  version: 1,
  sessionID: "ses_test",
  directory: "/native-project",
  updatedAt: 1000,
  revision: 7,
  requests: [],
  tools: [],
  interruptedCapture: false,
};

function setup() {
  const read = vi.fn(async () => snapshot);
  const app = createInsightController((sessionID, after) =>
    readSessionInsight(sessionID, after, read),
  );
  return { read, app };
}

const path = "/api/session/ses_test/insight";

describe("session Insight controller", () => {
  test("combines one snapshot with locally derived series and ignores browser targets", async () => {
    const { app, read } = setup();
    const response = await app.request(`${path}?directory=/attacker&url=https://attacker.example`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      session: snapshot,
      series: { revision: 7, unchanged: false, points: [] },
    });
    expect(read).toHaveBeenCalledExactlyOnceWith("ses_test");
  });

  test("forwards after to local series generation without an extra RPC", async () => {
    const { app, read } = setup();
    const response = await app.request(`${path}?after=7`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      session: snapshot,
      series: { revision: 7, unchanged: true, points: [] },
    });
    expect(read).toHaveBeenCalledExactlyOnceWith("ses_test");
  });

  test.each(["0", "9007199254740991"])("accepts valid after=%s", async (after) => {
    const { app, read } = setup();
    expect((await app.request(`${path}?after=${after}`)).status).toBe(200);
    expect(read).toHaveBeenCalledOnce();
  });

  test.each(["invalid", "codex:session", "ses_", `ses_${"x".repeat(125)}`, "ses_bad-id"])(
    "rejects invalid or Codex ID %s before native access",
    async (sessionID) => {
      const { app, read } = setup();
      expect(
        (await app.request(`/api/session/${encodeURIComponent(sessionID)}/insight`)).status,
      ).toBe(400);
      expect(read).not.toHaveBeenCalled();
    },
  );

  test.each(["", "-1", "1.5", "1e3", "+1", " 1", "1\n", "NaN", "Infinity", "9007199254740992"])(
    "rejects malformed after=%j before native access",
    async (after) => {
      const { app, read } = setup();
      const response = await app.request(`${path}?after=${encodeURIComponent(after)}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "after must be a nonnegative safe integer." });
      expect(read).not.toHaveBeenCalled();
    },
  );

  test.each([400, 409, 502, 503])("maps known client errors to HTTP %s", async (status) => {
    const { app, read } = setup();
    read.mockRejectedValueOnce(new BridgeError(status, "Safe client error."));
    const response = await app.request(path);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Safe client error." });
  });

  test.each([new Error("secret upstream body"), new BridgeError(500, "secret upstream body")])(
    "never exposes arbitrary errors",
    async (error) => {
      const { app, read } = setup();
      read.mockRejectedValueOnce(error);
      const response = await app.request(path);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: "Cannot query Insight on this OpenCode instance.",
      });
    },
  );

  test.each([
    ["overview", "overview", "after=7", { after: 7 }],
    ["speed-window", "speedWindow", "from=0&to=15000", { from: 0, to: 15000 }],
    ["series-window", "seriesWindow", "from=1000&to=20000", { from: 1000, to: 20000 }],
    [
      "tools",
      "toolPage",
      "group=shell&cursor=page&limit=2",
      { group: "shell", cursor: "page", limit: 2 },
    ],
    ["tools", "toolPage", "toolID=t1", { toolID: "t1" }],
    [
      "sources",
      "sourcePage",
      "scope=cumulative&kind=user&cursor=page&limit=3",
      { scope: "cumulative", kind: "user", cursor: "page", limit: 3 },
    ],
  ] as const)(
    "routes %s through the compact reader with allowlisted options",
    async (route, method, params, options) => {
      const legacy = vi.fn();
      const output = { sessionID: "ses_test", directory: "/native-project", revision: 7 };
      const read = vi.fn().mockResolvedValue(output);
      const app = createInsightController(legacy, (operation, sessionID, parameters) =>
        readSessionInsightQuery(operation, sessionID, parameters, read),
      );
      const response = await app.request(
        `${path}/${route}?${params}&directory=/attacker&url=https://attacker.example&auth=private&sessionID=ses_other&bucketMs=1000`,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(output);
      expect(read).toHaveBeenCalledExactlyOnceWith(method, "ses_test", options);
      expect(legacy).not.toHaveBeenCalled();
    },
  );

  test.each(["", "NaN", "Infinity", "1e3", " 1"])(
    "rejects malformed compact numeric parameter %j before the reader",
    async (value) => {
      const read = vi.fn();
      const app = createInsightController(vi.fn(), (method, sessionID, parameters) =>
        readSessionInsightQuery(method, sessionID, parameters, read),
      );
      const response = await app.request(
        `${path}/speed-window?from=${encodeURIComponent(value)}&to=15000`,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid numeric Insight query parameter." });
      expect(read).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["overview", "after=-1"],
    ["speed-window", "from=0"],
    ["series-window", "from=0&to=600001"],
    ["tools", "limit=51"],
    ["sources", "scope=foreign"],
  ])("validates %s query semantics before native access", async (route, params) => {
    const connect = vi.fn();
    const read = createInsightQueryReader(connect);
    const app = createInsightController(vi.fn(), (method, sessionID, parameters) =>
      readSessionInsightQuery(method, sessionID, parameters, read),
    );
    expect((await app.request(`${path}/${route}?${params}`)).status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  test.each([400, 409, 502, 503])(
    "preserves compact reader errors with HTTP %s",
    async (status) => {
      const query = vi.fn().mockRejectedValue(new BridgeError(status, "Safe query error."));
      const app = createInsightController(vi.fn(), query);
      const response = await app.request(`${path}/overview`);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "Safe query error." });
      expect(query).toHaveBeenCalledExactlyOnceWith("overview", "ses_test", {});
    },
  );

  test("sanitizes unexpected compact reader failures and leaves unknown routes unhandled", async () => {
    const query = vi.fn().mockRejectedValue(new Error("private upstream credentials"));
    const app = createInsightController(vi.fn(), query);
    const response = await app.request(`${path}/sources`);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Cannot query Insight on this OpenCode instance.",
    });
    expect((await app.request(`${path}/unknown`)).status).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
