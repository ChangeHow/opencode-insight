import http from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, test } from "vitest";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
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
