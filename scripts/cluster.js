'use strict';

/**
 * Multi-core bootstrap (Phase 24/scalability).
 *
 * `node server.js` runs as a single process on a single CPU core — fine
 * for development, a real limit once you're talking about hundreds of
 * thousands of concurrent visitors on one box. This wraps server.js in
 * Node's built-in `cluster` module so every CPU core runs its own worker,
 * all sharing port 3000 via the OS's connection distribution.
 *
 * Why this is safe with better-sqlite3: reads scale fine across processes
 * under WAL mode (each worker opens its own read/write handle to the same
 * file). Writes are admin-only and low-frequency on this project (content
 * publishing, not a checkout flow), so write contention between workers is
 * not a practical concern here. If write volume ever grows enough to
 * matter, migrating to Postgres is the next step — the repository layer
 * already isolates all SQL behind each module's repository.js file, so
 * that swap would not require touching controllers or views.
 *
 * Usage: `npm run start:cluster` (see package.json).
 * In production this still normally sits behind Nginx/a load balancer
 * doing TLS termination and static/response caching in front of it.
 */

const cluster = require('cluster');
const os = require('os');

if (cluster.isPrimary) {
  const numWorkers = parseInt(process.env.WEB_CONCURRENCY || '', 10) || os.cpus().length;

  console.log(`[cluster] starting ${numWorkers} worker(s) (one per CPU core)`);

  for (let i = 0; i < numWorkers; i++) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    console.error(`[cluster] worker ${worker.process.pid} died (code=${code} signal=${signal}) — restarting`);
    cluster.fork();
  });
} else {
  require('../server.js');
}
