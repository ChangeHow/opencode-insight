import { Hono } from "hono";
import type { MessageAnalyticsPayload } from "@opencode-dashboard/shared";
import { buildMessagePayloads, getDbPath } from "../services/messages";

const messages = new Hono();

messages.get("/api/day/:date/session/:sessionId/message/analytics", (c) => {
  const { sessionId } = c.req.param();
  const { overview, distribution } = buildMessagePayloads(getDbPath(), sessionId);
  return c.json<MessageAnalyticsPayload>({ overview, distribution });
});

messages.get("/api/day/:date/session/:sessionId/message/overview", (c) => {
  const { sessionId } = c.req.param();
  const { overview } = buildMessagePayloads(getDbPath(), sessionId);
  return c.json(overview);
});

messages.get("/api/day/:date/session/:sessionId/message/distribution", (c) => {
  const { sessionId } = c.req.param();
  const { distribution } = buildMessagePayloads(getDbPath(), sessionId);
  return c.json(distribution);
});

messages.get("/api/day/:date/session/:sessionId/message", (c) => {
  const { sessionId } = c.req.param();
  const page = Math.max(0, Number(c.req.query("page") ?? 0));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 50)));
  const { listFn } = buildMessagePayloads(getDbPath(), sessionId);
  return c.json(listFn(page, pageSize));
});

export { messages };
