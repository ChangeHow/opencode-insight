import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const packageRoot = path.resolve(import.meta.dirname, "../../../..");
const cliPath = path.join(packageRoot, "scripts", "opendash.mjs");
const packageVersion = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
).version;

describe("opendash CLI version", () => {
  test("reports the package version through both version flags", () => {
    for (const flag of ["-v", "--version"]) {
      const version = execFileSync(process.execPath, [cliPath, flag], {
        cwd: packageRoot,
        encoding: "utf8",
      }).trim();

      expect(version).toBe(packageVersion);
    }
  });

  test("documents OPENDASH_ENV in the help output", () => {
    const help = execFileSync(process.execPath, [cliPath, "-h"], {
      cwd: packageRoot,
      encoding: "utf8",
    });

    expect(help).toContain("OPENDASH_ENV=<path>");
    expect(help).toContain("OPENDASH_ENV=.env.local opendash server");
  });
});
