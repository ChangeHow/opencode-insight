import http from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SessionInsight } from "@opencode-insight/telemetry/schema";
import {
  createBridge,
  createInsightReader,
  createInsightQueryReader,
  type InsightQueryMethod,
  type QueryMethod,
} from "./index";
import {
  buildOverview,
  buildSpeedWindow,
  buildToolPage,
} from "@opencode-insight/telemetry/queries";
import { buildSeriesWindow, buildSourcePage } from "@opencode-insight/telemetry/details";
import { loadConnection, validateEndpoint } from "./connection";

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

describe("Insight client", () => {
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

  test("resolves ID-only queries through the native session directory", async () => {
    const requests: string[] = [];
    const url = await listen(
      http.createServer(async (req, res) => {
        requests.push(req.url ?? "");
        expect(req.headers.authorization).toBe("Bearer upstream-private");
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/api/session/ses_test") {
          res.end(
            JSON.stringify({ data: { id: "ses_test", location: { directory: "/project" } } }),
          );
          return;
        }
        let body = "";
        for await (const chunk of req) body += chunk;
        expect(JSON.parse(body)).toEqual({ input: { sessionID: "ses_test" } });
        expect(decodeURIComponent(req.url ?? "")).toContain("/project");
        res.end(JSON.stringify({ output: snapshot }));
      }),
    );
    const read = createInsightReader(async () => ({
      baseUrl: url,
      headers: { authorization: "Bearer upstream-private" },
    }));
    expect(await read("ses_test")).toEqual(snapshot);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toBe("/api/session/ses_test");
    expect(requests[1]).toContain("/api/rpc/opencode-insight/session");
  });

  test.each([
    { ...snapshot, sessionID: "ses_other" },
    { ...snapshot, directory: "/other-project" },
  ])("rejects ID-only RPC snapshots outside the resolved scope: %j", async (output) => {
    const url = await listen(
      http.createServer((req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify(
            req.url === "/api/session/ses_test"
              ? { data: { id: "ses_test", location: { directory: "/project" } } }
              : { output },
          ),
        );
      }),
    );
    const read = createInsightReader(async () => ({ baseUrl: url, headers: {} }));
    await expect(read("ses_test")).rejects.toMatchObject({
      status: 409,
      message: "Insight returned a different session scope.",
    });
  });

  test("rejects invalid IDs and caller-supplied targets before connecting", async () => {
    let connections = 0;
    const read = createInsightReader(async () => {
      connections += 1;
      return { baseUrl: "http://127.0.0.1:4096", headers: {} };
    });
    for (const id of [
      "codex:session",
      "other",
      "ses_",
      `ses_${"x".repeat(125)}`,
      { sessionID: "ses_test", directory: "/attacker", url: "https://attacker.example" },
    ]) {
      await expect(read(id)).rejects.toMatchObject({ status: 400 });
    }
    expect(connections).toBe(0);
  });

  test.each([
    ["overview", { after: 1 }],
    ["speedWindow", { from: 0, to: 15000 }],
    ["toolPage", { group: "shell", limit: 2 }],
    ["seriesWindow", { from: 0, to: 15000 }],
    ["sourcePage", { scope: "cumulative", kind: "user", limit: 2 }],
  ] as const)(
    "resolves authority and forwards only validated %s input",
    async (method, options) => {
      const outputs = {
        overview: buildOverview(snapshot, 1000),
        speedWindow: buildSpeedWindow(snapshot, undefined, 1000),
        toolPage: buildToolPage(snapshot, { sessionID: "ses_test" }),
        seriesWindow: buildSeriesWindow(snapshot, undefined, 1000),
        sourcePage: buildSourcePage(snapshot, { sessionID: "ses_test" }),
      };
      const requests: string[] = [];
      const url = await listen(
        http.createServer(async (req, res) => {
          requests.push(req.url ?? "");
          expect(req.headers.authorization).toBe("Bearer host-only");
          res.setHeader("Content-Type", "application/json");
          if (req.url === "/api/session/ses_test") {
            res.end(
              JSON.stringify({ data: { id: "ses_test", location: { directory: "/project" } } }),
            );
            return;
          }
          let body = "";
          for await (const chunk of req) body += chunk;
          expect(JSON.parse(body)).toEqual({ input: { sessionID: "ses_test", ...options } });
          expect(decodeURIComponent(req.url ?? "")).toContain("/project");
          expect(req.url).toContain(`/api/rpc/opencode-insight/${method}`);
          res.end(JSON.stringify({ output: outputs[method] }));
        }),
      );
      const connect = async () => ({
        baseUrl: url,
        headers: { authorization: "Bearer host-only" },
      });
      const overrides = {
        url: "https://attacker.example",
        baseUrl: "https://attacker.example",
        auth: "private",
        headers: { authorization: "Bearer caller" },
        directory: "/attacker",
      };
      expect(
        await createInsightQueryReader(connect)(method, "ses_test", {
          ...options,
          ...overrides,
          sessionID: "ses_other",
        }),
      ).toEqual(outputs[method]);
      expect(
        await createBridge(connect)(method, {
          ...options,
          ...overrides,
          sessionID: "ses_test",
          directory: "/project",
        }),
      ).toEqual(outputs[method]);
      expect(requests).toHaveLength(4);
    },
  );

  test("rejects invalid purpose-specific queries and unknown methods before connecting", async () => {
    const connect = vi.fn(async () => ({ baseUrl: "http://127.0.0.1:4096", headers: {} }));
    const read = createInsightQueryReader(connect);
    const bridge = createBridge(connect);
    const invalid: [InsightQueryMethod, Record<string, unknown>][] = [
      ["overview", { after: -1 }],
      ["speedWindow", { from: 1 }],
      ["seriesWindow", { from: 0, to: 600001 }],
      ["toolPage", { toolID: "t1", group: "shell" }],
      ["sourcePage", { scope: "foreign" }],
      ["sourcePage", { limit: 101 }],
    ];
    for (const [method, options] of invalid) {
      await expect(read(method, "ses_test", options)).rejects.toMatchObject({ status: 400 });
      await expect(
        bridge(method, { sessionID: "ses_test", directory: "/project", ...options }),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(read("overview", "codex:session")).rejects.toMatchObject({ status: 400 });
    await expect(read("toString" as InsightQueryMethod, "ses_test")).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      bridge("toString" as QueryMethod, { sessionID: "ses_test", directory: "/project" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(connect).not.toHaveBeenCalled();
  });

  test("rejects compact results outside native scope and sanitizes invalid returned locations", async () => {
    let directory: unknown = "/project";
    let output: unknown = {
      sessionID: "ses_other",
      directory: "/project",
      revision: 1,
      unchanged: true,
    };
    let rpcCalls = 0;
    const url = await listen(
      http.createServer((req, res) => {
        res.setHeader("Content-Type", "application/json");
        if (req.url === "/api/session/ses_test") {
          res.end(JSON.stringify({ data: { id: "ses_test", location: { directory } } }));
        } else {
          rpcCalls++;
          res.end(JSON.stringify({ output }));
        }
      }),
    );
    const read = createInsightQueryReader(async () => ({ baseUrl: url, headers: {} }));
    await expect(read("overview", "ses_test")).rejects.toMatchObject({ status: 409 });
    output = { sessionID: "ses_test", directory: "/attacker", revision: 1, unchanged: true };
    await expect(read("overview", "ses_test")).rejects.toMatchObject({ status: 409 });
    output = { private: "upstream-secret" };
    await expect(read("overview", "ses_test")).rejects.toMatchObject({
      status: 502,
      message:
        "Cannot query Insight on this OpenCode instance. Check the plugin, session, and connection.",
    });
    directory = "";
    await expect(read("overview", "ses_test")).rejects.toMatchObject({ status: 502 });
    expect(rpcCalls).toBe(3);
  });

  test("sanitizes unexpected discovery errors for all shared entrypoints", async () => {
    const connect = async () => {
      throw new Error("private discovery credentials");
    };
    await expect(createInsightQueryReader(connect)("overview", "ses_test")).rejects.toMatchObject({
      status: 502,
      message:
        "Cannot query Insight on this OpenCode instance. Check the plugin, session, and connection.",
    });
    await expect(createInsightReader(connect)("ses_test")).rejects.toMatchObject({
      status: 502,
      message:
        "Cannot query Insight on this OpenCode instance. Check the plugin, session, and connection.",
    });
    await expect(
      createBridge(connect)("session", { sessionID: "ses_test", directory: "/project" }),
    ).rejects.toMatchObject({ status: 502 });
  });
});
