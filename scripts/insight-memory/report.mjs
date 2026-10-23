import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value) => +value.toFixed(2);
const mib = (value) => value / 1048576;
const range = (values) => ({
  median: round(median(values)),
  min: round(Math.min(...values)),
  max: round(Math.max(...values)),
});
const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)
  ];

export async function summarize(directory) {
  const report = JSON.parse(await readFile(path.join(directory, "results.json"), "utf8"));
  const groups = {};
  for (const name of report.names) {
    const runs = report.runs.filter((run) => run.name === name);
    if (!runs.length) continue;
    if (runs.some((run) => !run.finished || !run.stopped))
      throw new Error(`Incomplete runs: ${name}`);
    const point = (run, label) => run.checkpoints.find((checkpoint) => checkpoint.label === label);
    groups[name] = {
      repeats: runs.length,
      collectRSSMiB: range(runs.map((run) => mib(point(run, "long-streams").rss))),
      finalRSSMiB: range(runs.map((run) => mib(point(run, "natural-final").rss))),
      naturalHeapMiB: range(runs.map((run) => mib(point(run, "natural-final").heap.heapSize))),
      physicalFootprintMiB: runs.every((run) => Number.isFinite(run.vmmap?.physicalFootprint))
        ? range(runs.map((run) => mib(run.vmmap.physicalFootprint)))
        : null,
      settledFootprintMiB: runs.every((run) =>
        run.footprints?.some(
          (value) => value.label === "soak-final" && Number.isFinite(value.physicalFootprint),
        ),
      )
        ? range(
            runs.map((run) =>
              mib(run.footprints.find((value) => value.label === "soak-final").physicalFootprint),
            ),
          )
        : null,
      peakRSSMiB: range(
        runs.map((run) =>
          mib(
            Math.max(
              ...[
                ...run.rssSamples.filter((sample) => sample.phase !== "reloads"),
                ...run.checkpoints.filter((sample) => sample.label !== "reloads-final"),
              ].map((sample) => sample.rss),
            ),
          ),
        ),
      ),
      postGCHeapMiB: range(runs.map((run) => mib(point(run, "post-gc").heap.heapSize))),
      idleOwnership: runs.map((run) => ({
        sessionObjectsAlive: point(run, "natural-final").sessionObjectsAlive,
        tokenizerAlive: point(run, "natural-final").tokenizerAlive,
      })),
      reloadProof: runs.map((run) => run.reloadProof ?? null),
      cpuMilliseconds: range(
        runs.map((run) => {
          const start = point(run, "loaded").cpu;
          const end = point(run, "natural-final").cpu;
          return (end.user + end.system - start.user - start.system) / 1000;
        }),
      ),
      turnMedianMilliseconds: range(runs.map((run) => median(run.turnLatencies))),
      turnP95Milliseconds: range(runs.map((run) => percentile(run.turnLatencies, 0.95))),
      rpcMedianMilliseconds: runs[0].rpcLatencies.length
        ? range(runs.map((run) => median(run.rpcLatencies)))
        : null,
      operations: runs.map((run) =>
        Object.fromEntries(
          Object.entries(point(run, "natural-final").operations).map(([key, value]) => [
            key,
            value - (point(run, "loaded").operations[key] ?? 0),
          ]),
        ),
      ),
      contract: report.equivalence[name] ?? null,
      soak: runs.map((run) =>
        run.checkpoints
          .filter(
            (checkpoint) =>
              checkpoint.label.startsWith("soak-") ||
              checkpoint.label.includes("cycle-idle-final") ||
              checkpoint.label === "reloads-final",
          )
          .map((checkpoint) => ({
            label: checkpoint.label,
            rssMiB: round(mib(checkpoint.rss)),
            heapMiB: round(mib(checkpoint.heap.heapSize)),
            objects: checkpoint.heap.objectCount,
            sessionObjectsAlive: checkpoint.sessionObjectsAlive,
            tokenizerAlive: checkpoint.tokenizerAlive,
            physicalFootprintMiB: run.footprints?.some(
              (value) =>
                value.label === checkpoint.label && Number.isFinite(value.physicalFootprint),
            )
              ? round(
                  mib(
                    run.footprints.find((value) => value.label === checkpoint.label)
                      .physicalFootprint,
                  ),
                )
              : undefined,
          })),
      ),
    };
  }
  const versions = [
    ...new Set(
      report.runs.map((run) => `${run.serverInfo.version}/Bun-${run.checkpoints[0].versions.bun}`),
    ),
  ];
  if (versions.length > 1) throw new Error("OpenCode/Bun version changed across runs");
  const result = {
    protocolVersion: report.protocolVersion ?? 1,
    catalog: report.catalog,
    revision: report.bundles.revision,
    versions,
    workload: report.workload,
    groups,
    bundleHashes: Object.fromEntries(
      Object.entries(report.bundles.variants).map(([name, bundle]) => [name, bundle.sha256]),
    ),
  };
  await writeFile(path.join(directory, "summary.json"), JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] === import.meta.filename)
  console.log(JSON.stringify(await summarize(process.argv[2]), null, 2));
