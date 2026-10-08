'use strict';

// Peer contracts: any two people in a chat agree scope, milestones and price; one pays (payer),
// one delivers (payee). Pure rules only — no I/O — so every transition is unit-tested and the
// routes stay thin. Amounts are integer cents everywhere.
//
// Lifecycle
//   proposed  -> both accept                -> active
//   active    -> staff verifies the deposit -> funded (funding_status)
//   per milestone: pending -> submitted (payee posts proof) -> released (payer approves, or the
//   48h window passes without an objection) | disputed (payer objects) -> released | refunded
//   all milestones settled -> completed

const CURRENCIES = ['EUR', 'USD', 'GBP'];
const AUTO_RELEASE_HOURS = 48;
const MAX_MILESTONES = 8;
const MAX_AMOUNT_CENTS = 100_000_000; // 1,000,000.00

function feePercent(env = process.env) {
  const raw = Number(env && env.PEER_CONTRACT_FEE_PERCENT);
  if (!Number.isFinite(raw)) return 5;
  return Math.min(20, Math.max(0, raw));
}

// Fee on one milestone, in cents, rounded half up. The payee receives amount - fee.
function computeFee(amountCents, percent) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 0;
  return Math.round((amountCents * percent) / 100);
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function cleanMultiline(value, max) {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim().slice(0, max) : '';
}

