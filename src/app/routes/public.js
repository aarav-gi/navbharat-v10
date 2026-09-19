
// Fast In-Memory Page Cache (TTL: 60s)
const publicPageCache = new Map();
const PAGE_CACHE_TTL = 60 * 1000;

function pageCacheMiddleware(req, res, next) {
  // Only cache GET requests
  if (req.method !== "GET" || req.headers["x-skip-cache"]) return next();

  const key = req.originalUrl || req.url;
  const cached = publicPageCache.get(key);

  if (cached && (Date.now() - cached.timestamp < PAGE_CACHE_TTL)) {
    res.setHeader("X-Cache", "HIT");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(cached.body);
  }

  const originalSend = res.send.bind(res);
  res.send = function(body) {
    if (res.statusCode === 200 && typeof body === "string") {
      publicPageCache.set(key, { body, timestamp: Date.now() });
      res.setHeader("X-Cache", "MISS");
    }
    return originalSend(body);
  };
  next();
}

'use strict';

const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const { PUBLIC_GENERAL, PUBLIC_SEARCH } = require('../../security/rateLimits');
const pageCache = require('../../cache/pageCache');

router.use(PUBLIC_GENERAL);

// Must be registered before the /:category wildcard routes below, or
// Express would treat "sitemap.xml"/"robots.txt" as a category name.
router.get('/sitemap.xml', pageCache(5 * 60 * 1000), publicController.sitemapXml);
router.get('/robots.txt', publicController.robotsTxt);
router.get('/feed.xml', pageCache(5 * 60 * 1000), publicController.feedXml);

// Full-page cache only on anonymous, non-personalized routes — never on
// /search (query logging needs to see every request) and never anywhere
// under the admin/auth routers (mounted separately in server.js).
router.get('/', pageCacheMiddleware, pageCache(60 * 1000), publicController.home);
router.get('/search', PUBLIC_SEARCH, publicController.searchPage); // stricter limit (Phase 12)
// Compliance pages
router.get("/privacy-policy", pageCache(60 * 1000), publicController.privacyPage);
router.get("/terms", pageCache(60 * 1000), publicController.termsPage);
router.get("/contact", pageCache(60 * 1000), publicController.contactPage);

router.get("/:category/:slug", publicController.trackPostView, pageCache(120 * 1000), publicController.postPage);
router.get('/:category', pageCacheMiddleware, pageCache(60 * 1000), publicController.categoryPage);

module.exports = router;
