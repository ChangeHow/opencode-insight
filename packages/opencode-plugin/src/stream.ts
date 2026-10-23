import {
  estimateTokens,
  MAX_TOKENIZER_TEXT,
  type RequestInsight,
} from "@opencode-insight/telemetry";

export type Channel = "output" | "reasoning" | "summary";

/** Prefix retokenization preserves BPE merges across arbitrary transport chunks. */
export class StreamCounter {
  private streams = new Map<
    string,
    { text: string; length: number; sampleTokens: number; tokens: number }
  >();
  private size = 0;

  delta(request: RequestInsight, key: string, channel: Channel, text: string, now: number): void {
    const previous = this.streams.get(key) ?? {
      text: "",
      length: 0,
      sampleTokens: 0,
      tokens: 0,
    };
    if (this.size + text.length > MAX_TOKENIZER_TEXT || this.streams.size >= 256) {
      request.capture = "partial";
      return;
    }
    this.size += text.length;
    // Match estimateTokens' UTF-16 sample, including a trailing split surrogate.
    // Once full, the sample never changes; only its original accepted length grows.
    const combined = previous.text + text.slice(0, 2048 - previous.text.length);
    const length = previous.length + text.length;
    const sampleTokens =
      previous.text.length === 2048 ? previous.sampleTokens : estimateTokens(combined);
    const tokens = combined.length ? Math.round(sampleTokens * (length / combined.length)) : 0;
    let diff = tokens - previous.tokens;
    this.streams.set(key, { text: combined, length, sampleTokens, tokens });
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
