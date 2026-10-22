import { describe, expect, test } from "vitest";
import {
  estimateTokens,
  MAX_TOKENIZER_TEXT,
  type RequestInsight,
} from "@opencode-insight/telemetry";
import { StreamCounter, type Channel } from "./stream";

// Original full-prefix implementation: an independent per-event behavior oracle.
class FullPrefixCounter {
  private streams = new Map<string, { text: string; tokens: number }>();
  private size = 0;

  delta(request: RequestInsight, key: string, channel: Channel, text: string, now: number): void {
    const previous = this.streams.get(key) ?? { text: "", tokens: 0 };
    if (this.size + text.length > MAX_TOKENIZER_TEXT || this.streams.size >= 256) {
      request.capture = "partial";
      return;
    }
    this.size += text.length;
    const combined = previous.text + text;
    const tokens = estimateTokens(combined);
    let diff = tokens - previous.tokens;
    this.streams.set(key, { text: combined, tokens });
    request.firstDeltaAt ??= now;
    const at = Math.floor(now / 1000) * 1000;
    let bucket = request.buckets.at(-1);
    if (!bucket || bucket.at !== at) {
      bucket = { at, output: 0, reasoning: 0, summary: 0 };
      request.buckets.push(bucket);
    }
    if (diff >= 0) bucket[channel] += diff;
    else {
      // A newly completed BPE merge can reduce the cumulative token count.
      for (let i = request.buckets.length - 1; i >= 0 && diff < 0; i--) {
        const removed = Math.min(request.buckets[i][channel], -diff);
        request.buckets[i][channel] -= removed;
        diff += removed;
      }
    }
    if (request.buckets.length > 7200) {
      request.buckets.shift();
      request.capture = "partial";
    }
  }
}

function request(): RequestInsight {
  return {
    id: "r1",
    model: "openai/gpt-5",
    startedAt: 0,
    status: "running",
    reasoningMode: "unknown",
    buckets: [],
    context: [],
    capture: "live",
  };
}

function comparison() {
  const actual = request();
  const expected = request();
  const counter = new StreamCounter();
  const reference = new FullPrefixCounter();
  let events = 0;
  return {
    actual,
    counter,
    delta(key: string, channel: Channel, text: string, now: number) {
      counter.delta(actual, key, channel, text, now);
      reference.delta(expected, key, channel, text, now);
      expect(actual, `event ${++events}: ${key}, length ${text.length}`).toEqual(expected);
    },
  };
}

