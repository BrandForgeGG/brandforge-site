'use strict';

// Team plans run month by month in the client's chat. Each paid month posts one line, "… Month N starts today.", and the
// month a chat is on is read back from those lines. Work itself is the client's task list, worked N tasks at a time.
const MONTH_LINE = /Month (\d+) starts today/;

/** The month a chat is on: the highest "Month N starts today" line, or 0 before the first payment. */
function currentMonth(lines) {
  let month = 0;
  for (const line of lines || []) {
    const match = MONTH_LINE.exec(String(line));
    if (match) month = Math.max(month, Number(match[1]));
  }
  return month;
}

/** The two lines a new month posts: what was paid, and how to use the plan. */
function monthLines(plan, month, renewed) {
  const price = `${plan.name} ${plan.price}${plan.cadence}`;
  const first = renewed ? `Renewed: ${price}. Month ${month} starts today.` : `Paid: ${price}. Month ${month} starts today.`;
  const tasks = plan.active === 1 ? '1 task at a time' : `${plan.active} tasks at a time`;
  return [first, `Add your tasks here, as many as you like. We work on ${tasks}, and the next starts as soon as one ships.`];
}

module.exports = { MONTH_LINE, currentMonth, monthLines };
