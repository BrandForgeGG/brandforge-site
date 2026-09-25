# BrandForge

BrandForge is a **chat-first human execution platform**. A founder describes an idea in a
conversation, BrandForge AI turns that conversation into structured project state, and a human
BrandForge team later joins the **same chat** with a real commercial proposal. The underlying
rule is **one chat = one project**.

The chat is the product. Not a dashboard, not a marketplace, not a ticket queue.

```
landing (/)
  └─ founder describes an idea
       └─ /chat?conversationId=…   AI asks, requirements get captured
            └─ AI estimate + milestones stored in Postgres
                 └─ "Send to BrandForge review"
                      └─ proposal / agreement / payments appear in the same chat
```

## Changelog

- **2026-09-23 · staff view** — The BrandForge team can open any user's chat and read the whole
  history: transcript, project state, requirements, milestones, proposal, agreement and payments.
  Staff replies post as the team (`human_operator`) instead of triggering the AI, and a staff look
  never writes to the founder's rows.

- **2026-09-23 · update** — The sidebar is just **+ New Chat** and your chats, and that is the whole
  start of the flow: sending the first message creates the project, so empty duplicates never show
  up. Chats can be deleted from the sidebar (project, requirements, proposal and messages go with
  it), and a chat shows *team in chat* once BrandForge staff have viewed or entered it. The team no
  longer works from a separate inbox — a new chat reaches them automatically. The sidebar counters
  now show users registered, online and staff online.

- **2026-09-23** — One sidebar, everywhere: chat and every app page now share the same
  navigation (Chat, Projects, Recents, live activity), and old pages nothing used anymore
  (`/dashboard`, `/tasks`, `/files`, `/team`, `/payments`, `/portal`, `/signup`) are gone —
  legacy signup links land on the Google-only login card.

## Where the code lives

| Path | Purpose |
| --- | --- |
| `brandforge-site/` | **The product.** Next.js 16 App Router + React 19 + Tailwind 4 + Supabase. |
| `../brandforge-web/` | Stale `create-next-app` scaffold, no product code. |
| `../*.html`, `../out/` | Older static marketing pages kept for reference. |

## Local setup

```bash
cd brandforge-site
npm install
npm run dev          # http://localhost:3000
```

`.env.local` is required (it already exists in this workspace):

```
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
NEXT_PUBLIC_SITE_URL=https://brandforge.gg
OPENROUTER_API_KEY=…                     # server-only, used by /api/chat
# OPENROUTER_MODEL=openai/gpt-4o-mini    # optional override
SUPABASE_SERVICE_ROLE_KEY=…              # server-only: platform counters, deletes, money writes
# SUPABASE_SECRET_KEY=…                  # optional sb_secret_… fallback for the service role
NEXT_PUBLIC_DEPOSIT_WALLET_ADDRESS=…     # client-visible: crypto escrow deposit target
NEXT_PUBLIC_DEPOSIT_NETWORK=…            # client-visible: e.g. "USDT (TRC-20)"
# TELEGRAM_BOT_TOKEN=…                   # optional: @BotFather token for team notifications
# TELEGRAM_CHAT_ID=…                     # optional: team group chat id (lib/notify.js is a no-op without both)
```

Commands:

```bash
npm run build                     # production build + full type check
node --test "lib/*.test.js"       # unit tests (node:test, no extra dependencies)
```

## Architecture

The database is the source of truth. The AI proposes, the server validates, Postgres stores, and
only then does the UI show it.

```
founder message
  └─ POST /api/chat                        (session = Supabase auth cookie)
       ├─ persist the founder message                        messages
       ├─ load the transcript from the database (the client never supplies history)
       ├─ system prompt + CURRENT PROJECT STATE block (read from the database)
       ├─ OpenRouter stream: SSE deltas forwarded to the browser as they arrive
       ├─ tool calls → lib/ai-tools.ts      validate → write → return the result to the model
       └─ persist the reply, recompute discovery, return the state snapshot
```

Key modules:

| File | Responsibility |
| --- | --- |
| `app/page.tsx` | Landing "What are you building?" → creates the conversation, hands off to the chat. |
| `components/chat-workspace.tsx` | Chat orchestration: streaming, transcript, sidebars, proposal/payment actions. |
| `components/conversation-rail.tsx` | Single left sidebar for chat **and** every AppShell page: logo, New Chat, Recents (delete + "team in chat" marker), platform counters (users, online, staff on), user card footer. |
| `components/chat-transcript.tsx` | Messages, empty state, suggested prompts. |
| `components/project-context-panel.tsx` | Right sidebar: status, discovery, requirements, open questions, milestones, AI estimate, proposal, agreement, payments. |
| `app/api/chat/route.ts` | Exactly one conversation turn, server-authoritative. |
| `lib/ai-service.ts` | OpenRouter client: system prompt, tool schema, real SSE streaming, tool loop. |
| `lib/ai-tools.ts` | Server-side validation and execution of every AI tool call. |
| `lib/conversation-state.ts` | Snapshot composition, discovery sync, client state payload. |
| `lib/discovery.js` | Deterministic discovery scoring, shared by the API and the AI tool (unit tested). |
| `lib/project-db.ts` | All chat-table access through the request-scoped Supabase session (RLS enforced). |
| `proxy.ts` | Next 16 `proxy` (formerly middleware): auth gate for `/chat`, `/settings`, `/apply`, `/admin`; strips client-supplied `x-user-*` headers (H6); legacy `/signup` → `/login`. |

