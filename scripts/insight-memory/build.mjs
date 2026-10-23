import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

export const repository = path.resolve(import.meta.dirname, "../..");
const pluginSource = "packages/opencode-plugin/src";
const telemetrySource = "packages/telemetry/src";
const external = [
  "@opencode/plugin",
  "@opencode/plugin/*",
  "@opencode/schema/*",
  "@opencode/client",
  "@opencode/ai",
  "effect",
  "effect/*",
  "bun:*",
];

const instrument = (entry) => `
import { Plugin } from "@opencode/plugin";
import subject from ${JSON.stringify(entry)};
export default Plugin.define({ id: subject.id, setup(ctx) {
  const operations = { contextReads: 0, sessionGets: 0, storageWrites: 0, storageReads: 0, contextsWithoutIDs: 0, contextsWithMissingIDs: 0 };
  globalThis[Symbol.for("insight-memory.operations")] = operations;
  const wrap = (object, key, count) => (...args) => {
    operations[count]++;
    return object[key](...args);
  };
  const namespace = (target, replacements) => new Proxy(target, { get(object, key) {
    if (Object.hasOwn(replacements, key)) return replacements[key];
    const value = Reflect.get(object, key, object);
    return typeof value === "function" ? value.bind(object) : value;
  } });
  const session = namespace(ctx.session, {
    context: wrap(ctx.session, "context", "contextReads"), get: wrap(ctx.session, "get", "sessionGets"),
    hook(name, callback, ...rest) {
      return ctx.session.hook(name, name === "context" ? (input) => {
        if (input.messages.every((message) => !message.id)) operations.contextsWithoutIDs++;
        if (input.messages.some((message) => !message.id)) operations.contextsWithMissingIDs++;
        return callback(input);
      } : callback, ...rest);
    }
  });
  const storage = namespace(ctx.storage, { get: wrap(ctx.storage, "get", "storageReads"), set: wrap(ctx.storage, "set", "storageWrites") });
  return subject.setup(new Proxy(ctx, { get(target, key) {
    return key === "session" ? session : key === "storage" ? storage : Reflect.get(target, key, target);
  } }));
} });
`;

