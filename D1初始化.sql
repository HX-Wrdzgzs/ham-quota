-- 在 Cloudflare D1 数据库 SQL Console 中执行一次
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_by TEXT NOT NULL DEFAULT 'SYSTEM',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS votes (
  quote_id TEXT NOT NULL,
  callsign TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (quote_id,callsign)
);
CREATE INDEX IF NOT EXISTS idx_votes_category ON votes(category_id);
CREATE INDEX IF NOT EXISTS idx_votes_callsign ON votes(callsign);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id TEXT NOT NULL,
  callsign TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO categories(id,label,created_by,created_at) VALUES(1,'经典语录','SYSTEM',datetime('now'));
INSERT OR IGNORE INTO categories(id,label,created_by,created_at) VALUES(2,'通联趣事','SYSTEM',datetime('now'));
INSERT OR IGNORE INTO categories(id,label,created_by,created_at) VALUES(3,'设备吐槽','SYSTEM',datetime('now'));
INSERT OR IGNORE INTO categories(id,label,created_by,created_at) VALUES(4,'名场面','SYSTEM',datetime('now'));
INSERT OR IGNORE INTO categories(id,label,created_by,created_at) VALUES(5,'搞笑梗图','SYSTEM',datetime('now'));
INSERT OR IGNORE INTO categories(id,label,created_by,created_at) VALUES(6,'其他','SYSTEM',datetime('now'));
