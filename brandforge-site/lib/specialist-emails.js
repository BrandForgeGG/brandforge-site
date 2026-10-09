'use strict';

// Emails for specialists: the invitation an admin sends from the dashboard, and the welcome after an
// application is accepted. Pure builders (no sending here), same rules as lib/stage-emails.js:
// user text is escaped, nothing is promised that the product does not do.
const { escapeHtml, oneLine } = require('./html');
const { renderCard } = require('./stage-emails');

function steps(items) {
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

function shell(heading, paragraphs, stepList, cta, extraHtml = '') {
  const p = (text) => `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#4a443c;line-height:1.65;margin:0 0 14px">${text}</p>`;
  const list = stepList.length
    ? `<ol style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#4a443c;margin:0 0 18px;padding-left:20px;line-height:1.65">${stepList.map((item) => `<li style="margin-bottom:6px">${item}</li>`).join('')}</ol>`
    : '';
  const raw = paragraphs.map(p).join('') + list + extraHtml;
  return renderCard('Specialists', heading, [], cta && cta.label, cta && cta.href, 'AI drafts. People finish.', undefined, { rawHtml: raw, preheader: heading });
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
        , `<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8a8174;margin:0 0 6px">How we vet and pay specialists: <a href="${escapeHtml(vetting)}" style="color:#8a8174">${escapeHtml(vetting)}</a></p>`),
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
      html: shell('You are in', [hello, 'Your application was accepted. Here is how it works from here:'], how.map(escapeHtml), { href: inbox, label: 'Open your inbox' }, `<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8a8174;margin:0 0 6px">How we vet and pay specialists: <a href="${escapeHtml(vetting)}" style="color:#8a8174">${escapeHtml(vetting)}</a></p>`),
    };
  }

  return null;
}

module.exports = { buildSpecialistEmail };
