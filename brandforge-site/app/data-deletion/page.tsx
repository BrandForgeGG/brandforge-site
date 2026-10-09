import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Delete your data — BrandForge',
  description: 'How to disconnect a social account from BrandForge and delete the data we hold.',
};

const SECTIONS: LegalSection[] = [
  {
    title: '1. Disconnect an account yourself',
    body: [
      'Sign in, open Settings, then Integrations. Press Disconnect next to any connected channel. The saved login or access token for that channel is deleted from our database straight away, and we can no longer post to it.',
      'You can also revoke BrandForge from the platform itself (for example Instagram, Facebook, TikTok, LinkedIn or Bluesky app settings). That cuts our access immediately, whether or not you use the button above.',
    ],
  },
  {
    title: '2. What we keep about a connected account',
    body: [
      'Only what is needed to post for you: the channel name you see in Settings and an encrypted access token or app password. We do not copy your followers, messages or past posts.',
      'Carousels you chose to save stay in your account until you delete them. Slides you post are sent to the platform and not kept by us.',
    ],
  },
  {
    title: '3. Delete your account and everything we hold',
    body: [
      'Message the project manager on Telegram (@headstartup) or ask in our Discord from the account you signed up with. We remove your profile, saved carousels and connected channels within 30 days.',
      'We keep only records we must keep, such as payment verification records tied to completed agreements. The full policy is on the privacy page.',
    ],
  },
];

export default function DataDeletionPage() {
  return <LegalPage title="Delete your data" updated="October 9, 2026" intro="You stay in control of every account you connect. Here is how to disconnect one or delete everything." sections={SECTIONS} />;
}
