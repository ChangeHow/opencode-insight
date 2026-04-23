import type { ComponentType, SVGProps } from "react";
import { Bot } from "lucide-react";
import Anthropic from "@lobehub/icons/es/Anthropic";
import ChatGLM from "@lobehub/icons/es/ChatGLM";
import GithubCopilot from "@lobehub/icons/es/GithubCopilot";
import Moonshot from "@lobehub/icons/es/Moonshot";
import OpenAI from "@lobehub/icons/es/OpenAI";
import OpenCode from "@lobehub/icons/es/OpenCode";
import XAI from "@lobehub/icons/es/XAI";
import ZAI from "@lobehub/icons/es/ZAI";
import ZenMux from "@lobehub/icons/es/ZenMux";
import Zhipu from "@lobehub/icons/es/Zhipu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Registry of supported provider icons. Keys are already normalized (lowercased,
// non-alphanumeric stripped) so a new provider whose id naturally matches one of
// these keys as a substring works without any code change. Adding a brand-new
// provider icon only requires one import + one line here.
const PROVIDER_ICONS: Record<string, IconComponent> = {
  anthropic: Anthropic,
  chatglm: ChatGLM,
  githubcopilot: GithubCopilot,
  moonshot: Moonshot,
  openai: OpenAI,
  opencode: OpenCode,
  xai: XAI,
  zai: ZAI,
  zenmux: ZenMux,
  zhipu: Zhipu,
};

// Aliases map alternative names (brand nicknames / model family names) to the
// canonical key above. Keys here are also normalized.
const PROVIDER_ALIASES: Record<string, keyof typeof PROVIDER_ICONS> = {
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
const SORTED_ICON_KEYS = Object.keys(PROVIDER_ICONS).sort((a, b) => b.length - a.length);
const SORTED_ALIAS_KEYS = Object.keys(PROVIDER_ALIASES).sort((a, b) => b.length - a.length);

function resolveProviderIcon(providerId: string): IconComponent | null {
  const key = normalize(providerId);
  if (!key) return null;

  const canonical = SORTED_ICON_KEYS.find((name) => key.includes(name));
  if (canonical) return PROVIDER_ICONS[canonical];

  const alias = SORTED_ALIAS_KEYS.find((name) => key.includes(name));
  if (alias) return PROVIDER_ICONS[PROVIDER_ALIASES[alias]];

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
  const Icon = resolveProviderIcon(providerId);
  const content = Icon ? (
    <Icon className={cn("size-4 shrink-0", className)} />
  ) : (
    <Bot className={cn("size-4 text-[var(--muted-foreground)]", className)} strokeWidth={1.8} />
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
