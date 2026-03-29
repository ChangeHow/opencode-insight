import { Hono } from "hono";
import type { MessageAnalyticsPayload } from "@opencode-dashboard/shared";
import { buildMessagePayloads, getDbPath } from "../services/messages";

const messages = new Hono();

messages.get("/api/day/:date/session/:sessionId/message/analytics", async (c) => {
  const { sessionId } = c.req.param();
  const { overview, distribution } = await buildMessagePayloads(getDbPath(), sessionId);
  return c.json<MessageAnalyticsPayload>({ overview, distribution });
});

messages.get("/api/day/:date/session/:sessionId/message/overview", async (c) => {
  const { sessionId } = c.req.param();
  const { overview } = await buildMessagePayloads(getDbPath(), sessionId);
  return c.json(overview);
});

messages.get("/api/day/:date/session/:sessionId/message/distribution", async (c) => {
  const { sessionId } = c.req.param();
  const { distribution } = await buildMessagePayloads(getDbPath(), sessionId);
  return c.json(distribution);
});

messages.get("/api/day/:date/session/:sessionId/message", async (c) => {
  const { sessionId } = c.req.param();
  const page = Math.max(0, Number(c.req.query("page") ?? 0));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 50)));
  const { listFn } = await buildMessagePayloads(getDbPath(), sessionId);
  return c.json(listFn(page, pageSize));
});

export { messages };
