#!/usr/bin/env node
// scripts/upgrade.mjs — OTA upgrade: git pull → install → build → restart daemon.
// Usage: node scripts/upgrade.mjs
// Run via: pnpm upgrade:app

import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;
const STOP_DAEMON = path.join(ROOT, "scripts", "stop-daemon.mjs");
const DAEMON = path.join(ROOT, "scripts", "daemon.mjs");

function run(label, cmd, args, options = {}) {
  console.log(`\n→ ${label}`);
  console.log(`  $ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...options });
}

// Detect the package manager (pnpm preferred)
function findPm() {
  const execPath = process.env.npm_execpath ?? "";
  if (execPath.includes("pnpm")) {
    return { cmd: NODE, args: [execPath] };
  }
  // Try pnpm from PATH
  try {
    execSync("pnpm --version", { stdio: "pipe" });
    return { cmd: "pnpm", args: [] };
  } catch {
    // Fall back to npm
    return { cmd: path.join(path.dirname(NODE), "npm"), args: [] };
  }
}

const pm = findPm();

try {
  // 1. Pull latest code
  run("Pulling latest code", "git", ["pull"]);

  // 2. Install / update dependencies
  run("Installing dependencies", pm.cmd, [...pm.args, "install"]);

  // 3. Build all packages
  run("Building", pm.cmd, [...pm.args, "run", "build"]);

  // 4. Stop the running daemon (if any)
  console.log("\n→ Stopping existing daemon");
  try {
    execFileSync(NODE, [STOP_DAEMON], { stdio: "inherit", cwd: ROOT });
  } catch {
    // It's fine if there's no daemon running
  }

  // 5. Start the new daemon
  run("Starting updated daemon", NODE, [DAEMON]);
} catch (err) {
  console.error("\n❌ Upgrade failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}
