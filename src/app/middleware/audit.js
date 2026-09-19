'use strict';

const db = require('../../database/connection');
const { hashIp } = require('../../auth/session');

const insert = db.prepare(`
  INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details, ip_hash)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

/**
 * Phase 30 — Audit logging. `details` must never contain passwords, tokens,
 * or session secrets — callers pass only business-relevant context.
 */
function logAudit(req, { action, entityType = null, entityId = null, details = {} }) {
  try {
    insert.run(
      req.user ? req.user.id : null,
      req.user ? req.user.username : null,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      hashIp(req.ip)
    );
  } catch (e) {
    console.error('audit log failed:', e.message);
  }
}

module.exports = { logAudit };
