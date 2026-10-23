import { Hono } from "hono";
import { BridgeError, type InsightQueryMethod } from "@opencode-insight/client";
import type { ApiErrorPayload, SessionInsightPayload } from "@opencode-dashboard/shared";
import { readSessionInsight, readSessionInsightQuery } from "../services/insight";

export function createInsightController(
  read = readSessionInsight,
  query = readSessionInsightQuery,
) {
  const controller = new Hono();
  const routes: Record<string, InsightQueryMethod> = {
    overview: "overview",
    "speed-window": "speedWindow",
    "series-window": "seriesWindow",
    tools: "toolPage",
    sources: "sourcePage",
  };
  for (const [path, method] of Object.entries(routes)) {
    controller.get(`/api/session/:sessionId/insight/${path}`, async (c) => {
      try {
        return c.json(await query(method, c.req.param("sessionId"), c.req.query()));
      } catch (error) {
        if (
          error instanceof BridgeError &&
          (error.status === 400 ||
            error.status === 409 ||
            error.status === 502 ||
            error.status === 503)
        )
          return c.json<ApiErrorPayload>({ error: error.message }, error.status);
        return c.json<ApiErrorPayload>(
          { error: "Cannot query Insight on this OpenCode instance." },
          502,
        );
      }
    });
  }
  controller.get("/api/session/:sessionId/insight", async (c) => {
    try {
      return c.json<SessionInsightPayload>(
        await read(c.req.param("sessionId"), c.req.query("after")),
      );
    } catch (error) {
      if (
        error instanceof BridgeError &&
        (error.status === 400 ||
          error.status === 409 ||
          error.status === 502 ||
          error.status === 503)
      ) {
        return c.json<ApiErrorPayload>({ error: error.message }, error.status);
      }
      return c.json<ApiErrorPayload>(
        { error: "Cannot query Insight on this OpenCode instance." },
        502,
      );
    }
  });
  return controller;
}

export const insight = createInsightController();
