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
    features: ['AI research, plans and copy', 'Image and video creation', '1 workspace', '3 connected accounts', 'Contracts with a flat fee on release'],
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

function getPlan(id) {
  return PLANS.find((plan) => plan.id === id) || PLANS[0];
}

// Past-due accounts fall back to Free automatically: no late fees, no interest.
function effectivePlan(id, paidThrough, now = new Date()) {
  if (!id || id === 'free') return PLANS[0];
  if (!paidThrough) return PLANS[0];
  return new Date(paidThrough).getTime() >= now.getTime() ? getPlan(id) : PLANS[0];
}

module.exports = { PLANS, getPlan, effectivePlan };
