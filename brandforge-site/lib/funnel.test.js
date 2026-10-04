const test = require('node:test');
const assert = require('node:assert/strict');
const { FUNNEL_EVENTS, ALLOWED_PROPERTY_KEYS, isFunnelEvent, sanitizeProperties, normalizeSource, track } = require('./funnel.js');

test('the funnel event list is the closed set the brief asked for', () => {
  for (const event of [
    'landing_viewed', 'signin_started', 'chat_started', 'project_described', 'review_requested',
    'proposal_received', 'counter_offered', 'proposal_accepted', 'funding_submitted', 'funding_verified',
    'milestone_completed', 'payment_released', 'repeat_project_started',
    'apply_started', 'apply_submitted', 'application_approved',
    'blueprint_started', 'blueprint_first_screen', 'blueprint_email_captured', 'blueprint_exit_tapped',
    'blueprint_proposed', 'quick_win_started', 'quick_win_delivered',
  ]) {
    assert.equal(isFunnelEvent(event), true, event);
  }
  assert.equal(isFunnelEvent('nope'), false);
  assert.equal(isFunnelEvent(''), false);
});

test('blueprint lane and gate experiment survive sanitizing', () => {
  const cleaned = sanitizeProperties({ lane: 'deliver_now', gate: 'before_price' });
  assert.equal(cleaned.lane, 'deliver_now');
  assert.equal(cleaned.gate, 'before_price');
});

test('the negotiation round survives sanitizing as a small int', () => {
  const cleaned = sanitizeProperties({ round: 2, stage: 'negotiate', signedIn: true });
  assert.equal(cleaned.round, 2);
  assert.equal(cleaned.stage, 'negotiate');
});

test('property sanitizing keeps primitives and drops anything that could carry personal data', () => {
  const cleaned = sanitizeProperties({
    percent: 62.555,
    signedIn: true,
    weeks: 'two to three',
    txHash: '0xabc123',
    email: 'founder@example.com',
    message: 'a whole message body',
    nested: { a: 1 },
    list: [1, 2],
    nothing: null,
  });
  // No email, no tx hash, no free text beyond the allowlisted shape, no objects/arrays.
  assert.equal('email' in cleaned, false);
  assert.equal('txHash' in cleaned, false);
  assert.equal('message' in cleaned, false);
  assert.equal('nested' in cleaned, false);
  assert.equal('list' in cleaned, false);
  assert.equal('nothing' in cleaned, false);
  assert.equal(cleaned.percent, 62.56);
  // camelCase at the call site normalizes to the allowlisted snake_case key.
  assert.equal(cleaned.signed_in, true);
  assert.equal(cleaned.weeks, 'two to three');
});

test('property sanitizing caps key count and value length', () => {
  const cleaned = sanitizeProperties({ percent: 1, currency: 'EUR', total_amount: 2, amount: 3, weeks: '4', network: 'eth' });
  assert.equal(Object.keys(cleaned).length <= 6, true);
  // An allowlisted long value is still capped.
  const long = sanitizeProperties({ status: 'x'.repeat(500) });
  assert.equal(long.status.length, 80);
  const weird = sanitizeProperties({ 'total amount!': 99 });
  assert.equal(weird.total_amount, 99);
});

test('a key outside the allowlist is dropped even when the value is harmless', () => {
  // This is the regression that matters: without the allowlist, `email` or `note` would be stored.
  const cleaned = sanitizeProperties({ note: 'perfectly harmless', nickname: 'sam', referrer: 'google' });
  assert.deepEqual(cleaned, {});
  for (const key of Object.keys(ALLOWED_PROPERTY_KEYS)) {
    assert.match(key, /^[a-z][a-z0-9_]*$/);
  }
});

test('track records a real event and never carries the account id', async () => {
  const rows = [];
  const result = await track('proposal_accepted', {
    insert: async (row) => { rows.push(row); },
    signedIn: true,
    visitorId: 'v-123',
    properties: { total_amount: 4200 },
  });
  assert.equal(result.recorded, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, 'proposal_accepted');
  assert.equal(rows[0].signed_in, true);
  assert.equal(rows[0].visitor_id, 'v-123');
  // The row must not contain any account identifier at all.
  const serialized = JSON.stringify(rows[0]);
  assert.equal(serialized.includes('user_id'), false);
  assert.equal(serialized.includes('userId'), false);
  assert.equal(serialized.includes('email'), false);
});

test('track rejects unknown events instead of creating a stray metric', async () => {  const rows = [];
  const result = await track('totally_made_up', { insert: async (r) => rows.push(r) });
  assert.equal(result.recorded, false);
  assert.match(result.error, /unknown funnel event/);
  assert.equal(rows.length, 0);
});

test('track never throws when persistence fails, so a metric cannot break a request', async () => {
  const result = await track('chat_started', {
    insert: async () => { throw new Error('db down'); },
  });
  assert.equal(result.recorded, false);
  assert.equal(result.error, 'insert failed');
});

test('track is a no-op without an insert function', async () => {
  const result = await track('landing_viewed', {});
  assert.equal(result.recorded, false);
});

test('every funnel event is lowercase and snake_case', () => {
  for (const event of FUNNEL_EVENTS) {
    assert.match(event, /^[a-z][a-z0-9_]*$/, event);
  }
});

test('traffic source defaults to organic and only test opts out', async () => {
  assert.equal(normalizeSource(undefined), 'organic');
  assert.equal(normalizeSource('organic'), 'organic');
  assert.equal(normalizeSource('TEST'), 'test');
  assert.equal(normalizeSource('test '), 'test');
  assert.equal(normalizeSource('hacker'), 'organic');
  assert.equal(normalizeSource(''), 'organic');

  const rows = [];
  await track('chat_started', { insert: async (row) => rows.push(row) });
  assert.equal(rows[0].source, 'organic');
  await track('chat_started', { insert: async (row) => rows.push(row), source: 'test' });
  assert.equal(rows[1].source, 'test');
});
