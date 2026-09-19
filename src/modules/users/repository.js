'use strict';

const db = require('../../database/connection');

function findByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function registerFailedAttempt(username) {
  const user = findByUsername(username);
  if (!user) return;
  const attempts = user.failed_attempts + 1;
  let lockedUntil = null;
  // Exponential-ish backoff: lock for 2^attempts minutes after the 4th failure, capped at 60 min.
  if (attempts >= 4) {
    const minutes = Math.min(60, Math.pow(2, attempts - 4));
    lockedUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  }
  db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, lockedUntil, user.id);
}

function clearFailedAttempts(userId) {
  db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?").run(userId);
}

function isLocked(user) {
  return !!(user.locked_until && new Date(user.locked_until).getTime() > Date.now());
}

function createUser({ username, passwordHash, roleName }) {
  const role = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName);
  if (!role) throw new Error(`Unknown role: ${roleName}`);
  const info = db.prepare('INSERT INTO users (username, password_hash, role_id) VALUES (?, ?, ?)').run(username, passwordHash, role.id);
  return findById(info.lastInsertRowid);
}

function countUsers() {
  return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
}

module.exports = { findByUsername, findById, registerFailedAttempt, clearFailedAttempts, isLocked, createUser, countUsers };
