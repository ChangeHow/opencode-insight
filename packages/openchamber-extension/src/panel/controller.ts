import type { HostClient, GuestRequestResult } from "@openchamber/sdk";
import {
  overviewSchema,
  speedWindowSchema,
  speedScopeSchema,
  toolPageSchema,
} from "@opencode-insight/telemetry/queries";
import type { OverviewResponse, SpeedWindow } from "@opencode-insight/telemetry/queries";
import type { ToolPageReader } from "./trace-data";
import { readSpeedDisplay, writeSpeedDisplay } from "./speed-cache";
import { advanceSpeedDisplay } from "./speed-window";

export interface PanelState {
  sessionID: string | null;
  directory: string | null;
  overview?: OverviewResponse;
  speed?: SpeedWindow;
  speedReceivedAt?: number;
  speedCached?: boolean;
  speedHeight?: number;
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

export function createPanelController(
  host: PanelHost,
  change: (state: PanelState) => void,
  surface: "panel" | "status" = "panel",
  status?: {
    initial: { sessionID: string | null; directory: string | null };
    storage: HostClient["storage"];
  },
) {
  let state: PanelState = status
    ? { ...status.initial, loading: Boolean(status.initial.sessionID && status.initial.directory) }
    : { sessionID: null, directory: null, loading: false };
  let generation = 0;
  let disposed = false;
  let busy = false;
  let force = false;
  let speedRequested = true;
  let readingSpeed = false;
  let intersecting = false;
  let restoring = -1;
  let fresh = -1;
  let source: { version: number; scope: string } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let clock: ReturnType<typeof setInterval> | undefined;
  const pollInterval = surface === "panel" ? 3000 : 1000;
  const visible = () => !disposed && !document.hidden && intersecting;
  const emit = () => {
    if (visible() && state.speed?.generation?.active) {
      // Keep active charts moving even while a network read is delayed.
      clock ??= setInterval(emit, 1000);
    } else {
      clearInterval(clock);
      clock = undefined;
    }
    change({
      ...state,
      speed:
        state.speed && state.speedReceivedAt !== undefined
          ? advanceSpeedDisplay(state.speed, state.speedReceivedAt)
          : state.speed,
    });
  };
  const stopTimer = () => clearTimeout(timer);

  async function read(path: string, body: object) {
    if (!visible()) throw new Error("Insight view is hidden.");
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

  async function restoreSpeed(version: number, sessionID: string, directory: string) {
    if (!status) return;
    try {
      const [identity, cached] = await Promise.all([
        read("/speed-scope", { sessionID, directory }).then((value) => {
          const identity = speedScopeSchema.parse(value);
          assertLocation(identity, sessionID, directory);
          if (visible() && generation === version && fresh !== version) {
            source = { version, scope: identity.scope };
            if (state.speed && state.speed.scope !== identity.scope) {
              state = { sessionID, directory, loading: true };
              emit();
            }
          }
          return identity;
        }),
        readSpeedDisplay(status.storage),
      ]);
      if (!visible() || generation !== version || fresh === version) return;
      if (!cached || state.speed || cached.speed.scope !== identity.scope) return;
      assertLocation(cached.speed, sessionID, directory);
      state = {
        ...state,
        speed: { ...cached.speed, buckets: [] },
        loading: false,
        speedCached: true,
        speedReceivedAt: cached.receivedAt,
        speedHeight: cached.height,
      };
      emit();
    } catch {
      // Missing/older scope RPC or storage failures disable restoration, not live reads.
    }
  }

  async function refresh() {
    stopTimer();
    if (busy || !visible() || !state.sessionID || !state.directory) return;
    busy = true;
    const version = generation;
    const { sessionID, directory } = state;
    if (status && restoring !== version) {
      restoring = version;
      void restoreSpeed(version, sessionID, directory);
    }
    if (!state.overview && !state.speed && !state.loading) {
      state = { ...state, loading: true };
      emit();
    }
    const body = { sessionID, directory };
    const previousOverview = state.overview;
    const previousSpeed = state.speed;
    const previousError = state.error;
    const errors: string[] = [];
    let sourceChanged = false;
    let overview = previousOverview;
    let speed = previousSpeed;
    const forced = force;
    force = false;
    if (surface === "panel") {
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
    }
    const current = () => visible() && version === generation;
    if (
      current() &&
      (surface === "status" ||
        speedRequested ||
        forced ||
        overview !== previousOverview ||
        !speed ||
        (speed.nextAt !== undefined && speed.nextAt <= Date.now()))
    ) {
      speedRequested = false;
      readingSpeed = true;
      try {
        const result = speedWindowSchema.parse(await read("/speed-window", body));
        assertLocation(result, sessionID, directory);
        if (source?.version === version && result.scope !== source.scope) {
          sourceChanged = true;
          throw new Error("Telemetry source changed during refresh. Retry to verify the source.");
        }
        speed = result;
      } catch (cause) {
        speedRequested = true;
        errors.push(cause instanceof Error ? cause.message : "Speed capture unavailable.");
      } finally {
        readingSpeed = false;
      }
    }
    busy = false;
    if (!visible()) return;
    if (version !== generation) {
      void refresh();
      return;
    }
    if (sourceChanged) {
      // Retire both this conflicting response and any still-pending restoration.
      generation++;
      state = { sessionID, directory, loading: false, error: errors.join(" ") };
      emit();
      timer = setTimeout(() => void refresh(), pollInterval);
      return;
    }
    state = {
      ...state,
      overview,
      // An asynchronous restore may have populated state while the live read failed.
      speed: speed !== previousSpeed ? speed : state.speed,
      loading: false,
      error: errors.length ? errors.join(" ") : undefined,
    };
    if (speed && speed !== previousSpeed) {
      fresh = version;
      state = { ...state, speedCached: false, speedReceivedAt: Date.now(), speedHeight: undefined };
    }
    if (overview !== previousOverview || speed !== previousSpeed || previousError !== state.error)
      emit();
    if (force || (speedRequested && !errors.length)) {
      void refresh();
      return;
    }
    timer = setTimeout(() => void refresh(), pollInterval);
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
  let selectedID = state.sessionID;
  let selectedDirectory = state.directory;
  let targetQueued = false;
  const select = () => {
    if (surface !== "status") return target(selectedID, selectedDirectory);
    if (targetQueued) return;
    targetQueued = true;
    queueMicrotask(() => {
      targetQueued = false;
      if (!disposed) target(selectedID, selectedDirectory);
    });
  };
  const subscriptions = [
    host.onSession((session) => {
      selectedID = session?.id ?? null;
      select();
    }),
    host.onDirectory((directory) => {
      selectedDirectory = directory;
      select();
    }),
  ];
  const visibility = () => {
    generation++;
    stopTimer();
    clearInterval(clock);
    clock = undefined;
    if (visible()) {
      emit();
      speedRequested = true;
      void refresh();
    }
  };
  document.addEventListener("visibilitychange", visibility);
  const observer =
    typeof IntersectionObserver === "undefined"
      ? undefined
      : new IntersectionObserver((entries) => {
          // Geometry cannot detect opacity-only hiding. Paint visibility can also
          // reject usable frames under host decorative overlays, so do not gate on it.
          let changed = false;
          for (const entry of entries) {
            if (entry.isIntersecting !== intersecting) changed = true;
            intersecting = entry.isIntersecting;
          }
          if (changed) visibility();
        });
  observer?.observe(document.documentElement);
  if (!observer) {
    intersecting = true;
    visibility();
  }
  emit();
  return {
    saveSpeedHeight(height: number) {
      if (
        !status ||
        !visible() ||
        state.speedCached ||
        !state.speed ||
        state.speedReceivedAt === undefined
      )
        return;
      void writeSpeedDisplay(status.storage, state.speed, state.speedReceivedAt, height);
    },
    retry() {
      if (!visible()) return;
      force = true;
      void refresh();
    },
    requestSpeed() {
      if (!visible() || readingSpeed) return;
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
      if (!visible() || version !== generation) throw new Error("Session location changed.");
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
      clearInterval(clock);
      subscriptions.forEach((unsubscribe) => unsubscribe());
      document.removeEventListener("visibilitychange", visibility);
      observer?.disconnect();
    },
  };
}
