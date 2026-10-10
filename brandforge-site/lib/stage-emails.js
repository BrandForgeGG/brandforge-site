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

function line(value, max = 90) {
  return oneLine(String(value ?? ''), max);
}

// Unsubscribe URLs are only ever rendered when the caller passed a real
// https URL — a relative path or junk never becomes a clickable link.
function unsubscribeUrlFrom(details) {
  const value = typeof details.unsubscribeUrl === 'string' ? details.unsubscribeUrl.trim() : '';
  return /^https:\/\/\S+$/.test(value) ? value : null;
}

// The slim footer every email carries: site, policies and community, plus an unsubscribe line when a
// valid URL was provided. Short on purpose; the message is the point.
function footerBlock(unsubscribeUrl) {
  const link = (href, label) =>
    `<a href="${escapeHtml(href)}" style="color:#8a8174;text-decoration:underline">${escapeHtml(label)}</a>`;
  return `
          <tr><td style="padding:18px 32px 26px;border-top:1px solid #eee6d9;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.8;color:#8a8174">
            ${link('https://brandforge.gg', 'brandforge.gg')} &middot; ${link('https://brandforge.gg/terms', 'Terms')} &middot; ${link('https://brandforge.gg/privacy', 'Privacy')} &middot; ${link(COMMUNITY_LINKS.discord.href, COMMUNITY_LINKS.discord.label)} &middot; ${link(COMMUNITY_LINKS.telegramChannel.href, COMMUNITY_LINKS.telegramChannel.label)}
            ${unsubscribeUrl ? `<br>${link(unsubscribeUrl, 'Unsubscribe from product updates')}` : ''}
          </td></tr>`;
}

function footerText(unsubscribeUrl) {
  const parts = [
    '--',
    'BrandForge · https://brandforge.gg (Terms https://brandforge.gg/terms · Privacy https://brandforge.gg/privacy)',
    `Community ${COMMUNITY_LINKS.discord.href} · ${COMMUNITY_LINKS.telegramChannel.href}`,
  ];
  if (unsubscribeUrl) parts.push(`Unsubscribe: ${unsubscribeUrl}`);
  return parts.join('\n');
}

