# Platform approvals kit (2026-10-09)

Posting for a user on Instagram, Facebook, Threads, TikTok, LinkedIn, YouTube, Pinterest and Google
Business needs each platform to approve our app. Every application needs the founder's own developer
account and identity, so these cannot be filed by an assistant. Everything else is prepared below so each
one is a paste-and-submit job. Portals change their wording often: check each requirement on the day.

Status: **none submitted yet.** Update the table as you go.

| Platform | Where | Needs approval to | Status |
| --- | --- | --- | --- |
| Meta (Instagram, Facebook Pages, Threads) | developers.facebook.com | App Review + Business Verification | not started |
| TikTok | developers.tiktok.com | Content Posting API audit | not started |
| LinkedIn | linkedin.com/developers | Share on LinkedIn (self-serve) and Community Management API (apply) | not started |
| YouTube | console.cloud.google.com | YouTube Data API audit (uploads stay private until it passes) | not started |
| Pinterest | developers.pinterest.com | Trial to Standard access | not started |
| Google Business Profile | Google Business Profile API access form | Access request | not started |
| X | developer.x.com | Paid tiers for real volume | decide later |

## What we already have ready

- Privacy policy: https://brandforge.gg/privacy
- Terms: https://brandforge.gg/terms
- Data deletion instructions: https://brandforge.gg/data-deletion (added today)
- Our own domain with HTTPS, a support contact in Telegram and Discord, tokens stored encrypted, a
  Disconnect button that deletes the token.
- A working product to show: make a carousel, preview it, post it to connected channels.

## What you need to prepare once (founder)

1. A **business** identity: legal name, address, website brandforge.gg, a business email on the domain.
   Meta and TikTok may ask for **business verification** (documents such as registration or utility bill).
2. An **app icon** (1024x1024 PNG) and the BrandForge logo.
3. A **screen recording** per platform (script below). 1 to 3 minutes, no voice needed, captions are fine.
4. A **test account** with a connected test Instagram/TikTok/LinkedIn the reviewer can use. Give them a
   BrandForge login (a throwaway sign-in link) in the submission notes.
5. Domain verification (adding a meta tag or a file to brandforge.gg) when the platform asks. Tell me the
   tag and I will add it.

## The description to paste (all platforms)

> BrandForge helps founders, small businesses and creators turn an idea into a swipeable carousel post
> and publish it. The person writes one sentence, reviews and edits the slides, then chooses to connect
> their own account and presses Post. We publish only what the person has just reviewed, only to the
> accounts they connected, and only when they press the button (or schedule it). We do not read their
> followers, messages or feed, we do not sell or share data, and we do not post anything on our own.
> People can disconnect at any time in Settings, which deletes our stored token, or revoke access on the
> platform. Data deletion: https://brandforge.gg/data-deletion

## Permissions, and why we need exactly these

| Platform | Permission or product | Why |
| --- | --- | --- |
| Instagram | instagram_business_basic, instagram_business_content_publish | Show which account is connected and publish the carousel (up to 10 images) the person approved. |
| Facebook Pages | pages_show_list, pages_manage_posts, pages_read_engagement | Let the person pick one of their Pages and publish a multi-photo post to it. |
| Threads | threads_basic, threads_content_publish | Publish the carousel or text post the person approved to their Threads profile. |
| TikTok | Login Kit (user.info.basic), Content Posting API (video.publish, photo posting) | Let the person log in and publish a photo carousel to their own account. |
| LinkedIn | w_member_social (Share on LinkedIn); Community Management API for company pages | Publish a document or image post the person approved to their profile or Page. |
| YouTube | youtube.upload | Upload the video the person approved (later; only needed once video is live). |
| Pinterest | boards:read, pins:write | Pin the image the person approved to a board they pick. |
| Google Business | Business Profile API (posts) | Publish a post the person approved to their own listing. |

Ask only for what is in this table. Reviewers reject apps that request more than the demo shows.

## Screen recording script (use for every platform, swap the platform name)

1. Open brandforge.gg/create. Type one sentence. Press Make my carousel. Show the slides and the cover.
2. Sign in. Open Settings, Integrations. Press Connect on the platform. Show the platform's own consent
   screen listing the permissions, and approve it. Show the connected card with the account name.
3. Open the Publish step under the carousel. Show the caption. Choose the connected account. Press Publish (unlock it for the review account).
4. Show the post appearing on the platform.
5. Back in Settings press Disconnect and show the card go grey. Say or caption: "this deletes our token".

## Platform notes

**Meta (Instagram, Facebook, Threads).** One app can hold all three. The Instagram account must be a
Business or Creator account linked to a Facebook Page. Standard access works for accounts that have a role
on the app (you and testers) immediately, so the demo can be recorded before review finishes. Submit App
Review with the recording, then Business Verification. Typical wait: days to a few weeks.

**TikTok.** Register the app, add Login Kit and the Content Posting API, verify the domain, submit the
audit with the recording. Until the audit passes, posts are forced to private (visible only to the user),
so it is usable for testing but not for real publishing.

**LinkedIn.** "Share on LinkedIn" is self-serve and covers posting to a person's own profile within a day
or so. Posting to company Pages needs the Community Management API application and a verified company page.

**YouTube.** Create a Google Cloud project, enable YouTube Data API v3, set up the OAuth consent screen and
verify the app. Videos uploaded by an unaudited project are locked private; request the compliance audit
when video is live. Not needed until then.

**Pinterest.** Trial access is instant for testing; apply for Standard access with the recording.

**Google Business Profile.** The API is access-gated: fill the Business Profile API access form with a
verified business that has been active for some time. Lowest priority.

## Order to apply

1. Meta (covers three platforms and the largest audience) and LinkedIn Share (fast win), same day.
2. TikTok.
3. Pinterest.
4. YouTube and Google Business only when video or local listings are on the roadmap.

When each is approved, tell me and I will build the connection screen and posting for it.
