import { useSessionInsight } from "@/lib/use-session-insight";
import { SessionInsightPanel } from "./session-insight-panel";

export function LiveSessionInsight({ sessionId }: { sessionId: string }) {
  const { data, loading, error, retry } = useSessionInsight(sessionId);
  return (
    <SessionInsightPanel
      sessionId={sessionId}
      data={data}
      loading={loading}
      error={error}
      onRetry={retry}
    />
  );
}
