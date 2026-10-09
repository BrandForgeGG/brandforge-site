'use strict';

// Founder-provided portfolio (2026-10-03): the real shipped-work list for the
// landing proof section. Descriptions and links are verbatim — no invented
// metrics, no fabricated outcomes. `screenshot` stays null until the founder
// provides images; the UI falls back to the letter tile.
// 2026-10-09: screenshots captured from the live sites (public/work). Lava.pw and Cloutscout.ai
// were offline, Boostingfactory sits behind a bot check and Instagram is login-walled, so those
// keep the letter tile. Fluorite.store pointed at brandforge.gg by mistake; fixed.

const PORTFOLIO_PROJECTS = [
  {
    name: 'Whiteskyhosting.com',
    category: 'SaaS',
    description: 'Hosting & VPS Company',
    url: 'https://whiteskyhosting.com',
    screenshot: '/work/whiteskyhosting-com.jpg',
  },
  {
    name: 'Grindnode',
    category: 'SaaS',
    description: 'Hosting & VPS Provider',
    url: 'https://gracious-tables-391724.framer.app',
    screenshot: '/work/grindnode.jpg',
  },
  {
    name: 'CarSpotApp iOS',
    category: 'SaaS',
    description: 'Real-time vehicle tracking system',
    url: 'https://apps.apple.com/us/app/carspot-live/id6739596635',
    screenshot: '/work/carspotapp-ios.jpg',
  },
  {
    name: 'DirectFiber',
    category: 'SaaS',
    description: 'Enterprise ISP portal w/ custom billing',
    url: 'https://www.directfiber.nl',
    screenshot: '/work/directfiber.jpg',
  },
  {
    name: 'Drain.cx',
    category: 'E-commerce',
    description: 'Scripts for Rust, R6 Siege & Apex Legends',
    url: 'https://drain.cx',
    screenshot: '/work/drain-cx.jpg',
  },
  {
    name: 'Boostingfactory.com',
    category: 'E-commerce',
    description: 'boosting service for HotS, LoL, Modern Warfare, Apex Legends and Overwatch.',
    url: 'https://www.boostingfactory.com',
    screenshot: null,
  },
  {
    name: 'Fluorite.store',
    category: 'E-commerce',
    description: 'Competitive edge tools for MLBB/FF/CODM',
    url: 'https://fluorite.store',
    screenshot: '/work/fluorite-store.jpg',
  },
  {
    name: 'Lava.pw',
    category: 'Blockchain / AI',
    description: 'AI Agent for Sui Blockchain',
    url: 'https://lava.pw',
    screenshot: null,
  },
  {
    name: 'Cloutscout.ai',
    category: 'Blockchain / AI',
    description: 'AI-powered Instagram/TikTok creator discovery',
    url: 'https://cloutscout.ai',
    screenshot: null,
  },
  {
    name: 'GazedValleyBeef',
    category: 'Content Creation',
    description: 'Premium WA grass-fed Black Angus beef',
    url: 'https://www.instagram.com/grazedvalleybeef?igsh=MXM2ZG9ja3FoaG96MA==',
    screenshot: null,
  },
];

function projectSlug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = { PORTFOLIO_PROJECTS, projectSlug };
