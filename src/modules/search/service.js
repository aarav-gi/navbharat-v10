'use strict';

/**
 * Minimal search (groundwork for Phase 19).
 *
 * This is intentionally simple — substring matching with a basic relevance
 * count, no autocomplete/typo-tolerance/synonyms yet — but it's a real,
 * working search over live published data, and every query is logged so
 * the trending engine has genuine "search demand" data to work with
 * instead of a placeholder. A dedicated index (e.g. SQLite FTS5) can
 * replace the matching logic later without changing the call site.
 */

const db = require('../../database/connection');
const postsRepo = require('../posts/repository');

const insertQuery = db.prepare("INSERT INTO search_queries (query, normalized, created_at) VALUES (?, ?, datetime('now'))");

function normalize(raw) {
  return String(raw || '').toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 100);
}

function logQuery(raw) {
  const normalized = normalize(raw);
  if (normalized.length < 2) return;
  insertQuery.run(String(raw).slice(0, 200), normalized);
}

function search(raw, limit = 30) {
  const q = normalize(raw);
  if (!q) return { query: raw || '', results: [] };

  logQuery(raw);

  const terms = q.split(' ').filter(Boolean);
  const all = postsRepo.getPublished();

  const scored = all
    .map(post => {
      const haystack = `${post.title} ${post.organization} ${post.category}`.toLowerCase();
      let matches = 0;
      for (const term of terms) if (haystack.includes(term)) matches += 1;
      return { post, matches };
    })
    .filter(r => r.matches > 0)
    .sort((a, b) => b.matches - a.matches);

  return { query: raw, results: scored.slice(0, limit).map(r => r.post) };
}

module.exports = { search, logQuery, normalize };
