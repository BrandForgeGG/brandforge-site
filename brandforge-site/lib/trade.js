'use strict';

// Trade Center rules: what a listing may contain and how a filter matches. Pure and tested.

const KINDS = ['offer', 'request'];
const CATEGORIES = [
  'Design and brand',
  'Video and motion',
  'Copy and content',
  'Ads and growth',
  'Social and community',
  'Web and software',
  'Photography',
  'Strategy and research',
  'Products and tools',
  'Startup and launch',
  'Profile',
];
const CURRENCIES = ['EUR', 'USD', 'GBP'];

function clean(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function cents(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Math.round(Number(String(value).replace(',', '.')) * 100);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function validateListing(input) {
  const kind = KINDS.includes(input && input.kind) ? input.kind : null;
  if (!kind) return { ok: false, error: 'Choose whether you offer a service or need one.' };

  const category = CATEGORIES.includes(input.category) ? input.category : null;
  if (!category) return { ok: false, error: 'Pick a category.' };

  const title = clean(input.title, 100);
  if (title.length < 5) return { ok: false, error: 'Give the listing a title (at least 5 characters).' };

  const description = clean(input.description, 1200);
  if (description.length < 30) return { ok: false, error: 'Describe it in a couple of sentences (at least 30 characters).' };

  const currency = String(input.currency || 'EUR').toUpperCase();
  if (!CURRENCIES.includes(currency)) return { ok: false, error: 'Currency must be EUR, USD or GBP.' };

  const min = cents(input.budgetMin);
  const max = cents(input.budgetMax);
  if (Number.isNaN(min) || Number.isNaN(max)) return { ok: false, error: 'Budget must be a number.' };
  if (min !== null && max !== null && max < min) return { ok: false, error: 'The top of the budget is below the bottom.' };
  if ((max ?? min ?? 0) > 100_000_000) return { ok: false, error: 'Budget is above the 1,000,000 limit.' };

  return { ok: true, value: { kind, category, title, description, currency, budgetMinCents: min, budgetMaxCents: max } };
}

function budgetLabel(listing, formatMoney) {
  const { budgetMinCents: lo, budgetMaxCents: hi, currency } = listing;
  if (lo == null && hi == null) return 'Open to offers';
  if (hi == null) return `From ${formatMoney(lo, currency)}`;
  if (lo == null) return `Up to ${formatMoney(hi, currency)}`;
  if (lo != null && hi != null && lo !== hi) return `${formatMoney(lo, currency)} to ${formatMoney(hi, currency)}`;
  return formatMoney(hi ?? lo, currency);
}

function matches(listing, { kind, category, q }) {
  if (kind && listing.kind !== kind) return false;
  if (category && listing.category !== category) return false;
  if (q) {
    const hay = `${listing.title} ${listing.description} ${listing.category}`.toLowerCase();
    return q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((word) => hay.includes(word));
  }
  return true;
}

// A plain first draft from what someone typed, with no AI: used when the writer is unavailable so describing
// something never dead-ends. It guesses the kind, the category and a price only when the text says one.
const CATEGORY_WORDS = [
  ['Startup and launch', /\b(startup|launch|launching|founder|investor|pitch|beta|waitlist)\b/i],
  ['Products and tools', /\b(product|tool|app|software|plugin|template|ebook|course|kit|saas|extension)\b/i],
  ['Profile', /\b(i am a|i'm a|my profile|about me|freelancer|available for)\b/i],
  ['Video and motion', /\b(video|reel|animation|motion|editing|voice-?over|podcast)\b/i],
  ['Design and brand', /\b(logo|brand|design|designer|figma|ui|ux|illustration)\b/i],
  ['Copy and content', /\b(copy|writer|writing|blog|article|content|translation|newsletter)\b/i],
  ['Ads and growth', /\b(ads?|marketing|seo|growth|campaign|leads)\b/i],
  ['Social and community', /\b(social|instagram|tiktok|community|linkedin|manager)\b/i],
  ['Photography', /\b(photo|photos|photography|photographer)\b/i],
  ['Web and software', /\b(website|web|developer|code|react|backend|automation|chatbot|dashboard|api)\b/i],
];

function guessListing(text) {
  const value = clean(text, 1200);
  const kind = /\b(i need|we need|looking for|i want|we want|hire|wanted|searching for|need a|need an|need someone)\b/i.test(value) ? 'request' : 'offer';
  const category = (CATEGORY_WORDS.find(([, pattern]) => pattern.test(value)) || ['Strategy and research'])[0];
  const firstSentence = value.split(/(?<=[.!?])\s/)[0] || value;
  const title = clean(firstSentence, 80);
  const money = /([€$£])\s?(\d[\d.,]*)|(\d[\d.,]*)\s?(eur|usd|gbp|euro|dollars?)/i.exec(value);
  let currency = 'EUR';
  let amount = null;
  if (money) {
    const sign = money[1];
    currency = sign === '$' ? 'USD' : sign === '£' ? 'GBP' : /usd|dollar/i.test(money[4] || '') ? 'USD' : /gbp/i.test(money[4] || '') ? 'GBP' : 'EUR';
    amount = (money[2] || money[3] || '').replace(',', '.').replace(/[.,]+$/, '');
  }
  return { kind, category, title, description: value, currency, budgetMin: kind === 'offer' ? amount : null, budgetMax: kind === 'request' ? amount : null };
}

module.exports = { KINDS, CATEGORIES, CURRENCIES, validateListing, budgetLabel, matches, guessListing };
