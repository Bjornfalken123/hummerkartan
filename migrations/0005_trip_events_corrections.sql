PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trip_events (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('trap_set','check')),
  entity_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'familj',
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  UNIQUE(event_type,entity_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_events_trip_time ON trip_events(trip_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_trip_events_entity ON trip_events(event_type,entity_id);

CREATE TABLE IF NOT EXISTS correction_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('trap','check','trip')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'familj'
);

CREATE INDEX IF NOT EXISTS idx_correction_events_entity ON correction_events(entity_type,entity_id,created_at DESC);

-- Backfill historical links when one unambiguous/latest matching trip window exists.
INSERT OR IGNORE INTO trip_events (id,trip_id,event_type,entity_id,occurred_at,created_at,actor)
SELECT 'check:' || c.id,
       (SELECT tr.id FROM trips tr
        WHERE tr.started_at <= c.checked_at
          AND (tr.ended_at IS NULL OR tr.ended_at >= c.checked_at)
        ORDER BY tr.started_at DESC LIMIT 1),
       'check',c.id,c.checked_at,datetime('now'),c.actor
FROM checks c
WHERE EXISTS (
  SELECT 1 FROM trips tr
  WHERE tr.started_at <= c.checked_at
    AND (tr.ended_at IS NULL OR tr.ended_at >= c.checked_at)
);

INSERT OR IGNORE INTO trip_events (id,trip_id,event_type,entity_id,occurred_at,created_at,actor)
SELECT 'trap_set:' || t.id,
       (SELECT tr.id FROM trips tr
        WHERE tr.started_at <= t.set_at
          AND (tr.ended_at IS NULL OR tr.ended_at >= t.set_at)
        ORDER BY tr.started_at DESC LIMIT 1),
       'trap_set',t.id,t.set_at,datetime('now'),t.updated_by
FROM traps t
WHERE EXISTS (
  SELECT 1 FROM trips tr
  WHERE tr.started_at <= t.set_at
    AND (tr.ended_at IS NULL OR tr.ended_at >= t.set_at)
);

INSERT OR IGNORE INTO app_migrations (name,applied_at)
VALUES ('v3_5_trip_events_corrections',datetime('now'));
