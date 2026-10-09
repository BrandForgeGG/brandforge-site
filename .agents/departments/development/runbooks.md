# BrandForge runbooks

Plain steps for the jobs that otherwise live in one person's head. Written 2026-10-09 from how the
system actually runs today. If a step stops being true, fix it here in the same change.

Secrets never go in the repo. They live in Vercel (Production) and `brandforge-site/.env.local`.
`vercel env pull` and `vercel env run` return the literal string `[SENSITIVE]` for variables stored as
Secret, so the CLI can write them but never read them back; values live in the Vercel dashboard.

## 1. Deploy

1. `cd brandforge-site`
2. `npm test`, `npx tsc --noEmit`, `npx eslint <changed files>` (all green).
3. Commit with explicit paths, then push from the repo root:
   `git -c credential.helper= -c "credential.helper=!C:/Users/user/AppData/Local/Programs/gh/bin/gh.exe auth git-credential" push origin main`
   (plain `git push` fails with "Repository not found": no stored https credentials; `gh` is the login.)
4. `vercel --prod --yes` from `brandforge-site/`. Production is `brandforge.gg`.
5. Check: open `/`, `/work`, and the page you changed. For API changes, probe the route.
6. Add one row to `.agents/departments/distribution/distribution-log.md`.

Git-integration builds on Vercel show "Error". That is the repo-root mismatch (the app is in the
`brandforge-site/` folder) and it is harmless because CLI deploys are the real path. To silence it, set
the project's Ignored Build Step to `exit 0` in Vercel project settings (Git section). Do not change the
Root Directory: CLI deploys run from inside `brandforge-site/` and would double the path.

## 2. Roll back a bad deploy

1. `vercel ls` and find the last good production deployment.
2. `vercel rollback <deployment-url>` (or "Promote" it in the dashboard).
3. Fix forward on `main`, then deploy again.

## 3. Database changes

- Migrations live in `brandforge-site/supabase/migrations/`, numbered. Apply with the Supabase
  `apply_migration` tool (project `ylyyrwppzqjnxpskvqor`) or paste into the SQL editor.
- New tables: RLS on, **no policies**, access through the service role in `lib/project-db.ts` only.
- UPDATE denials from RLS are silent (0 rows), not errors. Probe the row, not the error.
- Applied: 0001 to 0030 (0030 = `specialist_profiles`).

## 4. Telegram bot (@brandforge_bot)

- Token: `TELEGRAM_BOT_TOKEN`. Webhook URL: `https://brandforge.gg/api/telegram-webhook`.
  Header secret: `TELEGRAM_LINK_SECRET` (sent as `x-telegram-bot-api-secret-token`).
- The webhook must allow `message` and `callback_query` (buttons).
- Re-register the webhook (token and secret from the dashboard, never printed):
  `POST https://api.telegram.org/bot<TOKEN>/setWebhook` with
  `{"url":"https://brandforge.gg/api/telegram-webhook","secret_token":"<LINK_SECRET>","allowed_updates":["message","callback_query"]}`
- Check state: `getWebhookInfo` (look at `last_error_message` and `pending_update_count`).
- Command menu: only `/start` (`setMyCommands`). Everything else is buttons.
- Test users: put your own Telegram id in `TEST_TELEGRAM_IDS` so test chats never count as real.
- Channel announcements: `TELEGRAM_ANNOUNCE_CHAT_ID=@BrandForge_gg`. The bot must be a channel admin
  with permission to post. The daily stats line stays silent on a quiet day by design.
- Bot answers need a working AI key (`OPENROUTER_API_KEY`) and the same daily limits as the web.

## 5. Discord

- Webhook channels (ops, live feed, dev log, public changelog): env vars `DISCORD_OPS_<KIND>_URL`,
  `DISCORD_OPS_URL`, `DISCORD_LIVE_URL`, `DISCORD_DEVLOG_URL`, `DISCORD_PUBLIC_CHANGELOG_URL`,
  `DISCORD_WEBHOOK_URL` (briefs for specialists), `DISCORD_MILESTONE_URL`, `DISCORD_SHOWCASE_URL`.
  A missing variable is a logged no-op, never an error.
