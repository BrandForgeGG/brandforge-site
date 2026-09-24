'use strict';

// Outbound notifications for the small BrandForge team, over Telegram.
//
// One bot, one team chat: TELEGRAM_BOT_TOKEN (from @BotFather) and TELEGRAM_CHAT_ID (the team
// group — founder + operator — or a single person's chat) are server-only env vars. When either
// is missing every notify() call is a silent no-op, so local dev and CI need nothing.
//
// Design rules:
// - Never throws and never blocks the caller's success path: failures are logged and reported
//   in the return value, the API route still answers 200.
// - No payment secrets beyond what the chat already shows (tx hash, amounts) and no message
//   bodies — only event metadata.
// - Dependency-free CommonJS so node:test can exercise it without a build.

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const SEND_TIMEOUT_MS = 5000;
const MAX_FIELD_LENGTH = 160;

function isNotifyConfigured(env) {
  const source = env || process.env;
  return Boolean(
    String(source.TELEGRAM_BOT_TOKEN || '').trim() &&
      String(source.TELEGRAM_CHAT_ID || '').trim()
  );
}

// One line of human-provided text, made safe for a single message.
function clip(value, max = MAX_FIELD_LENGTH) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function money(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }
  return `${clip(currency) || 'EUR'} ${value.toLocaleString('en-US')}`;
}

// Maps a product event to the message the team chat receives. Returns null for unknown events
// so a typo at a call site fails quietly instead of spamming the chat.
function buildMessage(event, details = {}) {
  switch (event) {
    case 'review_requested':
      return `New project ready for review (discovery at ${clip(details.percent) || '?'}%). Open the staff inbox and join the chat.`;

    case 'application_submitted':
      return `New operator application from ${clip(details.email) || 'unknown'}. Review it at /admin/applications.`;

    case 'proposal_sent': {
      const parts = [`Proposal sent to the founder: "${clip(details.title)}"`];
      const price = money(details.totalAmount, details.currency);
      if (price) parts.push(price);
      const weeks = clip(details.weeks);
      if (weeks) parts.push(weeks);
      return `${parts.join(' · ')}.`;
    }

    case 'proposal_answered':
      return `The founder answered proposal "${clip(details.title)}": ${clip(details.status) || 'updated'}.`;

    case 'payment_submitted':
      return `Funding tx submitted for verification: ${clip(details.txHash)}${
        clip(details.network) ? ` on ${clip(details.network)}` : ''
      }. Confirm it on-chain, then verify in the project panel.`;

    case 'payment_verified':
      return 'Funding verified on-chain — the project is funded and delivery has started.';

    case 'payment_rejected':
      return `The submitted payment could not be verified${clip(details.note) ? `: ${clip(details.note)}` : ''}. The founder has been asked to resubmit.`;

    case 'payment_released': {
      const price = money(details.amount, details.currency);
      return `Milestone payment "${clip(details.title)}"${price ? ` (${price})` : ''} released to the operator.`;
    }

    case 'task_review':
      return `Task delivered and awaiting founder approval: "${clip(details.title)}"${
        clip(details.assigneeName) ? ` (${clip(details.assigneeName)})` : ''
      }.`;

    default:
      return null;
  }
}

// Low-level sender. Options allow tests to inject env + fetch without touching globals.
async function sendTelegramMessage(text, options = {}) {
  const env = options.env || process.env;

  if (!isNotifyConfigured(env)) {
    return { sent: false, reason: 'not_configured' };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return { sent: false, reason: 'no_fetch' };
  }

  const token = String(env.TELEGRAM_BOT_TOKEN).trim();
  const chatId = String(env.TELEGRAM_CHAT_ID).trim();
  const body = JSON.stringify({
    chat_id: chatId,
    text: String(text).slice(0, 4000),
    disable_web_page_preview: true,
  });

  try {
    const response = await fetchImpl(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal:
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(SEND_TIMEOUT_MS)
          : undefined,
    });

    if (!response || !response.ok) {
      const status = response ? response.status : 'no_response';
      console.error(`notify: telegram sendMessage answered HTTP ${status}`);
      return { sent: false, reason: `http_${status}` };
    }

    return { sent: true };
  } catch (error) {
    console.error('notify: telegram sendMessage failed:', error instanceof Error ? error.message : error);
    return { sent: false, reason: 'network' };
  }
}

// The public entry point. Await it inside the route (serverless runtimes may kill fire-and-forget
// work after the response); it is fast, bounded by a timeout, and never throws.
async function notify(event, details = {}, options = {}) {
  const text = buildMessage(event, details);

  if (!text) {
    return { sent: false, reason: 'unknown_event' };
  }

  return sendTelegramMessage(text, options);
}

module.exports = {
  TELEGRAM_API_BASE,
  isNotifyConfigured,
  buildMessage,
  sendTelegramMessage,
  notify,
};
