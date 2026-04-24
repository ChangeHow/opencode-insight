/**
 * Parse vitest benchmark text output and generate a Markdown table.
 * Reads from stdin, writes Markdown to stdout.
 */

function parseBenchOutput(text) {
  const lines = text.split("\n");

  // Extract benchmark rows (lines starting with "   · " or similar)
  const benchRows = [];
  let inBenchTable = false;

  for (const line of lines) {
    // Detect table header
    if (line.includes("name") && line.includes("hz") && line.includes("min")) {
      inBenchTable = true;
      continue;
    }

    // Detect end of table
    if (inBenchTable && line.trim() === "") {
      inBenchTable = false;
      continue;
    }

    // Parse benchmark row
    if (inBenchTable && line.includes("·")) {
      const parts = line.trim().split(/\s{2,}/);
      if (parts.length >= 10) {
        benchRows.push({
          name: parts[0].replace("·", "").trim(),
          hz: parts[1],
          min: parts[2],
          max: parts[3],
          mean: parts[4],
          p75: parts[5],
          p99: parts[6],
          rme: parts[9],
        });
      }
    }
  }

  // Extract summary comparisons
  const summaryLines = [];
  let inSummary = false;
  let currentBaseline = "";

  for (const line of lines) {
    if (line.includes("BENCH  Summary")) {
      inSummary = true;
      continue;
    }

    if (inSummary && line.trim() === "") {
      continue;
    }

    if (inSummary && line.trim() && !line.trim().startsWith("faster") && !line.match(/^\d/)) {
      // New baseline — take text before " - " if present
      const text = line.trim();
      const dashIdx = text.indexOf(" - ");
      currentBaseline = dashIdx > 0 ? text.slice(0, dashIdx).trim() : text;
      continue;
    }

    if (inSummary && line.match(/^\s+[\d,.]+x\s+faster/)) {
      const match = line.match(/([\d,.]+)x\s+faster\s+than\s+(.+)/);
      if (match) {
        summaryLines.push({
          baseline: currentBaseline,
          multiplier: match[1],
          target: match[2].trim(),
        });
      }
    }
  }

  return { benchRows, summaryLines };
}

function generateMarkdown({ benchRows, summaryLines }) {
  const lines = [];

  lines.push("## Benchmark Results");
  lines.push("");

  if (benchRows.length > 0) {
    lines.push("### Performance");
    lines.push("");
    lines.push("| Benchmark | Hz | Min (ms) | Max (ms) | Mean (ms) | p75 (ms) | p99 (ms) | RME |");
    lines.push("|-----------|-----|----------|----------|-----------|----------|----------|-----|");

    for (const row of benchRows) {
      lines.push(
        `| ${row.name} | ${row.hz} | ${row.min} | ${row.max} | ${row.mean} | ${row.p75} | ${row.p99} | ${row.rme} |`,
      );
    }
    lines.push("");
  }

  if (summaryLines.length > 0) {
    lines.push("### Comparisons");
    lines.push("");
    lines.push("| Baseline | Comparison | Speedup |");
    lines.push("|----------|------------|---------|");

    for (const row of summaryLines) {
      lines.push(`| ${row.baseline} | vs ${row.target} | **${row.multiplier}x** |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf-8");
  const data = parseBenchOutput(text);
  const markdown = generateMarkdown(data);
  console.log(markdown);
}

main();
