const test = require('node:test');
const assert = require('node:assert/strict');
const { embedActions, showsFundingForm, isActionable } = require('./embed-actions.js');

const labels = (embed, canDecide) => embedActions({ embed, canDecide }).map((a) => a.label);
const actions = (embed, canDecide) => embedActions({ embed, canDecide }).map((a) => a.action);

const proposalPending = { type: 'proposal', proposalId: 'p1', status: 'pending' };
const fundingWaiting = { type: 'funding', agreementId: 'a1', status: 'pending_funding' };

test('proposal card: the owner gets accept, counter, decline plus details', () => {
  assert.deepEqual(actions(proposalPending, true), ['accept', 'counter', 'decline', 'details']);
  assert.deepEqual(labels(proposalPending, true), [
    'Accept proposal',
    'Counter offer',
    'Decline',
    'View details',
  ]);
});

test('proposal card: a non-owner sees read-only context, never a dead control', () => {
  assert.deepEqual(actions(proposalPending, false), ['details']);
  assert.equal(labels(proposalPending, false).includes('Accept proposal'), false);
});

test('proposal card: once decided, the accept action disappears for the owner too', () => {
  for (const status of ['accepted', 'declined', 'changes_requested', 'expired']) {
    assert.deepEqual(actions({ ...proposalPending, status }, true), ['details'], status);
  }
});

test('review_request card is a receipt and never offers a send action', () => {
  // Regression: the embed is written *after* the handoff succeeds, so offering "Send to review"
  // would let a user re-trigger a step that already completed.
  const review = { type: 'review_request', conversationId: 'c1' };
  for (const canDecide of [true, false]) {
    assert.deepEqual(actions(review, canDecide), ['details'], `canDecide=${canDecide}`);
    assert.equal(labels(review, canDecide).some((l) => /send/i.test(l)), false);
  }
  assert.equal(isActionable(review, true), false);
});

test('agreement card is a receipt with no primary action', () => {
  const agreement = { type: 'agreement', agreementId: 'a1', status: 'pending_funding' };
  assert.deepEqual(actions(agreement, true), ['details']);
  assert.deepEqual(actions(agreement, false), ['details']);
});

test('funding card: the owner can resubmit while awaiting or after a failure', () => {
  for (const status of ['pending_funding', 'failed', undefined]) {
    const embed = { type: 'funding', agreementId: 'a1', ...(status ? { status } : {}) };
    assert.deepEqual(actions(embed, true), ['submit_funding', 'details'], String(status));
    assert.equal(showsFundingForm(embed, true), true, String(status));
  }
});

test('funding card: no resubmission once verified or released', () => {
  for (const status of ['funded', 'released', 'verifying']) {
    const embed = { type: 'funding', agreementId: 'a1', status };
    // 'verifying' still shows only details: resubmitting mid-verification would be wrong.
    assert.deepEqual(actions(embed, true), ['details'], status);
    assert.equal(showsFundingForm(embed, true), false, status);
  }
});

test('funding card: a non-owner never sees the form, including after a failure', () => {
  const failed = { type: 'funding', agreementId: 'a1', status: 'failed' };
  assert.deepEqual(actions(failed, false), ['details']);
  assert.equal(showsFundingForm(failed, false), false);
});

test('an unknown or missing embed yields no actions at all', () => {
  assert.deepEqual(embedActions({ embed: null, canDecide: true }), []);
  assert.deepEqual(embedActions(), []);
  // A payload the parser would never produce must not fall through to a primary action.
  const unknown = { type: 'something_new', id: 'x' };
  assert.equal(isActionable(unknown, true), false);
  assert.deepEqual(actions(unknown, true), ['details']);
});

test('details is always offered, so an embed is never a dead end', () => {
  for (const embed of [proposalPending, fundingWaiting, { type: 'agreement', agreementId: 'a', status: 'active' }]) {
    for (const canDecide of [true, false]) {
      assert.equal(labels(embed, canDecide).includes('View details'), true);
    }
  }
});

// ---------- contract card: the signature surface ----------

