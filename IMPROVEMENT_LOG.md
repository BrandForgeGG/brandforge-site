# Overnight improvement log — 2026-09-29

## Current State (2026-09-29, from the repo — v2 fast-execution baseline)

- **Stack:** Next.js 16 App Router + React, Supabase (auth, Postgres + RLS, Realtime, Storage), Resend email. Deployed to `brandforge.gg` via Vercel CLI. CI on push/PR runs lint + tsc + tests + build. Code mirrored to private `BrandForgeGG/brandforge-site` (main).
- **Product:** chat-first studio. Landing → chat → AI-structured brief → staff proposal → negotiation (counter round, max 2, matrix-enforced) → two-sided contract signing → crypto escrow (admin-verified) → milestone delivery + founder approval → release. Two founder declines and that specialist is out; the brief stays open. Operators apply, get reviewed, join chats, and are auto-invited on acceptance.
- **Chat architecture:** `chat-workspace` (state, realtime, streaming, all actions) + `chat-transcript` (markdown renderer, system embed cards, reactions, profile cards) + `project-context-panel` (quiet summaries) + `conversation-rail`. Embeds for proposal/agreement/funding/review with role-gated actions (`lib/embed-actions.js`), idempotent endpoints, system-message receipts.
- **Design system:** near-black grounds, ember `#e8571e` accent, Fraunces serif display + Inter, `bf-*` classes in `globals.css`. No template look; keep it that way.
- **Data rules that must not break:** RLS everywhere, service role confined to `lib/project-db.ts`; agreement totals derived server-side from the accepted proposal; `counter_round` 0/1/2 is the negotiation counter; funnel properties are allowlisted (no PII).
- **Broken/missing right now:** nothing known-broken on prod (morning triage: zero errors/5xx; overnight batch fixed task approval + submit hangs, both unshipped). Missing by design decision: matching engine, dispute model, digest cron, Telegram auto-post, `public-changelog` label flow unused until first release. Open setup: Discord webhook values, GitHub webhook + secret, PAT revocation, SPF/DMARC.
- **Baseline this morning:** 252/252 tests, tsc clean, `npm run lint` clean, production build green.

> Autonomous session notes live below. Branch: `auto/improvements` (this session). Overnight work is merged; `IMPROVEMENT_LOG.md` continues append-only.

## Summary for the user

> Autonomous session. Branch: `auto/overnight-improvements` (local only — NOT pushed,
> NOT deployed). All verification is local (tests, tsc, eslint, build). No prod writes,
> no messages to real users, no secrets touched.

## Summary for the user

**34 improvement cycles, branch merged, all green: 252/252 unit tests (up from 239),
`tsc`, `eslint`, `next build` including one clean build from scratch. Nothing pushed
to GitHub (no credentials here).**
Production runs `dpl_5NZdT8iwNRVFidcXjW9sMZFL5avQ`; `main` is four small commits ahead
(community copy, log hygiene, live-row cards) awaiting deploy + e2e.
Morning prod triage: zero errors, zero 5xx; a 409 burst traced to stale proposal cards
offering dead buttons after panel decisions — fixed at the source this cycle.

**What got better**
- SEO: `/robots.txt` + `/sitemap.xml` now emitted, twitter card, theme color, Organization
  structured data on the landing page.
- Accessibility: named composer/proposal/invite/reject inputs, reply-dismiss label, focus-
  reachable message actions with named reaction pills, `role=alert/status` on every form
  banner, real-button account menu with Escape, Escape-dismissable project drawer.
- Performance: proposal/participants/context/task read waterfalls parallelized, task progress
  memoized, rail polls skip hidden tabs, images lazy, stats route dropped two full-table
  counts it computed for nobody.
- Product: copy buttons on wallet/tx/code blocks, branded 404 + error pages, sharper hero
  copy, rail role reads the database, counter offers in the funnel + dashboard, task delivery
  actually advanceable (Approve/Start/Submit-for-review/Send-back — the approval path never
  worked), unknown task actions get 400.
- Robustness/security: proposal creation + invites throttled (10/hour, 429 after authz),
  auth fetch can no longer hang (30s cap, signals compose), OAuth logs PII-free, filename
  sanitizer shared, task claims use email prefixes.
- Correctness fixes: `3–3 weeks` rendering, doubled pulse title, first-run copy matching
  the counter model, dead email export removed, proposal cards follow the live row (stale
  cards offered dead buttons after panel decisions).

