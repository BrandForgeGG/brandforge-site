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
    blurb: 'Try it on your brand.',
    aiDaily: 150,
    features: ['10 AI creations a month (carousels, posts, ads)', '1 short video a month', '2 connected channels', 'Fast AI models', 'Hire on Trade (5% fee)'],
  },
  {
    id: 'pro',
    name: 'Pro',
    cents: 1900,
    price: '€19',
    cadence: '/mo',
    blurb: 'For creators and solo founders.',
    aiDaily: 1500,
    features: ['Unlimited AI creations', '10 videos a month', 'All channels, and a whole week scheduled at once', 'Strongest AI models', 'Cancel anytime'],
    highlight: true,
  },
  {
    id: 'studio',
    name: 'Studio',
    cents: 4900,
    price: '€49',
    cadence: '/mo',
    blurb: 'For small teams and agencies.',
    aiDaily: 1500,
    features: ['Everything in Pro', '5 brand kits', '3 team seats', 'Trade fee lowered to 3%', '10% off any team plan'],
    soon: true,
  },
];
// The BrandForge team, monthly. People on the team, with AI doing the first drafts, deliver the same things every month for
// a fixed price. Change prices here and the pricing page, the chat and the card checkout all follow.
const RETAINERS = [
  {
    id: 'launch',
    name: 'Launch',
    cents: 69000,
    price: '€690',
    cadence: '/mo',
    blurb: 'For brands that need to show up every week.',
    features: ['8 posts or carousels a month', '2 short videos', 'Scheduled on your channels', 'Designer and editor', 'Replies within 48 hours'],
    // What the team delivers each month: the month's work list in the client's chat (lib/plan-month.js).
    deliverables: ['8 posts or carousels', '2 short videos', 'Everything scheduled on your channels'],
  },
  {
    id: 'growth',
    name: 'Growth',
    cents: 125000,
    price: '€1,250',
    cadence: '/mo',
    blurb: 'For brands ready to grow.',
    features: ['12 posts or carousels', '4 short videos', 'Fresh ad creatives every week', '1 site or store update a month', 'Designer, editor and marketer', 'Same-day replies, plus a monthly results report'],
    deliverables: ['12 posts or carousels', '4 short videos', 'Ad creatives, fresh every week', '1 site or store update', 'Monthly results report'],
    highlight: true,
  },
  {
    id: 'scale',
    name: 'Scale',
    cents: 249000,
    price: '€2,490',
    cadence: '/mo',
    blurb: 'Your full growth team.',
    features: ['20 posts or carousels', '8 short videos', 'Ad creatives and ad management', 'Up to 10 developer hours a month', 'A dedicated project lead and a weekly call', 'Priority replies'],
    deliverables: ['20 posts or carousels', '8 short videos', 'Ad creatives and ad management', 'Up to 10 developer hours', 'Weekly call with your project lead', 'Monthly results report'],
  },
];

// Every team plan carries these.
const TEAM_INCLUDES = ['BrandForge AI', "Full refund if month one isn't delivered", 'Card or crypto', 'Cancel anytime'];

function getRetainer(id) {
  return RETAINERS.find((plan) => plan.id === id) || null;
}

function getPlan(id) {
  return PLANS.find((plan) => plan.id === id) || PLANS[0];
}

/** Anything that can be paid for by card: a software plan or a team plan. */
function getPaidPlan(id) {
  const plan = PLANS.find((entry) => entry.id === id && entry.cents > 0 && !entry.soon) || RETAINERS.find((entry) => entry.id === id && entry.cents > 0);
  return plan || null;
}

// Past-due accounts fall back to Free automatically: no late fees, no interest.
function effectivePlan(id, paidThrough, now = new Date()) {
  if (!id || id === 'free') return PLANS[0];
  if (!paidThrough) return PLANS[0];
  return new Date(paidThrough).getTime() >= now.getTime() ? getPlan(id) : PLANS[0];
}

module.exports = { PLANS, RETAINERS, TEAM_INCLUDES, getPlan, getPaidPlan, getRetainer, effectivePlan };
