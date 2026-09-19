'use strict';

const postsRepo = require('../../modules/posts/repository');
const { broadcastCustomMessage } = require('../../modules/broadcast/broadcastService');
const config = require('../../config');

function showBroadcastPage(req, res) {
  const publishedPosts = postsRepo.getPublished();
  res.render('admin/broadcast', {
    title: 'Social Media Broadcaster',
    secretUrl: config.adminSecretPrefix,
    user: req.user,
    posts: publishedPosts,
    siteUrl: config.siteUrl,
    success: req.query.success || null,
    error: req.query.error || null
  });
}

async function sendBroadcast(req, res) {
  const body = req.body || {};
  const { title, customText, targetUrl, broadcast_telegram, broadcast_facebook, broadcast_whatsapp } = body;

  if (!title || !targetUrl) {
    return res.redirect(`${config.adminSecretPrefix}/broadcast?error=Title and Target Link are required`);
  }

  const imagePath = req.file ? ('/uploads/' + req.file.filename) : null;

  try {
    await broadcastCustomMessage({
      title: title.trim(),
      customText: (customText || '').trim(),
      targetUrl: targetUrl.trim(),
      imagePath
    }, {
      telegram: broadcast_telegram === '1',
      facebook: broadcast_facebook === '1',
      whatsapp: broadcast_whatsapp === '1'
    });

    res.redirect(`${config.adminSecretPrefix}/broadcast?success=Broadcast sent successfully to selected channels!`);
  } catch (err) {
    console.error('Broadcast failed:', err.message);
    res.redirect(`${config.adminSecretPrefix}/broadcast?error=${encodeURIComponent(err.message)}`);
  }
}

module.exports = { showBroadcastPage, sendBroadcast };
