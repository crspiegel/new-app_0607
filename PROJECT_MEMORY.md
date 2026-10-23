# Project Memory — Resume State

**Read first each session.** Live status only (keep under 6,000 chars). History → `docs/PROJECT_MEMORY-archive.md`.
Doc map → `CLAUDE.md`, gotchas → `NOTES.md`, session detail → `.claude/WORKLOG.md` (local only).

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

- **TPS requests (10/20 meeting), 5 items** — review `docs/superpowers/specs/2026-10-22-tps-requests-review.md`
  (errata, recommendations, PM decisions §6) + plan `docs/superpowers/plans/2026-10-22-tps-requests-plan.md`.
  - **Phase 1 R1 — live** (`b6bb29e`, `2026-10-22`): a `GAME_HOSTS` URL in a weekday slot opens the
    game modal / "Let's play!" like the toolbar Game button.
  - **Phase 2A — live** (`1167b85`..`efeaf10`): `BOOK_LAYOUT` + book QR helpers, `board-view.js`
    (shared DOM builders), `board.css` (board rules out of `styles.css`, loaded first), page2 pixel
    baseline (`tests/board-visual.spec.js`, exact).
  - **Phase 2B — live** (`f513aa2`..`00f4bad`, curl-checked): student page = one book of the teacher
    board (`/q/<lv>/<month>/<book>`, 70 QR, overlay player, static covers `assets/covers` 70 files
    5.25 MB via `npm run covers:sync`), `qr/qr-list.csv` 70 rows. **iPhone real-device check is the
    user's** (weekday tap → Vimeo full screen, back closes the overlay). Gotchas: `NOTES.md` "학생 QR
    페이지 2세대", "페이지2 보드 공유 파일".
  - **Phase 3A — LMS SQL done locally, NOT run on the live DB** (`4356e19`, `2026-10-23`):
    `migration.sql` "LMS (Phase 3A)" block + `supabase/lms/` (precheck, verify, run order),
    `npm run test:sql`. Decisions → review §4.9, tasks → plan 3.1/3.2. **At stop 1** (PM review) → user
    runs the SQL → 3.2 login client → push only after the SQL. **Next:** 3.3~3.5, then Phase 4 (R4).
- **Naver QR registration (user):** 70 codes from `qr/qr-list.csv` (`play.tps-education.com`). TPS
  still to move its songs to its own Vimeo (`vimeo.com/<id>` in the admin screen).
- **Home hero cast** — stage 1 rejected by the PM on real devices (`2026-10-21`); only on the local
  branch `hero-cast-v1` (`1e7f059`, `dc27a21`, not on origin). Stage 2 = AI video, awaiting a PM brief.

## Recent state (newest first)

- `2026-10-19`..`2026-10-22` — QR student page v1 (`/q/<lv>/<month>/<slot>`, host
  `play.tps-education.com`, iPhone full screen) shipped, then superseded by the book-level v2 (above).

## Standing rules

- Supabase Auth **sign-ups are off on purpose** (`2026-10-06`, bot accounts) — don't re-enable.
  Admins: dashboard Add user + `public.admins` row; admin ids contain `@`.
- Supabase egress **grace period is spent** — the next overage is an immediate 402. Local dev is
  offline by default (`craDevLive(true)` to go live); QA stubs Storage.

## How we work

1. Change locally; verify (`npm.cmd run check` runs via the Stop hook, `.claude/verify.json`;
   screenshots/computed values for visual changes).
2. Report changed files + verification. **Commit/deploy only when the user asks.**
3. Before committing: `npm.cmd run qa` → commit → `git push` (= production deploy) → check the live site.

- **The admin mode must always mirror the user screen** — every user-visible content element needs a
  matching admin editor (`TOOLBAR_BUTTONS`, `renderAdminBoard()`, `slotLabel()`).
- Keep approved visuals exactly as-is unless a change is requested.
- Known tool issue: `scripts/run-playwright.mjs` hardcodes port 5173 — stop `npm.cmd run dev` before `qa`.

## Infrastructure

- **GitHub:** https://github.com/crspiegel/new-app_0607 (**public**, branch `master`).
- **Vercel:** project `new-app_0607`, auto production deploy on push. **Static, no build.**
- **Accounts:** GitHub + Vercel = `crspiegel`. The Claude Code Vercel plugin is another account — don't use it.
- **Domain:** `cambridgereading.com` (Gabia DNS records) — `www` primary, apex → `www` (308);
  `new-app0607.vercel.app` still works.
- **Student QR page:** `/q/<lv>/<month>/<book>` → `play.html` (`vercel.json` rewrite,
  `trailingSlash: false`); query fallback `play.html?l=b&m=3&b=1`. Printed QR → Naver QR → here.
  Host `play.tps-education.com`: only the student page (`/`, `/index.html` → `/q`).
- **Supabase:** project `jguuexcgyvyljbcqfpib`; anon key in `supabase-config.js` (public by design).
  Provisioning record: `SUPABASE_SETUP.md`, `supabase/migration.sql`.
- Storage originals (outside repo): see `NOTES.md` (backup folder is gone; two source folders remain).

## Backlog

1. V3 (Mon-Fri calendar) as the default `#content/...` route? 2. Responsive + a11y QA pass.
2. 1366×768-and-below no-scroll on 페이지2 (only if asked). 4. Font FOUT (last).
3. (확인 필요) `tests/smoke.spec.js` "editor: 영상 URL input…" intermittent (tablet) — not fixed.

## Open questions (확인 필요, may be stale)

- Delete `contentScreenV2`, or keep it? `2026-08-05` admin background re-placement — done?

## Resume checklist

1. Check "⏳ In-progress work" above, then the top of `.claude/WORKLOG.md`.
2. Skim `NOTES.md` for gotchas and `PRODUCT_SPEC.md` / `DESIGN.md` for the task's constraints.
3. Session end ("세션 종료" / `/session-close`): WORKLOG entry + update this file + new gotchas in
   `NOTES.md`. No commit/push unless the user asks.
