'use strict';

// Which controls a chat action card may show, given the embed and who is looking at it.
//
// This is deliberately a separate, dependency-free module so the rendering rules can be unit
// tested without a DOM (node:test runs the .js directly) and so the transcript and any future
// surface cannot disagree about who is allowed to press what.
//
// The rules that matter:
// - A proposal is actionable only while it is pending, and only for the project owner. A specialist
//   reading someone else's chat sees the same card as read-only context, because the server answers
//   403 for them anyway.
// - A funding card is resubmittable only while it has not been verified, and only by the owner.
// - A review_request card is a RECEIPT. The embed is written *after* the handoff succeeds, so it
//   must never offer a "send" control — that would let a user re-trigger a step already completed.

const DETAILS = { action: 'details', label: 'View details' };

/** True when the card may offer its primary action to this viewer. */
function isActionable(embed, canDecide) {
  if (!embed || !canDecide) return false;
  if (embed.type === 'proposal') return embed.status === 'pending';
  if (embed.type === 'funding') {
    return !embed.status || embed.status === 'pending_funding' || embed.status === 'failed';
  }
  return false;
}

function embedActions({ embed, canDecide } = {}) {
  if (!embed) return [];

  if (!isActionable(embed, canDecide)) {
    return [DETAILS];
  }

  if (embed.type === 'proposal') {
    return [{ action: 'accept', label: 'Accept proposal' }, DETAILS];
  }

  if (embed.type === 'funding') {
    return [{ action: 'submit_funding', label: 'Submit for verification' }, DETAILS];
  }

  return [DETAILS];
}

/** Whether the inline funding form should be rendered inside the card. */
function showsFundingForm(embed, canDecide) {
  return isActionable(embed, canDecide) && embed.type === 'funding';
}

module.exports = { embedActions, showsFundingForm, isActionable };
