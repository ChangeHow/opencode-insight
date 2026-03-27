import type { Context, MiddlewareHandler } from "hono";
import { logger as baseLogger } from "../logger.js";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

export function requestLogger(): MiddlewareHandler {
  return async (c: Context, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;

    baseLogger.info({ method, path, type: "request" }, `<-- ${method} ${path}`);

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

    baseLogger[level](
      {
        method,
        path,
        status,
        duration,
        type: "response",
      },
      `--> ${method} ${path} ${status} ${formatDuration(duration)}`,
    );
  };
}

export { baseLogger as logger };
