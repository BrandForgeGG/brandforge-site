'use strict';

const { RETAINERS } = require('./plans.js');

// The money model the team dashboard shows. TEAM_SHARE is a proposal until the founder sets it: the part of each team plan
// paid to the people who deliver it; BrandForge keeps the rest (sales, the platform, AI costs, refunds, support).
const TEAM_SHARE = 0.6;
const GOAL_CENTS = 1_000_000; // €10,000 MRR
// Close rate: one paying client per this many plan chats. A planning number, replace it with the real rate once known.
const CHATS_PER_CLIENT = 4;
// The monthly mix that reaches the goal: 6 Growth + 4 Launch (one-time tasks come on top).
const GOAL_MIX = [
  { plan: 'growth', count: 6 },
  { plan: 'launch', count: 4 },
];

function centsOf(planId) {
  return RETAINERS.find((plan) => plan.id === planId)?.cents ?? 0;
}

/** How one plan's monthly price splits between the delivering team and BrandForge. */
function split(cents) {
  const team = Math.round(cents * TEAM_SHARE);
  return { team, brandforge: cents - team };
}

/** Every team plan with its monthly split. */
function planSplits() {
  return RETAINERS.map((plan) => ({ id: plan.id, name: plan.name, cents: plan.cents, ...split(plan.cents) }));
}

/** The goal mix in money: total MRR and the split. */
function goalMix() {
  const rows = GOAL_MIX.map((row) => ({ ...row, cents: centsOf(row.plan) * row.count }));
  const total = rows.reduce((sum, row) => sum + row.cents, 0);
  return { rows, total, ...split(total), clients: GOAL_MIX.reduce((sum, row) => sum + row.count, 0) };
}

/** From today's MRR to the goal: the gap, clients still needed (at the mix's average price) and plan chats to have. */
function pathToGoal(mrrCents) {
  const mix = goalMix();
  const average = Math.round(mix.total / mix.clients);
  const gap = Math.max(0, GOAL_CENTS - Math.max(0, mrrCents));
  const clients = Math.ceil(gap / average);
  return { goal: GOAL_CENTS, mrr: Math.max(0, mrrCents), gap, average, clients, chats: clients * CHATS_PER_CLIENT, progress: Math.min(1, Math.max(0, mrrCents) / GOAL_CENTS) };
}

function euros(cents) {
  return `€${Math.round(cents / 100).toLocaleString('en-US')}`;
}

module.exports = { TEAM_SHARE, GOAL_CENTS, CHATS_PER_CLIENT, GOAL_MIX, split, planSplits, goalMix, pathToGoal, euros };
