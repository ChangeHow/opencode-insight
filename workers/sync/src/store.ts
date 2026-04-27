import type { RemoteUsageRow, UsageSyncPushPayload } from "@opencode-dashboard/shared";

export interface SyncEnv {
  DB: D1Database;
  SYNC_TOKEN: string;
}

export interface UsageQueryRow {
  machine_id: string;
  machine_label: string;
  date: string;
  provider_id: string;
  model_id: string;
  tokens: number;
  priced_tokens: number;
  cost: number;
  messages: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  updated_at: string;
}

function normalizeCount(value: number) {
  return Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
}

function normalizeCost(value: number) {
  return Number((Number.isFinite(value) ? Math.max(0, value) : 0).toFixed(4));
}

export async function replaceUsageDays(db: D1Database, payload: UsageSyncPushPayload) {
  const updatedAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO machines (id, label, last_seen_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET label = excluded.label, last_seen_at = excluded.last_seen_at",
      )
      .bind(payload.machine.id, payload.machine.label, updatedAt),
  ];

  for (const day of payload.days) {
    statements.push(
      db
        .prepare("DELETE FROM usage_daily WHERE machine_id = ? AND date = ?")
        .bind(payload.machine.id, day.date),
    );

    for (const row of day.rows) {
      statements.push(
        db
          .prepare(
            `INSERT INTO usage_daily (
              machine_id, date, provider_id, model_id, tokens, priced_tokens, cost, messages,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            payload.machine.id,
            day.date,
            row.providerId,
            row.modelId,
            normalizeCount(row.tokens),
            normalizeCount(row.pricedTokens),
            normalizeCost(row.cost),
            normalizeCount(row.messages),
            normalizeCount(row.breakdown.input),
            normalizeCount(row.breakdown.output),
            normalizeCount(row.breakdown.cacheRead),
            normalizeCount(row.breakdown.cacheWrite),
            normalizeCount(row.breakdown.reasoning),
            updatedAt,
          ),
      );
    }
  }

  await db.batch(statements);
  return { ok: true, days: payload.days.length };
}

export async function readUsage(db: D1Database) {
  const machinesResult = await db
    .prepare("SELECT id, label FROM machines ORDER BY label COLLATE NOCASE")
    .all<{ id: string; label: string }>();
  const rowsResult = await db
    .prepare(
      `SELECT
        u.machine_id,
        m.label AS machine_label,
        u.date,
        u.provider_id,
        u.model_id,
        u.tokens,
        u.priced_tokens,
        u.cost,
        u.messages,
        u.input_tokens,
        u.output_tokens,
        u.cache_read_tokens,
        u.cache_write_tokens,
        u.reasoning_tokens,
        u.updated_at
      FROM usage_daily u
      JOIN machines m ON m.id = u.machine_id
      ORDER BY u.date DESC, m.label COLLATE NOCASE, u.provider_id, u.model_id`,
    )
    .all<UsageQueryRow>();

  return {
    machines: machinesResult.results,
    rows: rowsResult.results.map(toRemoteUsageRow),
  };
}

function toRemoteUsageRow(row: UsageQueryRow): RemoteUsageRow {
  return {
    machineId: row.machine_id,
    machineLabel: row.machine_label,
    date: row.date,
    providerId: row.provider_id,
    modelId: row.model_id,
    tokens: row.tokens,
    pricedTokens: row.priced_tokens,
    cost: row.cost,
    messages: row.messages,
    breakdown: {
      input: row.input_tokens,
      output: row.output_tokens,
      cacheRead: row.cache_read_tokens,
      cacheWrite: row.cache_write_tokens,
      reasoning: row.reasoning_tokens,
    },
    updatedAt: row.updated_at,
  };
}
