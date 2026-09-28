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

module.exports = { buildWeeklyDigest };
