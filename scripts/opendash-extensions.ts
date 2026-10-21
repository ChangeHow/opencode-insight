import { existsSync } from "node:fs";
import path from "node:path";
import type { Command } from "commander";

export function extensionPath(platform: string, root: string): string {
  if (platform !== "opencode" && platform !== "openchamber") {
    throw new Error("Platform must be opencode or openchamber.");
  }
  const directory = platform === "opencode" ? path.resolve(root) : path.join(root, "openchamber");
  const entry =
    platform === "opencode" ? path.join(root, "server.js") : path.join(directory, "package.json");
  if (!existsSync(entry))
    throw new Error("Extension artifacts are missing. Run pnpm build:extensions first.");
  return directory;
}

export function registerExtensionCommands(program: Command, root: string): void {
  program
    .command("extension-path <platform>")
    .description(
      "Print the installable OpenCode or OpenChamber extension directory. Does not start any service.",
    )
    .action((platform: string) => {
      try {
        console.log(extensionPath(platform, root));
      } catch (error) {
        console.error(error instanceof Error ? error.message : "Extension path unavailable.");
        process.exitCode = 1;
      }
    });
}
