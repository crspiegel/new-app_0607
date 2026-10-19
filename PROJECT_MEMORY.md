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

- **Beginner QR codes + student page (`play.html`)** — live since `2026-10-19`. **Option ① chosen**
  (`qrtest.tps-education.com` played the publisher Vimeo on PC/iPhone/Android): student host
  `play.tps-education.com` on this Vercel project, publisher Vimeo embedded directly there (strategy
  by host; `www.cambridgereading.com/q/…` keeps framing the publisher page). Code done, **not
  committed** (stage 4 brief). Next: commit/push → add the domain (CNAME) → live checks → Naver QR
  with `qr/beginner-qr-list.csv` (now `play.tps-education.com`). Test project `vimeo-domain-test` +
  `qrtest` domain stay until the live domain is checked. Docs: `docs/superpowers/specs|plans/2026-10-19-qr-student-play-page-*`.

## Recent state (newest first)

- `2026-10-19` (**deployed**) — QR student page: `/q/<lv>/<month>/<slot>` → `play.html`, one REST
  read, 0 Storage, tap-to-play, (B) month list + `?solo=1`; shared data in `video-source.js`.
  Beginner fill 102/240. Live-checked (200 + noindex, no teacher markup under `/q/`, `/docs/` 404).
  `trailingSlash: false` so `/q/.../` 308s to the no-slash URL (`16be3c5`, live-checked). Gotchas: `NOTES.md` "QR 학생 페이지".
  Full screen (⛶, `0670666`, live): Fullscreen API on `#playStage` where supported, else CSS pseudo
  full screen (`body.play-fullscreen`, iPhone); ✕/Esc exits. Real devices not checked yet.
- Older entries (captions OFF, harness setup, publisher pages, egress fixes) →
  `docs/PROJECT_MEMORY-archive.md` (top).

## Standing rules

- Supabase Auth **sign-ups are off on purpose** (`2026-10-06`, bot accounts) — don't re-enable.
  Admins: dashboard Add user + `public.admins` row; admin ids contain `@`.
- Supabase egress **grace period is spent** — the next overage is an immediate 402. Local dev is
  offline by default (`craDevLive(true)` to go live); QA stubs Storage.

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
- **Student QR page:** `/q/<lv>/<month>/<slot>` → `play.html` (`vercel.json` rewrite,
  `trailingSlash: false`); query fallback `play.html?l=b&m=3&s=w1-mon`. Printed QR → Naver QR → here.
  Host `play.tps-education.com` (pending DNS): only the student page (`/`, `/index.html` → `/q`).
- **Supabase:** project `jguuexcgyvyljbcqfpib`; anon key in `supabase-config.js` (public by design).
  Provisioning record: `SUPABASE_SETUP.md`, `supabase/migration.sql`.
- Storage originals (outside repo): see `NOTES.md` (backup folder is gone; two source folders remain).

## Backlog

1. Decide whether V3 (Mon-Fri calendar) should replace the default `#content/...` route.
2. Responsive + accessibility QA pass.
3. 1366×768-and-below no-scroll on 페이지2 (footer/weekday spacing) — only if requested.
4. Font-loading FOUT improvement (last).
5. (확인 필요) `tests/smoke.spec.js:1419` "editor: 영상 URL input…" intermittent fail — tablet only,
   `#bgEditorPanel` stayed hidden after the FAB click; passed on rerun (`2026-10-19`). Not fixed.

## Open questions (확인 필요 — carried over, may be stale)

- Delete `contentScreenV2`, or keep it as reference?
- `2026-08-05` admin background re-placement (Beginner/March band 7px overlap; Level 1/2 April
  frame elements) — done by the user?

## Resume checklist

1. Check "⏳ In-progress work" above, then the top of `.claude/WORKLOG.md`.
2. Skim `NOTES.md` for gotchas and `PRODUCT_SPEC.md` / `DESIGN.md` for the task's constraints.
3. Session end ("세션 종료" / `/session-close`): WORKLOG entry + update this file + new gotchas in
   `NOTES.md`. No commit/push unless the user asks.
