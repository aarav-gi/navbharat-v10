
// Process Crash Guard (Super-Advanced Keep Alive)
process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at:", p, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception thrown:", err);
});
'use strict';

const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const cluster = require('cluster');
const path = require('path');

const config = require('./src/config');
const db = require('./src/database/connection'); // also applies schema + seeds on boot

const securityHeaders = require('./src/security/headers');
const { antiScrapeMiddleware } = require('./src/security/antiScrape');
const { ensureCsrfCookie, verifyCsrf } = require('./src/security/csrf');
const { sanitizeRequest } = require('./src/security/sanitize');
const secretAdminGate = require('./src/app/middleware/secretAdminGate');
const { attachUser } = require('./src/auth/rbac');
const { cleanupExpiredSessions } = require('./src/auth/session');
const analyticsService = require('./src/modules/analytics/service');
const settingsRepo = require('./src/modules/settings/repository');
const trendingJob = require('./src/jobs/trending');
const backupJob = require('./src/jobs/backup');
const { organizationWebsiteGraph } = require('./src/modules/seo/structuredData');

const publicRoutes = require('./src/app/routes/public');
const authRoutes = require('./src/app/routes/auth');
const adminRoutes = require('./src/app/routes/admin');
const apiRoutes = require('./src/app/routes/api');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // needed for correct req.ip behind a reverse proxy in production

app.set('view engine', 'ejs');
app.set('view options', { rmWhitespace: true });
app.set('views', path.join(__dirname, 'src', 'views'));

// ---- Global middleware ----
app.use(compression());

// Lightweight runtime HTML compression
app.use((req, res, next) => {
  const originalRender = res.render.bind(res);
  res.render = function(view, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    originalRender(view, options, (err, html) => {
      if (err) {
        if (callback) return callback(err);
        return next(err);
      }
      // Collapse redundant whitespaces, tabs, and duplicate blank lines safely
      const compactHtml = html
        .replace(/<!--(?!\s*\/\s*|\s*\[if)[\s\S]*?-->/g, "") // Remove HTML comments except conditionals
        .replace(/>\s+</g, "><") // Collapse space between tags
        .replace(/[ \t]+/g, " ") // Collapse multiple spaces/tabs
        .trim();

      if (callback) return callback(null, compactHtml);
      res.send(compactHtml);
    });
  };
  next();
});

app.use(securityHeaders);
app.use(antiScrapeMiddleware);
// 6MB accommodates base64-encoded ad banner uploads from the admin ads
// screen (Phase 29 media handling is enforced again, more strictly, at the
// decode step in modules/media/service.js — this is just the outer ceiling).
app.use(express.urlencoded({ extended: true, limit: '6mb' }));
app.use(express.json({ limit: '6mb' }));
app.use(sanitizeRequest);
app.use(cookieParser(config.cookieSecret));
app.use(ensureCsrfCookie);
app.use('/api/v1', apiRoutes);
app.use(verifyCsrf);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

app.use(attachUser);

app.use((req, res, next) => {
  res.locals.settings = settingsRepo.getSettings();
  res.locals.secretUrl = config.adminSecretPrefix;
  res.locals.currentUser = req.user || null;
  res.locals.siteUrl = config.siteUrl;
  // Sitewide Organization+WebSite JSON-LD is identical on every page (public
  // and admin), so it's built once here — not inside the .ejs templates.
  // IMPORTANT: EJS compiles templates with `new Function(...)`, which has
  // no access to the enclosing module's `require` — a `require(...)` call
  // written inside a `<% %>` block throws "require is not defined" at
  // render time. All structured-data objects must be computed in plain JS
  // (here, or in a controller) and handed to the view as an already-built
  // local; the view's only job is to JSON.stringify + escape it.
  const siteGraph = { '@context': 'https://schema.org', '@graph': organizationWebsiteGraph(res.locals.settings, config.siteUrl) };
  res.locals.siteJsonLd = JSON.stringify(siteGraph).replace(/</g, '\\u003c');
  next();
});

app.use(secretAdminGate(config.adminSecretPrefix));

app.use((req, res, next) => { analyticsService.track(req); next(); });

// ---- Routes ----
app.use(config.adminSecretPrefix, authRoutes);
app.use(config.adminSecretPrefix, adminRoutes);

// --- AFFILIATE BOOK CLICK DISPATCHER & TRACKING GATEWAY ---
app.get("/go/book", (req, res) => {
  const targetUrl = (req.query.url || "").trim();
  const bookTitle = (req.query.title || "Recommended Book").trim();
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return res.redirect("/");
  }
  try {
    analyticsService.recordBookClick(targetUrl, bookTitle);
  } catch (e) {
    console.error("Book click error:", e.message);
  }
  return res.redirect(302, targetUrl);
});

