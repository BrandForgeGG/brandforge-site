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

const { resolveSiteUrl } = require('./auth-utils');
const { truncateText: clip, formatMoney: money } = require('./format');

// Deep link to the chat. Builders stay text-focused; the link is appended centrally
// so every ping carries its destination without each call site formatting URLs.
// Telegram renders the raw URL as a tappable link; Discord embeds get their own
// markdown link in ops-events.js (this module stays plain-text).
function chatUrlFor(details = {}) {
  if (typeof details.chatUrl === 'string' && details.chatUrl.trim()) {
    return details.chatUrl.trim();
  }
  if (typeof details.conversationId === 'string' && details.conversationId.trim()) {
    return `${resolveSiteUrl()}/chat?conversationId=${encodeURIComponent(details.conversationId.trim())}`;
  }
  return null;
}

function withChatUrl(text, details = {}) {
  if (!text) return text;
  const url = chatUrlFor(details);
  return url ? `${text}\n${url}` : text;
}

function isNotifyConfigured(env) {
  const source = env || process.env;
  return Boolean(
    String(source.TELEGRAM_BOT_TOKEN || '').trim() &&
      String(source.TELEGRAM_CHAT_ID || '').trim()
  );
}

// clip/money live in lib/format.js so every message builder renders identically.

// Maps a product event to the message the team chat receives. Returns null for unknown events
// so a typo at a call site fails quietly instead of spamming the chat.
function buildMessage(event, details = {}) {
  return withChatUrl(buildMessageText(event, details), details);
}

function buildMessageText(event, details = {}) {
  switch (event) {
    case 'review_requested':
      return `New project ready for review (discovery at ${clip(details.percent) || '?'}%). Open the staff inbox and join the chat.`;

    case 'application_submitted':
      return `New operator application from ${clip(details.email) || 'unknown'}. Review it at /admin/applications.`;

    case 'invite_sent':
      return `Invite sent to ${clip(details.email) || 'unknown'} by ${clip(details.invitedBy) || 'someone'} for a project chat.`;

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

    case 'proposal_countered': {
      const parts = [`Counter offer on "${clip(details.title)}"`];
      const price = money(details.totalAmount, details.currency);
      if (price) parts.push(price);
      const weeks = clip(details.weeks);
      if (weeks) parts.push(weeks);
      const by = details.by === 'specialist' ? 'specialist' : 'founder';
      const next =
        by === 'founder'
          ? 'The specialist may accept or counter back once.'
          : 'The founder has the final call: accept or decline.';
      return `${parts.join(' · ')} (from the ${by}). ${next}`;
    }

    case 'contract_signed':
      return 'Contract signed by both sides. The founder can fund escrow now — verify the transfer on-chain when it lands.';

    case 'contract_accepted':
      return 'The founder accepted the contract — open the chat and accept it to complete signing.';

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

// Optional URL buttons (Telegram inline keyboard): [{ text, url }]. URLs must be
// https — anything else is dropped, so a bad caller cannot smuggle a scheme.
// At most one row of three.
function validButtons(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      text: clip(item.text, 40) || 'Open',
      url: typeof item.url === 'string' ? item.url.trim() : '',
    }))
    .filter((item) => item.url.startsWith('https://'))
    .slice(0, 3);
}

// Every ping that knows its conversation carries an Open-chat button; callers with
// their own buttons keep them. The URL comes from the same trusted builder as the
// text link, never from user input.
function buttonsFor(details = {}, options = {}) {
  if (Array.isArray(options.buttons) && options.buttons.length > 0) {
    return validButtons(options.buttons);
  }
  const url = chatUrlFor(details);
  return url ? [{ text: 'Open chat', url }] : [];
}

