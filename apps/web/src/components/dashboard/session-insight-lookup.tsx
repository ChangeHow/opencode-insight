import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SessionInsightLookup({ onSelect }: { onSelect: (sessionId: string) => void }) {
  const [sessionId, setSessionId] = useState("");
  const valid = /^ses_[A-Za-z0-9]+$/.test(sessionId.trim()) && sessionId.trim().length <= 128;
  return (
    <form
      className="flex min-w-0 flex-col gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--panel)] p-4 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSelect(sessionId.trim());
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-medium">
        Inspect an OpenCode V2 session
        <input
          aria-label="OpenCode V2 session ID"
          value={sessionId}
          onChange={(event) => setSessionId(event.target.value)}
          placeholder="ses_…"
          maxLength={128}
          required
          pattern="ses_[A-Za-z0-9]+"
          className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs"
        />
        <span className="text-xs font-normal text-[var(--muted-foreground)]">
          Context, tool timing and TPS from the capture plugin; no legacy usage record required.
        </span>
      </label>
      <Button type="submit" disabled={!valid}>
        View insight
      </Button>
    </form>
  );
}
