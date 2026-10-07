import { ToolLauncher } from '@/components/tool-launcher';

export const metadata = { title: 'Create — BrandForge' };

const OPTIONS = [
  { id: 'blueprint', label: 'Project blueprint', hint: 'Idea → researched scope, roadmap, estimate', starter: 'Turn this into a researched blueprint: scope, roadmap, risks and a realistic estimate.' },
  { id: 'audit', label: 'URL audit', hint: 'Messaging, SEO, conversion gaps', starter: 'Audit this website: messaging, SEO, conversion and trust gaps, with a prioritised fix list.' },
  { id: 'adpack', label: 'Ad pack', hint: 'Hooks, copy and a video script', starter: 'Build an ad pack for this: hooks, headlines, primary text per platform, and a 15–30s video script with shot list.' },
  { id: 'competitors', label: 'Competitor snapshot', hint: 'Positioning, pricing, angles', starter: 'Research 3–5 competitors for this and summarise positioning, pricing, ad angles and channels.' },
  { id: 'brand', label: 'Brand kit', hint: 'Names, voice, palette, fonts', starter: 'Draft a brand starter kit: name and tagline options, voice and tone, palette and font pairing.' },
  { id: 'content', label: 'Content & copy', hint: 'Posts, emails, landing copy', starter: 'Write content for this: social posts, an email sequence and landing page copy.' },
];

export default function CreatePage() {
  return (
    <ToolLauncher
      title="Create"
      subtitle="Words, URLs and files into plans, research, copy and creative. Everything opens in a chat your team can join."
      placeholder="Describe it, paste a URL, or add notes…"
      options={OPTIONS}
    />
  );
}
