import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { HeroDiagram } from '@/components/overview/diagrams';

export const metadata = {
  title: 'Features — BrandForge',
  description:
    "Make and publish every kind of message, trade products, services and requests, and get a person to finish the job. AI and people on the same page. Free to start.",
};

const FEATURES = [
  {
    title: 'A chat that does the work',
    body: 'Describe an idea, paste a URL or drop a file. The first answer is a researched plan, a fix list or a draft, not a question. Anything it cites, it read.',
  },
  {
    title: 'Make any kind of message',
    body: 'Carousels, updates, polls, quizzes and threads today; video, reels, newsletters and more are coming. Say it in a sentence, edit every word, download it, and get a caption written for each platform.',
  },
  {
    title: 'Publish where people are',
    body: 'Pick the platforms for a post. Telegram, Discord and Bluesky are connected; Instagram, LinkedIn, TikTok and others open as each platform approves us.',
  },
  {
    title: 'Trade products, services and requests',
    body: 'Post what you offer or need. Message each other in a private chat, agree the details and sign. Offering services is for specialists who applied and were accepted; anyone can post a request.',
  },
  {
    title: 'Contracts between members',
    body: 'Two people in a chat can sign a milestone contract. The payer funds it, the other person submits each milestone with a link to the work, and the payer has 48 hours to approve or raise an issue. A flat 5% when a milestone is paid.',
  },
  {
    title: 'Bring your team',
    body: 'Invite anyone into a chat with a link. Everyone sees the same plan, the same files and the same history, with the AI on your side or paused.',
  },
  {
    title: 'Specialists for bigger jobs',
    body: 'A vetted specialist joins your chat with a priced proposal. Both sides sign, funding is verified on-chain, and money releases milestone by milestone as you approve the work.',
  },
  {
    title: 'Ads, calendars and launch plans',
    body: 'Ask in the chat for ad copy per platform, a 30-day content calendar, a launch plan or an outreach sequence, from your URL or a sentence. Keep refining it in the same chat.',
  },
  {
    title: 'In Telegram and Discord too',
    body: 'Open @brandforge_bot or type /brandforge, say what you want, and the result arrives in the chat. One tap opens the same conversation on the web.',
  },
  {
    title: 'Updates where you already are',
    body: 'Link Telegram in Settings and get a ping when something needs you. Email covers every contract step, and the public feed in Discord and Telegram shows only real activity.',
  },
];

export default function FeaturesPage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="font-serif text-4xl tracking-[-0.02em] text-foreground sm:text-5xl" style={{ textWrap: 'balance' }}>
          AI and people, on the same page
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Make it, publish it, trade it. AI drafts in seconds; you, your team and vetted specialists finish the job.
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
