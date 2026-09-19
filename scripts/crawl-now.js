#!/usr/bin/env node
'use strict';

/**
 * Runs a single crawl cycle immediately and exits. Useful for testing a
 * newly added source, or for running the crawler from an external cron /
 * systemd timer instead of (or in addition to) the in-process scheduler
 * in src/jobs/crawler.js.
 *
 * Usage:
 *   node scripts/crawl-now.js
 */

const engine = require('../src/modules/crawler/engine');

(async () => {
  console.log('=== NavBharat Naukri — manual crawl cycle ===\n');
  const result = await engine.runCrawlCycle();
  if (result.skipped) {
    console.log('A cycle was already running — nothing to do.');
  } else {
    console.log(`\nDone — ${result.sourceCount} source(s) scanned in ${result.durationSec}s.`);
    console.log('New notices, if any, are waiting in the admin Review Queue.');
  }
  process.exit(0);
})().catch((e) => {
  console.error('Crawl cycle failed:', e);
  process.exit(1);
});
