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

Live = **`b3130e5`** (`2026-11-11`: D89; D88 `628b8fc`, below). Older: archive.

- **교사자료실 게시판** (briefs `11-03`~`11-07`): live, 게시판 켬, 레벨별 자료실 켜짐. 2차-1 · 2차-2
  (글꼴 `board_font_ko/en`, 로그인 끝남 안내) · 이름 변경 '레벨별 자료실' · D77 나눔스퀘어라운드(굵게 EB) live. NOTES "수정 2차"~.
  D81 ZIP · D82 하루 1,000 · D85 목록 정돈 live `11/09` (archive).
- **뒤로·앞으로** D87 관리자 주소 · D88 사용자 화면(영상·게임 창 뒤로 = 창만 닫힘) · D89 관리자 작은 창 — live `11/09`~`11/11`
  (archive; spec "Admin / Site Addresses", NOTES).
- **학생 활동 기록 D90** (local `11/13`, 기록만) 학생(role 3)의 로그인·그날 첫 접속·영상/게임 창(재생 초·90% = 끝까지·게임 보인 초)
  → 표 `student_activity`(학생 1명 하루 200줄까지). 운영 SQL 대기. 보기 화면 = D91(시안 먼저). NOTES "학생 활동 기록".

- **TPS requests (10/20 meeting)** — review · plan `docs/superpowers/{specs,plans}/2026-10-22-tps-requests-*.md`.
  Phase 1, 2A, 2B, 3A, **3B live**: "LMS (Phase 3B)"
  block (pk `member_id`, scoped RPCs D41–D56, `verify-3b.sql` 347); 3.3 admin screens (`lms-admin.js`), 3.4 Excel
  (`lms-bulk.js`, SheetJS in `vendor/`); live account check done.
  3.5 next: levels CHECKs into `migration.sql` (D37), `members.profile`, sequence grants. Phase 4 (R4) **cancelled** → B.
- **A levels + B teacher resources** — design `docs/superpowers/specs/2026-10-29-levels-teacher-resources-design.md`.
  A done (Snapshot; archive).
  - B live: '레벨별 자료실' (옛 '교사 자료실'; admin + LMS role 1/2) → private bucket; download via Edge Function
    `teacher-resource-download` (15 s, 1,000/day D82; `supabase/functions/README.md`). D58 cards, D63, **D64·D65 live
    `2026-11-02`** (a slot = a file OR a Google Drive file ID; 월간 3~12월 + 3 new kinds = 62 slots, 2-column cards,
    month panel, admin level tabs).
- **User:** iPhone real-device check (2B); Naver QR 70 codes (`qr/qr-list.csv`); TPS songs → own Vimeo.
- **Home hero cast** stage 2 awaits a PM brief; local branch `hero-cast-v1` (no origin) — keep.

## PM decisions (`2026-10-31`, D36–D40)

- **D36** Live SQL = **one `DO` block** (a failure undoes all; re-run safe). Guide: click inside the editor
  before Run; answer Supabase's "destructive operation" prompt.
- **D37** 3.5 merges the levels CHECKs into `migration.sql`: same names, skip if present.
- **D39** After a push the PM may pre-approve live GETs: only static files changed in that push and served
  live, byte comparison, max 5. Every other live request = per-request approval.
- **D40** Student QR checks use the real QR address first: `play.tps-education.com/q/...`.

## Standing rules

- Supabase Auth **sign-ups are off on purpose** (`2026-10-06`, bot accounts) — don't re-enable.
  Admins: dashboard Add user + `public.admins` row; admin ids contain `@`.
- Supabase is on the **Pro plan** (`2026-11-11`, spend cap on). The usage savers stay: 10 MB a file, Drive
  links for big files, 1,000 downloads a day. Local dev is offline by default (`craDevLive(true)`); QA stubs Storage.

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
- Storage originals (outside repo): see `NOTES.md`.
