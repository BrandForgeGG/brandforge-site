'use strict';

// Weekly digest builder (growth phase 2 of the webhook spec). Pure text from weekly
// counts — numbers only, so there is nothing to anonymize and nothing that can leak.
// The counts themselves come from getWeeklyStats (project-db, service role); the send
// goes through the live feed when the founder triggers it (admin-only route).

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function buildWeeklyDigest({ posted = 0, matched = 0, funded = 0, shipped = 0 } = {}) {
  const parts = [
    plural(posted, 'new project posted', 'new projects posted'),
    plural(matched, 'matched', 'matched'),
    plural(funded, 'funded', 'funded'),
    plural(shipped, 'shipped', 'shipped'),
  ];
  if (posted + matched + funded + shipped === 0) {
    return 'This week in BrandForge: quiet on the platform — no new briefs, matches, funding or shipments.';
  }
  return `This week in BrandForge: ${parts.join(', ')}.`;
}

// "BrandForge, last 24 hours: ..." from real-user counts only. Zero activity means no post at all:
// we never fill a quiet day with filler.
function buildLiveStats(stats = {}, label = 'last 24 hours') {
  const n = (value) => (Number.isFinite(value) && value > 0 ? value : 0);
  const parts = [];
  if (n(stats.chats)) {
    const guests = n(stats.guestChats);
    parts.push(`${plural(stats.chats, 'chat', 'chats')} started${guests ? ` (${guests} without an account)` : ''}`);
  }
  if (n(stats.members)) parts.push(plural(stats.members, 'new member', 'new members'));
  if (n(stats.listings)) parts.push(plural(stats.listings, 'listing', 'listings') + ' in Trade');
  if (n(stats.specialistApplications)) parts.push(plural(stats.specialistApplications, 'specialist application', 'specialist applications'));
  if (n(stats.contractsSigned)) parts.push(plural(stats.contractsSigned, 'contract', 'contracts') + ' signed');
  if (n(stats.milestonesReleased)) parts.push(plural(stats.milestonesReleased, 'milestone', 'milestones') + ' released');
  if (parts.length === 0) return null;
  return `BrandForge, ${label}: ${parts.join(', ')}.`;
}

module.exports = { buildWeeklyDigest, buildLiveStats };
