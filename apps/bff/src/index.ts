import "./env.js";
import fs from "node:fs";
import path from "node:path";
import { box } from "@clack/prompts";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import app from "./app.js";

process.title = "opencode-telescope-bff";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const webDistDir = process.env.WEB_DIST_DIR;

if (webDistDir) {
  const resolvedWebDist = path.resolve(webDistDir);
  // Pass the absolute path so serveStatic works regardless of cwd
  app.use("/*", serveStatic({ root: resolvedWebDist }));
  app.get("/*", (c) => {
    const indexPath = path.join(resolvedWebDist, "index.html");
    if (fs.existsSync(indexPath)) {
      return new Response(fs.readFileSync(indexPath), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return c.notFound();
  });
}

serve(
  {
    fetch: app.fetch,
    port,
    hostname: host,
  },
  (info) => {
    const displayHost = host === "0.0.0.0" ? "localhost" : host;
    const url = `http://${displayHost}:${info.port}`;
    if (process.stdout.isTTY) {
      box(
        [
          `PID    : ${process.pid}`,
          `Port   : ${info.port}`,
          `Host   : ${host}`,
          `Access : ${url}`,
          ...(webDistDir ? [`Web    : served from ${path.basename(webDistDir)}`] : []),
        ].join("\n"),
        "opencode-telescope",
      );
    } else {
      console.log(`[opencode-telescope] BFF listening on ${url} (PID: ${process.pid})`);
    }
  },
);
