'use strict';

/**
 * Lightweight in-process TTL cache.
 *
 * Why this exists: on a listings site almost all traffic is anonymous reads
 * of the same handful of pages (home, category pages, trending, a given
 * post). Without a cache, every one of those requests round-trips through
 * better-sqlite3 and re-serializes the same rows. Under a real traffic
 * spike (e.g. a viral SSC/Railway result), that read amplification — not
 * CPU or bandwidth — is what takes a Node+SQLite box down first.
 *
 * Putting a 20-60s TTL cache in front of those queries means a spike of
 * concurrent requests collapses into roughly one DB read per TTL window,
 * no matter how many people are hitting the page. Content still updates
 * quickly (short TTL) and is force-invalidated the moment an admin
 * publishes/edits/removes a post, so there's no meaningful staleness cost.
 *
 * Scope: this is a single-process cache. If the app is later run under
 * Node cluster / pm2 -i / multiple containers (see scripts/cluster.js),
 * each worker keeps its own copy — that's fine here because the TTLs are
 * short and the source of truth is always the database. It is NOT a
 * substitute for a shared cache (Redis) if the app grows to needing
 * cross-instance invalidation guarantees, but for this project's scale it
 * removes the vast majority of redundant DB load for near-zero complexity.
 */

const store = new Map(); // key -> { value, expiresAt }

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** Read-through helper: return the cached value, or compute + cache it. */
function cached(key, ttlMs, fn) {
  const hit = get(key);
  if (hit !== undefined) return hit;
  const value = fn();
  return set(key, value, ttlMs);
}

/** Delete one exact key, or every key starting with a prefix (e.g. 'posts:'). */
function invalidate(prefixOrKey) {
  if (store.has(prefixOrKey)) {
    store.delete(prefixOrKey);
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefixOrKey)) store.delete(key);
  }
}

function clear() {
  store.clear();
}

function size() {
  return store.size;
}

module.exports = { get, set, cached, invalidate, clear, size };
