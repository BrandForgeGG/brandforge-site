'use strict';

// Ops + public activity event layer (negotiation/webhook spec).
//
// Every negotiation and money moment emits at most two Discord posts:
//   1. a detailed staff embed (ops routing: briefs / proposals / contracts / disputes),
//   2. an anonymized one-line public post (live feed) — only for the four moments that
//      make the platform look alive (brief posted, match made, funded, milestone shipped).
// Rejections, counters, disputes and money amounts are staff-only by design: a public
// rejection counter reads as platform friction, so it never leaves the ops channels.
//
// Routing is env-driven with a safe fallback chain, and every send is best-effort:
//   DISCORD_OPS_<KIND>_URL -> DISCORD_OPS_URL -> skip (logged no-op).
// Deliberately NOT falling back to the legacy DISCORD_WEBHOOK_URL discovery channel:
// that channel is the specialists' briefs feed, and ops noise (contracts, funding,
// counters) does not belong there; the discovery notifier keeps serving it unchanged.
// Nothing configured, provider error, network failure: logged no-op, never
// thrown, never blocks the API route that fired the event.
//   Public feed: DISCORD_LIVE_URL. Dev log (GitHub receiver): DISCORD_DEVLOG_URL.
//
// negotiation_round is the existing counter_round column (migration 0017): 0 = original
// proposal, 1 = founder counter, 2 = specialist counter-back (final). The transition
// matrix in money-authz.js already rejects anything past round 2 at the app layer.

const BRAND = 0xe8571e;
const GREEN = 0x5aa578;
const RED = 0xe5484d;

const KIND_BY_EVENT = {
  brief_posted: 'briefs',
  proposal_submitted: 'proposals',
  proposal_accepted: 'proposals',
  proposal_declined: 'proposals',
  proposal_countered: 'proposals',
  match_made: 'matches',
  contract_proposed: 'contracts',
  contract_signed: 'contracts',
  escrow_funded: 'contracts',
  escrow_rejected: 'disputes',
  milestone_released: 'contracts',
};

