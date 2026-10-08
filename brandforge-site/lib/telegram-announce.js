'use strict';

// Public announcements to the BrandForge Telegram channel. Same rule as Discord: plain, anonymous
// lines about real activity, sent best-effort and never allowed to break the action behind them.
// The bot must be an admin of the channel. Without TELEGRAM_BOT_TOKEN nothing is sent.

function announceChatId(env = process.env) {
  const explicit = String((env && env.TELEGRAM_ANNOUNCE_CHAT_ID) || '').trim();
  if (explicit) return explicit;
  // Public channels can be addressed by handle.
  const handle = String((env && env.TELEGRAM_CHANNEL_HANDLE) || 'BrandForge_gg').replace(/^@/, '').trim();
  return handle ? `@${handle}` : '';
}

async function postTelegramAnnouncement(text, opts = {}) {
  const { env = process.env, fetchImpl = fetch } = opts;
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = announceChatId(env);
  const clean = String(text || '').trim().slice(0, 1000);
  if (!token) return { sent: false, reason: 'not_configured' };
  if (!clean) return { sent: false, reason: 'empty' };
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: clean, disable_web_page_preview: true }),
    });
    if (!response.ok) return { sent: false, reason: `http_${response.status}` };
    return { sent: true };
  } catch (cause) {
    console.warn('postTelegramAnnouncement failed:', cause instanceof Error ? cause.message : cause);
    return { sent: false, reason: 'network' };
  }
}

module.exports = { announceChatId, postTelegramAnnouncement };
