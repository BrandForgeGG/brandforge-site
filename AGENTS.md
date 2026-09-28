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
  `has_function_privilege` + session-client RPC probes). Supabase PAT for
  future SQL runs is not stored here — ask the operator or use the SQL editor.
