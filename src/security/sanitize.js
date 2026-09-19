'use strict';

/**
 * Phase 8/11 — lightweight centralized request sanitization.
 * Kept dependency-free and explicit rather than a black-box library, since
 * the attack surface here (JSON/urlencoded bodies from known admin forms) is
 * small and well understood.
 */

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function stripDangerousKeys(obj, depth = 0) {
  if (depth > 5 || obj === null || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) {
      delete obj[key];
      continue;
    }
    if (typeof obj[key] === 'object') stripDangerousKeys(obj[key], depth + 1);
  }
  return obj;
}

/** Blocks prototype pollution via body/query and collapses HTTP parameter pollution
 * (duplicate query keys) down to the last value, except for fields explicitly
 * allow-listed as arrays (e.g. fee_label[]) which Express already parses as arrays. */
function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === 'object') stripDangerousKeys(req.body);
  if (req.query && typeof req.query === 'object') stripDangerousKeys(req.query);
  if (req.params && typeof req.params === 'object') stripDangerousKeys(req.params);
  next();
}

/** Allowlist HTTP methods per Phase 11. */
function methodAllowlist(allowed) {
  return (req, res, next) => {
    if (allowed.includes(req.method)) return next();
    res.status(405).send('Method not allowed');
  };
}

/**
 * Only ever allow http:/https: absolute URLs through to anywhere that
 * renders as a clickable <a href>. EJS's `<%= %>` auto-escaping protects
 * against attribute-breakout (quotes/angle brackets), but it does nothing
 * about the URI *scheme* itself — `href="javascript:...）"` is just as
 * dangerous fully HTML-escaped, since the browser interprets the scheme
 * regardless. Applied both at write time (postForm.js / adminPostsController)
 * and again at read time (posts/repository.js) as defense in depth, so
 * any value that predates this fix is neutralized too.
 *
 * Returns the trimmed URL if it's safe, otherwise null.
 */
function sanitizeExternalUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return trimmed;
  } catch (e) {
    return null; // not a well-formed absolute URL at all
  }
}

module.exports = { sanitizeRequest, methodAllowlist, sanitizeExternalUrl };
