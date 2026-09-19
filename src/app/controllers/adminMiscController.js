'use strict';

const settingsRepo = require('../../modules/settings/repository');
const analyticsService = require('../../modules/analytics/service');
const postsRepo = require('../../modules/posts/repository');
const trendingService = require('../../modules/trending/service');
const mediaService = require('../../modules/media/service');
const db = require('../../database/connection');
const { logAudit } = require('../middleware/audit');

function showSettings(req, res) {
  res.render('admin/settings', { title: 'Site Settings', posts: postsRepo.getPublished(), success: null, settings: settingsRepo.getSettings() });
}

function saveSettings(req, res) {
  const body = req.body || {};
  
  // Parse dynamic affiliate books arrays from form
  const titles = Array.isArray(body.book_titles) ? body.book_titles : [body.book_titles].filter(Boolean);
  const prices = Array.isArray(body.book_prices) ? body.book_prices : [body.book_prices].filter(Boolean);
  const urls = Array.isArray(body.book_urls) ? body.book_urls : [body.book_urls].filter(Boolean);
  
  const books = [];
  for (let i = 0; i < titles.length; i++) {
    if (titles[i] && titles[i].trim()) {
      books.push({
        title: titles[i].trim(),
        price: (prices[i] || '').trim(),
        url: (urls[i] || '').trim()
      });
    }
  }

  const updated = settingsRepo.updateSettings({
    siteName: (body.siteName || '').trim(),
    logoText: (body.logoText || '').trim().toUpperCase(),
    tagline: (body.tagline || '').trim(),
    footerDisclaimer: (body.footerDisclaimer || '').trim(),
    social: {
      telegram: (body.social_telegram || '').trim(),
      whatsapp: (body.social_whatsapp || '').trim(),
      instagram: (body.social_instagram || '').trim(),
      facebook: (body.social_facebook || '').trim()
    },
    books: books
  });
  logAudit(req, { action: 'settings.update', entityType: 'settings' });
  res.render('admin/settings', { title: 'Site Settings', posts: postsRepo.getPublished(), success: 'Saved!', settings: updated });
}

function showAds(req, res) {
  res.render('admin/ads', { title: 'Ads Control', posts: postsRepo.getPublished(), success: null, error: null, settings: settingsRepo.getSettings() });
}

const SLOT_NAMES = ['top', 'content', 'bottom'];

/** Builds one slot's settings from the submitted form fields, saving a new
 *  uploaded banner image (if provided) and cleaning up the file it replaces. */
function buildSlot(body, slotKey, previousSlot) {
  const type = ['none', 'code', 'image'].includes(body[`${slotKey}_type`]) ? body[`${slotKey}_type`] : 'none';
  const slot = { type, code: '', imageUrl: '', linkUrl: '', altText: '' };
  const hadPreviousImage = previousSlot && previousSlot.type === 'image' && previousSlot.imageUrl;

  if (type === 'code') {
    slot.code = (body[`${slotKey}_code`] || '').trim();
    // Switching away from 'image' orphans the uploaded file on disk unless
    // it's cleaned up here — the settings JSON stops referencing it, but
    // nothing in public/uploads/ads/ ever gets deleted otherwise.
    if (hadPreviousImage) mediaService.deleteBannerByUrl(previousSlot.imageUrl);
  } else if (type === 'image') {
    const newImageData = body[`${slotKey}_imageData`]; // data: URL from the browser file picker, if a new file was chosen
    slot.linkUrl = (body[`${slotKey}_linkUrl`] || '').trim();
    slot.altText = (body[`${slotKey}_altText`] || '').trim();

    if (newImageData) {
      slot.imageUrl = mediaService.saveBannerFromDataUrl(newImageData);
      if (hadPreviousImage) mediaService.deleteBannerByUrl(previousSlot.imageUrl);
    } else {
      // No new file chosen — keep whatever was already uploaded for this slot.
      slot.imageUrl = (previousSlot && previousSlot.imageUrl) || '';
    }
  } else {
    // type === 'none'
    if (hadPreviousImage) mediaService.deleteBannerByUrl(previousSlot.imageUrl);
  }

  return slot;
}

