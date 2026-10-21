import cl100kRanks from "js-tiktoken/ranks/cl100k_base";

/**
 * Encode-only cl100k_base BPE token counter.
 *
 * Semantically equivalent to `new Tiktoken(cl100kRanks).encode(text, [], []).length`
 * from js-tiktoken@1.0.21, but built for counting only:
 * - No rank->bytes decoder table (`textMap`); decoding is never needed to count.
 * - Rank keys are the token's bytes as chars U+0000..U+00FF instead of
 *   comma-joined decimal strings (~2.7x shorter, bijective on bytes 0..255).
 * - Special tokens are never recognized. With `allowedSpecial=[]` and
 *   `disallowedSpecial=[]` the upstream special-token scan can neither emit a
 *   special token nor throw; its only observable effect is chunking the input,
 *   and since it always ends with `nextSpecial == null` the whole text is
 *   encoded as ordinary text. Skipping it is output-neutral.
 * - Only token counts are produced; no token arrays are retained.
 *
 * The ranks module shape (`TiktokenBPE`) is js-tiktoken's public contract.
 */

/** Byte-string key for `bytes[start, end)`. Chunked to stay well under arg limits. */
function byteKey(bytes: Uint8Array, start: number, end: number): string {
  let key = "";
  for (let i = start; i < end; i += 4096) {
    key += String.fromCharCode(...bytes.subarray(i, Math.min(i + 4096, end)));
  }
  return key;
}

function buildRankMap(): Map<string, number> {
  const map = new Map<string, number>();
  // Line format: `<ignored> <rank-offset> <base64-token>...`, same parse as
  // js-tiktoken (later duplicates win).
  for (const line of cl100kRanks.bpe_ranks.split("\n")) {
    if (!line) continue;
    const fields = line.split(" ");
    const offset = Number.parseInt(fields[1], 10);
    for (let i = 2; i < fields.length; i++) {
      map.set(atob(fields[i]), offset + (i - 2));
    }
  }
  return map;
}

function bytePairCount(piece: Uint8Array, ranks: Map<string, number>): number {
  const n = piece.length;
  const starts = new Int32Array(n);
  const ends = new Int32Array(n);
  // pairRank[i] is the rank of piece[starts[i], ends[i + 1]) or -1 when absent,
  // mirroring upstream's null-rank skip. Recomputed only for pairs whose
  // neighborhood changed, which cannot affect merge selection: identical ranks,
  // minimum rank with leftmost tie-break (strict <), same as upstream.
  const pairRank = new Int32Array(n - 1);
  const rankOf = (start: number, end: number): number => {
    const rank = ranks.get(byteKey(piece, start, end));
    return rank === undefined ? -1 : rank;
  };
  for (let i = 0; i < n; i++) {
    starts[i] = i;
    ends[i] = i + 1;
  }
  for (let i = 0; i < n - 1; i++) pairRank[i] = rankOf(i, i + 2);
  let parts = n;
  while (parts > 1) {
    let best = -1;
    let bestRank = 0x7fffffff;
    for (let i = 0; i < parts - 1; i++) {
      const rank = pairRank[i];
      if (rank >= 0 && rank < bestRank) {
        best = i;
        bestRank = rank;
      }
    }
    if (best < 0) break;
    ends[best] = ends[best + 1];
    for (let i = best + 1; i < parts - 1; i++) {
      starts[i] = starts[i + 1];
      ends[i] = ends[i + 1];
      pairRank[i] = pairRank[i + 1];
    }
    parts--;
    if (best > 0) pairRank[best - 1] = rankOf(starts[best - 1], ends[best]);
    if (best < parts - 1) pairRank[best] = rankOf(starts[best], ends[best + 1]);
  }
  // Upstream filters out parts whose final rank lookup is undefined.
  let tokens = 0;
  for (let i = 0; i < parts; i++) {
    if (rankOf(starts[i], ends[i]) >= 0) tokens++;
  }
  return tokens;
}

let rankMap: Map<string, number> | undefined;
let pattern: RegExp | undefined;
const textEncoder = new TextEncoder();

/** Count cl100k_base tokens in `text`; special-token-looking text stays ordinary. */
export function countCl100kTokens(text: string): number {
  rankMap ??= buildRankMap();
  pattern ??= new RegExp(cl100kRanks.pat_str, "ug");
  let count = 0;
  // matchAll clones the regex per call, so caching `pattern` is stateless.
  for (const match of text.matchAll(pattern)) {
    const piece = textEncoder.encode(match[0]);
    if (piece.length === 1) {
      // Upstream returns the (always-present) single-byte rank unprefiltered;
      // every byte 0..255 is a cl100k_base token, so this is exactly one token.
      count += 1;
    } else if (rankMap.has(byteKey(piece, 0, piece.length))) {
      count += 1;
    } else {
      count += bytePairCount(piece, rankMap);
    }
  }
  return count;
}
