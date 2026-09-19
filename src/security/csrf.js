'use strict';

const crypto = require('crypto');

const CSRF_COOKIE = 'nn_csrf';

function ensureCsrfCookie(req, res, next) {
  let token = req.cookies && req.cookies[CSRF_COOKIE];
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });
  }
  res.locals.csrfToken = token;
  req.csrfToken = token;
  next();
}

function verifyCsrf(req, res, next) {
  const methodsToCheck = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!methodsToCheck.includes(req.method)) return next();

  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE];
  
  // Check Body, Query Params (for multipart uploads), or Custom Headers
  const receivedToken = 
    (req.body && typeof req.body._csrf === 'string' ? req.body._csrf : null) ||
    (req.query && typeof req.query._csrf === 'string' ? req.query._csrf : null) ||
    (typeof req.headers['x-csrf-token'] === 'string' ? req.headers['x-csrf-token'] : null);

  if (
    typeof cookieToken === 'string' &&
    typeof receivedToken === 'string' &&
    cookieToken.length === receivedToken.length &&
    crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(receivedToken))
  ) {
    return next();
  }

  const { logSecurityEvent } = require('./eventLog');
  logSecurityEvent(req, 'csrf_failure', { path: req.originalUrl });
  return res.status(403).send('Request blocked: invalid or missing security token. Please refresh the page and try again.');
}

module.exports = { ensureCsrfCookie, verifyCsrf, CSRF_COOKIE };
