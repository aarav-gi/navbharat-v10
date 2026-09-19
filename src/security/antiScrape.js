'use strict';

// In-memory blacklist with 24-hour TTL
const bannedIps = new Map();
const BAN_DURATION_MS = 24 * 60 * 60 * 1000;

// Known programmatic crawlers, scraping libraries, and aggressive aggregators
const SCRAPER_UA_REGEX = /(python|requests|scrapy|aiohttp|urllib|curl|wget|httpclient|axios|node-fetch|go-http-client|bytespider|petalbot|semrush|ahrefs)/i;

// Legitimate search engines for SEO indexing
const VERIFIED_SEARCH_BOTS = /(googlebot|bingbot|duckduckbot|yandex|yahoo)/i;

// Periodic cleanup of expired bans (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, unbanTime] of bannedIps.entries()) {
    if (now > unbanTime) bannedIps.delete(ip);
  }
}, 10 * 60 * 1000).unref();

function antiScrapeMiddleware(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";

  // 1. Check if IP is actively banned
  const unbanTime = bannedIps.get(ip);
  if (unbanTime) {
    if (Date.now() < unbanTime) {
      return res.status(403).type("text/plain").send("Access Forbidden: Automated scraping behavior detected. Your IP is temporarily restricted.");
    }
    bannedIps.delete(ip);
  }

  // 2. Honeypot Trap Route (Clicked only by dumb crawlers parsing all <a> tags)
  if (req.path === "/system/crawler-trap-node") {
    bannedIps.set(ip, Date.now() + BAN_DURATION_MS);
    console.warn(`[SECURITY ALERT] Honeypot triggered by IP: ${ip}. Banned for 24h.`);
    return res.status(403).type("text/plain").send("Automated scraping activity detected. IP restricted.");
  }

  // 3. Exemptions: internal API, static assets, and admin panels
  if (req.path.startsWith("/api/") || req.path.startsWith("/admin/") || req.path.includes(".")) {
    return next();
  }

  const ua = (req.headers["user-agent"] || "").trim();

  // 4. Block requests without User-Agent (Standard browsers always send one)
  if (!ua) {
    return res.status(403).type("text/plain").send("Access Forbidden: Valid User-Agent required.");
  }

  // 5. Block known scraper engines unless it is a recognized search bot
  if (SCRAPER_UA_REGEX.test(ua) && !VERIFIED_SEARCH_BOTS.test(ua)) {
    return res.status(403).type("text/plain").send("Access Forbidden: Programmatic crawlers are restricted.");
  }

  next();
}

module.exports = { antiScrapeMiddleware, bannedIps };
