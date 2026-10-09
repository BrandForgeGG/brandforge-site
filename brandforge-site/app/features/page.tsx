import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { HeroDiagram } from '@/components/overview/diagrams';

export const metadata = {
  title: 'Features — BrandForge',
  description:
    "A carousel maker, plans, ads and audits in one chat. Teams, a Trade Center for specialists, and milestone contracts between members. Free to start.",
};

const FEATURES = [
  {
    title: 'A chat that does the work',
    body: 'Describe an idea, paste a URL or drop a file. The first answer is a researched plan, a fix list or a draft, not a question. Anything it cites, it read.',
  },
  {
    title: 'Make a carousel in a minute',
    body: 'Give it a sentence and get a hook cover with a cover picture painted from your topic, in five styles, numbered slides with three points each and a closing slide, in a look you pick. Writing and previewing are free; sign in to edit every word, add your pictures and download. Your brand and closing line are yours to set.',
  },
  {
    title: 'See it on each platform, then post',
    body: 'Distribute shows your carousel as a post on Instagram, TikTok, LinkedIn, X and Facebook, writes a caption for each, and posts straight to your Telegram channel, Discord channel or Bluesky. More platforms follow as each one approves us.',
  },
  {
    title: 'In Telegram and Discord too',
    body: 'Open @brandforge_bot or type /brandforge, tap Make a carousel, say what it is about, and the slides arrive in the chat.',
  },
  {
    title: 'Ads, calendars and launch plans in chat',
    body: 'Ask in the chat for ad copy per platform, a 30-day content calendar, a launch plan or an outreach sequence, from your URL or a sentence. Keep refining it in the same chat.',
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
    title: 'Three looks for the app, eight for your slides',
    body: 'The app comes in Forge (fire orange), Crystal (blue) and black and white; switch any time in Settings. Carousels have eight looks, from Forge and Crystal to Violet, Emerald, Rose, Sunrise and a light Paper look, each in your own accent colour if you like.',
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

        <div className="mt-10">
          <HeroDiagram />
        </div>

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
