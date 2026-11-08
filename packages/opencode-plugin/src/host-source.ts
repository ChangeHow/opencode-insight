import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { z } from "zod";
import { hostQuerySchema, type HostSource } from "@opencode-insight/telemetry/host";
import { Insight } from "./rpc";
import type { createQueries } from "./queries";

const MAX_BODY = 16 * 1024;
const MAX_RESPONSE = 7_000_000;
const DEADLINE = 8_000;
type Queries = ReturnType<typeof createQueries>["queries"];

async function run<I>(
  input: unknown,
  schema: z.ZodType<I>,
  output: z.ZodType,
  handler: (value: I) => Promise<unknown>,
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid input");
  return output.parse(await handler(parsed.data));
}

function query(
  queries: Queries,
  method: z.infer<typeof hostQuerySchema>["method"],
  input: unknown,
) {
  switch (method) {
    case "session":
      return run(
        input,
        Insight.methods.session.input,
        Insight.methods.session.output,
        queries.session,
      );
    case "series":
      return run(
        input,
        Insight.methods.series.input,
        Insight.methods.series.output,
        queries.series,
      );
    case "overview":
      return run(
        input,
        Insight.methods.overview.input,
        Insight.methods.overview.output,
        queries.overview,
      );
    case "speedWindow":
      return run(
        input,
        Insight.methods.speedWindow.input,
        Insight.methods.speedWindow.output,
        queries.speedWindow,
      );
    case "speedScope":
      return run(
        input,
        Insight.methods.speedScope.input,
        Insight.methods.speedScope.output,
        queries.speedScope,
      );
    case "toolPage":
      return run(
        input,
        Insight.methods.toolPage.input,
        Insight.methods.toolPage.output,
        queries.toolPage,
      );
    case "seriesWindow":
      return run(
        input,
        Insight.methods.seriesWindow.input,
        Insight.methods.seriesWindow.output,
        queries.seriesWindow,
      );
    case "sourcePage":
      return run(
        input,
        Insight.methods.sourcePage.input,
        Insight.methods.sourcePage.output,
        queries.sourcePage,
      );
  }
}

export async function startHostSource(
  queries: Queries,
  getScope: () => string,
  emit: (name: "hostSource", source: HostSource) => Promise<void>,
) {
  const token = randomBytes(32).toString("base64url");
  let port = 0;
  let closed = false;
  const announce = (nonce?: string) =>
    emit("hostSource", { version: 1, scope: getScope(), port, token, ...(nonce ? { nonce } : {}) });
  const server = createServer((req, res) => {
    res.on("error", () => {});
    req.on("error", () => {});
    const deadline = setTimeout(() => {
      res.destroy();
    }, DEADLINE);
    res.once("close", () => clearTimeout(deadline));
    const reject = (status: number) => {
      if (!res.destroyed) res.writeHead(status).end();
    };
    const expected = Buffer.from(`Bearer ${token}`);
    const supplied = Buffer.from(req.headers.authorization ?? "");
    if (
      req.headers.origin !== undefined ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return reject(403);
    if (req.method !== "POST" || req.url !== "/query") return reject(404);
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(413);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      void (async () => {
        try {
          const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const parsed = hostQuerySchema.safeParse(body);
          if (!parsed.success) return reject(400);
          const scope = getScope();
          const output = await query(queries, parsed.data.method, parsed.data.input);
          if (closed || res.destroyed || scope !== getScope()) return reject(503);
          const result = JSON.stringify({ output, scope });
          if (Buffer.byteLength(result) > MAX_RESPONSE) return reject(413);
          await announce(parsed.data.nonce);
          if (closed || res.destroyed || scope !== getScope()) return reject(503);
          res.writeHead(200, { "content-type": "application/json" }).end(result);
        } catch {
          reject(400);
        }
      })();
    });
  });
  server.on("error", () => {});
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Host source listener unavailable");
  }
  port = address.port;
  const heartbeat = setInterval(() => {
    void announce().catch(() => {});
  }, 1_000);
  void announce().catch(() => {});
  return {
    async close() {
      closed = true;
      clearInterval(heartbeat);
      const stopped = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      await stopped;
    },
  };
}
