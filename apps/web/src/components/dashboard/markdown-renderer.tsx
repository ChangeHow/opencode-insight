import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const proseClass = cn("conversation-prose max-w-none break-words", className);

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
              <pre className="overflow-x-auto rounded-[8px] border border-[var(--border)] bg-[var(--background)] p-4 text-xs">
                <code data-language={lang}>{code}</code>
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
