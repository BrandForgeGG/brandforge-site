'use strict';

const { isRealActor } = require('./real-activity');

// "Happening now" on Explore: everything people do on BrandForge, said in public-safe words. Each kind shows only what is
// already public or harmless: a chat is "a new chat started" (never its title or its words), an application says the craft
// (never the name), money never appears. Only real people count: no staff testing, no throwaway accounts, no test chats.
const KINDS = ['joined', 'chat', 'carousel', 'shared', 'published', 'listing', 'applied', 'contract'];

/** One raw row -> one line, or null when it must not be shown. */
function activityItem(kind, row) {
  if (!row || !KINDS.includes(kind)) return null;
  const actor = row.actor || null;
  if (!isRealActor(actor)) return null;
  const at = row.at;
  if (!at || Number.isNaN(new Date(at).getTime())) return null;
  const name = row.name ? String(row.name) : '';
  switch (kind) {
    // Never the username: people pick it before anyone reviews it, and some are not fit for a public page.
    case 'joined':
      return { kind, at, who: 'A new member', text: 'joined BrandForge', href: '/explore' };
    case 'chat':
      return { kind, at, who: 'Someone', text: 'started a new chat', href: '/chat' };
    case 'carousel':
      return { kind, at, who: 'Someone', text: 'made a carousel', href: '/create' };
    case 'shared':
      return { kind, at, who: name || 'A member', text: `shared ${row.title ? `“${String(row.title).slice(0, 80)}”` : 'a creation'}`, href: row.distribute ? '/distribute' : '/create', image: row.image || undefined };
    case 'published':
      return { kind, at, who: name || 'A member', text: `published on ${row.network || 'a network'}`, href: row.url, external: true };
    case 'listing':
      return { kind, at, who: name || 'A member', text: `${row.request ? 'needs' : 'offers'} ${String(row.title || 'something').slice(0, 90)}`, href: '/trade' };
    case 'applied':
      return { kind, at, who: 'Someone', text: `applied to join the team${row.specialty ? ` as ${String(row.specialty).slice(0, 40)}` : ''}`, href: '/apply' };
    case 'contract':
      return { kind, at, who: 'Two members', text: 'signed a contract in Trade', href: '/trade' };
    default:
      return null;
  }
}

/** All rows by kind -> the newest `limit` lines, newest first. */
function buildActivity(rowsByKind, limit = 30) {
  const items = [];
  for (const kind of KINDS) {
    for (const row of (rowsByKind && rowsByKind[kind]) || []) {
      const item = activityItem(kind, row);
      if (item) items.push(item);
    }
  }
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return items.slice(0, limit);
}

module.exports = { KINDS, activityItem, buildActivity };
