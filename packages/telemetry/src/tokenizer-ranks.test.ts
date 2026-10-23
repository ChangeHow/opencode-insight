import { describe, expect, test } from "vitest";
import cl100kRanks from "js-tiktoken/ranks/cl100k_base";
import { buildTokenRanks } from "./tokenizer-ranks";

function referenceRanks(definition: string): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const line of definition.split("\n")) {
    if (!line) continue;
    const fields = line.split(" ");
    const offset = Number.parseInt(fields[1], 10);
    for (let i = 2; i < fields.length; i++) {
      ranks.set(atob(fields[i]), offset + (i - 2));
    }
  }
  return ranks;
}

describe("compact token ranks", () => {
  test("matches the complete native vocabulary and prefix/unknown lookups", () => {
    const reference = referenceRanks(cl100kRanks.bpe_ranks);
    const ranks = buildTokenRanks(cl100kRanks.bpe_ranks);
    expect(ranks.size).toBe(reference.size);
    let longest = "";
    for (const [key, rank] of reference) {
      expect(ranks.get(key)).toBe(rank);
      expect(ranks.has(key)).toBe(true);
      const prefix = key.slice(0, -1);
      expect(ranks.get(prefix)).toBe(reference.get(prefix));
      expect(ranks.has(prefix)).toBe(reference.has(prefix));
      if (key.length > longest.length) longest = key;
    }
    for (const key of ["", longest + "\0", "\u0100", longest + "\u00ff"]) {
      expect(reference.has(key)).toBe(false);
      expect(ranks.get(key)).toBeUndefined();
      expect(ranks.has(key)).toBe(false);
    }
  });

  test("compares colliding keys in full and lets later duplicates win", () => {
    // a/i/q/y share the low three FNV hash bits (eight slots here).
    const definition = "ignored 10 YQ== aQ== cQ==\n\nignored 42 YQ==";
    const ranks = buildTokenRanks(definition);
    expect(ranks.size).toBe(3);
    expect(ranks.get("a")).toBe(42);
    expect(ranks.get("i")).toBe(11);
    expect(ranks.get("q")).toBe(12);
    expect(ranks.get("y")).toBeUndefined();
    expect(ranks.has("y")).toBe(false);
    expect(ranks.get("aa")).toBeUndefined();
    expect(ranks.has("aa")).toBe(false);
  });
});
