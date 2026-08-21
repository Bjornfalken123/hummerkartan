PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS position_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK(event_type IN ('trap_set','check')),
  entity_id TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  accuracy_m REAL,
  speed_kn REAL,
  course REAL,
  fix_at TEXT,
  action_at TEXT NOT NULL,
  timing_error_ms INTEGER,
  method TEXT NOT NULL DEFAULT 'gps',
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'familj',
  UNIQUE(event_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_position_events_entity ON position_events(event_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_position_events_action_at ON position_events(action_at DESC);

INSERT OR IGNORE INTO app_migrations (name,applied_at)
VALUES ('v3_4_position_events',datetime('now'));