### State model (never blurred)

1. **AI estimate** — derived from the conversation, stored on `project_context`, always labelled
   as not final.
2. **BrandForge proposal** — human-reviewed commercial terms (`proposals`).
3. **Accepted agreement** — `agreements` plus the `payments` schedule generated from milestones.

Conversation status flow:
`DISCOVERY → READY_FOR_REVIEW → (REVIEW) → PROPOSED → ACCEPTED → ACTIVE → COMPLETED / CANCELLED`

## Database

Chat-centric schema: `conversations, messages, project_context, requirements, milestones, tasks,
proposals, agreements, payments, participants, decisions, blockers` — see `DATABASE_SCHEMA.md`
and `supabase-schema.sql`. Row level security is enabled on every table and scoped to
`conversations.user_id = auth.uid()`.

**Required migration:** `supabase/migrations/0001_chat_first_rls.sql`. The original schema never
created an `INSERT` policy for `project_context`, so the very first AI write of a brand new
conversation is rejected by Postgres. Apply it once:

```bash
# paste the file into the Supabase SQL editor, or
supabase db push        # run from brandforge-site/
```

## AI tools

`update_project_context`, `add_requirement`, `update_requirement`, `add_open_question`,
`resolve_open_question`, `record_decision`, `calculate_estimate`, `set_project_milestones`,
`check_discovery_completeness`, `request_human_review`.

- Open questions are `requirements` rows with `category = 'open_question'` — no extra table.
- AI milestones are drafts (`proposal_id IS NULL`); each AI pass rewrites them in place and
  superseded drafts are marked `cancelled`, so nothing is ever duplicated.
- Discovery completeness is recomputed from rows on every turn and on every sidebar load.

## Discovery checklist

Weighted, deterministic (`lib/discovery.js`): project name 10, problem statement 15, target users
15, platforms 10, at least three captured requirements 20, timeline estimate 15, budget estimate
15. At `>= 0.7` the "Send to BrandForge review" action becomes available.

## Known gaps / next steps

- The AI drafts the execution plan into the chat: `set_project_tasks` writes 5–20 tasks
  (optionally linked to milestones) into `tasks` via `replaceDraftTasks` — each AI pass rewrites
  its own drafts in place, superseded drafts are marked DONE, and tasks claimed by a human are
  never touched. The project panel renders the board with live statuses; staff move work forward
  (`TODO → IN_PROGRESS → REVIEW`) and the founder approves delivered tasks (`REVIEW → DONE`)
  from the panel via `PATCH /api/chat-tasks` (founder approval only once the project is
  ACCEPTED/ACTIVE/COMPLETED). Every transition also posts into the chat. Staff can assign any task
  to someone in the chat (`action=assign`, assignee must be a participant) and set or clear a due
  date (`action=schedule`, `YYYY-MM-DD`, stored as midnight UTC); both post a system line into the
  chat. Needs migration `0008_task_due_dates_and_assignees.sql` for `tasks.due_date`/`assignee_id`
  (**not yet applied to production**). Remaining task gap: file attachments.
- Funding is admin-verified crypto escrow, not a payment provider: the founder sends the
  agreement total in crypto to the BrandForge deposit wallet and pastes the transaction hash in
  the project panel (`POST /api/payments`); staff verify the transfer on-chain
  (`PATCH /api/payments { action: 'verify' }` → payments `pending → paid`, agreement `funded`,
  conversation ACTIVE) and release each milestone payment to the operator after the founder
  approves the delivered work (`paid → released`). All money mutations run as the service role
  after route-level authorization; RLS on proposals, agreements and payments is read-only for
  authenticated users (migration 0007). Staff verify and release from the project panel —
  the operator runbook is `ESCROW.md`.
- `/settings` is the only remaining non-chat account surface. The legacy demo routes
  (`/dashboard`, `/tasks`, `/files`, `/team`, `/payments`, `/portal`, `/signup`) and their dead
  libs were removed on 2026-09-23; the chat-first flow never depended on them. The legacy
  `/projects` page plus `/api/projects`, `/api/approvals`, `/api/tasks` and
  `lib/brandforge-data.ts` were removed the same day: `tasks.project_id` never existed in the
  live schema, so the page rendered synthetic rows over a broken query (audit H4).
- The `demo@brandforge.gg` password login and its cookie/localStorage session helpers were
  removed from `lib/auth-utils.js` on 2026-09-23. Google sign-in + Supabase session is the only
  auth path; `lib/user-roles.js` is now a display-only hint (profiles.role is authoritative).
- Deleting a chat (`DELETE /api/conversations`) runs the delete
  with the service role after an ownership check, because the child tables carry no founder DELETE
  policy. The route answers `503` if `SUPABASE_SERVICE_ROLE_KEY` is missing. The service-role
  client may only be imported by `lib/project-db.ts` — enforced in CI by
  `lib/service-role-allowlist.test.js` (audit H7).
