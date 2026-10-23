import type { Plugin } from "@opencode/plugin";
import {
  sessionSchema,
  type ContextSource,
  type InsightSeries,
  type RequestInsight,
  type SessionInsight,
} from "@opencode-insight/telemetry";
import { StreamCounter, type Channel } from "./stream";
import { storageBorrow } from "./storage-borrow";

const idleMilliseconds = 5000;

export class Collector {
  private sessions = new Map<string, SessionInsight>();
  private counters = new Map<string, StreamCounter>();
  private pendingContext = new Map<string, { sources: ContextSource[]; partial: boolean }>();
  private dirty = new Set<string>();
  private persisted = new WeakSet<SessionInsight>();
  private activity = new WeakMap<SessionInsight, number>();
  private idleRevisions = new Map<string, number>();
  private tail: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private writeError?: unknown;
  private prefix: string;

  constructor(
    private storage: Plugin.Context["storage"],
    readonly directory: string,
    workspaceID?: string,
  ) {
    this.prefix = `insight/v1/${encodeURIComponent(JSON.stringify([directory, workspaceID]))}/`;
  }

  serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation);
    // Keep ordering and failure recovery, but not the last operation's response.
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  unchanged(sessionID: string, after: number | undefined): InsightSeries | undefined {
    const revision = this.idleRevisions.get(sessionID);
    if (revision !== undefined && revision === after)
      return { revision, unchanged: true, points: [] };
  }

  private scheduleIdle(milliseconds = idleMilliseconds): void {
    if (this.idleTimer) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      void this.serialize(() => this.evictIdle()).catch((error: unknown) => {
        this.writeError = error;
      });
    }, milliseconds);
    this.idleTimer.unref?.();
  }

  private async evictIdle(): Promise<void> {
    await this.flush();
    let next = Infinity;
    for (const session of this.sessions.values()) {
      if (
        !this.persisted.has(session) ||
        this.pendingContext.has(session.sessionID) ||
        session.requests.some((request) => request.status === "running") ||
        session.tools.some((tool) => tool.status === "running")
      )
        continue;
      const remaining = idleMilliseconds - (Date.now() - this.activity.get(session)!);
      if (remaining > 0) {
        next = Math.min(next, remaining);
        continue;
      }
      this.sessions.delete(session.sessionID);
      // Empty sessions still need history seeding on their next query.
      if (session.requests.length) {
        this.idleRevisions.set(session.sessionID, session.revision);
        if (this.idleRevisions.size > 64)
          this.idleRevisions.delete(this.idleRevisions.keys().next().value!);
      }
    }
    if (Number.isFinite(next)) this.scheduleIdle(next);
  }

  async session(sessionID: string, parentID?: string): Promise<SessionInsight> {
    const existing = this.sessions.get(sessionID);
    if (existing) return existing;
    if (this.sessions.size >= 64) {
      const victim = [...this.sessions.values()].find(
        (s) =>
          !s.requests.some((r) => r.status === "running") &&
          !s.tools.some((t) => t.status === "running"),
      );
      if (!victim) throw new Error("Telemetry session capacity reached");
      await this.flush();
      this.sessions.delete(victim.sessionID);
      this.pendingContext.delete(victim.sessionID);
    }
    const stored = await this.storage.get(this.prefix + sessionID);
    const parsed = sessionSchema.safeParse(stored);
    if (
      stored !== undefined &&
      (!parsed.success ||
        parsed.data.directory !== this.directory ||
        parsed.data.sessionID !== sessionID)
    ) {
      throw new Error("Stored telemetry is invalid or belongs to another location");
    }
    const session: SessionInsight =
      parsed.success &&
      parsed.data.directory === this.directory &&
      parsed.data.sessionID === sessionID
        ? parsed.data
        : {
            version: 1,
            sessionID,
            parentID,
            directory: this.directory,
            updatedAt: Date.now(),
            revision: 0,
            requests: [],
            tools: [],
            interruptedCapture: true,
          };
    let interrupted = false;
    for (const request of session.requests) {
      if (request.status !== "running") continue;
      request.status = "interrupted";
      request.endedAt = session.updatedAt;
      request.capture = "partial";
      interrupted = true;
    }
    for (const tool of session.tools) {
      if (tool.status !== "running") continue;
      tool.status = "interrupted";
      tool.endedAt = session.updatedAt;
      interrupted = true;
    }
    if (interrupted) {
      session.interruptedCapture = true;
      this.touch(session, session.updatedAt);
    }
    this.sessions.set(sessionID, session);
    this.idleRevisions.delete(sessionID);
    if (parsed.success) this.persisted.add(session);
    this.activity.set(session, Date.now());
    this.scheduleIdle();
    return session;
  }

  touch(session: SessionInsight, now: number): void {
    session.updatedAt = Math.max(session.updatedAt, now);
    session.revision++;
    this.activity.set(session, Date.now());
    this.scheduleIdle();
    this.dirty.add(session.sessionID);
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.serialize(() => this.flush()).catch((error: unknown) => {
          this.writeError = error;
        });
      }, 1000);
    }
  }

  context(session: SessionInsight, sources: ContextSource[], partial = false): void {
    this.activity.set(session, Date.now());
    this.scheduleIdle();
    const request = session.requests.at(-1);
    if (!request || request.status !== "running" || request.context.length) {
      this.pendingContext.set(session.sessionID, {
        sources: sources.slice(0, 2048),
        partial: partial || sources.length > 2048,
      });
      return;
    }
    request.context = sources.slice(0, 2048);
    if (partial || sources.length > 2048) request.capture = "partial";
    this.touch(session, Date.now());
  }

  start(session: SessionInsight, id: string, model: string, now: number): RequestInsight {
    const existing = session.requests.find((r) => r.id === id);
    if (existing) return existing;
    const request: RequestInsight = {
      id,
      model,
      startedAt: now,
      status: "running",
      reasoningMode: "unknown",
      buckets: [],
      context: [],
      capture: "live",
    };
    const pending = this.pendingContext.get(session.sessionID);
    if (pending) {
      request.context = pending.sources;
      if (pending.partial) request.capture = "partial";
      this.pendingContext.delete(session.sessionID);
    }
    session.requests.push(request);
    if (session.requests.length > 512) {
      const removed = session.requests.shift()!;
      this.counters.delete(`${session.sessionID}:${removed.id}`);
      session.interruptedCapture = true;
    }
    this.touch(session, now);
    return request;
  }

  delta(
    session: SessionInsight,
    request: RequestInsight,
    key: string,
    channel: Channel,
    text: string,
    now: number,
  ): void {
    const id = `${session.sessionID}:${request.id}`;
    let counter = this.counters.get(id);
    if (!counter) {
      if (this.counters.size >= 256) {
        request.capture = "partial";
        this.touch(session, now);
        return;
      }
      counter = new StreamCounter();
      this.counters.set(id, counter);
    }
    counter.delta(request, key, channel, text, now);
    this.touch(session, now);
  }

  release(session: SessionInsight, request: RequestInsight): void {
    this.counters.delete(`${session.sessionID}:${request.id}`);
  }

  async flush(): Promise<void> {
    for (const id of [...this.dirty]) {
      const session = this.sessions.get(id);
      if (!session) continue;
      await this.storage.set(this.prefix + id, storageBorrow(session));
      this.dirty.delete(id);
      this.persisted.add(session);
    }
    this.writeError = undefined;
  }

  assertHealthy(): void {
    if (this.writeError)
      throw new Error("Telemetry persistence failed", { cause: this.writeError });
  }

  async close(now?: number): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    await this.serialize(async () => {
      for (const session of this.sessions.values()) {
        const end = now ?? session.updatedAt;
        let changed = false;
        for (const request of session.requests) {
          if (request.status !== "running") continue;
          request.status = "interrupted";
          request.endedAt = end;
          request.capture = "partial";
          changed = true;
        }
        for (const tool of session.tools) {
          if (tool.status !== "running") continue;
          tool.status = "interrupted";
          tool.endedAt = end;
          changed = true;
        }
        if (changed) {
          session.interruptedCapture = true;
          this.touch(session, end);
        }
      }
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      if (this.idleTimer) clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
      await this.flush();
      this.counters.clear();
      // Reconnect reuses this collector, but no idle timer remains after close.
      // Keep only state that cannot yet be recovered exactly from storage.
      for (const session of this.sessions.values()) {
        if (this.persisted.has(session) && !this.pendingContext.has(session.sessionID))
          this.sessions.delete(session.sessionID);
      }
    });
  }
}
