function canonicalizeProviderSegment(segment: string) {
  const normalized = segment.trim().replace(/\/$/, "").toLowerCase().replaceAll("-", "_");

  switch (normalized) {
    case "":
    case "unknown":
      return undefined;
    case "x_ai":
    case "xai":
      return "xai";
    case "z_ai":
    case "zai":
    case "zai_coding_plan":
    case "bigmodel":
      return "zai";
    case "moonshot":
    case "moonshotai":
      return "moonshotai";
    case "meta":
    case "meta_llama":
      return "meta_llama";
    case "azure":
    case "azure_ai":
      return "azure_ai";
    case "vertex":
    case "vertex_ai":
      return "vertex_ai";
    case "together":
    case "together_ai":
      return "together_ai";
    case "fireworks":
    case "fireworks_ai":
      return "fireworks_ai";
    case "google":
    case "gemini":
      return "google";
    case "openai":
    case "openai_codex":
      return "openai";
    case "mistral":
    case "mistralai":
      return "mistralai";
    default:
      if ([...normalized].some((character) => /\d/.test(character))) {
        return undefined;
      }
      return normalized || undefined;
  }
}

export function providerTags(raw?: string | null) {
  if (!raw) {
    return [] as string[];
  }

  const tags: string[] = [];
  const push = (segment: string) => {
    const tag = canonicalizeProviderSegment(segment);
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  };

  for (const segment of raw.trim().replace(/\/$/, "").split("/")) {
    push(segment);
    if (segment.includes(".")) {
      for (const dotted of segment.split(".")) {
        push(dotted);
      }
    }
  }

  return tags;
}

export function keyProviderTags(datasetKey: string) {
  const keyParts = datasetKey.split("/");
  if (keyParts.length < 2) {
    return [] as string[];
  }

  const tags: string[] = [];
  const push = (value: string) => {
    for (const tag of providerTags(value)) {
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
  };

  for (const segment of keyParts.slice(0, -1)) {
    push(segment);
  }

  for (const dotted of keyParts.at(-1)!.split(".")) {
    push(dotted);
  }

  return tags;
}

export function primaryProviderTag(datasetKey: string) {
  const [firstSegment] = datasetKey.split("/");
  return providerTags(firstSegment)[0];
}

export function matchesProviderHint(datasetKey: string, providerId?: string) {
  const hints = providerTags(providerId);
  if (hints.length === 0) {
    return false;
  }

  const tags = keyProviderTags(datasetKey);
  return tags.some((tag) => hints.includes(tag));
}
