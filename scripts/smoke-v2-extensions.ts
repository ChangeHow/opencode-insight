import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temporary = await mkdtemp(path.join(tmpdir(), "insight-v2-smoke-"));
const password = randomUUID();
const auth = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
let child: ChildProcess | undefined;
let bridge: ChildProcess | undefined;
let dashboard: ChildProcess | undefined;
let childOutput = "";
let stopHost: (() => Promise<void>) | undefined;
let withdrawHost: (() => void) | undefined;

async function freePort() {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("Missing isolated listener.");
  const port = address.port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

async function stop(process: ChildProcess | undefined) {
  if (!process || process.exitCode !== null || process.signalCode !== null) return;
  const exited = once(process, "exit");
  process.kill("SIGTERM");
  const force = setTimeout(() => process.kill("SIGKILL"), 3000);
  await exited.finally(() => clearTimeout(force));
}

async function waitFor(url: string, headers: HeadersInit, process: ChildProcess) {
  let status: number | undefined;
  let failure: string | undefined;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (process.exitCode !== null || process.signalCode !== null)
      throw new Error("Isolated service exited before readiness.");
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(500) });
      status = response.status;
      failure = undefined;
      if (response.ok) return;
    } catch (error) {
      failure = error instanceof Error ? error.name : "Unknown transport error";
      // Only the isolated child is being probed; no managed service is started or restarted.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Isolated service readiness timed out (HTTP ${status ?? "unavailable"}, ${failure ?? "no transport error"}). ${childOutput.replaceAll(password, "[redacted]").slice(-1500)}`,
  );
}

