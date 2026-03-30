#!/usr/bin/env node

import { Command } from "commander";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { box } from "@clack/prompts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PID_FILE = path.join(ROOT, ".telescope-daemon.pid");
const LOG_DIR = path.join(ROOT, "logs");
const BFF_ENTRY = path.join(ROOT, "apps", "bff", "src", "index.ts");
const WEB_DIST = path.join(ROOT, "apps", "web", "dist");
const LOG_FILE = path.join(LOG_DIR, "bff.log");
const ERR_FILE = path.join(LOG_DIR, "bff-error.log");

function readPid() {
  if (!existsSync(PID_FILE)) return null;
  const raw = readFileSync(PID_FILE, "utf8").trim();
  const pid = parseInt(raw, 10);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return pid;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function removePidFile() {
  try {
    unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
}

function startCommand({ port: portOpt, host: hostOpt }) {
  if (!existsSync(path.join(WEB_DIST, "index.html"))) {
    console.error("Web app is not built. Run 'pnpm build' first.");
    process.exit(1);
  }

  const existingPid = readPid();
  if (existingPid !== null && isAlive(existingPid)) {
    console.error(`Daemon is already running (PID: ${existingPid}). Run 'opendash stop' first.`);
    process.exit(1);
  }
  removePidFile();

  const port = Number(portOpt ?? process.env.PORT ?? 8787);
  const host = hostOpt ?? process.env.HOST ?? "127.0.0.1";

  const env = {
    ...process.env,
    PORT: String(port),
    HOST: host,
    WEB_DIST_DIR: WEB_DIST,
    NODE_ENV: "production",
    DAEMON_MODE: "1",
  };

  mkdirSync(LOG_DIR, { recursive: true });

  const outFd = openSync(LOG_FILE, "a");
  const errFd = openSync(ERR_FILE, "a");

  const child = spawn("bun", ["run", BFF_ENTRY], {
    detached: true,
    stdio: ["ignore", outFd, errFd],
    env,
    cwd: ROOT,
  });

  child.unref();

  const pid = child.pid;
  writeFileSync(PID_FILE, String(pid), "utf8");

  setTimeout(() => {
    if (!isAlive(pid)) {
      removePidFile();
      console.error("Daemon process exited immediately. Check error log:");
      console.error("   " + ERR_FILE);
      process.exit(1);
    }

    const displayHost = host === "0.0.0.0" ? "localhost" : host;
    const url = `http://${displayHost}:${port}`;

    box(
      [
        `Status : Running`,
        `PID    : ${pid}`,
        `Port   : ${port}`,
        `Host   : ${host}`,
        `Access : ${url}`,
        `Runtime: bun`,
        `Log    : logs/bff.log`,
        `Errors : logs/bff-error.log`,
      ].join("\n"),
      "opencode-telescope daemon",
    );

    console.log("Dashboard is running in the background.");
    console.log(`  Open in your browser: ${url}`);
    console.log(`  To stop: opendash stop`);
    console.log(`  To view logs: opendash logs`);
    console.log("");
  }, 1200);
}

function stopCommand() {
  const pid = readPid();

  if (pid === null) {
    console.log("No daemon is running (PID file not found).");
    removePidFile();
    return;
  }

  if (!isAlive(pid)) {
    console.log(`Daemon process (PID ${pid}) is not running. Cleaning up PID file.`);
    removePidFile();
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
    removePidFile();
    box([`Status : Stopped`, `PID    : ${pid}`].join("\n"), "opencode-telescope daemon");
  } catch (err) {
    console.error(
      `Failed to stop daemon (PID ${pid}): ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  }
}

function statusCommand() {
  const pid = readPid();

  if (pid === null) {
    box(`Status : Not running\nPID    : -`, "opencode-telescope daemon");
    return;
  }

  if (!isAlive(pid)) {
    box(`Status : Stopped (stale PID)\nPID    : ${pid}`, "opencode-telescope daemon");
    removePidFile();
    return;
  }

  const port = process.env.PORT ?? 8787;
  const host = process.env.HOST ?? "127.0.0.1";
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  const url = `http://${displayHost}:${port}`;

  box(
    [
      `Status : Running`,
      `PID    : ${pid}`,
      `Access : ${url}`,
      `Log    : logs/bff.log`,
      `Errors : logs/bff-error.log`,
    ].join("\n"),
    "opencode-telescope daemon",
  );
}

function logsCommand() {
  if (!existsSync(LOG_FILE)) {
    console.log("No log file found. Start the daemon first: opendash start");
    return;
  }

  const tail = spawn("tail", ["-f", LOG_FILE], {
    stdio: "inherit",
  });

  tail.on("error", (err) => {
    console.error(`Failed to tail logs: ${err.message}`);
    process.exit(1);
  });

  process.on("SIGINT", () => {
    tail.kill();
    process.exit(0);
  });
}

const program = new Command();

program
  .name("opendash")
  .description("Manage the opencode-telescope dashboard daemon")
  .version("0.1.0");

program
  .command("start")
  .description("Start the dashboard daemon in the background")
  .option("--port <port>", "Port to listen on", process.env.PORT ?? "8787")
  .option("--host <host>", "Host to bind to", process.env.HOST ?? "127.0.0.1")
  .action(startCommand);

program.command("stop").description("Stop the running dashboard daemon").action(stopCommand);

program.command("status").description("Show the daemon running status").action(statusCommand);

program.command("logs").description("Stream daemon logs (tail -f)").action(logsCommand);

program.parse();
