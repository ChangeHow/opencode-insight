import { Hono } from "hono";
import { BridgeError } from "@opencode-insight/client";
import type { ApiErrorPayload, SessionInsightPayload } from "@opencode-dashboard/shared";
import { readSessionInsight } from "../services/insight";

export function createInsightController(read = readSessionInsight) {
  const controller = new Hono();
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
