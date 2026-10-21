import type { HostClient, GuestRequestResult } from "@openchamber/sdk";
import { sessionSchema, seriesSchema } from "@opencode-insight/telemetry/schema";
import type { SessionInsight, InsightSeries } from "@opencode-insight/telemetry/schema";

export interface PanelState {
  sessionID: string | null;
  directory: string | null;
  session?: SessionInsight;
  series?: InsightSeries;
  loading: boolean;
  error?: string;
}

export function parseResponse(response: GuestRequestResult): unknown {
  let data: unknown;
  try {
    data = JSON.parse(response.body);
  } catch {
    throw new Error("The local service returned invalid JSON.");
  }
  if (response.status !== 200) {
    const message = data && typeof data === "object" && "error" in data ? data.error : null;
    throw new Error(typeof message === "string" ? message : "Local telemetry is unavailable.");
  }
  return data;
}

type PanelHost = Pick<HostClient, "onSession" | "onDirectory" | "serviceRequest">;

export function createPanelController(host: PanelHost, change: (state: PanelState) => void) {
  let state: PanelState = { sessionID: null, directory: null, loading: false };
  let generation = 0;
  let disposed = false;
  let busy = false;
  let intersecting = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const visible = () => !document.hidden && intersecting && !disposed;
  const emit = () => change({ ...state });
  const stopTimer = () => clearTimeout(timer);

  async function refresh() {
    stopTimer();
    if (busy || !visible() || !state.sessionID || !state.directory) return;
    busy = true;
    const version = generation;
    const { sessionID, directory } = state;
    if (!state.session) {
      state = { ...state, loading: true };
      emit();
    }
    const body = { sessionID, directory };
    const previousSession = state.session;
    const readSession = () =>
      host
        .serviceRequest({ method: "POST", path: "/session", body: JSON.stringify(body) })
        .then(parseResponse)
        .then((data) => sessionSchema.parse(data));
    const readSeries = host
      .serviceRequest({
        method: "POST",
        path: "/series",
        body: JSON.stringify({
          ...body,
          bucketMs: 1000,
          windowMs: 5000,
          after: state.series?.revision,
        }),
      })
      .then(parseResponse)
      .then((data) => seriesSchema.parse(data));
    const readSnapshot = previousSession
      ? readSeries.then(
          (series) =>
            series.revision === previousSession.revision ? previousSession : readSession(),
          () => readSession(),
        )
      : readSession();
    const results = await Promise.allSettled([readSnapshot, readSeries]);
    busy = false;
    if (!visible()) return;
    if (version !== generation) {
      void refresh();
      return;
    }
    const [session, series] = results;
    const previousRevision = state.session?.revision;
    const previousError = state.error;
    const errors: string[] = [];
    if (session.status === "fulfilled") {
      if (session.value.sessionID === sessionID && session.value.directory === directory) {
        state.session = session.value;
      } else errors.push("The local service returned a different session location.");
    } else
      errors.push(
        session.reason instanceof Error ? session.reason.message : "Session unavailable.",
      );
    if (series.status === "fulfilled") {
      if (!series.value.unchanged || !state.series) state.series = series.value;
    } else
      errors.push(
        series.reason instanceof Error ? series.reason.message : "Speed capture unavailable.",
      );
    state = { ...state, loading: false, error: errors.length ? errors.join(" ") : undefined };
    if (
      previousRevision !== state.session?.revision ||
      previousError !== state.error ||
      series.status !== "fulfilled" ||
      !series.value.unchanged
    )
      emit();
    timer = setTimeout(() => void refresh(), 1000);
  }

  function target(sessionID: string | null, directory: string | null) {
    if (sessionID === state.sessionID && directory === state.directory) return;
    generation++;
    stopTimer();
    state = { sessionID, directory, loading: Boolean(sessionID && directory) };
    emit();
    void refresh();
  }
  const subscriptions = [
    host.onSession((session) => target(session?.id ?? null, state.directory)),
    host.onDirectory((directory) => target(state.sessionID, directory)),
  ];
  const visibility = () => {
    generation++;
    stopTimer();
    if (visible()) void refresh();
  };
  document.addEventListener("visibilitychange", visibility);
  const observer =
    typeof IntersectionObserver === "undefined"
      ? undefined
      : new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting === intersecting) return;
          intersecting = entry.isIntersecting;
          visibility();
        });
  observer?.observe(document.documentElement);
  emit();
  return {
    retry: () => void refresh(),
    dispose() {
      disposed = true;
      generation++;
      stopTimer();
      subscriptions.forEach((unsubscribe) => unsubscribe());
      document.removeEventListener("visibilitychange", visibility);
      observer?.disconnect();
    },
  };
}
