# Carousel maker and distribution: roadmap

Written 2026-10-09. Status words are honest: **live**, **next**, **later**. Items marked "needs approval" cannot ship
until the platform approves our app, which we do not control.

## What is live today

- Write a carousel free from a sentence, a web page or a text file (`/create`). Seven post types: top list,
  educational, news and trends (searches the web first), promotional, funny, story, why/how/what/who.
- Preview every slide free. **Editing and downloading need a free account**; the draft survives the sign-in.
- Brand name, handle, logo, accent colour and closing line are the user's choice. Nothing of ours is on a slide.
- `/distribute`: the carousel as a post on Instagram, TikTok, LinkedIn, X and Facebook, a caption written for each
  platform (limits enforced), copy, ZIP download, a planned date, and saved carousels in the account.
- Not live: posting to the platforms, and reminders at the planned time.

## Phase 1: better slides (about 2 weeks)

1. **Layout per post type.** Same renderer, different slide shapes: step with big number (educational), quote card
   (story, funny), stat callout (only when the source has the number), comparison two-column, checklist, news slide
   with source name and date, myth vs fact, FAQ. A layout picker per slide.
2. **Slide editing.** Reorder, duplicate, delete, add a slide, undo, autosave with a "saved" indicator.
3. **Brand kit.** Save name, handle, colour, logo and closing line once; reuse on every carousel (stored per account).
4. **Pictures.** Free stock search (Unsplash and Pexels have free APIs; keys needed), screenshot of a URL via a
   serverless browser service, AI images through Cloudflare Workers AI or Hugging Face free tiers (keys needed),
   paste-from-clipboard.
5. **Sizes.** 4:5 (now), 1:1, 9:16 for TikTok and Reels, and a LinkedIn document PDF export.
6. **Fonts.** Three font pairs; right-to-left and non-Latin scripts (add the matching open font files).

## Phase 2: smarter writing (about 2 weeks)

1. **Hook library.** "N mistakes", "stop doing X", myth vs fact, hot take, how-to in N steps, before and after. Offer
   three hook options and let the person pick.
2. **More post types.** Case study, checklist, comparison, announcement or launch, weekly roundup, tutorial, behind the
   scenes, FAQ, testimonial (only with text the person supplies).
3. **Trends.** "What is trending in my niche" from free sources (RSS, Hacker News, Reddit, Google Trends), shown as
   topic ideas with the source link. Facts always come from a fetched source, never from the model's memory.
4. **Citations.** News and trends slides carry a source line; the caption lists the links.
5. **More inputs.** YouTube transcript, PDF text (parsed server side), pasted blog post, a Telegram or Discord message.
6. **Quality checks.** Reading length, repeated words, claims with numbers not found in the source (flagged),
   alt text for every slide.
7. **Series.** Plan a week of posts across types in one go.

## Phase 3: distribution (the part that makes people stay)

Needs two foundations first.

- **A server-side renderer** so a carousel can be turned into images without the person's browser open. Use the same
  drawing code with `@napi-rs/canvas` and the same font files. Store the PNGs in Supabase Storage with the post.
- **A precise scheduler.** Vercel Hobby crons run once a day at best. Options: Supabase `pg_cron` calling a protected
  route every minute (free), Vercel Pro per-minute crons, or an external free pinger. Recommended: `pg_cron`.

Then connect channels in this order, easiest and fastest first:

| Order | Channel | How | Approval needed |
| --- | --- | --- | --- |
| 1 | Telegram channel / group | Bot token the user adds, bot as channel admin | No |
| 2 | Discord channel | Webhook URL the user pastes | No |
| 3 | Bluesky | App password, up to 4 images per post | No |
| 4 | Mastodon | OAuth against the user's server | No |
| 5 | LinkedIn | Posts API with multi-image or document | Needs approval (Community Management API) |
| 6 | Instagram (Business or Creator) | Graph API carousel publishing, up to 10 images | Needs approval (Meta app review) |
| 7 | Facebook Pages | Pages API | Needs approval (Meta app review) |
| 8 | TikTok | Content Posting API, photo posts | Needs approval (audit; unaudited apps post privately) |
| 9 | X | Media upload plus post | Paid API tiers for real volume |
| 10 | Pinterest, Threads | Their APIs | Needs approval |

Until a platform is approved, the Distribute page keeps its honest fallback: download, copy the caption, remind me.
**Reminders** (email or Telegram) at the planned time are the first thing to ship in this phase because they work
for every platform.

Also in this phase: a calendar view (week and month), best-time suggestions from the person's own results once
insights are connected, and a retry or failure notice on every post.

## Phase 4: learn from results (later)

- Pull each post's reach, saves, shares and clicks from platform insights where the API allows.
- Show which post type and hook style worked, and feed that back into the writer as a short note.
- Hook A/B: post two covers on different days and compare.

## Phase 5: teams and agencies (later)

- Share a review link; comments on slides; approve before it can be scheduled.
- Roles (owner, editor, viewer) and one brand kit per client for agencies.
- White-label export (the Agency plan already promises client views).

## Money

Free: write, preview, a limited number of saved carousels. Free account: edit, download, captions, plan.
Paid (the existing Pro and Agency plans): scheduling and direct posting, brand kits beyond one, team features, more
channels. Never put our name on a user's slides, even on the free plan.

## Order I would build

1. Reminders at the planned time (email and Telegram) and the calendar view.
2. Layout per post type, slide reorder, autosave, brand kit.
3. Server-side renderer plus `pg_cron` scheduler.
4. Telegram, Discord and Bluesky posting.
5. Start the Meta, LinkedIn and TikTok approval applications in parallel (they take weeks), then add those channels.
6. Trends and hook library.
