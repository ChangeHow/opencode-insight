import { Hono } from "hono";
import type { ApiErrorPayload } from "@opencode-dashboard/shared";
import { readData } from "./shared";

const day = new Hono();

day.get("/api/day/:date", async (c) => {
  const item = (await readData(c)).byDate.get(c.req.param("date"));
  if (!item) {
    return c.json<ApiErrorPayload>({ error: "No usage found for that date." }, 404);
  }
  return c.json(item);
});

day.get("/api/day/:date/session/:sessionId", async (c) => {
  const data = await readData(c);
  const dayBreakdown = data.byDate.get(c.req.param("date"));
  if (!dayBreakdown) {
    return c.json<ApiErrorPayload>({ error: "No usage found for that date." }, 404);
  }

  const session = dayBreakdown.sessions.find((item) => item.sessionId === c.req.param("sessionId"));
  if (!session) {
    return c.json<ApiErrorPayload>({ error: "No session found for that date." }, 404);
  }

  return c.json(session);
});

export { day };
