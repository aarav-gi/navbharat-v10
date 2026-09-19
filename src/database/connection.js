'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// DATABASE_PATH, if set, is resolved relative to the PROJECT ROOT — never
// to process.cwd() — so every entry point (server.js, scripts/create-admin.js,
// scripts/cluster.js workers, etc.) opens the exact same physical file
// regardless of which directory it happens to be launched from. A relative
// path resolved against cwd was the likely cause of "admin login can't find
// my user" reports: creating the admin from one working directory and
// starting the server from another silently produces two different SQLite
// files, each empty from the other's point of view.
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(PROJECT_ROOT, process.env.DATABASE_PATH)
  : path.join(PROJECT_ROOT, 'database', 'rozgarhub.sqlite3');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let db;
try {
  db = new Database(DB_PATH);
} catch (err) {
  // better-sqlite3 ships a native binding that has to match the exact
  // Node version/ABI it was installed under — the single most common
  // reason this throws on a fresh clone is that it was never (re)built for
  // the Node version actually running it. A raw native-module stack trace
  // here is not self-explanatory, so spell out the fix.
  console.error('\n[database] Failed to open the SQLite database.');
  console.error(`[database] Path: ${DB_PATH}`);
  console.error('[database] If this mentions a native module / bindings error, run:');
  console.error('[database]   npm rebuild better-sqlite3');
  console.error('[database] (or delete node_modules and run npm install again)\n');
  throw err;
}
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// ---- Lightweight column migrations for DBs created before a schema change ----
// `CREATE TABLE IF NOT EXISTS` above is a no-op once the table already exists,
// so a new column has to be added explicitly for anyone upgrading in place.
function ensureColumn(table, column, definition) {
  if (!/^[a-zA-Z0-9_]+$/.test(table) || !/^[a-zA-Z0-9_]+$/.test(column)) {
    throw new Error("Invalid SQL identifier: " + table + "." + column);
  }
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('posts', 'description', 'TEXT');
ensureColumn('posts', 'recheck_at', 'TEXT');
ensureColumn('posts', 'is_recheck', 'INTEGER DEFAULT 0');

// ---- Seed roles + granular permissions (idempotent) ----

const ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'EDITOR', 'MODERATOR',
  'SEO_MANAGER', 'ANALYST', 'CRAWLER_MANAGER', 'AD_MANAGER', 'VIEWER'
];

const PERMISSIONS = [
  'posts.read', 'posts.create', 'posts.edit', 'posts.publish', 'posts.delete', 'posts.approve',
  'seo.manage', 'analytics.read', 'security.read', 'users.manage', 'roles.manage',
  'settings.manage', 'ads.manage', 'crawler.manage', 'audit.read'
];

// Which roles get which permissions, out of the box. Adjust freely from the DB later.
const ROLE_PERMISSION_MAP = {
  SUPER_ADMIN: PERMISSIONS, // everything
  ADMIN: PERMISSIONS.filter(p => p !== 'roles.manage'),
  EDITOR: ['posts.read', 'posts.create', 'posts.edit', 'posts.publish'],
  MODERATOR: ['posts.read', 'posts.approve', 'posts.edit'],
  SEO_MANAGER: ['posts.read', 'seo.manage'],
  ANALYST: ['posts.read', 'analytics.read'],
  CRAWLER_MANAGER: ['posts.read', 'posts.approve', 'crawler.manage'],
  AD_MANAGER: ['ads.manage'],
  VIEWER: ['posts.read']
};

const insertRole = db.prepare('INSERT OR IGNORE INTO roles (name) VALUES (?)');
const insertPermission = db.prepare('INSERT OR IGNORE INTO permissions (name) VALUES (?)');
const getRoleId = db.prepare('SELECT id FROM roles WHERE name = ?');
const getPermissionId = db.prepare('SELECT id FROM permissions WHERE name = ?');
const linkRolePermission = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');

const seed = db.transaction(() => {
  for (const r of ROLES) insertRole.run(r);
  for (const p of PERMISSIONS) insertPermission.run(p);
  for (const [role, perms] of Object.entries(ROLE_PERMISSION_MAP)) {
    const roleRow = getRoleId.get(role);
    if (!roleRow) continue;
    for (const perm of perms) {
      const permRow = getPermissionId.get(perm);
      if (!permRow) continue;
      linkRolePermission.run(roleRow.id, permRow.id);
    }
  }

  // Default settings row (only if missing) so the site never renders blank.
  const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'site'").get();
  if (!settingsRow) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('site', ?)").run(JSON.stringify({
      siteName: 'RozgarHub Naukri',
      logoText: 'NN',
      tagline: 'नए भारत की नई रफ़्तार',
      footerDisclaimer: 'रोजगारहब नौकरी एक गैर-सरकारी स्वतंत्र सूचना पोर्टल है। सभी विवरण आधिकारिक अधिसूचनाओं से सत्यापित किए जाते हैं।',
      ads: {
        enabled: false,
        slots: {
          top: { type: 'none', code: '', imageUrl: '', linkUrl: '', altText: '' },
          content: { type: 'none', code: '', imageUrl: '', linkUrl: '', altText: '' },
          bottom: { type: 'none', code: '', imageUrl: '', linkUrl: '', altText: '' }
        }
      }
    }));
  }
});

seed();

module.exports = db;
