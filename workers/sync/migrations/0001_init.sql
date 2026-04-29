CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_daily (
  machine_id TEXT NOT NULL,
  date TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  priced_tokens INTEGER NOT NULL,
  cost REAL NOT NULL,
  messages INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  reasoning_tokens INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (machine_id, date, provider_id, model_id)
);

CREATE INDEX IF NOT EXISTS usage_daily_date_idx ON usage_daily (date);
