import { lazy, Suspense } from "react";
import type { ComponentType, LazyExoticComponent, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

type BrandIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Brand icons ship as a separate async chunk so the ~250KB icon runtime never
// blocks the first paint. Each module shares one runtime chunk, so rendering
// many icons costs a single fetch.
const lazyBrandIcons: Record<string, LazyExoticComponent<BrandIconComponent>> = {
  anthropic: lazy(() => import("@lobehub/icons/es/Anthropic")),
  chatglm: lazy(() => import("@lobehub/icons/es/ChatGLM")),
  codex: lazy(() => import("@lobehub/icons/es/Codex")),
  githubcopilot: lazy(() => import("@lobehub/icons/es/GithubCopilot")),
  moonshot: lazy(() => import("@lobehub/icons/es/Moonshot")),
  openai: lazy(() => import("@lobehub/icons/es/OpenAI")),
  opencode: lazy(() => import("@lobehub/icons/es/OpenCode")),
  xai: lazy(() => import("@lobehub/icons/es/XAI")),
  zai: lazy(() => import("@lobehub/icons/es/ZAI")),
  zenmux: lazy(() => import("@lobehub/icons/es/ZenMux")),
  zhipu: lazy(() => import("@lobehub/icons/es/Zhipu")),
};

export type BrandIconName = keyof typeof lazyBrandIcons;

export function isBrandIconName(value: string): value is BrandIconName {
  return value in lazyBrandIcons;
}

export function BrandIcon({
  name,
  className,
  fallback,
}: {
  name: BrandIconName;
  className?: string;
  fallback?: ReactNode;
}) {
  const Icon = lazyBrandIcons[name];

  return (
    <Suspense
      fallback={fallback ?? <span className={cn("inline-block", className)} aria-hidden="true" />}
    >
      <Icon className={className} />
    </Suspense>
  );
}