try {
  await readFile(path.join(root, "server.js"));
  await readFile(path.join(root, "openchamber/service/main.js"));
  await readFile(path.join(root, "apps/bff/dist/index.js"));
  const project = path.join(temporary, "project");
  await mkdir(project);
  const captureDirectory = path.join(temporary, "capture");
  await cp(path.join(root, "openchamber/opencode"), captureDirectory, { recursive: true });
  await writeFile(
    path.join(project, "opencode.json"),
    JSON.stringify({
      plugins: [captureDirectory],
      snapshots: false,
    }),
  );
  const port = await freePort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(temporary, "config"),
    XDG_DATA_HOME: path.join(temporary, "data"),
    XDG_STATE_HOME: path.join(temporary, "state"),
    XDG_CACHE_HOME: path.join(temporary, "cache"),
    OPENCODE_SERVER_USERNAME: "opencode",
    OPENCODE_PASSWORD: password,
    OPENCODE_SERVER_PASSWORD: password,
  };
  // Discard inherited inline/project overrides so this test cannot load the user's plugins.
  for (const key of [
    "OPENCODE_CONFIG",
    "OPENCODE_CONFIG_DIR",
    "OPENCODE_CONFIG_CONTENT",
    "OPENCODE_CLIENT_CONFIG_CONTENT",
  ])
    delete env[key];
  child = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: project,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const capture = (chunk: Buffer) => {
    childOutput = (childOutput + chunk.toString()).slice(-4096);
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  child.on("error", () => {});
  const base = `http://127.0.0.1:${port}`;
  const headers = { authorization: auth, "content-type": "application/json" };
  await waitFor(`${base}/api/info`, headers, child);
  const query = new URLSearchParams({ "location[directory]": project });
  const createdResponse = await fetch(`${base}/api/session`, {
    method: "POST",
    headers,
    body: JSON.stringify({ location: { directory: project }, title: "Insight isolated smoke" }),
  });
  if (!createdResponse.ok) throw new Error(`Session creation returned ${createdResponse.status}.`);
  const { data: session } = await createdResponse.json();
  const rpcResponse = await fetch(`${base}/api/rpc/opencode-insight/session?${query}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input: { sessionID: session.id } }),
  });
  if (!rpcResponse.ok)
    throw new Error(
      `Insight RPC returned ${rpcResponse.status}: ${(await rpcResponse.text()).slice(0, 1000)}; ${childOutput.replaceAll(password, "[redacted]").slice(-1500)}`,
    );
  const { output } = await rpcResponse.json();
  if (output.sessionID !== session.id || output.directory !== project)
    throw new Error("RPC session scope did not match.");

  const connectionHome = path.join(temporary, "bridge-home");
  await mkdir(path.join(connectionHome, ".config/opencode-insight"), { recursive: true });
  await writeFile(
    path.join(connectionHome, ".config/opencode-insight/connection.json"),
    JSON.stringify({
      url: base,
      auth: { type: "basic", username: "opencode", password },
    }),
    { mode: 0o600 },
  );
  const bridgePort = await freePort();
  const bridgeToken = randomUUID();
  let hostEnvironment: NodeJS.ProcessEnv;
  const hostSource = process.env.OPENCHAMBER_SOURCE_DIR;
  if (hostSource) {
    const { createGuestOpenCodeProvider } = await import(
      pathToFileURL(
        path.resolve(hostSource, "packages/web/server/lib/guests/opencode-provider/index.js"),
      ).href
    );
    const { parseManifest } = await import(
      pathToFileURL(path.resolve(hostSource, "packages/sdk/dist/schemas.js")).href
    );
    const { requestedGuestCapabilities } = await import(
      pathToFileURL(path.resolve(hostSource, "packages/sdk/dist/index.js")).href
    );
    const parsed = parseManifest(
      JSON.parse(await readFile(path.join(root, "openchamber/package.json"), "utf8")),
    );
    if (!parsed.ok) throw new Error("The stock OpenChamber SDK rejected the extension manifest.");
    const guest = {
      ...parsed.manifest.contributes,
      enabled: true,
      capabilityGrants: requestedGuestCapabilities(parsed.manifest.contributes),
    };
    const provider = createGuestOpenCodeProvider({
      currentGuest: async () => guest,
      buildOpenCodeUrl: (route: string) => `${base}${route}`,
      getOpenCodeAuthHeaders: () => ({ authorization: auth }),
    });
    hostEnvironment = await provider.environmentFor({
      guestId: "opencode-insight",
      token: bridgeToken,
    });
    stopHost = () => provider.stop();
    withdrawHost = () => provider.revokeGuest("opencode-insight");
  } else {
    // CI can exercise the published read-only contract without checking out OpenChamber.
    let granted = true;
    const host = http.createServer((request, response) => {
      if (!granted || request.headers.authorization !== `Bearer ${bridgeToken}`) {
        response.writeHead(403).end();
        return;
      }
      if (
        request.method !== "GET" ||
        !(
          request.url === "/api/event" ||
          /^\/api\/session\/ses_[A-Za-z0-9]+$/.test(request.url ?? "")
        )
      ) {
        response.writeHead(403).end();
        return;
      }
      const upstream = http.get(
        `${base}${request.url}`,
        { headers: { authorization: auth } },
        (incoming) => {
          response.writeHead(incoming.statusCode ?? 502, {
            "content-type": incoming.headers["content-type"] ?? "application/json",
          });
          incoming.pipe(response);
        },
      );
      upstream.on("error", () => response.destroy());
      response.once("close", () => upstream.destroy());
    });
    host.listen(0, "127.0.0.1");
    await once(host, "listening");
    const address = host.address();
    if (!address || typeof address === "string") throw new Error("Missing host fixture listener.");
    hostEnvironment = { OPENCHAMBER_OPENCODE_URL: `http://127.0.0.1:${address.port}` };
    stopHost = () =>
      new Promise<void>((resolve) => {
        host.close(() => resolve());
        host.closeAllConnections();
      });
    withdrawHost = () => {
      granted = false;
      host.closeAllConnections();
    };
  }
  const forbidden = await fetch(
    `${hostEnvironment.OPENCHAMBER_OPENCODE_URL}/api/rpc/opencode-insight/session`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${bridgeToken}` },
      body: "{}",
    },
  );
  if (forbidden.status !== 403)
    throw new Error("The host must continue refusing native plugin RPC.");
  bridge = spawn(process.execPath, [path.join(root, "openchamber/service/main.js")], {
    cwd: temporary,
    env: {
      ...env,
      ...hostEnvironment,
      HOME: path.join(temporary, "panel-home"),
      USERPROFILE: path.join(temporary, "panel-home"),
      OPENCHAMBER_SERVICE_PORT: String(bridgePort),
      OPENCHAMBER_SERVICE_TOKEN: bridgeToken,
    },
    stdio: "ignore",
  });
  bridge.on("error", () => {});
  const bridgeBase = `http://127.0.0.1:${bridgePort}`;
  const bridgeHeaders = {
    authorization: `Bearer ${bridgeToken}`,
    "content-type": "application/json",
  };
  await waitFor(`${bridgeBase}/health`, bridgeHeaders, bridge);
  const response = await fetch(`${bridgeBase}/session`, {
    method: "POST",
    headers: bridgeHeaders,
    body: JSON.stringify({ sessionID: session.id, directory: project }),
  });
  if (!response.ok) throw new Error(`Built bridge returned ${response.status}.`);
  const bridged = await response.json();
  if (bridged.sessionID !== session.id) throw new Error("Built bridge returned another session.");
  if (JSON.stringify(bridged) !== JSON.stringify(output))
    throw new Error("The host bridge disagreed with the native capture source.");
  for (const route of [
    "series",
    "overview",
    "speed-window",
    "speed-scope",
    "tool-page",
    "series-window",
    "source-page",
  ]) {
    const response = await fetch(`${bridgeBase}/${route}`, {
      method: "POST",
      headers: bridgeHeaders,
      body: JSON.stringify({ sessionID: session.id, directory: project }),
    });
    if (!response.ok) throw new Error(`Built bridge ${route} returned ${response.status}.`);
    const value = await response.json();
    if (route !== "series" && (value.sessionID !== session.id || value.directory !== project))
      throw new Error(`Built bridge ${route} returned a different scope.`);
  }
  withdrawHost();
  const withdrawn = await fetch(`${bridgeBase}/overview`, {
    method: "POST",
    headers: bridgeHeaders,
    body: JSON.stringify({ sessionID: session.id, directory: project }),
  });
  if (withdrawn.status !== 502)
    throw new Error("Withdrawing host access must stop local telemetry queries.");
  const dashboardPort = await freePort();
  dashboard = spawn(process.execPath, [path.join(root, "apps/bff/dist/index.js")], {
    cwd: temporary,
    env: {
      ...env,
      HOME: connectionHome,
      USERPROFILE: connectionHome,
      OPENDASH_ENV: "",
      OPENCODE_DATA_DIR: path.join(temporary, "dashboard-data"),
      CODEX_HOME: path.join(temporary, "codex"),
      LOG_DIR: path.join(temporary, "dashboard-logs"),
      WEB_DIST_DIR: path.join(root, "apps/web/dist"),
      HOST: "127.0.0.1",
      PORT: String(dashboardPort),
    },
    stdio: "ignore",
  });
  dashboard.on("error", () => {});
  const dashboardBase = `http://127.0.0.1:${dashboardPort}`;
  await waitFor(`${dashboardBase}/`, {}, dashboard);
  const insightResponse = await fetch(`${dashboardBase}/api/session/${session.id}/insight`);
  if (!insightResponse.ok) throw new Error(`Dashboard Insight returned ${insightResponse.status}.`);
  const insight = await insightResponse.json();
  if (insight.session.sessionID !== session.id || insight.session.directory !== project)
    throw new Error("Dashboard Insight returned a different session scope.");
  if (JSON.stringify(insight).includes(password))
    throw new Error("Dashboard exposed upstream authentication.");
  for (const route of ["overview", "speed-window", "series-window", "tools", "sources"]) {
    const response = await fetch(`${dashboardBase}/api/session/${session.id}/insight/${route}`);
    if (!response.ok) throw new Error(`Dashboard ${route} returned ${response.status}.`);
    const value = await response.json();
    if (value.sessionID !== session.id || value.directory !== project)
      throw new Error(`Dashboard ${route} returned a different scope.`);
    if (JSON.stringify(value).includes(password))
      throw new Error("Dashboard exposed authentication.");
  }
  const unchanged = await fetch(
    `${dashboardBase}/api/session/${session.id}/insight?after=${insight.session.revision}`,
  );
  if (!unchanged.ok || !(await unchanged.json()).series.unchanged)
    throw new Error("Dashboard revision cursor was not preserved.");
  const legacy = await fetch(`${dashboardBase}/api/session/${session.id}`);
  if (legacy.status !== 404)
    throw new Error("Isolated V2 session unexpectedly entered the legacy usage ledger.");
  console.log(
    `V2 plugin loaded; all 8 panel queries passed through ${hostSource ? "the stock OpenChamber provider" : "a read-only host contract fixture"} while native RPC remained forbidden. Withdrawal and dashboard Insight passed. No model requests were sent.`,
  );
} finally {
  await stop(dashboard);
  await stop(bridge);
  await stopHost?.();
  await stop(child);
  await rm(temporary, { recursive: true, force: true });
}
