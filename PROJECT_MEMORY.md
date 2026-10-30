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
  game modal, per-level toolbars (Beginner 4 buttons, Level 1-3 six). Level keys: live =
  `"Level 1".."Level 4"` (label remapped); local master = `beginner`, `level-1..3` (⏳ A below).
- The Next.js/Capacitor rebuild is out of scope (`PLATFORM_ROADMAP.md`).

## ⏳ In-progress work

- **TPS requests (10/20 meeting), 5 items** — review `docs/superpowers/specs/2026-10-22-tps-requests-review.md`
  (errata, recommendations, PM decisions §6) + plan `docs/superpowers/plans/2026-10-22-tps-requests-plan.md`.
  - **Phase 1, 2A, 2B — live** (`b6bb29e`, `1167b85`..`00f4bad`; detail in the archive): game URLs in
    weekday slots, shared board files + exact pixel baseline, student page = one book (70 QR, static
    covers). **iPhone real-device check is the user's.**
  - **Phase 3A — SQL live (`2026-10-29`), client NOT pushed** (`2026-10-23`..`24`): SQL 1 = `migration.sql`
    "LMS (Phase 3A)" block + `supabase/lms/` (precheck, verify, run order), `npm run test:sql`; 3.2 login
    client (`lms_login`, branch choice, `cra_lms`, fetch wrapper adds `x-lms-token`, grade-3 block gone).
    Decisions → review §4.9, tasks → plan 3.1/3.2. **Next:** 3.3~3.5 (3.5 adds: live-only `members.profile`,
    old admin RPCs' PUBLIC execute). Phase 4 (R4) **cancelled** → B.
- **A levels + B teacher resources (`2026-10-29`)** — design
  `docs/superpowers/specs/2026-10-29-levels-teacher-resources-design.md`. **Code NOT live** (`5ab7d30` A,
  `54bd131` + `87e98f4` B, `fbbbbaa` .gitignore, `01f682b` M1 15 s); B's SQL ran with 3A.
  **3A ops done `2026-10-30`** (`supabase/lms/README.md`; a live-only `create_member` overload dropped).
  Next = PM "푸시" → 3A only: `git push origin fe991f8:master` (design doc "최종 운영 순서").
  A: one `LEVELS` table, keys `beginner`/`level-1..3`, old hashes rewritten, old DB keys
  still read. **`supabase/levels/01-rename.sql` only AFTER the A push.** B: '교사 자료실' (admin + LMS
  role 1/2) → month page in resources mode → private bucket; download via Edge Function
  `teacher-resource-download` (15 s fixed, 30/day; user deploys — `supabase/functions/README.md`).
- **User:** Naver QR 70 codes (`qr/qr-list.csv`); TPS songs to its own Vimeo (`vimeo.com/<id>` in admin).
- **Home hero cast** — stage 1 rejected by the PM on real devices (`2026-10-21`); only on the local
  branch `hero-cast-v1` (`1e7f059`, `dc27a21`, not on origin). Stage 2 = AI video, awaiting a PM brief.

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
