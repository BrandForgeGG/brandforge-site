'use strict';

// Authorization decisions for the money-flow actions, extracted from the API routes so they can be
// unit tested without a database or a session.
//
// The routes keep their existing checks as the real enforcement; this module is the shared, tested
// source of the decision so a route and its test cannot drift apart. The rule the whole money flow
// depends on: a founder may act only on a project they own, staff may act on the lifecycle, and
// nobody else may act at all.

const PROPOSAL_STATUSES = ['pending', 'accepted', 'declined', 'changes_requested', 'expired'];

/** Statuses only staff may set (lifecycle housekeeping). */
const STAFF_ONLY_PROPOSAL_STATUSES = ['expired'];

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

module.exports = {
  PROPOSAL_STATUSES,
  STAFF_ONLY_PROPOSAL_STATUSES,
  FOUNDER_PROPOSAL_STATUSES,
  canSetProposalStatus,
  canCreateAgreement,
  canUpdateAgreement,
  canSubmitFunding,
  canResolveAiDraft,
};
