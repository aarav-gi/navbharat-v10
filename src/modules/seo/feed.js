'use strict';

const postsRepo = require('../posts/repository');
const config = require('../../config');

function xmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function rfc822(value) {
  const d = value ? new Date(value) : new Date();
  return (isNaN(d.getTime()) ? new Date() : d).toUTCString();
}

/** RSS 2.0 feed of the most recent published posts across all categories.
 *  Distribution channel in its own right (feed readers, job aggregators)
 *  and an extra, low-latency discovery path for crawlers between sitemap
 *  refreshes — new posts show up here immediately since it's built from
 *  the same live query the homepage uses. */
function generateFeedXml(settings, limit) {
  const siteName = (settings && settings.siteName) || 'RozgarHub Naukri';
  const posts = postsRepo.getPublished().slice(0, limit || 50);

  const items = posts.map(p => {
    const url = `${config.siteUrl}/${p.category}/${p.slug}`;
    const desc = p.description && p.description.trim()
      ? p.description.trim()
      : `${p.organization} — ${p.title}`;
    return [
      '  <item>',
      `    <title>${xmlEscape(p.title)}</title>`,
      `    <link>${xmlEscape(url)}</link>`,
      `    <guid isPermaLink="true">${xmlEscape(url)}</guid>`,
      `    <pubDate>${rfc822(p.postedDate)}</pubDate>`,
      `    <category>${xmlEscape(p.category)}</category>`,
      `    <description>${xmlEscape(desc)}</description>`,
      '  </item>'
    ].join('\n');
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '<channel>',
    `  <title>${xmlEscape(siteName)} — Latest Updates</title>`,
    `  <link>${xmlEscape(config.siteUrl)}/</link>`,
    `  <description>Latest government job, admit card, result, answer key and syllabus updates from ${xmlEscape(siteName)}.</description>`,
    '  <language>en-in</language>',
    `  <lastBuildDate>${rfc822(new Date())}</lastBuildDate>`,
    ...items,
    '</channel>',
    '</rss>',
    ''
  ].join('\n');
}

module.exports = { generateFeedXml };
