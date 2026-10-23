import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildVariants } from "./build.mjs";
import { nativeRun } from "./native.mjs";
import { provider } from "./provider.mjs";
import { server } from "./runtime.mjs";
import { freezeCatalog } from "./catalog.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [key, value] = argument.replace(/^--/, "").split("=");
    return [key, value ?? "true"];
  }),
);
const output = path.resolve(
  args.out ?? path.join(tmpdir(), "opencode", `insight-memory-${Date.now()}`),
);
const names = (args.variants ?? "off,baseline,candidate").split(",");
const repeats = Number(args.repeats ?? 2);
const soak = Number(args.soak ?? 0);
const workload = {
  turns: Number(args.turns ?? 40),
  sessions: Number(args.sessions ?? 96),
  concurrent: 4,
  polls: Number(args.polls ?? 100),
  idleSeconds: Number(args.idle ?? 10),
  reloads: Number(args.reloads ?? 10),
  cycles: Number(args.cycles ?? 1),
  lastSession: args["retention-probe"] === "true",
  idlePoll: args["idle-poll"] === "true",
  pollMode: args["poll-mode"] ?? "stress",
  eventClient: args["event-client"] === "true",
  vmmap: args.vmmap === "true",
};
if (!["stress", "panel"].includes(workload.pollMode))
  throw new Error("Use --poll-mode=stress or --poll-mode=panel");
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
const bundles = await buildVariants(
  output,
  args.baseline ?? "HEAD",
  [...new Set(["baseline", ...names])],
  workload.lastSession,
  args.control,
);
const catalog = await freezeCatalog(output, args.catalog);
const report = {
  protocolVersion: 3,
  profiled: args.profile === "true",
  orderProtocol: "reversed-pairs-with-rotated-blocks",
  catalog,
  warmupPostGC: true,
  bundles,
  workload,
  names,
  repeats,
  soak,
  equivalence: {},
  runs: [],
};
const save = () => writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));

const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && !Array.isArray(item) && typeof item === "object"
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
let reference;
for (const [name, bundle] of Object.entries(bundles.variants)) {
  const directory = path.join(output, "equivalence", name);
  const host = await server(directory, [bundle.replayDirectory], undefined, catalog);
  try {
    const value = await host.rpc("insight-memory-replay", "run", {});
    await writeFile(path.join(directory, "output.json"), JSON.stringify(value, null, 2));
    const content = canonical(value.contract);
    reference ??= content;
    if (content !== reference)
      throw new Error(`Full replay output differs: ${name}; inspect ${directory}`);
    report.equivalence[name] = {
      sha256: createHash("sha256").update(content).digest("hex"),
      diagnostics: value.diagnostics,
      passed: true,
    };
    console.log(`Exact replay passed: ${name}`);
  } finally {
    await host.close();
  }
}
await save();
if (args["replay-only"] !== undefined) {
  console.log(`Results: ${output}`);
} else {
  const model = await provider();
  try {
    // Rotate and reverse each block so candidates do not always follow the same predecessor.
    for (let repeat = 0; repeat < repeats; repeat++) {
      const shift = Math.floor(repeat / 2) % names.length;
      let order = [...names.slice(shift), ...names.slice(0, shift)];
      if (repeat % 2) order = order.reverse();
      for (const name of order) {
        console.log(`Native run: ${repeat + 1}/${repeats} ${name}`);
        const directory = path.join(output, "native", `${repeat + 1}-${name}`);
        const result = await nativeRun(
          directory,
          bundles.variants[name],
          bundles.probe,
          model,
          workload,
          soak,
          catalog,
          args.profile === "true",
        );
        report.runs.push({ name, repeat, directory, ...result });
        await save();
      }
    }
  } finally {
    await model.close();
    await save();
  }
  console.log(`Results: ${output}`);
}