- Bot ("Execution Assistant"): `DISCORD_BOT_TOKEN`, used for link buttons. It has no Message Content
  intent, so read channels back through the webhook's own token, not the bot.
- Bot setup lives in the admin dashboard, **Discord bot** section: it shows what is done and what is
  missing, registers the command with one button, and gives the install link.
  1. Developer Portal, **General Information**: copy the **Public Key** into Vercel as
     `DISCORD_PUBLIC_KEY` and redeploy.
  2. Developer Portal, **General Information**: set **Interactions Endpoint URL** to
     `https://brandforge.gg/api/discord/interactions` and save (it only saves if the endpoint answers).
  3. Admin dashboard, **Discord bot**: press **Register the command**.
  4. Install the bot with the dashboard's install link (scopes `bot` and `applications.commands`).
     Without the commands scope the command never shows up in the picker. Installing again is safe.
  5. In the server, type `/brandforge`: a menu of buttons opens; each button asks one question in a
     popup form; answers are private to the person who asked and carry follow-up buttons.
- Online status: a bot shows online only while something holds a gateway connection. The website
  cannot, so run `scripts/discord-presence.js` on any always-on machine:
  `DISCORD_BOT_TOKEN=... node scripts/discord-presence.js` (Node 22+; keep it alive with pm2, systemd
  or a Docker restart policy). It reads no messages and sends nothing. Commands work without it.

## 6. Scheduled jobs (Vercel crons, all guarded by `CRON_SECRET`)

| Path | When (UTC) | What |
| --- | --- | --- |
| `/api/cron/live-stats` | 09:00 | One line of real numbers to Discord and the Telegram channel (silent on a quiet day) |
| `/api/cron/marketing` | 10:00 | Publishes due queued posts |
| `/api/cron/jobs` | 11:00 | Background jobs worker |
| `/api/cron/peer-contracts` | 12:00 | Auto-releases milestones with no objection after 48 hours |
| `/api/cron/retention` | 03:00 | Deletes guest chats quiet for 90 days (and their files) |

Hobby plan: daily at most. No `CRON_SECRET` returns 503, a wrong one 401.

## 7. AI model and spend

- Answers use the best routable model from `lib/model-catalog.js` (Claude Sonnet 5.5 at the time of
  writing). Pin one with `OPENROUTER_MODEL_QUALITY`; background steps use `OPENROUTER_MODEL`
  (default `openai/gpt-4o-mini`). The admin dashboard shows models by provider and what is in use.
- If a premium model refuses (credit, access, retired), the chat retries once with the standard model
  and logs `Answer model ... refused`.
- Limits (env, all optional): `AI_USER_DAILY_LIMIT` (150), `AI_DAILY_ALERT` (400),
  `AI_DAILY_HARD_CAP` (1500), `GUEST_CHAT_MESSAGE_LIMIT` (15). Staff get an ops message at the alert
  level and again at the ceiling; at the ceiling visitors are paused until midnight UTC. To reopen,
  raise `AI_DAILY_HARD_CAP` and redeploy.
- Check OpenRouter credit if answers fail across the board.

## 8. Specialists

- Applications: `/apply` (anyone), review in the admin dashboard, **Accept** switches on access.
- Invite by email: admin dashboard, **Invite a specialist**. Existing accounts get access now; new
  addresses get it the first time they sign in with that email.
- Profiles: specialists edit at `/specialists/me`. Listed publicly only if they tick the box, and only
  while they still hold specialist access.

## 9. Disputes and payouts (peer contracts)

- The payer can raise an issue on submitted work: the milestone freezes (no auto-release) and the
  money stays held. The delivering side can answer once. Staff resolve in the admin dashboard:
  **release** or **refund**. Funding and payouts are recorded by hand in the dashboard today.
- Staff pings go to the contracts ops channel (there is no separate `#ops-disputes` webhook yet).

## 10. Recovery checklist when "nothing works"

1. `https://brandforge.gg/api/health` and a page load.
2. Vercel dashboard: latest deployment status and runtime logs (retention is short, about 30 minutes).
3. Supabase: project healthy, `get_advisors` for security notes.
4. OpenRouter: key valid and credit left.
5. Resend: sending domain verified (`hello@brandforge.gg`), API key send-only.
6. Roll back (section 2) if the last deploy is the cause.
