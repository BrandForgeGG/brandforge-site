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
