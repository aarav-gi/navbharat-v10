'use strict';

const postsRepo = require('../../modules/posts/repository');
const settingsRepo = require('../../modules/settings/repository');
const trendingService = require('../../modules/trending/service');
const searchService = require('../../modules/search/service');
const sitemapService = require('../../modules/seo/sitemap');
const feedService = require('../../modules/seo/feed');
const seoMeta = require('../../modules/seo/meta');
const { jobFaqGraph, itemListGraph } = require('../../modules/seo/structuredData');
const config = require('../../config');
const { hashIp } = require('../../auth/session');

const VALID_CATEGORIES = ['latest-jobs', 'admit-card', 'results', 'answer-key', 'syllabus'];

/** Must run BEFORE the page cache on the post-detail route (see routes/public.js).
 *  If it ran inside the controller instead, a cached response would skip it
 *  entirely — which would silently starve the trending engine of view data
 *  during exactly the traffic spikes when that data matters most. */
function trackPostView(req, res, next) {
  const post = postsRepo.getBySlug(req.params.slug);
  if (post) {
    try {
      trendingService.trackView(post.id, hashIp(req.ip));
    } catch (e) {
      console.error('trending view tracking failed:', e.message);
    }
  }
  next();
}

/** Builds the pre-serialized ItemList JSON-LD string for a listing page.
 *  Built once here (plain JS) and handed to the view as a ready-to-print
 *  string — see the note in index.ejs on why this can't be built inside
 *  the .ejs template itself. */
function buildItemListJsonLd(posts, name) {
  const graph = itemListGraph(posts, config.siteUrl, name);
  if (!graph) return null;
  return JSON.stringify({ '@context': 'https://schema.org', ...graph }).replace(/</g, '\\u003c');
}

function home(req, res) {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  const posts = postsRepo.getPublished();
  const settings = settingsRepo.getSettings();
  const trending = trendingService.getTrending(8);
  const meta = seoMeta.homeMeta(settings, config.siteUrl);

  res.render('index', {
    ...meta,
    siteUrl: config.siteUrl,
    post: null,
    posts,
    trending,
    jobs: posts.filter(p => p.category === 'latest-jobs'),
    admitCards: posts.filter(p => p.category === 'admit-card'),
    results: posts.filter(p => p.category === 'results'),
    itemListJsonLd: buildItemListJsonLd(posts, meta.title)
  });
}

function categoryPage(req, res, next) {
  const { category } = req.params;
  if (!VALID_CATEGORIES.includes(category)) return next();

  const settings = settingsRepo.getSettings();
  // index.ejs derives every section, the live counters, and the
  // State/Category/Commission filter entirely from `posts` (it does
  // `posts.filter(p => p.category === ...)` itself) — it never reads a
  // separate per-category variable. Passing the FULL unfiltered post list
  // here (as this used to) meant every /:category page — including the
  // ones linked straight from the footer and submitted in sitemap.xml —
  // silently rendered the exact same all-categories homepage regardless
  // of the URL. Passing only this category's posts is what actually makes
  // the page match its own URL.
  const posts = postsRepo.getPublishedByCategory(category);
  const meta = seoMeta.categoryMeta(category, settings, config.siteUrl, posts.length);

  res.render('index', {
    ...meta,
    siteUrl: config.siteUrl,
    post: null,
    posts,
    trending: [],
    itemListJsonLd: buildItemListJsonLd(posts, meta.title)
  });
}

function postPage(req, res) {
  const { slug } = req.params;
  const settings = settingsRepo.getSettings();
  const post = postsRepo.getBySlug(slug);

  if (!post) {
    return res.status(404).render('errors/404', {
      title: `Page not found | ${settings.siteName}`,
      noindex: true,
      siteUrl: config.siteUrl
    });
  }

  // View tracking happens in trackPostView middleware (runs before the page
  // cache on this route) — not here, so it still fires on cache hits.

  res.setHeader('Cache-Control', 'public, max-age=180, stale-while-revalidate=300');
  // Last-Modified reflects the real content update time (not render time),
  // giving conditional-GET crawlers/CDNs an honest freshness signal.
  res.setHeader('Last-Modified', new Date(post.updatedAt || post.postedDate).toUTCString());

  const meta = seoMeta.postMeta(post, settings, config.siteUrl);
  res.render('post', {
    ...meta,
    siteUrl: config.siteUrl,
    post,
    jobFaq: jobFaqGraph(post) // pre-built here — never require()'d from inside the .ejs template
  });
}

function searchPage(req, res) {
  const settings = settingsRepo.getSettings();
  const q = (req.query.q || '').toString();
  const { results } = searchService.search(q, 40);
  const meta = seoMeta.searchMeta(q, settings); // noindex,follow — query pages aren't unique (Phase 20)

  res.render('search', {
    ...meta,
    siteUrl: config.siteUrl,
    query: q,
    results,
    post: null
  });
}

function sitemapXml(req, res) {
  res.set('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // sitemaps don't need to be hot-fresh
  res.send(sitemapService.generateSitemapXml());
}

function robotsTxt(req, res) {
  res.set('Content-Type', 'text/plain');
  res.send(sitemapService.generateRobotsTxt());
}

function feedXml(req, res) {
  const settings = settingsRepo.getSettings();
  res.set('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300'); // fresher than the sitemap — this is the fast discovery path
  res.send(feedService.generateFeedXml(settings, 50));
}


function privacyPage(req, res) {
  const settings = settingsRepo.getSettings();
  res.render("privacy-policy", {
    title: "गोपनीयता नीति (Privacy Policy) - " + (settings.siteName || "RozgarHub"),
    description: "RozgarHub पोर्टल की गोपनीयता नीति और डेटा सुरक्षा दिशानिर्देश।",
    keywords: ["privacy policy", "rozgarhub"],
    canonicalUrl: config.siteUrl + "/privacy-policy",
    siteUrl: config.siteUrl,
    settings,
    post: null
  });
}
function termsPage(req, res) {
  const settings = settingsRepo.getSettings();
  res.render("terms", {
    title: "नियम और शर्तें (Terms) - " + (settings.siteName || "RozgarHub"),
    description: "RozgarHub पोर्टल के उपयोग संबंधी नियम और शर्तें।",
    keywords: ["terms", "conditions", "rozgarhub"],
    canonicalUrl: config.siteUrl + "/terms",
    siteUrl: config.siteUrl,
    settings,
    post: null
  });
}
function contactPage(req, res) {
  const settings = settingsRepo.getSettings();
  res.render("contact", {
    title: "संपर्क करें (Contact Us) - " + (settings.siteName || "RozgarHub"),
    description: "RozgarHub पोर्टल आधिकारिक संपर्क केंद्र।",
    keywords: ["contact", "support", "rozgarhub"],
    canonicalUrl: config.siteUrl + "/contact",
    siteUrl: config.siteUrl,
    settings,
    post: null
  });
}

module.exports = { home, categoryPage, postPage, searchPage, trackPostView, sitemapXml, robotsTxt, feedXml, VALID_CATEGORIES , privacyPage, termsPage, contactPage};
