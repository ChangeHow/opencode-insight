import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts", "src/rpc.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: [
    "@opencode/plugin",
    "@opencode/plugin/*",
    "@opencode/schema/*",
    "@opencode/client",
    "@opencode/ai",
    "effect",
    "effect/*",
  ],
});
