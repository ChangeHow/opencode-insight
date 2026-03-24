#!/usr/bin/env node
// scripts/stop-daemon.mjs — Stop the opencode-telescope background daemon.
// Usage: node scripts/stop-daemon.mjs

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PID_FILE = path.join(ROOT, ".telescope-daemon.pid");

if (!existsSync(PID_FILE)) {
  console.log("No daemon is running (PID file not found).");
  process.exit(0);
}

const raw = readFileSync(PID_FILE, "utf8").trim();
const pid = parseInt(raw, 10);

if (!Number.isInteger(pid) || pid <= 0) {
  console.error("Invalid PID file. Removing it.");
  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  process.exit(1);
}

// Check if the process is still running
let running = false;
try {
  process.kill(pid, 0);
  running = true;
} catch (err) {
  if (err.code === "EPERM") {
    running = true; // process exists but we lack permission to signal — still report it
  }
}

if (!running) {
  console.log(`Daemon process (PID ${pid}) is not running. Cleaning up PID file.`);
  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  process.exit(0);
}

try {
  process.kill(pid, "SIGTERM");
  try { unlinkSync(PID_FILE); } catch { /* ignore */ }
  console.log(`✓ Daemon stopped (PID ${pid}).`);
} catch (err) {
  console.error(`Failed to stop daemon (PID ${pid}): ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
