# Overnight improvement log — 2026-09-29

> Autonomous session. Branch: `auto/overnight-improvements` (local only — NOT pushed,
> NOT deployed). All verification is local (tests, tsc, eslint, build). No prod writes,
> no messages to real users, no secrets touched.

## Summary for the user

_To be written at handoff._

## Cycles

### C0 — Audit (2026-09-29, ~02:00)
- Ran two parallel research audits (a11y/UX, dead-code/duplication/perf) + own SEO pass.
- Layout already has metadataBase, title/description, OG tags, og-image, favicons, Inter+Fraunces.
- Missing: robots, sitemap, twitter-card meta, theme-color, JSON-LD.
- Top a11y gaps: unlabeled inputs (composer, proposal form, invite, reject-note), MessageActions mouse-only, missing role=alert on auth/apply/admin/settings, rail account menu as div, no Escape on panel drawer, no reduced-motion handling, small touch targets.
- Top code findings: money()/clip() duplicated across 5+ files, sequential DB waterfalls in proposal routes, unmemoized progress, rail polls even when tab hidden, dead isEmailConfigured export, rail collapsed initials not using shared helper, img without lazy/dims.
- Plan: C1 SEO essentials → C2/C3 a11y batches → C4 perf micro-batch → C5 dead code → C6 landing copy.
- Deferred (needs human or daylight verification): money()/clip() unification (wide blast radius), next/dynamic code-splitting (needs visual check), public PNG deletion (assets may still need uploading), matching engine / dispute model (product decisions), digest cron.

### C1 — SEO essentials (done, ~02:15)
- Added `app/robots.ts` (product surfaces disallowed), `app/sitemap.ts` (7 public pages),
  twitter summary-large-image meta, `themeColor #111417`, Organization JSON-LD on landing.
- Verified: build emits `/robots.txt` + `/sitemap.xml`; 245/245 tests, tsc, eslint green.
- Commit: `seo: robots, sitemap, twitter card, theme color, org structured data`.

### C2 — Named controls + live-region feedback (done)
- aria-labels on composer, proposal title/approach, invite email, funding-reject reason,
  reply-dismiss; MessageActions reveal on focus with named reaction pills (both branches);
  role=alert/role=status on auth/apply/admin/settings banners. No visual change.
- Verified: 245/245 tests, tsc, eslint, build green. Commit `a11y: named controls and
  live-region feedback`. (Note: first build attempt ran in the repo root by mistake;
  re-ran in brandforge-site — green.)

### C3 — Menu semantics + Escape + audit correction (done)
- Rail account menu is a real `<button>` (valid span content, platform keyboard handling);
  Escape closes it. Panel drawer closes on Escape back to chat.
- Audit correction: claimed "zero reduced-motion handling" is wrong — `globals.css` already
  ships a `prefers-reduced-motion` block. Verified, untouched.
- Verified: 245/245 tests, tsc, eslint, build green. Commit `a11y: real menu button, escape dismiss, audit correction`.

### C4 — Perf micro-batch (done)
- Rail polls skip hidden tabs; task progress memoized; images lazy + async decode;
  collapsed chips use shared initialsFor. No visible change.
- Verified: 245/245 tests, tsc, eslint (one unused-disable caught and removed), build
  green. Commit `perf: memoize progress, pause hidden-tab polls, lazy images, shared initials`.
- Audit note: the "summarizeTaskProgress twice per render" claim was overstated — one call
  site is event-driven (/progress command); memoized the per-render one.

### C5 — Dead code + one dedupe (done)
- Deleted `isEmailConfigured` (zero importers; verified by grep).
- `uploadConversationAttachment` uses the tested `safeDownloadName` instead of its own
  regex copy (behavior identical, `|| 'attachment'` fallback kept).
- Skipped: test-only allowlist predicates (deleting breaks their tests; harmless),
  money()/clip() unification (6-file blast radius — daylight work), public PNG deletion
  (assets may still need uploading — founder call).
- Verified: 245/245 tests, tsc, eslint, build green. Commit `chore: drop dead email export, share filename sanitizer`.