- "Online" in the sidebar is live Realtime presence (`lib/presence.ts`), not stored presence: it
  counts open tabs, so it reads `—` when Realtime is unavailable rather than guessing.
- Staff can read any chat's history. The API gate is `canAccessConversation(..., { allowStaff: true })`
  and the founder-scoped tables (requirements, milestones, proposals, agreements, payments,
  participants) are read with the service role (`readClient(asStaff)`), because RLS only grants staff
  `conversations`, `messages`, `project_context` and `tasks`. Founder-only actions stay gated: running
  the AI turn (`/api/chat`), the review handoff, creating the agreement, and deleting a chat —
  but inside a chat a staff member owns they are the founder, so the AI answers, they can delete
  their own chat, and a first message creates one (no sidebar pick needed). Ownership travels as
  `ownerId` on each summary plus `userId` on `/api/conversations-list`.
- `brandforge-web/`, the root HTML mockups and `out/` were removed on 2026-09-23 (preserved in
  git history, commit `4039167`).
- Rate limiting is per-instance in-memory (`lib/rate-limit.js`): `/api/chat` is capped at
  30 turns / 10 min per user and `/api/applications` at 3 / hour per user, and `/apply` carries
  a honeypot field. A durable shared-store limiter is a follow-up (audit H8).

## Human participation (operator UI)

Closed testing runs two accounts:

| Account | Role |
| --- | --- |
| `brandforge.gg@gmail.com` | Founder — describes projects, accepts proposals, approves delivered work. |
| `mxstermind.com@gmail.com` | Operator — works the staff inbox, joins the same chat, posts as a human operator, moves delivery tasks. |

- `/staff` is the operator inbox: every founder conversation with a real first message, a
  one-click **Join as staff**, and a composer that posts into the founder's chat.
- APIs: `/api/staff/conversations`, `/api/staff/participations`, `/api/staff/join`,
  `/api/staff/post`. Authorization is the operator allowlist (`lib/auth-allowlist.js`).
- Joining writes a `participants` row and a system line into the founder's transcript, so both
  sides see the team arrive. Human replies land as `messages.sender_type = 'human_operator'`
  (`sender: 'human'` in the transcript).
- The chat shell follows the premium LLM layout: left rail (New Chat, Projects, live Activity,
  Recents, user card with Settings/Sign out), center conversation with a sticky composer, and a
  right insights panel that is **hidden by default** behind the header toggle. On mobile, the
  rail and the insights panel become drawers.
- `GET /api/stats` feeds the rail's live activity tiles (projects, messages, tasks shipped/open).
- `GET /auth/signout` clears the Supabase session and returns to the landing page.

## Public launch status (2026-09-22)

**Live:** https://brandforge.gg (Vercel, `brandforge-site` production).

- `/` is a public landing: hero CTA, how-it-works, services, community (Discord +
  Telegram). Any Google account can sign in and start a project chat; the community
  channels are the top-of-funnel for founders who want to talk to a human first.
- Auth is **Google-only and open**: any Google account can sign in and use the app. Staff
  access comes from `profiles.role` (`admin` / `operator`), not an email list — known staff
  accounts are `brandforge.gg@gmail.com` (founder/admin) and `mxstermind.com@gmail.com`
  (operator); `/staff` and `/admin/*` check the role server-side.
- Community links live in one place: `lib/community.js`.
- Vercel env for production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `OPENROUTER_API_KEY` (stored as secret).

**Required migrations** (run in order in the Supabase SQL editor):

1. `supabase/migrations/0001_chat_first_rls.sql` — adds the missing `project_context` INSERT
   policy and the milestone DELETE policy; without it the first AI write is rejected by RLS.
2. `supabase/migrations/0002_fix_handle_new_user.sql` — fixes the `handle_new_user` trigger so
   the first OAuth sign-in does not roll back.
3. `supabase/migrations/0003_chat_tasks_and_staff.sql` — task policies plus participant read
   access for chats a staff member has joined.
4. `supabase/migrations/0004_staff_inbox.sql` — lets the operator account read every founder
   conversation (staff inbox), join as a participant and move delivery tasks.
5. `supabase/migrations/0005_fix_infinite_recursion.sql` — routes conversation/participant
   policy checks through SECURITY DEFINER helpers so policies cannot recurse into each other.
6. `supabase/migrations/0006_open_auth_roles.sql` — open Google sign-in; staff access comes
   from `profiles.role` (`admin` / `operator`) instead of an email allowlist.
7. `supabase/migrations/0007_admin_crypto_escrow.sql` — funding evidence columns on `payments`
   (`tx_hash`, `network`, `submitted_at`) and read-only RLS on proposals, agreements and
   payments. **Not yet applied to production** — run it together with the escrow deploy.
8. `supabase/migrations/0008_task_due_dates_and_assignees.sql` — idempotent `tasks.due_date`
   (`timestamptz`) + `tasks.assignee_id` for the task-board due dates and assignee picker.
   **Not yet applied to production** — run it before deploying task-board depth.

