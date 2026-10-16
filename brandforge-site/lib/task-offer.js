'use strict';

const { MIN_EUROS, MAX_EUROS } = require('./custom-task.js');

// A custom task between a buyer and the team, before money moves:
//   open      -> the team accepts it as it is, or counters with another amount (and a note)
//   countered -> the buyer accepts the counter (it becomes the price) or declines it (the task is open again)
//   accepted  -> the buyer funds it
//   funded    -> work starts (set by the payment, never by an answer)
// Returns the next state, or why the move is not allowed.
function answerTask(state, action, input, role) {
  const status = state && state.status;
  if (status === 'funded') return { ok: false, status: 409, error: 'This task is already funded.' };
  if (role === 'team') {
    if (status !== 'open') return { ok: false, status: 409, error: status === 'countered' ? 'Your counter is with the buyer.' : 'This task is already accepted.' };
    if (action === 'accept') return { ok: true, state: { status: 'accepted', amount: state.amount } };
    if (action === 'counter') {
      const amount = Math.round(Number(input && input.amount));
      const note = String((input && input.note) || '').trim().slice(0, 500);
      if (!Number.isFinite(amount) || amount < MIN_EUROS || amount > MAX_EUROS) return { ok: false, status: 400, error: `Counter between €${MIN_EUROS} and €${MAX_EUROS.toLocaleString('en-US')}.` };
      if (amount === state.amount) return { ok: false, status: 400, error: 'That is the same amount. Accept it instead.' };
      return { ok: true, state: { status: 'countered', amount: state.amount, counterAmount: amount, counterNote: note } };
    }
    return { ok: false, status: 400, error: 'Accept or counter.' };
  }
  if (role === 'buyer') {
    if (status !== 'countered') return { ok: false, status: 409, error: 'There is no counter to answer.' };
    if (action === 'accept_counter') return { ok: true, state: { status: 'accepted', amount: state.counterAmount } };
    if (action === 'decline_counter') return { ok: true, state: { status: 'open', amount: state.amount } };
    return { ok: false, status: 400, error: 'Accept or decline the counter.' };
  }
  return { ok: false, status: 403, error: 'Only the buyer or the team can answer.' };
}

module.exports = { answerTask };
