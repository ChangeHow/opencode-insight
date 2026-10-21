import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/panel", { recursive: true });
await mkdir("dist/service", { recursive: true });
await build({
  entryPoints: ["src/panel/main.ts"],
  outfile: "dist/panel/main.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2023",
});
await copyFile("panel/index.html", "dist/panel/index.html");
await build({
  entryPoints: ["src/service/main.ts"],
  outfile: "dist/service/main.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  packages: "bundle",
});
