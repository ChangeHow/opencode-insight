const KNOWN_PROVIDER_PREFIXES = new Set([
  "anthropic",
  "azure",
  "azure_ai",
  "bedrock",
  "deepinfra",
  "fireworks",
  "fireworks_ai",
  "github_copilot",
  "github-copilot",
  "google",
  "groq",
  "gmi",
  "hyperbolic",
  "minimax",
  "moonshot",
  "moonshotai",
  "novita",
  "openai",
  "opencode",
  "opencode_go",
  "openrouter",
  "together",
  "together_ai",
  "vertex",
  "vertex_ai",
  "vercel_ai_gateway",
  "wandb",
  "x_ai",
  "xai",
  "z_ai",
  "zai",
]);

const MODEL_NAME_ALIASES: Record<string, string> = {
  "big pickle": "GLM-4.7",
  "big-pickle": "GLM-4.7",
  bigpickle: "GLM-4.7",
  "glm-5.1": "GLM-5",
  "k2-p5": "Kimi K2.5",
  k2p5: "Kimi K2.5",
  k2p6: "Kimi K2.6",
  "kimi-for-coding": "Kimi K2.5",
  "kimi-k2-0711-preview": "Kimi K2",
  "kimi-k2-0905-preview": "Kimi K2.5",
  "kimi-k2-instruct-0905": "Kimi K2.5",
  "kimi-k2-thinking": "Kimi K2 Thinking",
  "kimi-k2-thinking-251104": "Kimi K2 Thinking",
  "kimi-k2-thinking-turbo": "Kimi K2 Thinking Turbo",
  "kimi-k2-turbo-preview": "Kimi K2 Turbo",
  "kimi-k2.5": "Kimi K2.5",
  "kimi-k2.5-thinking": "Kimi K2 Thinking",
  "kimi-k2.5-nvfp4": "Kimi K2.5",
  "kimi-latest": "Kimi Latest",
  "kimi-latest-128k": "Kimi Latest 128K",
  "kimi-latest-32k": "Kimi Latest 32K",
  "kimi-latest-8k": "Kimi Latest 8K",
  "kimi-thinking-preview": "Kimi Thinking",
  "moonshot-v1-auto": "Moonshot v1 Auto",
};

function canonicalizeProviderSegment(segment: string) {
  const normalized = segment.trim().replace(/\/$/, "").toLowerCase().replaceAll("-", "_");

  switch (normalized) {
    case "x_ai":
      return "xai";
    case "z_ai":
    case "zai_coding_plan":
    case "bigmodel":
      return "zai";
    case "kimi_for_coding":
    case "moonshot":
      return "moonshotai";
    default:
      return normalized;
  }
}

function providerHints(providerId?: string) {
  if (!providerId) {
    return [];
  }

  return providerId
    .trim()
    .replace(/\/$/, "")
    .split("/")
    .flatMap((segment) => {
      const direct = canonicalizeProviderSegment(segment);
      const dotted = segment.includes(".")
        ? segment.split(".").map((value) => canonicalizeProviderSegment(value))
        : [];
      return [direct, ...dotted];
    })
    .filter(
      (value, index, array): value is string => Boolean(value) && array.indexOf(value) === index,
    );
}

function stripProviderPrefix(modelId: string, providerId?: string) {
  let candidate = modelId.trim();

  if (!candidate) {
    return candidate;
  }

  const bySlash = candidate.split("/").at(-1);
  if (bySlash) {
    candidate = bySlash;
  }

  const prefixes = new Set([...KNOWN_PROVIDER_PREFIXES, ...providerHints(providerId)]);
  const segments = candidate.split(".");

  while (segments.length > 1) {
    const current = canonicalizeProviderSegment(segments[0] ?? "");
    if (!current || !prefixes.has(current)) {
      break;
    }
    segments.shift();
  }

  return segments.join(".");
}

