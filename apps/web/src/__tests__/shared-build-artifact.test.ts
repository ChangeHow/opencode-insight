import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

const workspaceRoot = path.resolve(import.meta.dirname, "../../../../");
const sharedDistEntry = path.join(workspaceRoot, "packages/shared/dist/index.js");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

describe("Shared package artifact", () => {
  test("remains importable after build and typecheck", async () => {
    execFileSync(pnpmCommand, ["--filter", "@opencode-dashboard/shared", "build"], {
      cwd: workspaceRoot,
      stdio: "pipe",
    });

    execFileSync(pnpmCommand, ["--filter", "@opencode-dashboard/shared", "typecheck"], {
      cwd: workspaceRoot,
      stdio: "pipe",
    });

    const sharedModule = await import(`${pathToFileURL(sharedDistEntry).href}?t=${Date.now()}`);

    expect(typeof sharedModule.formatDateKey).toBe("function");
    expect(sharedModule.DEFAULT_TIME_ZONE).toBe("UTC");
  });
});
