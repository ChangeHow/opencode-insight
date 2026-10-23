export function replayContext() {
  const persisted = new Map();
  const hooks = new Map();
  let handlers;
  let history = [];
  let take;
  const queue = [];
  const timers = new Map();
  let time = 1_700_000_000_000;
  let timerID = 0;
  const clock = {
    now: () => time,
    setTimeout(callback, milliseconds) {
      const id = ++timerID;
      timers.set(id, { at: time + milliseconds, callback });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    async advance(milliseconds) {
      time += milliseconds;
      for (const [id, timer] of timers) {
        if (timer.at <= time) {
          timers.delete(id);
          timer.callback();
        }
      }
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
  };
  const dispose = async () => {};
  const context = {
    location: { directory: "/insight-memory/project", workspaceID: undefined },
    storage: {
      get: async (key) => structuredClone(persisted.get(key)),
      set: async (key, value) => {
        persisted.set(key, structuredClone(value));
      },
      remove: async (key) => {
        persisted.delete(key);
      },
    },
    session: {
      get: async ({ sessionID }) => {
        if (sessionID === "missing") throw new Error("Session not found");
        return {
          id: sessionID,
          location: {
            directory: sessionID === "foreign" ? "/another/project" : context.location.directory,
          },
        };
      },
      context: async () => structuredClone(history),
      hook: async (name, callback) => {
        hooks.set(name, callback);
        return { dispose };
      },
    },
    tool: {
      hook: async (name, callback) => {
        hooks.set(name, callback);
        return { dispose };
      },
      transform: async (transform) => {
        transform({ list: () => [], update() {} });
        return { dispose };
      },
    },
    rpc: {
      register: async (_definition, methods) => {
        handlers = methods;
        return { dispose };
      },
    },
    event: {
      async *subscribe({ signal }) {
        signal.addEventListener("abort", () => take?.(), { once: true });
        while (!signal.aborted) {
          if (!queue.length)
            await new Promise((resolve) => {
              take = resolve;
            });
          take = undefined;
          const item = queue.shift();
          if (!item) continue;
          try {
            yield item.event;
          } finally {
            item.resolve();
          }
        }
      },
    },
  };
  return {
    context,
    clock,
    hooks,
    persisted,
    setHistory(value) {
      history = value;
    },
    get handlers() {
      return handlers;
    },
    event(type, data, extra = {}) {
      return new Promise((resolve) => {
        queue.push({
          event: {
            id: `event-${time}-${queue.length}`,
            type,
            created: time,
            location: context.location,
            data,
            ...extra,
          },
          resolve,
        });
        take?.();
      });
    },
  };
}
