'use strict';

const { MIN_EUROS, MAX_EUROS } = require('./custom-task.js');

// One task between a buyer and the team, from request to delivery. The card in the chat carries this state.
//   open      -> team: accept (the price stands) or counter (another amount, and why)
//   countered -> buyer: accept the counter (it becomes the price) or decline (open again).
//                A task the team offered starts here: the team's price waits for the buyer.
//   accepted  -> the buyer funds it (set by the payment, never by an answer)
//   funded    -> work in progress. team: send for review (a note, and a link to the work)
//   review    -> buyer: approve (the money is released) or ask for changes (back in progress, with what to change)
//   delivered -> done
const STAGES = ['open', 'countered', 'accepted', 'funded', 'review', 'delivered'];

function money(input) {
  const amount = Math.round(Number(input && input.amount));
  return Number.isFinite(amount) && amount >= MIN_EUROS && amount <= MAX_EUROS ? amount : null;
}

const note = (input, max = 500) => String((input && input.note) || '').trim().slice(0, max);

function linkOf(input) {
  const raw = String((input && input.link) || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href.slice(0, 500) : '';
  } catch {
    return '';
  }
}

function fail(status, error) {
  return { ok: false, status, error };
}

function answerTask(state, action, input, role) {
  const status = state && state.status;
  if (status === 'delivered') return fail(409, 'This task is delivered.');
  if (role === 'team') {
    if (status === 'open') {
      if (action === 'accept') return { ok: true, state: { status: 'accepted', amount: state.amount } };
      if (action === 'counter') {
        const amount = money(input);
        if (!amount) return fail(400, `Counter between €${MIN_EUROS} and €${MAX_EUROS.toLocaleString('en-US')}.`);
        if (amount === state.amount) return fail(400, 'That is the same amount. Accept it instead.');
        return { ok: true, state: { status: 'countered', amount: state.amount, counterAmount: amount, counterNote: note(input) } };
      }
      return fail(400, 'Accept or counter.');
    }
    if (status === 'funded' && action === 'submit') {
      const link = linkOf(input);
      const text = note(input, 1000);
      if (!link && text.length < 3) return fail(400, 'Add a link to the work or a short note for the buyer.');
      return { ok: true, state: { status: 'review', amount: state.amount, reviewNote: text, reviewLink: link } };
    }
    if (status === 'funded') return fail(409, 'Funded and in progress. Send it for review when it is ready.');
    if (status === 'countered') return fail(409, 'Your price is with the buyer.');
    if (status === 'accepted') return fail(409, 'Accepted. Waiting for the buyer to fund it.');
    if (status === 'review') return fail(409, 'The work is with the buyer for review.');
    return fail(400, 'Nothing to do here yet.');
  }
  if (role === 'buyer') {
    if (status === 'countered') {
      if (action === 'accept_counter') return { ok: true, state: { status: 'accepted', amount: state.counterAmount } };
      if (action === 'decline_counter') return { ok: true, state: { status: 'open', amount: state.amount } };
      return fail(400, 'Accept or decline the price.');
    }
    if (status === 'review') {
      if (action === 'approve') return { ok: true, state: { status: 'delivered', amount: state.amount } };
      if (action === 'changes') {
        const text = note(input, 1000);
        if (text.length < 3) return fail(400, 'Say what to change.');
        return { ok: true, state: { status: 'funded', amount: state.amount, changesNote: text } };
      }
      return fail(400, 'Approve it or ask for changes.');
    }
    if (status === 'open') return fail(409, 'The team has not answered yet.');
    if (status === 'accepted') return fail(409, 'Fund it to start.');
    if (status === 'funded') return fail(409, 'The team is working on it.');
    return fail(400, 'Nothing to do here yet.');
  }
  return fail(403, 'Only the buyer or the team can answer.');
}

module.exports = { STAGES, answerTask };
