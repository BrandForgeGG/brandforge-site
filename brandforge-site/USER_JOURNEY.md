# User journey — first action to contract signature

The single source of truth for how a person moves through BrandForge, who does what at each
step, and where the journey is optimized toward one outcome: **a signed, funded contract**.
Every feature gets checked against this map before it is built.

| Related | |
| --- | --- |
| Conversation state machine | `DISCOVERY → READY_FOR_REVIEW → PROPOSED → ACCEPTED → ACTIVE → COMPLETED` |
| Payment schedule | `scheduled → pending → paid → released` (see `ESCROW.md`) |
| Data model | `DATABASE_SCHEMA.md` |
| Funnel events | `lib/funnel.js` (`first_message`, `brief_complete`, `proposal_received`, `proposal_accepted`, `milestone_completed`, …) |

## Roles

| Role | Where it lives | Powers on the journey |
| --- | --- | --- |
| **Visitor** | not signed in | Reads the landing page, types the first message (funnel records `signed_in: false`), signs in with Google (open auth). |
| **Founder** | `profiles.role = client`, owns the conversation | Describes the project, answers the brief, accepts/declines the proposal, funds escrow, approves delivered work (REVIEW → DONE), invites teammates. |
| **AI** | `sender_type = ai` (sender "BrandForge") | Structures requirements, drafts milestones/tasks/estimates, asks open questions, posts system milestones. Never prices — staff prices. |
| **Operator** | `profiles.role = operator` (staff) | Sees the staff inbox, joins chats (`/api/staff/join`), issues proposals, edits the contract, verifies funding on-chain, releases payments. All staff powers come from `profiles.role` only (H2/H4). |
| **Admin** | `profiles.role = admin` | Everything an operator does, plus applications, accounts, and platform settings. |
| **Invited teammate** | `participants` row, not staff | Reads and comments in the founder's chat; cannot touch tasks, proposals, or staff routes (post-H2). |

## Stage by stage

### 0. Landing → first message (Visitor)
- **Founder's action:** types what they want built into the hero prompt (or lands on `/chat` directly).
- **System:** funnel records `first_message`; login (Google) is requested before the conversation is persisted.
- **Conversion goal:** the typed intent must survive sign-in — losing it is the first drop-off.
- **Status:** working; friction item: post-login resume of the typed message (verify, see gaps).

### 1. Discovery chat (Founder + AI) — `DISCOVERY`
- **Founder's action:** describes the project in plain chat; attaches files; answers AI questions.
- **AI:** shapes the brief in `project_context` (completeness score), drafts milestones and tasks, shows the Thoughts strip of what it actually ran.
- **Exit:** founder presses **Send for review** (`POST /api/request-review`) → `READY_FOR_REVIEW`;
  system line "Project sent for review." The chat is now *locked for staff review* — the founder
  waits; the AI stops proposing.
- **Conversion goal:** reach `READY_FOR_REVIEW` with a complete brief (funnel `brief_complete`).

### 2. Staff pickup (Operator)
- **Operator's action:** unseen chat surfaces in the staff inbox; opening it auto-joins
  (`/api/staff/join` → participant row + "… joined this conversation" line in the founder's chat).
- **Founder sees:** the team has arrived — first human trust moment.
- **Conversion goal:** time-to-pickup measured; the founder must never sit in a dead chat.

### 3. Proposal (Operator → Founder) — `PROPOSED`
- **Operator's action:** issues the proposal (`POST /api/proposals`, staff-only): title, scope,
  deliverables, **total**, weeks. Funnel `proposal_received`; notify fires.
- **Founder sees:** proposal card in the same chat — accept / decline / request changes.
- **Founder's answer:** `PATCH /api/proposals` → `ACCEPTED` (or `READY_FOR_REVIEW` again on
  changes requested). Funnel `proposal_accepted`.
- **Conversion goal:** the accept click. Everything above exists to make this safe to click:
  scope readable in chat, price fixed, no dashboards.

