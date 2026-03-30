import type { Context, MiddlewareHandler } from "hono";
import { logger as baseLogger } from "../logger";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function buildRequestContext(c: Context) {
  const url = new URL(c.req.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const forwardedFor = c.req.header("x-forwarded-for");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-client-ip");

  return omitUndefined({
    url: url.pathname + url.search,
    query: Object.keys(query).length > 0 ? query : undefined,
    requestId: c.req.header("x-request-id") ?? c.req.header("x-correlation-id"),
    ip,
    userAgent: c.req.header("user-agent"),
    referer: c.req.header("referer"),
    requestContentLength: c.req.header("content-length"),
  });
}

export function requestLogger(): MiddlewareHandler {
  return async (c: Context, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    const requestContext = buildRequestContext(c);

    baseLogger.info(
      { method, path, type: "request", ...requestContext },
      `<-- ${method} ${requestContext.url ?? path}`,
    );

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    const responseContentLength = c.res.headers.get("content-length") ?? undefined;

    baseLogger[level](
      {
        method,
        path,
        status,
        duration,
        type: "response",
        responseContentLength,
        ...requestContext,
      },
      `--> ${method} ${requestContext.url ?? path} ${status} ${formatDuration(duration)}`,
    );
  };
}

export { baseLogger as logger };
