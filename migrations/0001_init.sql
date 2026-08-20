PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS traps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','retrieved')),
  set_at TEXT NOT NULL,
  last_checked_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'familj'
);

CREATE INDEX IF NOT EXISTS idx_traps_status ON traps(status);
CREATE INDEX IF NOT EXISTS idx_traps_updated ON traps(updated_at);

CREATE TABLE IF NOT EXISTS checks (
  id TEXT PRIMARY KEY,
  trap_id TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  lobster_count INTEGER NOT NULL DEFAULT 0,
  released_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  lat REAL,
  lon REAL,
  actor TEXT NOT NULL DEFAULT 'familj',
  created_at TEXT NOT NULL,
  FOREIGN KEY(trap_id) REFERENCES traps(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checks_trap_time ON checks(trap_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  distance_nm REAL NOT NULL DEFAULT 0,
  actor TEXT NOT NULL DEFAULT 'familj',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS track_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  speed_kn REAL,
  course REAL,
  accuracy REAL,
  recorded_at TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'familj',
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  UNIQUE(trip_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_track_trip_seq ON track_points(trip_id, seq);
