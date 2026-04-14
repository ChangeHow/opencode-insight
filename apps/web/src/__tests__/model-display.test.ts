import { describe, expect, test } from "vitest";
import { getModelDisplayName } from "../lib/model-display";

describe("getModelDisplayName", () => {
  test("formats Claude model ids into readable names", () => {
    expect(getModelDisplayName("claude-3-5-sonnet-20241022")).toBe("Claude 3.5 Sonnet");
    expect(getModelDisplayName("claude-sonnet-4-5")).toBe("Claude Sonnet 4.5");
  });

  test("maps Moonshot and Kimi model ids using aliases and provider hints", () => {
    expect(getModelDisplayName("moonshot/kimi-k2-0905-preview")).toBe("Kimi K2.5");
    expect(getModelDisplayName("moonshotai.kimi-k2.5", "moonshotai")).toBe("Kimi K2.5");
    expect(getModelDisplayName("moonshot-v1-8k", "moonshotai")).toBe("Moonshot v1 8K");
    expect(getModelDisplayName("k2p5", "kimi-for-coding")).toBe("Kimi K2.5");
    expect(getModelDisplayName("k2-p5", "kimi-for-coding")).toBe("Kimi K2.5");
  });

  test("formats GPT model ids into readable names", () => {
    expect(getModelDisplayName("gpt-4.1-mini-2025-04-14")).toBe("GPT-4.1 Mini");
  });
});
