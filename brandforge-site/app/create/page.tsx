import { ToolLauncher } from '@/components/tool-launcher';

export const metadata = { title: 'Create — BrandForge' };

const OPTIONS = [
  {
    id: 'audit',
    label: 'Website audit',
    hint: 'A ranked fix list from your URL',
    url: true,
    prompt:
      'Audit this website: {url}. Read the page first, then give a prioritised fix list covering messaging, SEO, conversion and trust. Cite what you read. Put the three highest-impact fixes first with the exact change to make. You can only see the page title and visible text: do not state facts about meta tags, schema, speed, mobile layout or backlinks. List those under "Check these yourself" instead, and only quote customers or logos that appear on the page.',
  },
  {
    id: 'image',
    label: 'Image or logo concept',
    hint: 'Free AI image, saved in the chat',
    prompt: 'Create an image: {detail}',
  },
  {
    id: 'blueprint',
    label: 'Project plan',
    hint: 'Idea to scope, roadmap and estimate',
    prompt: 'Turn this into a researched plan with scope, roadmap, risks and a realistic estimate: {detail}',
  },
  {
    id: 'strategy',
    label: 'Strategy analysis',
    hint: 'SOAR, TOWS, PESTLE, Porter, gap analysis: the right one, filled in',
    prompt: 'Run a strategy analysis (choose the best framework for this and say why): {detail}',
  },
  {
    id: 'competitors',
    label: 'Competitor snapshot',
    hint: 'Positioning, pricing, angles',
    prompt: 'Research 3 to 5 competitors for this and summarise positioning, pricing, ad angles and channels: {detail}',
  },
  {
    id: 'brand',
    label: 'Brand kit',
    hint: 'Names, voice, palette, fonts',
    prompt: 'Draft a brand starter kit for this: name and tagline options, voice and tone, palette and font pairing: {detail}',
  },
  {
    id: 'content',
    label: 'Content and copy',
    hint: 'Posts, emails, landing copy',
    prompt: 'Write content for this: social posts, an email sequence and landing page copy: {detail}',
  },
];

export default function CreatePage() {
  return (
    <ToolLauncher
      title="Create"
      subtitle="Idea, URL or file in. Plan, copy or creative out."
      placeholder="Describe it, paste a URL, or add notes…"
      options={OPTIONS}
    />
  );
}