const contract = (over) =>
  over === null
    ? null
    : {
        status: 'pending_funding',
        founder_accepted_at: null,
        team_accepted_at: null,
        ...over,
      };
const agreementEmbed = { type: 'agreement', agreementId: 'a1', status: 'pending_funding' };
const contractActions = ({ founder = false, staff = false, state = {} } = {}) =>
  embedActions({ embed: agreementEmbed, canDecide: founder, isStaff: staff, contract: contract(state) }).map((a) => a.action);

test('contract card: unsigned — founder gets accept + edit, staff get their own accept + edit', () => {
  assert.deepEqual(contractActions({ founder: true }), ['accept_contract', 'edit_contract', 'details']);
  assert.deepEqual(contractActions({ staff: true }), ['accept_contract', 'edit_contract', 'details']);
});

test('contract card: a signed side loses accept but keeps edit; the other side can still sign', () => {
  const founderSigned = contractActions({ founder: true, state: { founder_accepted_at: 't1' } });
  assert.deepEqual(founderSigned, ['edit_contract', 'details']);
  // Staff have not signed yet, so the staff viewer still gets the accept button.
  const staffView = contractActions({ staff: true, state: { founder_accepted_at: 't1' } });
  assert.deepEqual(staffView, ['accept_contract', 'edit_contract', 'details']);
});

test('contract card: fully signed, or funded, or cancelled — read-only for everyone', () => {
  const signed = { founder_accepted_at: 't1', team_accepted_at: 't2' };
  for (const state of [
    signed,
    { ...signed, status: 'funded' },
    { ...signed, status: 'active' },
    { status: 'cancelled' },
  ]) {
    assert.deepEqual(contractActions({ founder: true, state }), ['details'], JSON.stringify(state));
    assert.deepEqual(contractActions({ staff: true, state }), ['details'], JSON.stringify(state));
  }
});

test('contract card: a participant who is neither owner nor staff is always read-only', () => {
  assert.deepEqual(contractActions({ state: {} }), ['details']);
  assert.deepEqual(contractActions({ state: { founder_accepted_at: 't1' } }), ['details']);
});

test('contract card: missing signature columns (migration not applied) stay read-only', () => {
  // No accept timestamps at all = the DB migration has not run. Offering Accept would 500.
  embedActions({
    embed: agreementEmbed,
    canDecide: true,
    isStaff: true,
    contract: { status: 'pending_funding' },
  }).forEach((item) => assert.equal(item.action, 'details'));
  // And a missing contract row (old message, artifacts not loaded) is read-only too.
  assert.deepEqual(contractActions({ founder: true, state: null }), ['details']);
});

// ---------- proposal counter round (spec: one counter per side) ----------

const counterActions = (status, { owner = false, staff = false } = {}) =>
  embedActions({ embed: { type: 'proposal', proposalId: 'p1', status }, canDecide: owner, isStaff: staff }).map(
    (a) => a.action
  );

test('counter round: owner waits while their own counter is outstanding', () => {
  // The founder countered: only decline (the deadlock exit) stays open, never a second counter.
  assert.deepEqual(counterActions('countered', { owner: true }), ['decline', 'details']);
  // The specialist answers it: accept, one counter back, or decline.
  assert.deepEqual(counterActions('countered', { staff: true }), ['accept', 'counter_back', 'decline', 'details']);
  // An uninvited reader sees context only.
  assert.deepEqual(counterActions('countered'), ['details']);
});

test('counter round: the counter-back is the final offer, accept or decline only', () => {
  assert.deepEqual(counterActions('counter_back', { owner: true }), ['accept', 'decline', 'details']);
  // Staff cannot accept their own final offer — the founder signs the deal.
  assert.deepEqual(counterActions('counter_back', { staff: true }), ['decline', 'details']);
  assert.deepEqual(counterActions('counter_back'), ['details']);
});

test('counter round: decided proposals are read-only for both sides', () => {
  for (const status of ['accepted', 'declined', 'expired']) {
    assert.deepEqual(counterActions(status, { owner: true }), ['details'], status);
    assert.deepEqual(counterActions(status, { staff: true }), ['details'], status);
  }
});
