
function parseUtcDate(str) {
  if (!str) return 0;
  if (typeof str !== 'string') return new Date(str).getTime();
  const iso = str.includes('T') ? str : str.replace(' ', 'T');
  return new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime();
}

'use strict';

/**
 * Phase 5 — Real server-side sessions.
 *
 * The cookie only ever holds a random, unguessable token. The DB stores the
 * SHA-256 hash of that token (never the raw token), so a DB leak alone can't
 * be replayed as a live session. Sessions rotate on login and expire both by
 * absolute lifetime and by idle timeout.
 */

const crypto = require('crypto');
const db = require('../database/connection');

const COOKIE_NAME = 'nn_session';
const ABSOLUTE_LIFETIME_MS = 8 * 60 * 60 * 1000;   // 8 hours max
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;            // 30 minutes idle

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex').slice(0, 16);
}

function isSecureCookieEnv() {
  return process.env.NODE_ENV === 'production';
}

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookieEnv(),
    signed: true,
    maxAge: maxAgeMs,
    path: '/'
  };
}

function createSession(res, user, req) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const now = Date.now();
  const expiresAt = new Date(now + ABSOLUTE_LIFETIME_MS).toISOString();

  db.prepare(`
    INSERT INTO sessions (id, user_id, ip_hash, user_agent, created_at, last_seen_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(tokenHash, user.id, hashIp(req.ip), (req.headers['user-agent'] || '').slice(0, 256), new Date().toISOString(), new Date().toISOString(), expiresAt);

  res.cookie(COOKIE_NAME, rawToken, cookieOptions(ABSOLUTE_LIFETIME_MS));
  return rawToken;
}

/** Rotate: invalidate old session, issue a brand-new token. Call right after login. */
function rotateSession(req, res, user) {
  destroyCurrentSession(req, res);
  return createSession(res, user, req);
}

function getSessionUser(req) {
  const rawToken = req.signedCookies && req.signedCookies[COOKIE_NAME];
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(tokenHash);
  if (!session) return null;

  const now = Date.now();
  if (parseUtcDate(session.expires_at) < now) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(new Date().toISOString(), tokenHash);
    return null;
  }
  if (now - parseUtcDate(session.last_seen_at) > IDLE_TIMEOUT_MS) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(tokenHash);
    return null;
  }

  const user = db.prepare('SELECT u.*, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?').get(session.user_id);
  if (!user || !user.is_active) return null;

  db.prepare('UPDATE sessions SET last_seen_at = datetime(\'now\') WHERE id = ?').run(tokenHash);
  return user;
}

function destroyCurrentSession(req, res) {
  const rawToken = req.signedCookies && req.signedCookies[COOKIE_NAME];
  if (rawToken) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(rawToken));
  }
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: isSecureCookieEnv(), path: '/' });
}

function cleanupExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}

module.exports = {
  COOKIE_NAME,
  createSession,
  rotateSession,
  getSessionUser,
  destroyCurrentSession,
  cleanupExpiredSessions,
  hashIp
};
