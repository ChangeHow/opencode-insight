import type { HostClient, GuestRequestResult } from "@openchamber/sdk";
import {
  overviewSchema,
  speedWindowSchema,
  toolPageSchema,
} from "@opencode-insight/telemetry/queries";
import type { OverviewResponse, SpeedWindow } from "@opencode-insight/telemetry/queries";
import type { ToolPageReader } from "./trace-data";

export interface PanelState {
  sessionID: string | null;
  directory: string | null;
  overview?: OverviewResponse;
  speed?: SpeedWindow;
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
  let force = false;
  let speedRequested = true;
  let intersecting = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const visible = () => !document.hidden && intersecting && !disposed;
  const emit = () => change({ ...state });
  const stopTimer = () => clearTimeout(timer);

  async function read(path: string, body: object) {
    return parseResponse(
      await host.serviceRequest({ method: "POST", path, body: JSON.stringify(body) }),
    );
  }
  function assertLocation(
    value: { sessionID: string; directory: string },
    sessionID: string,
    directory: string,
  ) {
    if (value.sessionID !== sessionID || value.directory !== directory)
      throw new Error("The local service returned a different session location.");
  }

  async function refresh() {
    stopTimer();
    if (busy || !visible() || !state.sessionID || !state.directory) return;
    busy = true;
    const version = generation;
    const { sessionID, directory } = state;
    if (!state.overview) {
      state = { ...state, loading: true };
      emit();
    }
    const body = { sessionID, directory };
    const previousOverview = state.overview;
    const previousSpeed = state.speed;
    const previousError = state.error;
    const errors: string[] = [];
    let overview = previousOverview;
    let speed = previousSpeed;
    const forced = force;
    force = false;
    try {
      const result = overviewSchema.parse(
        await read("/overview", {
          ...body,
          after: forced ? undefined : previousOverview?.revision,
        }),
      );
      assertLocation(result, sessionID, directory);
      if (!result.unchanged) {
        if (!result.data) throw new Error("The local service returned an incomplete overview.");
        overview = result;
      } else if (!previousOverview?.data)
        throw new Error("The local service returned an incomplete overview.");
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : "Session unavailable.");
    }
    const current = () => visible() && version === generation;
    if (
      current() &&
      (speedRequested ||
        forced ||
        overview !== previousOverview ||
        !speed ||
        (speed.nextAt !== undefined && speed.nextAt <= Date.now()))
    ) {
      speedRequested = false;
      try {
        const result = speedWindowSchema.parse(await read("/speed-window", body));
        assertLocation(result, sessionID, directory);
        speed = result;
      } catch (cause) {
        speedRequested = true;
        errors.push(cause instanceof Error ? cause.message : "Speed capture unavailable.");
      }
    }
    busy = false;
    if (!visible()) return;
    if (version !== generation) {
      void refresh();
      return;
    }
    state = {
      ...state,
      overview,
      speed,
      loading: false,
      error: errors.length ? errors.join(" ") : undefined,
    };
    if (overview !== previousOverview || speed !== previousSpeed || previousError !== state.error)
      emit();
    if (force || (speedRequested && !errors.length)) {
      void refresh();
      return;
    }
    timer = setTimeout(() => void refresh(), 1000);
  }

  function target(sessionID: string | null, directory: string | null) {
    if (sessionID === state.sessionID && directory === state.directory) return;
    generation++;
    stopTimer();
    speedRequested = true;
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
    retry() {
      force = true;
      void refresh();
    },
    requestSpeed() {
      speedRequested = true;
      void refresh();
    },
    loadTools: (async (input) => {
      const { sessionID, directory } = state;
      const version = generation;
      if (!sessionID || !directory || disposed) throw new Error("Session location unavailable.");
      const result = toolPageSchema.parse(
        await read("/tool-page", { ...input, sessionID, directory }),
      );
      if (disposed || version !== generation) throw new Error("Session location changed.");
      assertLocation(result, sessionID, directory);
      if (
        result.group !== input.group ||
        (input.toolID && result.entries.some((tool) => tool.id !== input.toolID))
      )
        throw new Error("The local service returned different tool details.");
      return result;
    }) satisfies ToolPageReader,
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
