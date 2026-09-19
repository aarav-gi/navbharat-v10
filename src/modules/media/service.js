'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'public', 'uploads', 'ads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = 2 * 1024 * 1024; // 2MB — a banner image has no business being bigger

// Allowed types, each with a magic-byte check so a mislabeled/spoofed MIME
// on the data URL can't smuggle in something else (Phase 29 requirement:
// never trust the declared type alone).
const TYPES = {
  'image/png': { ext: 'png', check: buf => buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) },
  'image/jpeg': { ext: 'jpg', check: buf => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff },
  'image/webp': { ext: 'webp', check: buf => buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP' },
  'image/gif': { ext: 'gif', check: buf => buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.slice(0, 6).toString('ascii')) }
};

class MediaValidationError extends Error {}

/**
 * Accepts a `data:<mime>;base64,<data>` string (as produced by the browser's
 * FileReader in the admin ad-banner uploader), validates it, and writes it
 * to isolated storage under public/uploads/ads/ with a random filename —
 * the original filename is never trusted or used (Phase 29).
 *
 * Returns the public URL path to the saved file (e.g. '/uploads/ads/<id>.png').
 */
function saveBannerFromDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new MediaValidationError('Expected a data: URL from the file picker.');
  }

  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new MediaValidationError('Malformed image data.');

  const [, declaredMime, base64] = match;
  const type = TYPES[declaredMime.toLowerCase()];
  if (!type) throw new MediaValidationError('Unsupported image type. Use PNG, JPEG, WebP or GIF.');

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch (e) {
    throw new MediaValidationError('Could not decode image data.');
  }

  if (buffer.length === 0) throw new MediaValidationError('Empty file.');
  if (buffer.length > MAX_BYTES) throw new MediaValidationError('Image is larger than the 2MB limit.');
  if (!type.check(buffer)) throw new MediaValidationError('File content does not match its declared image type.');

  const filename = `${crypto.randomUUID()}.${type.ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer, { mode: 0o644 });

  return `/uploads/ads/${filename}`;
}

/** Best-effort cleanup when a slot's image is replaced/removed. Path is
 *  always rebuilt from a validated basename — never from raw user input —
 *  so this can't be used for path traversal. */
function deleteBannerByUrl(url) {
  if (typeof url !== 'string') return;
  const base = path.basename(url);
  if (!/^[a-f0-9-]+\.(png|jpg|webp|gif)$/i.test(base)) return; // only ever our own generated names
  const full = path.join(UPLOAD_DIR, base);
  fs.unlink(full, () => {}); // fire-and-forget; missing file is not an error here
}

module.exports = { saveBannerFromDataUrl, deleteBannerByUrl, MediaValidationError };
