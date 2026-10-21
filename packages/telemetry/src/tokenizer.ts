import { Tiktoken } from "js-tiktoken/lite";
import ranks from "js-tiktoken/ranks/cl100k_base";

let encoder: Tiktoken | undefined;
export const MAX_TOKENIZER_TEXT = 65536;

/** Large inputs are sampled so one observation cannot monopolize the event loop. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  encoder ??= new Tiktoken(ranks);
  // BPE on a single long repeated word is superlinear; bound the encoder input,
  // independently of the larger streaming-retention limit.
  const sample = text.slice(0, 2048);
  return Math.round(encoder.encode(sample, [], []).length * (text.length / sample.length));
}
