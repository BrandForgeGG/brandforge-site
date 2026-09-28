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
// - The agreement (contract) card is the signature surface. BOTH sides may edit the terms and
//   accept; a side that already signed may not sign again; once both have signed — or once the
//   agreement is funded — the card goes read-only. If the database migration that carries the
//   signature columns has not been applied yet, the accept timestamps are `undefined` and the
//   card stays read-only instead of offering buttons the server cannot honour.

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

/** Contract signature state, normalized. Distinguishes "column missing" from "not signed yet". */
function contractSignature(contract) {
  if (!contract) return null;
  const founder = contract.founder_accepted_at;
  const team = contract.team_accepted_at;
  if (typeof founder === 'undefined' && typeof team === 'undefined') return null; // migration pending
  return {
    status: typeof contract.status === 'string' ? contract.status : '',
    founderSigned: Boolean(founder),
    teamSigned: Boolean(team),
  };
}

function agreementActions(canDecide, isStaff, contract) {
  const sig = contractSignature(contract);
  if (!sig) return [DETAILS];
  if (sig.status !== 'pending_funding') return [DETAILS];
  if (sig.founderSigned && sig.teamSigned) return [DETAILS];

  const maySign = (canDecide && !sig.founderSigned) || (isStaff && !sig.teamSigned);
  const mayEdit = canDecide || isStaff;
  const actions = [];
  if (maySign) actions.push({ action: 'accept_contract', label: 'Accept contract' });
  if (mayEdit) actions.push({ action: 'edit_contract', label: 'Edit terms' });
  actions.push(DETAILS);
  return actions;
}

function embedActions({ embed, canDecide, isStaff = false, contract = null } = {}) {
  if (!embed) return [];

  if (embed.type === 'agreement') {
    return agreementActions(canDecide, isStaff, contract);
  }

  if (!isActionable(embed, canDecide)) {
    return [DETAILS];
  }

  if (embed.type === 'proposal') {
    return [
      { action: 'accept', label: 'Accept proposal' },
      { action: 'decline', label: 'Decline' },
      DETAILS,
    ];
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

module.exports = { embedActions, showsFundingForm, isActionable, contractSignature };
