PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- Immutable snapshot of the selected trap position used as the catch location.
-- checks.lat/lon remain the observer/device GPS position at registration time.
CREATE TABLE IF NOT EXISTS check_locations (
  check_id TEXT PRIMARY KEY,
  trap_lat REAL NOT NULL,
  trap_lon REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'trap_snapshot',
  captured_at TEXT NOT NULL,
  FOREIGN KEY(check_id) REFERENCES checks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_check_locations_position
ON check_locations(trap_lat, trap_lon);

-- Repair legacy semantics: old checks could contain the phone position in checks.lat/lon.
-- Backfill heatmap/catch position from the canonical trap instead.
INSERT OR IGNORE INTO check_locations (check_id, trap_lat, trap_lon, source, captured_at)
SELECT c.id, t.lat, t.lon, 'legacy_trap_backfill', COALESCE(c.checked_at, datetime('now'))
FROM checks c
JOIN traps t ON t.id = c.trap_id
WHERE t.lat IS NOT NULL AND t.lon IS NOT NULL;

INSERT OR IGNORE INTO app_migrations (name,applied_at)
VALUES ('v3_6_1_check_locations',datetime('now'));
