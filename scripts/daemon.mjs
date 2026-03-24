#!/usr/bin/env node
// scripts/daemon.mjs — Start opencode-telescope as a background daemon.
// Usage: node scripts/daemon.mjs
// The BFF and web app must be built first: pnpm build

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PID_FILE = path.join(ROOT, ".telescope-daemon.pid");
const LOG_DIR = path.join(ROOT, "logs");
const BFF_ENTRY = path.join(ROOT, "apps", "bff", "dist", "index.js");
const WEB_DIST = path.join(ROOT, "apps", "web", "dist");

function printBox(title, lines) {
  const maxLen = Math.max(title.length, ...lines.map((l) => l.length), 36);
  const border = "─".repeat(maxLen + 2);
  process.stdout.write(`\n┌${border}┐\n`);
  process.stdout.write(`│ ${title.padEnd(maxLen)} │\n`);
  process.stdout.write(`├${border}┤\n`);
  for (const line of lines) {
    process.stdout.write(`│ ${line.padEnd(maxLen)} │\n`);
  }
  process.stdout.write(`└${border}┘\n\n`);
}

// Verify builds exist
if (!existsSync(BFF_ENTRY)) {
  console.error("❌ BFF is not built. Run 'pnpm build' first.");
  process.exit(1);
}
if (!existsSync(path.join(WEB_DIST, "index.html"))) {
  console.error("❌ Web app is not built. Run 'pnpm build' first.");
  process.exit(1);
}

// Check for an already-running daemon
if (existsSync(PID_FILE)) {
  const raw = readFileSync(PID_FILE, "utf8").trim();
  const existingPid = parseInt(raw, 10);
  if (Number.isInteger(existingPid) && existingPid > 0) {
    try {
      process.kill(existingPid, 0); // throws if process doesn't exist (ESRCH)
      console.error(`❌ Daemon is already running (PID: ${existingPid}). Run 'pnpm daemon:stop' first.`);
      process.exit(1);
    } catch (err) {
      if (err.code !== "ESRCH") {
        // Process exists but we lack permission — still report as running
        console.error(`❌ Daemon is already running (PID: ${existingPid}). Run 'pnpm daemon:stop' first.`);
        process.exit(1);
      }
      // ESRCH = process does not exist; stale PID file, fall through to clean up
    }
  }
  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

const env = {
  ...process.env,
  PORT: String(port),
  HOST: host,
  WEB_DIST_DIR: WEB_DIST,
  NODE_ENV: "production",
};

mkdirSync(LOG_DIR, { recursive: true });

const logFile = path.join(LOG_DIR, "bff.log");
const errFile = path.join(LOG_DIR, "bff-error.log");

const outFd = openSync(logFile, "a");
const errFd = openSync(errFile, "a");

const child = spawn(process.execPath, [BFF_ENTRY], {
  detached: true,
  stdio: ["ignore", outFd, errFd],
  env,
  cwd: ROOT,
});

child.unref();

const pid = child.pid;
writeFileSync(PID_FILE, String(pid), "utf8");

// Give the process a moment to start; detect immediate crashes
await new Promise((resolve) => setTimeout(resolve, 1200));

let alive = false;
try {
  process.kill(pid, 0);
  alive = true;
} catch {
  alive = false;
}

if (!alive) {
  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  console.error("❌ Daemon process exited immediately. Check error log:");
  console.error("   " + errFile);
  process.exit(1);
}

const displayHost = host === "0.0.0.0" ? "localhost" : host;
const url = `http://${displayHost}:${port}`;

printBox("opencode-telescope daemon", [
  `Status : Running`,
  `PID    : ${pid}`,
  `Port   : ${port}`,
  `Host   : ${host}`,
  `Access : ${url}`,
  `Log    : logs/bff.log`,
  `Errors : logs/bff-error.log`,
]);

console.log("✓ Dashboard is running in the background.");
console.log(`  Open in your browser: ${url}`);
console.log(`  To stop: pnpm daemon:stop`);
console.log(`  To view logs: tail -f ${logFile}`);
console.log("");
