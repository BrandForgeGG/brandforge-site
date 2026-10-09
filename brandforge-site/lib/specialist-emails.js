'use strict';

// Emails for specialists: the invitation an admin sends from the dashboard, and the welcome after an
// application is accepted. Pure builders (no sending here), same rules as lib/stage-emails.js:
// user text is escaped, nothing is promised that the product does not do.
const { escapeHtml, oneLine } = require('./html');

function steps(items) {
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

function shell(heading, paragraphs, stepList, cta) {
  const p = (text) => `<p style="margin:0 0 14px;line-height:1.55">${text}</p>`;
  const list = stepList.length
    ? `<ol style="margin:0 0 18px;padding-left:20px;line-height:1.6">${stepList.map((s) => `<li>${s}</li>`).join('')}</ol>`
    : '';
  const button = cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(cta.href)}" style="background:#e8571e;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600">${escapeHtml(cta.label)}</a></p>`
    : '';
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#1a1816;max-width:520px"><h2 style="font-size:20px;margin:0 0 14px">${escapeHtml(heading)}</h2>${paragraphs.map(p).join('')}${list}${button}</div>`;
}

/**
 * @param {'invited'|'accepted'} kind
 * @param {{ name?: string, inviteNote?: string, signInUrl?: string, inboxUrl?: string, vettingUrl?: string, profileUrl?: string }} details
 */
function buildSpecialistEmail(kind, details = {}) {
  const name = oneLine(details.name || '', 60);
  const hello = name ? `Hi ${name},` : 'Hi,';
  const vetting = details.vettingUrl || 'https://brandforge.gg/specialists';

  if (kind === 'invited') {
    const note = oneLine(details.inviteNote || '', 300);
    const url = details.signInUrl || 'https://brandforge.gg/login';
    const how = [
      'Sign in with this email address (Google or a one-time email link, no password).',
      'Your specialist access switches on automatically.',
      'Set up your profile and portfolio so founders can see your work.',
      'Open a brief you like and send a priced proposal. Nothing is paid until a founder accepts.',
    ];
    return {
      subject: 'You are invited to BrandForge as a specialist',
      text: `${hello}\n\nThe BrandForge team invited you to join as a specialist.${note ? `\n\n"${note}"` : ''}\n\n${steps(how)}\n\nSign in: ${url}\nHow we vet and pay specialists: ${vetting}\n`,
      html: shell(
        'You are invited to BrandForge',
        [hello, 'The BrandForge team invited you to join as a specialist.' + (note ? ` They added: &ldquo;${escapeHtml(note)}&rdquo;` : '')],
        how.map(escapeHtml),
        { href: url, label: 'Sign in and get started' }
      ).replace('</div>', `<p style="color:#6d6a66;font-size:13px">How we vet and pay specialists: <a href="${escapeHtml(vetting)}">${escapeHtml(vetting)}</a></p></div>`),
    };
  }

  if (kind === 'accepted') {
    const inbox = details.inboxUrl || 'https://brandforge.gg/chat';
    const profile = details.profileUrl || 'https://brandforge.gg/specialists/me';
    const how = [
      `Set up your profile and portfolio (it is only listed publicly if you tick the box): ${profile}`,
      'Open your inbox. Every brief a founder sends for review shows up there.',
      'Open a brief to take it, then send a priced proposal from the chat.',
      'Link Telegram in Settings to get pinged the moment a brief lands.',
    ];
    return {
      subject: 'You are in: welcome to BrandForge specialists',
      text: `${hello}\n\nYour application was accepted. Here is how it works from here:\n\n${steps(how)}\n\nOpen your inbox: ${inbox}\nHow we vet and pay specialists: ${vetting}\n`,
      html: shell('You are in', [hello, 'Your application was accepted. Here is how it works from here:'], how.map(escapeHtml), { href: inbox, label: 'Open your inbox' }).replace(
        '</div>',
        `<p style="color:#6d6a66;font-size:13px">How we vet and pay specialists: <a href="${escapeHtml(vetting)}">${escapeHtml(vetting)}</a></p></div>`
      ),
    };
  }

  return null;
}

module.exports = { buildSpecialistEmail };
