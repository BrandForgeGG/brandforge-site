'use strict';

const { getRetainer } = require('./plans.js');

const MONTH_RE = /^Month (\d+): /;

/** The month a chat is on: the highest "Month N:" task title, or 0 before the first payment. */
function currentMonth(taskTitles) {
  let month = 0;
  for (const title of taskTitles || []) {
    const match = MONTH_RE.exec(String(title));
    if (match) month = Math.max(month, Number(match[1]));
  }
  return month;
}

/** The work list for one paid month of a team plan, due 30 days after it starts. */
function monthTasks(planId, month, start = new Date()) {
  const plan = getRetainer(planId);
  if (!plan || !Number.isInteger(month) || month < 1) return [];
  const due = new Date(start.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  return plan.deliverables.map((item) => ({ title: `Month ${month}: ${item}`, due_date: due }));
}

module.exports = { currentMonth, monthTasks };