function clip(value, max) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function money(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${String(currency || 'EUR')} ${n.toLocaleString('en-US')}`;
}

function weeks(min, max) {
  const lo = Number(min);
  const hi = Number(max);
  if (!Number.isFinite(lo) || lo < 1) return null;
  const hiShown = Number.isFinite(hi) && hi >= lo ? hi : lo;
  return lo === hiShown ? `${lo} weeks` : `${lo}–${hiShown} weeks`;
}

function footer(kind) {
  return { text: `BrandForge · ops-${kind}` };
}

/**
 * Staff embed for an ops event. Returns null for unknown events (the sender treats
 * that as "nothing to post", same as notify()).
 */
function buildOpsEmbed(event, details = {}) {
  const title = clip(details.title, 200) || 'Untitled project';
  const price = money(details.totalAmount, details.currency);
  const timeline = weeks(details.weeksMin ?? details.weeks, details.weeksMax ?? details.weeks);

  switch (event) {
    case 'brief_posted':
      return {
        title: `New brief: ${title}`,
        description: 'A founder sent a brief for review — open the chat to read it and start the proposal.',
        color: BRAND,
        footer: footer('briefs'),
      };

    case 'proposal_submitted': {
      const facts = [price, timeline, details.authorName ? `by ${clip(details.authorName, 80)}` : null]
        .filter(Boolean)
        .join(' · ');
      return {
        title: `Proposal: ${title}`,
        description: facts ? `Priced offer on the table — ${facts}.` : 'A priced offer is on the table.',
        color: BRAND,
        footer: footer('proposals'),
      };
    }

    case 'proposal_accepted':
      return {
        title: `Accepted: ${title}`,
        description: price
          ? `The founder accepted at ${price}. Agreement and escrow open next.`
          : 'The founder accepted. Agreement and escrow open next.',
        color: GREEN,
        footer: footer('proposals'),
      };

    case 'proposal_declined': {
      const out = details.declinesOut ? ' That is two declines — the author is out of this brief.' : '';
      return {
        title: `Declined: ${title}`,
        description: `The founder declined.${out} The brief stays open for other specialists.`,
        color: RED,
        footer: footer('proposals'),
      };
    }

    case 'proposal_countered': {
      const facts = [price, timeline].filter(Boolean).join(' · ');
      const final = details.round === 2;
      return {
        title: final ? `Final counter — no further rounds: ${title}` : `Counter offer: ${title}`,
        description: [
          details.by === 'founder' ? 'The founder countered' : 'The specialist countered back',
          facts ? ` at ${facts}` : '',
          '.',
          final
            ? ' negotiation_round 2 (max) — the founder must accept or decline.'
            : ' The specialist may accept or counter back once.',
        ].join(''),
        color: final ? RED : BRAND,
        footer: footer('proposals'),
      };
    }

    case 'match_made':
      return {
        title: `Matched: ${title}`,
        description: `${clip(details.specialistName, 80) || 'The specialist'} joined the chat — founder and specialist are now introduced.`,
        color: GREEN,
        footer: footer('matches'),
      };

    case 'contract_proposed':
      return {
        title: `Contract proposed: ${title}`,
        description: [
          price ? `Value ${price}` : null,
          details.milestoneCount ? `${details.milestoneCount} milestones` : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Terms drafted, awaiting signatures.',
        color: BRAND,
        footer: footer('contracts'),
      };

    case 'contract_signed':
      return {
        title: `Contract signed${title !== 'Untitled project' ? `: ${title}` : ''}`,
        description: price
          ? `Both sides accepted. Value ${price} — escrow opens next.`
          : 'Both sides accepted — escrow opens next.',
        color: GREEN,
        footer: footer('contracts'),
      };

    case 'escrow_funded':
      return {
        title: 'Escrow funded',
        description: price
          ? `${price} verified on-chain. Delivery starts now.`
          : 'Funding verified on-chain. Delivery starts now.',
        color: GREEN,
        footer: footer('contracts'),
      };

    case 'escrow_rejected': {
      const note = clip(details.note, 200);
      return {
        title: 'Funding rejected',
        description: note
          ? `The submitted transfer did not verify: ${note}`
          : 'The submitted transfer did not verify.',
        color: RED,
        footer: footer('disputes'),
      };
    }

    case 'milestone_released':
      return {
        title: `Milestone shipped: ${clip(details.title, 200) || 'milestone'}`,
        description: price
          ? `${price} released to the operator on founder approval.`
          : 'Released to the operator on founder approval.',
        color: GREEN,
        footer: footer('contracts'),
      };

    default:
      return null;
  }
}

/**
 * Anonymized one-line public post. Only the four growth-safe moments return text;
 * everything else returns null and is never posted publicly.
 */
function buildPublicPost(event) {
  switch (event) {
    case 'brief_posted':
      return 'A new project brief was posted';
    case 'match_made':
      return 'A project was matched with a team';
    case 'contract_funded':
      return 'A project was matched and funded';
    case 'milestone_released':
      return 'A milestone shipped';
    default:
      return null;
  }
}

function opsWebhookUrl(kind, env = process.env) {
  const specific = env[`DISCORD_OPS_${String(kind).toUpperCase()}_URL`];
  if (specific) return specific;
  if (env.DISCORD_OPS_URL) return env.DISCORD_OPS_URL;
  return null;
}

async function postJson(webhookUrl, payload, fetchImpl) {
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.warn(`ops-events: webhook responded ${response.status}`);
    return { sent: true, ok: false };
  }
  return { sent: true, ok: true };
}

/**
 * Post a staff embed. Never throws: unconfigured, unknown event, provider error and
 * network failure are all logged no-ops.
 */
async function postOpsEvent(event, details = {}, opts = {}) {
  const { env = process.env, fetchImpl = fetch } = opts;
  const embed = buildOpsEmbed(event, details);
  if (!embed) return { sent: false, reason: 'unknown_event' };
  const kind = KIND_BY_EVENT[event] || 'proposals';
  const webhookUrl = opsWebhookUrl(kind, env);
  if (!webhookUrl) return { sent: false, reason: 'not_configured' };
  try {
    return await postJson(
      webhookUrl,
      {
        username: 'BrandForge ops',
        allowed_mentions: { parse: [] },
        embeds: [{ ...embed, timestamp: new Date().toISOString() }],
      },
      fetchImpl
    );
  } catch (cause) {
    console.warn('postOpsEvent failed:', cause instanceof Error ? cause.message : cause);
    return { sent: false, reason: 'network' };
  }
}

/**
 * Post an anonymized public line. Events without a public template (rejections,
 * counters, disputes, money) resolve to { sent: false, reason: 'not_public' }.
 * Milestone shipments prefer the dedicated milestones channel when configured,
 * everything else shares the live feed.
 */
async function postPublicActivity(event, opts = {}) {
  const { env = process.env, fetchImpl = fetch } = opts;
  const text = buildPublicPost(event);
  if (!text) return { sent: false, reason: 'not_public' };
  const webhookUrl =
    event === 'milestone_released' && env.DISCORD_MILESTONE_URL
      ? env.DISCORD_MILESTONE_URL
      : env.DISCORD_LIVE_URL;
  if (!webhookUrl) return { sent: false, reason: 'not_configured' };
  try {
    return await postJson(
      webhookUrl,
      { username: 'BrandForge', allowed_mentions: { parse: [] }, content: text },
      fetchImpl
    );
  } catch (cause) {
    console.warn('postPublicActivity failed:', cause instanceof Error ? cause.message : cause);
    return { sent: false, reason: 'network' };
  }
}

/** Dev-log post for the GitHub receiver (releases, labeled merges). */
async function postDevLog({ title, description, url }, opts = {}) {
  const { env = process.env, fetchImpl = fetch } = opts;
  const webhookUrl = env.DISCORD_DEVLOG_URL;
  if (!webhookUrl) return { sent: false, reason: 'not_configured' };
  const embed = {
    title: clip(title, 256) || 'Dev update',
    description: clip(description, 2000) || undefined,
    url: typeof url === 'string' && url.startsWith('http') ? url : undefined,
    color: BRAND,
    footer: { text: 'BrandForge · dev-log' },
    timestamp: new Date().toISOString(),
  };
  try {
    return await postJson(
      webhookUrl,
      { username: 'BrandForge', allowed_mentions: { parse: [] }, embeds: [embed] },
      fetchImpl
    );
  } catch (cause) {
    console.warn('postDevLog failed:', cause instanceof Error ? cause.message : cause);
    return { sent: false, reason: 'network' };
  }
}

/** Plain-text line to the public live feed (weekly digest, manual trigger). */
async function postLiveMessage(text, opts = {}) {
  const { env = process.env, fetchImpl = fetch } = opts;
  const clean = clip(text, 1000);
  if (!clean) return { sent: false, reason: 'empty' };
  const webhookUrl = env.DISCORD_LIVE_URL;
  if (!webhookUrl) return { sent: false, reason: 'not_configured' };
  try {
    return await postJson(
      webhookUrl,
      { username: 'BrandForge', allowed_mentions: { parse: [] }, content: clean },
      fetchImpl
    );
  } catch (cause) {
    console.warn('postLiveMessage failed:', cause instanceof Error ? cause.message : cause);
    return { sent: false, reason: 'network' };
  }
}

module.exports = {
  buildOpsEmbed,
  buildPublicPost,
  opsWebhookUrl,
  postOpsEvent,
  postPublicActivity,
  postDevLog,
  postLiveMessage,
  weeks,
};
