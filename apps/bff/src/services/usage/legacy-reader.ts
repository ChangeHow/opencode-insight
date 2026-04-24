import fs from "node:fs";
import path from "node:path";
import type { RawMessage } from "./types";
import { parseAssistantMessage } from "./sqlite-reader";

export function readLegacyMessages(legacyDir: string, window?: { startMs: number; endMs: number }) {
  if (!fs.existsSync(legacyDir)) {
    return [] as RawMessage[];
  }

  return fs
    .readdirSync(legacyDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      try {
        const raw = fs.readFileSync(path.join(legacyDir, file), "utf8");
        const legacyId = file.replace(/\.json$/, "");
        return parseAssistantMessage(JSON.parse(raw), legacyId, {
          id: legacyId,
          title: legacyId,
          slug: "",
          directory: legacyDir,
        });
      } catch {
        return null;
      }
    })
    .filter((item): item is RawMessage => item !== null)
    .filter(
      (item) => !window || (item.timestampMs >= window.startMs && item.timestampMs < window.endMs),
    );
}
