'use strict';

/**
 * Phase 4 — Secret admin entry.
 *
 * The secret path is NOT the authentication mechanism — it's an obscurity
 * layer on top of real auth (see src/auth). Any request under /admin that
 * doesn't match the configured secret prefix gets the exact same generic
 * response a random 404 on the public site would get, so probing /admin
 * cannot be used to confirm the admin panel even exists.
 */

function secretAdminGate(secretPrefix) {
  return (req, res, next) => {
    const cleanPath = req.path.replace(/\/+$/, '') || '/';
    const looksLikeAdmin = cleanPath === '/admin' || cleanPath.startsWith('/admin/');

    // A plain startsWith() would treat /admin/xyzabc as "inside" the real
    // secret path /admin/xyz (character-prefix match, no segment boundary),
    // letting it fall through instead of getting the same generic redirect
    // any other /admin/* guess gets — which would let an attacker binary-
    // search their way toward the real secret by observing which lookalike
    // paths behave differently. Requiring an exact match or a following
    // "/" closes that gap.
    const isRealSecretPath = cleanPath === secretPrefix || cleanPath.startsWith(`${secretPrefix}/`);

    if (looksLikeAdmin && !isRealSecretPath) {
      return res.redirect('/');
    }
    next();
  };
}

module.exports = secretAdminGate;
