'use strict';

/**
 * Trending scoring (Phase 18).
 *
 * Deliberately NOT "sort by raw views" — a post that's been up for a month
 * with a big view total would permanently dominate a naive ranking, and a
 * handful of repeat visitors could game it. Instead each post gets a score
 * combining six independent signals, each normalized to a comparable range
 * before weighting:
 *
 *   freshness         exponential decay from posting date (7-day half-life)
 *   velocity          is view interest accelerating right now, not just high
 *   deadline          how close the application deadline is (0 once expired)
 *   engagement        sustained views over the last 7 days, log-scaled
 *   update_frequency  how often admins/crawler have revised the post lately
 *   search_demand     recent on-site searches that look like they targeted it
 *
 * Weights are configurable from the admin (Settings → Trending) and are
 * always re-normalized to sum to 1, so the score stays comparable over time
 * even after an admin tweaks the mix.
 */

const postsRepo = require('../posts/repository');
const trendingRepo = require('./repository');
const settingsRepo = require('../settings/repository');
const cache = require('../../cache/memoryCache');

const WEIGHTS_KEY = 'trending_weights';

const DEFAULT_WEIGHTS = Object.freeze({
  freshness: 0.20,
  velocity: 0.25,
  deadline: 0.20,
  engagement: 0.15,
  updateFrequency: 0.10,
  searchDemand: 0.10
});

function getWeights() {
  const stored = settingsRepo.getValue(WEIGHTS_KEY, null);
  if (!stored) return { ...DEFAULT_WEIGHTS };
  // Merge over defaults so a partially-saved/older config can't produce NaNs.
  return { ...DEFAULT_WEIGHTS, ...stored };
}

function setWeights(patch) {
  const next = { ...getWeights(), ...patch };
  for (const key of Object.keys(next)) next[key] = Math.max(0, Number(next[key]) || 0);

  const total = Object.values(next).reduce((a, b) => a + b, 0) || 1;
  for (const key of Object.keys(next)) next[key] = next[key] / total; // always sums to 1

  settingsRepo.setValue(WEIGHTS_KEY, next);
  cache.invalidate('trending:');
  return next;
}

function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a, b) {
  return (a.getTime() - b.getTime()) / 86400000;
}

/** log-scaled to ~0..1 so one viral post can't blow out the whole ranking;
 *  `scale` is roughly "the value that counts as maxed out". */
function logNorm(value, scale) {
  return Math.min(1, Math.log(1 + Math.max(0, value)) / Math.log(1 + scale));
}

function scorePost(post, weights, now) {
  // 1. Freshness — exponential decay from posted date, 7-day half-life.
  const posted = safeDate(post.postedDate) || safeDate(post.createdAt) || now;
  const ageDays = Math.max(0, daysBetween(now, posted));
  const freshness = Math.exp(-ageDays / 7);

  // 2. Velocity — interest accelerating, not just high. Compare the last
  // 2 days of views against the 2 days before that.
  const recent = trendingRepo.viewsInRange(post.id, 2, 0);
  const prior = trendingRepo.viewsInRange(post.id, 4, 2);
  const accelerating = recent >= prior;
  const velocity = logNorm(recent, 30) * (accelerating ? 1 : 0.5);

  // 3. Deadline proximity — closer application deadlines matter more;
  // expired or far-off deadlines contribute nothing.
  const deadlineDate = safeDate(post.applicationEnd);
  let deadline = 0;
  if (deadlineDate) {
    const daysLeft = daysBetween(deadlineDate, now);
    if (daysLeft >= 0 && daysLeft <= 30) deadline = 1 - daysLeft / 30;
  }

  // 4. Engagement — sustained interest over the trailing week, log-scaled
  // so it rewards consistent traffic rather than a single burst.
  const weekViews = trendingRepo.viewsSince(post.id, 7);
  const engagement = logNorm(weekViews, 200);

  // 5. Update frequency — admins/crawler actively correcting or adding
  // vacancy/date info is a real relevance signal (e.g. a result post that
  // just had merit-list links added).
  const revisions = trendingRepo.revisionsSince(post.id, 14);
  const updateFrequency = logNorm(revisions, 5);

  // 6. Search demand — best-effort match against recent on-site searches.
  const demandHits = trendingRepo.searchDemandFor(post, 7);
  const searchDemand = logNorm(demandHits, 20);

  const score =
    weights.freshness * freshness +
    weights.velocity * velocity +
    weights.deadline * deadline +
    weights.engagement * engagement +
    weights.updateFrequency * updateFrequency +
    weights.searchDemand * searchDemand;

  return {
    score,
    freshness,
    velocity,
    deadline,
    engagement,
    update_frequency: updateFrequency,
    search_demand: searchDemand
  };
}

/** Recompute scores for every published post. This is a background-job
 *  concern (Phase 16/25), not something done per-request — see
 *  src/jobs/trending.js for the scheduler that calls this on an interval. */
function recomputeAll() {
  const weights = getWeights();
  const now = new Date();
  const ids = trendingRepo.getAllPublishedIds();

  for (const id of ids) {
    const post = postsRepo.getById(id);
    if (!post) continue;
    trendingRepo.saveScore(id, scorePost(post, weights, now));
  }

  trendingRepo.pruneUnpublished();
  cache.invalidate('trending:');
  return ids.length;
}

function getTrending(limit = 12) {
  return cache.cached(`trending:top:${limit}`, 30 * 1000, () => trendingRepo.getTrendingPosts(limit));
}

/** Called from the public post-detail controller. Hashed IP only — no raw
 *  IPs are ever persisted, consistent with the rest of the app's analytics. */
function trackView(postId, ipHash) {
  return trendingRepo.recordView(postId, ipHash);
}

module.exports = { getWeights, setWeights, recomputeAll, getTrending, trackView, DEFAULT_WEIGHTS };
