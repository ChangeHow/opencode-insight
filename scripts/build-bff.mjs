import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bffDir = path.join(ROOT, "apps", "bff");
const outDir = path.join(bffDir, "dist");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [path.join(bffDir, "src", "index.ts")],
  outfile: path.join(outDir, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  external: [
    "@clack/prompts",
    "@hono/node-server",
    "@hono/node-server/*",
    "dotenv",
    "hono",
    "hono/*",
    "pino",
    "pino-pretty",
    "pino-roll",
  ],
});

await copyFile(
  path.join(bffDir, "src", "fallback-pricing.json"),
  path.join(outDir, "fallback-pricing.json"),
);
