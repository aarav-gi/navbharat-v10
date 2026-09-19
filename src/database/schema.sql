-- NavBharat Naukri — core schema (Phase 14 groundwork)
-- SQLite. Designed to be portable to Postgres later with minimal changes.

PRAGMA foreign_keys = ON;

-- ---------- AUTH / RBAC ----------

CREATE TABLE IF NOT EXISTS roles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT UNIQUE NOT NULL,      -- SUPER_ADMIN, ADMIN, EDITOR, MODERATOR, SEO_MANAGER, ANALYST, CRAWLER_MANAGER, AD_MANAGER, VIEWER
  description   TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT UNIQUE NOT NULL       -- posts.read, posts.publish, seo.manage, ...
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  username            TEXT UNIQUE NOT NULL,
  password_hash       TEXT NOT NULL,        -- scrypt: algo$N$r$p$saltHex$hashHex
  role_id             INTEGER NOT NULL REFERENCES roles(id),
  is_active           INTEGER NOT NULL DEFAULT 1,
  mfa_enabled         INTEGER NOT NULL DEFAULT 0,   -- reserved for Phase 6 (TOTP/WebAuthn)
  mfa_secret          TEXT,                          -- reserved, encrypted at rest when implemented
  failed_attempts     INTEGER NOT NULL DEFAULT 0,
  locked_until        TEXT,
  last_login_at       TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,           -- sha256(raw token) — raw token only ever lives in the cookie
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_hash       TEXT,
  user_agent    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ---------- CONTENT ----------

CREATE TABLE IF NOT EXISTS posts (
  id                  TEXT PRIMARY KEY,     -- keep string ids for compatibility with legacy data
  slug                TEXT UNIQUE NOT NULL,
  category            TEXT NOT NULL,        -- latest-jobs | admit-card | results | answer-key | syllabus
  title               TEXT NOT NULL,
  organization        TEXT NOT NULL,
  description         TEXT,                 -- short summary; the ONLY body copy needed for
                                              -- result/answer-key/syllabus/admit-card pages
  total_posts         TEXT,
  application_start   TEXT,
  application_end     TEXT,
  age_limit           TEXT,
  qualifications      TEXT,
  fee_structure       TEXT,                 -- JSON array [{label, amount}]
  vacancies           TEXT,                 -- JSON array [{post, seats, lastDate}]
  links               TEXT,                 -- JSON array [{name, url, type}]
  apply_url           TEXT,
  notification_pdf    TEXT,
  syllabus_pdf        TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',  -- pending | published | rejected | archived
  source_type         TEXT DEFAULT 'manual',            -- manual | crawler
  created_by          INTEGER REFERENCES users(id),
  updated_by          INTEGER REFERENCES users(id),
  posted_date         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);

CREATE TABLE IF NOT EXISTS post_revisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id       TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  snapshot      TEXT NOT NULL,              -- full JSON snapshot before the change
  changed_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- SITE CONFIG ----------

CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);

-- ---------- ANALYTICS (privacy-conscious: IP is hashed, never stored raw) ----------

CREATE TABLE IF NOT EXISTS analytics_daily (
  date              TEXT PRIMARY KEY,
  pageviews         INTEGER NOT NULL DEFAULT 0,
  unique_visitors   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analytics_visitor_seen (
  date          TEXT NOT NULL,
  ip_hash       TEXT NOT NULL,
  PRIMARY KEY (date, ip_hash)
);

CREATE TABLE IF NOT EXISTS analytics_pages (
  path          TEXT PRIMARY KEY,
  views         INTEGER NOT NULL DEFAULT 0
);

-- ---------- AUDIT / SECURITY ----------

CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id),
  username      TEXT,                       -- denormalized so logs survive user deletion
  action        TEXT NOT NULL,              -- login_success, login_failed, post.create, post.publish, ...
  entity_type   TEXT,
  entity_id     TEXT,
  details       TEXT,                       -- JSON, never store secrets/passwords/tokens here
  ip_hash       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

CREATE TABLE IF NOT EXISTS security_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type    TEXT NOT NULL,              -- rate_limit_block, invalid_admin_path, csrf_failure, ...
  detail        TEXT,
  ip_hash       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);

-- ---------- TRENDING SIGNALS ----------
-- Raw signals are stored separately from the computed score (Phase 18): the
-- score itself is just a cache that a background job recomputes on a timer.

-- Per-post, per-day view counters. Aggregated (not one row per view) so this
-- table stays small even under heavy traffic.
CREATE TABLE IF NOT EXISTS post_view_daily (
  post_id       TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,
  views         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, date)
);

CREATE INDEX IF NOT EXISTS idx_post_view_daily_date ON post_view_daily(date);

-- Dedup table: one counted view per (day, visitor, post) so refreshing the
-- page can't be used to manipulate the trending score.
CREATE TABLE IF NOT EXISTS post_view_seen (
  date          TEXT NOT NULL,
  ip_hash       TEXT NOT NULL,
  post_id       TEXT NOT NULL,
  PRIMARY KEY (date, ip_hash, post_id)
);

-- On-site search queries, used both for search analytics and as a
-- "search demand" signal into the trending score.
CREATE TABLE IF NOT EXISTS search_queries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  query         TEXT NOT NULL,
  normalized    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_search_queries_normalized ON search_queries(normalized);
CREATE INDEX IF NOT EXISTS idx_search_queries_created ON search_queries(created_at);

-- Computed trending score per post, with the individual factor breakdown
-- kept alongside it so admins can see *why* a post is trending.
CREATE TABLE IF NOT EXISTS trending_scores (
  post_id           TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  score             REAL NOT NULL DEFAULT 0,
  freshness         REAL NOT NULL DEFAULT 0,
  velocity          REAL NOT NULL DEFAULT 0,
  deadline          REAL NOT NULL DEFAULT 0,
  engagement        REAL NOT NULL DEFAULT 0,
  update_frequency  REAL NOT NULL DEFAULT 0,
  search_demand     REAL NOT NULL DEFAULT 0,
  computed_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trending_score ON trending_scores(score DESC);


-- Platform Sources Traffic Analytics
CREATE TABLE IF NOT EXISTS analytics_sources (
  date          TEXT NOT NULL,
  platform      TEXT NOT NULL,
  visits        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, platform)
);

-- Affiliate Books Click Tracker
CREATE TABLE IF NOT EXISTS analytics_affiliate_clicks (
  target_url      TEXT PRIMARY KEY,
  book_title      TEXT NOT NULL,
  clicks          INTEGER NOT NULL DEFAULT 0,
  last_clicked_at TEXT
);
