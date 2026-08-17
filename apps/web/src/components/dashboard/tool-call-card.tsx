import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Copy,
  FilePlus2,
  FileText,
  FolderSearch,
  Globe,
  ListChecks,
  PencilLine,
  Search,
  Terminal,
  Wrench,
  XCircle,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { MessagePartTool } from "@opencode-dashboard/shared";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDuration } from "@/lib/format";

interface ToolCallCardProps {
  part: MessagePartTool;
}

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const TOOL_ICONS: { match: RegExp; icon: IconComponent }[] = [
  { match: /bash|shell|terminal|exec|run/i, icon: Terminal },
  { match: /edit|patch|update|apply/i, icon: PencilLine },
  { match: /write|create|new/i, icon: FilePlus2 },
  { match: /read|view|cat/i, icon: FileText },
  { match: /grep|search|find|ripgrep/i, icon: Search },
  { match: /glob|ls|list_dir|tree/i, icon: FolderSearch },
  { match: /todo|task|plan/i, icon: ListChecks },
  { match: /web|fetch|http|url|curl|browser/i, icon: Globe },
];

function resolveToolIcon(toolName: string): IconComponent {
  return TOOL_ICONS.find(({ match }) => match.test(toolName))?.icon ?? Wrench;
}

// Preferred keys for the one-line summary shown in the collapsed header.
const SUMMARY_KEYS = [
  "file_path",
  "filePath",
  "path",
  "command",
  "cmd",
  "pattern",
  "url",
  "query",
  "prompt",
  "name",
  "description",
];

function buildSummary(part: MessagePartTool): string {
  if (typeof part.input === "string") {
    return part.input.split("\n")[0].trim();
  }
  if (part.input && typeof part.input === "object") {
    const record = part.input as Record<string, unknown>;
    for (const key of SUMMARY_KEYS) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value.split("\n")[0].trim();
      }
    }
    for (const value of Object.values(record)) {
      if (typeof value === "string" && value.trim()) {
        return value.split("\n")[0].trim();
      }
    }
  }
  return "";
}

function formatTimestamp(ms: number) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--interactive-hover)] hover:text-[var(--foreground)]"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <Copy className="size-3" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function ToolCallCard({ part }: ToolCallCardProps) {
  const [open, setOpen] = useState(false);

  const Icon = resolveToolIcon(part.toolName);
  const summary = buildSummary(part);
  const inputStr =
    part.input === null || part.input === undefined
      ? ""
      : typeof part.input === "string"
        ? part.input
        : JSON.stringify(part.input, null, 2);
  const durationMs = Math.max(0, part.time.end - part.time.start);
  const duration = part.time.end > part.time.start ? formatDuration(durationMs) : null;
  const errored = part.status === "error";

  const facts: [string, string][] = [
    ["Tool", part.toolName],
    ["Call ID", part.callId],
    ["Status", part.status],
    ["Started", formatTimestamp(part.time.start)],
    ["Finished", part.time.end ? formatTimestamp(part.time.end) : "-"],
    ["Duration", duration ?? "-"],
  ];

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-status={part.status}
      className="group rounded-[10px] border border-[var(--border)] bg-[var(--panel)] transition-colors hover:border-[var(--ring)]/40"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left hover:bg-[var(--interactive-hover)]">
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-[var(--muted-foreground)]" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-[var(--muted-foreground)]" />
        )}
        {part.status === "completed" ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-[var(--metric-green)]" />
        ) : part.status === "error" ? (
          <XCircle className="size-3.5 shrink-0 text-[var(--danger)]" />
        ) : (
          <CircleDashed className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
        )}
        <span className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-[var(--accent-soft)]">
          <Icon className="size-3.5 text-[var(--accent)]" />
        </span>
        <span
          className="min-w-0 max-w-[45%] shrink truncate font-mono text-xs font-semibold text-[var(--foreground)] sm:max-w-[55%]"
          title={part.title ?? part.toolName}
        >
          {part.title ?? part.toolName}
        </span>
        <span className="mx-1 hidden h-4 w-px shrink-0 bg-[var(--border)] sm:block" />
        <span className="min-w-0 flex-1 self-center">
          {summary ? (
            <span className="block truncate font-mono text-xs text-[var(--muted-foreground)]">
              {summary}
            </span>
          ) : null}
        </span>
        {errored ? (
          <span className="shrink-0 rounded-[6px] bg-[var(--danger-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--danger)]">
            failed
          </span>
        ) : null}
        {duration ? (
          <span className="shrink-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-[var(--muted-foreground)]">
            {duration}
          </span>
        ) : null}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="min-w-0 space-y-3 border-t border-[var(--border)] p-3">
          <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-1.5 rounded-[8px] bg-[var(--panel-strong)] px-3 py-2.5 font-mono text-[11px] sm:grid-cols-3">
            {facts.map(([key, value]) => (
              <div key={key} className="flex min-w-0 flex-col">
                <dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  {key}
                </dt>
                <dd className="min-w-0 truncate text-[var(--foreground)]" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {inputStr ? (
            <section className="min-w-0">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  Input
                </p>
                <CopyButton value={inputStr} label="input" />
              </div>
              <pre className="ui-collapsible-panel mt-0 min-w-0 font-mono text-xs leading-5 text-[var(--foreground)]">
                {inputStr}
              </pre>
            </section>
          ) : null}
          {part.output ? (
            <section className="min-w-0">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  Output
                </p>
                <CopyButton value={part.output} label="output" />
              </div>
              <pre className="ui-collapsible-panel mt-0 max-h-80 min-w-0 font-mono text-xs leading-5 text-[var(--foreground)]">
                {part.output}
              </pre>
            </section>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
