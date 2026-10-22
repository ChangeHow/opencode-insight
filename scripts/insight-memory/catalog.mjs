import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function freezeCatalog(output, existing) {
  let text;
  if (existing) text = await readFile(existing, "utf8");
  else {
    const response = await fetch("https://models.opencode.ai/api.json", {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(`Cannot freeze public model catalog: HTTP ${response.status}`);
    text = await response.text();
  }
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || !Object.keys(data).length)
    throw new Error("Empty model catalog");
  const file = path.join(output, "catalog.json");
  await writeFile(file, text);
  return {
    file,
    sha256: createHash("sha256").update(text).digest("hex"),
    bytes: Buffer.byteLength(text),
    providers: Object.keys(data).length,
  };
}
