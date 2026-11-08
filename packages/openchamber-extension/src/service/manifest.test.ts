import { readFile } from "node:fs/promises";
import { parseManifest } from "@openchamber/sdk/schemas";
import { describe, expect, test } from "vitest";

describe("OpenChamber extension manifest", () => {
  test("declares host-selected OpenCode access and its bundled capture plugin", async () => {
    const input = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    );
    const result = parseManifest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Invalid extension manifest.");
    expect(result.manifest.contributes.panel.entry).toBe("dist/panel/index.html");
    expect(result.manifest.contributes.statusSection).toEqual({
      entry: "dist/panel/index.html",
      title: "Speed",
      height: 300,
      defaultExpanded: false,
      requiresProject: true,
    });
    expect(result.manifest.contributes.service).toEqual({
      entry: "dist/service/main.js",
      runtime: "host",
      provides: ["opencode"],
    });
    expect(result.manifest.contributes.opencodePlugin).toBe("dist/opencode");
    expect(result.manifest.contributes.page).toBeUndefined();
    expect(result.manifest.contributes.origins).toBeUndefined();
    expect(result.manifest.contributes.integration).toBeUndefined();
  });
});
