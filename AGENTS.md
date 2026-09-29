# BrandForge — agent operating guide

BrandForge runs as **two departments**. Every change is owned by one department and must be
followed through by the other. A change is not finished until both tracks are addressed.

## Departments

| Department | Owns | Guide |
| --- | --- | --- |
| **Development** | Product design + engineering: the `brandforge-site/` app, components, API routes, database/RLS, tests, builds, deploy. | `.agents/departments/development/AGENTS.md` |
| **Distribution** | Marketing + advertising: positioning, landing copy, launch posts, community, outreach, growth metrics. | `.agents/departments/distribution/AGENTS.md` |

## The dual-track rule (non-negotiable)

Whenever you **add, edit or remove** anything while working on Development, make the matching
Distribution move in the same piece of work. Minimum loop:

1. **Develop** — ship the code change (build + tests green).
2. **Distribute** — produce at least one of:
   - landing or in-app copy that names the new capability,
   - a launch/announcement draft for Discord or Telegram,
   - a community or outreach message,
   - a changelog entry a founder could read,
   - a demo/screenshot note describing what to show.
3. **Log** — append one row to `.agents/departments/distribution/distribution-log.md` linking the
   change to the marketing move.

If a change genuinely has no marketing angle (internal refactor, dependency bump, typo), say so
explicitly in the log entry instead of skipping the loop.

## Where things live

```
BrandForge/
  AGENTS.md                      <- this file
  .agents/departments/           <- the two department guides + distribution log
  brandforge-site/               <- the product (Next.js 16 App Router, Supabase)
  out/, *.html                   <- older static marketing pages (reference only)
```

## Current state (2026-09-28)

- Live: https://brandforge.gg (Vercel, `brandforge-site` production).
- Chat-first product: landing -> chat -> AI-structured project -> human proposal -> escrow.
- **Chat Workspace UX 2.0 (2026-09-26, deployed to brandforge.gg)**: conversation-centric 3-pane workspace.
  AI answers render as editorial content through a sanitising markdown renderer; each turn carries a
  collapsible **Thoughts** strip built only from `activity` SSE events (steps that really ran);
  attached text/csv/json/markdown files are read for real under a token budget while binaries are
  listed only; identity is deterministic (photo when present, otherwise hash-stable initials + role);
  the sidebar dropped platform counters for an account block. Collapsed width is remembered
  (`localStorage` key `brandforge:rail-collapsed`) and keeps letter-chip recents plus an avatar icon.
  No schema change, nothing to migrate.
- **First-run chat behaviour (2026-09-26, local until next deploy)**: the transcript no longer hijacks
  the scroll. `lib/chat-scroll.js` (`isNearBottom`, 7 unit tests) gates every auto-scroll: streamed
  tokens and Realtime rows follow only while the reader is at the end; sending a message or opening a
  chat forces the newest row into view; anyone scrolled up gets a **Jump to latest** pill. A failed
  send keeps its text in the composer and shows **Try again** in the red banner, and `/progress` +
  "Project sent for review." moved to the green status row, so `role="alert"` now means a real
  failure. No schema change.
- **Signed-in 401 storm fixed (2026-09-28, deployed)**: with an expired access token, routes
  verified the stale raw-Cookie token instead of middleware's refreshed `x-forwarded-cookie`
  → every API 401'd while the UI still looked signed in. `x-forwarded-cookie` now wins in
  `sessionTokenFromRequest` (tested `sessionTokenFromSources` in `lib/auth-cookies.js`) and
  in `createSupabaseServerClient.readCookies`; `lib/browser-auth.ts` `fetchAuthed` retries
  once after `refreshSession()` on 401 (chat-workspace, rail, settings, landing hero).
  Probes: fresh cookie 200, expired cookie 200 (rotated), no cookie 401.
  **Round 2 (same day)**: a dead session (expired token + spent refresh token) kept the
  zombie shell rendering `/chat` while APIs 401'd forever. `proxy.ts` now treats
  expired+unrefreshable cookies as signed out (`authCookieExpiresAt`), `fetchAuthed` parks
  on `/login` when refresh is auth-rejected (network/5xx/429 stay transient), and
  `getAuthenticatedUser` logs `[auth] getUser rejected: …` (message only) for the next
  log pull. Probe: zombie cookie → `/chat` 307 `/login`, `/login` renders.
  **Round 3 (same day, root cause)**: extraction itself was blind to multi-base
  cookies — `combineAuthChunks` returned only the first cookie base's join, so a
  stale auth cookie (old generation / old project ref, never overwritten by any
  Set-Cookie) that failed to decode shadowed the good current-ref one: middleware
  `getSession` (single storage key) kept rendering the shell while every route got
  `token === null` → silent 401. `lib/auth-cookies.js` now enumerates every base
  (`combinedAuthCandidates`), validates decode per candidate with a per-consumer
  predicate (`pickSession`), and prefers `sb-<current-ref>-auth-token`; the gate
  and `authCookieExpiresAt` use the same pick. Failures log
  `[auth] no token extracted: req=n/m fwd=n/m … names=[…]` (names/lengths only —
  never values) so the next storm is readable in one log pull. 196/196 tests.
  Known gap closed (same day, `de92443`): a retry that still 401'd after a
  *successful* refresh used to return that second 401 silently — `fetchAuthed`
  now warns (`fetchAuthed: still 401 after refresh on <path>`, path only) and
  parks on `/login` through the same terminal path as a failed refresh.
