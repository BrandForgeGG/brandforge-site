'use strict';

// Marketing queue publisher (0019's missing half): turns a queued row into a
// real Discord or Telegram post. Pure decision/payload builders + the thin
// HTTP senders, all testable with an injected fetch. The service-role queue
// work lives in lib/project-db.ts (H7 boundary).
//
// Target rules — the DB stores names, never secrets:
// - discord target = a known kind ('milestones', 'live', 'devlog', ...) resolved
//   to a webhook URL from env at send time;
// - telegram target = '@channelhandle' or a numeric chat id, sent through the
//   shared bot token;
// - reddit = refused with a clear reason until Reddit OAuth exists.

const DISCORD_KIND_ENV = {
  milestones: 'DISCORD_MILESTONE_URL',
  live: 'DISCORD_LIVE_URL',
  showcase: 'DISCORD_SHOWCASE_URL',
  'public-changelog': 'DISCORD_PUBLIC_CHANGELOG_URL',
  changelog: 'DISCORD_PUBLIC_CHANGELOG_URL',
  devlog: 'DISCORD_DEVLOG_URL',
  discovery: 'DISCORD_WEBHOOK_URL',
  briefs: 'DISCORD_OPS_BRIEFS_URL',
  proposals: 'DISCORD_OPS_PROPOSALS_URL',
  matches: 'DISCORD_OPS_MATCHES_URL',
  contracts: 'DISCORD_OPS_CONTRACTS_URL',
};

function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Leaders/trimmers users paste from Discord UIs: '#', fullwidth '＃',
// '・' (U+30FB), '•', '·', tildes, quote arrows, whitespace.
const TARGET_TRIM = /^[#＃・•·~*>→\s]+/u;
const TARGET_TRIM_END = /[\s#＃・•·~*>→]+$/u;

function normalizeTarget(target) {
  return String(target ?? '')
    .replace(TARGET_TRIM, '')
    .replace(TARGET_TRIM_END, '')
    .trim()
    .toLowerCase();
}

// { ok, url } for discord, { ok, chatId } for telegram, { ok:false, error, terminal }
// when the row can never be delivered as configured.
function resolveDestination(channel, target, env) {
  if (channel === 'discord') {
    const kind = normalizeTarget(target);
    const envName = DISCORD_KIND_ENV[kind];
    const url = envName ? (env[envName] ?? '').trim() : '';
    if (!url) {
      return {
        ok: false,
        terminal: true,
        error: envName
          ? `${envName} is not configured`
          : `Unknown Discord target "${kind}" — use one of: ${Object.keys(DISCORD_KIND_ENV).join(', ')}`,
      };
    }
    if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) {
      return { ok: false, terminal: true, error: `${envName} is not a Discord webhook URL` };
    }
    return { ok: true, url };
  }

  if (channel === 'telegram') {
    const chatId = String(target ?? '').trim();
    if (!/^(@[A-Za-z0-9_]{4,32}|-?\d{5,})$/.test(chatId)) {
      return { ok: false, terminal: true, error: 'Telegram target must be @handle or a chat id' };
    }
    const token = (env.TELEGRAM_BOT_TOKEN ?? '').trim();
    if (!token) return { ok: false, terminal: true, error: 'TELEGRAM_BOT_TOKEN is not configured' };
    return { ok: true, chatId, token };
  }

  if (channel === 'reddit') {
    return { ok: false, terminal: true, error: 'Reddit publishing is not configured yet' };
  }

  return { ok: false, terminal: true, error: `Unknown channel "${channel}"` };
}

function discordPayload(post) {
  const embed = {
    description: clip(post.body, 4000),
    color: 0xe8571e,
    footer: { text: 'Scheduled from brandforge.gg' },
  };
  if (post.title) embed.title = clip(post.title, 256);
  if (post.url) embed.url = String(post.url);
  return { embeds: [embed] };
}

function telegramPayload(chatId, post) {
  const title = post.title ? `${clip(post.title, 120)}\n` : '';
  const link = post.url ? `\n\n${String(post.url)}` : '';
  return {
    chat_id: chatId,
    text: clip(`${title}${post.body}${link}`, 4096),
    disable_web_page_preview: false,
  };
}

async function sendDiscord(webhookUrl, post, fetchImpl) {
  const res = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discordPayload(post)),
  });
  if (!res.ok) return { ok: false, error: `Discord answered ${res.status}` };
  return { ok: true };
}

async function sendTelegram(destination, post, fetchImpl) {
  const url = `https://api.telegram.org/bot${destination.token}/sendMessage`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(telegramPayload(destination.chatId, post)),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON answer falls through to the status check
  }
  if (!res.ok || (body && body.ok === false)) {
    const reason = body && body.description ? body.description : `HTTP ${res.status}`;
    return { ok: false, error: `Telegram: ${reason}` };
  }
  return { ok: true };
}

// One queued row -> one delivered post (or a reason it cannot ever be).
// terminal errors mean "stop retrying"; everything else is retryable.
async function publishPost(post, env, fetchImpl = fetch) {
  const destination = resolveDestination(post.channel, post.target, env);
  if (!destination.ok) return destination;

  try {
    if (post.channel === 'discord') return await sendDiscord(destination.url, post, fetchImpl);
    return await sendTelegram(destination, post, fetchImpl);
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : 'network error' };
  }
}

module.exports = {
  DISCORD_KIND_ENV,
  resolveDestination,
  discordPayload,
  telegramPayload,
  publishPost,
};
