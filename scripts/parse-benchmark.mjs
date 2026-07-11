import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGES = ["bff", "web"];

export async function readResults(directory, label) {
  const results = new Map();

  for (const packageName of PACKAGES) {
    const report = JSON.parse(
      await fs.readFile(path.join(directory, `${label}-${packageName}.json`), "utf8"),
    );

    for (const file of report.files) {
      for (const group of file.groups) {
        for (const benchmark of group.benchmarks) {
          const key = `${packageName}:${group.fullName}:${benchmark.name}`;
          results.set(key, {
            packageName,
            group: group.fullName.split(" > ").at(-1),
            name: benchmark.name,
            mean: benchmark.mean,
            rme: benchmark.rme,
          });
        }
      }
    }
  }

  return results;
}

function formatMean(result) {
  if (!result) return "—";
  const digits = result.mean < 0.01 ? 4 : result.mean < 1 ? 3 : 2;
  return `${result.mean.toFixed(digits)} ms (±${result.rme.toFixed(2)}%)`;
}

function formatChange(current, baseline) {
  if (!baseline) return "—";
  const change = (current.mean / baseline.mean - 1) * 100;
  const marker = Math.abs(change) < 0.05 ? "" : change < 0 ? " ↓" : " ↑";
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%${marker}`;
}

export function generateMarkdown(current, previous, main, refs) {
  const lines = [
    "## Benchmark Results",
    "",
    `Current: \`${refs.current.slice(0, 7)}\` · Previous: \`${refs.previous.slice(0, 7)}\` · Main: \`${refs.main.slice(0, 7)}\``,
    "",
    "Lower mean latency is better. ↓ indicates an improvement; ↑ indicates a regression.",
    "",
    "| Package | Group | Benchmark | Current | Previous commit | Δ vs previous | Main | Δ vs main |",
    "|---|---|---|---:|---:|---:|---:|---:|",
  ];

  for (const [key, result] of current) {
    lines.push(
      `| ${result.packageName} | ${result.group} | ${result.name.replaceAll("|", "\\|")} | ${formatMean(result)} | ${formatMean(previous.get(key))} | ${formatChange(result, previous.get(key))} | ${formatMean(main.get(key))} | ${formatChange(result, main.get(key))} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const [directory, currentSha, previousSha, mainSha] = process.argv.slice(2);
  if (!directory || !currentSha || !previousSha || !mainSha) {
    throw new Error(
      "Usage: parse-benchmark.mjs <results-dir> <current-sha> <previous-sha> <main-sha>",
    );
  }

  const [current, previous, mainResults] = await Promise.all([
    readResults(directory, "current"),
    readResults(directory, "previous"),
    readResults(directory, "main"),
  ]);
  process.stdout.write(
    generateMarkdown(current, previous, mainResults, {
      current: currentSha,
      previous: previousSha,
      main: mainSha,
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
