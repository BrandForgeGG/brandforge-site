'use strict';

// Authorization decisions for the money-flow actions, extracted from the API routes so they can be
// unit tested without a database or a session.
//
// The routes keep their existing checks as the real enforcement; this module is the shared, tested
// source of the decision so a route and its test cannot drift apart. The rule the whole money flow
// depends on: a founder may act only on a project they own, staff may act on the lifecycle, and
// nobody else may act at all.

const PROPOSAL_STATUSES = ['pending', 'accepted', 'declined', 'changes_requested', 'expired'];

/** Statuses a founder may answer a proposal with. */
const FOUNDER_PROPOSAL_STATUSES = ['accepted', 'declined', 'changes_requested'];

/**
 * Can `actor` set this proposal status?
 * The founder who owns the project may answer a pending proposal; staff may do anything.
 */
function canSetProposalStatus({ actor, ownerId, status }) {
  if (!actor) return { allowed: false, status: 401, reason: 'Authentication required' };
  if (!PROPOSAL_STATUSES.includes(status)) {
    return { allowed: false, status: 400, reason: `Invalid proposal status: ${status}` };
  }
  if (actor.isStaff) return { allowed: true, status: 200, reason: 'staff' };
  if (actor.userId !== ownerId) {
    return { allowed: false, status: 403, reason: 'This proposal belongs to another founder' };
  }
  if (!FOUNDER_PROPOSAL_STATUSES.includes(status)) {
    return {
      allowed: false,
      status: 403,
      reason: 'Only BrandForge staff can set this proposal status',
    };
  }
  return { allowed: true, status: 200, reason: 'founder' };
}

/**
 * Can `actor` create the agreement? Binding + payment schedule, so the owner or staff only.
 * A different participant in the chat must be refused.
 */
function canCreateAgreement({ actor, ownerId }) {
  if (!actor) return { allowed: false, status: 401, reason: 'Authentication required' };
  if (actor.userId === ownerId) return { allowed: true, status: 200, reason: 'owner' };
  if (actor.isStaff) return { allowed: true, status: 200, reason: 'staff' };
  return { allowed: false, status: 403, reason: 'Only the founder can accept an agreement' };
}

/**
 * Can `actor` update the agreement lifecycle? Staff only — 'funded' is never set here because
 * funding only happens through payment verification.
 */
function canUpdateAgreement({ actor, status }) {
  if (!actor) return { allowed: false, status: 401, reason: 'Authentication required' };
  if (!actor.isStaff) {
    return { allowed: false, status: 403, reason: 'Only BrandForge staff can update an agreement' };
  }
  if (!['active', 'completed', 'cancelled'].includes(status)) {
    return {
      allowed: false,
      status: 400,
      reason: 'Invalid agreement status (funding goes through payment verification)',
    };
  }
  return { allowed: true, status: 200, reason: 'staff' };
}

/**
 * Can `actor` submit funding evidence? The conversation owner only — never staff, never another
 * participant. Staff verify on-chain but do not submit the transfer.
 */
function canSubmitFunding({ actor, ownerId }) {
  if (!actor) return { allowed: false, status: 401, reason: 'Authentication required' };
  if (actor.userId !== ownerId) {
    return {
      allowed: false,
      status: 403,
      reason: 'Only the founder can submit funding for this agreement',
    };
  }
  return { allowed: true, status: 200, reason: 'owner' };
}

/**
 * Can `actor` resolve an AI draft? Staff only, and never the founder who owns the chat.
 */
function canResolveAiDraft({ actor }) {
  if (!actor) return { allowed: false, status: 401, reason: 'Authentication required' };
  if (!actor.isStaff) {
    return { allowed: false, status: 403, reason: 'Only BrandForge staff can resolve drafts' };
  }
  return { allowed: true, status: 200, reason: 'staff' };
}

/**
 * Can `actor` revise the contract terms? The owner and staff — nobody else. A revision
 * clears BOTH sides' signature (the accepted text must be the text on screen), so it is
 * a binding action, not a comment edit.
 */
function canEditAgreementTerms({ actor, ownerId }) {
  if (!actor) return { allowed: false, status: 401, reason: 'Authentication required' };
  if (actor.userId === ownerId) return { allowed: true, status: 200, reason: 'owner' };
  if (actor.isStaff) return { allowed: true, status: 200, reason: 'staff' };
  return { allowed: false, status: 403, reason: 'Only the founder and the team may edit the contract' };
}

/**
 * Can `actor` sign (accept the current terms)? The owner signs as the founder, staff sign
 * as the team; other participants can read but never sign. The caller also enforces the
 * agreement status: signing happens before funding, never after.
 */
function canAcceptAgreement({ actor, ownerId }) {
  if (!actor) return { allowed: false, status: 401, reason: 'Authentication required' };
  if (actor.userId === ownerId) return { allowed: true, status: 200, reason: 'owner' };
  if (actor.isStaff) return { allowed: true, status: 200, reason: 'staff' };
  return { allowed: false, status: 403, reason: 'Only the founder and the team may accept the contract' };
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * Make the payment schedule partition the contract total exactly.
 *
 * The agreement total is server-derived from the accepted proposal (never taken from the
 * request body), so the escrow invariant is: sum(payments) === agreement.total_amount.
 * Milestone amounts come from AI drafts and routinely do not add up, so the final
 * installment absorbs the difference in either direction (a schedule over the contract
 * total is pulled down onto it); a remainder that would drive the final installment below
 * zero is refused instead of papered over.
 *
 * @param {Array<{ amount?: number | null }>} milestones
 * @param {unknown} totalAmount
 * @returns {{ ok: true, milestones: Array<object>, adjusted: boolean }
 *   | { ok: false, status: number, reason: string }}
 */
function reconcileSchedule(milestones, totalAmount) {
  const total = Number(totalAmount);

  if (!Number.isFinite(total) || total <= 0) {
    return {
      ok: false,
      status: 409,
      reason: 'The accepted proposal does not have a valid total amount',
    };
  }

  const rows = Array.isArray(milestones) ? milestones : [];

  if (rows.length === 0) {
    return { ok: true, milestones: rows, adjusted: false };
  }

  const sum = rows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0);
  const delta = round2(total - sum);

  if (delta === 0) {
    return { ok: true, milestones: rows.map((row) => ({ ...row, amount: round2(Number(row.amount) || 0) })), adjusted: false };
  }

  const lastIndex = rows.length - 1;
  const lastAmount = round2((Number(rows[lastIndex].amount) || 0) + delta);

  if (lastAmount < 0) {
    return {
      ok: false,
      status: 409,
      reason: `The payment schedule (EUR ${round2(sum)}) adds up to more than the accepted proposal total (EUR ${total})`,
    };
  }

  const next = rows.map((row, index) =>
    index === lastIndex ? { ...row, amount: lastAmount } : { ...row, amount: round2(Number(row.amount) || 0) }
  );

  return { ok: true, milestones: next, adjusted: true };
}

module.exports = {
  PROPOSAL_STATUSES,
  FOUNDER_PROPOSAL_STATUSES,
  canSetProposalStatus,
  canCreateAgreement,
  canUpdateAgreement,
  canEditAgreementTerms,
  canAcceptAgreement,
  canSubmitFunding,
  canResolveAiDraft,
  reconcileSchedule,
};