// Low-level sender. Options allow tests to inject env + fetch without touching globals.
async function sendTelegramMessage(text, options = {}) {
  const env = options.env || process.env;

  // Team sends need both the bot token and the team chat. A personal send (see the chatId
  // handling below) only needs the token, because the destination is the member's own chat.
  const hasToken = Boolean(String(env.TELEGRAM_BOT_TOKEN || '').trim());
  const isPersonal = options.chatId !== undefined;
  const hasDestination = isPersonal || Boolean(String(env.TELEGRAM_CHAT_ID || '').trim());

  if (!hasToken || !hasDestination) {
    return { sent: false, reason: 'not_configured' };
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return { sent: false, reason: 'no_fetch' };
  }

  const token = String(env.TELEGRAM_BOT_TOKEN).trim();

  // `options.chatId` targets one person's own chat instead of the team chat, which is how a
  // member who linked Telegram (Pillar A) gets their own proposal-ready / payment-released
  // pings. The id is validated before use so a malformed profile value can never become an
  // arbitrary sendMessage target.
  const personalChatId = String(options.chatId ?? '').trim();

  if (options.chatId !== undefined && personalChatId !== '' && !/^-?\d{1,20}$/.test(personalChatId)) {
    return { sent: false, reason: 'invalid_chat_id' };
  }

  // A personal send must not silently fall back to the team chat: that would leak one
  // member's milestone news to the whole ops channel. If no valid id was supplied, stop.
  if (options.chatId !== undefined && personalChatId === '') {
    return { sent: false, reason: 'no_linked_chat' };
  }

  const chatId = personalChatId !== '' ? personalChatId : String(env.TELEGRAM_CHAT_ID).trim();

  // A personal send does not need the team chat to be configured at all.
  if (!personalChatId && !String(env.TELEGRAM_CHAT_ID || '').trim()) {
    return { sent: false, reason: 'not_configured' };
  }

  const buttons = validButtons(options.buttons);
  const body = JSON.stringify({
    chat_id: chatId,
    text: String(text).slice(0, 4000),
    disable_web_page_preview: true,
    ...(buttons.length > 0
      ? {
          reply_markup: {
            inline_keyboard: [buttons.map((button) => ({ text: button.text, url: button.url }))],
          },
        }
      : {}),
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

// Personal (member-facing) notifications, delivered to that person's own linked Telegram chat
// rather than the team chat. Same guarantees as the team messages: no message bodies, no
// secrets, never throws, silent no-op when unconfigured or when the person has not linked.
//
// A member-facing event is written in the second person and points at the app, because a
// founder reading it should never have to guess which internal system is talking to them.
function buildPersonalMessage(event, details = {}) {
  return withChatUrl(buildPersonalMessageText(event, details), details);
}

function buildPersonalMessageText(event, details = {}) {
  switch (event) {
    case 'proposal_ready':
      return `BrandForge: your proposal "${clip(details.title)}" is ready to review in the chat.${
        money(details.totalAmount, details.currency) ? ` ${money(details.totalAmount, details.currency)}` : ''
      }`;

    case 'funding_submitted':
      return 'BrandForge: we received your funding transfer and are verifying it on-chain. We will confirm here once it clears.';

    case 'funding_verified':
      return 'BrandForge: your funding is verified and work has started.';

    case 'contract_signed':
      return 'BrandForge: both sides signed the contract. Fund escrow when you are ready — the project starts once the transfer clears.';

    case 'contract_accepted':
      return 'BrandForge: the team accepted the contract. Accept it in the chat to complete signing.';

    case 'funding_rejected':
      return `BrandForge: we could not verify that transfer${
        clip(details.note) ? ` (${clip(details.note)})` : ''
      }. Please resend it from the chat.`;

    case 'milestone_ready':
      return `BrandForge: "${clip(details.title)}" is delivered and waiting for your approval.`;

    case 'payment_released':
      return `BrandForge: the payment for "${clip(details.title)}" has been released.`;

    case 'telegram_linked':
      return 'BrandForge: your Telegram is linked. You will get a ping here whenever something needs you.';

    // Operator-facing events: the promise above is only true if something actually
    // pings a linked staff member. A brief landing is the one moment they must act.
    case 'brief_ready':
      return `BrandForge: new brief ready for review: "${clip(details.title)}". Open your staff inbox.`;

    case 'proposal_answered': {
      const title = clip(details.title);
      const status = clip(details.status);
      if (status === 'accepted') {
        return `BrandForge: the founder accepted your proposal "${title}". You have been added to the chat.`;
      }
      if (status === 'changes_requested') {
        return `BrandForge: the founder requested changes to your proposal "${title}". Revise it from the staff inbox.`;
      }
      if (status === 'declined') {
        return `BrandForge: the founder declined your proposal "${title}".`;
      }
      return `BrandForge: the founder answered your proposal "${title}": ${status || 'updated'}.`;
    }

    // The specialist's turn: the founder countered, and the counter back (if they send one)
    // is the specialist's last offer — the product must say so before they spend it.
    case 'proposal_countered': {
      const title = clip(details.title);
      const price = money(details.totalAmount, details.currency);
      const weeks = clip(details.weeks);
      const facts = [price, weeks].filter(Boolean).join(', ');
      return `BrandForge: the founder countered your proposal "${title}"${facts ? ` at ${facts}` : ''}. Accept it or counter back; the counter back is your last offer.`;
    }

    // The founder's turn: the specialist's final counter is on the table and only the
    // founder can close it.
    case 'counter_back_ready': {
      const title = clip(details.title);
      const price = money(details.totalAmount, details.currency);
      const weeks = clip(details.weeks);
      const facts = [price, weeks].filter(Boolean).join(', ');
      return `BrandForge: the specialist countered back on "${title}"${facts ? ` (${facts})` : ''}. Accept or decline in the chat to close the deal.`;
    }

    default:
      return null;
    }
  }

// Sends to one person. `chatId` comes from their own profile row (written by the bot deep-link
// verifier), never from a request body, and an unlinked member is a silent no-op.
async function notifyUser(chatId, event, details = {}, options = {}) {
  const text = buildPersonalMessage(event, details);

  if (!text) {
    return { sent: false, reason: 'unknown_event' };
  }

  if (!/^-?\d{1,20}$/.test(String(chatId ?? '').trim())) {
    return { sent: false, reason: 'no_linked_chat' };
  }

  const buttons = buttonsFor(details, options);
  return sendTelegramMessage(text, {
    ...options,
    chatId: String(chatId).trim(),
    ...(buttons.length > 0 ? { buttons } : {}),
  });
}

// The public entry point. Await it inside the route (serverless runtimes may kill fire-and-forget
// work after the response); it is fast, bounded by a timeout, and never throws.
async function notify(event, details = {}, options = {}) {
  const text = buildMessage(event, details);

  if (!text) {
    return { sent: false, reason: 'unknown_event' };
  }

  const buttons = buttonsFor(details, options);
  return sendTelegramMessage(text, {
    ...options,
    ...(buttons.length > 0 ? { buttons } : {}),
  });
}

module.exports = {
  TELEGRAM_API_BASE,
  isNotifyConfigured,
  buildMessage,
  buildPersonalMessage,
  sendTelegramMessage,
  notify,
  notifyUser,
};
