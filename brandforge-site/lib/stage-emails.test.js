const test = require('node:test');
const assert = require('node:assert/strict');

const { buildStageEmail } = require('./stage-emails');

const EVENTS = [
  'proposal_ready',
  'counter_back_ready',
  'contract_accepted',
  'contract_signed',
  'funding_verified',
  'funding_rejected',
  'milestone_ready',
  'payment_released',
];

test('every stage event builds a full email when details are minimal', () => {
  for (const event of EVENTS) {
    const details =
      event === 'contract_accepted'
        ? { side: 'team', chatUrl: 'https://brandforge.gg/chat?conversationId=x' }
        : { chatUrl: 'https://brandforge.gg/chat?conversationId=x' };
    const email = buildStageEmail(event, details);
    assert.ok(email, `${event} should build`);
    assert.ok(email.subject.length > 0, `${event} subject`);
    assert.ok(email.text.length > 0, `${event} text`);
    assert.ok(email.html.length > 0, `${event} html`);
    assert.ok(email.html.includes('brandforge.gg/chat'), `${event} cta`);
  }
});

test('unknown events and founder-side contract_accepted return null', () => {
  assert.equal(buildStageEmail('nope'), null);
  assert.equal(buildStageEmail('contract_accepted', { side: 'founder' }), null);
  assert.equal(buildStageEmail('contract_accepted', {}), null);
});

test('titles are escaped in HTML and flattened in the subject', () => {
  const email = buildStageEmail('proposal_ready', {
    title: 'Evil <script>alert(1)</script>\nsecond line',
    totalAmount: 1200,
    currency: 'EUR',
    chatUrl: 'https://brandforge.gg/chat',
  });
  assert.ok(email, 'builds');
  assert.ok(!email.html.includes('<script>'), 'no raw script tag in html');
  assert.ok(email.html.includes('&lt;script&gt;'), 'escaped in html');
  assert.ok(!email.subject.includes('\n'), 'subject is one line');
});

test('details are optional — missing title, money and url never throw', () => {
  for (const event of EVENTS) {
    const details = event === 'contract_accepted' ? { side: 'team' } : {};
    const email = buildStageEmail(event, details);
    assert.ok(email, `${event} builds with empty details`);
    assert.ok(!email.html.includes('href=""'), `${event} no empty cta`);
  }
});

test('money lines only render for positive amounts', () => {
  const withPrice = buildStageEmail('payment_released', {
    title: 'M1',
    amount: 2000,
    currency: 'EUR',
    chatUrl: 'https://brandforge.gg/chat',
  });
  assert.ok(withPrice.text.includes('EUR 2,000'));
  const zero = buildStageEmail('payment_released', { title: 'M1', amount: 0, chatUrl: 'https://x' });
  assert.ok(!zero.text.includes('EUR 0'));
});

test('welcome email explains the journey and points at the chat', () => {
  const email = buildStageEmail('welcome', { chatUrl: 'https://brandforge.gg/chat' });
  assert.ok(email, 'builds');
  assert.equal(email.subject, 'Welcome to BrandForge');
  assert.ok(email.html.includes('href="https://brandforge.gg/chat"'), 'cta links to chat');
  assert.ok(email.html.includes('Open the chat'), 'cta label');
  assert.ok(email.text.includes('https://brandforge.gg/chat'), 'text carries the url');
  assert.ok(email.text.includes('EUR 500'), 'real launch package price');
  assert.ok(email.html.includes('One chat, one team'), 'welcome signoff');
});

test('welcome email without a chat url skips the cta instead of emitting an empty link', () => {
  const email = buildStageEmail('welcome', {});
  assert.ok(email, 'builds without details');
  assert.ok(!email.html.includes('href=""'), 'no empty cta');
  assert.ok(!email.html.includes('Open the chat'), 'no cta label');
  assert.ok(!email.text.includes('undefined'), 'no undefined in text');
});

test('welcome email is short — two paragraphs, no wall of text', () => {
  const email = buildStageEmail('welcome', { chatUrl: 'https://brandforge.gg/chat' });
  const body = email.text.split('--\n')[0].trim();
  assert.ok(body.length < 500, `body should be short, got ${body.length}`);
  const blocks = body.split('\n\n');
  assert.equal(blocks.length, 3, 'two paragraphs + the chat url');
  assert.ok(blocks[2].startsWith('https://'), 'last block is the url');
});

test('every email carries the footer links (site, policies, community, socials)', () => {
  for (const event of EVENTS) {
    const details = event === 'contract_accepted' ? { side: 'team' } : {};
    const email = buildStageEmail(event, details);
    assert.ok(email.html.includes('href="https://brandforge.gg"'), `${event} site link`);
    assert.ok(email.html.includes('/terms') && email.html.includes('/privacy'), `${event} policy links`);
    assert.ok(email.html.includes('discord.gg'), `${event} discord link`);
    assert.ok(email.html.includes('t.me/BrandForge_gg'), `${event} telegram link`);
    assert.ok(email.text.includes('https://brandforge.gg/terms'), `${event} text policies`);
    assert.ok(!email.html.includes('Unsubscribe'), `${event} no unsubscribe link by default`);
    assert.ok(!email.text.includes('Unsubscribe:'), `${event} no unsubscribe line by default`);
  }
});

test('an https unsubscribe url renders as a link in html and text', () => {
  const url = 'https://brandforge.gg/api/email/unsubscribe?token=abc.def';
  const email = buildStageEmail('welcome', { chatUrl: 'https://brandforge.gg/chat', unsubscribeUrl: url });
  assert.ok(email.html.includes(`href="${url}"`), 'html link');
  assert.ok(email.html.includes('Unsubscribe from product updates'), 'html label');
  assert.ok(email.text.includes(`Unsubscribe: ${url}`), 'text line');
});

test('junk unsubscribe values never become links', () => {
  for (const bad of ['/api/email/unsubscribe?token=x', 'javascript:alert(1)', '']) {
    const email = buildStageEmail('welcome', { unsubscribeUrl: bad });
    assert.ok(!email.html.includes('Unsubscribe from product updates'), `no link for ${JSON.stringify(bad)}`);
    assert.ok(!email.text.includes('Unsubscribe:'), `no line for ${JSON.stringify(bad)}`);
  }
});
