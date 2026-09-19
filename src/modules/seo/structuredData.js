'use strict';

/**
 * Reusable JSON-LD graph builders.
 *
 * Kept separate from the .ejs partials so the *data shape* (what counts as
 * valid, non-misleading structured data) lives in testable JS, while the
 * views stay responsible only for serializing + escaping it into a
 * <script> tag. Every builder here only describes content that is actually
 * rendered on the page it's attached to — no fields are invented to make a
 * rich-result eligible when the page doesn't really have that content.
 */

/** Sitewide Organization + WebSite (with a Sitelinks Search Box action).
 *  Safe to render on every page — it never changes per-request. */
function organizationWebsiteGraph(settings, siteUrl) {
  const name = (settings && settings.siteName) || 'RozgarHub Naukri';
  return [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name,
      url: siteUrl,
      logo: `${siteUrl}/favicon.svg`
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name,
      publisher: { '@id': `${siteUrl}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${siteUrl}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string'
      }
    }
  ];
}

/** ItemList for a listing page (home or a /:category page) — tells search
 *  engines this page's real purpose is to enumerate these N items, which
 *  is what actually qualifies a page for list-style rich results. */
function itemListGraph(posts, siteUrl, name) {
  if (!posts || !posts.length) return null;
  return {
    '@type': 'ItemList',
    name,
    itemListElement: posts.slice(0, 30).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${siteUrl}/${p.category}/${p.slug}`,
      name: p.title
    }))
  };
}

/** FAQPage for a job-posting page, built strictly from fields already
 *  rendered elsewhere on that same page (dates/fee/how-to-apply) — never
 *  from invented Q&A, per Google's structured-data content policy. */
function jobFaqGraph(post) {
  if (!post || post.category !== 'latest-jobs') return null;

  const qa = [];

  qa.push({
    q: `What is the last date to apply for ${post.title}?`,
    a: post.applicationEnd
      ? `The last date to submit the online application for ${post.title} is ${post.applicationEnd}.`
      : `The last date will be as per the official notification released by ${post.organization}.`
  });

  if (post.totalPosts) {
    qa.push({
      q: `How many vacancies are there in ${post.title}?`,
      a: `${post.organization} has announced ${post.totalPosts} vacancies under ${post.title}.`
    });
  }

  qa.push({
    q: `How can I apply for ${post.title}?`,
    a: `Eligible candidates can apply online through the official application link on the ${post.organization} portal before the closing date.`
  });

  if (!qa.length) return null;

  return {
    '@type': 'FAQPage',
    mainEntity: qa.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a }
    }))
  };
}

module.exports = { organizationWebsiteGraph, itemListGraph, jobFaqGraph };
