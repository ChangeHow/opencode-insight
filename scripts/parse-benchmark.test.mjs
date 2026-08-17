import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generateMarkdown, readResults } from "./parse-benchmark.mjs";

const key = "web:trend:compose";
const result = {
  packageName: "web",
  group: "trend",
  name: "compose | chart",
  mean: 8,
  rme: 1.25,
};

test("reports previous commit and main comparisons", () => {
  const markdown = generateMarkdown(
    new Map([[key, result]]),
    new Map([[key, { ...result, mean: 10 }]]),
    new Map([[key, { ...result, mean: 5 }]]),
    { current: "123456789", previous: "abcdefghi", main: "987654321" },
  );

  assert.match(markdown, /Current: `1234567` · Previous: `abcdefg` · Main: `9876543`/);
  assert.match(markdown, /compose \\| chart/);
  assert.match(markdown, /-20\.0% ↓/);
  assert.match(markdown, /\+60\.0% ↑/);
});

test("does not mark overlapping error intervals as a regression", () => {
  const markdown = generateMarkdown(
    new Map([[key, { ...result, mean: 10, rme: 2 }]]),
    new Map([[key, { ...result, mean: 10.1, rme: 2 }]]),
    new Map([[key, { ...result, mean: 10.1, rme: 2 }]]),
    { current: "123456789", previous: "abcdefghi", main: "987654321" },
  );

  assert.match(markdown, /-1\.0% ≈/);
});

test("reads Vitest JSON reports for both packages", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "benchmark-report-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const report = {
    files: [
      {
        groups: [
          {
            fullName: "file.bench.ts > group",
            benchmarks: [{ name: "benchmark", mean: 1.5, rme: 2 }],
          },
        ],
      },
    ],
  };

  await Promise.all(
    ["bff", "web"].map((packageName) =>
      fs.writeFile(path.join(directory, `current-${packageName}.json`), JSON.stringify(report)),
    ),
  );

  const results = await readResults(directory, "current");
  assert.equal(results.size, 2);
  assert.equal(results.get("web:file.bench.ts > group:benchmark")?.mean, 1.5);
});
