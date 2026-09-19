'use strict';

/**
 * Phase 7 — RBAC. Authorization always happens server-side here; the admin
 * UI may hide buttons for convenience, but every route re-checks permissions.
 */

const db = require('../database/connection');
const { getSessionUser } = require('./session');
const { logAudit } = require('../app/middleware/audit');

const getPermsForRole = db.prepare(`
  SELECT p.name FROM permissions p
  JOIN role_permissions rp ON rp.permission_id = p.id
  WHERE rp.role_id = ?
`);

/** Attach req.user + req.permissions (Set) if a valid session cookie is present. Never blocks. */
function attachUser(req, res, next) {
  const user = getSessionUser(req);
  if (user) {
    req.user = user;
    req.permissions = new Set(getPermsForRole.all(user.role_id).map(r => r.name));
  }
  next();
}

/** Block unless authenticated. Generic redirect — never reveals whether the resource exists. */
function requireAuth(req, res, next) {
  if (req.user) return next();
  return res.redirect(res.locals.secretUrl || '/');
}

/** Block unless the authenticated user holds `permission`. Server-side, not UI-based. */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.redirect(res.locals.secretUrl || '/');
    if (req.permissions && req.permissions.has(permission)) return next();

    logAudit(req, {
      action: 'authorization_denied',
      entityType: 'permission',
      entityId: permission,
      details: { path: req.originalUrl }
    });
    return res.status(403).render('admin/error', {
      title: 'Access Denied',
      message: 'You do not have permission to perform this action.'
    });
  };
}

module.exports = { attachUser, requireAuth, requirePermission };
