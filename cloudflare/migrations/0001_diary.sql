CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  published_at TEXT NOT NULL,
  day TEXT NOT NULL
);
CREATE INDEX entries_chronology ON entries(published_at DESC, id DESC);
CREATE TABLE media (
  id TEXT PRIMARY KEY,
  entry_id TEXT REFERENCES entries(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX media_entries ON media(entry_id);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE login_attempts (ip TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
