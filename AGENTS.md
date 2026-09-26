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

## Current state (2026-09-22)

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


- **Open auth**: any Google account can sign in (login allowlist removed). Staff/admin access
  is `profiles.role` (`admin` / `operator`), not email.
- Operator pipeline: specialists apply at `/apply`; admin reviews at `/admin/applications`
  (accept sets `profiles.role='operator'`, decline, invite to a chat).
- **Auto sign-out fix (deployed)**: middleware uses `getSession()` only (no network
  `getUser()`); never writes auth-cookie deletions; all Supabase clients use
  `cookieEncoding: 'base64url'`; pages use `lib/browser-auth.ts` `getSessionUser()`;
  API identity comes from `x-user-*` headers → `headers()` → local chunked-cookie
  decode → `cookies()` → local `getSession()` (`getAuthenticatedUser`; no `getUser`).
  Unauthenticated `POST /api/conversations` correctly returns 401; signed-in chat
  must not.
- Secrets live only in `brandforge-site/.env.local` (gitignored): `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_SECRET_KEY`. Never commit or paste them again.
- Known accounts:
  - `brandforge.gg@gmail.com` — admin/founder (describes projects, approves delivered work).
  - `mxstermind.com@gmail.com` — operator (staff inbox, joins founder chats, posts, moves tasks).
- Required migrations: `0001_chat_first_rls.sql` … `0006_open_auth_roles.sql` — **all applied**
  in prod (0006 run 2026-09-22 via Supabase Management API; verified table, functions, policies,
  role seeds). Supabase PAT for future SQL runs is not stored here — ask the operator or use the
  SQL editor.
