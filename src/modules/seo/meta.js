'use strict';

/**
 * Central SEO meta-tag engine.
 *
 * Every public route builds its <title>/<meta description>/keywords through
 * this module instead of hand-writing strings in the controller, so the
 * rules (length caps, keyword templates, dynamic freshness signals) live in
 * exactly one place and stay consistent across the whole site.
 *
 * Design rules baked in here:
 *  - Titles: 50-60 chars is the safe zone before Google truncates in SERPs.
 *  - Descriptions: 120-158 chars — long enough to use the space, short
 *    enough to never get clipped with "...".
 *  - Descriptions are dynamic (org + post + a real date/fee/vacancy signal)
 *    rather than a static boilerplate line, because a unique, information-
 *    dense snippet measurably improves CTR from the SERP.
 *  - Nothing here fabricates data: every dynamic token falls back to a
 *    generic-but-true phrase when the underlying field is empty.
 */

const TITLE_MAX = 60;
const DESC_MIN_TARGET = 120;
const DESC_MAX = 158;

const CATEGORY_LABEL = {
  'latest-jobs': 'Recruitment Notification',
  'admit-card': 'Admit Card',
  'results': 'Result',
  'answer-key': 'Answer Key',
  'syllabus': 'Syllabus'
};

const CATEGORY_KEYWORDS = {
  'latest-jobs': ['sarkari naukri', 'government job notification', 'online form'],
  'admit-card': ['admit card download', 'hall ticket', 'exam city slip'],
  'results': ['result declared', 'merit list', 'cut off marks'],
  'answer-key': ['answer key download', 'objection', 'response sheet'],
  'syllabus': ['syllabus pdf', 'exam pattern', 'exam syllabus']
};

function truncate(str, max) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  // Don't cut mid-word — back off to the last whitespace.
  const lastSpace = cut.lastIndexOf(' ');
  let result = (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
  // Never leave a dangling connector (a bare "|", "-", "—") right before
  // the ellipsis — that reads as a broken title in the SERP.
  result = result.replace(/[|\-—:]+$/, '').trim();
  return result + '…';
}

function titleCase(str) {
  return String(str || '').replace(/\b\w/g, c => c.toUpperCase());
}

function siteSuffix(settings) {
  return settings && settings.siteName ? settings.siteName : 'RozgarHub Naukri';
}

/** Title for the homepage. Front-loads the primary keyword phrase, which
 *  matters more for the "/" URL than anywhere else on the site. */
function homeMeta(settings, siteUrl) {
  const brand = siteSuffix(settings);
  const title = truncate(`${brand} — Sarkari Naukri, Result, Admit Card 2026`, TITLE_MAX);
  const description = truncate(
    (settings && settings.footerDisclaimer) ||
    `${brand} par latest sarkari naukri, admit card, exam result, answer key aur syllabus ki authentic updates rozana paayein.`,
    DESC_MAX
  );
  return {
    title,
    description,
    canonicalUrl: `${siteUrl}/`,
    keywords: ['sarkari naukri', 'sarkari result', 'government jobs India', 'latest govt jobs', brand.toLowerCase()]
  };
}

function categoryMeta(category, settings, siteUrl, count) {
  const brand = siteSuffix(settings);
  const label = CATEGORY_LABEL[category] || category;
  const human = category.replace(/-/g, ' ');
  // "latest-jobs" already reads as "Latest Jobs" once humanized, so the
  // template drops the redundant leading "Latest" for that one category
  // instead of producing "Latest latest jobs".
  const heading = category === 'latest-jobs' ? titleCase(human) : `Latest ${titleCase(human)}`;
  const title = truncate(`${label} ${new Date().getFullYear()} — ${heading} | ${brand}`, TITLE_MAX);
  const countPhrase = count > 0 ? `${count}+ active ${human} listings` : `Latest ${human} updates`;
  const description = truncate(
    `${countPhrase} — verified links, official dates aur direct download. Updated daily on ${brand}.`,
    DESC_MAX
  );
  return {
    title,
    description,
    canonicalUrl: `${siteUrl}/${category}`,
    keywords: [...(CATEGORY_KEYWORDS[category] || []), human, brand.toLowerCase()]
  };
}

/** Post/detail page. This is the money page for organic traffic, so the
 *  description packs in the two or three facts a searcher actually scans
 *  for (organization, key date, fee/vacancy) instead of a generic line. */
function postMeta(post, settings, siteUrl) {
  const brand = siteSuffix(settings);
  const label = CATEGORY_LABEL[post.category] || post.category;
  const orgSuffix = post.organization ? ` | ${post.organization}` : ` | ${brand}`;
  const title = truncate(`${post.title} — ${label}${orgSuffix}`, TITLE_MAX);

  const facts = [];
  if (post.category === 'latest-jobs') {
    if (post.totalPosts) facts.push(`${post.totalPosts} vacancies`);
    if (post.applicationEnd) facts.push(`last date to apply ${post.applicationEnd}`);
  } else if ((post.category === 'admit-card' || post.category === 'answer-key') && post.applicationEnd) {
    facts.push(`key date ${post.applicationEnd}`);
  }

  const factPhrase = facts.length ? facts.join(', ') + '. ' : '';
  const org = post.organization || brand;
  const base = post.description && post.description.trim()
    ? post.description.trim()
    : `${org} has released ${post.title} (${label}).`;

  const description = truncate(`${base} ${factPhrase}Check eligibility & apply on ${brand}.`, DESC_MAX);

  return {
    title,
    description,
    canonicalUrl: `${siteUrl}/${post.category}/${post.slug}`,
    keywords: [
      post.organization,
      post.title,
      ...(CATEGORY_KEYWORDS[post.category] || []),
      brand.toLowerCase()
    ].filter(Boolean)
  };
}

function searchMeta(query, settings) {
  const brand = siteSuffix(settings);
  return {
    title: truncate(query ? `Search results: ${query} | ${brand}` : `Search Jobs & Results | ${brand}`, TITLE_MAX),
    description: truncate('Search government jobs, admit cards, results, answer keys and syllabus across all categories.', DESC_MAX),
    noindex: true // query-string pages are non-unique — kept out of the index deliberately
  };
}

module.exports = {
  homeMeta,
  categoryMeta,
  postMeta,
  searchMeta,
  truncate,
  DESC_MIN_TARGET,
  DESC_MAX,
  TITLE_MAX
};
