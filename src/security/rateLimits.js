'use strict';

const rateLimit = require('express-rate-limit');
const { logSecurityEvent } = require('./eventLog');

function makeLimiter(name, opts) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logSecurityEvent(req, 'rate_limit_block', { policy: name, path: req.originalUrl });
      res.status(429).send('Too many requests. Please slow down and try again shortly.');
    },
    ...opts
  });
}

module.exports = {
  // Phase 12 — multiple named policies, strictest on sensitive operations.
  PUBLIC_GENERAL: makeLimiter('PUBLIC_GENERAL', { windowMs: 60 * 1000, max: 120 }),
  PUBLIC_SEARCH: makeLimiter('PUBLIC_SEARCH', { windowMs: 60 * 1000, max: 30 }),
  LOGIN: makeLimiter('LOGIN', { windowMs: 15 * 60 * 1000, max: 8 }),
  ADMIN: makeLimiter('ADMIN', { windowMs: 60 * 1000, max: 200 }),
  PASSWORD_RECOVERY: makeLimiter('PASSWORD_RECOVERY', { windowMs: 60 * 60 * 1000, max: 5 }),
  API_INGEST: makeLimiter('API_INGEST', { windowMs: 60 * 1000, max: 60 })
};
