import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/components/legal-page';

export const metadata: Metadata = {
  title: 'Privacy Policy — BrandForge',
  description:
    'What data BrandForge collects, how it is used, and how to delete it.',
};

const SECTIONS: LegalSection[] = [
  {
    title: '1. What we collect',
    body: [
      'Account data: when you sign in with Google we receive your name, email address and profile picture from Google. We do not see or store your Google password.',
      'Project data: your chat messages, project briefs, proposals, agreements and uploaded context. This is the core of the service — the AI and the human team use it to scope and deliver your project.',
      'Payment data: the crypto transaction hash and network you submit when funding an agreement. Transaction hashes are public on-chain data; we store them to link your payment to your agreement.',
      'Usage data: standard server logs (IP address, browser, pages visited) kept for security and debugging.',
    ],
  },
  {
    title: '2. How we use it',
    body: [
      'To run the service: structuring your brief, staffing your project, verifying funding, delivering milestones and supporting you in the chat.',
      'To keep the platform safe: abuse prevention, fraud checks on funding transactions, and enforcing the Terms of Service.',
      'We do not sell your data, and we do not show you ads.',
    ],
  },
  {
    title: '3. Who processes it',
    body: [
      'Supabase hosts our database, authentication and file storage.',
      'OpenRouter processes chat content through AI models to structure projects and assist the team. Do not paste secrets, passwords or highly sensitive personal data into the chat.',
      'Google provides sign-in. Vercel hosts the application and serves pages.',
      'BrandForge staff and the operators assigned to your project can read your project conversations — that is how the human-in-the-loop service works.',
    ],
  },
  {
    title: '4. Cookies',
    body: [
      'We use cookies only to keep you signed in (Supabase session cookies). There are no advertising or cross-site tracking cookies.',
    ],
  },
  {
    title: '5. Retention and deletion',
    body: [
      'You can delete individual conversations from the app. To delete your account and remaining data, message the project manager on Telegram (@headstartup) or ask in Discord; we will remove your profile and projects within 30 days, except records we must keep for accounting or fraud-prevention reasons (for example, payment verification records tied to completed agreements).',
    ],
  },
  {
    title: '6. Security and transfers',
    body: [
      'Data is encrypted in transit and access is limited to staff who need it. Our processors may store data outside your country; by using BrandForge you consent to those transfers. No system is perfectly secure — if we ever suffer a breach that affects you, we will tell you.',
    ],
  },
  {
    title: '7. Changes and contact',
    body: [
      'We will post material changes to this policy in Discord and Telegram before they take effect. Questions or deletion requests: Telegram (@headstartup) or Discord — links are on the homepage.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="September 23, 2026"
      intro="BrandForge is built around conversations, so this policy explains plainly what those conversations contain, who can see them, and how to make them go away."
      sections={SECTIONS}
    />
  );
}
