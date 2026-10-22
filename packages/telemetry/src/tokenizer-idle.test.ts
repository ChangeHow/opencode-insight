import { describe, expect, test, vi } from "vitest";
import { countCl100kTokens } from "./tokenizer-bpe";

describe("idle tokenizer ownership", () => {
  test("releases its timer after inactivity and produces identical counts on reuse", async () => {
    vi.useFakeTimers();
    try {
      const text = "中文 mixed 👍 <|endoftext|> ".repeat(30);
      const expected = countCl100kTokens(text);
      await vi.advanceTimersByTimeAsync(3000);
      expect(countCl100kTokens(text)).toBe(expected);
      await vi.advanceTimersByTimeAsync(3000);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(vi.getTimerCount()).toBe(0);
      expect(countCl100kTokens(text)).toBe(expected);
      await vi.advanceTimersByTimeAsync(5000);
    } finally {
      vi.useRealTimers();
    }
  });
});
