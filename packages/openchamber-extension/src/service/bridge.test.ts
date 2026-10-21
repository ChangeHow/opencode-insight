import http from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import { createBridge } from "./bridge";
import { loadConnection, validateEndpoint } from "./connection";
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

async function configFile(value: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "insight-bridge-"));
  resources.push(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "connection.json");
  await writeFile(file, JSON.stringify(value), { mode: 0o600 });
  return file;
}

afterEach(async () => {
  for (const dispose of resources.splice(0).reverse()) await dispose();
});

describe("Insight extension bridge", () => {
  test("uses managed discovery without starting or changing OpenCode", async () => {
    const file = await configFile({ registrationFile: "/private/service.json" });
    const calls: unknown[] = [];
    const connection = await loadConnection(file, async (options) => {
      calls.push(options);
      return {
        url: "http://127.0.0.1:4096",
        auth: { type: "basic", username: "opencode", password: "private" },
      };
    });
    expect(connection.baseUrl).toBe("http://127.0.0.1:4096");
    expect(new Headers(connection.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("opencode:private").toString("base64")}`,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ file: "/private/service.json" });
  });

  test("accepts explicit HTTPS credentials only from a protected host-side file", async () => {
    const file = await configFile({
      url: "https://opencode.example",
      auth: { type: "bearer", token: "private" },
    });
    expect(await loadConnection(file)).toEqual({
      baseUrl: "https://opencode.example",
      headers: { authorization: "Bearer private" },
    });
    if (process.platform !== "win32") {
      await chmod(file, 0o644);
      await expect(loadConnection(file)).rejects.toThrow("0600");
    }
  });

  test("fails closed on invalid config and unavailable discovery", async () => {
    const file = await configFile({ url: "http://remote.example" });
    await expect(loadConnection(file)).rejects.toThrow("HTTPS");
    const malformed = await configFile({ unexpected: true });
    await expect(loadConnection(malformed)).rejects.toThrow("Invalid");
    await expect(loadConnection(`${file}.missing`, async () => undefined)).rejects.toThrow(
      "No running OpenCode",
    );
  });

  test("refuses URL credentials and non-HTTP or non-loopback plaintext targets", () => {
    for (const target of [
      "http://remote.example",
      "file:///etc/passwd",
      "https://user:password@example.com",
      "https://example.com/path",
    ]) {
      expect(() => validateEndpoint(target)).toThrow();
    }
    expect(validateEndpoint("http://[::1]:4096")).toBe("http://[::1]:4096");
  });

  test("queries only allowlisted RPC methods and validates session directory", async () => {
    const rpcBodies: unknown[] = [];
    let directory = "/project";
    const url = await listen(
      http.createServer(async (req, res) => {
        expect(req.headers.authorization).toBe("Bearer upstream-private");
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/api/session/ses_test") {
          res.end(JSON.stringify({ data: { id: "ses_test", location: { directory } } }));
          return;
        }
        let body = "";
        for await (const chunk of req) body += chunk;
        rpcBodies.push(JSON.parse(body));
        expect(req.url).toContain("/api/rpc/opencode-insight/");
        expect(decodeURIComponent(req.url ?? "")).toContain("/project");
        res.end(
          JSON.stringify({
            output: req.url?.includes("/series")
              ? { revision: 1, unchanged: false, points: [] }
              : snapshot,
          }),
        );
      }),
    );
    const bridge = createBridge(async () => ({
      baseUrl: url,
      headers: { authorization: "Bearer upstream-private" },
    }));
    expect(await bridge("session", { sessionID: "ses_test", directory: "/project" })).toEqual(
      snapshot,
    );
    expect(await bridge("series", { sessionID: "ses_test", directory: "/project" })).toEqual({
      revision: 1,
      unchanged: false,
      points: [],
    });
    expect(rpcBodies[0]).toEqual({ input: { sessionID: "ses_test" } });
    directory = "/other-project";
    await expect(
      bridge("session", { sessionID: "ses_test", directory: "/project" }),
    ).rejects.toThrow("another directory");
    expect(rpcBodies).toHaveLength(2);
  });

  test("does not forward upstream secrets or follow redirects", async () => {
    let destinationCalls = 0;
    const destination = await listen(
      http.createServer((_req, res) => {
        destinationCalls += 1;
        res.end("private");
      }),
    );
    const source = await listen(
      http.createServer((_req, res) => {
        res.writeHead(302, { location: destination });
        res.end("secret response");
      }),
    );
    const bridge = createBridge(async () => ({
      baseUrl: source,
      headers: { authorization: "Bearer private" },
    }));
    await expect(
      bridge("session", { sessionID: "ses_test", directory: "/project" }),
    ).rejects.toThrow("Cannot query Insight");
    expect(destinationCalls).toBe(0);
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
});