- **Contract signing live + founder stage notifications (2026-09-28, deployed)**:
  migration `0013_contract_signature.sql` applied in prod → the chat contract
  card is interactive end to end (two-sided edit/accept, signature badges,
  `contract_signed` funnel event, fund-escrow CTA). `notifyFounder`
  (`lib/stage-notify.ts`) reaches the founder on **both** channels at 7 moments —
  proposal ready, team accepted contract, contract signed, funding verified,
  funding rejected, work delivered for approval, payment released — linked
  Telegram (personal ping, previously wired for one event only) and email (new:
  pure builders in `lib/stage-emails.js` + `sendStageEmail`, +5 tests → 201/201).
  Emails send from `hello@brandforge.gg` (Resend domain verified; API key is
  send-only). Wiring: proposals, agreements, payments, chat-tasks routes.
- **Discovery notifier + atomic AI drafts (2026-09-28, deployed)**: any real
  transition into `READY_FOR_REVIEW` (send-for-review, AI `request_human_review`,
  proposal rejected back) posts one embed to the specialists' Discord
  (`lib/discord.js`, `DISCORD_WEBHOOK_URL` in `.env.local` + Vercel production;
  transition filter in `updateConversationStatus` — no double-posts, no pings).
  Same deploy wired `replaceDraftMilestones`/`replaceDraftTasks` to the
  transactional 0014 RPCs (conversation-row lock; drafts-only milestone map) and
  `buildConversationSummaries` to the 0015 one-query RPC (presentation stays in
  JS). Migrations applied by the founder; validated on PGlite (30 checks) and in
  prod (RPC keys + authenticated route). 206/206 tests.
- **Operator pipeline closed (2026-09-28, deployed `28a5ef1`→prod)**: briefs now reach the team
  on **both** channels — Discord discovery embed + a personal Telegram DM to every linked
  staff account (`brief_ready` in `lib/notify.js`, `notifyStaffBriefReady` in `project-db`,
  fired from `updateConversationStatus`; founder excluded). Proposal answers ping the author's
  linked Telegram too (`proposal_answered`). Accepting a proposal **is the invite**:
  `inviteProposalAuthor` auto-adds the author with a visible join line, and `staff/join` +
  `staff/post` now 403 operators until their own proposal is accepted (`canOperatorParticipate`;
  admins unaffected). Note: the linked-account promise had zero operator events behind it before
  this — that was the "operator gets no notifications" report. E2E probe: request-review →
  proposal → pre-accept 403s → accept → auto-join → post-accept 200s, all green (209/209 tests).
  `TELEGRAM_CHAT_ID`/`BOT_TOKEN` are set in Vercel (values masked to us; bot is admin in the
  team group) — if team-group messages are also missing, that value needs a human eyeball.
