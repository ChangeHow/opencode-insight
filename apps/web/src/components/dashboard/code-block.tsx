import { useEffect, useState } from "react";
import { highlight } from "@/lib/shiki";

interface CodeBlockProps {
  lang: string;
  code: string;
  shikiTheme: "github-dark" | "github-light";
}

export function CodeBlock({ lang, code, shikiTheme }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    highlight(code, lang, shikiTheme)
      .then((result) => {
        if (!canceled) setHtml(result);
      })
      .catch(() => {
        if (!canceled) setHtml(null);
      });
    return () => {
      canceled = true;
    };
  }, [code, lang, shikiTheme]);

  if (html) {
    return (
      <div
        className="overflow-x-auto rounded-[14px] text-xs [&>pre]:p-4"
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
