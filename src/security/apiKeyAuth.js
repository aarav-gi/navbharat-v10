'use strict';

const crypto = require("crypto");
const db = require("../database/connection");
const { logSecurityEvent } = require("./eventLog");
const { verifyPayloadSignature } = require("./signatureAuth");

function hashKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function apiKeyAuth(req, res, next) {
  const authHeader = req.headers["authorization"] || req.headers["x-api-key"];
  let providedKey = "";

  if (authHeader) {
    if (authHeader.startsWith("Bearer ")) {
      providedKey = authHeader.slice(7).trim();
    } else {
      providedKey = authHeader.trim();
    }
  }

  if (!providedKey) {
    return res.status(401).json({ success: false, message: "Unauthorized: Missing API key" });
  }

  // Retrieve active unexpired API keys
  const activeKeys = db.prepare(`
    SELECT id, name, key_value, expires_at 
    FROM api_keys
    WHERE is_active = 1
      AND expires_at > datetime('now')
    ORDER BY id DESC
  `).all();

  if (!activeKeys || activeKeys.length === 0) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: API key expired or none active. Regenerate in Admin Panel."
    });
  }

  const providedHash = hashKey(providedKey);
  let matchedRecord = null;

  // Support both SHA-256 hashed keys and legacy plaintext keys securely
  for (const record of activeKeys) {
    const stored = record.key_value;
    const isStoredHashed = stored.length === 64 && /^[0-9a-f]+$/i.test(stored);

    if (isStoredHashed) {
      if (crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(stored))) {
        matchedRecord = record;
        break;
      }
    } else {
      // Legacy plaintext constant-time compare
      if (providedKey.length === stored.length && crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(stored))) {
        matchedRecord = record;
        break;
      }
    }
  }

  if (!matchedRecord) {
    logSecurityEvent(req, "api_unauthorized_attempt", { path: req.originalUrl, ip: req.ip });
    return res.status(401).json({ success: false, message: "Unauthorized: Invalid API key" });
  }

  // Verify HMAC signature if signature headers are present (mutation endpoints)
  if (req.headers["x-signature"]) {
    const sigResult = verifyPayloadSignature(req, providedKey);
    if (!sigResult.verified) {
      logSecurityEvent(req, "api_signature_failure", { reason: sigResult.reason, path: req.originalUrl });
      return res.status(401).json({ success: false, message: "Unauthorized: " + sigResult.reason });
    }
  }

  req.apiKey = matchedRecord;
  next();
}

module.exports = apiKeyAuth;