**To ship it:** `main` is ready — `git push origin main`, `vercel --prod` from
`brandforge-site/`, then run the pipeline e2e once (it writes prod rows and pings
channels — you are awake, so daylight rules apply).

**Open decisions:** see "Needs human decision" below (9 items, PAT revocation first).

## Needs human decision

1. **Revoke the two GitHub PATs** (security, 1 min) — both were pasted in chat and used from shell history. Outstanding since last night.
2. **Digest cron** — the trigger route is live; automation needs a cron auth scheme (the route requires an admin session today) plus a schedule call. Vercel plan limits may apply.
3. **Matching engine** — broadcast vs routed briefs is a product decision, not a code task.
4. **Dispute model** — states, evidence, who arbitrates. Nothing raises disputes yet.
5. **Public PNG deletion** — `discord-banner.png` (357 KB) + 6 siblings are unreferenced in code but may still need uploading to Discord/Telegram profiles. Delete only after confirming.
6. **money()/clip() unification** — 6-file blast radius across tested notify builders; safe only with a live e2e run. Daylight work.
7. **next/dynamic code-splitting** — needs visual verification (panel lazy-load behavior).
8. **Telegram channel auto-post** — needs channel admin + chat id; manual forwarding works meanwhile.
9. **SPF + DMARC DNS** (older open item) and **demo video/screenshots**.

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

### C15 — Auth fetch can no longer hang forever (done)
- `fetchAuthed` had no timeout on any attempt: a stalled request or a hung session refresh
  left buttons stuck ("Sending…") with no error and no retry — the exact shape of tonight's
  earliest submit complaint. Every attempt (initial fetch, refresh race, retry) is now
  time-boxed at 30s; timeouts surface as normal caller errors. No unit test possible here
  (module needs the bundler's `@/` alias), verified by tsc + eslint + build.
- Verified: 246/246 tests, tsc, eslint, build green.

### C16 — Sweep: TODOs clean, email out of OAuth logs (done)
- Full `TODO|FIXME|console.log` sweep: every TODO hit is the legitimate task-status enum;
  the only real find was `user.email` in the OAuth success log — removed (redirect target
  kept). Cookie/error logs were already PII-free.
- Verified: 246/246 tests, tsc, eslint, build green.

### C17 — Copy buttons on code blocks (done)
- AI answers render fenced code with no way to copy it. New `CodeBlock` renderer with a
  Copy/Copied button (positioned top-right, same interaction pattern as the other copy
  buttons), plus its CSS. Inline code untouched.
- Verified: 246/246 tests, tsc, eslint, build green.

### C18 — Full-diff self-review + deferred register (done)
- Reviewed the complete overnight diff file by file: no unintended changes, route guard
  order preserved, display strings identical except the intended `3–3 weeks` → `3 weeks`
  fix. Created the "Needs human decision" register (9 items). No code change.

### C19 — Admin applications route review (done, no change)
- Read the operator-granting path end to end: admin gate, idempotent decline
  (`eq(status, pending)`), invite-requires-accepted, no PII in messages. The single raw
  DB error echo goes to admins only — acceptable, left alone.

### C20 — Presence utils finally tested (done)
- `presence-utils.js` promised node:test coverage in its header but had no test file.
  Added five cases: tab-dedupe, self-exclusion, role fallbacks, 40-char clip, typing cap.
- Verified: 251/251 tests, tsc, eslint, build green.

### C21 — Negotiation enters the funnel (done)
- Counters were the only negotiation moment with no metric. New `counter_offered` event
  (+ `round` property key, small-int enum, privacy-safe) recorded server-side in the PATCH
  counter branch; admin funnel dashboard gains the Counter row and the previously-missing
  Contract-signed row.
- Verified: 252/252 tests, tsc, eslint, build green.

### C22 — Stats route stops scanning profiles (done)
- `/api/stats` ran two full-table service-role counts on every 60-second poll per client
  while nothing renders the numbers anymore (README already documented the flags-only
  end-state; the code never finished it). Now flags only; `getPlatformCounts` deleted
  (sole caller was this route, verified by grep).
- Verified: 252/252 tests, tsc, eslint, build green.

### C23 — Task action hardening (done)
- Read `chat-tasks` end to end. Three fixes: claiming a task no longer stores the
  operator's raw email as the assignee name (email prefix, matching the display-name
  convention everywhere else); unknown actions get an honest 400 instead of a misleading
  409-about-roles; conversation + staff lookups fire together.
- Verified: 252/252 tests, tsc, eslint, build green.

