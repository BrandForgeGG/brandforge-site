# Production probes (daylight only)

Manual verification harness against **production** (`https://brandforge.gg`).
Reads secrets from `brandforge-site/.env.local` (gitignored) at runtime — nothing
secret is stored in these files.

- `prod-auth-probe2.js` — auth matrix: fresh cookie 200, expired cookie rotates,
  no cookie 401, landing 200. Creates and deletes its own probe users.
- `operator-pipeline-e2e.js` — full operator pipeline with probe founder + operator:
  request-review → proposal → pre-accept 403s → counter round → accept → promote →
  auto-join → post-accept writes. Cleans up every row it creates.

Rules: run only when a human is around (both scripts create real rows, send real
Telegram/email/Discord notifications, and delete probe users afterwards).
Never add these to CI.
