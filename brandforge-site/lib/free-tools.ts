// Public, indexable free tools. Each one is a landing page whose single job is to turn a URL
// into a real guest chat with the work already requested (value first, signup second).
export type FreeTool = {
  slug: string;
  name: string;
  title: string;
  description: string;
  cta: string;
  placeholder: string;
  // {url} is replaced with what the visitor typed.
  prompt: string;
  steps: [string, string, string];
};

export const FREE_TOOLS: FreeTool[] = [
  {
    slug: 'website-audit',
    name: 'Website audit',
    title: 'Free website audit: what to fix first',
    description:
      'Paste a URL and get a prioritised audit of your messaging, SEO, conversion and trust gaps. No account needed.',
    cta: 'Audit my site',
    placeholder: 'https://yourwebsite.com',
    prompt:
      'Audit this website: {url}. Read the page first, then give a prioritised fix list covering messaging, SEO, conversion and trust. Cite what you read. Put the three highest-impact fixes first with the exact change to make.',
    steps: ['Paste your URL', 'We read the page', 'Get a ranked fix list'],
  },
  {
    slug: 'ad-pack',
    name: 'Ad pack from a URL',
    title: 'Free ad pack from your URL',
    description:
      'Paste your site and get ready-to-run ads for Meta, Google, TikTok and LinkedIn, plus a short video script. No account needed.',
    cta: 'Make my ads',
    placeholder: 'https://yourstore.com',
    prompt:
      'Read {url} and build a ready-to-run ad pack: for each of Meta, Google, TikTok and LinkedIn give 3 hooks, 3 headlines and 2 primary texts, then a 20-second video script with a shot list. Use only claims that appear on the page; use [brackets] for anything I need to confirm.',
    steps: ['Paste your URL', 'We read the offer', 'Get ads and a script'],
  },
];

export function getFreeTool(slug: string): FreeTool | undefined {
  return FREE_TOOLS.find((tool) => tool.slug === slug);
}
