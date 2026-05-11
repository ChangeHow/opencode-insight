import { lazy, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAtomValue } from "jotai";
import { themeAtom } from "@/lib/atoms";
import { cn } from "@/lib/utils";

const CodeBlock = lazy(() => import("./code-block").then((m) => ({ default: m.CodeBlock })));

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const theme = useAtomValue(themeAtom);
  const resolvedTheme =
    theme === "dark"
      ? "github-dark"
      : theme === "light"
        ? "github-light"
        : typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "github-dark"
          : "github-light";

  const proseClass = cn(
    "prose prose-sm max-w-none break-words text-[var(--foreground)]",
    "prose-p:my-1.5 prose-headings:font-semibold prose-headings:text-[var(--foreground)]",
    "prose-code:rounded prose-code:bg-[var(--panel-strong)] prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:font-mono",
    "prose-pre:p-0 prose-pre:bg-transparent",
    "prose-a:text-blue-500 prose-a:no-underline hover:prose-a:underline",
    "prose-blockquote:border-[var(--border)] prose-blockquote:text-[var(--muted-foreground)]",
    "prose-strong:text-[var(--foreground)] prose-em:text-[var(--foreground)]",
    className,
  );

  return (
    <div className={proseClass}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: cls, children, ...rest }: any) {
            const match = /language-(\w+)/.exec(cls ?? "");
            const lang = match?.[1] ?? "text";
            const code = String(children).replace(/\n$/, "");
            const isBlock = /\n/.test(code) || match;
            if (!isBlock) {
              return (
                <code className={cls} {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <Suspense
                fallback={
                  <pre className="overflow-x-auto rounded-[14px] bg-[var(--panel-strong)] p-4 text-xs">
                    <code>{code}</code>
                  </pre>
                }
              >
                <CodeBlock lang={lang} code={code} shikiTheme={resolvedTheme} />
              </Suspense>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
