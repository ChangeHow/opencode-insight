import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const children = new Set();
for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.once(signal, async () => {
    await Promise.all([...children].map(stop));
    process.exit(code);
  });
}

export async function freePort() {
  const probe = net.createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

export async function stop(child) {
  children.delete(child);
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const force = setTimeout(() => child.kill("SIGKILL"), 3000);
  await exited.finally(() => clearTimeout(force));
}

export function isolatedEnvironment(directory, password) {
  return {
    PATH: process.env.PATH,
    LANG: "en_US.UTF-8",
    HOME: path.join(directory, "home"),
    USERPROFILE: path.join(directory, "home"),
    OPENCODE_TEST_HOME: path.join(directory, "home"),
    TMPDIR: directory,
    XDG_CONFIG_HOME: path.join(directory, "config"),
    XDG_DATA_HOME: path.join(directory, "data"),
    XDG_STATE_HOME: path.join(directory, "state"),
    XDG_CACHE_HOME: path.join(directory, "cache"),
    OPENCODE_CONFIG_DIR: path.join(directory, "config/opencode"),
    OPENCODE_PASSWORD: password,
    OPENCODE_SERVER_PASSWORD: password,
    OPENCODE_SERVER_USERNAME: "opencode",
  };
}

export async function server(directory, plugins, providerURL, catalog) {
  const project = path.join(directory, "project");
  await mkdir(project, { recursive: true });
  const password = randomUUID();
  const config = { plugins, snapshots: false, compaction: { auto: false } };
  if (providerURL) {
    config.model = "memory-fixture/fixture";
    config.permissions = [{ action: "*", resource: "*", effect: "allow" }];
    config.providers = {
      "memory-fixture": {
        package: "@opencode/ai/providers/openai-compatible",
        settings: { baseURL: providerURL, apiKey: "local-fixture-only" },
        models: {
          fixture: {
            capabilities: { tools: true, input: ["text"], output: ["text"] },
            limit: { context: 2_000_000, output: 32768 },
          },
        },
      },
    };
  }
  await writeFile(path.join(project, "opencode.json"), JSON.stringify(config));
  const port = await freePort();
  const env = isolatedEnvironment(directory, password);
  if (catalog) {
    env.OPENCODE_MODELS_PATH = catalog.file;
    env.OPENCODE_DISABLE_MODELS_FETCH = "1";
  }
  await mkdir(env.HOME, { recursive: true });
  const child = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: project,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  let output = "";
  const capture = (chunk) => {
    output = (output + chunk).slice(-16384);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const base = `http://127.0.0.1:${port}`;
  const headers = {
    authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
    "content-type": "application/json",
  };
  const location = new URLSearchParams({ "location[directory]": project });
  async function request(route, body) {
    const response = await fetch(base + route, {
      headers,
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(120000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${route}: HTTP ${response.status} ${text.slice(0, 1000)}`);
    return text ? JSON.parse(text) : undefined;
  }
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw new Error("Isolated server exited before readiness");
      try {
        if ((await fetch(base + "/api/info", { headers, signal: AbortSignal.timeout(500) })).ok) {
          return {
            child,
            project,
            request,
            rpc: (id, method, input) =>
              request(`/api/rpc/${id}/${method}?${location}`, { input }).then(
                (value) => value.output,
              ),
            async observeEvents() {
              const controller = new AbortController();
              const response = await fetch(base + "/api/event", {
                headers,
                signal: controller.signal,
              });
              if (!response.ok || !response.body)
                throw new Error(`Event observer: HTTP ${response.status}`);
              const reader = response.body.getReader();
              let bytes = 0;
              let failure;
              const drained = (async () => {
                try {
                  while (true) {
                    const item = await reader.read();
                    if (item.done) {
                      if (!controller.signal.aborted)
                        failure = new Error("Event observer ended unexpectedly");
                      return;
                    }
                    bytes += item.value.byteLength;
                  }
                } catch (error) {
                  if (!controller.signal.aborted) failure = error;
                } finally {
                  reader.releaseLock();
                }
              })();
              return {
                get bytes() {
                  return bytes;
                },
                assertHealthy() {
                  if (failure) throw failure;
                },
                async close() {
                  controller.abort();
                  await drained;
                },
              };
            },
            rss: () =>
              Number(
                spawnSync("ps", ["-o", "rss=", "-p", String(child.pid)], {
                  encoding: "utf8",
                }).stdout.trim(),
              ) * 1024,
            memoryMap: () =>
              spawnSync("vmmap", ["-summary", String(child.pid)], {
                encoding: "utf8",
                timeout: 10000,
              }),
            async close() {
              await stop(child);
              await writeFile(
                path.join(directory, "server.log"),
                output.replaceAll(password, "[redacted]"),
              );
            },
          };
        }
      } catch {
        /* Readiness probes only target this new isolated process. */
      }
      await delay(100);
    }
    throw new Error("Isolated server readiness timed out");
  } catch (error) {
    await stop(child);
    await writeFile(path.join(directory, "server.log"), output.replaceAll(password, "[redacted]"));
    throw error;
  }
}
