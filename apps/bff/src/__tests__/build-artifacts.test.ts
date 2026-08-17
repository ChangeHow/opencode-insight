import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const distDir = path.join(packageRoot, "dist");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const runtimeEntryPath = path.join(distDir, "index.js");
const fallbackPricingPath = path.join(distDir, "fallback-pricing.json");

describe("Build artifacts", () => {
  test("creates the Node runtime bundle for the published CLI", () => {
    fs.rmSync(distDir, { recursive: true, force: true });

    execFileSync(pnpmCommand, ["build"], {
      cwd: packageRoot,
      stdio: "pipe",
    });

    expect(fs.existsSync(distDir)).toBe(true);
    expect(fs.existsSync(runtimeEntryPath)).toBe(true);
    expect(fs.existsSync(fallbackPricingPath)).toBe(true);
  });
});
