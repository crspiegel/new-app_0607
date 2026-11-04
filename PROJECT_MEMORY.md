# Project Memory — Resume State

**Read first each session**, then the top of `.claude/WORKLOG.md` (local only). Live status only (under 6,000).
History, old backlog, open questions → `docs/PROJECT_MEMORY-archive.md`. Doc map → `CLAUDE.md`, gotchas → `NOTES.md`.

## Snapshot

- Kindergarten English learning **static SPA** (Cambridge Reading Adventures). HTML/CSS/Vanilla JS,
  Vite for dev only, Playwright smoke tests. Core files: `index.html`, `styles.css`, `app.js`
  (+ `background-editor.js`, `hero-banner.js`, `supabase-config.js`).
- Backend = **Supabase** (Auth + Postgres + Storage) via the CDN UMD build — no framework, no build.
  Reads public (anon key), **writes admin-only via RLS** (`is_admin()`).
- Live: admin content manager, login + 3 member grades, background editor, hero banner carousel,
  game modal, per-level toolbars (Beginner 4 buttons, Level 1-3 six). Level keys = `beginner`, `level-1..3` in
  code **and DB** (`01-rename` live `2026-10-31`, CHECK on both tables); old-key compat reads go in SQL 2 (3.5).
- The Next.js/Capacitor rebuild is out of scope (`PLATFORM_ROADMAP.md`).

## ⏳ In-progress work

Live = **`a4da52b`** (`2026-11-02`: 3B `4a9b23d`, D63, D64+D65 — live SQL first, then the push). Older: archive.

- **Resource board (header Teacher button) + teacher-resources on/off** — brief `2026-11-03`: SQL + Edge = one
  local commit; screens uncommitted until the user's feedback.

- **TPS requests (10/20 meeting)** — review `docs/superpowers/specs/2026-10-22-tps-requests-review.md`,
  plan `docs/superpowers/plans/2026-10-22-tps-requests-plan.md`. Phase 1, 2A, 2B, 3A, **3B live**: "LMS (Phase 3B)"
  block — pk `member_id`, old admin RPCs dropped, scoped RPCs (D41–D56); `00-precheck-3b.sql`, `verify-3b.sql` (347);
  3.3 admin screens (`lms-admin.js`), 3.4 Excel (`lms-bulk.js`, SheetJS in `vendor/`). Live account check done.
  3.5 next: levels CHECKs into `migration.sql` (D37), `members.profile`, sequence grants. Phase 4 (R4) **cancelled** → B.
- **A levels + B teacher resources** — design `docs/superpowers/specs/2026-10-29-levels-teacher-resources-design.md`.
  - A **done**: levels rename live `2026-10-31` (55 rows, all new keys); CHECKs `content_pages_level_key`,
    `page_backgrounds_level_key`; admin saves allowed again.
  - B live: '교사 자료실' (admin + LMS role 1/2) → private bucket; download via Edge Function
    `teacher-resource-download` (15 s, 30/day; `supabase/functions/README.md`). D58 cards, D63, **D64·D65 live
    `2026-11-02`** (a slot = a file OR a Google Drive file ID; 월간 3~12월 + 3 new kinds = 62 slots, 2-column cards,
    month panel, admin level tabs).
- **Student page header fix** live (`8176966`), PC check done 10/31.
- **User:** iPhone real-device check (2B); Naver QR 70 codes (`qr/qr-list.csv`); TPS songs to its own
  Vimeo (`vimeo.com/<id>` in admin).
- **Home hero cast** stage 2 (AI video) awaits a PM brief; stage 1 lives only on the local branch
  `hero-cast-v1` (not on origin) — don't delete it.

## PM decisions (`2026-10-31`, D36–D40)

- **D36** Live SQL that can't go in a CTE (ALTER etc.) = **one `DO` block**: any failure → `raise exception`
  undoes all; re-run is safe (skips what exists). User guide: "click inside the editor to clear the
  selection before Run" + how to answer Supabase's "destructive operation" prompt.
- **D37** levels rename done (above). 3.5 merges the same CHECKs into `migration.sql`: same names, skip if present.
- **D38** Supabase Pro (+ Spend Cap): the user's decision; the user switches in the dashboard — no worker part.
- **D39** After a push the PM may pre-approve live GETs: only static files changed in that push and served
  live, byte comparison, max 5. Every other live request = per-request approval.
- **D40** Student QR checks use the real QR address first: `play.tps-education.com/q/...`.

## Standing rules

- Supabase Auth **sign-ups are off on purpose** (`2026-10-06`, bot accounts) — don't re-enable.
  Admins: dashboard Add user + `public.admins` row; admin ids contain `@`.
- Supabase is on the **Free plan**; the egress **grace period is spent** — the next overage is an
  immediate 402. Local dev is offline by default (`craDevLive(true)` to go live); QA stubs Storage.

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
