PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS day_plans (
  id TEXT PRIMARY KEY,
  plan_date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'familj'
);

CREATE TABLE IF NOT EXISTS day_plan_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('trap','spot')),
  trap_id TEXT,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(plan_id) REFERENCES day_plans(id) ON DELETE CASCADE,
  FOREIGN KEY(trap_id) REFERENCES traps(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_day_plan_items_plan_seq ON day_plan_items(plan_id, seq);
CREATE INDEX IF NOT EXISTS idx_day_plans_date ON day_plans(plan_date);
