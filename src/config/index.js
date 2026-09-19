'use strict';

require('dotenv').config();

function requireEnv(name, fallbackDev) {
  const val = process.env[name];
  if (val) return val;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return fallbackDev;
}

/** Secret admin route must be a URL-safe opaque segment (Phase 4). */
function normalizeSecretSlug(raw) {
  const cleaned = String(raw || '').replace(/^\/+|\/+$/g, '');
  if (!/^[A-Za-z0-9\-_/]+$/.test(cleaned)) {
    throw new Error('ADMIN_SECRET_SLUG must be URL-safe: letters, numbers, "-", "_", "/" only.');
  }
  return cleaned;
}

const secretSlug = normalizeSecretSlug(
  requireEnv('ADMIN_SECRET_SLUG', 'dev-only-change-me-' + require('crypto').randomBytes(6).toString('hex'))
);

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  adminSecretPrefix: `/admin/${secretSlug}`,
  cookieSecret: requireEnv('COOKIE_SECRET', 'dev-cookie-secret-do-not-use-in-prod'),
  databasePath: process.env.DATABASE_PATH,
  // Absolute origin used to build canonical URLs, sitemap entries and
  // structured-data URLs (Phase 20/23) — these must never be relative or
  // hardcoded to localhost in production.
  siteUrl: requireEnv('SITE_URL', 'http://localhost:3000').replace(/\/+$/, '')
};
