'use strict';

// Software plans. Every line here is something the product does today. Free makes and publishes everything; Pro puts the
// strongest AI on every piece (lib/model-router.js and lib/ai-tier.ts read the plan on each request). Prices are launch
// values: change them here and the pricing page, Settings and the card checkout follow.

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    cents: 0,
    price: '€0',
    cadence: '',
    blurb: 'Make, publish and trade. No card needed.',
    aiDaily: 150,
    features: [
      'A chat that plans, writes and researches with you',
      'Carousels, pictures, videos with voice-over and articles',
      'Launch videos made from your website',
      'Post or schedule to LinkedIn, Bluesky, YouTube, Telegram and more',
      'List and trade in the marketplace',
      'Fast AI models, 150 AI messages a day',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    cents: 1900,
    price: '€19',
    cadence: '/month',
    blurb: 'The best AI on everything you make.',
    aiDaily: 1500,
    features: [
      'Everything in Free',
      'The strongest writing models first (Claude, GPT, Gemini), switched to whichever is answering',
      'The best picture model on every picture, every video scene included',
      '1,500 AI messages a day, ten times Free',
      'Keeps working when the free daily capacity runs out',
      'Cancel any time from Settings',
    ],
    highlight: true,
  },
];
// The BrandForge team, monthly. A person on the team, with AI doing the first drafts, delivers the same things every
// month for a fixed price. Prices are test values to be confirmed in conversation: change them here and the pricing
// page, the chat and the card checkout all follow.
const RETAINERS = [
  {
    id: 'starter',
    name: 'Starter',
    cents: 49000,
    price: '€490',
    cadence: '/month',
    blurb: 'A steady content engine for one brand.',
    bestFor: 'Founders and small shops who need to show up every week.',
    features: [
      '8 carousels or posts a month, designed and written',
      'A caption for every platform',
      'A monthly content calendar',
      'A monthly review chat with your team member',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    cents: 99000,
    price: '€990',
    cadence: '/month',
    blurb: 'Content, ads and a weekly rhythm.',
    bestFor: 'Brands that want to publish daily and learn from it.',
    features: [
      '20 carousels or posts a month',
      'Ad copy and creative ideas for two platforms',
      'A weekly report: what worked and what to change',
      'Replies within one working day',
      'One round of revisions on every piece',
    ],
    highlight: true,
  },
  {
    id: 'build',
    name: 'Build',
    cents: 249000,
    price: '€2,490',
    cadence: '/month',
    blurb: 'A website or app that keeps moving.',
    bestFor: 'Products that need steady building after launch.',
    features: [
      'Up to two new pages or features a month',
      'Fixes, updates and a monthly roadmap',
      'A developer on call in your chat',
      'Bigger pieces run as milestone contracts',
    ],
  },
  {
    id: 'custom',
    name: 'Custom',
    cents: 0,
    price: 'From €5,000',
    cadence: '',
    blurb: 'Larger builds, teams and several channels.',
    bestFor: 'Companies and high-value projects.',
    features: [
      'A scoped project or retainer built around you',
      'A named lead and a small team',
      'Milestone contracts held in escrow, card or crypto',
      'Direct line to the founder',
    ],
  },
];

function getRetainer(id) {
  return RETAINERS.find((plan) => plan.id === id) || null;
}

function getPlan(id) {
  return PLANS.find((plan) => plan.id === id) || PLANS[0];
}

/** Anything that can be paid for by card: a software plan or a team plan. */
function getPaidPlan(id) {
  const plan = PLANS.find((entry) => entry.id === id && entry.cents > 0) || RETAINERS.find((entry) => entry.id === id && entry.cents > 0);
  return plan || null;
}

// Past-due accounts fall back to Free automatically: no late fees, no interest.
function effectivePlan(id, paidThrough, now = new Date()) {
  if (!id || id === 'free') return PLANS[0];
  if (!paidThrough) return PLANS[0];
  return new Date(paidThrough).getTime() >= now.getTime() ? getPlan(id) : PLANS[0];
}

module.exports = { PLANS, RETAINERS, getPlan, getPaidPlan, getRetainer, effectivePlan };
