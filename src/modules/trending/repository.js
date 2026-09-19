'use strict';

const db = require('../../database/connection');

const recordViewSeen = db.prepare('INSERT OR IGNORE INTO post_view_seen (date, ip_hash, post_id) VALUES (?, ?, ?)');
const bumpViewDaily = db.prepare(`
  INSERT INTO post_view_daily (post_id, date, views) VALUES (?, ?, 1)
  ON CONFLICT(post_id, date) DO UPDATE SET views = views + 1
`);

/** One counted view per (day, visitor, post) — refreshing the tab repeatedly
 *  cannot be used to manipulate a post's trending score (Phase 18). */
function recordView(postId, ipHash) {
  const today = new Date().toISOString().split('T')[0];
  const isNewToday = recordViewSeen.run(today, ipHash, postId).changes > 0;
  if (isNewToday) bumpViewDaily.run(postId, today);
  return isNewToday;
}

function viewsSince(postId, days) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(views), 0) AS total FROM post_view_daily
    WHERE post_id = ? AND date >= date('now', ?)
  `).get(postId, `-${days} days`);
  return row.total;
}

/** Views in the half-open window [now - fromDaysAgo, now - toDaysAgo). */
function viewsInRange(postId, fromDaysAgo, toDaysAgo) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(views), 0) AS total FROM post_view_daily
    WHERE post_id = ? AND date >= date('now', ?) AND date < date('now', ?)
  `).get(postId, `-${fromDaysAgo} days`, `-${toDaysAgo} days`);
  return row.total;
}

function revisionsSince(postId, days) {
  const row = db.prepare(`
    SELECT COUNT(*) AS c FROM post_revisions
    WHERE post_id = ? AND created_at >= datetime('now', ?)
  `).get(postId, `-${days} days`);
  return row.c;
}

const recentQueries = db.prepare(`SELECT normalized FROM search_queries WHERE created_at >= datetime('now', ?)`);

/** Best-effort correlation between recent on-site searches and this post —
 *  there's no full-text index yet, so this is a substring match rather than
 *  true relevance ranking (see modules/search for the same caveat). */
function searchDemandFor(post, days) {
  const title = (post.title || '').toLowerCase();
  const org = (post.organization || '').toLowerCase();
  if (!title && !org) return 0;

  let hits = 0;
  for (const row of recentQueries.all(`-${days} days`)) {
    const q = row.normalized;
    if (!q || q.length < 3) continue;
    if (title.includes(q) || org.includes(q) || (org && q.includes(org))) hits++;
  }
  return hits;
}

const upsertScore = db.prepare(`
  INSERT INTO trending_scores (post_id, score, freshness, velocity, deadline, engagement, update_frequency, search_demand, computed_at)
  VALUES (@post_id, @score, @freshness, @velocity, @deadline, @engagement, @update_frequency, @search_demand, datetime('now'))
  ON CONFLICT(post_id) DO UPDATE SET
    score = excluded.score,
    freshness = excluded.freshness,
    velocity = excluded.velocity,
    deadline = excluded.deadline,
    engagement = excluded.engagement,
    update_frequency = excluded.update_frequency,
    search_demand = excluded.search_demand,
    computed_at = excluded.computed_at
`);

function saveScore(postId, breakdown) {
  upsertScore.run({ post_id: postId, ...breakdown });
}

function getTrendingPosts(limit) {
  // application_end/total_posts aliased to camelCase to match the shape
  // views already expect from modules/posts/repository (parseJsonFields).
  return db.prepare(`
    SELECT p.*,
           p.application_end AS applicationEnd,
           p.total_posts AS totalPosts,
           t.score, t.freshness, t.velocity, t.deadline, t.engagement,
           t.update_frequency AS updateFrequency, t.search_demand AS searchDemand,
           t.computed_at AS computedAt
    FROM trending_scores t
    JOIN posts p ON p.id = t.post_id
    WHERE p.status = 'published'
    ORDER BY t.score DESC
    LIMIT ?
  `).all(limit);
}

function getAllPublishedIds() {
  return db.prepare("SELECT id FROM posts WHERE status = 'published'").all().map(r => r.id);
}

/** Drop scores for posts that are no longer published (rejected/archived/deleted)
 *  so they can't linger in a stale trending list. */
function pruneUnpublished() {
  db.prepare(`
    DELETE FROM trending_scores
    WHERE post_id NOT IN (SELECT id FROM posts WHERE status = 'published')
  `).run();
}

module.exports = {
  recordView, viewsSince, viewsInRange, revisionsSince, searchDemandFor,
  saveScore, getTrendingPosts, getAllPublishedIds, pruneUnpublished
};
