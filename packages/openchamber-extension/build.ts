import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

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
await copyFile("panel/trace.css", "dist/panel/trace.css");
await build({
  entryPoints: ["src/service/main.ts"],
  outfile: "dist/service/main.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  packages: "bundle",
});

// Folder installs do not install dependencies; OpenCode must load this bundle on its own.
await build({
  entryPoints: {
    server: "../opencode-plugin/src/index.ts",
    rpc: "../opencode-plugin/src/rpc.ts",
  },
  outdir: "dist/opencode",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
});
const metadata = JSON.parse(await readFile("../../package.json", "utf8"));
await writeFile(
  "dist/opencode/package.json",
  JSON.stringify({
    name: "@changehow/oc-insight-capture",
    version: metadata.version,
    type: "module",
    exports: { "./server": "./server.js", "./rpc": "./rpc.js" },
  }) + "\n",
);
