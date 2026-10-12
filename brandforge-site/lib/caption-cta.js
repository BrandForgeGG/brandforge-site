'use strict';

// Varied calls to action for captions. A feed where every post ends "follow for more" gets ignored, so each post
// asks for something different: follow, save, like, comment, share, try the site, hire the team, send a message.
// The kind is picked to fit the format (a poll asks for a comment, a tip asks for a save, an ad asks to try or hire)
// and never repeats the one before it. Pure and deterministic: the same seed always gives the same choice.

const KINDS = ['follow', 'save', 'like', 'comment', 'share', 'try', 'hire', 'dm'];

// Which asks suit which format, best fit first.
const BY_FORMAT = {
  carousel: ['save', 'follow', 'share', 'like', 'comment'],
  quote: ['save', 'share', 'like', 'follow'],
  tip: ['save', 'follow', 'comment', 'share'],
  ad: ['try', 'hire', 'dm'],
  announcement: ['try', 'follow', 'share', 'hire'],
  question: ['comment', 'like', 'share'],
};

// Plain lines to end a caption with. {site} is the address to send people to, {brand} the name posting.
const LINES = {
  follow: ['Follow for more like this.', 'Follow {brand} so the next one finds you.', 'New ideas here every week. Follow along.', 'Want more of this? Follow.'],
  save: ['Save this for when you need it.', 'Save it now, thank yourself later.', 'Bookmark this one.', 'Save this and come back to it.'],
  like: ['Tap the heart if this helped.', 'Like it if you agree.', 'A like tells us to make more of these.', 'If this was useful, give it a like.'],
  comment: ['Tell us in the comments.', 'Which one are you? Comment below.', 'What would you add? Drop it in the comments.', 'Your turn: answer in the comments.'],
  share: ['Send this to someone who needs it.', 'Share it with a friend who is building something.', 'Know someone who should see this? Share it.', 'Pass it on.'],
  try: ['Try it free: {site}', 'See it for yourself: {site}', 'Start free at {site}', 'Give it a go: {site}'],
  hire: ['Need a team on this? Hire us: {site}', 'Want a person to do it for you? {site}', 'Hire {brand} and we will take it from here: {site}', 'Let our team build it with you: {site}'],
  dm: ['Message us and we will help.', 'Send us a message, we reply fast.', 'Ask us anything in the DMs.', 'DM us the word "plan" and we will send one.'],
};

function hash(text) {
  let h = 7;
  for (const ch of String(text == null ? '' : text)) h = (h * 31 + ch.charCodeAt(0)) % 1000003;
  return h;
}

/**
 * The kind of ask for one post.
 * @param {{ format?: string, seed?: string|number, previous?: string, allow?: string[] }} input
 */
function pickCta({ format, seed, previous, allow } = {}) {
  const preferred = (BY_FORMAT[format] || BY_FORMAT.carousel).filter((kind) => !allow || allow.includes(kind));
  const pool = preferred.length ? preferred : BY_FORMAT.carousel;
  const choices = pool.filter((kind) => kind !== previous);
  const list = choices.length ? choices : pool;
  return list[hash(seed) % list.length];
}

/** One ready-to-use line for an ask, in one of several phrasings. */
function ctaLine(kind, { seed, site = '', brand = '' } = {}) {
  const options = LINES[kind] || LINES.follow;
  const raw = options[hash(`${kind}:${seed}`) % options.length];
  return raw
    .replace(/\{site\}/g, String(site || '').replace(/^https?:\/\//, '').replace(/\/$/, '') || 'our site')
    .replace(/\{brand\}/g, String(brand || '').trim() || 'us')
    .trim();
}

/** The kinds in order for a run of posts, never the same twice in a row. `allow` limits the asks (no "try the site" without a site). */
function ctaPlan(formats, seed, allow) {
  const out = [];
  const used = {};
  let previous;
  formats.forEach((format, index) => {
    const fit = (BY_FORMAT[format] || BY_FORMAT.carousel).filter((kind) => !allow || allow.includes(kind));
    const base = fit.length ? fit : (BY_FORMAT.carousel).filter((kind) => !allow || allow.includes(kind));
    const pool = base.filter((kind) => kind !== previous);
    const options = pool.length ? pool : base.length ? base : BY_FORMAT.carousel;
    // The least-used suitable ask first, so across a week every kind gets its turn; ties broken by the seed.
    const least = Math.min(...options.map((kind) => used[kind] || 0));
    const tied = options.filter((kind) => (used[kind] || 0) === least);
    const kind = tied[hash(`${seed}:${index}`) % tied.length];
    used[kind] = (used[kind] || 0) + 1;
    out.push(kind);
    previous = kind;
  });
  return out;
}

module.exports = { KINDS, BY_FORMAT, LINES, pickCta, ctaLine, ctaPlan };
