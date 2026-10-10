import { LandingNav } from '@/components/landing/landing-nav';
import { SiteFooter } from '@/components/site-footer';
import { HeroDiagram, PaceDiagram, TradeDiagram } from '@/components/overview/diagrams';

type Block = string | { visual: 'idea' | 'trade' | 'pace' };

const VISUALS = { idea: HeroDiagram, trade: TradeDiagram, pace: PaceDiagram } as const;

export const metadata = {
  title: 'Blog — BrandForge',
  description:
    'Product updates, shipping notes, and essays from the BrandForge team — what we built, why, and what is next.',
};

// Real shipping entries, dated to when they actually went live. New posts go on top.
const POSTS: { date: string; title: string; body: Block[] }[] = [
  {
    date: '2026-10-10',
    title: 'AI and people, one workspace',
    body: [
      'ChatGPT is AI. BrandForge is AI and people. You say what you want, AI drafts it in seconds, and then you, your team or the BrandForge team finish it on the same page.',
      { visual: 'idea' },
      'That one idea covers more than a single tool. You can make many kinds of messages and publish them: carousels, updates, polls, quizzes and threads today, with video, reels, newsletters and more on the way. And you can trade. Post a product, a service or a request, talk it through in a private chat, and sign a milestone contract so money moves as each piece lands.',
      { visual: 'trade' },
      'Why build it this way? Using the internet without AI is becoming a disadvantage. The tools exist, but nobody has time to learn ten of them. BrandForge puts the newest internet technology behind one chat, and keeps people in the loop so what comes out is something you would put your name on.',
      { visual: 'pace' },
      'BrandForge is not a carousel maker. Carousels are one format among many, next to Trade, contracts and the BrandForge team. We rewrote the overview, features, about page, FAQ and every diagram to say that plainly. If a page still sounds smaller than this, tell us in Discord or Telegram.',
    ],
  },
  {
    date: '2026-10-09',
    title: 'Covers painted from your topic, and connections that look connected',
    body: [
      'The carousel maker now takes just your words, and starts fresh every time you open it. Your brand, closing line and look stay; the old topic does not.',
      'Every cover is a picture made from what the post is about, in five styles: photo, cinematic, 3D render, surreal, or the drawn art we had before. Tap New cover art for another take. Pictures are made by an AI model and are not photos of real events.',
      'Connections moved into Settings and got a proper face. Telegram, Discord and Bluesky light up in their own colour when linked and sit dashed and grey when not, and Distribute lets you tick where a carousel goes. The admin funnel can now be read for the last 24 hours, 7 days or 30 days, and the Trade Center and overview were redrawn.',
    ],
  },
  {
    date: '2026-10-09',
    title: 'Make a swipeable carousel in a minute',
    body: [
      'Create is now one thing, done well: the carousel maker. Give it a sentence, a web page or a text file and it writes a hook cover, numbered slides with three points each and a closing slide. It only uses facts from what you gave it, and it never invents numbers. Writing and previewing are free. Sign in, free, to edit every word, add your own pictures and download the slides.',
      'The brand is yours. Slides start with the BrandForge name and closing line, and you can swap in your own name, handle, logo, colour and closing line, or clear them for none. There are eight looks, including a light one.',
      'Distribute shows your carousel the way each platform will: Instagram, TikTok, LinkedIn, X and Facebook, with a caption written for each. You can post straight to a Telegram channel, a Discord channel or Bluesky today. Instagram, TikTok, LinkedIn and X need each platform to approve us first, so for those you download the slides and post from the app.',
      'The same tool is in the bots. Tap Make a carousel in @brandforge_bot, or use /brandforge in Discord, say what it is about, and the slides arrive in the chat. Videos are in development.',
    ],
  },
  {
    date: '2026-10-08',
    title: 'brandforge.gg now opens in a chat',
    body: [
      'Open brandforge.gg and you are already in a chat. No sign-up: type an idea, paste a URL or drop a file and the first answer comes back before we ask you for anything. The old landing page now lives at /overview, built from screenshots of the real product.',
      'Create and Distribute start from formats. Pick a direction, a track and a format (logo, favicon, T-shirt, poster, TikTok, Reel, ad angles, investor update) and the form fills itself in. Images and video stay free. There are three looks to choose from in Settings: Forge (fire orange), Crystal (crystal blue) and plain black and white.',
      'People can work on the same page. Any two members in a chat can sign a milestone contract: the payer funds it, the other person submits each milestone with a link to the work, and the payer has 48 hours to approve it or raise an issue before it releases. BrandForge keeps a flat 5% of each released milestone, shown before anyone signs. The Trade Center lets anyone post a request for work; offering services is for specialists who applied and were accepted, and applying needs no account.',
      'You can also use BrandForge from Telegram. Message @brandforge_bot with your idea, or use /plan, /audit, /ads, /calendar, /image and /video, and it answers right in the chat. One tap opens the same conversation on the web, where your team can join.',
      'One more thing we changed: the live feed in Discord and Telegram now carries only activity from real members. Staff accounts and test accounts never appear in it, and the daily line of numbers is only posted on days when something really happened.',
    ],
  },
  {
    date: '2026-10-03',
    title: 'The landing page finally proves it',
    body: [
      'The landing now backs its claims with real work: ten shipped projects with working links, and a feedback section copied verbatim from our Discord and Telegram — nothing edited. The community cards wear Discord and Telegram colors, the Discord card counts members live, and the top strip points straight at @headstartup for hiring and projects.',
      'The outbound queue got its publisher too. Queued posts now really go out — one button in the admin dashboard, kill switches per channel, and a discard for drafts you no longer want. The campaign tracker is seeded with our 53 launch and directory targets, and the admin home is grouped the way we think about the company: Product (the build) and Distribution (the advertising).',
      'For newcomers this week: light is the default look, you can sign in with Google or an email link, every fresh signup walks a short setup before the first chat, and every email we send now ends with our links and a one-click unsubscribe.',
    ],
  },
  {
    date: '2026-09-29',
    title: 'Webhooks, a public changelog, and weekly digests',
    body: [
      'This week the platform got an ops layer: GitHub releases and labeled merges now post to our Discord dev-log, and four growth-safe events — brief posted, match made, escrow funded, milestone shipped — can go out to a public feed. Rejections, counters, and amounts never leave staff channels.',
      'We also shipped a weekly digest command (real numbers, honest quiet-week line), actionable notifications with deep links on every Telegram ping, and real buttons in Discord via the bot. Plus slash-command autocomplete in the composer, a landing FAQ, and a light-mode pass across the app.',
    ],
  },
  {
    date: '2026-09-28',
    title: 'Contracts you can sign in the chat',
    body: [
      'Contract signing is live end to end: both sides edit and accept terms right on the chat card, signatures carry badges, and the founder is told on Telegram and email the moment any stage moves — proposal ready, contract signed, funding verified, work delivered, payment released.',
      'The operator pipeline closed the same week: briefs reach the team on Discord and personal Telegram, proposal answers ping their author, accepting a proposal auto-invites its author into the chat, and specialists can send proposals from a composer that was, until then, read-only. Negotiation supports one counter from each side before the deal closes.',
    ],
  },
  {
    date: '2026-09-26',
    title: 'Workspace UX 2.0',
    body: [
      'The chat became a workspace: a conversation-centric three-pane layout where AI answers render as editorial content instead of chat bubbles, each turn carries a collapsible Thoughts strip built only from steps that really ran, and attached files are actually read under a token budget.',
      'We also stopped the transcript from hijacking your scroll — streaming only follows you to the bottom if you are already there, and a Jump to latest pill appears when you are reading history. Failed sends keep your text and offer a Try again button.',
    ],
  },
];

