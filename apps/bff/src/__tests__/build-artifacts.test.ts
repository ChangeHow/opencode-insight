import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const distDir = path.join(packageRoot, "dist");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const runtimeEntryPath = path.join(packageRoot, "src", "index.ts");

describe("Build artifacts", () => {
  test("keeps bun runtime build free of dist artifacts", () => {
    fs.rmSync(distDir, { recursive: true, force: true });

    execFileSync(pnpmCommand, ["build"], {
      cwd: packageRoot,
      stdio: "pipe",
    });

    expect(fs.existsSync(distDir)).toBe(false);
    expect(fs.existsSync(runtimeEntryPath)).toBe(true);
  });
});
