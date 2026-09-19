'use strict';

const db = require('../database/connection');
const { hashIp } = require('../auth/session');

const insert = db.prepare(`
  INSERT INTO security_events (event_type, detail, ip_hash) VALUES (?, ?, ?)
`);

function logSecurityEvent(req, eventType, detail) {
  try {
    insert.run(eventType, JSON.stringify(detail || {}), hashIp(req.ip));
  } catch (e) {
    // Security logging must never crash the request.
    console.error('security event log failed:', e.message);
  }
}

module.exports = { logSecurityEvent };
