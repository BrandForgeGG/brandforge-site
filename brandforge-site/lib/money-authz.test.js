const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canSetProposalStatus,
  canCreateAgreement,
  canUpdateAgreement,
  canEditAgreementTerms,
  canAcceptAgreement,
  canSubmitFunding,
  canResolveAiDraft,
  reconcileSchedule,
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

// ---------- proposal counter round (transition matrix) ----------

const transition = (actor, currentStatus, status) =>
  canSetProposalStatus({ actor, ownerId: OWNER_ID, status, currentStatus });

test('counter round: the founder counters only from pending, never twice', () => {
  assert.equal(transition(FOUNDER, 'pending', 'countered').allowed, true);
  assert.equal(transition(FOUNDER, 'pending', 'accepted').allowed, true);
  // Their own counter is outstanding: only decline (the deadlock exit) stays open.
  assert.equal(transition(FOUNDER, 'countered', 'countered').allowed, false, 'no second counter');
  assert.equal(transition(FOUNDER, 'countered', 'countered').status, 409);
  assert.equal(transition(FOUNDER, 'countered', 'accepted').allowed, false, 'own offer cannot be accepted');
  assert.equal(transition(FOUNDER, 'countered', 'declined').allowed, true);
  // The specialist's counter-back is the final offer: accept or decline, never counter again.
  assert.equal(transition(FOUNDER, 'counter_back', 'accepted').allowed, true);
  assert.equal(transition(FOUNDER, 'counter_back', 'declined').allowed, true);
  assert.equal(transition(FOUNDER, 'counter_back', 'countered').allowed, false, 'no second counter');
});

test('counter round: staff answer their countered proposal exactly once', () => {
  assert.equal(transition(STAFF, 'countered', 'accepted').allowed, true);
  assert.equal(transition(STAFF, 'countered', 'counter_back').allowed, true);
  assert.equal(transition(STAFF, 'countered', 'declined').allowed, true);
  // The counter-back is the specialist's last offer: staff cannot accept their own final bid.
  assert.equal(transition(STAFF, 'counter_back', 'accepted').allowed, false);
  assert.equal(transition(STAFF, 'counter_back', 'accepted').status, 409);
  assert.equal(transition(STAFF, 'counter_back', 'declined').allowed, true);
  assert.equal(transition(STAFF, 'counter_back', 'counter_back').allowed, false, 'no second counter');
});

test('counter round: on a pending proposal staff may withdraw or expire, never decide or counter', () => {
  // The panel is the founder's surface and the card gives staff no answer button on pending:
  // the matrix mirrors exactly that, while the legacy path below keeps old callers working.
  assert.equal(transition(STAFF, 'pending', 'declined').allowed, true);
  assert.equal(transition(STAFF, 'pending', 'expired').allowed, true);
  assert.equal(transition(STAFF, 'pending', 'accepted').allowed, false, 'staff cannot sign their own offer');
  assert.equal(transition(STAFF, 'pending', 'countered').allowed, false, 'countering is the founder answer');
  assert.equal(transition(FOUNDER, 'pending', 'expired').allowed, false, 'expiry is a staff cleanup');
});

test('counter round: ownership wins over staff (founder-admin edge)', () => {
  const staffWhoOwns = { userId: OWNER_ID, isStaff: true };
  assert.equal(transition(staffWhoOwns, 'countered', 'counter_back').allowed, false, 'owner lane, not staff');
  assert.equal(transition(staffWhoOwns, 'countered', 'counter_back').status, 409);
  assert.equal(transition(staffWhoOwns, 'pending', 'countered').allowed, true, 'owner lane');
});

test('counter round: a foreign founder is refused regardless of the matrix row', () => {
  const denied = transition(OTHER_FOUNDER, 'pending', 'accepted');
  assert.equal(denied.allowed, false);
  assert.equal(denied.status, 403);
});

test('counter round: changes_requested reopens only the staff lane; terminals are locked', () => {
  assert.equal(transition(FOUNDER, 'changes_requested', 'accepted').allowed, false, 'stale answer is a 409');
  assert.equal(transition(STAFF, 'changes_requested', 'expired').allowed, true);
  for (const terminal of ['accepted', 'declined', 'expired']) {
    assert.equal(transition(FOUNDER, terminal, 'accepted').allowed, false, terminal);
    assert.equal(transition(STAFF, terminal, 'declined').allowed, false, terminal);
  }
});

