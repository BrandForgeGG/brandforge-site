# Development department

Owns the whole product: design + engineering for `brandforge-site/`.

## Scope

- `app/` — routes and API handlers (`/chat`, `/staff`, `/api/*`).
- `components/` — chat workspace, conversation rail, project insights, staff inbox, landing.
- `lib/` — AI service/tools, project database access, auth, discovery, conversation state.
- `supabase/` — schema and migrations (RLS is mandatory on every table).
- Tests in `lib/*.test.js` (node:test), production build, deploy.

## Commands

```bash
cd brandforge-site
npm run dev                     # local development
npm run build                   # production build + full type check
node --test "lib/*.test.js"     # unit tests (node:test, no extra deps)
npx eslint <changed files>       # lint only what you touched
```

## Definition of done

1. `node --test "lib/*.test.js"` passes (add a test when logic is testable).
2. Production build type-checks (`npm run build`).
3. New/changed files lint clean (`npx eslint`).
4. Any new table, column or access rule ships with a migration in `supabase/migrations/`.
5. No fabricated data in the UI: the database is the source of truth.
6. Distribution follow-through completed (see `../distribution/AGENTS.md`).

## Design rules

- The chat is the product: one chat = one project.
- Match the premium LLM surfaces (ChatGPT/Claude): left rail with New Chat, projects, activity,
  recents and a user card footer; center conversation; right insights panel hidden by default
  with an explicit toggle; sticky message composer; sticky rail.
- Palette: ink `#14171a`, ember `#e8571e`, copper `#b8763b`, trust `#5aa578`, paper `#ece7de`.
- Serif for headlines, sans for UI text. No fake metrics, no placeholder people.

## Known gaps

- Funding is a status transition (`agreements.status = 'funded'`); no payment provider is wired.
- One sidebar only: `components/conversation-rail.tsx` is the single left rail for chat and every
  AppShell page. Legacy routes (`/dashboard`, `/tasks`, `/files`, `/team`, `/payments`, `/portal`,
  `/signup`) and their dead libs were removed on 2026-09-23; `/projects` and `/settings` remain.
- The `demo@brandforge.gg` password login is legacy demo state with no Supabase session.
- `brandforge-web/` is an unused scaffold.
- Sidebar (2026-09-23): `+ New Chat` + Recents only. New Chat does not create a row — the
  conversation is created by the first message (`POST /api/conversations` from `handleSend`).
- Staff model (2026-09-24): there is no staff inbox. Staff (`profiles.role` operator/admin) see
  every chat in Recents, get an `N new chats` badge, and opening a founder's chat calls
  `/api/staff/join`, which is what the founder sees as "BrandForge team in chat". `/api/staff/post`
  stays for team replies inside a founder's chat. A chat the staff member owns is their own project:
  ownership comes from `ConversationSummary.ownerId` + `userId` on `/api/conversations-list`, so the
  workspace answers with the AI, lets them delete their own chat, and lets them send a first message
  to create one (no more "open a chat from the sidebar first").
- Owner deletes: `DELETE /api/conversations` (cascades through the project state) and
  `DELETE /api/projects` (cleans members, approvals, tasks). Ownership is checked with the caller's
  session; the delete runs with `SUPABASE_SERVICE_ROLE_KEY`, which must exist in `.env.local` and in
  Vercel Production — without it both routes answer `503` on purpose.
- Task board (2026-09-25): staff assign tasks to chat participants and set/clear due dates
  from the panel (`PATCH /api/chat-tasks` `action=assign` / `action=schedule`); every change posts
  into the chat. Needs migration `0008_task_due_dates_and_assignees.sql` in prod.
- "Online" counters are Realtime presence (`lib/presence.ts`), never a stored `last_seen` column, so
  they need no migration and show `—` when Realtime is unreachable.
- Staff read every chat's history (2026-09-23): `canAccessConversation(userId, id, { allowStaff: true })`
  is used by the read routes + chat-tasks, and `readClient(asStaff)` in `lib/project-db.ts` reads the
  founder-scoped tables (requirements, milestones, proposals, agreements, payments, participants) with
  the service role, because RLS only grants staff conversations/messages/project_context/tasks. The
  workspace never runs an AI turn for staff and posts their messages through `/api/staff/post`.
