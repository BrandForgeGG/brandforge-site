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

module.exports = { KINDS, CATEGORIES, CURRENCIES, validateListing, budgetLabel, matches };
