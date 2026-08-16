import { Bot } from "lucide-react";
import { BrandIcon, isBrandIconName, type BrandIconName } from "@/components/dashboard/brand-icons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Registry of supported provider icons. Keys are already normalized (lowercased,
// non-alphanumeric stripped) so a new provider whose id naturally matches one of
// these keys as a substring works without any code change. Adding a brand-new
// provider icon only requires one entry here and in brand-icons.tsx.
const PROVIDER_ICONS: string[] = [
  "anthropic",
  "chatglm",
  "githubcopilot",
  "moonshot",
  "openai",
  "opencode",
  "xai",
  "zai",
  "zenmux",
  "zhipu",
];

// Aliases map alternative names (brand nicknames / model family names) to the
// canonical key above. Keys here are also normalized.
const PROVIDER_ALIASES: Record<string, string> = {
  claude: "anthropic",
  copilot: "githubcopilot",
  glm: "chatglm",
  grok: "xai",
  kimi: "moonshot",
  moonshotai: "moonshot",
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Pre-sort keys by length (desc) so "githubcopilot" is preferred over "copilot"
// when a provider id matches both. Computed once at module load.
const SORTED_ICON_KEYS = [...PROVIDER_ICONS].toSorted((a, b) => b.length - a.length);
const SORTED_ALIAS_KEYS = Object.keys(PROVIDER_ALIASES).toSorted((a, b) => b.length - a.length);

function resolveProviderIconKey(providerId: string): BrandIconName | null {
  const key = normalize(providerId);
  if (!key) return null;

  const canonical = SORTED_ICON_KEYS.find((name) => key.includes(name));
  if (canonical) return canonical as BrandIconName;

  const alias = SORTED_ALIAS_KEYS.find((name) => key.includes(name));
  if (alias) {
    const target = PROVIDER_ALIASES[alias];
    if (isBrandIconName(target)) return target;
  }

  return null;
}

export function ProviderIcon({
  providerId,
  className,
  withTooltip = false,
}: {
  providerId: string;
  className?: string;
  withTooltip?: boolean;
}) {
  const brandKey = resolveProviderIconKey(providerId);
  const fallbackIcon = (
    <Bot
      className={cn("size-4 shrink-0 text-[var(--muted-foreground)]", className)}
      strokeWidth={1.8}
    />
  );
  const content = brandKey ? (
    <BrandIcon
      name={brandKey}
      className={cn("size-4 shrink-0", className)}
      fallback={fallbackIcon}
    />
  ) : (
    fallbackIcon
  );

  if (!withTooltip) {
    return content;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center" aria-label={providerId}>
            {content}
          </span>
        </TooltipTrigger>
        <TooltipContent>{providerId}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
