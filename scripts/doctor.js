#!/usr/bin/env node
'use strict';

/**
 * Setup diagnostic. Run any time something feels broken, especially
 * "admin login says invalid username/password" or "getting errors
 * everywhere":
 *
 *   node scripts/doctor.js
 *
 * Prints exactly which database file this project is reading from, what's
 * in it, and whether an admin login actually exists — the three things a
 * generic "Invalid username or password" or "Something went wrong" page
 * can't tell you on their own.
 */

const db = require('../src/database/connection');
const config = require('../src/config');

console.log('=== NavBharat Naukri — setup diagnostic ===\n');

console.log('Database file:');
console.log(`  ${db.name}`);
console.log('  (server.js and every script in scripts/ must print this SAME path —');
console.log('   if create-admin.js was ever run from a different working directory');
console.log('   with a relative DATABASE_PATH set, it may have written to a');
console.log('   different file than the one the server reads from.)\n');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
console.log(`Tables found (${tables.length}):`);
console.log(`  ${tables.join(', ') || '(none — schema did not apply, this is a real problem)'}\n`);

if (!tables.includes('users')) {
  console.log('❌ No "users" table exists yet. The schema did not get applied.');
  console.log('   This usually means the process crashed before finishing startup —');
  console.log('   check the terminal output from `node server.js` for the actual error.\n');
  process.exit(1);
}

const users = db.prepare(`
  SELECT u.id, u.username, r.name AS role_name, u.is_active, u.failed_attempts, u.locked_until
  FROM users u
  JOIN roles r ON r.id = u.role_id
  ORDER BY u.id
`).all();

console.log(`Admin users in this database (${users.length}):`);
if (users.length === 0) {
  console.log('  ❌ None. This is why login fails — there is no account to log in with yet.');
  console.log('  Create one with:');
  console.log('    node scripts/create-admin.js\n');
} else {
  users.forEach(u => {
    const lockNote = u.locked_until && new Date(u.locked_until) > new Date() ? ` — LOCKED until ${u.locked_until}` : '';
    const activeNote = u.is_active ? '' : ' — INACTIVE';
    console.log(`  #${u.id}  ${u.username}  role=${u.role_name}${activeNote}${lockNote}`);
  });
  console.log('\n  (Passwords are never stored or shown — only a hash. If you forgot');
  console.log('   yours, the only way back in is creating a new admin user above with');
  console.log('   a different username, or clearing failed_attempts/locked_until for');
  console.log('   an existing one directly in the database.)\n');
}

console.log('Admin panel URL for this .env:');
console.log(`  http://localhost:${config.port}${config.adminSecretPrefix}\n`);

if (!process.env.ADMIN_SECRET_SLUG) {
  console.log('⚠️  ADMIN_SECRET_SLUG is not set in .env — a random one was generated for');
  console.log('   THIS run only, and will be different the next time the server starts.');
  console.log('   Set a fixed ADMIN_SECRET_SLUG in .env or the admin URL will keep moving.\n');
}

const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'site'").get();
if (settingsRow) {
  const settings = JSON.parse(settingsRow.value);
  const ads = settings.ads || {};
  console.log('Ads configuration:');
  console.log(`  master enabled: ${ads.enabled ? 'yes' : 'no'}`);
  if (ads.slots) {
    for (const [slot, cfg] of Object.entries(ads.slots)) {
      console.log(`  ${slot}: type=${cfg.type}${cfg.type === 'image' ? `, imageUrl=${cfg.imageUrl || '(empty!)'}` : ''}`);
    }
  }
  if (!ads.enabled) console.log('  ⚠️  Ads will not show anywhere on the site until "enabled" is turned on in Admin → Ads.');
  console.log('');
}

console.log('Done.');
process.exit(0);
