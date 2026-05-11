import type { Highlighter } from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then(({ createHighlighter }) =>
      createHighlighter({
        themes: ["github-dark", "github-light"],
        langs: [
          "typescript",
          "javascript",
          "tsx",
          "jsx",
          "bash",
          "shell",
          "json",
          "markdown",
          "html",
          "css",
          "python",
          "sql",
        ],
      }),
    );
  }
  return highlighterPromise;
}

export async function highlight(
  code: string,
  lang: string,
  theme: "github-dark" | "github-light",
): Promise<string> {
  const hl = await getHighlighter();
  const supportedLangs = hl.getLoadedLanguages();
  const safeLang = supportedLangs.includes(lang as never) ? lang : "text";
  return hl.codeToHtml(code, { lang: safeLang, theme });
}
