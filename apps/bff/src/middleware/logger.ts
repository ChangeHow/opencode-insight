import type { Context, MiddlewareHandler } from "hono";
import { logger as baseLogger } from "../logger";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

interface RequestContext {
  url: string;
  query?: Record<string, string>;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  referer?: string;
  requestContentLength?: string;
}

function buildRequestContext(c: Context): RequestContext {
  const url = new URL(c.req.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const forwardedFor = c.req.header("x-forwarded-for");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-client-ip");

  const requestContext: RequestContext = {
    url: url.pathname + url.search,
  };

  if (Object.keys(query).length > 0) {
    requestContext.query = query;
  }

  const requestId = c.req.header("x-request-id") ?? c.req.header("x-correlation-id");
  if (requestId) {
    requestContext.requestId = requestId;
  }
  if (ip) {
    requestContext.ip = ip;
  }

  const userAgent = c.req.header("user-agent");
  if (userAgent) {
    requestContext.userAgent = userAgent;
  }

  const referer = c.req.header("referer");
  if (referer) {
    requestContext.referer = referer;
  }

  const requestContentLength = c.req.header("content-length");
  if (requestContentLength) {
    requestContext.requestContentLength = requestContentLength;
  }

  return requestContext;
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
    const responseContentLengthHeader = c.res.headers.get("content-length");
    const responseContentLength =
      responseContentLengthHeader === null ? undefined : responseContentLengthHeader;

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