- **Staff proposal composer (2026-09-28, deployed `960102d`→prod `dpl_FuPbvvYdTRcoSWcNsVVHjWCiFGVi`)**:
  nothing in the product could *send* a proposal — the client only ever called GET/PATCH
  (founder accept/decline); `POST /api/proposals` was API-only. `chat-workspace.tsx` now shows
  staff a **Send proposal** strip above the composer while `state.status === READY_FOR_REVIEW`
  (and the chat isn't their own) with the form fields title / technical approach / final quote
  (EUR) / timeline (weeks) → `POST`, then refreshes state + messages + artifacts + recents.
  Flow: operator opens brief chat → Send proposal → founder gets the card, `proposal_sent`
  team-group ping, `proposal_ready` founder Telegram+email → accept auto-invites (previous
  bullet). `changes_requested`/`declined` → status back to `READY_FOR_REVIEW` re-shows the
  strip, so a revised proposal is the same path. 209/209 tests, tsc/eslint/build green;
  post-deploy auth probe + pipeline e2e green.
- **Proposal status/card RLS fix (2026-09-28, deployed `f1d6436`+`81e5cea`→prod
  `dpl_3eExef6oqu4prfp1wb8n4cHnhqbE`)**: the "founder still sees waiting banner" report had two
  causes. (1) An operator's proposal POST succeeded (money tables are service-role) but both
  follow-up writes died for a non-participant: `conversations` has **no UPDATE policy for
  non-owners and UPDATE denials are silent 0-rows, not 42501**, and `messages` INSERT is
  participants-only (42501). `updateConversationStatus` and `addMessage` now probe the row and
  bridge to the service role (`runUpdate` catches both shapes; `runInsert` bridges only
  `content_type='system'`). (2) No proposal had ever reached prod at all (zero rows, no
  `proposal_received` funnel events — the claimed submission never hit the server). Realtime
  system rows now also trigger `refreshState`/`refreshArtifacts` so an open founder tab flips
  the moment the status moves. E2E asserts `conversation PROPOSED after submit` + `proposal
  card landed in chat`. Lesson: UPDATE policies fail silently — probe the row, not the error.
- **Proposal counter round (2026-09-28, deployed `main`→prod `dpl_FJTcbqBcpy6iGUmGb4nfGcwR14Xt`;
  `0017_proposal_counters.sql` applied by the founder, columns verified live)**: full negotiation
  lifecycle from the spec — founder accepts / **counters once** / declines from `pending`;
  specialist accepts the counter, **counters back once** (`counter_back` = final offer) or
  declines; founder's accept/decline closes it; `declined` at any point returns
  `READY_FOR_REVIEW` so a fresh proposal can be written. Transition matrix in
  `canSetProposalStatus` (`lib/money-authz.js`; owner lane wins over staff; invalid jumps →
  409; no `currentStatus` → legacy path). Counter terms are **promoted into
  `total_amount`/`estimated_weeks_*` on acceptance**, so agreement, escrow and the
  `proposal_accepted` funnel price the final deal. UI: inline counter forms on the proposal
  card and in the panel; `handleProposalAction` carries terms. Pings: team
  `proposal_countered`, specialist personal `proposal_countered`, founder `counter_back_ready`
  Telegram+email (8th stage moment). Full pipeline e2e green on prod incl. the counter round
  trip (four 409 refusals incl. owner-counter_back-from-pending, promote-on-accept total 900,
  funnel prices the promoted total); auth probe green.
- **Ops webhook layer live, dormant until wired (2026-09-29, deployed `main`→prod
  `dpl_CLbMAZ7hznuXsYQTuUpReHup7EWD`)**: implements the negotiation/webhook spec as code.
  `lib/ops-events.js` (+14 tests → 239/239): staff embeds for brief/proposal/counter/match/
  contract/escrow/milestone moments routed per kind (`DISCORD_OPS_<KIND>_URL` →
  `DISCORD_OPS_URL`, deliberately NO fallback into the legacy discovery channel), plus
  anonymized public posts for exactly four growth-safe events (brief posted, match made,
  funded, milestone shipped — rejections/counters/amounts never leave staff channels).
  Wired at every site: brief transition, proposal send/answer/counters, invite-as-introduction,
  agreement create/sign, funding verify/reject/release — all best-effort, never block routes.
  `app/api/webhooks/github` (HMAC-verified, 404 without `GITHUB_WEBHOOK_SECRET`): stable
  releases + `public-changelog`-labeled merges → `#dev-log`. Spec notes: `counter_round`
  IS the negotiation_round (0/1/2, matrix-enforced, no new column); decline reopens the
  brief (closure is per-specialist via two-declines-out, not per-brief); no matching engine
  (broadcast model, no brief.matched events); public "matched and funded" fires at escrow
  verification, not signing; no dispute model yet (only funding-rejected routes to disputes);
  weekly digests need an aggregation cron (phase 2). E2E ALL PASS (27/27) + auth probe green
  on the deploy. Founder setup still open: create the Discord channels/webhooks + GitHub
  webhook (checklist in the 2026-09-29 report). `DISCORD_DEVLOG_URL` set in Vercel production
  via CLI 2026-09-29 and channel-proven with a live test post; `GITHUB_WEBHOOK_SECRET` set
  the same night but needed a redeploy to take effect (`dpl_D8MyM8L8S59Xfx4DGagZbjaTmrFt`);
  repo webhook deliveries were 404ing until then. First release + redelivery still open.
- **Slash-command autocomplete (2026-09-29, deployed `main`→prod
  `dpl_DNyb4i3SVCUVDeU6zjEp9SRJ8nee`)**: typing `/` in the composer filters the shared
  command vocabulary with arrow-key navigation (Enter completes a partial command, exact
  commands keep send-on-Enter, Escape dismisses). The Actions menu renders the same list
  (surfacing the previously hidden `/help`). 252/252, auth probe green on the deploy.
- **Overnight improvement batch (2026-09-29, merged to `main`, deployed `dpl_5NZdT8iwNRVFidcXjW9sMZFL5avQ`)**: 27
  cycles on `auto/overnight-improvements`, all green (252/252 tests, tsc, eslint, build).
  Highlights: task delivery actually advanceable (panel Approve/Send-back sent payloads the
  server ignored — founder approval never worked; now advance/reopen wired per role);
  proposal + invite creation throttled; auth fetch time-boxed at 30s; SEO essentials
  (robots, sitemap, twitter card, JSON-LD); a11y pass (named inputs, live regions, real
  menu button, Escape handling); perf (parallel reads, memoized progress, hidden-tab poll
  skip, stats route flags-only); copy buttons (wallet/tx/code), branded 404/error pages,
  hero copy, rail role from DB, counters in funnel, presence tests. Full list in
  `IMPROVEMENT_LOG.md`. Verified on prod with pipeline e2e + auth probe after deploy. Site code pushed 2026-09-29 to the private
  repo `BrandForgeGG/brandforge-site` (`main`); repo webhook + label + releases still open.
- **Weekly digest live as a manual trigger (2026-09-29, deployed `main`→prod
  `dpl_6D33yezecq44s6G2KMNn2pH44FtG`)**: phase 2 of the webhook spec as code —
  `lib/digest.js` (pure weekly text from counts, numbers only, honest quiet-week line),
  `getWeeklyStats` in project-db (service-role counts: conversations posted,
  `proposal_accepted`, `funding_verified`, `payment_released`), `postLiveMessage` in
  ops-events, and admin-only GET preview + POST-to-live-feed at `app/api/ops/digest`
  (401/403 enforced; dormant without `DISCORD_LIVE_URL`). Verified live with a probe
  admin: real numbers back (`5 posted, 1 matched, 0 funded, 0 shipped`), operator 403.
  244/244 tests. Cron wiring left for when the founder wants it automatic.
- **Channel routing matches the founder's Discord (2026-09-29, deployed `main`→prod
  `dpl_8BqqwY2x67hiqX4bi1Q1GxSmoMkZ`)**: `match_made` staff embeds route to a dedicated
  `matches` kind (`DISCORD_OPS_MATCHES_URL`, footer `ops-matches`) and public milestone
  lines prefer `DISCORD_MILESTONE_URL` over the live feed. 245/245, auth probe green.
  Founder wiring (env values) still open — webhook secrets must never enter the repo.
