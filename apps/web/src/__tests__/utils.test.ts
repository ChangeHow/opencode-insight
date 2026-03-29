import { describe, it, expect } from "vitest";
import { cn } from "../lib/utils";

describe("cn (className utility)", () => {
  it("combines class names into a single string", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("deduplicates conflicting Tailwind classes, keeping the last one", () => {
    expect(cn("p-4", "p-8")).toBe("p-8");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("ignores falsy values (undefined, null, false)", () => {
    expect(cn("foo", undefined, "bar")).toBe("foo bar");
    expect(cn("foo", false && "hidden", "bar")).toBe("foo bar");
  });

  it("returns empty string when no arguments are provided", () => {
    expect(cn()).toBe("");
  });
});