export async function buildVariants(output, ref, names, retentionProbe = false, control) {
  await mkdir(output, { recursive: true });
  const revision = spawnSync("git", ["rev-parse", ref], { cwd: repository, encoding: "utf8" });
  if (revision.status !== 0) throw new Error("Cannot resolve baseline revision");
  const archive = path.join(output, "baseline.tar");
  const archived = spawnSync(
    "git",
    [
      "archive",
      `--output=${archive}`,
      revision.stdout.trim(),
      "packages/opencode-plugin",
      "packages/telemetry",
      "server.ts",
      "tsconfig.base.json",
    ],
    { cwd: repository },
  );
  if (archived.status !== 0) throw new Error("Cannot freeze baseline source");
  const baseline = path.join(output, "baseline-source");
  const candidate = path.join(output, "candidate-source");
  await mkdir(baseline);
  if (spawnSync("tar", ["-xf", archive, "-C", baseline]).status !== 0)
    throw new Error("Cannot extract baseline");
  await cp(path.join(repository, pluginSource), path.join(candidate, pluginSource), {
    recursive: true,
  });
  await cp(path.join(repository, telemetrySource), path.join(candidate, telemetrySource), {
    recursive: true,
  });
  for (const file of [`${pluginSource}/rpc.ts`, `${telemetrySource}/schema.ts`]) {
    if (
      !(await readFile(path.join(repository, file))).equals(
        await readFile(path.join(baseline, file)),
      )
    )
      throw new Error(`Public contract changed: ${file}`);
  }
  const variants = {};
  for (const name of names.filter((name) => name !== "off")) {
    if (!["baseline", "queue", "candidate", "control"].includes(name))
      throw new Error(`Unknown candidate ${name}; use off, baseline, queue, control, or candidate`);
    const directory = path.join(output, "bundles", name);
    const source = path.join(directory, "source");
    await cp(baseline, source, { recursive: true });
    const selected = name === "candidate" ? ["working-tree"] : name === "queue" ? ["queue"] : [];
    if (name === "candidate") {
      await cp(path.join(candidate, pluginSource), path.join(source, pluginSource), {
        recursive: true,
      });
      await cp(path.join(candidate, telemetrySource), path.join(source, telemetrySource), {
        recursive: true,
      });
    }
    if (name === "control") {
      if (!control) throw new Error("The control arm requires --control=/frozen/candidate-source");
      for (const file of [`${pluginSource}/rpc.ts`, `${telemetrySource}/schema.ts`]) {
        if (
          !(await readFile(path.join(control, file))).equals(
            await readFile(path.join(baseline, file)),
          )
        )
          throw new Error(`Control public contract changed: ${file}`);
      }
      await cp(path.join(control, pluginSource), path.join(source, pluginSource), {
        recursive: true,
      });
      await cp(path.join(control, telemetrySource), path.join(source, telemetrySource), {
        recursive: true,
      });
      selected.push(`frozen-source:${path.resolve(control)}`);
    }
    if (name === "queue") {
      const file = path.join(source, pluginSource, "collector.ts");
      const text = await readFile(file, "utf8");
      const original = "this.tail = next.catch(() => {});";
      if (!text.includes(original)) throw new Error("Queue ablation no longer matches baseline");
      await writeFile(
        file,
        text.replace(original, "this.tail = next.then(() => undefined, () => undefined);"),
      );
    }
    {
      const file = path.join(source, pluginSource, "collector.ts");
      const text = await readFile(file, "utf8");
      const original = "this.sessions.set(sessionID, session);";
      if (!text.includes(original)) throw new Error("Collector ownership probe no longer matches");
      await writeFile(
        file,
        text.replace(
          original,
          `${original}
        const refs = globalThis[Symbol.for("insight-memory.session-refs")] ??= new Map();
        refs.set(sessionID, new WeakRef(session));`,
        ),
      );
    }
    {
      const file = path.join(source, telemetrySource, "tokenizer-bpe.ts");
      const text = await readFile(file, "utf8");
      const original = "rankMap ??= buildRankMap();";
      if (!text.includes(original)) throw new Error("Tokenizer ownership probe no longer matches");
      await writeFile(
        file,
        text.replace(
          original,
          `rankMap ??= (() => {
        const map = buildRankMap();
        globalThis[Symbol.for("insight-memory.rank-ref")] = new WeakRef(map);
        return map;
      })();`,
        ),
      );
    }
    if (retentionProbe) {
      const file = path.join(source, pluginSource, "snapshot.ts");
      const text = await readFile(file, "utf8");
      const original = "const result = schema.parse(value);";
      if (!text.includes(original) || name === "candidate")
        throw new Error("Retention probe needs the reference snapshot adapter");
      await writeFile(
        file,
        text.replace(
          original,
          `${original}\nglobalThis[Symbol.for("insight-memory.last-snapshot")] = new WeakRef(result);`,
        ),
      );
    }
    const entry = path.join(directory, "entry.mjs");
    await writeFile(entry, instrument(path.join(source, pluginSource, "index.ts")));
    await writeFile(
      path.join(directory, "package.json"),
      JSON.stringify({
        name: `insight-memory-${name}`,
        type: "module",
        exports: { "./server": "./server.js" },
      }),
    );
    const options = {
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
      external,
      nodePaths: [
        path.join(repository, "node_modules"),
        path.join(repository, "packages/opencode-plugin/node_modules"),
        path.join(repository, "packages/telemetry/node_modules"),
      ],
      alias: {
        "@opencode-insight/telemetry/schema": path.join(source, telemetrySource, "schema.ts"),
        "@opencode-insight/telemetry": path.join(source, telemetrySource, "index.ts"),
      },
    };
    await build({ ...options, entryPoints: [entry], outfile: path.join(directory, "server.js") });
    const replayEntry = path.join(directory, "replay-entry.mjs");
    await writeFile(
      replayEntry,
      `import subject from ${JSON.stringify(entry)};\nimport { replayPlugin } from ${JSON.stringify(path.join(import.meta.dirname, "replay.mjs"))};\nexport default replayPlugin(subject);\n`,
    );
    const replayDirectory = path.join(directory, "replay");
    await mkdir(replayDirectory);
    await build({
      ...options,
      entryPoints: [replayEntry],
      outfile: path.join(replayDirectory, "server.js"),
      define: {
        "Date.now": "globalThis.__insightReplayClock.now",
        setTimeout: "globalThis.__insightReplayClock.setTimeout",
        clearTimeout: "globalThis.__insightReplayClock.clearTimeout",
      },
    });
    await writeFile(
      path.join(replayDirectory, "package.json"),
      JSON.stringify({ type: "module", exports: { "./server": "./server.js" } }),
    );
    variants[name] = {
      directory,
      replayDirectory,
      directions: selected,
      sha256: createHash("sha256")
        .update(await readFile(path.join(directory, "server.js")))
        .digest("hex"),
    };
  }
  const probe = path.join(output, "probe");
  await mkdir(probe);
  await build({
    entryPoints: [path.join(import.meta.dirname, "probe-plugin.mjs")],
    outfile: path.join(probe, "server.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    external,
    nodePaths: [path.join(repository, "packages/opencode-plugin/node_modules")],
  });
  await writeFile(
    path.join(probe, "package.json"),
    JSON.stringify({ type: "module", exports: { "./server": "./server.js" } }),
  );
  await symlink(path.join(repository, "node_modules"), path.join(output, "node_modules"), "dir");
  const result = { revision: revision.stdout.trim(), variants, probe };
  await writeFile(path.join(output, "bundles.json"), JSON.stringify(result, null, 2));
  return result;
}
