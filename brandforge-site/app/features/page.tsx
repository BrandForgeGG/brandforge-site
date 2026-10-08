import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';

export const metadata = {
  title: 'Features — BrandForge',
  description:
    'Research, plans, images, ads and video in one chat. Teams, a Trade Center for specialists, and milestone contracts between members.',
};

const FEATURES = [
  {
    title: 'A chat that does the work',
    body: 'Describe an idea, paste a URL or drop a file. The first answer is a researched plan, a fix list or a draft, not a question. Anything it cites, it read.',
  },
  {
    title: 'Create from a format',
    body: 'Pick a direction, a track and a format (logo, favicon, T-shirt, poster, TikTok, Reel, ad angles, investor update) and the form fills itself in. Images and video are free.',
  },
  {
    title: 'Distribute from your URL',
    body: 'Ad copy per platform, a 30-day content calendar you can copy into a spreadsheet, a launch plan and an outreach sequence. Each opens in a chat you can keep refining.',
  },
  {
    title: 'Bring your team',
    body: 'Invite anyone into a chat with a link. Everyone sees the same plan, the same files and the same history, with the AI on your side or paused.',
  },
  {
    title: 'Contracts between members',
    body: 'Two people in a chat can sign a milestone contract. The payer funds it, the other person submits each milestone with a link to the work, and the payer has 48 hours to approve or raise an issue. A flat 5% when a milestone is paid.',
  },
  {
    title: 'A Trade Center for specialists',
    body: 'Anyone can post a request for work. Offering services is for specialists who applied and were accepted, so the people you hire have been looked at. Applying needs no account.',
  },
  {
    title: 'Projects built by specialists',
    body: 'For bigger builds, a vetted specialist joins your chat with a priced proposal. Both sides sign, funding is verified on-chain, and money releases milestone by milestone as you approve the work.',
  },
  {
    title: 'Updates where you already are',
    body: 'Link Telegram in Settings and get a ping when something needs you. Email covers every contract step, and the public feed in Discord and Telegram shows only real activity.',
  },
  {
    title: 'Three looks',
    body: 'Forge is fire orange, Crystal is crystal blue, and black and white is plain and quiet. Switch any time in Settings; your choice is remembered.',
  },
];

export default function FeaturesPage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="font-serif text-4xl tracking-[-0.02em] text-foreground sm:text-5xl" style={{ textWrap: 'balance' }}>
          One chat, from idea to done
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          AI drafts it in seconds. Your team and vetted specialists take it from there, on the same page.
        </p>

        <dl className="mt-12 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="border-t border-line pt-5">
              <dt className="font-serif text-xl text-foreground">{feature.title}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</dd>
            </div>
          ))}
        </dl>
      </main>
      <SiteFooter />
    </div>
  );
}
