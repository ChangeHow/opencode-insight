import { Command } from "commander";
import process from "node:process";

const DEFAULT_BASE_URL = `http://${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? 8787}`;
const RANGES = ["7d", "month", "3mo", "year", "all"];

function formatCurrency(value) {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCompact(value) {
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

function formatNumber(value) {
  return value.toLocaleString("en-US");
}

async function fetchJson(baseUrl, pathname) {
  let response;
  try {
    response = await fetch(`${baseUrl}${pathname}`);
  } catch {
    console.error(`Cannot reach the dashboard daemon at ${baseUrl}.`);
    console.error("Start it first with: opendash start");
    process.exit(1);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    console.error(`Request failed (${response.status}): ${payload?.error ?? pathname}`);
    process.exit(1);
  }

  return response.json();
}

function buildQuery(options) {
  const params = new URLSearchParams();
  if (options.start || options.end) {
    if (options.start) params.set("start", options.start);
    if (options.end) params.set("end", options.end);
  } else {
    params.set("range", options.range ?? "7d");
  }
  return `?${params.toString()}`;
}

function renderTable(headers, rows) {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => String(row[column] ?? "").length)),
  );

  const formatRow = (row) =>
    row
      .map((cell, column) =>
        column === 0 ? String(cell).padEnd(widths[column]) : String(cell).padStart(widths[column]),
      )
      .join("  ");

  console.log(formatRow(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log(formatRow(row));
  }
}

function describeRange(options) {
  if (options.start || options.end) {
    return `${options.start ?? "begin"} → ${options.end ?? "today"}`;
  }
  return options.range ?? "7d";
}

async function summaryCommand(options) {
  const data = await fetchJson(options.url, `/api/summary${buildQuery(options)}`);

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const rows = [
    ["Range", describeRange(options)],
    ["Tokens", formatNumber(data.totalTokens)],
    ["Cost", formatCurrency(data.totalCost)],
    ["Messages", formatNumber(data.totalMessages)],
    ["Active days", formatNumber(data.activeDays)],
    ["Avg tokens/day", formatNumber(data.averageTokensPerActiveDay)],
    ["Streak", `${data.currentStreak} current / ${data.longestStreak} longest`],
    [
      "Top model",
      data.topModel ? `${data.topModel.modelId} (${formatCurrency(data.topModel.cost)})` : "-",
    ],
    [
      "Best day",
      data.bestDay ? `${data.bestDay.date} · ${formatCompact(data.bestDay.tokens)} tokens` : "-",
    ],
    ["Source", data.source.kind],
    ["Scanned at", data.scannedAt],
  ];

  for (const [label, value] of rows) {
    console.log(`${label.padEnd(15)}${value}`);
  }
}

async function modelsCommand(options) {
  const data = await fetchJson(options.url, `/api/series${buildQuery(options)}`);

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  let entries = data.options.filter(
    (option) => option.totalCost > 0 || option.totalTokens > 0 || option.totalMessages > 0,
  );
  if (options.provider) {
    entries = entries.filter((option) => option.providerId === options.provider);
  }
  if (options.limit > 0) {
    entries = entries.slice(0, options.limit);
  }

  renderTable(
    ["MODEL", "PROVIDER", "SPEND", "TOKENS", "MESSAGES"],
    entries.map((option) => [
      option.modelId,
      option.providerId,
      formatCurrency(option.totalCost),
      formatCompact(option.totalTokens),
      formatNumber(option.totalMessages),
    ]),
  );
}

async function dailyCommand(options) {
  const data = await fetchJson(options.url, `/api/heatmap${buildQuery(options)}`);

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  let days = data;
  if (!options.all) {
    days = days.filter((day) => day.tokens > 0 || day.cost > 0 || day.messages > 0);
  }
  if (options.limit > 0) {
    days = days.slice(-options.limit);
  }

  renderTable(
    ["DATE", "TOKENS", "COST", "MESSAGES", "IN/OUT/CACHE", "LEVEL"],
    days.map((day) => [
      day.date,
      formatCompact(day.tokens),
      formatCurrency(day.cost),
      formatNumber(day.messages),
      `${formatCompact(day.breakdown.input)}/${formatCompact(day.breakdown.output)}/${formatCompact(day.breakdown.cacheRead + day.breakdown.cacheWrite)}`,
      "█".repeat(day.intensity) || "·",
    ]),
  );
}