// One look for every message from BrandForge: warm paper, a white card, the wordmark, a serif
// heading, the facts that matter, one orange button. Table layout and inline styles so it holds up
// in Gmail, Outlook and Apple Mail. `extra.facts` is a list of [label, value] shown as a small table;
// the hidden preheader is the line mail apps show next to the subject.
function card(kicker, heading, paragraphs, ctaLabel, ctaUrl, footer, unsubscribeUrl, extra = {}) {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#4a443c;line-height:1.65;margin:0 0 14px">${escapeHtml(p)}</p>`
    )
    .join('');
  const facts = (extra.facts || []).filter(([, value]) => value);
  const factsHtml = facts.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 18px;border:1px solid #eee6d9;border-radius:12px;background:#faf6ef">${facts
        .map(
          ([label, value], i) =>
            `<tr><td style="padding:10px 16px;${i ? 'border-top:1px solid #eee6d9;' : ''}font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a8174;text-transform:uppercase;letter-spacing:0.08em">${escapeHtml(label)}</td><td align="right" style="padding:10px 16px;${i ? 'border-top:1px solid #eee6d9;' : ''}font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#1a1816">${escapeHtml(value)}</td></tr>`
        )
        .join('')}</table>`
    : '';
  const cta =
    ctaLabel && ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr><td bgcolor="#e8571e" style="border-radius:10px"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:15px;color:#ffffff;padding:13px 24px;border-radius:10px;text-decoration:none">${escapeHtml(ctaLabel)}</a></td></tr></table>
         <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8a8174;line-height:1.5;margin:8px 0 0;word-break:break-all">Button not working? Paste this into your browser: <span style="color:#4a443c">${escapeHtml(ctaUrl)}</span></p>`
      : '';
  const signoff = footer || 'This is your project on BrandForge. Everything lives in the chat.';
  const preheader = escapeHtml(String(extra.preheader || paragraphs[0] || '').slice(0, 110));
  return `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f6f1e9" style="background:#f6f1e9"><tr><td align="center" style="padding:28px 12px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e7dfd2;border-radius:16px">
        <tr><td style="padding:26px 32px 0">
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#1a1816;letter-spacing:-0.01em">Brand<span style="color:#e8571e">Forge</span></span>
        </td></tr>
        <tr><td style="padding:22px 32px 0">
          <p style="font-family:Arial,Helvetica,sans-serif;color:#e8571e;text-transform:uppercase;letter-spacing:0.16em;font-size:11px;font-weight:bold;margin:0 0 10px">${escapeHtml(kicker)}</p>
          <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;color:#1a1816;margin:0 0 16px;font-weight:bold;letter-spacing:-0.01em">${escapeHtml(heading)}</h1>
          ${body}
          ${extra.rawHtml || ''}
          ${factsHtml}
          ${cta}
          <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8a8174;margin:22px 0 0">${escapeHtml(signoff)}</p>
        </td></tr>
        <tr><td style="height:22px;font-size:0;line-height:0">&nbsp;</td></tr>
        ${footerBlock(unsubscribeUrl)}
      </table>
    </td></tr></table>`;
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
      return { subject, text: `${paragraphs.join('\n\n')}\n\n${chatUrl || ''}`.trim(), html: card('Proposal', 'Your proposal is ready', facts ? [paragraphs[0], 'Read the full scope in the chat, then accept, decline or ask for changes.'] : paragraphs, open, chatUrl, undefined, undefined, { facts: [['Price', price], ['Timeline', weeks]], preheader: title ? `${title}: ${facts}` : facts }) };
    }

    case 'counter_back_ready': {
      const price = money(details.totalAmount, details.currency);
      const weeks = line(details.weeks, 40);
      const facts = [price, weeks].filter(Boolean).join(' · ');
      const subject = title ? `Counter offer on ${title}` : 'A counter offer is waiting for you';
      const paragraphs = [
        title
          ? `The BrandForge team countered back on "${title}".`
          : 'The BrandForge team countered back on your project.',
        facts
          ? `${facts}. This is the final offer: accept it or decline in the chat and the deal closes.`
          : 'This is the final offer: accept it or decline in the chat and the deal closes.',
      ];
      return { subject, text: `${paragraphs.join('\n\n')}\n\n${chatUrl || ''}`.trim(), html: card('Proposal', 'Counter offer received', facts ? [paragraphs[0], 'This is the final offer: accept it or decline in the chat and the deal closes.'] : paragraphs, open, chatUrl, undefined, undefined, { facts: [['Price', price], ['Timeline', weeks]] }) };
    }

    case 'contract_accepted':
      // side 'founder' means the founder already signed — nothing to nag about.
      if (details.side !== 'team') return null;
      {
        const paragraphs = [
          'The team accepted the contract terms. Accept it in the chat to finish signing. The project starts once both sides have signed.',
        ];
        return {
          subject: 'The team accepted your contract',
          text: `${paragraphs[0]}\n\n${chatUrl || ''}`.trim(),
          html: card('Contract', 'The team accepted your contract', paragraphs, open, chatUrl),
        };
      }

    case 'contract_signed': {
      const paragraphs = [
        'Both sides signed the contract. Fund the escrow when you are ready. Work starts as soon as the transfer is confirmed.',
      ];
      return {
        subject: 'Contract signed — ready to fund',
        text: `${paragraphs[0]}\n\n${chatUrl || ''}`.trim(),
        html: card('Contract', 'Contract signed', paragraphs, open && 'Fund escrow', chatUrl),
      };
    }

    case 'funding_verified': {
      const paragraphs = [
        'Your transfer is confirmed. The project is funded and the team has started. Each milestone lands in the chat for your approval.',
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
          ? `The team delivered "${title}". Review it in the chat. Approving it releases the milestone payment.`
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
          ? `${price} for "${title || 'the milestone'}" has been released to the BrandForge team. That milestone is done.`
          : `The payment for "${title || 'the milestone'}" has been released to the BrandForge team.`,
      ];
      return {
        subject: title ? `Payment released: ${title}` : 'Payment released',
        text: `${paragraphs[0]}\n\n${chatUrl || ''}`.trim(),
        html: card('Escrow', 'Payment released', paragraphs, open, chatUrl, undefined, undefined, { facts: [['Amount', price], ['Milestone', title]] }),
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

    case 'seq_first_carousel':
    case 'seq_hooks':
    case 'seq_week':
    case 'seq_checkin': {
      // The product-update sequence (lib/email-sequences.js). Always carries the unsubscribe link.
      const unsub = unsubscribeUrlFrom(details);
      const site = 'https://brandforge.gg';
      const copy = {
        seq_first_carousel: {
          subject: 'Your first carousel is one sentence away',
          kicker: 'Your first post',
          heading: 'Your first carousel is one sentence away',
          paragraphs: [
            'Tell BrandForge what your post is about, in one sentence. A minute later you have a cover picture, numbered slides and a closing slide, ready to edit.',
            'Try something like: "5 mistakes first-time founders make with their landing page".',
          ],
          cta: ['Make a carousel', site + '/create'],
        },
        seq_hooks: {
          subject: 'Three hooks that stop the scroll',
          kicker: 'A small tip',
          heading: 'Three hooks that stop the scroll',
          paragraphs: [
            'The cover decides whether anyone swipes. Three shapes that work: a number and a payoff ("7 tools that save an hour a day"), a mistake ("Stop doing this on your landing page"), or a myth ("Posting every day is not the secret").',
            'Type any of them as your topic, then pick a cover style you like: photo, cinematic, 3D render or surreal.',
          ],
          cta: ['Try a hook', site + '/create'],
        },
        seq_week: {
          subject: 'Plan your week of posts',
          kicker: 'Keep it going',
          heading: 'Plan your week of posts',
          paragraphs: [
            'You have made a carousel. The easy win now is a rhythm: write three this week, one topic each, and post them where your people are.',
            'Connect Telegram, Discord or Bluesky in Settings and you can post in one tap from Distribute.',
          ],
          cta: ['Open Distribute', site + '/distribute'],
        },
        seq_checkin: {
          subject: 'Did something get in the way?',
          kicker: 'A quick question',
          heading: 'Did something get in the way?',
          paragraphs: [
            'You joined two weeks ago and have not made anything yet. If it felt confusing, slow or just not for you, we would like to know.',
            'Tell us in Discord in one line and we will fix it. Or make one carousel now: it is free and takes a minute.',
          ],
          cta: ['Tell us what happened', COMMUNITY_LINKS.discord.href],
        },
      }[event];
      const text = [...copy.paragraphs, `${copy.cta[0]}: ${copy.cta[1]}`].join('\n\n');
      return {
        subject: copy.subject,
        text,
        html: card(copy.kicker, copy.heading, copy.paragraphs, copy.cta[0], copy.cta[1], 'AI drafts. People finish.', unsub, { preheader: copy.paragraphs[0] }),
      };
    }

    case 'first_chat':
    case 'first_carousel':
    case 'first_listing':
    case 'first_channel':
    case 'whats_new': {
      // Confirmations of something the person just did, plus the one-time "what is new" note. Each tells
      // them what happened and offers exactly one next step.
      const unsub = unsubscribeUrlFrom(details);
      const site = 'https://brandforge.gg';
      const url = (value, fallback) => (typeof value === 'string' && /^https:\/\/\S+$/.test(value) ? value : fallback);
      const label = line(details.title || details.label, 80);
      const copy = {
        first_chat: {
          subject: 'Your first chat is saved',
          kicker: 'Your first chat',
          heading: 'Your first chat is saved',
          paragraphs: [
            'Your chat is saved to your account, so you can pick it up on any device. Invite a teammate with a link, or ask the BrandForge team when you want a person to finish the job.',
          ],
          cta: ['Open your chat', url(details.chatUrl, site + '/chat')],
        },
        first_carousel: {
          subject: 'Your first carousel is saved',
          kicker: 'Your first carousel',
          heading: 'Your first carousel is saved',
          paragraphs: [
            label ? `"${label}" is saved to your account.` : 'Your carousel is saved to your account.',
            'Next, see how it looks as a post on each platform, write a caption for it and post it to a channel you connected.',
          ],
          cta: ['Preview and distribute', url(details.distributeUrl, site + '/distribute')],
        },
        first_listing: {
          subject: 'Your listing is live',
          kicker: 'Trade Center',
          heading: 'Your listing is live',
          paragraphs: [
            label ? `"${label}" is now in the Trade Center.` : 'Your listing is now in the Trade Center.',
            'When someone messages you, the chat opens here and you will get an email. You can edit or close the listing at any time.',
          ],
          cta: ['See your listing', url(details.tradeUrl, site + '/trade')],
        },
        first_channel: {
          subject: 'Your channel is connected',
          kicker: 'Connected',
          heading: 'Your channel is connected',
          paragraphs: [
            label ? `${label} is connected.` : 'Your channel is connected.',
            'Any carousel can now be posted there in one tap from Distribute. You can disconnect it at any time in Settings.',
          ],
          cta: ['Post a carousel', url(details.distributeUrl, site + '/distribute')],
        },
        whats_new: {
          subject: 'What is new at BrandForge',
          kicker: 'What is new',
          heading: 'What is new at BrandForge',
          paragraphs: [
            'You joined BrandForge a while ago, so here is what changed. Create is now one thing, done well: type a sentence and get a swipeable carousel with a cover picture painted from your topic, in five styles.',
            'Distribute shows it as a post on each platform and posts straight to Telegram, Discord or Bluesky. The Trade Center was redrawn, and your connections now live in Settings.',
            'It is free to make and preview. Sign in to edit and download.',
          ],
          cta: ['Make a carousel', site + '/create'],
        },
      }[event];
      const text = [...copy.paragraphs, `${copy.cta[0]}: ${copy.cta[1]}`].join('\n\n');
      return {
        subject: copy.subject,
        text,
        html: card(copy.kicker, copy.heading, copy.paragraphs, copy.cta[0], copy.cta[1], 'AI drafts. People finish.', unsub, { preheader: copy.paragraphs[0] }),
      };
    }

    case 'welcome': {
      const chatUrl = typeof details.chatUrl === 'string' && details.chatUrl ? details.chatUrl : '';
      const paragraphs = [
        'You are in. Describe an idea in the chat and the first answer is a plan, not a list of questions. Or open Create and turn one sentence into a swipeable carousel.',
        'Invite your team into any chat with a link, and use the Trade Center to hire or get hired. Making and posting is free. A flat 5% applies only when a contract milestone is paid.',
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

module.exports = { buildStageEmail, renderCard: card };
