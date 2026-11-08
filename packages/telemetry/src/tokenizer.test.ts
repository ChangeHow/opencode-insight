import { describe, expect, test } from "vitest";
import { Tiktoken } from "js-tiktoken/lite";
import cl100kRanks from "js-tiktoken/ranks/cl100k_base";
import { estimateTokens } from "./tokenizer";

/**
 * Regression lock for the token-estimation contract:
 * cl100k_base BPE on the first 2048 UTF-16 chars, scaled by total/sample length,
 * special-token-looking text treated as ordinary text.
 *
 * Golden counts below were captured from the js-tiktoken@1.0.21-backed
 * implementation; the pinned-upstream reference keeps them honest if the
 * encoding tables ever change under us.
 */
const reference = new Tiktoken(cl100kRanks);
function referenceEstimate(text: string): number {
  if (!text) return 0;
  const sample = text.slice(0, 2048);
  return Math.round(reference.encode(sample, [], []).length * (text.length / sample.length));
}

const exact = (s: string, n: number): string => {
  if (s.length !== n) throw new Error(`bad fixture length ${s.length} != ${n}`);
  return s;
};

const GOLDEN: Array<[name: string, text: string, tokens: number]> = [
  ["empty", "", 0],
  ["hello", "hello world", 2],
  [
    "prose",
    "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.",
    20,
  ],
  [
    "code",
    "export function estimateTokens(text: string): number {\n  if (!text) return 0;\n  const sample = text.slice(0, 2048);\n  return Math.round(encoder.encode(sample, [], []).length * (text.length / sample.length));\n}",
    52,
  ],
  [
    "json",
    '{"role":"assistant","content":[{"type":"text","text":"你好，世界"},{"type":"tool","name":"edit","args":{"path":"/tmp/a.txt"}}]}',
    37,
  ],
  [
    "chinese",
    "你好吗 world。人工智能模型在处理中文文本时会将每个汉字拆分为一个或多个 token，具体取决于分词器的词表。",
    52,
  ],
  ["cjk-mixed", "混合mixed文本text与English单词words和数字123、456，以及标点！？。", 26],
  ["emoji", "Family: 👨‍👩‍👧‍👦 thumbs: 👍🏽👍🏿 flags: 🇺🇸🇯🇵 hearts: ❤️💫✨ stars: ⭐️ 🌟", 62],
  ["combining", "café naïve résumé Zalgo: Z̴̢̛a̷l̶g̵o̶ ̸t̷e̶x̸t́ͅ", 45],
  ["special-token", "<|endoftext|>", 7],
  [
    "special-embedded",
    "prefix <|fim_prefix|>code here<|fim_suffix|> suffix <|endofprompt|> tail",
    24,
  ],
  ["special-repeat", "<|endoftext|><|endoftext|><|endoftext|>", 19],
  ["special-lookalike", "<|not_a_real_token|> and <|endoftext| partial", 15],
  ["whitespace", "line1\nline2\r\nline3\t\tend\n\n\n   indented", 14],
  ["spaces-run", "a" + " ".repeat(500) + "b", 7],
  ["digits", "1234567890 3.14159265358979323846264338327950288419716939937510582097494459", 28],
  ["contractions", "I'm you're we've they'll he'd it's don't CAN'T WON'T", 18],
  ["url", "https://example.com/path?query=1&x=2#fragment", 15],
  ["path", "/Users/demo/workspace/example-project/packages/telemetry/src/tokenizer.ts", 13],
  ["lone-surrogate", "\ud800", 1],
  ["surrogate-pair", "\ud800\udc00", 4],
  ["nul-bytes", "a\u0000b\u0001c", 5],
  ["repeat-a-5000", "a".repeat(5000), 625],
  ["repeat-thumb-3000", "👍".repeat(3000), 9000],
  ["len-2048-en", exact("abcde".repeat(409) + "abc", 2048), 819],
  ["len-2049-en", exact("abcde".repeat(409) + "abcd", 2049), 819],
  ["len-2048-cjk", exact("你好世界".repeat(512), 2048), 2560],
  ["sample-splits-surrogate", exact("x" + "👍".repeat(1024), 2049), 3072],
  ["len-65536-z", "z".repeat(65536), 32768],
  [
    "long-mixed-sampled",
    "你好吗 world。<|endoftext|> const x = 42; 👨‍👩‍👧‍👦 " + "tail content ".repeat(600),
    1315,
  ],
];

/** Deterministic LCG so randomized corpora never flake. */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomizedCorpus(): string[] {
  const random = makeRandom(20261021);
  const soup = [
    "hello ",
    "world",
    "你好",
    "世界",
    "。",
    "！",
    "👍",
    "👨‍👩‍👧‍👦",
    "<|endoftext|>",
    "<|fim_prefix|>",
    "\n",
    "\r\n",
    "\t",
    "  ",
    "\ud800",
    "\udfff",
    "3.14",
    "0x1F",
    "'",
    "'s",
    "|",
    "\\",
    "{|}",
    "„…",
    "café",
    "🇺🇳",
    "\u2028",
    "\u00a0",
    "a",
    "Z",
    "9",
    "_",
    "-",
    "https://x.y/z?w=1",
    "endoftext",
    "<|",
    "|>",
  ];
  const strings: string[] = [];
  for (let i = 0; i < 400; i++) {
    let text = "";
    const pieces = Math.floor(random() * 60);
    for (let j = 0; j < pieces; j++) {
      text += soup[Math.floor(random() * soup.length)];
    }
    strings.push(text);
  }
  for (let i = 0; i < 30; i++) {
    let text = "";
    const pieces = 1000 + Math.floor(random() * 1000);
    for (let j = 0; j < pieces; j++) {
      text += soup[Math.floor(random() * soup.length)];
    }
    strings.push(text);
  }
  return strings;
}

describe("tokenizer estimate contract", () => {
  test("golden counts match for representative real-user text", () => {
    for (const [name, text, tokens] of GOLDEN) {
      expect(estimateTokens(text), name).toBe(tokens);
    }
  });

  test("matches pinned upstream js-tiktoken on a randomized corpus", () => {
    for (const [i, text] of randomizedCorpus().entries()) {
      expect(estimateTokens(text), `corpus[${i}] len=${text.length}`).toBe(referenceEstimate(text));
    }
  });
});
