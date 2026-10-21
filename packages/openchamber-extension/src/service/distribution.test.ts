import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseManifest } from "@openchamber/sdk/schemas";
import { describe, expect, test } from "vitest";
import { extensionPath } from "../../../../scripts/opendash-extensions";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

describe("single-package platform distribution", () => {
  test("publishes valid native entrypoints and a version-matched installable panel", async () => {
    const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    const panel = JSON.parse(await readFile(path.join(root, "openchamber/package.json"), "utf8"));
    expect(metadata.name).toBe("@changehow/oc-insight");
    expect(metadata.exports["./opencode"]).toBe("./server.js");
    expect(metadata.exports["./openchamber"]).toBe("./openchamber/index.js");
    expect(panel.version).toBe(metadata.version);
    expect(parseManifest(panel).ok).toBe(true);
    await expect(
      readFile(path.join(root, "openchamber/panel/index.html"), "utf8"),
    ).resolves.toContain("main.js");
    await expect(
      readFile(path.join(root, "openchamber/service/main.js"), "utf8"),
    ).resolves.toContain("127.0.0.1");
  });

  test("CLI returns both install directories without starting any daemon", () => {
    for (const platform of ["opencode", "openchamber"]) {
      expect(
        execFileSync(
          process.execPath,
          [path.join(root, "scripts/opendash.mjs"), "extension-path", platform],
          { encoding: "utf8", cwd: root },
        ).trim(),
      ).toBe(extensionPath(platform, root));
    }
    expect(() => extensionPath("unknown", root)).toThrow("Platform must be");
  });
});
