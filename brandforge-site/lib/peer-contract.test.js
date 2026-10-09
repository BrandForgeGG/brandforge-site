'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const pc = require('./peer-contract');

const NOW = new Date('2026-10-08T10:00:00Z');
const payer = { userId: 'u-pay' };
const payee = { userId: 'u-work' };
const staff = { userId: 'u-staff', isStaff: true };

function draft(overrides = {}) {
  return pc.validateDraft({
    title: 'Launch video',
    scope: 'One 30-second launch video with captions.',
    currency: 'EUR',
    milestones: [
      { title: 'Script', amount: 100 },
      { title: 'Final video', amount: '300.50' },
    ],
    ...overrides,
  });
}

function base(extra = {}) {
  const d = draft().value;
  return {
    payerId: 'u-pay',
    payeeId: 'u-work',
    ...d,
    status: 'proposed',
    signatures: { payer: null, payee: null },
    fundingStatus: 'none',
    fundingTx: null,
    ...extra,
  };
}

function run(contract, action, actor, payload) {
  const r = pc.applyAction(contract, action, actor, payload, NOW, 5);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.contract;
}

function funded() {
  let c = base();
  c = run(c, 'accept', payer);
  c = run(c, 'accept', payee);
  c = run(c, 'submit_funding', payer, { tx: '0xabc123' });
  return run(c, 'verify_funding', staff, {});
}

test('draft validation sums milestones in cents and rejects bad input', () => {
  const ok = draft();
  assert.equal(ok.ok, true);
  assert.equal(ok.value.totalCents, 40050);
  assert.equal(draft({ title: 'x' }).ok, false);
  assert.equal(draft({ milestones: [] }).ok, false);
  assert.equal(draft({ milestones: [{ title: 'A', amount: 0 }] }).ok, false);
  assert.equal(draft({ currency: 'XXX' }).ok, false);
  assert.equal(draft({ dueDate: 'soon' }).ok, false);
});

test('fee is one flat percentage, rounded to the cent, configurable and clamped', () => {
  assert.equal(pc.computeFee(10000, 5), 500);
  assert.equal(pc.computeFee(333, 5), 17);
  assert.equal(pc.computeFee(0, 5), 0);
  assert.equal(pc.feePercent({}), 5);
  assert.equal(pc.feePercent({ PEER_CONTRACT_FEE_PERCENT: '8' }), 8);
  assert.equal(pc.feePercent({ PEER_CONTRACT_FEE_PERCENT: '90' }), 20);
});

test('both sides must accept; a revision clears both signatures', () => {
  let c = base();
  c = run(c, 'accept', payer);
  assert.equal(c.status, 'proposed');
  c = run(c, 'revise', payee, { title: 'Launch video v2', scope: 'Longer cut with captions.', milestones: [{ title: 'All', amount: 500 }] });
  assert.deepEqual(c.signatures, { payer: null, payee: null });
  assert.equal(c.totalCents, 50000);
  c = run(c, 'accept', payer);
  c = run(c, 'accept', payee);
  assert.equal(c.status, 'active');
});

test('strangers and wrong sides are refused', () => {
  const c = base();
  assert.equal(pc.applyAction(c, 'accept', { userId: 'someone' }, {}, NOW).status, 403);
  const active = run(run(c, 'accept', payer), 'accept', payee);
  assert.equal(pc.applyAction(active, 'submit_funding', payee, { tx: '0xabc123' }, NOW).status, 403);
  assert.equal(pc.applyAction(active, 'verify_funding', payer, {}, NOW).status, 403);
});

test('work cannot start before funding and milestones go in order', () => {
  const active = run(run(base(), 'accept', payer), 'accept', payee);
  assert.equal(pc.applyAction(active, 'submit_milestone', payee, { index: 0, proofUrl: 'https://x.co/a' }, NOW).status, 409);
  const f = funded();
  assert.equal(pc.applyAction(f, 'submit_milestone', payee, { index: 1, proofUrl: 'https://x.co/a' }, NOW).status, 409);
  assert.equal(pc.applyAction(f, 'submit_milestone', payee, { index: 0, proofUrl: 'not a link' }, NOW).status, 400);
});

test('approval releases the milestone with the fee taken from the payee side', () => {
  let c = funded();
  c = run(c, 'submit_milestone', payee, { index: 0, proofUrl: 'https://x.co/script' });
  assert.equal(c.milestones[0].autoReleaseAt, '2026-10-10T10:00:00.000Z');
  c = run(c, 'approve_milestone', payer, { index: 0 });
  assert.equal(c.milestones[0].status, 'released');
  assert.equal(c.milestones[0].feeCents, 500);
  const s = pc.summarize(c);
  assert.equal(s.payeeCents, 9500);
  assert.equal(s.feeCents, 500);
});

