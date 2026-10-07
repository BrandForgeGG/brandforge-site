'use strict';

// The Distribute studio: ads, a content calendar, a launch plan and outreach, each compiling its
// options into one request for the chat. Same engine as Create (lib/studio-core.js).

const { REFERENCE_FIELD, normalizeUrl, makeStudio, listOrAll } = require('./studio-core');

const TONES = ['Friendly', 'Bold', 'Professional', 'Playful', 'Luxury'];
const STYLES = ['Photo', 'Illustration', '3D render', 'Flat vector', 'Cinematic', 'Watercolor'];
const AD_PLATFORMS = ['Meta', 'Google', 'TikTok', 'LinkedIn'];
const SOCIAL_PLATFORMS = ['Instagram', 'TikTok', 'LinkedIn', 'X', 'Facebook', 'Email'];

const GROUPS = [
  { id: 'ads', label: 'Ads' },
  { id: 'content', label: 'Content' },
  { id: 'reach', label: 'Launch and outreach' },
];

const TOOLS = [
  {
    id: 'adpack',
    group: 'ads',
    label: 'Ad pack from a URL',
    hint: 'Hooks, headlines and copy per platform, plus a video script',
    fields: [
      { key: 'url', label: 'Website address', type: 'url', required: true, placeholder: 'https://yourstore.com' },
      { key: 'platforms', label: 'Platforms', type: 'multi', options: AD_PLATFORMS, default: [...AD_PLATFORMS] },
      { key: 'goal', label: 'Goal', type: 'chips', options: ['Sales', 'Leads', 'Awareness'], default: 'Sales' },
      { key: 'tone', label: 'Tone', type: 'chips', options: TONES, default: 'Friendly' },
    ],
    example: { url: 'https://bakesy.app', platforms: ['Meta', 'TikTok'], goal: 'Leads', tone: 'Friendly' },
    build(values) {
      const platforms = listOrAll(values.platforms, AD_PLATFORMS);
      return `Read ${values.url} and build a ready-to-run ad pack for ${platforms}: for each platform give 3 hooks, 3 headlines and 2 primary texts aimed at ${String(values.goal).toLowerCase()}, tone ${String(values.tone).toLowerCase()}, then a 20-second video script with a shot list. Use only claims that appear on the page; use [brackets] for anything I need to confirm.`;
    },
  },
  {
    id: 'visuals',
    group: 'ads',
    label: 'Ad visuals',
    hint: 'Image creatives for your ads',
    fields: [
      { key: 'subject', label: 'What are you advertising?', type: 'textarea', required: true, placeholder: 'A hand-poured soy candle in an amber jar, cozy autumn feel' },
      { key: 'style', label: 'Style', type: 'chips', options: STYLES, default: 'Photo' },
      { key: 'format', label: 'Format', type: 'chips', options: ['Square', 'Portrait', 'Landscape'], default: 'Square' },
      { key: 'count', label: 'How many', type: 'chips', options: ['1', '2', '3', '4'], default: '2' },
    ],
    example: { subject: 'A hand-poured soy candle in an amber jar, cozy autumn feel', style: 'Photo', format: 'Portrait', count: '2' },
    build(values) {
      const count = Number(values.count) || 1;
      const parts = [
        `Create ${count > 1 ? `${count} different ad visuals` : 'an ad visual'} for: ${values.subject}.`,
        `Style: ${values.style}.`,
        `Format: ${String(values.format).toLowerCase()}.`,
        'One image each, with a clean empty area where a headline could sit.',
      ];
      if (count > 1) parts.push('Call generate_image once per image, all in the same step, with clearly different compositions, and pass batch true.');
      return parts.join(' ');
    },
  },
  {
    id: 'calendar',
    group: 'content',
    label: 'Content calendar',
    hint: 'A table you can copy into a spreadsheet',
    fields: [
      { key: 'about', label: 'What is the business?', type: 'textarea', required: true, placeholder: 'A neighbourhood coffee roaster selling beans and running tastings' },
      { key: 'days', label: 'Length', type: 'chips', options: ['7 days', '14 days', '30 days'], default: '30 days' },
      { key: 'platforms', label: 'Platforms', type: 'multi', options: SOCIAL_PLATFORMS, default: ['Instagram', 'TikTok'] },
      { key: 'cadence', label: 'How often', type: 'chips', options: ['Daily', '5 a week', '3 a week'], default: '5 a week' },
      { key: 'tone', label: 'Tone', type: 'chips', options: TONES, default: 'Friendly' },
    ],
    example: { about: 'A neighbourhood coffee roaster selling beans and running tastings', days: '14 days', platforms: ['Instagram', 'TikTok'], cadence: '5 a week', tone: 'Playful' },
    build(values) {
      const platforms = listOrAll(values.platforms, SOCIAL_PLATFORMS);
      return `Build a ${values.days} content calendar for: ${values.about}. Platforms: ${platforms}. Posting ${String(values.cadence).toLowerCase()}. Tone: ${String(values.tone).toLowerCase()}. Give four content pillars first, then one markdown table with the columns Day, Platform, Format, Hook, Caption and CTA, then 3 reusable post templates.`;
    },
  },
  {
    id: 'launch',
    group: 'reach',
    label: 'Launch plan',
    hint: 'Channels, checklist and draft posts',
    fields: [
      { key: 'what', label: 'What are you launching?', type: 'textarea', required: true, placeholder: 'A booking app for independent hair salons' },
      { key: 'stage', label: 'Where are you now', type: 'chips', options: ['Idea', 'Building', 'Ready to launch', 'Already live'], default: 'Ready to launch' },
      { key: 'channels', label: 'Channels you can use', type: 'multi', options: ['Product Hunt', 'Reddit', 'X', 'LinkedIn', 'Email list', 'Communities', 'Press'], default: ['Product Hunt', 'X', 'LinkedIn'] },
      { key: 'timeline', label: 'Timeline', type: 'chips', options: ['1 week', '2 weeks', '1 month'], default: '2 weeks' },
    ],
    example: { what: 'A booking app for independent hair salons', stage: 'Ready to launch', channels: ['Product Hunt', 'LinkedIn', 'Communities'], timeline: '2 weeks' },
    build(values) {
      const channels = listOrAll(values.channels, ['Product Hunt', 'X', 'LinkedIn']);
      return `Make a channel-by-channel launch plan for: ${values.what}. Stage: ${String(values.stage).toLowerCase()}. Channels available: ${channels}. Timeline: ${values.timeline}. Include a checklist, a day-by-day schedule and draft posts for each channel.`;
    },
  },
  {
    id: 'outreach',
    group: 'reach',
    label: 'Outreach sequence',
    hint: 'Emails and DMs that sound like a person',
    fields: [
      { key: 'audience', label: 'Who are you writing to?', type: 'textarea', required: true, placeholder: 'Owners of independent coffee shops in Berlin' },
      { key: 'offer', label: 'What are you offering?', type: 'text', placeholder: 'Free tasting kit for new wholesale customers' },
      { key: 'channel', label: 'Channel', type: 'chips', options: ['Email', 'LinkedIn DM', 'X DM'], default: 'Email' },
      { key: 'steps', label: 'Messages in the sequence', type: 'chips', options: ['3', '4', '5'], default: '4' },
    ],
    example: { audience: 'Owners of independent coffee shops in Berlin', offer: 'Free tasting kit for new wholesale customers', channel: 'Email', steps: '4' },
    build(values) {
      const offer = values.offer ? ` Offer: ${values.offer}.` : '';
      return `Write a ${values.steps}-message ${String(values.channel).toLowerCase()} outreach sequence to: ${values.audience}.${offer} For each message give the send timing and a body under 90 words, then two shorter variants of the first message. Use [placeholders] for names and specifics.`;
    },
  },
];

const studio = makeStudio(TOOLS);

module.exports = {
  TOOLS,
  GROUPS,
  REFERENCE_FIELD,
  getTool: studio.getTool,
  defaultValues: studio.defaultValues,
  compile: studio.compile,
  normalizeUrl,
};