### C6 — Landing copy (done)
- Hero sub rewritten in two plain sentences (niche role list moved to services where it
  belongs, em dash removed); two vague suggestion chips replaced with specific briefs that
  model good input; CTA `Start →` is now `Start building`; hero textarea named for
  screen readers. Steps/services sections left alone (rewritten days ago, still accurate).
- Verified: 245/245 tests, tsc, eslint, build green. Commit `copy: sharper hero, specific suggestions, named composer`.

### C7 — Proposal read waterfall (done)
- POST fires its four independent reads (access, staff, declines, author name) in one
  `Promise.all`; PATCH fires staff + owner lookup together. Guards evaluate in the same
  order with identical messages and statuses — pure latency win, no behavior change.
- Verified: 245/245 tests, tsc, eslint, build green. (Live e2e left for daylight since it
  writes prod rows and pings real channels.)

### C8 — Shared weeks helper + contrast audit (done)
- `weeks()` is now exported from ops-events and used by the proposals route (replaces
  `weeksLabel` plus two inline blocks). Side benefit: equal min/max used to render the
  silly `3–3 weeks` in Telegram/email; now `3 weeks`. Unit-tested.
- Measured all ten flagged contrast pairs with the real luminance formula: nine pass AA,
  the tenth (`#b8763b` on `#1c2024` = 4.44) rounds to the AA floor and stays. The two
  scary audit claims dissolved — `#b9e3c4`-on-green is translucent-over-dark in reality,
  and the eyebrow/brand/muted pairs all clear 4.5. No palette change.
- Verified: 246/246 tests, tsc, eslint, build green.

### C9 — Rail role reads the database (done)
- `/api/conversations-list` reported `role` from a hardcoded email list, disagreeing with
  `profiles.role` for anyone promoted outside that list (found live: a fresh operator read
  back `user`). Now DB-first with the email hint as fallback; the admin/staff badge mapping
  accepts both `admin` (DB) and `founder` (legacy hint). Same labels for all real accounts.
- Verified: 246/246 tests, tsc, eslint, build green.

### C10 — Two more read waterfalls (done)
- `participants` and `project-context` routes fire staff + access checks together.
  Downstream guards unchanged. About page skimmed (clean, no change); `describeNextDeliveryAction`
  prefix handling verified consistent between panel and pulse.
- Verified: 246/246 tests, tsc, eslint, build green.

### C11 — Copy buttons for wallet + tx hash (done)
- The deposit wallet address and the submitted transaction hash were long crypto strings
  with no way to copy them. Both get a Copy button with Copied confirmation (same pattern
  as the rail's Telegram code button). Real friction removed from the funding flow.
- Verified: 246/246 tests, tsc, eslint, build green.

### C12 — Branded 404 + error pages (done)
- No `not-found`/`error` routes existed (framework defaults). Added both in the product
  voice with recovery paths (open chat / go home / try again).
- Build flagged C1's `themeColor` placement (Next 16 wants it in the `viewport` export,
  not `metadata`) — moved, warning gone.
- Verified: 246/246 tests, tsc, eslint, build green.

### C13 — Empty-state audit + stale copy (done)
- Rail, transcript, panel and chat empty states all reviewed: genuinely good onboarding
  copy, honeypot correctly hidden, login minimal. One fix: the first-run explainer still
  described the pre-counter model ("accept, decline, or send back with changes") — now
  "accept, counter, or decline".
- Verified: 246/246 tests, tsc, eslint, build green.

### C14 — Proposal creation throttled (done)
- `POST /api/proposals` had no rate limit: every call pings the founder twice (Telegram +
  email) plus the team group and ops, so one compromised staff account could flood all
  four. Now 10/hour per author with 429 + Retry-After (same helper and shape as
  applications/chat/funnel). Legitimate use (a few proposals a day) and the e2e suite
  (≤4 posts/run) sit far below the cap.
- Verified: 246/246 tests, tsc, eslint, build green.

### C6 — Landing copy (done)
- Hero sub rewritten in two plain sentences (niche role list moved to services where it
  belongs, em dash removed); two vague suggestion chips replaced with specific briefs that
  model good input; CTA `Start →` is now `Start building`; hero textarea named for
  screen readers. Steps/services sections left alone (rewritten days ago, still accurate).
- Verified: 245/245 tests, tsc, eslint, build green.
