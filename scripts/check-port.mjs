import net from "node:net";
import { execFileSync } from "node:child_process";

const [, , fallbackPortArg, labelArg, portEnvVarArg] = process.argv;
const fallbackPort = Number(fallbackPortArg);
const portEnvVar = portEnvVarArg || "PORT";
const port = Number(process.env[portEnvVar] ?? fallbackPort);
const label = labelArg ?? "service";

if (!Number.isInteger(port) || port <= 0) {
  console.error(`Invalid port: ${process.env[portEnvVar] ?? fallbackPortArg}`);
  process.exit(1);
}

function lookupListener(targetPort) {
  try {
    const pid = execFileSync("lsof", ["-nP", "-tiTCP:" + String(targetPort), "-sTCP:LISTEN"], {
      encoding: "utf8",
    }).trim();

    if (!pid) {
      return null;
    }

    const command = execFileSync("ps", ["-o", "command=", "-p", pid], {
      encoding: "utf8",
    }).trim();

    return {
      pid,
      command,
    };
  } catch {
    return null;
  }
}

function ensurePortAvailable(targetPort) {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();

    tester.once("error", (error) => {
      tester.close();
      reject(error);
    });

    tester.once("listening", () => {
      tester.close(() => resolve());
    });

    tester.listen(targetPort);
  });
}

const existingListener = lookupListener(port);
if (existingListener) {
  const ownerMessage = ` Current listener: PID ${existingListener.pid}${existingListener.command ? ` (${existingListener.command})` : ""}.`;
  console.error(
    `Port ${port} is already in use. Stop the existing process or change ${portEnvVar} before starting the ${label}.${ownerMessage}`,
  );
  process.exit(1);
}

try {
  await ensurePortAvailable(port);
} catch (error) {
  if (error && error.code === "EADDRINUSE") {
    const listener = lookupListener(port);
    const ownerMessage = listener
      ? ` Current listener: PID ${listener.pid}${listener.command ? ` (${listener.command})` : ""}.`
      : "";

    console.error(
      `Port ${port} is already in use. Stop the existing process or change ${portEnvVar} before starting the ${label}.${ownerMessage}`,
    );
    process.exit(1);
  }

  throw error;
}
