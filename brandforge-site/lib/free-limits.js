'use strict';

// What the Free plan includes each month. Paying accounts (Pro, a team plan) only have the Pro video limit; staff have none. Change the numbers
// here and the server checks, the pricing page and the upgrade prompt all follow.
const FREE_LIMITS = Object.freeze({ creation: 10, video: 1, channel: 2 });
// Pro is unlimited except videos (they cost the most to make).
const PRO_LIMITS = Object.freeze({ video: 10 });

/** 'YYYY-MM' in UTC: the month a use counts toward. */
function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

/** Whether one more use of `kind` fits, given how many were used already ('staff' never runs out). */
function allowance(kind, used, tier) {
  const limit = tier === 'staff' ? 0 : tier === 'pro' ? PRO_LIMITS[kind] : FREE_LIMITS[kind];
  if (!limit) return { ok: true, limit: null, left: null };
  const count = Math.max(0, Number(used) || 0);
  return { ok: count < limit, limit, left: Math.max(0, limit - count) };
}

/** The one line the upgrade prompt shows. */
function limitMessage(kind, tier) {
  if (kind === 'video' && tier === 'pro') return `Pro includes ${PRO_LIMITS.video} videos a month, and they are used. A team plan makes more for you.`;
  if (kind === 'video') return `Free includes ${FREE_LIMITS.video} video a month, and it is used. Pro gives you 10x more of everything.`;
  if (kind === 'channel') return `Free connects ${FREE_LIMITS.channel} channels. Go Pro to connect all of them.`;
  return `You made your ${FREE_LIMITS.creation} free creations this month. Go Pro to keep making.`;
}

module.exports = { FREE_LIMITS, PRO_LIMITS, monthKey, allowance, limitMessage };
