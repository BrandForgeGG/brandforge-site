'use strict';

// Member-facing stage-transition email templates (journey gap #4: the founder
// hears about offers, signatures, money and delivery in their inbox, not only
// in chat or a linked Telegram).
//
// Pure builders: given an event + details, return { subject, text, html } or
// null for unknown events / events that are not this person's to hear about.
// Sending lives in lib/email.ts (sendStageEmail); the route-facing delivery
// helper is lib/stage-notify.ts (notifyFounder).
//
// Design rules mirror lib/notify.js:
// - never throws — every detail is optional and coerced defensively;
// - user-controlled text (titles, notes) is escaped for HTML and flattened
//   (oneLine) for subjects, same as the invite email;
// - no invented urgency, no marketing filler: each mail says what happened and
//   the one thing the reader can do next.

const { escapeHtml, oneLine } = require('./html');
const { formatMoney: money } = require('./format');
const { COMMUNITY_LINKS } = require('./community');
const { SOCIAL_LINKS } = require('./social-links');

function line(value, max = 90) {
  return oneLine(String(value ?? ''), max);
}

// Unsubscribe URLs are only ever rendered when the caller passed a real
// https URL — a relative path or junk never becomes a clickable link.
function unsubscribeUrlFrom(details) {
  const value = typeof details.unsubscribeUrl === 'string' ? details.unsubscribeUrl.trim() : '';
  return /^https:\/\/\S+$/.test(value) ? value : null;
}

// The compliance footer every email carries: site + policies + community +
// socials, plus an unsubscribe line when a valid URL was provided.
function footerBlock(unsubscribeUrl) {
  const link = (href, label) =>
    `<a href="${escapeHtml(href)}" style="color:#8f959b;text-decoration:underline">${escapeHtml(label)}</a>`;
  const socials = SOCIAL_LINKS.map((social) => link(social.href, social.label)).join(' · ');
  return `
        <div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:18px;padding-top:14px;font-family:Arial,sans-serif;font-size:11px;line-height:1.9;color:#8f959b">
          <p style="margin:0">${link('https://brandforge.gg', 'brandforge.gg')} · ${link('https://brandforge.gg/terms', 'Terms')} · ${link('https://brandforge.gg/privacy', 'Privacy')}</p>
          <p style="margin:0">${link(COMMUNITY_LINKS.discord.href, COMMUNITY_LINKS.discord.label)} · ${link(COMMUNITY_LINKS.telegramChannel.href, COMMUNITY_LINKS.telegramChannel.label)} · ${socials}</p>
          ${unsubscribeUrl ? `<p style="margin:6px 0 0">${link(unsubscribeUrl, 'Unsubscribe from product updates')}</p>` : ''}
        </div>`;
}

function footerText(unsubscribeUrl) {
  const parts = [
    '--',
    'BrandForge · https://brandforge.gg (Terms https://brandforge.gg/terms · Privacy https://brandforge.gg/privacy)',
    `Community ${COMMUNITY_LINKS.discord.href} · ${COMMUNITY_LINKS.telegramChannel.href}`,
    `Socials ${SOCIAL_LINKS.map((social) => social.href).join(' · ')}`,
  ];
  if (unsubscribeUrl) parts.push(`Unsubscribe: ${unsubscribeUrl}`);
  return parts.join('\n');
}

// The shared dark card, same shape as the invite email so every message from
// BrandForge looks like one hand wrote it.
function card(kicker, heading, paragraphs, ctaLabel, ctaUrl, footer, unsubscribeUrl) {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="font-family:Arial,sans-serif;font-size:14px;color:#9aa0a6;line-height:1.6;margin:0 0 12px">${escapeHtml(p)}</p>`
    )
    .join('');
  const cta =
    ctaLabel && ctaUrl
      ? `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#e8571e;color:#14171a;font-family:Arial,sans-serif;font-weight:bold;font-size:14px;padding:12px 20px;border-radius:8px;text-decoration:none">${escapeHtml(ctaLabel)}</a>`
      : '';
  const signoff =
    footer ||
    'This is your project on BrandForge — everything lives in the chat.';
  return `
    <div style="background:#14171a;padding:32px;font-family:Georgia,serif">
      <div style="max-width:520px;margin:0 auto;background:#1c2024;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px">
        <p style="color:#e8571e;text-transform:uppercase;letter-spacing:0.18em;font-size:11px;margin:0 0 16px">BrandForge</p>
        <h1 style="font-size:20px;color:#ece7de;margin:0 0 12px;font-weight:600">${escapeHtml(heading)}</h1>
        ${body}
        ${cta}
        <p style="font-family:Arial,sans-serif;font-size:12px;color:#8f959b;margin:20px 0 0">
          ${escapeHtml(signoff)}
        </p>
        ${footerBlock(unsubscribeUrl)}
      </div>
    </div>`;
}

