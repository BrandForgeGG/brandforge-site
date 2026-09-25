const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canSetProposalStatus,
  canCreateAgreement,
  canUpdateAgreement,
  canSubmitFunding,
  canResolveAiDraft,
} = require('./money-authz.js');

const FOUNDER = { userId: 'founder-1', isStaff: false };
const OTHER_FOUNDER = { userId: 'founder-2', isStaff: false };
const STAFF = { userId: 'staff-1', isStaff: true };
const OWNER_ID = 'founder-1';

test('proposal status: the owner may answer, a different founder may not', () => {
  for (const status of ['accepted', 'declined', 'changes_requested']) {
    const ok = canSetProposalStatus({ actor: FOUNDER, ownerId: OWNER_ID, status });
    assert.equal(ok.allowed, true, status);
  }
  // The cross-user case the brief calls out explicitly.
  for (const status of ['accepted', 'declined', 'changes_requested']) {
    const denied = canSetProposalStatus({ actor: OTHER_FOUNDER, ownerId: OWNER_ID, status });
    assert.equal(denied.allowed, false, status);
    assert.equal(denied.status, 403);
  }
});

test('proposal status: unauthenticated is 401, not 403', () => {
  const result = canSetProposalStatus({ actor: null, ownerId: OWNER_ID, status: 'accepted' });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 401);
});

test('proposal status: only staff may set lifecycle statuses like expired', () => {
  const founderAttempt = canSetProposalStatus({ actor: FOUNDER, ownerId: OWNER_ID, status: 'expired' });
  assert.equal(founderAttempt.allowed, false);
  assert.equal(founderAttempt.status, 403);
  const staffAttempt = canSetProposalStatus({ actor: STAFF, ownerId: OWNER_ID, status: 'expired' });
  assert.equal(staffAttempt.allowed, true);
});

test('proposal status: an unknown status is rejected before any ownership check', () => {
  const result = canSetProposalStatus({ actor: STAFF, ownerId: OWNER_ID, status: 'hacked' });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 400);
});

test('agreement: only the owner or staff may create one, never another participant', () => {
  assert.equal(canCreateAgreement({ actor: FOUNDER, ownerId: OWNER_ID }).allowed, true);
  assert.equal(canCreateAgreement({ actor: STAFF, ownerId: OWNER_ID }).allowed, true);
  const denied = canCreateAgreement({ actor: OTHER_FOUNDER, ownerId: OWNER_ID });
  assert.equal(denied.allowed, false);
  assert.equal(denied.status, 403);
  assert.equal(canCreateAgreement({ actor: null, ownerId: OWNER_ID }).status, 401);
});

test('agreement lifecycle is staff-only and never allows funded', () => {
  for (const status of ['active', 'completed', 'cancelled']) {
    assert.equal(canUpdateAgreement({ actor: STAFF, status }).allowed, true, status);
    assert.equal(canUpdateAgreement({ actor: FOUNDER, status }).allowed, false, status);
  }
  // 'funded' must be unreachable here: money only moves through payment verification.
  const funded = canUpdateAgreement({ actor: STAFF, status: 'funded' });
  assert.equal(funded.allowed, false);
  assert.equal(funded.status, 400);
  const pendingFunding = canUpdateAgreement({ actor: STAFF, status: 'pending_funding' });
  assert.equal(pendingFunding.allowed, false);
});

test('funding evidence: only the conversation owner may submit, staff included', () => {
  assert.equal(canSubmitFunding({ actor: FOUNDER, ownerId: OWNER_ID }).allowed, true);
  // Staff verify on-chain but do not submit the transfer.
  const staffAttempt = canSubmitFunding({ actor: STAFF, ownerId: OWNER_ID });
  assert.equal(staffAttempt.allowed, false);
  assert.equal(staffAttempt.status, 403);
  const other = canSubmitFunding({ actor: OTHER_FOUNDER, ownerId: OWNER_ID });
  assert.equal(other.allowed, false);
  assert.equal(other.status, 403);
});

test('ai draft resolution: staff only, and the chat owner is refused', () => {
  assert.equal(canResolveAiDraft({ actor: STAFF }).allowed, true);
  const founderAttempt = canResolveAiDraft({ actor: FOUNDER });
  assert.equal(founderAttempt.allowed, false);
  assert.equal(founderAttempt.status, 403);
  assert.equal(canResolveAiDraft({ actor: null }).status, 401);
});

test('a staff member who owns a chat is treated as that founder, not as staff', () => {
  // The workspace distinguishes "staff acting on someone else's chat" from "my own project".
  // Owner-first means ownership always wins, so staff cannot bypass the owner-only money actions.
  const staffWhoOwns = { userId: OWNER_ID, isStaff: true };
  assert.equal(canSubmitFunding({ actor: staffWhoOwns, ownerId: OWNER_ID }).allowed, true);
  // And a staff member on someone else's chat still cannot submit that founder's funding.
  assert.equal(canSubmitFunding({ actor: STAFF, ownerId: OWNER_ID }).allowed, false);
});
