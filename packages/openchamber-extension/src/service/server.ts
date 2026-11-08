import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import { BridgeError, createHostBridge, type QueryMethod } from "@opencode-insight/client";
import { loadHostConnection } from "./connection";

const BODY_LIMIT = 16384;
const OUTPUT_LIMIT = 7_000_000;
const operations = new Map<string, QueryMethod>([
  ["/session", "session"],
  ["/series", "series"],
  ["/overview", "overview"],
  ["/speed-window", "speedWindow"],
  ["/speed-scope", "speedScope"],
  ["/tool-page", "toolPage"],
  ["/series-window", "seriesWindow"],
  ["/source-page", "sourcePage"],
]);

function authorized(actual: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`);
  const supplied = Buffer.from(actual ?? "");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new BridgeError(413, "Request is too large.");
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BridgeError(400, "Request body must be JSON.");
  }
}

export function createInsightServer(
  token: string,
  query?: (method: QueryMethod, body: unknown) => Promise<unknown>,
): http.Server {
  if (!token) throw new Error("An extension service token is required.");
  const host = query ? undefined : createHostBridge(loadHostConnection);
  const read = query ?? host!.query;
  const server = http.createServer(async (req, res) => {
    const respond = (status: number, value: unknown) => {
      const body = JSON.stringify(value);
      if (Buffer.byteLength(body) > OUTPUT_LIMIT) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: "Insight response is too large. Narrow the captured session." }),
        );
        return;
      }
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(body);
    };
    if (!authorized(req.headers.authorization, token)) {
      respond(401, { error: "Unauthorized." });
      return;
    }
    const path = req.url?.split("?")[0];
    if (req.method === "GET" && path === "/health") {
      respond(200, { ok: true });
      return;
    }
    const operation = operations.get(path ?? "");
    if (req.method !== "POST" || !operation) {
      respond(404, { error: "Unknown Insight operation." });
      return;
    }
    try {
      respond(200, await read(operation, await readBody(req)));
    } catch (error) {
      if (error instanceof BridgeError) respond(error.status, { error: error.message });
      else respond(500, { error: "Insight bridge failed." });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.once("close", () => host?.close());
  return server;
}
