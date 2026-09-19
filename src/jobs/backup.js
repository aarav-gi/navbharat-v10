'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../database/connection');

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const INTERVAL_MS = 12 * 60 * 60 * 1000; // Har 12 ghante me auto-backup
const MAX_BACKUPS_TO_KEEP = 7; // Storage safe rakhne ke liye purane prune honge

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

async function runBackup() {
  try {
    ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destPath = path.join(BACKUP_DIR, `rozgarhub-${timestamp}.sqlite3`);

    // Non-blocking hot backup via better-sqlite3 native engine
    await db.backup(destPath);
    console.log(`[backup] ✅ Automated snapshot created: ${path.basename(destPath)}`);

    pruneOldBackups();
  } catch (err) {
    console.error('[backup] ❌ Automated backup failed:', err.message);
  }
}

function pruneOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('rozgarhub-') && f.endsWith('.sqlite3'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); // Newest first

    if (files.length > MAX_BACKUPS_TO_KEEP) {
      const toDelete = files.slice(MAX_BACKUPS_TO_KEEP);
      toDelete.forEach(file => {
        fs.unlinkSync(path.join(BACKUP_DIR, file.name));
        console.log(`[backup] 🧹 Pruned old snapshot: ${file.name}`);
      });
    }
  } catch (err) {
    console.error('[backup] Prune error:', err.message);
  }
}

function start() {
  // Server boot hone ke 10 second baad pehla backup run karega
  setTimeout(() => {
    runBackup();
  }, 10 * 1000);

  const timer = setInterval(() => {
    runBackup();
  }, INTERVAL_MS);

  timer.unref();
  return timer;
}

module.exports = { start, runBackup };
