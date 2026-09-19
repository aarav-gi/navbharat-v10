'use strict';

const db = require('../../database/connection');
const cache = require('../../cache/memoryCache');

const SETTINGS_CACHE_KEY = 'settings:site';
const SETTINGS_TTL_MS = 60 * 1000;


function normalizeSocial(social) {
  const s = social || {};
  return {
    telegram: s.telegram !== undefined ? s.telegram : 'https://t.me/rozgarhubnaukri',
    whatsapp: s.whatsapp !== undefined ? s.whatsapp : 'https://whatsapp.com/channel/rozgarhubnaukri',
    instagram: s.instagram !== undefined ? s.instagram : 'https://instagram.com/rozgarhubnaukri',
    facebook: s.facebook !== undefined ? s.facebook : 'https://facebook.com/rozgarhubnaukri'
  };
}


function normalizeBooks(books) {
  if (Array.isArray(books)) return books;
  return [
    { title: 'General Hindi & Sanskrit Competitive Guide', price: '₹299', url: 'https://amzn.to/example1' },
    { title: 'Uttarakhand General Knowledge & Sociology Handbook', price: '₹349', url: 'https://amzn.to/example2' }
  ];
}

const EMPTY_SLOT = () => ({ type: 'none', code: '', imageUrl: '', linkUrl: '', altText: '' });

/** Normalizes the ads config to the current { enabled, slots: {top,content,bottom} }
 *  shape, backfilling from the older flat topBannerCode/inContentCode/bottomBannerCode
 *  fields so a site configured before the banner-image feature keeps working. */
function normalizeAds(ads) {
  const a = ads || {};
  if (a.slots) {
    return {
      enabled: !!a.enabled,
      slots: {
        top: { ...EMPTY_SLOT(), ...a.slots.top },
        content: { ...EMPTY_SLOT(), ...a.slots.content },
        bottom: { ...EMPTY_SLOT(), ...a.slots.bottom }
      }
    };
  }
  // Legacy shape migration (pre-banner-image admin panel).
  const toSlot = code => (code ? { ...EMPTY_SLOT(), type: 'code', code } : EMPTY_SLOT());
  return {
    enabled: !!a.enabled,
    slots: {
      top: toSlot(a.topBannerCode),
      content: toSlot(a.inContentCode),
      bottom: toSlot(a.bottomBannerCode)
    }
  };
}

function getSettings() {
  return cache.cached(SETTINGS_CACHE_KEY, SETTINGS_TTL_MS, () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'site'").get();
    const settings = row ? JSON.parse(row.value) : {};
    settings.ads = normalizeAds(settings.ads);
    settings.social = normalizeSocial(settings.social);
    settings.books = normalizeBooks(settings.books);
    return settings;
  });
}

function updateSettings(patch) {
  // Bypass the cache for the read-modify-write itself so two saves in
  // quick succession can't merge against a stale cached copy of the row.
  const row = db.prepare("SELECT value FROM settings WHERE key = 'site'").get();
  const current = row ? JSON.parse(row.value) : {};
  current.ads = normalizeAds(current.ads);
  current.social = normalizeSocial(current.social);
  current.books = normalizeBooks(current.books);
  const next = { ...current, ...patch };
  db.prepare("INSERT INTO settings (key, value) VALUES ('site', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(next));
  cache.invalidate(SETTINGS_CACHE_KEY);
  cache.invalidate('page:'); // cached pages may have rendered old settings (site name, ads, etc.)
  return next;
}

/** Generic key/value accessors, used by modules (e.g. trending weights)
 *  that need their own settings row instead of merging into 'site'. */
function getValue(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch (e) { return fallback; }
}

function setValue(key, value) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
  return value;
}

module.exports = { getSettings, updateSettings, getValue, setValue };
