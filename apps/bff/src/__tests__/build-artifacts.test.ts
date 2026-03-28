import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "../..");
const distDir = path.join(packageRoot, "dist");
const distPricingPath = path.join(distDir, "pricing.js");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

describe("Build artifacts", () => {
  test("keeps tests out of dist and loads the built pricing module", async () => {
    fs.rmSync(distDir, { recursive: true, force: true });

    execFileSync(pnpmCommand, ["exec", "tsc", "-p", "tsconfig.json"], {
      cwd: packageRoot,
      stdio: "pipe",
    });

    expect(fs.existsSync(path.join(distDir, "__tests__"))).toBe(false);
    expect(fs.existsSync(distPricingPath)).toBe(true);

    const pricingModule = await import(`${pathToFileURL(distPricingPath).href}?t=${Date.now()}`);

    expect(typeof pricingModule.estimateUsageCostFromDataset).toBe("function");
    expect(() => pricingModule.invalidatePricingCache()).not.toThrow();
  });
});
