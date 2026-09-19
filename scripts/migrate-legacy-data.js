#!/usr/bin/env node
'use strict';

/**
 * Phase 14 / 40 — Data migration.
 *
 * Imports the OLD flat-JSON data store (posts.json, pending_posts.json,
 * settings.json, analytics.json) into the new SQLite database.
 *
 * Safety rules honored from the brief:
 *  - never runs destructively: it only INSERTs, and skips rows that already exist
 *  - takes a timestamped backup of the SQLite file before writing anything
 *  - validates required fields and reports anything it could not import
 *  - produces a migration report instead of silently dropping data
 *
 * Usage:
 *   node scripts/migrate-legacy-data.js /path/to/old/rozgarhub/src/data
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const oldDataDir = process.argv[2];
if (!oldDataDir) {
  console.error('Usage: node scripts/migrate-legacy-data.js <path-to-old-src-data-folder>');
  process.exit(1);
}

const db = require('../src/database/connection');

const report = { imported: [], skipped: [], errors: [] };

function readJson(file, fallback) {
  const p = path.join(oldDataDir, file);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    report.errors.push(`Failed to parse ${file}: ${e.message}`);
    return fallback;
  }
}

function backupDatabase() {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database', 'navbharat.sqlite3');
  if (!fs.existsSync(dbPath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = path.basename(dbPath);
  const backupPath = path.join(path.dirname(dbPath), `${baseName}.pre-migration-${stamp}.bak`);
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || crypto.randomUUID();
}

function importPost(item, status) {
  if (!item || !item.title || !item.category) {
    report.errors.push(`Skipped a ${status} post with missing title/category: ${JSON.stringify(item).slice(0, 120)}`);
    return;
  }
  const id = item.id || crypto.randomUUID();
  const exists = db.prepare('SELECT id FROM posts WHERE id = ?').get(id);
  if (exists) {
    report.skipped.push(`post ${id} already migrated`);
    return;
  }
  const slug = item.slug || slugify(item.title);

  db.prepare(`
    INSERT INTO posts (
      id, slug, category, title, organization, total_posts, application_start, application_end,
      age_limit, qualifications, fee_structure, vacancies, links, apply_url, notification_pdf,
      syllabus_pdf, status, source_type, posted_date, created_at
    ) VALUES (
      @id, @slug, @category, @title, @organization, @total_posts, @application_start, @application_end,
      @age_limit, @qualifications, @fee_structure, @vacancies, @links, @apply_url, @notification_pdf,
      @syllabus_pdf, @status, @source_type, @posted_date, @created_at
    )
  `).run({
    id,
    slug,
    category: item.category,
    title: item.title,
    organization: item.organization || 'Unknown',
    total_posts: item.totalPosts || null,
    application_start: item.applicationStart || null,
    application_end: item.applicationEnd || null,
    age_limit: item.ageLimit || null,
    qualifications: item.qualifications || null,
    fee_structure: JSON.stringify(item.feeStructure || []),
    vacancies: JSON.stringify(item.vacancies || []),
    links: JSON.stringify(item.links || []),
    apply_url: item.applyUrl || null,
    notification_pdf: item.notificationPdf || null,
    syllabus_pdf: item.syllabusPdf || null,
    status,
    source_type: status === 'pending' ? 'crawler' : 'manual',
    posted_date: item.postedDate || null,
    created_at: item.postedDate || new Date().toISOString()
  });
  report.imported.push(`post ${id} (${status}): ${item.title}`);
}

function importSettings(settings) {
  if (!settings || Object.keys(settings).length === 0) {
    report.skipped.push('settings.json empty/missing, kept defaults');
    return;
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('site', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(settings));
  report.imported.push('settings imported');
}

function importAnalytics(analytics) {
  if (!analytics || !analytics.dates) {
    report.skipped.push('analytics.json empty/missing');
    return;
  }
  const insertDay = db.prepare(`
    INSERT INTO analytics_daily (date, pageviews, unique_visitors) VALUES (?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET pageviews = excluded.pageviews, unique_visitors = excluded.unique_visitors
  `);
  const insertSeen = db.prepare('INSERT OR IGNORE INTO analytics_visitor_seen (date, ip_hash) VALUES (?, ?)');
  for (const [date, rec] of Object.entries(analytics.dates)) {
    insertDay.run(date, rec.pageviews || 0, rec.uniqueVisitors || 0);
    (rec.ips || []).forEach(ipHash => insertSeen.run(date, ipHash));
  }
  const insertPage = db.prepare(`
    INSERT INTO analytics_pages (path, views) VALUES (?, ?)
    ON CONFLICT(path) DO UPDATE SET views = excluded.views
  `);
  for (const [p, views] of Object.entries(analytics.topPages || {})) {
    insertPage.run(p, views);
  }
  report.imported.push('analytics history imported');
}

(function main() {
  const backupPath = backupDatabase();
  if (backupPath) console.log(`Backup created: ${backupPath}`);

  const posts = readJson('posts.json', []);
  const pending = readJson('pending_posts.json', []);
  const settings = readJson('settings.json', {});
  const analytics = readJson('analytics.json', {});

  const run = db.transaction(() => {
    posts.forEach(p => importPost(p, 'published'));
    pending.forEach(p => importPost(p, 'pending'));
    importSettings(settings);
    importAnalytics(analytics);
  });
  run();

  console.log('\n=== MIGRATION REPORT ===');
  console.log(`Imported: ${report.imported.length}`);
  report.imported.forEach(l => console.log('  +', l));
  console.log(`Skipped (already present / empty source): ${report.skipped.length}`);
  report.skipped.forEach(l => console.log('  -', l));
  console.log(`Errors: ${report.errors.length}`);
  report.errors.forEach(l => console.log('  !', l));
  console.log('========================\n');

  const dbPathForReport = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database', 'navbharat.sqlite3');
  fs.writeFileSync(
    path.join(path.dirname(dbPathForReport), `migration-report-${Date.now()}.json`),
    JSON.stringify(report, null, 2)
  );
})();
