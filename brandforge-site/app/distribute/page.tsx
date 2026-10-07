import { ToolLauncher } from '@/components/tool-launcher';

export const metadata = { title: 'Distribute — BrandForge' };

const OPTIONS = [
  {
    id: 'adpack',
    label: 'Ad pack from a URL',
    hint: 'Ads for Meta, Google, TikTok, LinkedIn',
    url: true,
    prompt:
      'Read {url} and build a ready-to-run ad pack: for each of Meta, Google, TikTok and LinkedIn give 3 hooks, 3 headlines and 2 primary texts, then a 20-second video script with a shot list. Use only claims that appear on the page; use [brackets] for anything I need to confirm.',
  },
  {
    id: 'calendar',
    label: '30-day content calendar',
    hint: 'Posts per platform, export to any scheduler',
    prompt: 'Build a 30-day content calendar with captions and hashtags per platform, as a table I can export to CSV: {detail}',
  },
  {
    id: 'launch',
    label: 'Launch plan',
    hint: 'Channels, checklist, draft posts',
    prompt: 'Make a channel-by-channel launch plan with a checklist and draft posts: {detail}',
  },
  {
    id: 'outreach',
    label: 'Outreach sequence',
    hint: 'Emails and DMs',
    prompt: 'Write a 3 to 5 message outreach sequence and a short DM or pitch set for this audience: {detail}',
  },
];

export default function DistributePage() {
  return (
    <ToolLauncher
      title="Distribute"
      subtitle="Posts, ads and outreach for every channel."
      placeholder="What are we distributing, and to whom?"
      options={OPTIONS}
    />
  );
}