app.use('/', publicRoutes);

// ---- Errors / fallback ----
app.use((req, res) => res.status(404).render('errors/404', {
  title: `Not Found | ${res.locals.settings.siteName}`,
  noindex: true,
  siteUrl: config.siteUrl
}));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err); // full detail always logged server-side
  res.status(500).render('errors/500', {
    title: 'Something went wrong',
    noindex: true,
    siteUrl: config.siteUrl,
    // Stack traces can leak internal file paths / logic — fine for local
    // debugging, never for a real deployment. Gated on NODE_ENV, same as
    // config.js already gates other production-only requirements.
    debugError: config.nodeEnv !== 'production' ? { message: err.message, stack: err.stack } : null
  });
});

// When run under scripts/cluster.js, every CPU core boots its own copy of
// this file. Background timers (session cleanup, trending recompute) only
// need to run once — pin them to a single worker so scaling to more cores
// doesn't multiply redundant DB writes.
const isBackgroundOwner = !cluster.isWorker || cluster.worker.id === 1;

if (isBackgroundOwner) {
  // Best-effort periodic session cleanup.
  setInterval(cleanupExpiredSessions, 15 * 60 * 1000).unref();

  // Background trending score computation (Phase 18) — never inline on a request.
  trendingJob.start();
backupJob.start();
}


// ---- Automated Post Re-check & Expiry Engine ----
function checkExpiredPostsForReview() {
  try {
    const db = require("./src/database/connection");
    const sql = "UPDATE posts SET status = 'pending', is_recheck = 1 WHERE status = 'published' AND recheck_at IS NOT NULL AND recheck_at != '' AND date(recheck_at) <= date('now')";
    const info = db.prepare(sql).run();
    if (info.changes > 0) {
      console.log("[re-check] 🔄 Moved " + info.changes + " expired post(s) back to review queue for verification.");
      const postsRepo = require("./src/modules/posts/repository");
      if (postsRepo.invalidateCaches) postsRepo.invalidateCaches();
    }
  } catch (err) {
    console.error("[re-check] Error checking expired posts:", err.message);
  }
}
setInterval(checkExpiredPostsForReview, 15 * 60 * 1000); // Checks every 15 minutes
setTimeout(checkExpiredPostsForReview, 5000); // Initial check on server boot


// Production Health Check & Metadata Endpoint (Zero Ads / Zero Tracking)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    uptime: Math.floor(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    timestamp: new Date().toISOString()
  });
});

// Self Keep-Alive Mechanism (Pings itself every 14 minutes)
const keepAliveUrl = process.env.RENDER_EXTERNAL_URL || ("http://localhost:" + (process.env.PORT || 3000));
setInterval(() => {
  try {
    const httpLib = keepAliveUrl.startsWith("https") ? require("https") : require("http");
    httpLib.get(keepAliveUrl + "/health", (res) => {
      console.log("[KeepAlive] Pinged self successfully - Status:", res.statusCode);
    }).on("error", (err) => {
      console.warn("[KeepAlive] Self ping note:", err.message);
    });
  } catch (e) {
    // Silent failover
  }
}, 14 * 60 * 1000);

app.listen(config.port, "0.0.0.0", "0.0.0.0", () => {
  console.log('\n======================================================');
  console.log(` PORTAL ONLINE: http://localhost:${config.port}`);
  console.log(` Admin entry:   http://localhost:${config.port}${config.adminSecretPrefix}`);
  console.log(' If no admin user exists yet, run: node scripts/create-admin.js');
  console.log('======================================================\n');
});

module.exports = app;
