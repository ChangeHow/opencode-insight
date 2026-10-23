import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const extensionRoot = path.join(root, "packages/openchamber-extension");
const extension = JSON.parse(await readFile(path.join(extensionRoot, "package.json"), "utf8"));
const target = path.join(root, "openchamber");
await mkdir(target, { recursive: true });
await cp(path.join(extensionRoot, "dist/panel"), path.join(target, "panel"), { recursive: true });
await cp(path.join(extensionRoot, "dist/service"), path.join(target, "service"), {
  recursive: true,
});
await writeFile(
  path.join(target, "package.json"),
  JSON.stringify(
    {
      name: "@changehow/oc-insight-openchamber",
      version: metadata.version,
      private: true,
      type: "module",
      openchamber: {
        ...extension.openchamber,
        contributes: {
          ...extension.openchamber.contributes,
          panel: { ...extension.openchamber.contributes.panel, entry: "panel/index.html" },
          statusSection: {
            ...extension.openchamber.contributes.statusSection,
            entry: "panel/index.html",
          },
          service: { ...extension.openchamber.contributes.service, entry: "service/main.js" },
        },
      },
    },
    null,
    2,
  ) + "\n",
);

await build({
  entryPoints: [
    { in: path.join(root, "server.ts"), out: "server" },
    { in: path.join(root, "packages/opencode-plugin/src/rpc.ts"), out: "dist/opencode-rpc" },
    { in: path.join(root, "openchamber/index.ts"), out: "openchamber/index" },
  ],
  outdir: root,
  bundle: true,
  format: "esm",
  platform: "node",
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
await build({
  entryPoints: [path.join(root, "scripts/opendash-extensions.ts")],
  outfile: path.join(root, "scripts/opendash-extensions.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
});
