'use strict';

const db = require('../../database/connection');
const { hashIp } = require('../../auth/session');

const upsertDay = db.prepare(`
  INSERT INTO analytics_daily (date, pageviews, unique_visitors) VALUES (?, 1, 0)
  ON CONFLICT(date) DO UPDATE SET pageviews = pageviews + 1
`);
const seeVisitor = db.prepare('INSERT OR IGNORE INTO analytics_visitor_seen (date, ip_hash) VALUES (?, ?)');
const bumpUnique = db.prepare('UPDATE analytics_daily SET unique_visitors = unique_visitors + 1 WHERE date = ?');
const upsertPage = db.prepare(`
  INSERT INTO analytics_pages (path, views) VALUES (?, 1)
  ON CONFLICT(path) DO UPDATE SET views = views + 1
`);

// Platform Source tracking query
const upsertSource = db.prepare(`
  INSERT INTO analytics_sources (date, platform, visits) VALUES (?, ?, 1)
  ON CONFLICT(date, platform) DO UPDATE SET visits = visits + 1
`);

// Affiliate Book Click tracking query
const recordClickStmt = db.prepare(`
  INSERT INTO analytics_affiliate_clicks (target_url, book_title, clicks, last_clicked_at)
  VALUES (?, ?, 1, datetime('now'))
  ON CONFLICT(target_url) DO UPDATE SET
    clicks = clicks + 1,
    book_title = excluded.book_title,
    last_clicked_at = datetime('now')
`);

const STATIC_ASSET_RE = /\.(css|js|png|jpg|jpeg|svg|ico|xml|txt|woff2?)$/i;

/** Detect incoming traffic platform (Telegram, WhatsApp, Instagram, Facebook, Search, Direct) */
function detectPlatform(req) {
  const queryRef = (req.query.ref || req.query.utm_source || '').toLowerCase().trim();
  if (queryRef.includes('telegram') || queryRef === 'tg') return 'Telegram';
  if (queryRef.includes('whatsapp') || queryRef === 'wa') return 'WhatsApp';
  if (queryRef.includes('instagram') || queryRef === 'ig') return 'Instagram';
  if (queryRef.includes('facebook') || queryRef === 'fb') return 'Facebook';
  if (queryRef.includes('youtube') || queryRef === 'yt') return 'YouTube';
  if (queryRef.includes('twitter') || queryRef === 'x') return 'Twitter/X';

  const referer = (req.headers.referer || req.headers.referrer || '').toLowerCase().trim();
  if (!referer) return 'Direct / Organic';

  // Check for internal navigation to avoid counting subpage clicks as new referrals
  try {
    const refUrl = new URL(referer);
    if (refUrl.host === req.headers.host) return null; // Internal navigation
  } catch (_) {}

  if (referer.includes('t.me') || referer.includes('telegram')) return 'Telegram';
  if (referer.includes('whatsapp') || referer.includes('com.whatsapp')) return 'WhatsApp';
  if (referer.includes('instagram') || referer.includes('l.instagram.com')) return 'Instagram';
  if (referer.includes('facebook') || referer.includes('fb.me') || referer.includes('l.facebook.com')) return 'Facebook';
  if (referer.includes('youtube') || referer.includes('youtu.be')) return 'YouTube';
  if (referer.includes('t.co') || referer.includes('twitter') || referer.includes('x.com')) return 'Twitter/X';
  if (referer.includes('google') || referer.includes('bing') || referer.includes('yahoo')) return 'Google / Search';

  return 'Other Referrals';
}

