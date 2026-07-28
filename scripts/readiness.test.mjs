import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import {
  formatHttpHost,
  getReadinessUrl,
  isPortAvailable,
  terminateProcess,
  waitForReadiness,
} from "./readiness.mjs";

test("maps wildcard hosts to the loopback readiness endpoint", () => {
  assert.equal(getReadinessUrl("0.0.0.0", 8787), "http://127.0.0.1:8787/api/ready");
  assert.equal(getReadinessUrl("::", 8787), "http://[::1]:8787/api/ready");
  assert.equal(getReadinessUrl("::1", 8787), "http://[::1]:8787/api/ready");
  assert.equal(formatHttpHost("::1"), "[::1]");
});

test("detects whether the configured port is available", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.equal(await isPortAvailable("127.0.0.1", address.port), false);
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  assert.equal(await isPortAvailable("127.0.0.1", address.port), true);
});

test("retries until the daemon reports ready", async () => {
  let now = 0;
  let attempts = 0;
  const result = await waitForReadiness({
    url: "http://127.0.0.1:8787/api/ready",
    isAlive: () => true,
    timeoutMs: 1_000,
    intervalMs: 100,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    fetchImpl: async () => {
      attempts += 1;
      return {
        status: attempts === 2 ? 200 : 503,
        json: async () => ({ ready: attempts === 2 }),
      };
    },
  });

  assert.deepEqual(result, { ready: true });
  assert.equal(attempts, 2);
});

test("stops polling when the daemon exits", async () => {
  const result = await waitForReadiness({
    url: "http://127.0.0.1:8787/api/ready",
    isAlive: () => false,
  });

  assert.deepEqual(result, { ready: false, reason: "exited" });
});

test("reports a timeout when the daemon stays unavailable", async () => {
  let now = 0;
  const result = await waitForReadiness({
    url: "http://127.0.0.1:8787/api/ready",
    isAlive: () => true,
    timeoutMs: 200,
    intervalMs: 100,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    fetchImpl: async () => ({
      status: 503,
      json: async () => ({ ready: false }),
    }),
  });

  assert.deepEqual(result, { ready: false, reason: "timeout" });
});

test("forces termination when graceful shutdown times out", async () => {
  let alive = true;
  let now = 0;
  const signals = [];
  const stopped = await terminateProcess({
    isAlive: () => alive,
    terminate: () => signals.push("terminate"),
    forceTerminate: () => {
      signals.push("force");
      alive = false;
    },
    timeoutMs: 200,
    intervalMs: 100,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });

  assert.equal(stopped, true);
  assert.deepEqual(signals, ["terminate", "force"]);
});