async function providersCommand(options) {
  const data = await fetchJson(options.url, `/api/providers${buildQuery(options)}`);

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const entries = data.providers;

  renderTable(
    ["PROVIDER", "SPEND", "TOKENS", "MESSAGES", "MODELS", "DAYS", "TOP MODEL"],
    entries.map((provider) => [
      provider.providerId,
      formatCurrency(provider.totalCost),
      formatCompact(provider.totalTokens),
      formatNumber(provider.totalMessages),
      formatNumber(provider.modelCount),
      formatNumber(provider.activeDays),
      provider.topModel?.modelId ?? "-",
    ]),
  );
}

function rangeOption(command) {
  return command
    .option("--range <range>", `Time range: ${RANGES.join(", ")}`, "7d")
    .option("--start <date>", "Custom window start (YYYY-MM-DD), overrides --range")
    .option("--end <date>", "Custom window end (YYYY-MM-DD), overrides --range")
    .option("--json", "Output raw JSON (for scripting, piping, jq)")
    .option(
      "--url <url>",
      "Dashboard base URL (env: OPENDASH_URL)",
      process.env.OPENDASH_URL ?? DEFAULT_BASE_URL,
    );
}

function withExamples(command, examples) {
  command.addHelpText("after", `\nExamples:\n${examples.map((line) => `  ${line}`).join("\n")}`);
  return command;
}

export function registerQueryCommands(program) {
  withExamples(
    rangeOption(
      program
        .command("summary")
        .description(
          "Show usage totals for a time range.\nUse when you want the headline numbers: tokens, cost, messages, streaks, top model.",
        )
        .action(summaryCommand),
    ),
    [
      "opendash summary                          # last 7 days, human-readable",
      "opendash summary --range month            # current month",
      "opendash summary --start 2026-07-01 --end 2026-07-31",
      "opendash summary --range all --json | jq '.totalCost'   # script-friendly",
    ],
  );

  withExamples(
    rangeOption(
      program
        .command("models")
        .description(
          "Show per-model spend and volume, sorted by cost.\nUse when you want to find which model routes consume the most budget.",
        )
        .option("--provider <id>", "Filter rows by provider id (e.g. openai, zai-coding-plan)")
        .option("--limit <n>", "Show top N models", (value) => Number(value), 20),
    ).action(modelsCommand),
    [
      "opendash models --range month             # top models this month",
      "opendash models --provider openai         # one provider only",
      "opendash models --range all --limit 5     # all-time top 5",
      "opendash models --json > models.json      # save raw data",
    ],
  );

  withExamples(
    rangeOption(
      program
        .command("daily")
        .description(
          "Show per-day usage rows (tokens, cost, messages, cache mix).\nUse when you want day-by-day detail or to spot heavy days.",
        )
        .option("--limit <n>", "Show the most recent N days", (value) => Number(value), 30)
        .option("--all", "Include days without activity (default: active days only)"),
    ).action(dailyCommand),
    [
      "opendash daily --range 7d                 # this week",
      "opendash daily --range 3mo --limit 14     # last 14 active days",
      "opendash daily --all --start 2026-08-01 --end 2026-08-07  # include empty days",
    ],
  );

  withExamples(
    rangeOption(
      program
        .command("providers")
        .description(
          "Show per-provider totals (spend, tokens, models, active days).\nUse when you want to compare providers against each other.",
        ),
    ).action(providersCommand),
    [
      "opendash providers --range month          # provider leaderboard",
      "opendash providers --range all --json     # full data for scripts",
    ],
  );
}
