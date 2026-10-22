import http from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, test } from "vitest";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { buildOverview } from "@opencode-insight/telemetry/queries";
import { BridgeError } from "@opencode-insight/client";
import { createInsightServer } from "./server";

const resources: Array<() => Promise<void>> = [];
const snapshot: SessionInsight = {
  version: 1,
  sessionID: "ses_test",
  directory: "/project",
  updatedAt: 1000,
  revision: 1,
  requests: [],
  tools: [],
  interruptedCapture: false,
};

async function listen(server: http.Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  resources.push(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test listener.");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  for (const dispose of resources.splice(0).reverse()) await dispose();
});

describe("Insight extension bridge", () => {
  test("serves complete Token aggregates for a session larger than the unchanged response limit", async () => {
    const context = Array.from({ length: 800 }, (_, index) => ({
      kind: "tool" as const,
      id: `captured-tool-result-${index}`,
      label: "Observed tool result",
      tokens: 1,
      quality: "estimated" as const,
    }));
    const large: SessionInsight = {
      ...snapshot,
      requests: Array.from({ length: 160 }, (_, index) => ({
        id: `request-${index}`,
        model: "fixture/model",
        startedAt: index * 1000,
        streamedAt: index * 1000 + 100,
        endedAt: index * 1000 + 100,
        status: "completed" as const,
        reasoningMode: "unknown" as const,
        capture: "live" as const,
        usage: { input: 1000, output: 10, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
        context,
        buckets: [],
      })),
    };
    expect(Buffer.byteLength(JSON.stringify(large))).toBeGreaterThan(7_000_000);
    const url = await listen(
      createInsightServer("host-private", async (method) =>
        method === "session" ? large : buildOverview(large, 200000),
      ),
    );
    const request = {
      method: "POST",
      headers: { authorization: "Bearer host-private", "content-type": "application/json" },
      body: JSON.stringify({ sessionID: "ses_test", directory: "/project" }),
    };
    expect((await fetch(`${url}/session`, request)).status).toBe(413);
    const response = await fetch(`${url}/overview`, request);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(Buffer.byteLength(text)).toBeLessThan(64000);
    const data = JSON.parse(text).data;
    expect(data.summary.usage.input).toBe(160000);
    expect(data.tokens.current.total).toBe(800);
    expect(data.tokens.cumulative.total).toBe(128000);
  });

  test("protects health and RPC routes with the host service token", async () => {
    const calls: unknown[] = [];
    const url = await listen(
      createInsightServer("host-private", async (method, body) => {
        calls.push({ method, body });
        return snapshot;
      }),
    );
    expect((await fetch(`${url}/health`)).status).toBe(401);
    const headers = { authorization: "Bearer host-private", "Content-Type": "application/json" };
    expect((await fetch(`${url}/health`, { headers })).status).toBe(200);
    const response = await fetch(`${url}/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionID: "ses_test", directory: "/project" }),
    });
    expect(await response.json()).toEqual(snapshot);
    expect(calls).toHaveLength(1);
    expect((await fetch(`${url}/arbitrary`, { method: "POST", headers, body: "{}" })).status).toBe(
      404,
    );
    expect(
      (await fetch(`${url}/session`, { method: "POST", headers, body: "broken" })).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${url}/session`, {
          method: "POST",
          headers,
          body: JSON.stringify("x".repeat(17000)),
        })
      ).status,
    ).toBe(413);
    expect(calls).toHaveLength(1);
  });

  test("preserves shared client errors at the HTTP boundary", async () => {
    const url = await listen(
      createInsightServer("host-private", async () => {
        throw new BridgeError(409, "Insight returned a different session scope.");
      }),
    );
    const response = await fetch(`${url}/session`, {
      method: "POST",
      headers: { authorization: "Bearer host-private", "Content-Type": "application/json" },
      body: JSON.stringify({ sessionID: "ses_test", directory: "/project" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Insight returned a different session scope." });
  });
});
