'use strict';

const engine = require('../modules/crawler/engine');

// Government notice boards update at most a few times a day — polling more
// often than this just burns the sources' bandwidth (and ours) for no new
// data. Overridable via env for local testing (e.g. CRAWLER_INTERVAL_MINUTES=5).
const INTERVAL_MS = (parseInt(process.env.CRAWLER_INTERVAL_MINUTES, 10) || 180) * 60 * 1000;

// Give the server a little time to finish booting (DB seed, cache warmup)
// before the first crawl cycle fires.
const INITIAL_DELAY_MS = 30 * 1000;

function runOnce(label) {
  engine.runCrawlCycle()
    .then((result) => {
      if (result && !result.skipped) {
        console.log(`[crawler] ${label} cycle done — ${result.sourceCount} source(s), ${result.durationSec}s`);
      }
    })
    .catch((e) => console.error(`[crawler] ${label} cycle failed:`, e.message));
}

function start() {
  const timeout = setTimeout(() => runOnce('initial'), INITIAL_DELAY_MS);
  timeout.unref();

  const timer = setInterval(() => runOnce('scheduled'), INTERVAL_MS);
  timer.unref(); // don't keep the process alive just for this timer

  console.log(`[crawler] scheduler armed — every ${Math.round(INTERVAL_MS / 60000)} min, first run in ${Math.round(INITIAL_DELAY_MS / 1000)}s`);
  return timer;
}

module.exports = { start };