### C24 — Invite emails throttled (done)
- `POST /api/invite` was validated and gated but unthrottled: every call sends a real
  email on the Resend quota. Now 10/hour per sender with 429 + Retry-After
  (same helper as applications/chat/funnel/proposals). `staff/post` reviewed clean.
- Verified: 252/252 tests, tsc, eslint, build green.

### C25 — Conversation creation reviewed (done, no change)
- Validated, parallel reads already in place, honest errors, server-side funnel. Clean.

### C26 — Review findings fixed, delivery workflow repaired (done)
- A second reviewer pass over the overnight diff found one live bug that predates tonight:
  the panel's Approve/Send-back buttons sent `{status}` with no `action`, which the server
  ignores — founder approval of delivered work could never succeed (409 on main, 400 with
  the new whitelist). Fixed properly: Approve sends `action: 'advance'` (founder-only),
  staff get Start/Submit-for-review on TODO/IN_PROGRESS plus a working Send-back via a new
  staff-only `reopen` transition (REVIEW→IN_PROGRESS). Nothing could advance tasks in the
  UI before this.
- Reviewer nits fixed: throttles moved after authz (diagnostic 403s preserved),
  `AbortSignal.any` composes caller signals, panel Escape skips text fields.
- Accepted as designed: funnel throw pattern (matches neighbors), parallel pre-authz reads
  (discarded, no leak), weeks edge rendering (intended), visual deltas.
- Self-correction: my reorder edits collided mid-file (duplicated lines) — caught by tsc,
  rewritten cleanly, green after.
- Verified: 252/252 tests, tsc, eslint, build green.

### C27 — Staff gate, review route, conversation creation (done, no change)
- `staff/join`, `lib/staff.ts` (parallel role+participants, idempotent join, no email
  leak), `request-review` (deliberately accepts thin briefs for in-chat triage;
  idempotent by status), `conversations POST` (validated, honest errors). All clean.

### C28 — Community copy dedupe (done, day loop on main)
- Landing community body repeated "land" from the headline and used an em dash. Now:
  "Watch us ship, talk to the crew, or bring your project today. A human answers."
- Verified: 252/252 tests, tsc, eslint, build green.

### C29 — Focus styles verified (done, no change)
- Global `:focus-visible` rings plus per-component rules cover buttons, links, inputs,
  menus and chips. No gap.

### C30 — Auth identity path reviewed (done, no change)
- Token-hash cache keys (tokens never stored), bounded cache, labeled extraction
  diagnostics, no PII in logs. Exemplary — untouched by rule (auth-critical, no live
  verification overnight).

### C31 — Dependency audit (done, no change)
- `npm audit`: 0 vulnerabilities in production dependencies.

### C32 — Clean build + prod SEO check (done, no change)
- Full build from a deleted `.next` directory green; prod serves `/robots.txt` and all
  seven `/sitemap.xml` URLs live (read-only check); no stale `stats` consumers anywhere.

### C33 — Proposal cards follow the live row (done)
- Prod evidence: ~14 PATCH attempts in 7 seconds, all 409, on an already-accepted
  proposal — stale cards keep offering dead buttons after the decision lands elsewhere
  (each card rendered from its frozen message artifact). Cards for the current proposal
  now take buttons + status pill from the live row (same pattern as the contract card's
  `ownContract`); older proposals keep their historical snapshot. Accepting via the panel
  instantly disarms every open card.
- Verified: 252/252 tests, tsc, eslint, build green.

### C34 — Prod error triage (done, no change)
- 18-minute morning window: 432×200, 0 errors, 0 fives. 24×403 = pre-accept operator
  gates working as designed; 48×409 investigated above (stale-card hammering, now fixed
  at the source).

### C35 — Slash-command autocomplete (done, deployed `dpl_DNyb4i3SVCUVDeU6zjEp9SRJ8nee`)
- P1 gap: menus existed but typing `/` did nothing. The composer now filters the shared
  command vocabulary as you type, with arrow navigation, Enter to complete (exact commands
  keep send-on-Enter), Escape to dismiss, and mouse selection that keeps focus. The Actions
  menu renders the same list, which also surfaced the previously hidden `/help`.
- Self-correction: accidentally staged an unrelated user-dropped image from
  `Distribution/` — removed from the commit before pushing anything; file untouched on
  disk. Lesson: `git add -A` sweeps untracked user files — inspect status before staging.
- Verified: 252/252 tests, tsc, eslint, build green; auth probe green on the deploy.
