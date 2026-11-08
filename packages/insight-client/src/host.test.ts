import http from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { INSIGHT_HOST_SOURCE_EVENT, type HostSource } from "@opencode-insight/telemetry/host";
import { createHostBridge } from "./host";
import { BridgeError } from "./connection";

const cleanup: Array<() => Promise<void> | void> = [];

async function listen(handler: http.RequestListener) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  cleanup.push(
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

async function fixture() {
  const streams = new Set<http.ServerResponse>();
  const hostRequests: string[] = [];
  const localRequests: { method: string; input: unknown; nonce: string }[] = [];
  let failConfirmation = false;
  let source: HostSource;
  const send = (response: http.ServerResponse, type: string, data: unknown) => {
    response.write(
      `data: ${JSON.stringify({ type, data, location: { directory: "/project" } })}\n\n`,
    );
  };
  const local = await listen(async (req, res) => {
    expect(req.headers.authorization).toBe(`Bearer ${source.token}`);
    expect(req.headers.authorization).not.toBe("Bearer host-private");
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    localRequests.push(body);
    if (failConfirmation && localRequests.length === 2) {
      for (const stream of streams) stream.destroy();
    } else {
      for (const stream of streams)
        send(stream, INSIGHT_HOST_SOURCE_EVENT, { ...source, nonce: body.nonce });
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        output: { sessionID: "ses_test", directory: "/project", scope: source.scope },
        scope: source.scope,
      }),
    );
  });
  source = {
    version: 1,
    port: Number(new URL(local).port),
    scope: randomUUID(),
    token: randomUUID(),
  };
  const host = await listen((req, res) => {
    expect(req.headers.authorization).toBe("Bearer host-private");
    hostRequests.push(`${req.method} ${req.url}`);
    if (req.method === "GET" && req.url === "/api/event") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      streams.add(res);
      res.once("close", () => streams.delete(res));
      send(res, "server.connected", {});
      send(res, INSIGHT_HOST_SOURCE_EVENT, source);
    } else if (req.method === "GET" && req.url === "/api/session/ses_test") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: { id: "ses_test", location: { directory: "/project" } } }));
    } else {
      res.writeHead(403);
      res.end("RPC forwarding is forbidden.");
    }
  });
  const bridge = createHostBridge(async () => ({
    baseUrl: host,
    headers: { authorization: "Bearer host-private" },
  }));
  cleanup.push(() => bridge.close());
  return {
    bridge,
    hostRequests,
    localRequests,
    get source() {
      return source;
    },
    switchDuringRead() {
      failConfirmation = true;
    },
    selectNext() {
      failConfirmation = false;
      source = { ...source, scope: randomUUID() };
    },
  };
}

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

describe("host-selected Insight transport", () => {
  test("reads local numeric data only after confirmation through the host's read-only event stream", async () => {
    const { bridge, source, hostRequests, localRequests } = await fixture();
    expect(
      await bridge.query("speedScope", { sessionID: "ses_test", directory: "/project" }),
    ).toEqual({ sessionID: "ses_test", directory: "/project", scope: source.scope });
    expect(hostRequests.sort()).toEqual(["GET /api/event", "GET /api/session/ses_test"]);
    expect(localRequests).toHaveLength(3);
    expect(localRequests[0].input).toEqual({ sessionID: "ses_test" });
    expect(localRequests[1].nonce).not.toBe(localRequests[0].nonce);
  });

  test("discards already-read data on host withdrawal or switch, and rediscovers the next source", async () => {
    const f = await fixture();
    f.switchDuringRead();
    await expect(
      f.bridge.query("speedScope", { sessionID: "ses_test", directory: "/project" }),
    ).rejects.toBeInstanceOf(BridgeError);
    const oldScope = f.source.scope;
    f.selectNext();
    const result = await f.bridge.query("speedScope", {
      sessionID: "ses_test",
      directory: "/project",
    });
    expect(result).toHaveProperty("scope", f.source.scope);
    expect(result).not.toHaveProperty("scope", oldScope);
    expect(f.hostRequests.every((request) => request.startsWith("GET "))).toBe(true);
  });
});