test('counter round: without currentStatus the legacy role rule still applies', () => {
  // Callers that do not pass the current status (old rows, repair scripts) keep the
  // original semantics: the owner answers, staff may set anything valid.
  assert.equal(canSetProposalStatus({ actor: FOUNDER, ownerId: OWNER_ID, status: 'accepted' }).allowed, true);
  assert.equal(canSetProposalStatus({ actor: STAFF, ownerId: OWNER_ID, status: 'expired' }).allowed, true);
  assert.equal(canSetProposalStatus({ actor: OTHER_FOUNDER, ownerId: OWNER_ID, status: 'accepted' }).allowed, false);
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

// ---------- contract signature (both-sides edit + accept) ----------

test('contract terms: owner and staff may edit, other participants may not', () => {
  assert.equal(canEditAgreementTerms({ actor: FOUNDER, ownerId: OWNER_ID }).allowed, true);
  assert.equal(canEditAgreementTerms({ actor: STAFF, ownerId: OWNER_ID }).allowed, true);
  const denied = canEditAgreementTerms({ actor: OTHER_FOUNDER, ownerId: OWNER_ID });
  assert.equal(denied.allowed, false);
  assert.equal(denied.status, 403);
  assert.equal(canEditAgreementTerms({ actor: null, ownerId: OWNER_ID }).status, 401);
});

test('contract accept: the owner signs as the founder, staff sign as the team', () => {
  assert.equal(canAcceptAgreement({ actor: FOUNDER, ownerId: OWNER_ID }).allowed, true);
  assert.equal(canAcceptAgreement({ actor: STAFF, ownerId: OWNER_ID }).allowed, true);
  const denied = canAcceptAgreement({ actor: OTHER_FOUNDER, ownerId: OWNER_ID });
  assert.equal(denied.allowed, false);
  assert.equal(denied.status, 403);
  assert.equal(canAcceptAgreement({ actor: null, ownerId: OWNER_ID }).status, 401);
});

// ---------- payment schedule reconciliation (H3) ----------

const sum = (rows) => rows.reduce((acc, row) => acc + row.amount, 0);

test('schedule: an exact match passes through unchanged', () => {
  const rows = [{ amount: 400 }, { amount: 600 }];
  const result = reconcileSchedule(rows, 1000);
  assert.equal(result.ok, true);
  assert.equal(result.adjusted, false);
  assert.equal(sum(result.milestones), 1000);
});

test('schedule: the final installment absorbs a shortfall', () => {
  const rows = [{ amount: 400 }, { amount: 400 }];
  const result = reconcileSchedule(rows, 1000);
  assert.equal(result.ok, true);
  assert.equal(result.adjusted, true);
  assert.deepEqual(
    result.milestones.map((row) => row.amount),
    [400, 600],
  );
  assert.equal(sum(result.milestones), 1000);
});

test('schedule: a null-amount final milestone becomes the remainder', () => {
  const rows = [{ amount: 300 }, { amount: null }];
  const result = reconcileSchedule(rows, 1000);
  assert.equal(result.ok, true);
  assert.equal(sum(result.milestones), 1000);
  assert.equal(result.milestones[1].amount, 700);
});

test('schedule: cents-level rounding lands exactly on the total', () => {
  const rows = [{ amount: 111.11 }, { amount: 111.11 }];
  const result = reconcileSchedule(rows, 333.33);
  assert.equal(result.ok, true);
  assert.equal(sum(result.milestones), 333.33);
});

test('schedule: an over-summed schedule is pulled down onto the contract total', () => {
  // AI drafts routinely over-sum. The contract total wins: the final installment shrinks,
  // which keeps escrow collecting exactly the accepted price.
  const result = reconcileSchedule([{ amount: 400 }, { amount: 400 }], 500);
  assert.equal(result.ok, true);
  assert.equal(result.adjusted, true);
  assert.deepEqual(
    result.milestones.map((row) => row.amount),
    [400, 100],
  );
  assert.equal(sum(result.milestones), 500);
});

test('schedule: refused when absorbing would push the final installment below zero', () => {
  // 700 of milestones against a EUR 100 contract: the remainder (-600) cannot land on the
  // final row without going negative, so the mismatch is surfaced instead of papered over.
  const result = reconcileSchedule([{ amount: 300 }, { amount: 400 }], 100);
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.reason, /more than the accepted proposal total/);
});

test('schedule: an invalid proposal total is refused before any arithmetic', () => {
  for (const bad of [0, -5, NaN, '4000abc', null, undefined]) {
    const result = reconcileSchedule([{ amount: 10 }], bad);
    assert.equal(result.ok, false, `total ${String(bad)}`);
    assert.equal(result.status, 409);
  }
});

test('schedule: no milestones is a valid (empty) schedule', () => {
  const result = reconcileSchedule([], 1000);
  assert.equal(result.ok, true);
  assert.deepEqual(result.milestones, []);
});
