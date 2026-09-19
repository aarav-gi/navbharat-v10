'use strict';

const postsRepo = require('../posts/repository');
const config = require('../../config');

// Priority tuned by commercial/search intent — jobs convert search traffic
// hardest and change most often, syllabus pages are the most evergreen.
const CATEGORY_META = {
  'latest-jobs': { priority: '0.9', changefreq: 'hourly' },
  'admit-card': { priority: '0.8', changefreq: 'hourly' },
  'results': { priority: '0.8', changefreq: 'hourly' },
  'answer-key': { priority: '0.7', changefreq: 'daily' },
  'syllabus': { priority: '0.6', changefreq: 'weekly' }
};
const STATIC_CATEGORY_PATHS = Object.keys(CATEGORY_META);

function xmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return [
    '  <url>',
    `    <loc>${xmlEscape(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : '',
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : '',
    priority ? `    <priority>${priority}</priority>` : '',
    '  </url>'
  ].filter(Boolean).join('\n');
}

function isoDate(value) {
  const d = value ? new Date(value) : new Date();
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function latestTimestamp(posts) {
  if (!posts.length) return new Date().toISOString();
  const max = posts.reduce((acc, p) => {
    const t = new Date(p.updatedAt || p.postedDate).getTime();
    return isNaN(t) ? acc : Math.max(acc, t);
  }, 0);
  return max ? new Date(max).toISOString() : new Date().toISOString();
}

/** Generates the sitemap covering every canonical, indexable public URL.
 *  Deliberately reads only from postsRepo.getPublished() — draft/pending/
 *  rejected posts and every admin route are structurally impossible to
 *  include here (Phase 23: "Never expose admin URLs through sitemaps").
 *
 *  lastmod on the homepage and each category page is now derived from the
 *  freshest real post in that scope (not `new Date()` on every request) —
 *  a lastmod that never actually reflects a content change trains crawlers
 *  to stop trusting it, which slows re-crawl of genuinely updated pages. */
function generateSitemapXml() {
  const posts = postsRepo.getPublished();

  const entries = [
    urlEntry(config.siteUrl + '/', latestTimestamp(posts), 'hourly', '1.0'),
    ...STATIC_CATEGORY_PATHS.map(cat => {
      const catPosts = posts.filter(p => p.category === cat);
      const meta = CATEGORY_META[cat];
      return urlEntry(`${config.siteUrl}/${cat}`, latestTimestamp(catPosts), meta.changefreq, meta.priority);
    }),
    ...posts.map(p => urlEntry(
      `${config.siteUrl}/${p.category}/${p.slug}`,
      isoDate(p.updatedAt || p.postedDate),
      CATEGORY_META[p.category] ? CATEGORY_META[p.category].changefreq.replace('hourly', 'daily') : 'daily',
      '0.6'
    ))
    // /search is deliberately never listed — it's noindexed (query pages
    // aren't unique content) and listing a noindexed URL in the sitemap
    // just wastes crawl budget and sends Search Console a false positive.
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

function generateRobotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    '',
    '# Query-string search results are non-unique (noindex,follow on the page',
    '# itself already) — disallowing the crawl too keeps limited crawl budget',
    '# on canonical content instead.',
    'Disallow: /search',
    '',
    "# Nothing under the admin path is ever linked from public pages or listed",
    "# here — the admin route is a runtime secret, not a fixed path, so there",
    "# is nothing fixed to disallow (Phase 4/23).",
    '',
    `Sitemap: ${config.siteUrl}/sitemap.xml`,
    ''
  ].join('\n');
}

module.exports = { generateSitemapXml, generateRobotsTxt };
