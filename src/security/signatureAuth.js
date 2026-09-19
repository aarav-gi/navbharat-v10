'use strict';

const crypto = require("crypto");

// In-memory set for tracking used nonces with TTL cleanup
const seenNonces = new Map();
const MAX_SKEW_MS = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  const now = Date.now();
  for (const [nonce, expireAt] of seenNonces.entries()) {
    if (now > expireAt) {
      seenNonces.delete(nonce);
    }
  }
}, 60 * 1000).unref();

function canonicalPayload(bodyString, timestamp, nonce) {
  return `${timestamp}.${nonce}.${bodyString}`;
}

function verifyPayloadSignature(req, secret) {
  const timestamp = req.headers["x-timestamp"];
  const nonce = req.headers["x-nonce"];
  const signature = req.headers["x-signature"];

  // If no signature headers provided, return skipped
  if (!timestamp || !nonce || !signature) {
    return { verified: false, missing: true };
  }

  const skew = Math.abs(Date.now() - Number(timestamp));
  if (!Number.isFinite(skew) || skew > MAX_SKEW_MS) {
    return { verified: false, reason: "Timestamp out of range (possible replay)" };
  }

  if (seenNonces.has(nonce)) {
    return { verified: false, reason: "Replay attack detected: Nonce already consumed" };
  }

  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(canonicalPayload(rawBody, timestamp, nonce))
    .digest("hex");

  const expectedBuf = Buffer.from(expectedSig, "hex");
  const givenBuf = Buffer.from(String(signature), "hex");

  if (expectedBuf.length !== givenBuf.length || !crypto.timingSafeEqual(expectedBuf, givenBuf)) {
    return { verified: false, reason: "Cryptographic HMAC signature mismatch" };
  }

  // Cache nonce until its timestamp expiration
  seenNonces.set(nonce, Date.now() + MAX_SKEW_MS);
  return { verified: true };
}

module.exports = { verifyPayloadSignature };