function toCents(value) {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

// Validates a draft from the form / AI. Returns { ok, value } or { ok:false, error }.
// `milestones` carry `amount` in major units; `payerId` / `payeeId` are decided by the caller.
function validateDraft(input) {
  const title = cleanText(input && input.title, 120);
  if (title.length < 3) return { ok: false, error: 'Give the contract a title (3 to 120 characters).' };

  const scope = cleanMultiline(input && input.scope, 4000);
  if (scope.length < 10) return { ok: false, error: 'Describe what will be delivered (at least 10 characters).' };

  const currency = String((input && input.currency) || 'EUR').toUpperCase();
  if (!CURRENCIES.includes(currency)) return { ok: false, error: `Currency must be one of ${CURRENCIES.join(', ')}.` };

  const rawMilestones = Array.isArray(input && input.milestones) ? input.milestones : [];
  if (rawMilestones.length < 1 || rawMilestones.length > MAX_MILESTONES) {
    return { ok: false, error: `Add between 1 and ${MAX_MILESTONES} milestones.` };
  }

  const milestones = [];
  let total = 0;
  for (let i = 0; i < rawMilestones.length; i += 1) {
    const raw = rawMilestones[i] || {};
    const label = cleanText(raw.title, 120);
    const cents = toCents(raw.amount);
    if (label.length < 2) return { ok: false, error: `Milestone ${i + 1} needs a title.` };
    if (!Number.isInteger(cents) || cents <= 0) return { ok: false, error: `Milestone ${i + 1} needs an amount above zero.` };
    total += cents;
    milestones.push({
      title: label,
      amountCents: cents,
      status: 'pending',
      proofUrl: null,
      submittedAt: null,
      autoReleaseAt: null,
      releasedAt: null,
      feeCents: 0,
      note: null,
    });
  }
  if (total > MAX_AMOUNT_CENTS) return { ok: false, error: 'The total is above the 1,000,000 limit.' };

  let dueDate = null;
  if (input && input.dueDate) {
    const parsed = new Date(String(input.dueDate));
    if (Number.isNaN(parsed.getTime())) return { ok: false, error: 'The due date is not a valid date.' };
    dueDate = parsed.toISOString().slice(0, 10);
  }

  return { ok: true, value: { title, scope, currency, milestones, totalCents: total, dueDate } };
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function sideOf(contract, userId) {
  if (!userId) return null;
  if (userId === contract.payerId) return 'payer';
  if (userId === contract.payeeId) return 'payee';
  return null;
}

function fail(status, reason) {
  return { ok: false, status, reason };
}

function settled(m) {
  return m.status === 'released' || m.status === 'refunded';
}

function withCompletion(contract) {
  const done = contract.milestones.length > 0 && contract.milestones.every(settled);
  if (done && contract.status !== 'completed') return { ...contract, status: 'completed' };
  return contract;
}

function replaceMilestone(contract, index, patch) {
  return {
    ...contract,
    milestones: contract.milestones.map((m, i) => (i === index ? { ...m, ...patch } : m)),
  };
}

function release(contract, index, now, percent, note) {
  const m = contract.milestones[index];
  const next = replaceMilestone(contract, index, {
    status: 'released',
    releasedAt: now.toISOString(),
    feeCents: computeFee(m.amountCents, percent),
    note: note || m.note,
  });
  return withCompletion(reopenStatus(next));
}

// A contract is "disputed" only while some milestone still is.
function reopenStatus(contract) {
  if (contract.status !== 'disputed') return contract;
  return contract.milestones.some((m) => m.status === 'disputed') ? contract : { ...contract, status: 'active' };
}

// The one entry point for changing a contract. `actor` = { userId, isStaff }. Returns
// { ok:true, contract, event } or { ok:false, status, reason }.
function applyAction(contract, action, actor, payload = {}, now = new Date(), percent = feePercent()) {
  const side = sideOf(contract, actor && actor.userId);
  const staff = Boolean(actor && actor.isStaff);

  if (action === 'verify_funding' || action === 'resolve_dispute') {
    if (!staff) return fail(403, 'Only BrandForge staff can do that.');
  } else if (!side) {
    return fail(403, 'Only the two people on this contract can do that.');
  }

  switch (action) {
    case 'accept': {
      if (contract.status !== 'proposed') return fail(409, 'This contract is not waiting for signatures.');
      const signed = { ...contract.signatures, [side]: now.toISOString() };
      const both = Boolean(signed.payer && signed.payee);
      return {
        ok: true,
        event: both ? 'signed' : 'accepted',
        contract: { ...contract, signatures: signed, status: both ? 'active' : 'proposed' },
      };
    }
    case 'revise': {
      if (contract.status !== 'proposed') return fail(409, 'Only a contract that is not yet signed can be changed.');
      const draft = validateDraft(payload);
      if (!draft.ok) return fail(400, draft.error);
      return {
        ok: true,
        event: 'revised',
        contract: {
          ...contract,
          title: draft.value.title,
          scope: draft.value.scope,
          currency: draft.value.currency,
          milestones: draft.value.milestones,
          totalCents: draft.value.totalCents,
          dueDate: draft.value.dueDate,
          signatures: { payer: null, payee: null },
        },
      };
    }
    case 'cancel': {
      if (contract.status !== 'proposed') return fail(409, 'Only an unsigned contract can be withdrawn.');
      return { ok: true, event: 'cancelled', contract: { ...contract, status: 'cancelled' } };
    }
    case 'submit_funding': {
      if (side !== 'payer') return fail(403, 'The payer funds the contract.');
      if (contract.status !== 'active') return fail(409, 'Both people must sign before funding.');
      if (contract.fundingStatus === 'funded') return fail(409, 'This contract is already funded.');
      const tx = cleanText(payload.tx, 200);
      if (tx.length < 6) return fail(400, 'Paste the transaction reference.');
      return {
        ok: true,
        event: 'funding_submitted',
        contract: { ...contract, fundingStatus: 'verifying', fundingTx: tx },
      };
    }
    case 'verify_funding': {
      if (contract.fundingStatus !== 'verifying') return fail(409, 'There is no deposit waiting for review.');
      const ok = payload.approve !== false;
      return {
        ok: true,
        event: ok ? 'funded' : 'funding_rejected',
        contract: ok
          ? { ...contract, fundingStatus: 'funded' }
          : { ...contract, fundingStatus: 'none', fundingTx: null },
      };
    }
    case 'submit_milestone': {
      if (side !== 'payee') return fail(403, 'The person delivering submits the work.');
      if (contract.fundingStatus !== 'funded') return fail(409, 'Work starts once the contract is funded.');
      const index = Number(payload.index);
      const m = contract.milestones[index];
      if (!m) return fail(400, 'Unknown milestone.');
      if (m.status !== 'pending') return fail(409, 'This milestone was already submitted.');
      if (contract.milestones.slice(0, index).some((prev) => !settled(prev))) {
        return fail(409, 'Finish the earlier milestones first.');
      }
      const proofUrl = cleanText(payload.proofUrl, 500);
      if (!isHttpUrl(proofUrl)) return fail(400, 'Add a link to the finished work.');
      const submittedAt = now;
      const autoReleaseAt = new Date(submittedAt.getTime() + AUTO_RELEASE_HOURS * 3600 * 1000);
      return {
        ok: true,
        event: 'submitted',
        contract: replaceMilestone(contract, index, {
          status: 'submitted',
          proofUrl,
          note: cleanText(payload.note, 500) || null,
          submittedAt: submittedAt.toISOString(),
          autoReleaseAt: autoReleaseAt.toISOString(),
        }),
      };
    }
    case 'approve_milestone': {
      if (side !== 'payer') return fail(403, 'The person paying approves the work.');
      const index = Number(payload.index);
      const m = contract.milestones[index];
      if (!m) return fail(400, 'Unknown milestone.');
      if (m.status !== 'submitted') return fail(409, 'There is nothing to approve on this milestone.');
      return { ok: true, event: 'released', contract: release(contract, index, now, percent) };
    }
    case 'dispute_milestone': {
      if (side !== 'payer') return fail(403, 'The person paying can raise a dispute.');
      const index = Number(payload.index);
      const m = contract.milestones[index];
      if (!m) return fail(400, 'Unknown milestone.');
      if (m.status !== 'submitted') return fail(409, 'Only submitted work can be disputed.');
      const reason = cleanText(payload.reason, 500);
      if (reason.length < 5) return fail(400, 'Say what is wrong in a sentence.');
      return {
        ok: true,
        event: 'disputed',
        contract: {
          ...replaceMilestone(contract, index, { status: 'disputed', autoReleaseAt: null, note: reason }),
          status: 'disputed',
        },
      };
    }
    case 'resolve_dispute': {
      const index = Number(payload.index);
      const m = contract.milestones[index];
      if (!m || m.status !== 'disputed') return fail(409, 'There is no dispute on that milestone.');
      if (payload.outcome === 'release') {
        return { ok: true, event: 'released', contract: release(contract, index, now, percent, payload.note) };
      }
      if (payload.outcome === 'refund') {
        const next = replaceMilestone(contract, index, {
          status: 'refunded',
          releasedAt: now.toISOString(),
          note: cleanText(payload.note, 500) || m.note,
        });
        return {
          ok: true,
          event: 'refunded',
          contract: withCompletion(reopenStatus(next)),
        };
      }
      return fail(400, 'Choose release or refund.');
    }
    default:
      return fail(400, 'Unknown action.');
  }
}

// Silent time-based settlement: a submitted milestone nobody disputed within the window is
// released. Returns the same contract object when nothing changed.
function settleDue(contract, now = new Date(), percent = feePercent()) {
  let next = contract;
  let changed = false;
  contract.milestones.forEach((m, index) => {
    if (m.status === 'submitted' && m.autoReleaseAt && new Date(m.autoReleaseAt).getTime() <= now.getTime()) {
      next = release(next, index, now, percent, 'Auto-released after 48 hours with no objection.');
      changed = true;
    }
  });
  return changed ? next : contract;
}

// What the payee takes home across released milestones, and what the platform kept.
function summarize(contract) {
  let released = 0;
  let fees = 0;
  for (const m of contract.milestones) {
    if (m.status === 'released') {
      released += m.amountCents;
      fees += m.feeCents;
    }
  }
  return { releasedCents: released, feeCents: fees, payeeCents: released - fees, totalCents: contract.totalCents };
}

function formatMoney(cents, currency) {
  const symbol = { EUR: '€', USD: '$', GBP: '£' }[currency] || `${currency} `;
  return `${symbol}${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

module.exports = {
  CURRENCIES,
  AUTO_RELEASE_HOURS,
  MAX_MILESTONES,
  feePercent,
  computeFee,
  validateDraft,
  applyAction,
  settleDue,
  summarize,
  sideOf,
  formatMoney,
};
