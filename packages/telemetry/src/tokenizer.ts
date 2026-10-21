import { countCl100kTokens } from "./tokenizer-bpe";

export const MAX_TOKENIZER_TEXT = 65536;

/** Large inputs are sampled so one observation cannot monopolize the event loop. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // BPE on a single long repeated word is superlinear; bound the encoder input,
  // independently of the larger streaming-retention limit. The rank table is
  // built lazily on the first call.
  const sample = text.slice(0, 2048);
  return Math.round(countCl100kTokens(sample) * (text.length / sample.length));
}
