'use strict';

const cache = require('./memoryCache');

/**
 * Full-page response cache (Phase 24/25 — the "wapsite slow" fix).
 *
 * modules/posts/repository.js already caches the *data* behind each page,
 * but res.render() still re-runs the EJS template — looping over every
 * card, string-concatenating the whole page — on every single request,
 * even when the underlying data hasn't changed. Under a real traffic
 * spike that repeated rendering, not the database, is what makes the
 * response slow.
 *
 * This middleware caches the final rendered HTML per exact URL (path +
 * query string) for a short TTL. A cache hit skips the controller and the
 * EJS render entirely and just replays the bytes. It only ever wraps
 * public, unauthenticated GET routes (mounted from routes/public.js only —
 * never on admin/auth routes), so there is no risk of an admin response or
 * anything personalized leaking into a cache shared across visitors.
 *
 * Implementation note: Express's res.render() calls res.send() internally,
 * so intercepting res.send() here transparently captures rendered views
 * without needing to touch every controller.
 */
function pageCache(ttlMs) {
  return function (req, res, next) {
    if (req.method !== 'GET') return next();

    const key = 'page:' + req.originalUrl;
    const hit = cache.get(key);
    if (hit) {
      if (hit.contentType) res.set('Content-Type', hit.contentType);
      res.set('X-Cache', 'HIT');
      res.status(hit.status).send(hit.body);
      return;
    }

    const originalSend = res.send.bind(res);
    res.send = (body) => {
      if (res.statusCode === 200) {
        cache.set(key, { status: res.statusCode, body, contentType: res.get('Content-Type') }, ttlMs);
      }
      res.set('X-Cache', 'MISS');
      return originalSend(body);
    };

    next();
  };
}

module.exports = pageCache;
