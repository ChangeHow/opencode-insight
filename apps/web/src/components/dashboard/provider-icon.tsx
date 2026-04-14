import { Bot } from "lucide-react";
import Anthropic from "@lobehub/icons/es/Anthropic";
import ChatGLM from "@lobehub/icons/es/ChatGLM";
import GithubCopilot from "@lobehub/icons/es/GithubCopilot";
import Moonshot from "@lobehub/icons/es/Moonshot";
import OpenAI from "@lobehub/icons/es/OpenAI";
import XAI from "@lobehub/icons/es/XAI";
import ZAI from "@lobehub/icons/es/ZAI";
import Zhipu from "@lobehub/icons/es/Zhipu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function resolveProviderIcon(providerId: string) {
  const value = providerId.toLowerCase();

  if (value.includes("github-copilot") || value.includes("copilot")) return GithubCopilot;
  if (value.includes("openai")) return OpenAI;
  if (value.includes("zhipu")) return Zhipu;
  if (value.includes("chatglm") || value.includes("glm")) return ChatGLM;
  if (value.includes("xai") || value.includes("grok")) return XAI;
  if (value.includes("zai")) return ZAI;
  if (value.includes("moonshot") || value.includes("kimi")) return Moonshot;
  if (value.includes("anthropic") || value.includes("claude")) return Anthropic;

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
