// Discovery notifier (journey gap #5): the moment a project reaches
// READY_FOR_REVIEW, post one message into the specialists' Discord channel so a
// human starts the proposal fast. Best-effort like every notify path — no
// webhook configured, an empty response or a provider error is a logged no-op,
// never a thrown error. The webhook URL lives in DISCORD_WEBHOOK_URL
// (.env.local + Vercel production) and is never logged.

const { resolveSiteUrl } = require('./auth-utils');

// Discord embed title limit; mentions inside embeds never ping, and
// allowed_mentions: { parse: [] } keeps the whole payload ping-free regardless.
const TITLE_MAX = 256;

function discoveryMessage({ title, conversationId }) {
  const cleanTitle =
    String(title ?? '').trim().slice(0, TITLE_MAX) || 'Untitled project';
  const chatUrl = `${resolveSiteUrl()}/chat?conversationId=${encodeURIComponent(conversationId)}`;

  return {
    username: 'BrandForge',
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: cleanTitle,
        url: chatUrl,
        description:
          'A founder sent a brief for review — open the chat to read it and start the proposal.',
        color: 0xe8571e,
        footer: { text: 'BrandForge · discovery' },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

async function notifyDiscordDiscovery(conversationId, title) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { skipped: true };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discoveryMessage({ title, conversationId })),
    });
    if (!response.ok) {
      console.warn(`notifyDiscordDiscovery: webhook responded ${response.status}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (cause) {
    console.warn(
      'notifyDiscordDiscovery failed:',
      cause instanceof Error ? cause.message : cause
    );
    return { ok: false };
  }
}

module.exports = { discoveryMessage, notifyDiscordDiscovery };
