PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS planned_traps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'familj'
);

CREATE INDEX IF NOT EXISTS idx_planned_traps_updated ON planned_traps(updated_at DESC);

CREATE TABLE IF NOT EXISTS app_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- Importera planerade platser från den senast uppdaterade gamla dagsplanen EN gång.
-- Dagsplanerna behålls som historik men används inte längre av v3-gränssnittet.
INSERT OR IGNORE INTO planned_traps (id,name,lat,lon,notes,created_at,updated_at,updated_by)
SELECT i.id,i.name,i.lat,i.lon,i.notes,i.created_at,i.updated_at,p.updated_by
FROM day_plan_items i
JOIN day_plans p ON p.id=i.plan_id
WHERE i.kind='spot'
  AND p.updated_at=(SELECT MAX(updated_at) FROM day_plans)
  AND NOT EXISTS (SELECT 1 FROM app_migrations WHERE name='v3_legacy_plan_import');

INSERT OR IGNORE INTO app_migrations (name,applied_at)
VALUES ('v3_legacy_plan_import',datetime('now'));
