# Overnight improvement log — 2026-09-29

> Autonomous session. Branch: `auto/overnight-improvements` (local only — NOT pushed,
> NOT deployed). All verification is local (tests, tsc, eslint, build). No prod writes,
> no messages to real users, no secrets touched.

## Summary for the user

_To be written at handoff._

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
