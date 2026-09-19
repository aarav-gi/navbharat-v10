'use strict';

const { verifyPassword } = require('../../auth/password');
const { rotateSession, destroyCurrentSession } = require('../../auth/session');
const usersRepo = require('../../modules/users/repository');
const { logAudit } = require('../middleware/audit');

function showLogin(req, res) {
  if (req.user) return res.redirect(`${res.locals.secretUrl}/posts`);
  res.render('admin-login', {
    title: 'Admin Sign In',
    loginAction: `${res.locals.secretUrl}/login`,
    error: null
  });
}

async function login(req, res) {
  const { username, password } = req.body || {};
  const genericError = 'Invalid username or password.';

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.render('admin-login', { title: 'Admin Sign In', loginAction: `${res.locals.secretUrl}/login`, error: genericError });
  }

  const user = usersRepo.findByUsername(username.trim());

  if (!user) {
    // Do the same amount of work as a real check so response timing doesn't leak which usernames exist.
    await verifyPassword(password, `scrypt$16384$8$1$${'00'.repeat(16)}$${'00'.repeat(64)}`);
    logAudit(req, { action: 'login_failed', details: { reason: 'unknown_user' } });
    return res.render('admin-login', { title: 'Admin Sign In', loginAction: `${res.locals.secretUrl}/login`, error: genericError });
  }

  if (usersRepo.isLocked(user)) {
    logAudit(req, { action: 'login_blocked_locked', entityType: 'user', entityId: String(user.id) });
    return res.render('admin-login', {
      title: 'Admin Sign In',
      loginAction: `${res.locals.secretUrl}/login`,
      error: 'Account temporarily locked after repeated failed attempts. Try again later.'
    });
  }

  const ok = user.is_active && await verifyPassword(password, user.password_hash);
  if (!ok) {
    usersRepo.registerFailedAttempt(user.username);
    logAudit(req, { action: 'login_failed', entityType: 'user', entityId: String(user.id) });
    return res.render('admin-login', { title: 'Admin Sign In', loginAction: `${res.locals.secretUrl}/login`, error: genericError });
  }

  usersRepo.clearFailedAttempts(user.id);
  rotateSession(req, res, user); // session rotation on every successful login
  logAudit(req, { action: 'login_success', entityType: 'user', entityId: String(user.id) });
  res.redirect(`${res.locals.secretUrl}/posts`);
}

function logout(req, res) {
  if (req.user) logAudit(req, { action: 'logout', entityType: 'user', entityId: String(req.user.id) });
  destroyCurrentSession(req, res);
  res.redirect('/');
}

module.exports = { showLogin, login, logout };
