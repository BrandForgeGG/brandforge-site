import { ToolLauncher } from '@/components/tool-launcher';

export const metadata = { title: 'Distribute — BrandForge' };

const OPTIONS = [
  { id: 'calendar', label: '30-day content calendar', hint: 'Posts per platform, export to any scheduler', starter: 'Build a 30-day content calendar for this with captions and hashtags per platform, as a table I can export to CSV.' },
  { id: 'launch', label: 'Launch plan', hint: 'Channels, checklist, draft posts', starter: 'Make a channel-by-channel launch plan for this with a checklist and draft posts.' },
  { id: 'outreach', label: 'Outreach sequence', hint: 'Emails and DMs', starter: 'Write a 3–5 message outreach sequence and a short DM/pitch set for this audience.' },
  { id: 'ads', label: 'Ready-to-run ads', hint: 'Meta, Google, TikTok, LinkedIn', starter: 'Produce ready-to-run ads for this across Meta, Google, TikTok and LinkedIn, with targeting suggestions.' },
];

export default function DistributePage() {
  return (
    <ToolLauncher
      title="Distribute"
      subtitle="Turn what you created into posts, ads and outreach for every channel. Copy out to Buffer or your scheduler today; direct publishing arrives with Connect."
      placeholder="What are we distributing, and to whom?"
      options={OPTIONS}
    />
  );
}
