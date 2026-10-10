'use strict';

// Software plans: a fixed monthly fee for more capacity. AI and media generation stay free on
// every plan; plans only raise workspace limits and unlock team and channel features. Prices are
// the launch test values - change them here and the pricing page follows.

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '€0',
    cadence: '',
    blurb: 'Everything you need to try it with a team.',
    limits: { workspaces: 1, connectedAccounts: 3, queuedPosts: 10, whiteLabel: false, cmsSync: false },
    features: ['AI research, plans and copy', 'Carousel maker', '1 workspace', '3 connected accounts', 'Contracts with a flat fee on release'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '€19',
    cadence: '/month',
    blurb: 'For people who publish every week.',
    limits: { workspaces: 5, connectedAccounts: 15, queuedPosts: 300, whiteLabel: false, cmsSync: true },
    features: ['Everything in Free', '5 workspaces', '15 connected accounts', 'Bulk scheduling queue', 'Shopify, Webflow and WordPress publishing'],
    highlight: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '€79',
    cadence: '/month',
    blurb: 'For teams running several clients.',
    limits: { workspaces: 50, connectedAccounts: 100, queuedPosts: 3000, whiteLabel: true, cmsSync: true },
    features: ['Everything in Pro', '50 workspaces', '100 connected accounts', 'White-label client views', 'Priority review of disputes'],
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

// Past-due accounts fall back to Free automatically: no late fees, no interest.
function effectivePlan(id, paidThrough, now = new Date()) {
  if (!id || id === 'free') return PLANS[0];
  if (!paidThrough) return PLANS[0];
  return new Date(paidThrough).getTime() >= now.getTime() ? getPlan(id) : PLANS[0];
}

module.exports = { PLANS, RETAINERS, getPlan, getRetainer, effectivePlan };
