import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAtomValue } from "jotai";
import { themeAtom } from "@/lib/atoms";
import { highlight } from "@/lib/shiki";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  lang: string;
  code: string;
  shikiTheme: "github-dark" | "github-light";
}

function CodeBlock({ lang, code, shikiTheme }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    highlight(code, lang, shikiTheme).then((result) => {
      if (!canceled) setHtml(result);
    }).catch(() => {
      if (!canceled) setHtml(null);
    });
    return () => { canceled = true; };
  }, [code, lang, shikiTheme]);

  if (html) {
    return (
      <div
        className="overflow-x-auto rounded-[14px] text-xs [&>pre]:p-4"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <pre className="overflow-x-auto rounded-[14px] bg-[var(--panel-strong)] p-4 text-xs">
      <code>{code}</code>
    </pre>
  );
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const theme = useAtomValue(themeAtom);
  const resolvedTheme =
    theme === "dark" ? "github-dark" : theme === "light" ? "github-light" : (
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "github-dark"
        : "github-light"
    );

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        code({ className: cls, children, ...rest }: any) {
          const match = /language-(\w+)/.exec(cls ?? "");
          const lang = match?.[1] ?? "text";
          const code = String(children).replace(/\n$/, "");
          const isBlock = /\n/.test(code) || match;
          if (!isBlock) {
            return <code className={cls} {...rest}>{children}</code>;
          }
          return <CodeBlock lang={lang} code={code} shikiTheme={resolvedTheme} />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