function saveAds(req, res) {
  const body = req.body || {};
  const current = settingsRepo.getSettings();

  try {
    const slots = {};
    for (const key of SLOT_NAMES) slots[key] = buildSlot(body, key, current.ads.slots[key]);

    const updated = settingsRepo.updateSettings({ ads: { enabled: body.enabled === 'true', slots } });
    logAudit(req, { action: 'ads.update', entityType: 'settings' });
    res.render('admin/ads', { title: 'Ads Control', posts: postsRepo.getPublished(), success: 'Ads updated!', error: null, settings: updated });
  } catch (e) {
    const message = e instanceof mediaService.MediaValidationError ? e.message : 'Could not save ad configuration.';
    if (!(e instanceof mediaService.MediaValidationError)) console.error('ads.update failed:', e.message);
    res.status(400).render('admin/ads', { title: 'Ads Control', posts: postsRepo.getPublished(), success: null, error: message, settings: current });
  }
}

function showAnalytics(req, res) {
  const data = analyticsService.getDashboardData();
  res.render('admin/analytics', { title: 'Analytics', posts: postsRepo.getPublished(), ...data });
}

function showAudit(req, res) {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all();
  const securityEvents = db.prepare('SELECT * FROM security_events ORDER BY created_at DESC LIMIT 100').all();
  res.render('admin/audit', { title: 'Audit & Security Log', posts: postsRepo.getPublished(), logs, securityEvents });
}

function dashboard(req, res) {
  const pendingCount = postsRepo.getPending().length;
  const publishedCount = postsRepo.getPublished().length;
  const failedLogins = db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE action = 'login_failed' AND created_at > datetime('now','-1 day')").get().c;
  const securityEventsToday = db.prepare("SELECT COUNT(*) c FROM security_events WHERE created_at > datetime('now','-1 day')").get().c;
  const analyticsData = analyticsService.getDashboardData();

  res.render('admin/dashboard', {
    title: 'Dashboard',
    posts: postsRepo.getPublished(),
    pendingCount,
    publishedCount,
    failedLogins,
    securityEventsToday,
    ...analyticsData
  });
}

function showTrending(req, res) {
  res.render('admin/trending', {
    title: 'Trending Ranking',
    posts: postsRepo.getPublished(),
    success: null,
    weights: trendingService.getWeights(),
    trending: trendingService.getTrending(20)
  });
}

function saveTrendingWeights(req, res) {
  const body = req.body || {};
  const weights = trendingService.setWeights({
    freshness: body.freshness,
    velocity: body.velocity,
    deadline: body.deadline,
    engagement: body.engagement,
    updateFrequency: body.updateFrequency,
    searchDemand: body.searchDemand
  });
  logAudit(req, { action: 'trending.weights.update', entityType: 'settings', details: weights });

  res.render('admin/trending', {
    title: 'Trending Ranking',
    posts: postsRepo.getPublished(),
    success: 'Weights saved — rankings will refresh on the next scoring cycle (every 5 min).',
    weights,
    trending: trendingService.getTrending(20)
  });
}

function recomputeTrendingNow(req, res) {
  const count = trendingService.recomputeAll();
  logAudit(req, { action: 'trending.recompute', entityType: 'settings', details: { count } });
  res.redirect((res.locals.secretUrl || '') + '/trending');
}


function getActiveApiKeyRecord() {
  return db.prepare(`
    SELECT *, datetime(expires_at, 'localtime') as local_expiry,
           datetime(created_at, 'localtime') as local_created
    FROM api_keys 
    WHERE is_active = 1 
    ORDER BY id DESC LIMIT 1
  `).get();
}

function showApiKey(req, res) {
  const currentKey = getActiveApiKeyRecord();
  const isExpired = currentKey ? (new Date(currentKey.expires_at).getTime() < Date.now()) : true;

  res.render('admin/api-key', {
    title: 'Ingestion API Key',
    currentKey: currentKey || null,
    isExpired: isExpired,
    success: req.query.success || null,
    settings: settingsRepo.getSettings()
  });
}

function regenerateApiKey(req, res) {
  const crypto = require('crypto');
  // Deactivate all previous keys
  db.prepare('UPDATE api_keys SET is_active = 0 WHERE is_active = 1').run();

  // Create new key valid for exactly 24 hours
  const newKey = "nb_live_" + crypto.randomBytes(24).toString("hex");
  db.prepare(`
    INSERT INTO api_keys (name, key_value, created_at, expires_at, is_active)
    VALUES (?, ?, datetime('now'), datetime('now', '+24 hours'), 1)
  `).run("private_review_hub", newKey);

  logAudit(req, { action: 'api_key.regenerate', entityType: 'security' });
  res.redirect(`${res.locals.secretUrl}/api-key?success=New%2024-Hour%20API%20Key%20Generated!`);
}

module.exports = {
  showApiKey,
  regenerateApiKey,
  showSettings, saveSettings, showAds, saveAds, showAnalytics, showAudit, dashboard,
  showTrending, saveTrendingWeights, recomputeTrendingNow
};
