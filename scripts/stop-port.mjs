import { execFileSync } from "node:child_process";

const [, , portArg, labelArg] = process.argv;
const port = Number(portArg);
const label = labelArg ?? "service";

if (!Number.isInteger(port) || port <= 0) {
  console.error(`Invalid port: ${portArg ?? ""}`);
  process.exit(1);
}

function getListenerPids(targetPort) {
  try {
    const output = execFileSync("lsof", ["-nP", "-tiTCP:" + String(targetPort), "-sTCP:LISTEN"], {
      encoding: "utf8",
    }).trim();

    if (!output) {
      return [];
    }

    return output
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getCommand(pid) {
  try {
    return execFileSync("ps", ["-o", "command=", "-p", pid], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

const pids = getListenerPids(port);

if (pids.length === 0) {
  console.log(`No ${label} process is listening on port ${port}.`);
  process.exit(0);
}

for (const pid of pids) {
  const command = getCommand(pid);
  try {
    process.kill(Number(pid), "SIGTERM");
    console.log(`Stopped ${label} listener on port ${port}: PID ${pid}${command ? ` (${command})` : ""}.`);
  } catch (error) {
    console.error(`Failed to stop PID ${pid}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