function buildCore(event, details = {}) {
  const title = line(details.title);
  const chatUrl = typeof details.chatUrl === 'string' && details.chatUrl ? details.chatUrl : '';
  const open = chatUrl ? 'Open the chat' : null;

  switch (event) {
    case 'proposal_ready': {
      const price = money(details.totalAmount, details.currency);
      const weeks = line(details.weeks, 40);
      const facts = [price, weeks].filter(Boolean).join(' · ');
      const subject = title ? `Proposal ready: ${title}` : 'A proposal is ready for you';
      const paragraphs = [
        title
          ? `BrandForge sent a proposal for "${title}".`
          : 'BrandForge sent you a proposal.',
        facts ? `${facts}. Read the full scope in the chat, then accept, decline or ask for changes.` : 'Read it in the chat, then accept, decline or ask for changes.',
      ];
      return { subject, text: `${paragraphs.join('\n\n')}\n\n${chatUrl || ''}`.trim(), html: card('Proposal', 'Your proposal is ready', paragraphs, open, chatUrl) };
    }

    case 'counter_back_ready': {
      const price = money(details.totalAmount, details.currency);
      const weeks = line(details.weeks, 40);
      const facts = [price, weeks].filter(Boolean).join(' · ');
      const subject = title ? `Counter offer on ${title}` : 'A counter offer is waiting for you';
      const paragraphs = [
        title
          ? `The specialist countered back on "${title}".`
          : 'The specialist countered back on your project.',
        facts
          ? `${facts}. This is the final offer: accept it or decline in the chat and the deal closes.`
          : 'This is the final offer: accept it or decline in the chat and the deal closes.',
      ];
      return { subject, text: `${paragraphs.join('\n\n')}\n\n${chatUrl || ''}`.trim(), html: card('Proposal', 'Counter offer received', paragraphs, open, chatUrl) };
    }

    case 'contract_accepted':
      // side 'founder' means the founder already signed — nothing to nag about.
      if (details.side !== 'team') return null;
      {
        const paragraphs = [
          'The BrandForge team accepted the contract terms. Accept it in the chat to complete signing — the project starts once both sides have signed.',
        ];
        return {
          subject: 'The team accepted your contract',
          text: `${paragraphs[0]}\n\n${chatUrl || ''}`.trim(),
          html: card('Contract', 'The team accepted your contract', paragraphs, open, chatUrl),
        };
      }

    case 'contract_signed': {
      const paragraphs = [
        'Both sides signed the contract. Fund escrow when you are ready — work starts once the transfer clears on-chain.',
      ];
      return {
        subject: 'Contract signed — ready to fund',
        text: `${paragraphs[0]}\n\n${chatUrl || ''}`.trim(),
        html: card('Contract', 'Contract signed', paragraphs, open && 'Fund escrow', chatUrl),
      };
    }

    case 'funding_verified': {
      const paragraphs = [
        'Your transfer cleared on-chain. The project is funded and the team has started delivery — milestones will land in the chat for your approval.',
      ];
      return {
        subject: 'Funding verified — work has started',
        text: `${paragraphs[0]}\n\n${chatUrl || ''}`.trim(),
        html: card('Escrow', 'Funding verified', paragraphs, open, chatUrl),
      };
    }

    case 'funding_rejected': {
      const note = line(details.note, 160);
      const paragraphs = [
        note
          ? `We could not verify that transfer (${note}). Open the chat to check the amount and network, then resubmit the transaction hash.`
          : 'We could not verify that transfer. Open the chat to check the amount and network, then resubmit the transaction hash.',
      ];
      return {
        subject: 'Funding could not be verified',
        text: `${paragraphs[0]}\n\n${chatUrl || ''}`.trim(),
        html: card('Escrow', 'Funding could not be verified', paragraphs, open, chatUrl),
      };
    }

    case 'milestone_ready': {
      const paragraphs = [
        title
          ? `The team delivered "${title}". Review it in the chat — approving it releases the milestone payment.`
          : 'The team delivered work that is waiting for your approval in the chat.',
      ];
      return {
        subject: title ? `"${title}" is ready for your approval` : 'Delivered work is ready for your approval',
        text: `${paragraphs[0]}\n\n${chatUrl || ''}`.trim(),
        html: card('Delivery', 'Waiting for your approval', paragraphs, open, chatUrl),
      };
    }

    case 'payment_released': {
      const price = money(details.amount, details.currency);
      const paragraphs = [
        price
          ? `${price} for "${title || 'the milestone'}" has been released to the operator. This milestone's escrow loop is complete.`
          : `The payment for "${title || 'the milestone'}" has been released to the operator.`,
      ];
      return {
        subject: title ? `Payment released: ${title}` : 'Payment released',
        text: `${paragraphs[0]}\n\n${chatUrl || ''}`.trim(),
        html: card('Escrow', 'Payment released', paragraphs, open, chatUrl),
      };
    }

    case 'peer_update': {
      const message = line(details.message, 220);
      if (!message) return null;
      const paragraphs = [message];
      return {
        subject: title ? `Contract update: ${title}` : 'Contract update',
        text: `${message}

${chatUrl || ''}`.trim(),
        html: card('Contract', title || 'Contract update', paragraphs, open, chatUrl),
      };
    }

    case 'welcome': {
      const chatUrl = typeof details.chatUrl === 'string' && details.chatUrl ? details.chatUrl : '';
      const paragraphs = [
        'You are in. Open BrandForge and describe an idea, paste a URL or drop a file. The first answer is a researched plan, not a list of questions.',
        'Bring your team into any chat with a link, and use the Trade Center to hire or get hired. Creating and distributing is free; a flat 5% applies only when a contract milestone is paid.',
      ];
      const subject = 'Welcome to BrandForge';
      return {
        subject,
        text: `${paragraphs.join('\n\n')}\n\n${chatUrl}`.trim(),
        html: card(
          'Welcome',
          'Welcome to BrandForge',
          paragraphs,
          chatUrl ? 'Open the chat' : null,
          chatUrl,
          'AI drafts. People finish.',
          unsubscribeUrlFrom(details)
        ),
      };
    }

    case 'blueprint_saved': {
      // Transactional receipt for the email gate: the return link is the
      // product here, so only a real https URL ever becomes the CTA.
      const returnUrl =
        typeof details.returnUrl === 'string' && /^https:\/\/\S+$/.test(details.returnUrl.trim())
          ? details.returnUrl.trim()
          : '';
      const keepUrl =
        typeof details.keepUrl === 'string' && /^https:\/\/\S+$/.test(details.keepUrl.trim())
          ? details.keepUrl.trim()
          : '';
      const paragraphs = [
        'Your blueprint is saved with this address. The link below opens it again any time — no account needed.',
        'To keep it with your account, sign in with this same address and the blueprint follows you.',
      ];
      const subject = 'Your blueprint is saved';
      const textLines = [paragraphs.join('\n\n')];
      if (returnUrl) textLines.push(`Open your blueprint: ${returnUrl}`);
      if (keepUrl) textLines.push(`Keep it with your account: ${keepUrl}`);
      return {
        subject,
        text: textLines.join('\n\n'),
        html: card(
          'Blueprint saved',
          'Your blueprint is saved',
          paragraphs,
          returnUrl ? 'Open your blueprint' : null,
          returnUrl,
          'This link is your blueprint — open it from any browser.',
          unsubscribeUrlFrom(details)
        ),
      };
    }

    default:
      return null;
  }
}

function buildStageEmail(event, details = {}) {
  const built = buildCore(event, details);
  if (!built) return null;
  const unsubscribeUrl = unsubscribeUrlFrom(details);
  return { ...built, text: `${built.text}\n\n${footerText(unsubscribeUrl)}`.trim() };
}

module.exports = { buildStageEmail };
