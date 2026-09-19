'use strict';

/**
 * Phase 5 / 10 — Password hashing.
 *
 * Uses Node's built-in crypto.scrypt (CPU+memory-hard, OWASP-approved when
 * Argon2id isn't available/portable). Never plain SHA-256, never a custom
 * algorithm, never an unsalted hash.
 *
 * If you later add the `argon2` package, swap the implementation of
 * hashPassword/verifyPassword below — nothing else in the app needs to change,
 * since callers only ever see a single opaque hash string.
 *
 * Stored format: scrypt$N$r$p$saltHex$hashHex
 */

const crypto = require('crypto');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password, salt, keylen, opts) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, opts, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

async function hashPassword(plainPassword) {
  if (typeof plainPassword !== 'string' || plainPassword.length < 8) {
    throw new Error('Password must be a string of at least 8 characters');
  }
  const salt = crypto.randomBytes(16);
  const { N, r, p, keylen } = SCRYPT_PARAMS;
  const derived = await scryptAsync(plainPassword, salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifyPassword(plainPassword, storedHash) {
  if (typeof plainPassword !== 'string' || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const N = parseInt(nStr, 10);
  const r = parseInt(rStr, 10);
  const p = parseInt(pStr, 10);
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');

  const derived = await scryptAsync(plainPassword, salt, expected.length, { N, r, p, maxmem: 128 * N * r * 2 });
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

module.exports = { hashPassword, verifyPassword };