### 4. Agreement — the contract (drafted automatically) — `ACCEPTED`
- **System:** founder's accept triggers `POST /api/agreements`; the contract total and terms are
  **derived server-side from the accepted proposal** (H3), the payment schedule is reconciled so
  `sum(payments) = total` exactly, and the "awaiting funding" system line lands in chat.
- **Founder sees:** agreement card + payment schedule; the escrow instructions.
- **Contract card (built 2026-09-28, needs migration 0013):** the agreement card in the
  transcript is the **signature surface** — both sides read the exact terms, may edit them
  inline (a revision clears both signatures), and press *Accept contract*. Each accept is
  timestamped on the agreement row (`founder_accepted_at` / `team_accepted_at`); when both
  are set the card flips to **Contract signed**, a `contract_signed` funnel event fires, and
  the waiting side gets pinged the moment the other signs. Signing is refused after funding
  (409) — signature always precedes money.
- **Conversion goal:** contract understood without leaving the chat; zero ambiguity about price.

### 5. Signature → funding (the conversion) — `ACTIVE` on completion
- **Founder's action:** funds the escrow: sends the agreement total to the deposit wallet, pastes
  the tx hash (`POST /api/payments`).
- **Operator's action:** verifies on-chain → payments `pending → paid`, agreement `funded`,
  conversation → `ACTIVE`. A wrong amount is rejected back to `scheduled` with a clear reason.
- **System:** system message announces start; tasks become actionable.
- **Conversion goal:** fund without leaving the journey; every rejection message tells the founder
  exactly what to do next.

### 6. Delivery → release (Founder + Operator) — `COMPLETED`
- **Operator:** tasks move `TODO → IN_PROGRESS → REVIEW` (staff powers, H2).
- **Founder:** approves delivered work (REVIEW → DONE once the project is accepted/active) —
  funnel `milestone_completed`; staff release that payment (`paid → released`).
- **System:** repeats per milestone until `COMPLETED`.

## Every role at a glance

| Stage | Visitor | Founder | AI | Operator |
| --- | --- | --- | --- | --- |
| 0 Landing | types first message | — | — | — |
| 1 Discovery | — | describes, sends for review | structures brief, drafts schedule | — |
| 2 Pickup | — | sees the team arrive | announces join | opens + joins chat |
| 3 Proposal | — | answers the card | posts the system line | writes proposal |
| 4 Contract | — | reads / (target) edits + accepts | posts agreement line | (target) edits + accepts |
| 5 Funding | — | funds + pastes hash | confirms in chat | verifies on-chain |
| 6 Delivery | — | approves work | tracks funnel | delivers + releases |

## Gaps that block the journey (the roadmap, in order)

1. ~~**Contract card with two-sided edit + accept** (stage 4 target)~~ — **built** (2026-09-28):
   the agreement card in the chat now shows the contract text, both signature badges, inline
   *Edit terms* (clears both signatures) and per-side *Accept contract*, with a server-side
   409 before funding, a `contract_signed` funnel event, and pings to the waiting side.
   Requires `supabase/migrations/0013_contract_signature.sql` — until it is applied the card
   stays read-only by design.
2. ~~**Brief lock UX**~~ — **built** (2026-09-28): soft lock. The review card shows brief
   completeness + a waiting bar sits above the composer ("Brief with the team — waiting for
   review"); the handoff fires once (server 409 on re-send, client notice), chat stays open
   so context keeps flowing.
3. **Beta banner** — **built** (2026-09-28): "Open beta · Real specialists are online" strip
   on landing, chat, and every app page.
4. **Notification coverage** — Telegram/Discord/email at stage transitions (invite email live;
   Telegram link works via paste-code; contract-signed and contract-accepted pings live;
   proposal/funding pings live; **email stage templates pending**).
5. **Developer discovery** — when a project reaches `READY_FOR_REVIEW`, notify specialists so
   proposals happen fast (stage 2 → 3 latency).
6. ~~**Post-login resume**~~ — **built** (2026-09-28): the hero's typed idea survives the Google
   redirect via `sessionStorage` and lands prefilled in the chat composer.