function stripReleaseSuffix(tokens: string[]): string[] {
  if (
    tokens.length >= 3 &&
    tokens.at(-3)?.match(/^\d{4}$/) &&
    tokens.at(-2)?.match(/^\d{2}$/) &&
    tokens.at(-1)?.match(/^\d{2}$/)
  ) {
    return tokens.slice(0, -3);
  }

  if (tokens.at(-1)?.match(/^\d{8}$/)) {
    return tokens.slice(0, -1);
  }

  if (
    tokens.length >= 2 &&
    tokens.at(-1)?.toLowerCase() === "preview" &&
    tokens.at(-2)?.match(/^\d{4}$/)
  ) {
    return tokens.slice(0, -2).concat("preview");
  }

  return tokens;
}

function mergeVersionTokens(tokens: string[]): string[] {
  const merged: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index] ?? "";
    const next = tokens[index + 1] ?? "";

    if (current.match(/^\d+$/) && next.match(/^\d+$/) && current.length <= 2 && next.length <= 2) {
      merged.push(`${current}.${next}`);
      index += 1;
      continue;
    }

    merged.push(current);
  }

  return merged;
}

function formatWord(token: string): string {
  const lower = token.toLowerCase();

  if (lower === "gpt") return "GPT";
  if (lower === "glm") return "GLM";
  if (lower === "kimi") return "Kimi";
  if (lower === "qwen") return "Qwen";
  if (lower === "claude") return "Claude";
  if (lower === "moonshot") return "Moonshot";
  if (lower === "xai") return "xAI";
  if (lower.match(/^v\d+$/)) return lower;
  if (lower.match(/^\d+k$/)) return lower.toUpperCase();
  if (lower.includes(".")) {
    return lower
      .split(".")
      .map((part) => formatWord(part))
      .join(".");
  }

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatGenericModelName(modelId: string): string {
  const tokens = mergeVersionTokens(stripReleaseSuffix(modelId.split(/[-_]/).filter(Boolean)));
  return tokens.map((token) => formatWord(token)).join(" ");
}

function formatClaudeModelName(modelId: string): string {
  const tokens = mergeVersionTokens(
    stripReleaseSuffix(
      modelId
        .replace(/^claude-?/i, "")
        .split(/[-_]/)
        .filter(Boolean),
    ),
  );

  if (tokens.length === 0) {
    return "Claude";
  }

  if (tokens[0]?.match(/^\d+(?:\.\d+)?$/)) {
    const [version, ...rest] = tokens;
    return ["Claude", version, ...rest.map((token) => formatWord(token))].join(" ");
  }

  if (tokens[1]?.match(/^\d+(?:\.\d+)?$/)) {
    const [family, version, ...rest] = tokens;
    return [
      "Claude",
      formatWord(family ?? ""),
      version,
      ...rest.map((token) => formatWord(token)),
    ].join(" ");
  }

  return `Claude ${tokens.map((token) => formatWord(token)).join(" ")}`;
}

function formatGptModelName(modelId: string): string {
  const tokens = mergeVersionTokens(
    stripReleaseSuffix(
      modelId
        .replace(/^gpt-?/i, "")
        .split(/[-_]/)
        .filter(Boolean),
    ),
  );

  if (tokens.length === 0) {
    return "GPT";
  }

  const [version, ...rest] = tokens;
  return [`GPT-${version}`, ...rest.map((token) => formatWord(token))].join(" ");
}

export function getModelDisplayName(modelId: string, providerId?: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) {
    return modelId;
  }

  const stripped = stripProviderPrefix(trimmed, providerId);
  const normalized = stripped.toLowerCase();

  const alias = MODEL_NAME_ALIASES[normalized];
  if (alias !== undefined) {
    return alias;
  }

  if (normalized.startsWith("claude-")) {
    return formatClaudeModelName(stripped);
  }

  if (normalized.startsWith("gpt-")) {
    return formatGptModelName(stripped);
  }

  return formatGenericModelName(stripped);
}
