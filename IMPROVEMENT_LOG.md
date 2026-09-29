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

### C2 — Named controls + live-region feedback (done)
- aria-labels on composer, proposal title/approach, invite email, funding-reject reason,
  reply-dismiss; MessageActions reveal on focus with named reaction pills (both branches);
  role=alert/role=status on auth/apply/admin/settings banners. No visual change.
- Verified: 245/245 tests, tsc, eslint, build green. Commit `a11y: named controls and
  live-region feedback`. (Note: first build attempt ran in the repo root by mistake;
  re-ran in brandforge-site — green.)

### C3 — Menu semantics + Escape + audit correction (done)
- Rail account menu is a real `<button>` (valid span content, platform keyboard handling);
  Escape closes it. Panel drawer closes on Escape back to chat.
- Audit correction: claimed "zero reduced-motion handling" is wrong — `globals.css` already
  ships a `prefers-reduced-motion` block. Verified, untouched.
- Verified: 245/245 tests, tsc, eslint, build green. Commit `a11y: real menu button, escape dismiss, audit correction`.

### C4 — Perf micro-batch (done)
- Rail polls skip hidden tabs; task progress memoized; images lazy + async decode;
  collapsed chips use shared initialsFor. No visible change.
- Verified: 245/245 tests, tsc, eslint (one unused-disable caught and removed), build
  green. Commit `perf: memoize progress, pause hidden-tab polls, lazy images, shared initials`.
- Audit note: the "summarizeTaskProgress twice per render" claim was overstated — one call
  site is event-driven (/progress command); memoized the per-render one.

### C5 — Dead code + one dedupe (done)
- Deleted `isEmailConfigured` (zero importers; verified by grep).
- `uploadConversationAttachment` uses the tested `safeDownloadName` instead of its own
  regex copy (behavior identical, `|| 'attachment'` fallback kept).
- Skipped: test-only allowlist predicates (deleting breaks their tests; harmless),
  money()/clip() unification (6-file blast radius — daylight work), public PNG deletion
  (assets may still need uploading — founder call).
- Verified: 245/245 tests, tsc, eslint, build green. Commit `chore: drop dead email export, share filename sanitizer`.

### C6 — Landing copy (done)
- Hero sub rewritten in two plain sentences (niche role list moved to services where it
  belongs, em dash removed); two vague suggestion chips replaced with specific briefs that
  model good input; CTA `Start →` is now `Start building`; hero textarea named for
  screen readers. Steps/services sections left alone (rewritten days ago, still accurate).
- Verified: 245/245 tests, tsc, eslint, build green.