test('an unanswered submission auto-releases after 48 hours, not before', () => {
  let c = funded();
  c = run(c, 'submit_milestone', payee, { index: 0, proofUrl: 'https://x.co/script' });
  assert.equal(pc.settleDue(c, new Date('2026-10-10T09:59:00Z'), 5), c);
  const later = pc.settleDue(c, new Date('2026-10-10T10:01:00Z'), 5);
  assert.equal(later.milestones[0].status, 'released');
});

test('a dispute stops the clock until staff resolve it; all settled completes the contract', () => {
  let c = funded();
  c = run(c, 'submit_milestone', payee, { index: 0, proofUrl: 'https://x.co/script' });
  assert.equal(pc.applyAction(c, 'dispute_milestone', payer, { index: 0, reason: 'no' }, NOW).status, 400);
  c = run(c, 'dispute_milestone', payer, { index: 0, reason: 'The script ignores the brief.' });
  assert.equal(c.status, 'disputed');
  assert.equal(pc.settleDue(c, new Date('2027-01-01T00:00:00Z'), 5), c);
  assert.equal(pc.applyAction(c, 'resolve_dispute', payer, { index: 0, outcome: 'release' }, NOW).status, 403);
  c = run(c, 'resolve_dispute', staff, { index: 0, outcome: 'refund', note: 'Brief not met.' });
  assert.equal(c.status, 'active');
  c = run(c, 'submit_milestone', payee, { index: 1, proofUrl: 'https://x.co/video' });
  c = run(c, 'approve_milestone', payer, { index: 1 });
  assert.equal(c.status, 'completed');
});

test('a rejected deposit returns to unfunded so the payer can resubmit', () => {
  let c = run(run(base(), 'accept', payer), 'accept', payee);
  c = run(c, 'submit_funding', payer, { tx: '0xabc123' });
  c = run(c, 'verify_funding', staff, { approve: false });
  assert.equal(c.fundingStatus, 'none');
  assert.equal(c.fundingTx, null);
});

test('money formatting', () => {
  assert.equal(pc.formatMoney(40050, 'EUR'), '€400.50');
});

test('staff record each payout once; releases owe the payee net of fee, refunds owe the payer in full', () => {
  let c = funded();
  c = run(c, 'submit_milestone', payee, { index: 0, proofUrl: 'https://x.co/script' });
  c = run(c, 'approve_milestone', payer, { index: 0 });
  c = run(c, 'submit_milestone', payee, { index: 1, proofUrl: 'https://x.co/video' });
  c = run(c, 'dispute_milestone', payer, { index: 1, reason: 'The captions are missing.' });
  c = run(c, 'resolve_dispute', staff, { index: 1, outcome: 'refund' });
  const due = pc.payoutsDue(c);
  assert.deepEqual(due.map((d) => [d.index, d.kind, d.toSide, d.amountCents]), [[0, 'payout', 'payee', 9500], [1, 'refund', 'payer', 30050]]);
  assert.equal(pc.applyAction(c, 'mark_paid', payer, { index: 0 }, NOW).status, 403);
  c = run(c, 'mark_paid', staff, { index: 0 });
  assert.equal(pc.applyAction(c, 'mark_paid', staff, { index: 0 }, NOW).status, 409);
  assert.equal(pc.payoutsDue(c).length, 1);
  const open = run(run(run(base(), 'accept', payer), 'accept', payee), 'submit_funding', payer, { tx: '0xabc123' });
  assert.equal(pc.applyAction(open, 'mark_paid', staff, { index: 0 }, NOW).status, 409);
});

test('the delivering side can answer a dispute once, others cannot, and the money stays held', () => {
  let c = funded();
  c = run(c, 'submit_milestone', payee, { index: 0, proofUrl: 'https://x.co/script' });
  c = run(c, 'dispute_milestone', payer, { index: 0, reason: 'The script ignores the brief.' });
  assert.equal(pc.applyAction(c, 'respond_dispute', payer, { index: 0, response: 'I disagree with myself' }, NOW).status, 403);
  assert.equal(pc.applyAction(c, 'respond_dispute', payee, { index: 0, response: 'no' }, NOW).status, 400);
  c = run(c, 'respond_dispute', payee, { index: 0, response: 'The brief changed after I started.' });
  assert.equal(c.milestones[0].response, 'The brief changed after I started.');
  assert.equal(c.milestones[0].status, 'disputed');
  assert.equal(pc.settleDue(c, new Date('2027-01-01T00:00:00Z'), 5), c);
});
