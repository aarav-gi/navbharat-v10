'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../../config');

async function broadcastCustomMessage(payload, options = {}) {
  const siteOrigin = (config.siteUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const { title, customText, targetUrl, imagePath } = payload;

  // Build the Click-Bait High-Traffic Message
  const finalLink = targetUrl.startsWith('http') ? targetUrl : `${siteOrigin}${targetUrl}`;
  
  let messageText = `🚨 *${title}* 🚨\n\n`;
  if (customText) {
    messageText += `${customText}\n\n`;
  } else {
    messageText += `❓ *पदों की संख्या, आयु सीमा और पूरी जानकारी*\n`;
    messageText += `❓ *ऑनलाइन आवेदन कैसे करें?*\n\n`;
  }
  messageText += `✅ *पूरी डिटेल और Official Notification के लिए नीचे दिए लिंक पर क्लिक करें:* 👇👇\n`;
  messageText += `🔗 ${finalLink}\n\n`;
  messageText += `📲 *अपने दोस्तों और ग्रुप्स में शेयर करें!*`;

  const results = {};
  const isDevMode = (process.env.TELEGRAM_BOT_TOKEN || '').startsWith('test_');

  // ==========================================
  // DEV SIMULATOR (Console Print)
  // ==========================================
  if (isDevMode) {
    console.log("\n========================================================");
    console.log("📢 [DEDICATED BROADCAST CONSOLE TRIGGERED]");
    console.log("========================================================");
    console.log(`🖼️ Image:       ${imagePath || 'None (Text Message)'}`);
    console.log(`🎯 Target Link: ${finalLink}\n`);
    
    if (options.telegram) {
      console.log("---------------- [TELEGRAM DISPATCH] ----------------");
      console.log(`Channel: ${process.env.TELEGRAM_CHANNEL_ID}`);
      console.log(messageText);
      results.telegram = 'SIMULATED_SUCCESS';
    }
    if (options.facebook) {
      console.log("\n---------------- [FACEBOOK DISPATCH] ----------------");
      console.log(`Target Page: ${process.env.FB_PAGE_ID}`);
      console.log(`Link: ${finalLink}`);
      results.facebook = 'SIMULATED_SUCCESS';
    }
    if (options.whatsapp) {
      console.log("\n---------------- [WHATSAPP DISPATCH] ----------------");
      console.log(`Webhook: ${process.env.WHATSAPP_WEBHOOK_URL}`);
      results.whatsapp = 'SIMULATED_SUCCESS';
    }
    console.log("========================================================\n");
    return results;
  }

  // ==========================================
  // LIVE PRODUCTION ENGINE
  // ==========================================

  // TELEGRAM LIVE
  if (options.telegram && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNEL_ID) {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHANNEL_ID;

      if (imagePath && fs.existsSync(`public${imagePath}`)) {
        const filePath = path.resolve(`public${imagePath}`);
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);

        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('caption', messageText);
        formData.append('parse_mode', 'Markdown');
        formData.append('photo', new Blob([fileBuffer]), fileName);

        const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: formData });
        const data = await res.json();
        results.telegram = data.ok ? 'success' : data.description;
      } else {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: messageText, parse_mode: 'Markdown' })
        });
        const data = await res.json();
        results.telegram = data.ok ? 'success' : data.description;
      }
    } catch (e) {
      results.telegram = 'error: ' + e.message;
    }
  }

  // FACEBOOK LIVE
  if (options.facebook && process.env.FB_PAGE_ACCESS_TOKEN && process.env.FB_PAGE_ID) {
    try {
      const pageId = process.env.FB_PAGE_ID;
      const token = process.env.FB_PAGE_ACCESS_TOKEN;

      if (imagePath && fs.existsSync(`public${imagePath}`)) {
        const filePath = path.resolve(`public${imagePath}`);
        const fileBuffer = fs.readFileSync(filePath);
        const formData = new FormData();
        formData.append('message', `${title}\n\nCheck Full Details: ${finalLink}`);
        formData.append('access_token', token);
        formData.append('source', new Blob([fileBuffer]), path.basename(filePath));

        const fbRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/photos`, { method: 'POST', body: formData });
        const fbData = await fbRes.json();
        results.facebook = fbData.id ? 'success' : JSON.stringify(fbData.error);
      } else {
        const fbRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: messageText, link: finalLink, access_token: token })
        });
        const fbData = await fbRes.json();
        results.facebook = fbData.id ? 'success' : JSON.stringify(fbData.error);
      }
    } catch (e) {
      results.facebook = 'error: ' + e.message;
    }
  }

  // WHATSAPP WEBHOOK LIVE
  if (options.whatsapp && process.env.WHATSAPP_WEBHOOK_URL) {
    try {
      const waRes = await fetch(process.env.WHATSAPP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          url: finalLink,
          imageUrl: imagePath ? `${siteOrigin}${imagePath}` : null
        })
      });
      results.whatsapp = waRes.ok ? 'success' : `HTTP ${waRes.status}`;
    } catch (e) {
      results.whatsapp = 'error: ' + e.message;
    }
  }

  return results;
}

module.exports = { broadcastCustomMessage };
