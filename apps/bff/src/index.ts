import "./env.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { box } from "@clack/prompts";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import app from "./app";
import { logger } from "./logger";

process.title = "opencode-telescope-bff";

const homeDir = os.homedir();
const defaultOpenCodeDataDir = path.join(homeDir, ".local", "share", "opencode");

function parseCliArgs(args: string[]) {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "";
      result[key] = value;
    }
  }
  return result;
}

const cli = parseCliArgs(process.argv.slice(2));
const port = Number(cli.port ?? process.env.PORT ?? 8787);
const host = cli.host ?? process.env.HOST ?? "127.0.0.1";
const webDistDir = process.env.WEB_DIST_DIR;
const logDirDefault = path.join(process.cwd(), "logs");
const logDir = process.env.LOG_DIR ?? logDirDefault;
const openCodeDataDir = process.env.OPENCODE_DATA_DIR ?? defaultOpenCodeDataDir;

const envConfig = {
  PORT: { value: port, default: 8787, isDefault: !process.env.PORT },
  HOST: { value: host, default: "127.0.0.1", isDefault: !process.env.HOST },
  OPENCODE_DATA_DIR: {
    value: openCodeDataDir,
    default: defaultOpenCodeDataDir,
    isDefault: !process.env.OPENCODE_DATA_DIR,
  },
  LOG_DIR: { value: logDir, default: logDirDefault, isDefault: !process.env.LOG_DIR },
  WEB_DIST_DIR: {
    value: webDistDir ?? "(not set)",
    default: "(not set)",
    isDefault: !process.env.WEB_DIST_DIR,
  },
  NODE_ENV: {
    value: process.env.NODE_ENV ?? "development",
    default: "development",
    isDefault: !process.env.NODE_ENV,
  },
};

logger.info(
  {
    env: Object.fromEntries(
      Object.entries(envConfig).map(([key, cfg]) => [
        key,
        `${cfg.value}${cfg.isDefault ? " (default)" : ""}`,
      ]),
    ),
  },
  "Environment configuration",
);

if (webDistDir) {
  logger.info({ webDistDir }, "Serving static files from web dist");
  const resolvedWebDist = path.resolve(webDistDir);
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
    logger.info({ port: info.port, host, url, pid: process.pid }, "BFF server listening");
    if (process.stdout.isTTY) {
      const envLines = Object.entries(envConfig)
        .filter(([, cfg]) => cfg.isDefault)
        .map(([key, cfg]) => `${key.padEnd(18)}: ${cfg.value} (default)`);
      box(
        [
          `PID    : ${process.pid}`,
          `Port   : ${info.port}`,
          `Host   : ${host}`,
          `Access : ${url}`,
          `Data   : ${openCodeDataDir}${envConfig.OPENCODE_DATA_DIR.isDefault ? " (default)" : ""}`,
          `Logs   : ${logDir}${envConfig.LOG_DIR.isDefault ? " (default)" : ""}`,
          ...(webDistDir ? [`Web    : served from ${path.basename(webDistDir)}`] : []),
          ...(envLines.length > 0 ? ["", "Using defaults for:", ...envLines] : []),
        ].join("\n"),
        "opencode-telescope",
      );
    } else {
      console.log(`[opencode-telescope] BFF listening on ${url} (PID: ${process.pid})`);
    }
  },
);
