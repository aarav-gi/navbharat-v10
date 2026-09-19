'use strict';

/**
 * Phase 9 — Security headers.
 *
 * CSP is deliberately scoped to what the current templates actually load
 * (Tailwind's CDN script + Google Fonts). Tighten this further once Tailwind
 * is compiled to a static stylesheet instead of the CDN script (recommended
 * next step — the CDN build is fine for now but is not meant for production
 * at scale and forces 'unsafe-inline' on styles below).
 */

function securityHeaders(req, res, next) {
  const isProd = process.env.NODE_ENV === 'production';

  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://cdn.tailwindcss.com 'unsafe-inline'",
      "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'"
    ].join('; ')
  );

  if (isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.removeHeader('X-Powered-By');
  next();
}

module.exports = securityHeaders;
