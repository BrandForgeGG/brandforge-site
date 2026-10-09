'use strict';

// Daily AI usage guard. Every chat turn costs real model money, and the answer model is now a
// premium one, so three limits sit in front of it:
//   - a per-account daily message cap (guests already have their own durable cap),
//   - a warning level that pings staff once a day when total AI replies climb,
//   - a hard ceiling on total AI replies per UTC day that stops everyone except staff.
// All three are env-tunable. Numbers count AI replies stored today, which tracks spend closely
// without needing the provider's billing API.
const DEFAULTS = { userDaily: 150, alertAt: 400, hardCap: 1500 };

function toLimit(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function budgetLimits(env = {}) {
  return {
    userDaily: toLimit(env.AI_USER_DAILY_LIMIT, DEFAULTS.userDaily),
    alertAt: toLimit(env.AI_DAILY_ALERT, DEFAULTS.alertAt),
    hardCap: toLimit(env.AI_DAILY_HARD_CAP, DEFAULTS.hardCap),
  };
}

function utcDayStart(now = new Date()) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/**
 * @param {{ userToday: number, aiToday: number, isStaff?: boolean }} usage
 * @returns {{ allowed: boolean, reason: null|'user_daily'|'global_cap', alert: null|'warn'|'cap', message: string }}
 */
function decideBudget(usage, limits = DEFAULTS) {
  const userToday = Math.max(0, Number(usage.userToday) || 0);
  const aiToday = Math.max(0, Number(usage.aiToday) || 0);
  const alert = aiToday >= limits.hardCap ? 'cap' : aiToday >= limits.alertAt ? 'warn' : null;
  if (usage.isStaff) return { allowed: true, reason: null, alert, message: '' };
  if (aiToday >= limits.hardCap) {
    return { allowed: false, reason: 'global_cap', alert, message: 'BrandForge AI is at capacity for today. Please come back tomorrow, or ask the team to continue by hand.' };
  }
  if (userToday >= limits.userDaily) {
    return { allowed: false, reason: 'user_daily', alert, message: `You have used today's ${limits.userDaily} AI messages. It resets at midnight UTC, and the team can keep helping in this chat.` };
  }
  return { allowed: true, reason: null, alert, message: '' };
}

module.exports = { DEFAULTS, budgetLimits, utcDayStart, decideBudget };
