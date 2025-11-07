-- ユーザーテーブル
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  person_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 記録テーブル
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  day_age INTEGER NOT NULL,
  person TEXT NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成
CREATE UNIQUE INDEX IF NOT EXISTS idx_date_person ON entries(entry_date, person);
CREATE INDEX IF NOT EXISTS idx_day_age ON entries(day_age);
CREATE INDEX IF NOT EXISTS idx_date ON entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_username ON users(username);

-- 初期ユーザーデータの挿入（パスワード: minato123, araga123, ryu123）
-- bcryptハッシュは本番環境で再生成することを推奨
INSERT OR IGNORE INTO users (username, password_hash, display_name, person_id) VALUES 
  ('minato_admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'みなと', 'minato'),
  ('araga_user', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'あらが', 'araga'),
  ('ryu_user', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'りゅう', 'ryu');