- **Proposal submit silently dead — nested form fixed (2026-09-28, deployed `0ab3567`→prod
  `dpl_BJ5mtXHnUspiuAkkXNhvbLWEofZH`)**: the "Submit proposal goes to bare /chat, nothing
  happens" report. The Send-proposal `<form>` rendered **inside** the composer `<form>`
  (`chat-workspace.tsx`) — nested forms are invalid HTML, the browser drops the inner form
  tag, so Submit fell through to a native GET navigation to bare `/chat`: no React handler,
  no POST (zero proposal POSTs in every log window, zero rows ever — the click never left
  the browser). The strip is now a plain `<div>` with an explicit button `onClick` (Enter in
  single-line fields submits via `onKeyDown`; the textarea keeps newlines). Hotfix branched
  off the deployed commit so the undeployed counter round (needs 0017) stays out of prod;
  merged back into `main` afterwards. E2E on the hotfix deploy: proposal POST 200, PROPOSED,
  card landed, accept→invite→ACCEPTED all green (counter assertions fail as expected — that
  code is not on this deployment). Lesson: never nest `<form>`; grep `<form` nesting when a
  submit silently navigates.
- **Proposal card shows the priced offer (2026-09-28, deployed `f33dc08`→prod
  `dpl_CxFxyZKU8b5HYqjYYn1FQ3FB7jjT`)**: the card showed only the title plus the system
  sentence ("Project action / zzz / BrandForge sent a proposal…"). Each proposal embed now
  carries its own snapshot (`totalAmount/currency/weeksMin/weeksMax/scope`, plus counter
  terms when they exist) written by the proposals route at send and answer time, validated
  on parse (`parseChatEmbed` in `lib/message-actions.js`, hostile shapes dropped/clipped),
  and the card renders it: "Proposal" eyebrow, serif title, price + timeline, status pill
  (orange while open, green accepted), counter box, scrollable scope excerpt. Old cards
  without the snapshot fall back to the message text. Hotfix branched off prod so the
  counter round (needs 0017) stays out; merged back into `main` (auto-merged clean,
  223/223). The founder's live "zzz" test card was backfilled from its proposal row so the
  new design shows immediately.
