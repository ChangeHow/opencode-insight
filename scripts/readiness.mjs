import { createServer } from "node:net";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_INTERVAL_MS = 250;

export function getReadinessUrl(host, port) {
  const requestHost = host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
  return `http://${formatHttpHost(requestHost)}:${port}/api/ready`;
}

export function formatHttpHost(host) {
  return host.includes(":") ? `[${host}]` : host;
}

export function isPortAvailable(host, port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host, port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function waitForReadiness({
  url,
  isAlive,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = DEFAULT_INTERVAL_MS,
  fetchImpl = fetch,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    if (!isAlive()) return { ready: false, reason: "exited" };

    try {
      const remainingMs = deadline - now();
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(Math.max(1, Math.min(1_000, remainingMs))),
      });
      if (response.status === 200 && (await response.json()).ready === true) {
        return { ready: true };
      }
    } catch {
      // The server may not be listening yet.
    }

    if (!isAlive()) return { ready: false, reason: "exited" };
    const delayMs = Math.min(intervalMs, deadline - now());
    if (delayMs <= 0) break;
    await sleep(delayMs);
  }

  return { ready: false, reason: isAlive() ? "timeout" : "exited" };
}

export async function terminateProcess({
  isAlive,
  terminate,
  forceTerminate,
  timeoutMs = 2_000,
  intervalMs = 100,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!isAlive()) return true;

  try {
    terminate();
  } catch {
    return !isAlive();
  }
  const deadline = now() + timeoutMs;
  while (isAlive() && now() < deadline) {
    await sleep(Math.min(intervalMs, deadline - now()));
  }
  if (isAlive()) {
    try {
      forceTerminate();
    } catch {
      return !isAlive();
    }
  }
  const forceDeadline = now() + timeoutMs;
  while (isAlive() && now() < forceDeadline) {
    await sleep(Math.min(intervalMs, forceDeadline - now()));
  }
  return !isAlive();
}