describe("stream prefix retention", () => {
  test("matches every event for long interleaved output, reasoning, summary and tool arguments", () => {
    const run = comparison();
    const streams: Array<[string, Channel, string]> = [
      [
        "text:0",
        "output",
        "Here is the implementation.\n```ts\nexport const result = items.map(item => item.id);\n```\n你好 👍\n".repeat(
          180,
        ),
      ],
      [
        "reasoning:0",
        "reasoning",
        "I need to inspect the existing API, preserve timestamps, then verify each streamed change.\n".repeat(
          180,
        ),
      ],
      [
        "tool:edit",
        "output",
        JSON.stringify({
          path: "src/report.ts",
          content: 'const label = "你好 👨‍👩‍👧‍👦";\n// <|endoftext|>\n'.repeat(350),
        }),
      ],
      [
        "summary:0",
        "summary",
        "Checked API boundaries; now applying the focused change. ".repeat(100),
      ],
    ];
    expect(streams.reduce((sum, [, , text]) => sum + text.length, 0)).toBeLessThan(
      MAX_TOKENIZER_TEXT,
    );
    const offsets = streams.map(() => 0);
    const sizes = [1, 2, 7, 31, 127, 509, 3, 64];
    let event = 0;
    while (streams.some(([, , text], i) => offsets[i] < text.length)) {
      for (let i = 0; i < streams.length; i++) {
        const [key, channel, text] = streams[i];
        if (offsets[i] >= text.length) continue;
        const chunk = text.slice(offsets[i], offsets[i] + sizes[event % sizes.length]);
        offsets[i] += chunk.length;
        run.delta(key, channel, chunk, 123 + event++ * 237);
      }
    }
    expect(run.actual.capture).toBe("live");
    // Verify the optimization itself, not only equivalent token counts.
    const retained = (
      run.counter as unknown as {
        streams: Map<string, { text: string; length: number; tokens: number }>;
      }
    ).streams;
    for (const [key, , text] of streams) {
      expect(retained.get(key)).toMatchObject({
        text: text.slice(0, 2048),
        length: text.length,
        tokens: estimateTokens(text),
      });
    }
  });

  test("preserves UTF-16 splits before, at and after the sample boundary", () => {
    for (const prefixLength of [2045, 2046, 2047, 2048, 2049]) {
      for (const suffix of ["👍", "\ud800\udc00", "\ud800x\udfff", "你好<|endoftext|>"]) {
        const run = comparison();
        run.delta("text", "output", "x".repeat(prefixLength), 0);
        for (let i = 0; i < suffix.length; i++) {
          run.delta("text", "output", suffix[i], 1000 + i * 1000);
          run.delta("args", "output", i % 2 ? "\udc00" : "\ud800", 1500 + i * 1000);
        }
        run.delta("text", "output", " tail".repeat(500), 9000);
        run.delta("text", "output", "", 10000);
      }
    }
  });

  test("applies negative BPE corrections across buckets and channels", () => {
    expect(estimateTokens("funct")).toBeGreaterThan(estimateTokens("function"));
    const run = comparison();
    run.delta("text", "output", "funct", 0);
    run.delta("reasoning", "reasoning", "funct", 1000);
    run.delta("args", "output", "funct", 2000);
    run.delta("summary", "summary", "funct", 3000);
    run.delta("text", "output", "ion", 4000);
    run.delta("reasoning", "reasoning", "ion", 5000);
    run.delta("args", "output", "ion", 6000);
    run.delta("summary", "summary", "ion", 7000);
    expect(run.actual.buckets[6].output).toBe(0);
    expect(run.actual.buckets[2].output).toBe(0);
  });

  test("keeps the shared accepted-length cap, rejection and empty-delta policies", () => {
    const run = comparison();
    run.delta("text", "output", "", 0);
    run.delta("text", "output", "hello world ".repeat(2000), 1000);
    run.delta("args", "output", "x".repeat(MAX_TOKENIZER_TEXT - 24000 + 1), 2000);
    expect(run.actual.capture).toBe("partial");
    run.delta("args", "output", "x".repeat(MAX_TOKENIZER_TEXT - 24000), 3000);
    run.delta("text", "output", "x", 4000);
    run.delta("text", "output", "", 5000);
    run.delta("new-empty-stream", "summary", "", 6000);
    expect(run.actual.buckets.at(-1)?.at).toBe(6000);
  });

  test("rejects all deltas at 256 streams, including updates to existing streams", () => {
    const run = comparison();
    for (let i = 0; i < 256; i++) run.delta(`text:${i}`, "output", "", i * 1000);
    expect(run.actual.capture).toBe("live");
    const before = structuredClone(run.actual.buckets);
    run.delta("text:0", "output", "hello", 256000);
    run.delta("text:256", "reasoning", "", 257000);
    expect(run.actual.capture).toBe("partial");
    expect(run.actual.buckets).toEqual(before);
  });

  test("preserves 7200-bucket retention and corrections after eviction", () => {
    const run = comparison();
    run.delta("text", "output", "funct", 0);
    for (let i = 1; i <= 7200; i++) run.delta("text", "output", "", i * 1000);
    expect(run.actual.capture).toBe("partial");
    expect(run.actual.buckets).toHaveLength(7200);
    expect(run.actual.buckets[0].at).toBe(1000);
    run.delta("text", "output", "ion", 7201000);
    expect(run.actual.buckets.every((bucket) => bucket.output === 0)).toBe(true);
  }, 30000);
});
