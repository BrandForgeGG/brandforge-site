'use strict';

// BrandForge's own weekly content calendar: five carousels a day, each weekday with its own mix of
// post types and a rotating look. Pure functions, so the plan for a week can be tested without a model
// or a database. Weekday index 0 is Monday. All times are UTC.
const { THEME_LIST } = require('./carousel-render');

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOT_TIMES = ['06:00', '09:00', '12:00', '15:00', '18:00'];
const POST_TYPES = ['educational', 'news', 'promo', 'list', 'funny', 'story', 'explainer'];

// Each weekday has a focus and the five types it posts, in time order.
const DEFAULT_DAYS = [
  { focus: 'Plan the week', types: ['educational', 'news', 'list', 'promo', 'explainer'] },
  { focus: 'How-to Tuesday', types: ['educational', 'news', 'list', 'funny', 'promo'] },
  { focus: 'Trends and tools', types: ['news', 'educational', 'explainer', 'list', 'promo'] },
  { focus: 'Make it work', types: ['educational', 'list', 'news', 'promo', 'story'] },
  { focus: 'Fun Friday', types: ['funny', 'news', 'list', 'educational', 'promo'] },
  { focus: 'Learn something', types: ['educational', 'explainer', 'list', 'funny', 'news'] },
  { focus: 'Look ahead', types: ['list', 'news', 'educational', 'promo', 'explainer'] },
];

// Topics for BrandForge's audience: founders, small businesses and creators. Nothing here states a
// fact the model would have to invent: how-tos and lists are advice, news topics are search queries
// (the real facts come from the pages found), promo and explainer topics describe what BrandForge does.
const TOPIC_POOL = {
  educational: [
    'How to write a landing page headline that gets clicks',
    'How to plan a month of social media posts in one afternoon',
    'How to turn one blog post into five carousels',
    'How to write a hook in the first line',
    'How to price your first freelance project',
    'How to find your first ten customers',
    'How to write a client brief that gets better work',
    'How to pick the right platform for your audience',
    'How to reuse your best content without repeating yourself',
    'How to run a simple weekly content review',
  ],
  news: [
    'social media algorithm changes this week',
    'AI tools for small business this week',
    'creator economy news this week',
    'startup funding news this week',
    'marketing trends this week',
    'new features on Instagram and TikTok this week',
    'e-commerce news this week',
    'freelance and remote work news this week',
  ],
  promo: [
    'Turn a sentence into a swipeable carousel in about a minute, free to try at BrandForge',
    'One chat from idea to ads, images and a plan, on BrandForge',
    'Hire vetted specialists on BrandForge, with money held until you approve the work',
    'Make carousels from a web page or a text file with BrandForge',
    'Ask BrandForge for a plan, an audit or ads right inside Telegram or Discord',
    'Milestone contracts on BrandForge: you approve each step before it is paid',
  ],
  list: [
    'Five mistakes first-time founders make with their landing page',
    'Five questions to ask before you hire a freelancer',
    'Seven signs your post needs a better hook',
    'Five things to put on every landing page',
    'Six habits of creators who post every week',
    'Five ways to get more saves on a carousel',
    'Seven things to check before you hit publish',
    'Five ways to make a boring topic interesting',
  ],
  funny: [
    'Things every freelancer says on a Monday morning',
    'Founder versus reality: launch day',
    'What clients say versus what they mean',
    'Posting every day: expectations versus reality',
    'The five stages of waiting for a client to reply',
    'Things you say right before the deadline',
  ],
  story: [
    'Why BrandForge exists: AI writes the first draft, a person finishes it',
    'Why a first draft is never the last: a short story about editing',
  ],
  explainer: [
    'What is a carousel post and why does it work',
    'Why saves matter more than likes',
    'How BrandForge holds money until you approve the work',
    'What a content calendar does and who needs one',
    'Who BrandForge is for',
    'What happens when you tell BrandForge your idea',
  ],
};

function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/** The Monday (UTC) of the week containing a date, as YYYY-MM-DD. */
function mondayOf(dateLike) {
  const d = new Date(`${isoDate(dateLike)}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return isoDate(d);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

function weekDates(mondayIso) {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayIso, i));
}

/** UTC timestamp for a date and an "HH:MM" time. */
function scheduledAt(dateIso, time) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || ''));
  return new Date(`${dateIso}T${m ? `${m[1]}:${m[2]}` : '12:00'}:00Z`).toISOString();
}

// A topic for a post: the first one in the type's pool that has not been used lately, starting at a
// position that moves with the date so neighbouring days do not repeat. Falls back to repeating.
function pickTopic(type, dateIso, slot, used) {
  const pool = TOPIC_POOL[type] || TOPIC_POOL.list;
  const seen = new Set((used || []).map((t) => String(t).toLowerCase()));
  const day = Math.floor(new Date(`${dateIso}T00:00:00Z`).getTime() / 86400000);
  const start = (day * 5 + slot * 3) % pool.length;
  for (let i = 0; i < pool.length; i++) {
    const topic = pool[(start + i) % pool.length];
    if (!seen.has(topic.toLowerCase())) return topic;
  }
  return pool[start];
}

function lookFor(dateIso, slot) {
  const day = Math.floor(new Date(`${dateIso}T00:00:00Z`).getTime() / 86400000);
  return THEME_LIST[(day * 5 + slot) % THEME_LIST.length].id;
}

/**
 * The 35 posts of a week.
 * @param {string} mondayIso
 * @param {{ weekday: number, slots: { time?: string, type?: string }[] }[]} prefs  saved per-day overrides
 * @param {string[]} used  topics already used recently
 */
function buildWeekRows(mondayIso, prefs = [], used = []) {
  const rows = [];
  const taken = [...used];
  weekDates(mondayIso).forEach((date, weekday) => {
    const saved = (prefs || []).find((p) => p.weekday === weekday);
    for (let slot = 0; slot < 5; slot++) {
      const override = saved && saved.slots && saved.slots[slot] ? saved.slots[slot] : {};
      const type = POST_TYPES.includes(override.type) ? override.type : DEFAULT_DAYS[weekday].types[slot];
      const topic = pickTopic(type, date, slot, taken);
      taken.push(topic);
      rows.push({ post_date: date, slot, scheduled_at: scheduledAt(date, override.time || SLOT_TIMES[slot]), type, topic, theme: lookFor(date, slot) });
    }
  });
  return rows;
}

module.exports = { DAY_NAMES, SLOT_TIMES, POST_TYPES, DEFAULT_DAYS, TOPIC_POOL, mondayOf, addDays, weekDates, scheduledAt, pickTopic, lookFor, buildWeekRows };