const ESSAY = {
  date: '2026-09-25',
  title: 'Why BrandForge is chat-first',
  body: [
    'Email threads lose context. Project management tools are overkill for getting started. A chat is where ideas are born — so we built the entire project lifecycle inside one.',
    'Your first message creates the project. The AI turns it into requirements you can correct in the same conversation. A specialist joins with a priced proposal, both sides sign, funding sits in escrow, and delivery is approved from the same place the idea started. Nothing is charged before you approve a proposal, and your money releases only when you approve the work.',
  ],
};

export default function BlogPage() {
  return (
    <div className="bf-page">
      <LandingNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="mt-2 font-serif text-4xl text-foreground sm:text-5xl">
          What we shipped, and why
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">
          Shipping notes from the BrandForge team — product updates and the occasional
          essay. No vaporware: everything here is live on brandforge.gg.
        </p>

        <div className="mt-12 space-y-10">
          {[...POSTS, ESSAY].map((post) => (
            <article key={post.title} className="border-t border-line pt-8">
              <p className="text-xs text-muted">
                <time dateTime={post.date}>
                  {new Date(`${post.date}T00:00:00Z`).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}
                </time>
              </p>
              <h2 className="mt-2 font-serif text-2xl text-foreground sm:text-3xl">
                {post.title}
              </h2>
              {post.body.map((block, index) => {
                if (typeof block !== 'string') {
                  const Visual = VISUALS[block.visual];
                  return (
                    <div key={`visual-${index}`} className="mt-6">
                      <Visual />
                    </div>
                  );
                }
                return (
                  <p key={block.slice(0, 40)} className="mt-4 leading-relaxed text-muted">
                    {block}
                  </p>
                );
              })}
            </article>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
