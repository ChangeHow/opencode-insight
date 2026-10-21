import type { ZodType } from "zod";

function omitUndefined(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
    else omitUndefined(record[key]);
  }
}

/** Schema parsing creates the detached copy; omit absent JSON fields without a second copy. */
export function snapshot<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.parse(value);
  omitUndefined(result);
  return result;
}
