'use strict';

/**
 * Minimal robots.txt policy checker.
 *
 * Per the project's crawling boundaries: the platform only collects
 * publicly accessible information from official sources, and must not
 * bypass a site's stated access policy. This module fetches and caches
 * each domain's /robots.txt once, and exposes isAllowed(url) so the
 * crawler can skip (and record) any path a source has disallowed for
 * bots, instead of fetching it anyway.
 *
 * This is deliberately simple — it understands User-agent / Disallow /
 * Allow groups for '*' (and, if present, our own UA token) and basic
 * '*'/'$' wildcarding. It does not implement crawl-delay directives
 * (the engine already applies its own fixed politeness delay between
 * requests) or sitemap discovery.
 */

const https = require('https');
const http = require('http');

const UA_TOKEN = 'NavBharatNaukriBot';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — robots.txt rarely changes intra-day
const cache = new Map(); // origin -> { rules, fetchedAt }

function fetchText(urlStr, timeoutMs = 8000) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(urlStr);
      const client = urlObj.protocol === 'https:' ? https : http;
      const req = client.get(urlObj, {
        timeout: timeoutMs,
        headers: { 'User-Agent': `${UA_TOKEN}/1.0 (+official-source-aggregator)` }
      }, (res) => {
        if (res.statusCode && res.statusCode >= 400) { res.resume(); return resolve(null); }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch (_) {
      resolve(null);
    }
  });
}

// Parses robots.txt text into { agentGroups: Map<agentToken, {disallow:[], allow:[]}> }
function parseRobots(text) {
  const groups = new Map();
  let currentAgents = [];
  const ensure = (agent) => {
    if (!groups.has(agent)) groups.set(agent, { disallow: [], allow: [] });
    return groups.get(agent);
  };

  const lines = (text || '').split(/\r?\n/);
  for (let raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      // A run of consecutive User-agent lines all belong to the same group.
      if (currentAgents.length && groups.has('__pending__')) {
        // no-op, handled below
      }
      currentAgents.push(value.toLowerCase());
      continue;
    }
    if (field === 'disallow' || field === 'allow') {
      if (currentAgents.length === 0) continue;
      for (const agent of currentAgents) {
        const g = ensure(agent);
        if (value) g[field].push(value);
        else if (field === 'disallow') g.disallow.push(''); // empty Disallow = allow everything
      }
      continue;
    }
    // Any other directive (Crawl-delay, Sitemap, ...) ends the current group's
    // agent list per the informal spec's common implementation.
    currentAgents = [];
  }
  return groups;
}

function patternToRegex(pattern) {
  // Robots.txt path matching: '*' = wildcard, trailing '$' = end anchor.
  let endsWithDollar = pattern.endsWith('$');
  let p = endsWithDollar ? pattern.slice(0, -1) : pattern;
  const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + (endsWithDollar ? '$' : ''));
}

function pickGroup(groups) {
  const specific = groups.get(UA_TOKEN.toLowerCase());
  if (specific) return specific;
  return groups.get('*') || { disallow: [], allow: [] };
}

async function getRules(origin) {
  const cached = cache.get(origin);
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) return cached.rules;

  const text = await fetchText(origin + '/robots.txt');
  const groups = text ? parseRobots(text) : new Map();
  const rules = pickGroup(groups);
  cache.set(origin, { rules, fetchedAt: Date.now() });
  return rules;
}

/**
 * Returns true if fetching `urlStr` is allowed by the target site's
 * robots.txt. Fails open (allowed) if robots.txt is missing or
 * unreachable — a missing robots.txt is not a disallow signal.
 */
async function isAllowed(urlStr) {
  let urlObj;
  try { urlObj = new URL(urlStr); } catch (_) { return true; }
  const origin = `${urlObj.protocol}//${urlObj.host}`;
  const rules = await getRules(origin);
  const path = urlObj.pathname + (urlObj.search || '');

  const matches = (list) => list
    .filter(Boolean)
    .map(patternToRegex)
    .some((re) => re.test(path));

  const disallowed = matches(rules.disallow);
  if (!disallowed) return true;
  // An explicit, more specific Allow overrides a Disallow (longest match wins
  // in practice for well-formed files; a simple "any allow match" is a
  // reasonable conservative approximation here since our sources are a
  // small, curated, hand-verified list of official notice pages).
  const allowed = matches(rules.allow);
  return allowed;
}

module.exports = { isAllowed, UA_TOKEN };
