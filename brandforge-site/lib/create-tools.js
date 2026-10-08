'use strict';

// The Create studio: every tool is a small form whose answers compile into ONE clear request for
// the chat. Keeping the compile step pure (no React, no network) makes it testable and keeps the
// page honest: what the person picks is exactly what gets asked.

const STYLES = ['Photo', 'Illustration', '3D render', 'Flat vector', 'Cinematic', 'Watercolor'];
const TONES = ['Friendly', 'Bold', 'Professional', 'Playful', 'Luxury'];
const FORMATS = ['Square', 'Portrait', 'Landscape'];

const GROUPS = [
  { id: 'visuals', label: 'Visuals' },
  { id: 'words', label: 'Words' },
  { id: 'plan', label: 'Plan and research' },
];

// Field types: text, textarea, url, select, chips (single choice), multi (several choices).
const TOOLS = [
  {
    id: 'image',
    group: 'visuals',
    label: 'Image',
    hint: 'Ad visuals, logo concepts, mockups',
    fields: [
      { key: 'subject', label: 'What should it show?', type: 'textarea', required: true, placeholder: 'A hand-poured soy candle in an amber jar on a wooden table, warm window light' },
      { key: 'style', label: 'Style', type: 'chips', options: STYLES, default: 'Photo' },
      { key: 'format', label: 'Format', type: 'chips', options: FORMATS, default: 'Square' },
      { key: 'count', label: 'How many', type: 'chips', options: ['1', '2', '3', '4'], default: '1' },
    ],
    example: { subject: 'A hand-poured soy candle in an amber jar on a wooden table, warm window light', style: 'Photo', format: 'Portrait', count: '2' },
    build(values) {
      const count = Number(values.count) || 1;
      const lead = count > 1 ? `Create ${count} different images` : 'Create an image';
      const parts = [`${lead}: ${values.subject}.`, `Style: ${values.style}.`, `Format: ${String(values.format).toLowerCase()}.`];
      if (count > 1) parts.push('Call generate_image once per image, all in the same step, each with a clearly different composition, and pass batch true.');
      return parts.join(' ');
    },
  },
  {
    id: 'video',
    group: 'visuals',
    label: 'Video',
    hint: 'Captioned scenes built into an MP4',
    fields: [
      { key: 'topic', label: 'What is the video about?', type: 'textarea', required: true, placeholder: 'A cozy neighbourhood coffee roaster called Ember Bean' },
      { key: 'scenes', label: 'Scenes', type: 'chips', options: ['3', '4'], default: '3' },
      { key: 'style', label: 'Visual style', type: 'chips', options: STYLES, default: 'Cinematic' },
      { key: 'tone', label: 'Caption tone', type: 'chips', options: TONES, default: 'Friendly' },
    ],
    example: { topic: 'A cozy neighbourhood coffee roaster called Ember Bean', scenes: '3', style: 'Cinematic', tone: 'Friendly' },
    build(values) {
      return `Create a video: ${values.topic}. Use ${values.scenes} scenes. Visual style: ${values.style}. Caption tone: ${String(values.tone).toLowerCase()}.`;
    },
  },
  {
    id: 'copy',
    group: 'words',
    label: 'Copy',
    hint: 'Posts, emails, landing page, product text',
    fields: [
      { key: 'kind', label: 'What do you need?', type: 'chips', options: ['Social posts', 'Email sequence', 'Landing page', 'Product description', 'Press release', 'Blog outline'], default: 'Social posts' },
      { key: 'about', label: 'What is it about?', type: 'textarea', required: true, placeholder: 'Our new oat-milk latte launching Friday at Ember Bean' },
      { key: 'tone', label: 'Tone', type: 'chips', options: TONES, default: 'Friendly' },
      { key: 'length', label: 'Length', type: 'chips', options: ['Short', 'Medium', 'Long'], default: 'Medium' },
      { key: 'audience', label: 'Audience (optional)', type: 'text', placeholder: 'Busy professionals who care about local business' },
    ],
    example: { kind: 'Social posts', about: 'Our new oat-milk latte launching Friday at Ember Bean', tone: 'Playful', length: 'Short', audience: 'Local coffee lovers' },
    build(values) {
      const audience = values.audience ? ` Audience: ${values.audience}.` : '';
      return `Write ${String(values.kind).toLowerCase()} about: ${values.about}. Tone: ${String(values.tone).toLowerCase()}. Length: ${String(values.length).toLowerCase()}.${audience} Give a usable first version, not options to choose from.`;
    },
  },
  {
    id: 'audit',
    group: 'plan',
    label: 'Website audit',
    hint: 'A ranked fix list from your URL',
    fields: [
      { key: 'url', label: 'Website address', type: 'url', required: true, placeholder: 'https://yourwebsite.com' },
      { key: 'focus', label: 'Focus on', type: 'multi', options: ['Messaging', 'SEO', 'Conversion', 'Trust'], default: ['Messaging', 'SEO', 'Conversion', 'Trust'] },
    ],
    example: { url: 'https://bakesy.app', focus: ['Messaging', 'Conversion'] },
    build(values) {
      const focus = (values.focus && values.focus.length ? values.focus : ['messaging', 'SEO', 'conversion', 'trust']).map((item) => String(item).toLowerCase()).join(', ');
      return `Audit this website: ${values.url}. Read the page first, then give a prioritised fix list covering ${focus}. Cite what you read. Put the three highest-impact fixes first with the exact change to make. You can only see the page title and visible text: do not state facts about meta tags, schema, speed, mobile layout or backlinks. List those under "Check these yourself" instead, and only quote customers or logos that appear on the page.`;
    },
  },
  {
    id: 'strategy',
    group: 'plan',
    label: 'Strategy analysis',
    hint: 'SOAR, TOWS, PESTLE, Porter, gap and more',
    fields: [
      { key: 'situation', label: 'What is the situation?', type: 'textarea', required: true, placeholder: 'A neighbourhood coffee roaster, three big chains in town, sales are flat' },
      { key: 'framework', label: 'Framework', type: 'chips', options: ['Auto', 'SWOT', 'SOAR', 'NOISE', 'TOWS', 'PESTLE', "Porter's Five Forces", 'Gap analysis', 'McKinsey 7-S'], default: 'Auto' },
      { key: 'market', label: 'Market or industry (optional)', type: 'text', placeholder: 'German fintech' },
    ],
    example: { situation: 'A neighbourhood coffee roaster, three big chains in town, sales are flat', framework: 'Auto', market: '' },
    build(values) {
      const market = values.market ? ` Market: ${values.market}.` : '';
      if (!values.framework || values.framework === 'Auto') {
        return `Run a strategy analysis (choose the best framework for this and say why): ${values.situation}.${market}`;
      }
      return `Run a ${values.framework} analysis: ${values.situation}.${market}`;
    },
  },
  {
    id: 'plan',
    group: 'plan',
    label: 'Project plan',
    hint: 'Idea to scope, roadmap and estimate',
    fields: [
      { key: 'idea', label: 'What do you want to build or launch?', type: 'textarea', required: true, placeholder: 'A booking app for independent hair salons' },
      { key: 'budget', label: 'Budget', type: 'chips', options: ['Under €1k', '€1k to 5k', '€5k to 20k', '€20k+', 'Not sure'], default: 'Not sure' },
      { key: 'timeline', label: 'Timeline', type: 'chips', options: ['2 weeks', '1 month', '3 months', 'Flexible'], default: 'Flexible' },
    ],
    example: { idea: 'A booking app for independent hair salons', budget: '€5k to 20k', timeline: '3 months' },
    build(values) {
      return `Turn this into a researched plan with scope, roadmap, risks and a realistic estimate: ${values.idea}. Budget: ${values.budget}. Timeline: ${values.timeline}.`;
    },
  },
  {
    id: 'competitors',
    group: 'plan',
    label: 'Competitors',
    hint: 'Positioning, pricing, channels, angles',
    fields: [
      { key: 'business', label: 'Your business', type: 'textarea', required: true, placeholder: 'An online store selling handmade candles' },
      { key: 'known', label: 'Competitors you know (optional)', type: 'text', placeholder: 'Names or websites, comma separated' },
      { key: 'focus', label: 'Compare', type: 'multi', options: ['Positioning', 'Pricing', 'Channels', 'Ad angles'], default: ['Positioning', 'Pricing', 'Channels', 'Ad angles'] },
    ],
    example: { business: 'An online store selling handmade candles', known: '', focus: ['Positioning', 'Pricing'] },
    build(values) {
      const focus = (values.focus && values.focus.length ? values.focus : ['positioning', 'pricing', 'channels', 'ad angles']).map((item) => String(item).toLowerCase()).join(', ');
      const known = values.known ? ` Start with these: ${values.known}.` : '';
      return `Research 3 to 5 competitors for this and compare ${focus}: ${values.business}.${known}`;
    },
  },
  {
    id: 'brand',
    group: 'words',
    label: 'Brand kit',
    hint: 'Names, voice, palette, fonts, logos',
    fields: [
      { key: 'business', label: 'What is the business?', type: 'textarea', required: true, placeholder: 'A small-batch coffee roaster for neighbourhood cafés' },
      { key: 'vibe', label: 'Vibe in a few words (optional)', type: 'text', placeholder: 'warm, crafted, unpretentious' },
      { key: 'logos', label: 'Logo concepts', type: 'chips', options: ['None', '2 concepts'], default: 'None' },
    ],
    example: { business: 'A small-batch coffee roaster for neighbourhood cafés', vibe: 'warm, crafted, unpretentious', logos: '2 concepts' },
    build(values) {
      const vibe = values.vibe ? ` Vibe: ${values.vibe}.` : '';
      const logos = values.logos === '2 concepts' ? ' Also create 2 different logo concept images with generate_image, in one step, passing batch true.' : '';
      return `Draft a brand starter kit for this: name and tagline options, voice and tone, a palette with hex colours and a font pairing: ${values.business}.${vibe}${logos}`;
    },
  },
];

const { REFERENCE_FIELD, normalizeUrl, makeStudio } = require('./studio-core');
const { FORMATS: FORMAT_TREES, EXTRA_COPY_KINDS } = require('./create-formats');

// "Start from a format" trees for the three asset tools; leadKey is the field the lead-in goes in.
const LEAD_KEYS = { image: 'subject', video: 'topic', copy: 'about' };
for (const tool of TOOLS) {
  if (!FORMAT_TREES[tool.id]) continue;
  tool.formats = FORMAT_TREES[tool.id];
  tool.leadKey = LEAD_KEYS[tool.id];
  if (tool.id === 'copy') {
    const kind = tool.fields.find((field) => field.key === 'kind');
    kind.options = [...kind.options, ...EXTRA_COPY_KINDS];
  }
}

const studio = makeStudio(TOOLS);

module.exports = {
  TOOLS,
  GROUPS,
  STYLES,
  TONES,
  FORMATS,
  REFERENCE_FIELD,
  getTool: studio.getTool,
  defaultValues: studio.defaultValues,
  compile: studio.compile,
  normalizeUrl,
};