/** Track pageviews, unique visitors, and external traffic platforms */
function track(req) {
  const p = req.path;
  if (p.startsWith('/admin') || p.startsWith('/go/') || STATIC_ASSET_RE.test(p)) return;

  try {
    const today = new Date().toISOString().split('T')[0];
    const ipHash = hashIp(req.ip);

    upsertDay.run(today);
    const insertedNewVisitor = seeVisitor.run(today, ipHash).changes > 0;
    if (insertedNewVisitor) bumpUnique.run(today);
    upsertPage.run(p);

    // Track platform source on external landing
    const platform = detectPlatform(req);
    if (platform) {
      upsertSource.run(today, platform);
    }
  } catch (e) {
    console.error('analytics tracking failed:', e.message);
  }
}

/** Record outbound affiliate book click */
function recordBookClick(targetUrl, bookTitle) {
  if (!targetUrl) return;
  recordClickStmt.run(targetUrl, bookTitle || 'Recommended Book');
}

/** Aggregated stats for Admin Dashboard and Analytics views */
function getDashboardData() {
  const today = new Date().toISOString().split('T')[0];
  const todayRow = db.prepare('SELECT * FROM analytics_daily WHERE date = ?').get(today) || { pageviews: 0, unique_visitors: 0 };
  const totalViews = db.prepare('SELECT COALESCE(SUM(pageviews), 0) AS total FROM analytics_daily').get().total;
  const dailyHistory = db.prepare('SELECT date, pageviews, unique_visitors AS uniqueVisitors FROM analytics_daily ORDER BY date DESC LIMIT 14').all();
  const topPages = db.prepare('SELECT path AS route, views FROM analytics_pages ORDER BY views DESC LIMIT 10').all();

  // 1. Platform Sources breakdown (Telegram, WhatsApp, Instagram, Facebook, etc.)
  const platformsAllTime = db.prepare(`
    SELECT platform, SUM(visits) as total_visits
    FROM analytics_sources
    GROUP BY platform
    ORDER BY total_visits DESC
  `).all();

  const platformsToday = db.prepare(`
    SELECT platform, visits as today_visits
    FROM analytics_sources
    WHERE date = ?
    ORDER BY visits DESC
  `).all(today);

  // Merge platform metrics into a unified map
  const platformMap = {
    Telegram: { name: 'Telegram', icon: '✈️', color: 'text-sky-400', today: 0, total: 0 },
    WhatsApp: { name: 'WhatsApp', icon: '💬', color: 'text-emerald-400', today: 0, total: 0 },
    Instagram: { name: 'Instagram', icon: '📸', color: 'text-pink-400', today: 0, total: 0 },
    Facebook: { name: 'Facebook', icon: '👥', color: 'text-blue-400', today: 0, total: 0 },
    'Google / Search': { name: 'Google / Search', icon: '🔍', color: 'text-amber-400', today: 0, total: 0 },
    'Direct / Organic': { name: 'Direct / Organic', icon: '🌐', color: 'text-slate-300', today: 0, total: 0 }
  };

  platformsAllTime.forEach(r => {
    if (!platformMap[r.platform]) {
      platformMap[r.platform] = { name: r.platform, icon: '🔗', color: 'text-indigo-400', today: 0, total: 0 };
    }
    platformMap[r.platform].total = r.total_visits;
  });

  platformsToday.forEach(r => {
    if (platformMap[r.platform]) {
      platformMap[r.platform].today = r.today_visits;
    }
  });

  const platformStats = Object.values(platformMap);

  // 2. Affiliate Books Click stats
  const affiliateClicks = db.prepare(`
    SELECT book_title, target_url, clicks, last_clicked_at
    FROM analytics_affiliate_clicks
    ORDER BY clicks DESC
    LIMIT 15
  `).all();

  const totalBookClicks = db.prepare('SELECT COALESCE(SUM(clicks), 0) AS total FROM analytics_affiliate_clicks').get().total;

  return {
    todayViews: todayRow.pageviews,
    todayUnique: todayRow.unique_visitors,
    totalViews,
    dailyHistory,
    topPages,
    platformStats,
    affiliateClicks,
    totalBookClicks
  };
}

module.exports = { track, recordBookClick, getDashboardData };
