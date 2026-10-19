# Project Memory — Resume State

**Read this first when starting a new session.** Short live status only (keep under ~6,000 chars).
Full history, old session logs and design-change log → `docs/PROJECT_MEMORY-archive.md`.
(Document map → `CLAUDE.md`. Engineering gotchas → `NOTES.md`. Session detail → `.claude/WORKLOG.md`, local only.)

## Snapshot

- Kindergarten English learning **static SPA** (Cambridge Reading Adventures). HTML/CSS/Vanilla JS,
  Vite for dev only, Playwright smoke tests. Core files: `index.html`, `styles.css`, `app.js`
  (+ `background-editor.js`, `hero-banner.js`, `supabase-config.js`).
- Backend = **Supabase** (Auth + Postgres + Storage) via the CDN UMD build — no framework, no build.
  Reads public (anon key), **writes admin-only via RLS** (`is_admin()`).
- Live: admin content manager, login + 3 member grades, background editor, hero banner carousel,
  game modal, per-level toolbars (Beginner 4 buttons, Level 1-3 six). Level labels are remapped for
  display only (internal keys stay `"Level 1".."Level 4"`).
- The Next.js/Capacitor rebuild is out of scope (`PLATFORM_ROADMAP.md`).

## ⏳ In-progress work

None. (Last item — YouTube captions forced OFF — was verified by the user and deployed on
`2026-10-19`; see Recent state.)

## Recent state (newest first)

- `2026-10-19` — **YouTube captions forced OFF: user-verified (10/19), committed and deployed.**
  `disableYouTubeCaptions(yt)` (undocumented `unloadModule("captions"/"cc")`, try/catch) runs from
  `onReady`, `onStateChange` PLAYING and `onApiChange` — keep all three. Gotcha in `NOTES.md`.

- `2026-10-19` `f9fa6fc` / `5b515db` (deployed) — harness setup: `.claude/verify.json` (Stop hook runs
  `npm run check`), CLAUDE.md Superpowers + session-end sections, this file shortened (history →
  `docs/PROJECT_MEMORY-archive.md`). `.vercelignore` now excludes `docs` and `.gitattributes` (they
  were publicly served); verified 404 on both live domains.

- `2026-10-12` `024a18d` — publisher-page Vimeo URLs (domain-restricted) open the page itself in the
  video window (`mountExternalPage`).
- `2026-10-06` — Supabase Auth **new sign-ups disabled on purpose** (bot accounts found and deleted).
  Do not re-enable. Admins are created in the dashboard (Add user) + a `public.admins` row; admin
  login ids must contain `@`.
- `2026-08-29` `32e7726` / `5139e7e` — Supabase egress fixes deployed: Storage stub in QA, banner lazy
  loading, upload WebP compression, **local dev offline by default** (`craDevLive(true)` to go live),
  QA budget guard specs. Storage recompressed 24.55MB → 8.90MB served. Account transfer: **not doing**
  (user decision 8/29). Grace period is used up — the next quota breach means an immediate 402.

## How we work

1. Make the requested change locally; verify (`npm.cmd run check` is auto-run by the Stop hook via
   `.claude/verify.json`; screenshot/computed values for visual changes).
2. Report changed files + verification. **Commit/deploy only when the user asks.**
3. Before committing: `npm.cmd run qa` (checks + Playwright) → commit → `git push` (= production deploy).
   Then verify the live site.

- **The admin mode must always mirror the user screen** — every user-visible content element needs a
  matching admin editor (`TOOLBAR_BUTTONS`, `renderAdminBoard()`, `slotLabel()`).
- Keep approved visuals exactly as-is unless a change is requested.
- Known tool issue: `scripts/run-playwright.mjs` hardcodes port 5173 — stop `npm.cmd run dev` before `qa`.

## Infrastructure

- **GitHub:** https://github.com/crspiegel/new-app_0607 (**public**, branch `master`).
- **Vercel:** project `new-app_0607`, auto production deploy on push. **Static, no build.**
- **Accounts:** GitHub + Vercel = `crspiegel`. The Claude Code Vercel plugin is on a different account —
  do not use it here (see `CLAUDE.md`).
- **Domain:** `cambridgereading.com` (Gabia DNS records) — `www` primary, apex → `www` (308);
  `new-app0607.vercel.app` still works.
- **Supabase:** project `jguuexcgyvyljbcqfpib`; anon key in `supabase-config.js` (public by design).
  Provisioning record: `SUPABASE_SETUP.md`, `supabase/migration.sql`.
- Storage originals (outside repo): the `_storage-backup-20260829` folder went to the Recycle Bin on
  `2026-10-19`; identical originals live in `메인 히어로 섹션 배너_tps제공\` and
  `피드백_0717_레벨별 백그라운드 이미지 요청\LEVEL 1~3\` (see `NOTES.md`).

## Backlog

1. Decide whether V3 (Mon-Fri calendar) should replace the default `#content/...` route.
2. Responsive + accessibility QA pass.
3. 1366×768-and-below no-scroll on 페이지2 (footer/weekday spacing) — only if requested.
4. Font-loading FOUT improvement (last).

## Open questions (확인 필요 — carried over, may be stale)

- Delete `contentScreenV2`, or keep it as reference?
- `2026-08-05` admin background re-placement (Beginner/March band 7px overlap; Level 1/2 April
  frame elements) — done by the user?

## Resume checklist

1. Check "⏳ In-progress work" above, then the top of `.claude/WORKLOG.md`.
2. Skim `NOTES.md` for gotchas and `PRODUCT_SPEC.md` / `DESIGN.md` for the task's constraints.
3. Session end ("세션 종료" / `/session-close`): WORKLOG entry + update this file + new gotchas in
   `NOTES.md`. No commit/push unless the user asks.
