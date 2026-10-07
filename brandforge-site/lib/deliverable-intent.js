'use strict';

// Deliverable intent: when someone asks for a concrete piece of work ("launch plan for my
// SaaS", "ads for my store", "audit this site") the answer must BE that work, even when the
// request is thin. A system-prompt rule at the top of the conversation loses to a short user
// message, so the directive is appended as the last system message of the turn, right next to
// the request, with a skeleton for the kind of work asked.

const KINDS = [
  {
    kind: 'video',
    pattern: /\b(create|make|produce)\s+(an?\s+)?(short\s+|vertical\s+|promo\s+|ad\s+)?(video|reel|clip)\b/i,
    label: 'a short video',
    skeleton:
      'Structure: call generate_image exactly three times, one scene each (the hook, the product or benefit, the call to action), aspect "portrait", the same visual style in all three, each with a caption of at most 8 words in the "caption" field. Then reply in at most four lines: the concept in one sentence, then the three captions as a numbered list, then tell them the video is ready to build with the button above the message box. Do not write a script and do not describe the images.',
  },
  {
    kind: 'launch_plan',
    pattern: /\b(launch|go[- ]to[- ]market|gtm)\b.{0,20}\b(plan|strategy|checklist)\b|\b(plan|strategy)\b.{0,20}\blaunch/i,
    label: 'a launch plan',
    skeleton:
      'Structure: Goal and assumptions (one line each); Pre-launch (2 weeks, weekly steps); Launch week (day by day, with the channel and the exact post or action); First 30 days (weekly cadence); Channels ranked by effort vs payoff; 5 metrics to watch with a starting target in [brackets].',
  },
  {
    kind: 'ads',
    pattern: /\b(ads?|ad copy|ad pack|ad creatives?|facebook ads|google ads|meta ads|tiktok ads)\b/i,
    label: 'ads',
    skeleton:
      'Structure: for each of Meta, Google, TikTok and LinkedIn (skip any that clearly do not fit): 3 hooks, 3 headlines, 2 full primary texts, one CTA. Then a 20-second video script with a shot list. Use only claims the founder gave you; anything else is a [bracketed placeholder] such as [your offer] or [free shipping, if true].',
  },
  {
    kind: 'audit',
    pattern: /\b(audit|teardown|critique|review my (site|website|landing page))\b/i,
    label: 'an audit',
    skeleton:
      'Structure: Top 3 fixes first, each with the exact change to make and why; then messaging, SEO, conversion and trust findings; then a "Check these yourself" list for anything you could not see (meta tags, schema, speed, mobile layout, backlinks). Only state what research_web actually returned.',
  },
  {
    kind: 'calendar',
    pattern: /\b(content calendar|30[- ]day|posting schedule|social calendar)\b/i,
    label: 'a content calendar',
    skeleton:
      'Structure: 4 content pillars, then a week-by-week table (Day, Platform, Format, Hook, CTA) for 30 days that the person can paste into a spreadsheet, then 5 reusable post templates.',
  },
  {
    kind: 'outreach',
    pattern: /\b(outreach|cold (email|dm)|email sequence|dm sequence|pitch (email|message)s?)\b/i,
    label: 'an outreach sequence',
    skeleton:
      'Structure: who to target in one line, then a 4-message sequence (subject, body under 90 words, send timing), then 2 short DM variants. Use [placeholders] for names and specifics.',
  },
  {
    kind: 'brand_kit',
    pattern: /\b(brand (kit|starter|voice|identity)|brand name|tagline|naming)\b/i,
    label: 'a brand starter kit',
    skeleton:
      'Structure: 5 name options with a one-line reason each, 3 taglines, voice and tone in 4 bullets (with a do and a do-not example), a palette of 5 hex colours with roles, and a font pairing.',
  },
  {
    kind: 'strategy',
    pattern: /\b(swot|soar|tows|pestle|porter'?s?\s+five\s+forces|five\s+forces|gap\s+analysis|7-?s\s+model|strateg(?:y|ic)\s+analysis|strategy\s+framework|noise\s+analysis)\b/i,
    label: 'a strategy analysis',
    skeleton:
      "Structure: 1) Read the situation in the founder's own words and say in ONE line which framework fits and why. If they named a framework, use it. Choose by the situation: the team feels stuck, negative or sales are flat -> SOAR (Strengths, Opportunities, Aspirations, Results) or NOISE (Needs, Opportunities, Improvements, Strengths, Edges). A market, competitors or rules are the pressure -> PESTLE (Political, Economic, Social, Technological, Legal, Environmental) or Porter's Five Forces (rivals, new entrants, substitutes, supplier power, buyer power). They already have a SWOT-style list and need decisions -> TOWS (cross strengths/weaknesses with opportunities/threats). A target to reach -> Gap Analysis (current state, target state, the gap, steps to close it). Inside the company is misaligned -> McKinsey 7-S (Strategy, Structure, Systems, Shared values, Style, Staff, Skills). Add one line \"Also worth running: <runner-up framework> because <reason>\". 2) Fill the framework in as ONE compact markdown table (pipes and a separator row) with concrete items for THEIR situation. Use [bracketed placeholders] where you lack facts; never invent numbers, shares or statistics. 3) Sourcing. For external frameworks (PESTLE, Five Forces) when a real market, city, industry or company is named: call research_web once BEFORE writing, with a query made only of real words from the request (never a [placeholder]; skip the search if no real market is named; do not put a year in the query). Every statistic, share, growth rate or user count in the table must come from what research_web returned and be followed by its source in parentheses, for example (statista.com). If a number is not in the search results, leave it out and describe the factor in words. Write \"From general knowledge, not live sources\" under the table ONLY when no search ran or it returned nothing; never write it next to numbers you took from a search. 4) \"What this means\": three bullets, each a decision or risk, not a restatement of the table. 5) \"Next 3 actions\": each starts with a verb and carries [owner] and [by when] placeholders.",
  },
  {
    kind: 'competitors',
    pattern: /\b(competitors?|alternatives to|compare (us|me|my)|vs\.? )\b/i,
    label: 'a competitor view',
    skeleton:
      'Structure: 3 to 5 named competitors found with research_web (cite the pages), a table of positioning, pricing and channels, then 3 gaps to exploit. If search is unavailable, say so and give the categories to check instead.',
  },
  {
    kind: 'plan',
    pattern: /\b(roadmap|blueprint|business plan|project plan|scope(?: it| this)?|plan (my|this|the|an?) \w+)\b/i,
    label: 'a plan',
    skeleton:
      'Structure: goal, the 3 riskiest assumptions, phases with deliverables and rough timing, what to build first, and an AI-estimated cost range in EUR (clearly an estimate).',
  },
];

// The most specific kind wins (the list is ordered from specific to general).
function detectDeliverable(message) {
  const text = String(message ?? '').trim();
  if (text.length < 4) return null;
  for (const entry of KINDS) {
    if (entry.pattern.test(text)) return entry.kind;
  }
  return null;
}

// Text for the final system message of the turn, or '' when the request is not a deliverable.
function deliverableDirective(message) {
  const kind = detectDeliverable(message);
  if (!kind) return '';
  const entry = KINDS.find((item) => item.kind === kind);
  return [
    `DELIVERABLE MODE. The founder just asked for ${entry.label}. Write the complete first version in THIS reply, before anything else.`,
    'Do not open with questions and never send a numbered list of questions. If details are missing, put at most three assumptions in one line at the top ("Assuming: ...") and use [bracketed placeholders] for names and numbers they must fill in.',
    entry.skeleton,
    'Record any project facts with tools in the same turn, but do not recap them. Never invent offers, prices, statistics, awards or testimonials.',
    'After the deliverable, end with ONE short question that would sharpen the next version, plus two specific refinements they can ask for. Keep it tight: concrete, scannable, no filler.',
  ].join('\n');
}

// The small model sometimes appends "From general knowledge, not live sources" under a table whose
// numbers it just cited. When a source in parentheses (example.com) is present, drop that line:
// a contradictory provenance note is worse than none.
function tidySourcing(text) {
  const value = String(text ?? '');
  const hasCitation = /\(\s*(?:[a-z0-9-]+\.)+[a-z]{2,}[^)\s]*\s*\)/i.test(value);
  if (!hasCitation) return value;
  return value.replace(/^[ \t]*[*_]*From general knowledge, not live sources\.?[*_]*[ \t]*$\n?/gim, '').replace(/\n{3,}/g, '\n\n');
}

module.exports = { detectDeliverable, deliverableDirective, tidySourcing, KINDS };
