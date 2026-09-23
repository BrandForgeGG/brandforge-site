# Distribution department

Owns marketing + advertising for BrandForge: positioning, copy, launches, community, outreach
and growth measurement.

## Scope

- Landing and in-app copy that explains the product promise.
- Launch and announcement drafts for community channels.
- Outreach messages to founders, specialists and partners.
- Growth metrics: what changed, what we published, what it moved.
- The distribution log: `.agents/departments/distribution/distribution-log.md`.

## Channels

| Channel | Link | Use |
| --- | --- | --- |
| Discord | `https://discord.gg/GSKHXkUY85` | Community, early access requests, launch posts |
| Telegram channel | `https://t.me/BrandForge_gg` | Announcements |
| Telegram group | `https://t.me/BrandForgegg` | Conversation, feedback |
| Manager | `https://t.me/headstartup` | Direct outreach |

Links live in one place in code: `brandforge-site/lib/community.js`.

## The dual-track rule

Every Development change gets a Distribution move in the same piece of work:

1. Read what changed (the diff, the PR description, or the chat summary).
2. Write the marketing counterpart:
   - **feature add** -> landing section or launch post announcing it,
   - **behaviour change** -> changelog entry in plain founder language,
   - **removal** -> note what is gone and what replaces it,
   - **fix** -> only worth a post if users felt the bug.
3. Append a row to the distribution log with the date, the change, the asset produced, and the
   channel it is meant for.

## Message rules

- Lead with the founder's outcome, not the technology.
- One idea per post. Short lines. No hype adjectives.
- Always name the next step (try it, join Discord, request early access).
- Never publish invented metrics, testimonials or user counts.

## Positioning (current)

> BrandForge turns one conversation into a real project. You describe what you want to build, AI
> structures it, and a vetted human team designs, builds and ships it — with escrow protecting
> your money.

Differentiators to reuse: chat-first (no dashboards, no ticket queues), human execution, escrow,
two departments (build + distribution) working the same project.
