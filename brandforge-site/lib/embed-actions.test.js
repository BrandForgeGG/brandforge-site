const test = require('node:test');
const assert = require('node:assert/strict');
const { embedActions, showsFundingForm, isActionable } = require('./embed-actions.js');

const labels = (embed, canDecide) => embedActions({ embed, canDecide }).map((a) => a.label);
const actions = (embed, canDecide) => embedActions({ embed, canDecide }).map((a) => a.action);

const proposalPending = { type: 'proposal', proposalId: 'p1', status: 'pending' };
const fundingWaiting = { type: 'funding', agreementId: 'a1', status: 'pending_funding' };

test('proposal card: the owner gets accept plus details', () => {
  assert.deepEqual(actions(proposalPending, true), ['accept', 'details']);
  assert.deepEqual(labels(proposalPending, true), ['Accept proposal', 'View details']);
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
