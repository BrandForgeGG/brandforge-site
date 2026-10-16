'use strict';

// A custom task: the buyer names the work and sets the funds. Funding it (card or crypto) holds the money, and BrandForge
// releases it when the buyer approves the delivered work.
const MIN_EUROS = 50;
const MAX_EUROS = 50000;

function checkCustomTask(input) {
  const title = String((input && input.title) || '').replace(/\s+/g, ' ').trim();
  const details = String((input && input.details) || '').trim();
  const funds = Number(String((input && input.funds) || '').replace(/[^\d.]/g, ''));
  if (title.length < 4) return { ok: false, error: 'Name the task in a few words.' };
  if (title.length > 120) return { ok: false, error: 'Keep the task name under 120 characters.' };
  if (details.length < 20) return { ok: false, error: 'Describe the task in a sentence or two, so the team can start.' };
  if (details.length > 4000) return { ok: false, error: 'Keep the description under 4,000 characters.' };
  if (!Number.isFinite(funds) || funds < MIN_EUROS) return { ok: false, error: `Set the funds: at least €${MIN_EUROS}.` };
  if (funds > MAX_EUROS) return { ok: false, error: `For more than €${MAX_EUROS.toLocaleString('en-US')}, describe it in the chat and we will scope it with you.` };
  return { ok: true, task: { title, details, funds: Math.round(funds) } };
}

module.exports = { MIN_EUROS, MAX_EUROS, checkCustomTask };
