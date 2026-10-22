import type { Plugin } from "@opencode/plugin";
import type { SessionInsight } from "@opencode-insight/telemetry";

type StorageValue = Parameters<Plugin.Context["storage"]["set"]>[1];

function omitUndefined(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
    else omitUndefined(record[key]);
  }
}

/** The serialized collector cannot mutate this view until the awaited write settles. */
export function storageBorrow(session: SessionInsight): StorageValue {
  omitUndefined(session);
  return session as SessionInsight & StorageValue;
}
