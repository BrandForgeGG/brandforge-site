'use strict';

// BrandForge's own weekly content calendar: five posts a day at five set times, each in a different format
// (a quote, a tip, a carousel, an ad or announcement, a poll), each weekday with its own mix of topics and a
// rotating look. Pure functions, so the plan for a week can be tested without a model
// or a database. Weekday index 0 is Monday. All times are UTC.
const { THEME_LIST } = require('./carousel-render');

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Morning scroll, mid-morning, after lunch, evening wind-down, prime time. Posts stay at least 2.5 hours apart so
// the platforms never have to choose between two of them.
const SLOT_TIMES = ['07:30', '11:00', '14:00', '18:30', '21:30'];
const MIN_GAP_MINUTES = 150;
const POST_TYPES = ['educational', 'news', 'promo', 'list', 'funny', 'story', 'explainer', 'inspire', 'engage'];
// What each post is made as. Carousels are the only format that can search the news.
const POST_FORMATS = ['carousel', 'quote', 'tip', 'ad', 'announcement', 'question'];

// Each weekday has a focus, and the topic type and format of its five posts in time order: a quote to start the
// day, a tip, the carousel, an ad or announcement, and a poll to end it. No two neighbours share a format.
const DEFAULT_DAYS = [
  { focus: 'Plan the week', types: ['inspire', 'educational', 'news', 'promo', 'engage'], formats: ['quote', 'tip', 'carousel', 'ad', 'question'] },
  { focus: 'How-to Tuesday', types: ['inspire', 'educational', 'list', 'promo', 'engage'], formats: ['quote', 'tip', 'carousel', 'ad', 'question'] },
  { focus: 'Trends and tools', types: ['inspire', 'explainer', 'news', 'promo', 'engage'], formats: ['quote', 'tip', 'carousel', 'announcement', 'question'] },
  { focus: 'Make it work', types: ['inspire', 'educational', 'list', 'promo', 'engage'], formats: ['quote', 'tip', 'carousel', 'ad', 'question'] },
  { focus: 'Fun Friday', types: ['inspire', 'educational', 'funny', 'promo', 'engage'], formats: ['quote', 'tip', 'carousel', 'ad', 'question'] },
  { focus: 'Learn something', types: ['inspire', 'explainer', 'educational', 'promo', 'engage'], formats: ['quote', 'tip', 'carousel', 'announcement', 'question'] },
  { focus: 'Look ahead', types: ['story', 'educational', 'list', 'promo', 'engage'], formats: ['quote', 'tip', 'carousel', 'ad', 'question'] },
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
    'Make a carousel from one sentence with BrandForge',
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
  inspire: [
    'Consistency beats intensity when you post',
    'Done is better than perfect when you are starting out',
    'A first draft is only the start of the work',
    'Small posts every day add up to a body of work',
    'You do not need more ideas, you need to finish one',
    'Clarity is a kindness to your reader',
    'The best time to start the thing is before you feel ready',
    'Your audience is looking for you, make it easy to find you',
    'Good work gets better when someone else reads it',
    'Show the work, not only the result',
  ],
  engage: [
    'Which platform gets you the most clients',
    'How often do you post: daily, weekly or when you remember',
    'What slows you down most when making content',
    'Do you write the hook first or last',
    'What would you hand to a helper first: writing, design or posting',
    'Morning or evening: when do you post',
    'What do you want to learn next: ads, writing or design',
    'Which matters more to you right now: reach, leads or sales',
    'Do you plan your week ahead or post on the day',
    'Which format do you use most: carousel, video or text',
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

// -> { ok: true } or { ok: false, error }: the times of one day, in order, with at least MIN_GAP_MINUTES between them.
function checkSlotGaps(times) {
  const minutes = (times || []).map((time) => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  });
  if (minutes.some((value) => value === null)) return { ok: false, error: 'Every post needs a time.' };
  for (let i = 1; i < minutes.length; i++) {
    if (minutes[i] - minutes[i - 1] < MIN_GAP_MINUTES) return { ok: false, error: 'Keep posts at least 2.5 hours apart and in order, or the platforms favour one and bury the other.' };
  }
  return { ok: true };
}

function lookFor(dateIso, slot) {
  const day = Math.floor(new Date(`${dateIso}T00:00:00Z`).getTime() / 86400000);
  return THEME_LIST[(day * 5 + slot) % THEME_LIST.length].id;
}

/**
 * The 35 posts of a week (five a day).
 * @param {string} mondayIso
 * @param {{ weekday: number, slots: { time?: string, type?: string, format?: string }[] }[]} prefs  saved per-day overrides
 * @param {string[]} used  topics already used recently
 */
function buildWeekRows(mondayIso, prefs = [], used = []) {
  const rows = [];
  const taken = [...used];
  weekDates(mondayIso).forEach((date, weekday) => {
    const saved = (prefs || []).find((p) => p.weekday === weekday);
    for (let slot = 0; slot < 5; slot++) {
      const override = saved && saved.slots && saved.slots[slot] ? saved.slots[slot] : {};
      const format = POST_FORMATS.includes(override.format) ? override.format : DEFAULT_DAYS[weekday].formats[slot];
      let type = POST_TYPES.includes(override.type) ? override.type : DEFAULT_DAYS[weekday].types[slot];
      if (type === 'news' && format !== 'carousel') type = 'educational';
      const topic = pickTopic(type, date, slot, taken);
      taken.push(topic);
      rows.push({ post_date: date, slot, scheduled_at: scheduledAt(date, override.time || SLOT_TIMES[slot]), type, format, topic, theme: lookFor(date, slot) });
    }
  });
  return rows;
}

module.exports = { DAY_NAMES, SLOT_TIMES, MIN_GAP_MINUTES, POST_FORMATS, checkSlotGaps, POST_TYPES, DEFAULT_DAYS, TOPIC_POOL, mondayOf, addDays, weekDates, scheduledAt, pickTopic, lookFor, buildWeekRows };
