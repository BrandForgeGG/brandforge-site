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

function line(value, max = 90) {
  return oneLine(String(value ?? ''), max);
}

function money(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `${line(currency, 8) || 'EUR'} ${value.toLocaleString('en-US')}`;
}

// The shared dark card, same shape as the invite email so every message from
// BrandForge looks like one hand wrote it.
function card(kicker, heading, paragraphs, ctaLabel, ctaUrl) {
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
  return `
    <div style="background:#14171a;padding:32px;font-family:Georgia,serif">
      <div style="max-width:520px;margin:0 auto;background:#1c2024;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px">
        <p style="color:#e8571e;text-transform:uppercase;letter-spacing:0.18em;font-size:11px;margin:0 0 16px">BrandForge</p>
        <h1 style="font-size:20px;color:#ece7de;margin:0 0 12px;font-weight:600">${escapeHtml(heading)}</h1>
        ${body}
        ${cta}
        <p style="font-family:Arial,sans-serif;font-size:12px;color:#8f959b;margin:20px 0 0">
          This is your project on BrandForge — everything lives in the chat.
        </p>
      </div>
    </div>`;
}

function buildStageEmail(event, details = {}) {
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

    default:
      return null;
  }
}

module.exports = { buildStageEmail };
