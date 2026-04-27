import type { UsageSyncPushPayload } from "@opencode-dashboard/shared";
import { readUsage, replaceUsageDays, type SyncEnv } from "./store";

function json(value: unknown, init?: ResponseInit) {
  return Response.json(value, {
    ...init,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      ...init?.headers,
    },
  });
}

function authorize(request: Request, env: SyncEnv) {
  const expected = env.SYNC_TOKEN?.trim();
  const header = request.headers.get("authorization") ?? "";
  return expected.length > 0 && header === `Bearer ${expected}`;
}

function isUsageSyncPayload(value: unknown): value is UsageSyncPushPayload {
  const payload = value as UsageSyncPushPayload;
  return (
    payload?.schemaVersion === 1 &&
    payload.mode === "replace-days" &&
    typeof payload.generatedAt === "string" &&
    typeof payload.machine?.id === "string" &&
    typeof payload.machine?.label === "string" &&
    Array.isArray(payload.days)
  );
}

async function handlePush(request: Request, env: SyncEnv) {
  const payload = (await request.json().catch(() => null)) as unknown;
  if (!isUsageSyncPayload(payload)) {
    return json({ error: "Invalid sync payload." }, { status: 400 });
  }

  return json(await replaceUsageDays(env.DB, payload));
}

export default {
  async fetch(request: Request, env: SyncEnv) {
    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (!authorize(request, env)) {
      return json({ error: "Unauthorized." }, { status: 401 });
    }

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/sync/push") {
      return handlePush(request, env);
    }
    if (request.method === "GET" && url.pathname === "/api/sync/usage") {
      return json(await readUsage(env.DB));
    }

    return json({ error: "Not found." }, { status: 404 });
  },
};
