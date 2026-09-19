'use strict';

const trendingService = require('../modules/trending/service');

const INTERVAL_MS = 5 * 60 * 1000; // recompute every 5 minutes

/** Scoring touches every published post; it belongs on a timer, never
 *  inline in a request handler (see Phase 24/39 — no blocking work on the
 *  request path). For this project's realistic post volume (hundreds to
 *  low thousands of live listings) a full recompute is a cheap, fast
 *  operation even on modest hardware. */
function start() {
  try {
    const count = trendingService.recomputeAll();
    console.log(`[trending] initial score computation done for ${count} posts`);
  } catch (e) {
    console.error('[trending] initial computation failed:', e.message);
  }

  const timer = setInterval(() => {
    try {
      trendingService.recomputeAll();
    } catch (e) {
      console.error('[trending] scheduled recompute failed:', e.message);
    }
  }, INTERVAL_MS);

  timer.unref(); // don't keep the process alive just for this timer
  return timer;
}

module.exports = { start };