- **Specialist credited + card decline + two-declines-out (2026-09-28, deployed `4a2d1e3`→prod
  `dpl_BPKDcU63R3pHQL4HLGxF5EV9UsaX`)**: founder feedback on the live card — (1) it spoke as
  "BrandForge sent a proposal" while Mxstermind sent it: the send line now names the author
  (`getProfileDisplayName`, service-role read, "The team" fallback); (2) the card offered no
  Decline: owner pending cards now show Accept + Decline + details (wired through the embed
  dispatch); (3) new rule — **two founder declines on one brief and that author is out**:
  `countDeclinedProposals` (service-role exact count, no schema change) gates POST with 403
  past two declines and names the out in the second decline's chat line; the brief itself
  stays open for other specialists. Verified live with probe users: post→decline→post→decline
  (out named in chat)→post→403. Hotfix branched off prod (counter round still needs 0017);
  merged back into `main` (route PATCH conflict resolved keeping both counter lines and the
  out-note, 223/223).
- **Minimalist project panel (2026-09-29, shipped in the 0017 release `dpl_FJTcbqBcpy6iGUmGb4nfGcwR14Xt`)**: founder feedback on the panel paste — AI exhaust, not insight.
  Fixed: doubled "Project pulse" title removed; requirements and the task list collapse behind
  expanders (counts + delivery progress stay visible); the proposal block is a compact priced
  summary (title, total + weeks, status sentence, counter terms) with an "Answer in chat"
  button instead of a second set of Accept/Counter/Decline — the chat card is the decision
  surface, panel included. New "Talk to humans" footer links Discord + Telegram group/channel
  (`lib/community.js`, new `community.d.ts`). Every control kept (staff task/payment controls
  intact inside expanders); net −98 lines. 223/223, tsc/eslint/build green.
- **Empty-sidebar regression fixed (2026-09-28, deployed `f7691b2`)**: 0014/0015 revoked
  `EXECUTE` from `authenticated`, but routes call those RPCs through the **user-session**
  client (`db()`) → `42501 permission denied` → recents rendered `[]` (AI draft saves hit the
  same wall). `rpcForCaller` in `lib/project-db.ts` now bridges a 42501 through the service
  role and warns. **`0016_grant_rpc_execute.sql` applied** (same day) — session-client RPC
  calls verified 200/204 on the RLS path, bridge stays as silent resilience. Probe lesson: a
  fresh-user sidebar probe can't see this bug — probe with a conversation the user owns.


- **Open auth**: any Google account can sign in (login allowlist removed). Staff/admin access
  is `profiles.role` (`admin` / `operator`), not email.
- Operator pipeline: specialists apply at `/apply`; admin reviews at `/admin/applications`
  (accept sets `profiles.role='operator'`, decline, invite to a chat).
- **Auto sign-out fix (deployed)**: middleware uses `getSession()` only (no network
  `getUser()`); never writes auth-cookie deletions; all Supabase clients use
  `cookieEncoding: 'base64url'`; pages use `lib/browser-auth.ts` `getSessionUser()`;
  API identity (C1) is the cookie `access_token` verified with `auth.getUser(token)`
  (`getAuthenticatedUser`, 60s cache) — `x-user-*` headers are advisory only.
  Unauthenticated `POST /api/conversations` correctly returns 401; signed-in chat
  must not.
- Secrets live only in `brandforge-site/.env.local` (gitignored): `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`. Never commit or paste them again.
- Known accounts:
  - `brandforge.gg@gmail.com` — admin/founder (describes projects, approves delivered work).
  - `mxstermind.com@gmail.com` — operator (staff inbox, joins founder chats, posts, moves tasks).
- Required migrations: `0001_chat_first_rls.sql` … `0016_grant_rpc_execute.sql` — **all
  applied** in prod (0006 run 2026-09-22 via Supabase Management API; 0007–0012 verified live by
  column/table probe 2026-09-28; 0013–0016 run 2026-09-28 via the SQL editor; 0016 verified by
  `has_function_privilege` + session-client RPC probes). **`0017_proposal_counters.sql`
  applied 2026-09-29** (founder ran it in the SQL editor; all five columns verified readable
  via REST before the release deploy). Supabase PAT for
  future SQL runs is not stored here — ask the operator or use the SQL editor.
