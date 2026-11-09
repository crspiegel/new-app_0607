# Engineering Notes & Gotchas

Hard-won lessons and past mistakes on this project. **Read the relevant section before
similar work** so the same problems don't recur. Append to this as you learn more.

## Build & deploy

- **Do NOT use `vite build` for deployment.** Vite cannot bundle the non-module
  `<script src="app.js">` and silently drops `app.js` from `dist/` → a built deploy has no JS
  and broken navigation. The site ships as **plain static files, no build** via `vercel.json`
  (`framework: null`, `buildCommand: null`, `outputDirectory: "."`). Do not add a `build`
  script or let Vercel auto-detect Vite. (Vite is dev-server only.)
- `.vercelignore` keeps only the site public (`index.html`, `styles.css`, `app.js`, `assets/`,
  `vercel.json`); internal docs and dev tooling are excluded. New public asset → make sure
  it's not ignored. New internal doc → add it to `.vercelignore`.
- **`.vercelignore` is a deny-list, so a new folder is public by default.** `docs/` (Superpowers
  specs/plans) was served at `/docs/...` with HTTP 200 for months until `2026-10-19`; `.gitattributes`
  too. Both are now listed. When adding any new top-level file or folder that isn't site code, add it
  here, and after the deploy probe the live URL (`curl -o /dev/null -w '%{http_code}'`) to confirm 404.
- Deploy = Git: `git push` to `master` triggers Vercel auto-deploy to production. Manual
  fallback: `npx vercel --prod --yes`.

## Accounts & git credentials

- The correct account for **both GitHub and Vercel** is **`crspiegel` / crspiegel@gmail.com**.
  Earlier sessions logged into the wrong accounts (`wechange2023-5631` on Vercel,
  `wechange2023-debug` on GitHub). Always check `npx vercel whoami` / `gh auth status` before
  any outward action.
- `git push` first failed with **403** because the HTTPS credential helper cached the wrong
  account. Fixed with **`gh auth setup-git`** (gh is now the github.com credential helper using
  the crspiegel token). Pushes work now.
- ⚠ **푸시 전 gh 활성 계정을 `crspiegel`로 전환한다(2026-10-30, D30).** git 자격 도우미 = gh인데 이 PC의 평소 활성
  계정은 다른 계정이다 → `gh auth switch -h github.com -u crspiegel` → `gh auth status` 확인 → `git push` → `gh auth switch`로 복귀.
- ⚠ **PowerShell 5.1은 따옴표·공백이 든 인자를 네이티브 명령에 쪼개 넘긴다(2026-10-31).** `gh api … --jq '… "…" …'`가
  `accepts 1 arg(s), received 5`로 실패(배포 상태 폴링 3분 헛돎). `--jq` 대신 `gh api … | ConvertFrom-Json`으로 읽는다.
  커밋 메시지는 파일로 `git commit -F`. 새 명령은 반복문에 넣기 전에 한 번 실행해 본다. 배포 상태 = GitHub 커밋 상태
  `repos/<저장소>/commits/<sha>/status`(context `Vercel`, 저장소 주소는 PROJECT_MEMORY "Infrastructure").
- The device-auth login flow (`vercel login`, `gh auth login`) reuses the **browser session** —
  log the wrong account out of the site in the browser first, or it re-authorizes the wrong one.
- **Vercel CLI `--global-config` 폴더를 배포 폴더 안에 두면 토큰이 업로드되어 공개된다**
  (2026-10-19 사고: `<site>/.vc-cfg/auth.json`이 200). Vercel은 점(.)으로 시작하는 폴더도 올린다.
  로그인 설정은 배포 폴더 **밖**에 두고 `vercel deploy <배포폴더> --global-config <설정폴더>`로,
  배포 전 폴더 내용 검사·배포 후 공개 주소에서 설정 파일 404 확인. 노출되면 즉시 `vercel logout`
  (토큰 무효화) + 그 배포 삭제 + 대시보드 Tokens 확인.
- **사용자에게 주는 `!` 명령은 한 줄·짧게.** 긴 명령은 붙여 넣을 때 터미널 줄바꿈에서 잘려 뒤쪽
  인자(`--scope`·`--global-config`)가 빠진 채 실행됐고, PC 기본 CLI 로그인(다른 계정)으로 배포됐다.
  길면 스크립트로 만들어 `! bash "<경로>"` 하나만 주고, 스크립트가 `whoami`를 먼저 검사하게 한다.

## Custom domain (Gabia + Vercel)

- **Domain:** `cambridgereading.com`, registered at **Gabia** (gabia.com). Connected to Vercel
  project `new-app_0607` on `2026-07-15` using the **DNS-record method** — Gabia nameservers kept,
  only A/CNAME records added. (Nameserver method was NOT used; only needed for wildcard subdomains.)
- **Exact records set in Gabia** (My가비아 → 도메인 관리 → DNS 정보 → DNS 관리):
  - `A` · host `@` · value **`216.198.79.1`** · TTL 1800
  - `CNAME` · host `www` · value **`e17453d2652fa5ed.vercel-dns-017.com.`** · TTL 1800
- **Use Vercel's NEW values, not the old ones from memory.** Vercel migrated IP ranges: apex A is now
  **`216.198.79.1`** (old `76.76.21.21` still works but is deprecated), and the CNAME is now a
  **project-specific** host (`e17453d2652fa5ed.vercel-dns-017.com.`), NOT the old universal
  `cname.vercel-dns.com`. **Always copy the exact value shown in Vercel → Settings → Domains** rather
  than reusing a remembered value — the CNAME differs per project.
- **Vercel domain config:** both `cambridgereading.com` + `www.cambridgereading.com` added. `www` is
  **primary (Production)**; apex **308-redirects to `www`** (Vercel default). No extra Vercel setup
  beyond adding the domains — SSL is auto-issued once DNS verifies.
- **Verify propagation from the CLI** (Git Bash) before waiting on the dashboard:
  `nslookup -type=A cambridgereading.com 8.8.8.8` and
  `nslookup -type=CNAME www.cambridgereading.com 8.8.8.8`. TTL 1800 (30 min) vs 3600 (1 hr) only
  affects DNS cache duration — either works; shorter TTL just makes later edits propagate faster.
- **Gotchas:** apex (`@`) cannot take a CNAME (DNS rule) → must be an A record. Remove any pre-existing
  Gabia parking `@`/`www` records first to avoid conflicts. Leave MX/TXT (email) records untouched —
  adding A/CNAME doesn't affect mail.

## Fonts & typography

- **Verify a font/weight actually exists and renders — never assume.**
  - "Google Sans" (Google Fonts) ships **only weight 700**; 800/900 render as 700.
  - Single-weight display fonts seen here: Cal Sans (400), Concert One (400), Luckiest Guy (400).
    Reddit Sans is 200–900; LINE Seed JP is 100/400/700/800.
  - The project sets `font-synthesis: none` globally → **no synthetic bold**; an unloaded weight
    falls back to the nearest loaded weight, it is not faked heavier.
- `document.fonts.check()` is **unreliable**: returns `true` for undefined fonts (optimistic),
  and `false` for large CJK subset fonts (e.g. LINE Seed JP) even when usable. To confirm a font
  is applied, check the element's computed `font-family` AND compare its rendered width against
  a reference span — do not trust `check()`.
- Large CJK webfonts (LINE Seed JP) lazy-load with `font-display: swap`: a fallback shows first,
  then it swaps in after a moment. Verify by width after a short wait, not instantly.
- When you replace a font, **remove the now-unused family from the `<link>`** in `index.html`
  (the webfont link is kept minimal — only referenced families).
- Probe Google Fonts availability/weights with curl + a browser UA, then grep `font-weight:`:
  `curl -A "<UA>" "https://fonts.googleapis.com/css2?family=Name:wght@100;...;900"`.
  A nonexistent family returns HTTP **400**; real ones return 200.

## Header & responsive layout

- **Scrollbar-width shift:** on classic-scrollbar platforms (Windows), a page WITH a vertical
  scrollbar is ~15px narrower than one without, shifting the centered nav and right-aligned
  header icons a few px between pages. Fixed by `html { scrollbar-gutter: stable }`.
  ⚠ Headless Chromium uses **overlay scrollbars (0px)**, so this never reproduces in headless
  measurement — reason about it, don't rely on the tool to catch it.
- The header level nav is absolute-centered between brand and login on desktop (>1180px) but
  cannot fit at narrower widths; at **≤1023px it drops to its own centered row** (dedicated
  `@media (max-width: 1023px)` block). After resizing nav icons, re-check overlap across widths
  (1280 / 1200 / 1024 / 768 / 390): brand↔nav and nav↔login must not collide.

## CSS scoping & specificity

- The level theme is applied by `applyLevelTheme()` (in `app.js`) adding `.level-theme-1..4` to
  the screen elements. Per-level styling = `.level-theme-N <selector>`. The CSS vars
  `--level-accent`, `--level-accent-shadow`, `--level-accent-soft` carry the level color
  (`-soft` = light tint, used for the content-page background).
- The three content screens share `.content-v2-*` classes (V1 `#contentScreen` AND V2
  `#contentScreenV2`). **Scope content-page changes to `#contentScreen`** so V2/V3 aren't affected.
- Watch specificity: e.g. `.section-white p` (0,1,1) beats a bare `.foo` (0,1,0). Scope with an
  id (`#monthScreen .foo`) when a shared element rule out-specifies yours.
- "Applies to all content months" rules that must beat the responsive `#contentScreen
.section-inner` padding (set in a media query) can select `#contentScreen[data-month] ...` —
  the attribute-presence raises specificity to (1,2,0), above the media rule (1,1,0), and
  `app.js` always sets `data-month` on `#contentScreen` when the content page shows. Use
  `[data-month="April"]` for one month, `[data-month]` for any.
- **A `background` SHORTHAND on a broader selector silently resets your longhands.**
  `.bg-editor-panel button { background: #fafafa }` (0,1,1) beat `.bg-lib-thumb`'s (0,1,0)
  `background-size: contain` — the shorthand resets size/position to initial, so library
  thumbnails rendered at natural size cropped to the top-left (looked blank for big images).
  When an image must fit a box inside such a scope, prefer a real `<img>` +
  `object-fit: contain` over CSS backgrounds (immune to background shorthands), or out-specify
  with the parent (`.bg-editor-panel .bg-lib-thumb`).

## Auth, grades & Supabase (Phase 2/3)

- **Two login kinds share one form** (`#loginForm`). Branch on `@`: an id containing `@` → **admin**
  Supabase Auth (`auth.signInWithPassword({email:id})`); otherwise → **LMS member** `sb.rpc("lms_login")`
  (Phase 3A — see "LMS 로그인 클라이언트" below). ⚠ Don't issue member ids containing `@` — they'd misroute to
  the admin Auth path and fail.
- _(Superseded in Phase 3A)_ The old client-side grade (`state.grade` + `localStorage.cra_member`) and the
  grade-3 `#noAccessModal` block are gone. `cra_member` is deleted on load; everyone plays videos.
- **`body.signed-in`** (admin OR member) hides the header Login button and shows Log out; **`body.is-admin`**
  additionally shows the Admin button. `updateAdminUI()` sets both; logout clears admin (`signOut`) AND the
  member session.
- **Backend is fully provisioned** — `supabase/migration.sql` is "Phase 2+3" and was already run, so the
  member RPCs (`verify_member_login`, `create_member` [admin-only, `^[!-~]{4,}$`], `set_member_active`) and
  `site_settings` exist. **Phase 3 needed NO SQL change.** Admin-only RPCs are guarded by `is_admin()` server-
  side; the anon key can still CALL them but they raise "not authorized" unless the caller is an admin.
- **Account format** rule is `/^[\x21-\x7E]{4,}$/` on the client (mirrors the server `^[!-~]{4,}$`): ≥4
  printable-ASCII chars, no spaces, no Korean. Apply on member login + admin member-create.
- **Signup is a hidden placeholder**: `#loginSignup` shows only when `site_settings.signup_visible` is true
  (public read via `refreshSignupUI()`; admin flips it with the `#signupToggle` upsert). Its submit creates
  **no account** — it just tells the student to ask their teacher. Real accounts are admin-created via
  `create_member`. (A functional self-signup would need a new public `signup_member` RPC — deliberately not
  built.)
- **ESLint**: reference `window.supabase`/`window.localStorage`; use optional catch binding (`catch {`) for
  ignored errors (an unused `catch (e)` trips `no-unused-vars`).
- ⚠ **pgcrypto lives in the `extensions` schema on Supabase, not `public`.** A `SECURITY DEFINER` function
  with `set search_path = public` then fails with **`function gen_salt(unknown) does not exist`** (and the
  same for `crypt`). Fix: `set search_path = public, extensions` on every crypto-using RPC
  (`verify_member_login`, `create_member`). This bit member-create/login in Phase 3 — the migration was
  updated and must be **re-run** in the Supabase SQL Editor (it's idempotent `create or replace`).
- **Toolbar button labels (2026-07-31)** — custom names live in `content_pages.labels` jsonb (per
  level+month; `getSlotLabel()` falls back to the `TOOLBAR_BUTTONS` default when unset/empty).
  - ⚠ **`savePage` upserts `labels` — every admin save fails until the `labels` column exists.** The
    ALTER is in `supabase/migration.sql` (idempotent); run it in the SQL Editor BEFORE testing saves.
    Reads are safe either way (`row.labels || {}`).
  - ⚠ **`slotLabel(slot, level, month)` now takes month** — callers must pass `adminState.month` or the
    toolbar branch silently loses the custom name (falls back to the default).
  - The modal's single write path is `commitSlot({url, name, applyAllName, applyAllUrl})`; each apply-all
    flag propagates ONLY its own field to all 10 months via one batch `upsert(rows)` (arrays are fine).
    The 지우기 button was REMOVED (user decision — clear the input and save instead).
  - The name input holds only the CUSTOM label; the default shows as `기본: …` placeholder. Weekday
    slots (w1-Mon…) hide the name field + both checkboxes (URL-only modal, as before).
  - `window.craContent` bridge (+ `settled` flag, mirrors `craBg`) exists for Playwright — tests must
    wait on `settled` then reset labels (`resetContentLabels`) because the dev server hits the REAL
    Supabase project (a client-renamed button would otherwise flake the default-name assertions).
  - `hydrateContent` re-renders the toolbar when the content screen is active (labels can arrive after
    first paint); side effect: the active toolbar button resets to the first one at that moment.
- **Toolbar redesign (2026-08-01)** — SVG icons / GAME·SONG tags / fixed-width wide toolbar.
  - ⚠ **Never scrape the toolbar label from the DOM** (`span:last-child` grabbed the corner-tag span).
    The video-player title is composed from data: `getSlotLabel(...)` + the `tag` field in
    `TOOLBAR_BUTTONS` ("<label> · Song"). Tag pills are `span.content-type-tag` appended LAST.
  - ⚠ **The base `--wide` rule's 50px side padding outranks the mobile `.content-toolbar` rule**
    (`#contentScreen .content-toolbar.content-toolbar--wide` = 1,2,0 vs 1,1,0) — with 1fr grid cells
    it silently ate ~90px of phone width ("Good Morning…" ellipsis). The ≤767px --wide block must
    re-declare `padding-left/right: 6px`. Found by measuring, not by eye.
  - `fitToolbarText()` (wide toolbar only) shrinks `.content-type-label` to fit the fixed 2-line box
    (floor 11px; line-clamp ellipsis below that). Hooks: rAF after every `renderContentToolbar()`
    (render happens BEFORE `showScreen` — hidden metrics are 0 → no-op without the rAF), debounced
    resize, and `document.fonts.ready`. ESLint: use `window.requestAnimationFrame`/`window.setTimeout`.
  - Icons keep the `span.content-type-icon` wrapper (per-breakpoint size rules reuse it); the SVG
    inside stretches 100%. The 768-899px icon-hide block was REMOVED
    (circles gone → space freed). Same-document hash `page.goto` in Playwright does NOT re-route the
    SPA — `page.reload()` after changing the hash level in a test.
  - **Feedback round (2026-08-01) — ribbon tags + full-color icons.** The tag is an over-the-edge
    ribbon: `top:-3px` and the first 3px of `padding-top` are ONE coupled value (overhang height) —
    change both together or the text stops sitting on the button face. (Shrunk ~20% from the first
    ribbon — 10px/`7 9 4`/`-4px` → 8px/`5 7 4`/`-3px` — so it covers less of the label; measure the
    tag rect against the label rect after any resize, the two can overlap on narrow tablets.) Flat single color across the
    fold: a first pass used a darker "back of strap" shade above the edge, but the user read it as a
    separate darker bar, so `--tag-game-back`/`--tag-song-back` and the `linear-gradient` hard stop
    were dropped. Icons bake their own colors into the SVG (solid layering: dark bottom lip offset
    +1.3px + white glint). ⚠ **No `<defs>` gradients in `ICON_SVGS`** — the same icon repeats across
    toolbar buttons, so `url(#id)` refs would collide document-wide. The old `stroke: currentColor`
    svg rule and both `.active .content-type-icon` color rules were removed (icons no longer inherit
    the button color).
  - **Icon circle backdrop (2026-08-01, 3rd feedback round).** `.content-type-icon` is
    `box-sizing: content-box` **on purpose** (the global reset is border-box): every breakpoint's
    `width`/`height` on it then keeps meaning _glyph size_, and the circle is glyph + 2×padding —
    so the ring is retuned in one place instead of re-deriving box sizes in ~7 media queries.
    Tint comes from `--icon-tint` set by a `content-type-icon--video|game|music` modifier class
    (`renderContentToolbar` derives it from the item's `icon` key).
  - ⚠ **On the `--wide` toolbar every px of icon box is a px the label loses.** The circle's
    padding pushed the longest label into 2-line ellipsis from ~860px up (768/800 already
    ellipsised before the change — that is pre-existing, not a regression). Fix was to pay for the
    ring out of button padding: base `--wide` `0 clamp(8px,0.85vw,13px)` → `clamp(6px,0.7vw,10px)`,
    tablet block `0 clamp(8px,0.9vw,12px)`/gap 5 → `clamp(4px,0.5vw,8px)`/gap 4. Verified by
    sweeping 360→1600px against a "padding:0" emulation of the pre-circle build; only 1250/1366px
    still land ~1px smaller on the longest label. **Re-run that sweep before changing icon size,
    icon padding, or wide-button padding.**

## LMS SQL 1차 (Phase 3A, 2026-10-23)

- **운영 DB는 사용자가 SQL Editor로만 바꾼다.** 순서·기대값은 `supabase/lms/README.md`. 로컬 검증은
  `npm run test:sql`(PGlite = Postgres 18 WASM + pgcrypto, 운영 접속 0). Supabase는 15/17이고 역할·기본 권한은
  테스트의 shim이 흉내 낸 것 — 새 테이블 권한은 기본 권한에 기대지 말고 migration에서 명시한다.
- ⚠ **SQL Editor는 마지막 결과 표 하나만 보여 준다.** 점검·검증 SQL은 select 한 개로 표를 만든다.
  `verify-3a.sql`은 함수 안 서브트랜잭션에서 테스트하고 일부러 예외(`LMS_VERIFY_ROLLBACK`)를 던져 전부 되돌린 뒤
  결과(plpgsql 변수에 모아 둔 것)를 낸다 + 바깥 `begin … rollback`. 테스트 데이터 이름은 `zz-v…`·`검증지사…`.
- ⚠ **2026-10-30 `teacher-test-account.sql` `42P01`(마지막 select가 임시 표를 못 찾음) — 원인 미확정**(편집기 동작, 또는
  일부만 선택한 채 실행했을 가능성. 앞 문장이 만든 임시 객체(`pg_temp` 함수)를 마지막 select가 쓰는 `verify-3a.sql`은
  운영에서 두 번 성공). 사용자가 돌릴 SQL은 **한 문장**(CTE)으로 쓰면 어느 경우든 안전하다. 단 한 문장 안에서는 모두
  시작 시점 데이터를 봐서 **트리거가 바꾼 결과가 안 보인다**(지워진 세션도 셈) → 결과 칸 이름을 실제 뜻대로
  (`sessions_ended`). 사용자 안내문에는 늘 **"Run 전에 편집기를 클릭해 선택 해제"**를 넣는다.
- **ALTER(제약 등)까지 한 번에 해야 하면 한 문장 = `do $$ … $$` 블록**(CTE에는 ALTER를 못 넣음, 2026-10-31
  `supabase/levels/01-rename.sql`, PM 승인). 결과 표가 없으니 확인은 읽기 전용 점검 SQL을 다시 돌린다. 블록 바깥 줄이 걸린
  선택은 문법 오류지만 **안쪽 줄만 선택되면 보통 SQL로 실행된다** → 선택 해제는 여전히 필수, 안쪽만 돌아도 무해하게 짠다.
  "남은 값 확인 → raise"는 CHECK 추가 **앞**에 둔다(뒤면 CHECK 위반 오류가 먼저 나 문구가 흐려짐). 재실행 무변화가 필요하면
  제약은 없을 때만 추가(지웠다 다시 만들면 oid가 바뀜).
- ⚠ **RLS 정책 안 함수는 조회하는 역할의 EXECUTE가 필요하다**(`lms_member()`를 anon에서 revoke하면 정책이 권한
  오류). **인덱스 식 함수는 행을 쓰는 역할의 EXECUTE를 검사한다**(`lms_norm_id`를 authenticated에서 빼면 관리자
  members 직접 쓰기가 `permission denied for function lms_norm_id`).
- ⚠ `current_setting('request.headers', true)`는 한 번 설정·되돌린 세션에서 NULL이 아니라 `''`를 돌려준다 →
  `nullif(…, '')` 후 `::json`. 안 하면 `invalid input syntax for type json`.
- 운영 REST 헤더(2026-10-29 `lms_probe_headers` 탐침): `cf-connecting-ip`·`x-forwarded-for` = 실제 접속 IP, `x-real-ip` 없음.
  ⚠ 요청에 `CF-Connecting-IP`를 넣으면 Cloudflare가 엣지에서 **403 `error code: 1000`**(PostgREST까지 안 감) → 위조 시험은
  헤더를 한 요청에 하나씩. 이 거절이 `lms_client_ip()`가 `cf-connecting-ip`만 믿는 근거다.
- ⚠ **운영 DB에 저장소에 없는 객체가 있었다(2026-10-30 발견):** `members.profile` jsonb 열 + `create_member`
  5인자 오버로드(`p_profile jsonb default …`). 기본값 있는 인자를 붙인 오버로드는 기존 4인자 호출을 모호하게 만든다
  (SQL `42725 … is not unique`, REST `PGRST203`) → `create or replace`는 시그니처가 다르면 덮어쓰지 않고 하나를 더 만든다.
  정리 = `supabase/lms/fix-create-member-overload.sql`(그 오버로드만 DROP). 열은 3.5에서 결정(D28).
- `classes` ↔ `class_members` 정책이 서로를 조회하면 재귀 오류 → SECURITY DEFINER 도우미 함수로 끊는다.
- 로그인 실패를 예외로 돌려주지 않는다(`lms_login`은 항상 jsonb) — 예외는 실패 카운터 증가까지 롤백한다.
- ⚠ **`members.id`가 아직 pk(전역 유일)라 3.5 전에는 같은 아이디를 두 지사에 만들 수 없다** — 동명이인 테스트는
  대소문자 변형(`zz-v-twin`/`ZZ-V-TWIN`)으로 한다. 3.3 전에 pk 교체 여부 결정(스펙 §4.9 위험 1). → **3B(D41)에서 교체됨**
  (아래 "LMS SQL 3B"). 3B 이후에는 완전히 같은 아이디도 두 지사에 있을 수 있다(verify-3b `zz-v3-kim`).
- ⚠ **구 `verify_member_login`은 anon이 무제한 호출할 수 있는 비밀번호 확인 창구였다** — 새 잠금을 만들어도 이 길로
  우회된다. 3A에서 본사 회원만 + 같은 잠금으로 재정의했다. 새 로그인 경로를 만들 때는 **같은 테이블을 읽는 옛 경로도**
  잠금에 묶을 것.
- ⚠ pgcrypto `crypt(pw, hash)`는 깨진 bcrypt(`$2a$06$short`)·빈 값·1글자 값이면 `invalid salt` 예외, 아무 2글자 이상
  문자열은 옛 DES 솔트로 받아들여 예외가 없다 → "평문 해시" 테스트 픽스처는 `$2a$06$short`처럼 써야 예외 경로를 탄다.
- PGlite: `db.query()`는 한 문장만 → 여러 문장은 `db.exec()`(결과 배열, 마지막 행 있는 결과 = SQL Editor 표).

### LMS SQL 3B (Phase 3B-1, 2026-11-01)

- **기본 키 교체(D41)는 `add constraint members_member_id_key primary key using index members_member_id_key`.** 외래 키들이
  이미 기대는 고유 인덱스를 그대로 키로 바꿔서 외래 키를 안 건드린다. 제약 이름을 인덱스와 **같게** 해야 인덱스 이름이 안
  바뀐다 — 다르게 주면 인덱스가 새 이름으로 바뀌고, 3A의 `create unique index if not exists members_member_id_key`가 재실행 때
  같은 인덱스를 하나 더 만든다. 옛 키를 지운 뒤 `id`의 NOT NULL은 명시로 다시 건다(버전마다 동작이 다를 수 있음).
- ⚠ **3A 시점 스크립트는 3B 이후 실행 금지**(`verify-3a`·`teacher-test-account`·`fix-create-member-overload`). 그 테스트는
  `tests/fixtures/migration-3a.sql`(커밋 `8176966` 사본, **수정 금지**)로 돈다. 새 migration 검사는 두 경로(3A 사본 → 새 파일 /
  빈 DB → 새 파일) × 2회 + 카탈로그(함수 본문·권한·제약·인덱스·정책·열) 무변화.
- **LMS 쓰기는 전부 RPC**(`lms_caller()` = 관리자 JWT 또는 LMS 토큰). 범위 밖·안 보이는 대상 = `42501`(없는 대상과 같은 답 → 다른
  지사 id 탐색 불가), 그 밖은 jsonb `status`. 검증 SQL은 거부를 `42501` 또는 정의한 상태 값으로만 인정한다.
- ⚠ **같은 아이디가 여러 지사에 있고 직원이 비밀번호를 정할 수 있으면, 아이디 단위 실패 카운터만으로는 뚫린다**(보안 검토 H1·H2):
  내 지사에 상대와 같은 아이디의 학생을 만들어 비밀번호를 추측값으로 바꿔 로그인하면 `ok`(내 학생만 맞음) / `choose`(추측이 상대
  비밀번호와 같음)로 실패 기록 없이 무제한 추측. → `lms_login`은 **계정별 키 `m:<member_id>`**에 "비교했는데 안 맞은 계정"마다 실패를
  센다(다른 계정이 맞아도). 잠긴 계정은 비교하지 않는다(더미 bcrypt). `p_branch_id`가 있으면 그 지사만 비교. 옛 경로
  `verify_member_login`도 같은 키. **새 로그인 경로를 만들 때도 계정별 키를 지킬 것.**
- 잠금 해제(D46) `lms_unlock_member` = 그 회원의 `m:` 키 + 지사 공통 `id:` 키. 공통 키라 다른 지사의 같은 아이디도 풀리지만(수용),
  각 계정의 `m:` 키는 범위 안 사람(그 지사·담당 선생님·관리자)만 지운다 → 공통 키를 지워도 남의 계정 추측은 계속 막힌다.
- 같은 아이디 학생이 매번 지사 없이 로그인하면 다른 지사 계정 키에 1회씩 쌓인다 → 클라이언트는 첫 로그인 뒤 기기에 지사를 기억해
  다음부터 `p_branch_id`로 보내는 게 좋다(3B-2 화면 지시서 때).
- ⚠ 대량 생성은 행마다 bcrypt → Supabase `statement_timeout`(anon 3초, authenticated 8초)에 걸릴 수 있다. 로컬 실측(3B-3, PostgreSQL 18.6
  이 PC) 약 3.5ms/행(PGlite WASM 약 5ms/행) → 클라이언트 한도 `BULK_MAX_ROWS` = 100. 운영 실측 전(멈춤 3 뒤 실계정 확인 때).
- advisory lock 번호(겹치면 서로 기다린다): 7301 로그인 아이디 키 · 7302 레벨별 자료실 (옛 이름 '교사 자료실', 2026-11-06 변경) 다운로드 한도 · 7303 계정 아이디 쓰기(생성·변경) ·
  7304 학생별 반 넣기(D51 검사 경쟁 방지) · 7305 자료실 분류 쓰기(글 저장은 같은 번호의 공유 잠금, 2026-11-03). 새 잠금은 새 번호로. **한 호출이 잠금을 여러 개 잡으면 쓰기 전에 잠금 번호 순으로 한꺼번에**
  (3B-3 N4: `lms_bulk_assign`) — 행마다 잡으면 반대 순서의 두 호출이 서로 기다리다 한쪽이 40P01로 끝난다.
- PGlite는 연결이 하나라 **동시 실행(교착·고유 제약 경쟁)은 재현 불가** → `tests/lms-3b-concurrency.spec.js`가 `embedded-postgres`
  (실제 PostgreSQL 18.6, 임시 폴더·빈 포트, 처음 기동 약 15~20초)로 두 연결을 동시에 돌린다. 겹치게 하려면 테스트 전용 트리거로
  `pg_sleep`(대량 배정 행마다 0.3초). PostgreSQL의 교착 감지는 `deadlock_timeout` 1초 뒤 한쪽을 40P01로 끝낸다(영원히 멈추진 않음).
- ⚠ **`embedded-postgres`는 `package.json`에 넣지 않는다(D61).** Vercel은 배포마다 `package.json`을 설치한다 — 베타 + 설치 스크립트가
  있는 패키지가 배포 설치를 깨면, D49 순서(운영 SQL 직후 푸시)에서 옛 회원 탭이 멈춘 채로 남는다. 없으면 위 테스트는 실패가 아니라
  건너뜀(이유에 설치 한 줄). 돌릴 때만: `npm i --no-save embedded-postgres@18.6.0-beta.19` → `npm run test:sql` → `npm ci`로 정리
  (`--no-save`라 `package.json`·lock은 안 바뀜). npm이 `allow-scripts` 경고(postinstall 미실행)를 내도 Windows에서는 그대로 동작한다.
  ⚠ PostgreSQL 18의 I/O 도우미 프로세스(`postgres.exe --forkchild="io_worker"`)가 Windows에서 `stop()` 뒤에도 남아 `node_modules`를
  잠갔다 → `npm ci`가 EPERM(-4048). 테스트는 `io_method=sync`로 띄운다(도우미 없음). 남아 있으면 그 경로의 프로세스만 끈다.
- 함수의 인자·결과 열이 바뀌면 `create or replace`가 실패하거나(결과 열) **겹치는 함수가 하나 더 생긴다**(인자) → 옛 모양만
  골라 drop한다(`lms_branch_create(text)`, `lms_member_list` 가드). `'…'::regprocedure` 문자열 변환은 **계획 단계에서** 풀려서 함수가
  없으면 `if … and` 앞부분과 상관없이 오류 → `to_regprocedure(…)`(없으면 NULL)를 쓴다.
- SQL 함정: 집계 안 `order by 1`은 열 번호가 아니라 **상수**(`string_agg(x, ',' order by 1 collate "C")` → "collations are not
  supported by type integer") → 식을 그대로 쓴다. `if a or jsonb_array_length(x) = 0`처럼 **SQL `or`는 단락 평가를 보장하지 않는다**
  → 배열이 아닐 수 있으면 `if`를 나눈다. plpgsql `returns table (member_id, role, …)`는 같은 이름의 열과 충돌 → `#variable_conflict
use_column` + 별칭으로 전부 한정.
- 검증 SQL에서 호출자를 바꾸는 도우미(`pg_temp.v3_as`)는 `reset role` 뒤 `set local role anon|authenticated` — invoker 함수 안의
  `set local role`은 함수가 끝나도 유지된다. 토큰은 임시 표(`v3_who`)에만 두고 출력하지 않는다.
- 검증 행이 실제로 회귀를 잡는지 **일부러 망가뜨린 변형**으로 확인했다(교사 범위·지사 목록·대량 롤백·중복 확인 지사·담당 교체 +
  보안 수정 4종(계정별 실패·잠긴 계정 건너뛰기·잠금 해제 범위·반 지정 학생만) = 9종 → 모두 실패 행 발생). 처음엔 "중복 확인이 넘겨받은
  지사를 믿음" 변형을 못 잡아 확인 행을 추가했다.

### LMS 관리자 화면 (Phase 3.3 / 3B-2, 2026-11-01)

- 역할 → 열 수 있는 관리자 뷰는 `app.js` `ADMIN_VIEWS` 한 곳(최고관리자 5개, 지사·선생님 회원·반). `setAdminView`는 목록 밖이면
  **거부**(false), 메뉴 버튼도 숨김. `#admin`은 **로드 때만** 라우팅된다(hashchange 리스너 없음) → 로드·새로고침마다 `openAdmin`
  가드: 학생 → 홈, 비로그인 → 로그인. 헤더 버튼 이름 Admin / My Branch / My Class(`updateAdminUI`).
- 회원·반·지사 뷰는 새 classic script `lms-admin.js`(app.js 다음). ⚠ 같은 전역 이름 공간 → 최상위 이름이 다른 스크립트와 겹치면
  **스크립트 전체가 멈춘다**(추가 전 이름 대조). ESLint 전역은 `eslint.config.mjs`의 lms-admin.js 블록. app.js `adminViewOpeners`에
  뷰별 로더를 등록 → 뷰가 열릴 때마다 다시 읽음.
- ⚠ **`.admin-select`·`.admin-controls`는 `display:flex`라 `hidden` 속성을 덮어쓴다** → `[hidden]{display:none}` 규칙을 따로 둠
  (지사 계정에게 지사 필터가 보이던 결함). `.admin-member-actions`는 `flex:0 0 auto`(안 줄어듦) → 375폭 반 행이 넘침 →
  `.lms-admin`에서 `0 1 auto` + `min-width:0`.
- 선생님 자신의 member_id는 화면이 모른다(`lms_session`에 없음) → "자기 반" = `rpc lms_managed_class_ids()`(anon에 열린 RLS 도우미).
  지사·관리자의 반 "옮겨 넣기" = 다른 반에서 빼기 → 넣기(RPC 2번, 한 트랜잭션 아님).
- D50 지사 기억 = `localStorage.cra_lms_branch` `{branch_id, branch_name}`. 로그인 카드는 기억이 없으면 **바이트까지 그대로**(바꾸기 전
  빌드에서 찍은 `.login-card` 요소 스크린샷 375·1366과 비교 — 같은 빌드 두 번 찍어 결정적인지 먼저 확인).
- 테스트 함정: 화면은 8자 미만 토큰을 버린다(`LMS_TOKEN_RE`) → 가짜 토큰도 43자처럼. 로그아웃 클릭 뒤 **로그아웃이 끝난 것(버튼
  숨김)을 확인하고** 이동 — 늦게 끝난 핸들러의 `setHash("home")`이 주소의 `#login`을 지운다. 가짜 LMS = `tests/lms-admin-stub.mjs`.
- 커밋 못 하는 작업 백업(인덱스 안 건드림): `git diff --binary > 패치` + 새 파일마다 `git diff --no-index --binary /dev/null <파일> >> 패치`
  → `git apply --check -R 패치`로 검증. 되살리기 = `git apply 패치`. 위치는 로컬 전용 `docs/worker-briefs/`.
  ⚠ 백업 **뒤에** 문서를 고치면(세션 종료 기록 등) 그 파일만 역적용이 깨진다 → 백업은 마지막에, 또는 다시 만든다(11/01 사례).

### 관리자 화면 틀 (Phase 3B-2b, 2026-11-01)

- `showScreen`이 `body.admin-mode`를 켜고 끈다 → 관리자 화면에서는 **사이트 헤더·푸터가 `display:none`**. 관리자 화면에서 사이트
  헤더(레벨 버튼·로그아웃)를 누르던 테스트는 `#adminSiteBtn`(사이트 보기 → 홈) 또는 `#adminLogoutBtn`으로 간다. 홈에서는
  헤더 레벨 메뉴가 원래 숨겨져 있으니 `#levelSection [data-level]`을 누른다.
- 782px 미만(태블릿 768 포함)은 왼쪽 메뉴가 화면 밖 → `#adminMenuToggle`(☰)을 먼저 누른다. 메뉴 버튼은 그대로
  `.admin-menu-btn[data-admin-view]`(가드·배너 탭 로더·스모크의 JS 클릭이 이 선택자를 씀 — 바꾸지 말 것).
- 나눔고딕은 `ensureAdminFont()`가 관리자 첫 진입 때만 `<link id="adminFontLink">`로 붙인다. 사이트 `<link>`에 넣지 말 것(사용자 화면
  글꼴 요청 0이 조건). 관리자 글꼴 범위 = `#adminScreen *`·관리자 창 2개(`--font-admin`).
- 사이트 변수(`--muted-ink`·`--macaw-blue`·`--owl-green`)를 `#adminScreen, .admin-modal` 안에서만 관리자 색으로 다시 가리킨다 →
  옛 관리자 규칙이 AA 대비를 얻는다. `#1cb0f6`(macaw-blue)은 흰 바탕 글자로 AA 미달이라 관리자 강조색은 `#1f66a8`.
- 고정(fixed) 왼쪽 메뉴는 전체 페이지 캡처에서 첫 화면 높이에서 끊긴다 → `.adm-root` 배경에 메뉴 열 색을 함께 칠함.
- 목록 표: 반은 **반마다 `<tbody class="lms-class-row">`**(학생 패널 행이 같은 tbody 안 → `row.locator(".lms-class-student")`가 그대로
  동작). 휴대폰 접기는 `td[data-colname]`만 숨긴다(패널·빈 행 td는 data-colname 없음).
- (3B-2b-2) 빈 `<select>`를 채우면 브라우저가 **첫 항목을 고른다** → "값이 비면 기본값" 검사는 채운 뒤엔 안 걸린다. 기본값은
  채우기 **전** 값으로 판단(`prepareMemberForm` 역할 = 학생). flex 항목 맨 앞 공백은 `nowrap`에서 사라진다 → `" · 지사"`는
  `white-space: pre`. 보드 표지는 배경 그림이 아니라 `<img>`(휴대폰에서 원래 비율, 그림 요청 1번 — 이그레스).
- 작업 함정(Windows): Python `open(..., "w")`는 CRLF로 쓴다 → `newline=""`. 이 하네스의 bash heredoc은 따옴표가 많은 본문에서
  "unexpected EOF"로 깨질 때가 있다 → 조각은 파일 도구로 scratchpad에 쓰고 스크립트로 붙인다. `Get-NetTCPConnection`이 Vite의
  127.0.0.1 대기를 못 볼 때가 있다 → 프로세스 명령줄(`vite/bin/vite.js --port 5173`)로 찾아 끈다.
- (3B-2b 마무리) `scripts/run-playwright.mjs`(= `test:e2e`)는 **인자를 무시하고 전체를 돈다** → 한 테스트만이면 Vite를 따로 켜고
  `npx playwright test <파일> -g …`. 학생이 `#admin`으로 오면 홈은 처음부터 켜져 있고 `#admin`은 조금 뒤 지워진다 → 주소 확인은
  `expect.poll`로 기다린다.

### 엑셀 일괄 등록 (Phase 3.4 / 3B-3, 2026-11-02)

- **라이브러리(D48):** SheetJS Community Edition **0.20.3**, `vendor/xlsx-0.20.3.full.min.js`(951,904 bytes) — SHA-256
  `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`, 라이선스 Apache-2.0(`vendor/xlsx-0.20.3.LICENSE`, SHA-256
  `4d2a38ac35cda06a555c84074a819d413339cd3691b822cae50f8f322fe01f64`). 받은 곳 `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/`
  (2026-11-02 기준 최신). npm `xlsx`(0.18.5)는 **금지**(CVE-2023-30533 프로토타입 오염, 0.20.1 이하 ReDoS). 실행 중 CDN 요청 0 —
  `lms-bulk.js`가 일괄 등록 화면을 열 때만 `<script>`를 붙인다(다른 화면 요청 0, `tests/lms-bulk.spec.js`). 바꿀 때는 파일 이름의
  버전·`BULK_SHEETJS_SRC`·`tests/xlsx-fixtures.mjs`·이 줄을 함께.
- 이 파일은 Node `require`로는 아무것도 내보내지 않는다(브라우저 전역 `var XLSX`) → 테스트는 `vm.runInContext`로 읽어
  `sandbox.XLSX`를 쓴다(`tests/xlsx-fixtures.mjs`). npm `xlsx`를 테스트용으로 따로 넣지 않는다.
- 템플릿의 아이디·비밀번호 칸 = 텍스트 서식(셀 `z: "@"`, 빈 문자열 셀을 행 한도만큼 미리 만듦) → Excel에서 0123이 그대로. 읽을 때
  텍스트 셀이 아닌 아이디·비밀번호(`t !== "s"`)는 그 행 오류("셀 서식을 '텍스트'로…") — 0123 → 123은 되돌릴 수 없어서.
  템플릿 3행 예시(`kim01`/`0123`/`김민준(예시)`)는 그대로 두면 건너뛴다.
- 행 한도는 `lms-bulk.js` 맨 위 상수: 회원 `BULK_MAX_ROWS` 100(행마다 bcrypt, M3) · 반 배정 `BULK_ASSIGN_MAX_ROWS` 500(서버 한도).
  넘으면 나눠 보내지 않고 막는다(부분 성공 금지). 스크립트 최상위 `const`는 `window` 속성이 아니다 → 테스트는
  `page.evaluate(() => BULK_MAX_ROWS)`.
- ⚠ `.admin-signup-toggle`(`display:flex`)도 `hidden`을 덮는다(`.admin-select`와 같은 함정) → "중복이면 자동" 줄이 중복 0건에도
  보였다. `.bulk-box .admin-signup-toggle[hidden]{display:none}`.
- ⚠ `tests/lms-admin.spec.js` "no page code calls the old member RPCs"는 `index.html`의 **주석까지** `create_member`를 찾는다 →
  `lms_bulk_create_members`라는 글자도 걸린다. HTML 주석에는 `lms_bulk_*`처럼 쓴다.
- 스크린샷 도구에서 펼치기 버튼을 누르면 페이지가 스크롤돼 전체 페이지 사진 중간에 고정 상단 바가 찍힌다 → 찍기 전
  `window.scrollTo(0, 0)`(로컬 `docs/worker-briefs/2026-11-02-3b3-excel-screenshots.mjs`).

### LMS 로그인 클라이언트 (Phase 3A / 3.2, 2026-10-24)

- **Supabase 클라이언트는 하나.** `createClient(…, {global:{fetch: lmsFetch}})` — `lmsFetch`가 현재 `lmsToken`을
  `${SUPABASE_URL}/rest/v1/` 요청에만 `x-lms-token`으로 붙인다(토큰 없으면 헤더 없음). Auth·Storage 요청은 그대로라
  관리자 `@` 경로 무변경. 클라이언트를 다시 만들지 말 것(GoTrueClient 중복·옛 클라이언트에 남는 요청).
- 저장: `localStorage.cra_lms` = `{token, role, branch_name, display_name}`(표시용 캐시). 로드 때 `lms_session()`
  1회 → `null`이면 키 삭제, 오류(오프라인·SQL 미실행)면 이번 로드만 비로그인. 비밀번호는 저장하지 않는다.
- `choose` 응답: `#loginBranchChoice` 버튼 목록, 비밀번호는 `pendingLogin` 변수에만. 입력 변경·화면 이탈
  (`body[data-screen]` MutationObserver)·선택 완료 때 비운다.
- 로그아웃은 `lms_logout()`을 **토큰을 지우기 전에, Auth signOut보다 먼저** 호출(헤더가 필요). LMS 사용자 헤더 = Log out만(D15).
- ⚠ **공용 태블릿 경쟁 상태(보안 검토 2026-10-24):** 로드 때 `lms_session` 응답이 늦게 오면 그사이 로그인한 사람을
  덮어쓴다 → 응답 후 `lmsToken !== stored.token`이면 무시. 로그인은 `loginBusy`(한 번에 하나: 연타·지사 두 번 탭)와
  `loginSeq`(폼 수정·화면 이탈 때 증가 → 늦은 응답 버림)로 막는다. 화면을 떠나면 비밀번호 칸도 비운다.
- `window.fetch`를 직접 부르는 테스트는 래퍼를 거치지 않아 아무것도 검사하지 않는다 → 래퍼 `lmsFetch`를 직접 부를 것.
- CORS: Supabase REST 사전 요청은 요청한 헤더를 그대로 허용한다(`x-lms-token` 포함, 2026-10-24 curl 확인).
- 테스트 `tests/lms-login.spec.js`는 Supabase 요청 **전부**를 가짜 응답으로 받는다(운영 0). smoke 스위트는 REST를
  실제로 쓰므로, 토큰을 심는 smoke 테스트는 `lms_session`만 가짜로 준다.
- ⚠ 1366 폭 전체 화면 스크린샷은 같은 빌드끼리도 바이트가 달라진다(움직이는 요소) → 화면 무변경은
  `.login-card` 요소 스크린샷 + 주요 요소 `getBoundingClientRect` 비교로 확인한다.
  `format('%s', boolean)`은 `t`/`f`를 찍는다(`::text`면 `true`/`false`).

## Supabase egress — QA burned the free quota (2026-08-24)

- **What happened:** the project hit `exceed_cached_egress_quota` and Supabase **restricted
  every service** — REST, Auth and Storage all return HTTP 402. The site itself stayed up
  (every hydrate path early-returns on error, and the default hero slide is a local asset),
  but admin content, custom backgrounds and login were gone.
- **The cause was NOT a loop.** `supabase-config.js` hardcodes the production URL/key, so the
  dev server and Playwright both read the **live** project. One `npm run qa` = 38 tests × 3
  device projects = **114 cold-cache page loads**, each re-downloading every banner and
  background from Storage. The dashboard confirms it: **28.19 GB of cached egress out of a
  39 MB bucket** (≈723× the whole bucket) against **1 monthly active user**. Real visitors
  cannot produce that; automation can.
- **Cached egress still counts against the quota.** A good CDN hit rate does not protect you.
  Only fewer requests or smaller files do.
- **Fix:** `tests/smoke.spec.js` stubs the Storage object route with a 1×1 PNG — that route
  and nothing else.
- **⚠ Do NOT stub the REST/auth routes as well.** Tried three ways (empty 200, `route.abort()`,
  a 4xx) and every one made `editor: 가로 100%…` flaky. `abort()` was worst: supabase-js retries
  a network failure, which took one page load from 4 Supabase requests to 16 and tripled the
  run time. Those payloads are kilobytes anyway — 0.195 GB of database egress for the whole
  month. Images are what cost.
- **A latent test bug this unmasked:** a stretch band is an `<img>` at `width:100%/height:auto`,
  so its height — and under a bottom anchor its `top` — only settles once the image decodes.
  The test measured before that, and the failure delta was always **exactly the band height**
  (1652 desktop / 939 tablet / 480 mobile). It had passed only because nothing was slowing the
  image down. Any geometry assertion on a background element must first wait for
  `img.complete && img.naturalWidth > 0`.
- **Uploads are re-encoded client-side now** — `shrinkImage()` in `app.js`, shared with the
  other two scripts via `window.craImg`. WebP, 1920 px long edge for full-bleed art and 800 px
  for covers, quality 0.82. **Every failure path returns the ORIGINAL `File`** (no canvas, a
  decode error, or a result that is not actually smaller), so an upload never breaks because
  compression could not help. Measured: 4000×3000 PNG → 1920×1440 WebP = 9.4× smaller, and the
  same file at cover size = 45× smaller.
- **Hero banners load lazily.** `heroBuildBannerSlide` parks the URL in `dataset.src` and
  `heroPrimeSlide()` attaches it one slide ahead, so a page load fetches one banner instead of
  all of them. Slide 1 is the local default and slide 2 is primed immediately, so the first
  rotation is as instant as it always was.
- **Files already in Storage were NOT re-compressed** — compression applies to new uploads only.
- **`?t=${Date.now()}` on cover URLs is deliberate, leave it.** Covers upload to a fixed path
  with `upsert`, so without the query the CDN would keep serving the replaced image. After
  compression a cover is ~5 KB, so it costs nothing worth reclaiming.

### How it ended, and what the billing cycle actually does (2026-08-29)

- **The quota does reset, and the restriction does lift by itself.** The cycle rolled from
  `28 Jul – 28 Aug` to `28 Aug – 28 Sep`, Cached Egress went from **28.19 / 5 GB (564%)** to
  **0 / 5 GB**, and a `$0.00` invoice appeared for Aug 28. No payment, no plan change.
- **But the lift lags the reset by hours.** The dashboard showed the new cycle at 15:19Z on
  8/28; REST, Storage and Auth kept returning 402 until **03:29Z on 8/29 — about 12 hours
  later.** Supabase's own wording is only "a short delay"; community reports run to 24–48 h.
  So do not read the dashboard and conclude you are back. **Call the API.**
- **Project transfers are disabled while a project is restricted.** The Fair Use Policy lists
  the enforcement mechanisms as pausing projects, read-only databases, "disabling new project
  launches/**transfers**", and 402 on every request. If a move between organizations is ever
  on the table again, the 402 has to clear first — it is not a matter of caution, the button
  does not work.
- **The grace period is spent.** The policy grants one, and says a later violation gets none.
  The next overage restricts the project immediately, with no warning.

### What now prevents a repeat

- **Local dev is offline by default** (`supabase-config.js`). On `127.0.0.1` / `localhost` the
  file blanks its own two globals unless `localStorage["cra:dev-live"] === "1"`, and `app.js`
  already renders the static site when there is no URL/key — the same path that served the
  whole outage. `craDevLive(true)` + reload opts in and prints a standing console warning;
  `craDevLive(false)` opts back out. **Production never takes this branch** (hostname check),
  and a blocked `localStorage` fails closed, toward offline.
- **Playwright opts back in explicitly** via `addInitScript` in `beforeEach`. It must: the
  suite is tuned against real REST latency (see the warning above about stubbing REST). What
  it does not get back is Storage — that stays stubbed.
- **Two guard specs make the cost visible** (bottom of `tests/smoke.spec.js`):
  `no Supabase Storage request escapes the test stub` fails if any Storage URL outside
  `/storage/v1/object/` is requested — a signed URL, an image transformation, a new bucket
  helper — because the stub would not cover it and every future CI run would pay for it.
  `local dev defaults to offline…` walks the main flow with the live flag removed and asserts
  **zero** requests to `*.supabase.co`.
- **Still open:** the ~39 MB already in Storage is uncompressed, and 5 GB ÷ 39 MB is only about
  **128 full cold downloads a month** before the cap. Re-encoding what is already uploaded is
  the remaining lever, and it is the one job that rewrites production data — design it on its
  own, do not fold it into an unrelated batch.
- **There is still no usage alarm, and there is no good way to build one.** The Management API
  documents no organization egress/quota endpoint, and it needs a personal access token, which
  this **public** repo has nowhere safe to keep. The guard specs replace it by measuring our
  own consumption instead of Supabase's counter — which is the better signal anyway: the
  incident was never "we failed to notice the meter", it was "we did not know QA hit prod".

### Recompressing what was already in Storage (2026-08-29)

- **Storage size and egress are different problems.** The bucket held 38.70 MB, but only
  **24.55 MB of it was ever served**: 11 backgrounds a page actually selects, 3 hero banners,
  71 covers. The other **18 library images (14.15 MB) are referenced by nothing**, so
  compressing them would have saved exactly zero egress. Cross-reference `page_backgrounds`
  and `site_settings.hero_banner` against the bucket listing before deciding anything here.
- **Six files carried 68% of the served weight** — the 3 banners plus the 3 backgrounds over
  1 MB. Recompressing only those took **16.72 MB → 1.07 MB (15.6×)**, and the served total
  from **24.55 MB → 8.90 MB**. Against the 5 GB quota that is 208 → **575** full cold passes
  a month.
- **No pixels were lost.** Every original was already under the 1920 px long edge (1672×941,
  1336×752), so `shrinkImage` never resized — the entire 15.6× came from re-encoding PNG to
  WebP. PNG was simply the wrong container for flat illustration art.
- **Overwrite in place; never re-upload to a new path.** Same key + `upsert` keeps the public
  URL identical, so **not one row of `page_backgrounds` or `site_settings` had to change** —
  and the `elements` laid out on each background were never at risk. Uploading to a fresh
  timestamped path would have meant re-pointing every row by hand.
- **The objects still end in `.png` but hold WebP bytes.** Browsers dispatch on `Content-Type`,
  not the extension, and the upload sets `image/webp`. Verified by loading all six in a real
  browser: every one decodes at its original dimensions, and the production home page paints
  its banner with zero failed Storage requests.
- **Covers were deliberately left alone.** 71 files averaging 76 KB, already JPEG at the
  800 px cover size — perhaps 2-3 MB to gain for 71 overwrites of live data. Bad trade.
- **⚠ The auth gotcha that cost two runs.** A supabase-js client built _before_ the operator
  logs in holds no token, and `is_admin()` reads `auth.uid()` — so every check returns
  `false` and it reads exactly like a permissions problem when it is an ordering problem.
  Wait for `sb-*-auth-token` to appear in `localStorage`, **then** create the client with
  `global.headers.Authorization` pinned to that token.
- **Originals:** the `_storage-backup-20260829` folder was sent to the Recycle Bin on `2026-10-19`
  after confirming (sha1) that all six originals also live outside the repo: banners in
  `D:\_TPS\reading adventure\메인 히어로 섹션 배너_tps제공\`, backgrounds in
  `D:\_TPS\reading adventure\피드백_0717_레벨별 백그라운드 이미지 요청\LEVEL 1~3\`. Restoring = recompress
  those and upsert to the same Storage paths. Don't delete those two folders.
- **New uploads need none of this** — `shrinkImage` has compressed them since the Phase 1
  deploy. This was strictly a one-time cleanup of what predated it.

## Video player modal (Vimeo)

- The custom video modal (Level 1 / March) drives a Vimeo iframe via the **Vimeo Player SDK**
  (`<script src="https://player.vimeo.com/api/player.js">`, loaded before `app.js`). It's an
  external CDN script — fine for the static no-build deploy, but make sure `.vercelignore`
  doesn't exclude anything it needs (it doesn't; the SDK is remote).
- **YouTube captions OFF relies on the unofficial `unloadModule` (`2026-10-08`, deployed `2026-10-19`).**
  Some viewers have "always show captions" on in their YouTube account / OS settings, and with
  `controls:0` + `disablekb:1` a child cannot turn CC off. There is no official off switch
  (`cc_load_policy` only documents `1` = force ON), so `disableYouTubeCaptions(yt)` calls
  `unloadModule("captions")`/`("cc")` in try/catch from `onReady`, PLAYING and `onApiChange` — the
  module loads lazily after playback starts, so **keep all three calls**. If captions reappear
  someday, YouTube probably changed this API (it fails silently). No automated test covers it; the
  fix was verified by the user in a real browser. Vimeo, if ever needed: official `disableTextTrack()`.
- **ESLint `no-undef`:** reference the SDK as `window.Vimeo` (e.g. `new window.Vimeo.Player(...)`),
  not the bare `Vimeo` global, or `eslint app.js` fails. Always guard with `window.Vimeo &&
window.Vimeo.Player` since the SDK loads async and may be absent (offline / headless).
- Vimeo has no "stop": emulate with `pause()` + `setCurrentTime(0)`. With `controls:0` the native
  fullscreen button is gone too, so the **Maximize** button uses the browser Fullscreen API on the
  player card. Progress comes from the `timeupdate` event (`data.percent`, `data.duration`).
- **Play/Pause is one toggle** synced off the Vimeo `play`/`pause`/`ended` events (not optimistic),
  so the icon is always correct. **Clicking the video** must go through a transparent overlay
  (`.vp-click-layer`, `z-index` above `.vp-frame`) — the cross-origin Vimeo iframe swallows clicks,
  so a bare click handler on the stage never fires.
- **Rounded-corner dark seam:** Chrome won't clip a child `<iframe>` by an ancestor's
  `border-radius`, leaving a thin dark arc at the stage corners. Fix = (1) promote the clipping box
  to its own layer (`transform: translateZ(0)` on `.vp-stage`, `overflow:hidden`, `border-radius`),
  and (2) keep the **iframe SQUARE (no border-radius) and overscan it 1px beyond the stage**
  (`top/left:-1px; width/height:calc(100% + 2px)`) so the rounded clip always cuts through solid
  video. ⚠ Do NOT round the iframe itself — that's what _caused_ the dark seam (the iframe's own
  rounded corner exposed the dark stage background underneath). Headless can't reproduce the seam
  (no real playback), so verify the geometry (square + overscan), not pixels.
- **Mobile-portrait volume = vertical tap popover (not hover).** Touch has no hover, so the desktop
  hover/`:focus-within` reveal never opens by tap. On `@media (max-width:767px) and
(orientation:portrait)` the `#vpVolume` slider becomes a VERTICAL popover above the speaker, opened
  by `.vp-volume-open` (toggled in `app.js` when `#vpMute` is tapped). Gotchas:
  - **Single `--vol` custom property** drives fill/thumb for BOTH orientations: horizontal desktop CSS
    maps `--vol`→`fill width`/`thumb left`; the mobile block remaps it→`height`/`bottom`. `reflectVolumeUI`
    only sets `--vol` (don't re-add inline `style.width`/`left` — and the `#vpVolumeFill`/`#vpVolumeThumb`
    JS refs were removed as now-unused; eslint `no-unused-vars` will fail if you re-add them unused).
  - **Drag ratio is orientation-aware:** vertical uses `(rect.bottom - clientY)/rect.height` (up = max),
    horizontal uses `(clientX - rect.left)/rect.width`. The vertical test is `vpVolVertical()` =
    `matchMedia("(max-width: 767px) and (orientation: portrait)")` — **keep this string byte-identical
    to the CSS media query** or JS and CSS disagree about orientation.
  - **Neutralise the desktop reveal on mobile:** tapping the speaker focuses it (`:focus-within`), which
    would re-show the slider in the wrong (horizontal) spot. The mobile block redeclares
    `.vp-volume:hover/:focus-within .vp-volume-slider{opacity:0…}` (same 0,3,0 specificity, later in the
    file so it wins) BEFORE the `.vp-volume-open` open rule (which must come after to win when both match).
  - **Fullscreen coexistence:** the FS chrome auto-hides after 2.5s (`revealFsControls`). While the volume
    popover is open, `openVolume()` cancels `vpHideTimer` + pins `vp-controls-visible`; `closeVolume()`
    re-arms it. Popover `z-index:7` sits above the FS scrim (5/6). Always `closeVolume()` on modal close
    and on leaving fullscreen.
  - ⚠ iOS Safari often ignores programmatic `setVolume` (media volume is hardware-only) — the popover UI
    works but audio level may not change on some real devices. That's why YouTube/Vimeo mobile show no
    on-screen volume. Verify on a real device before assuming it's broken.
- **Headless can't actually play Vimeo:** Playwright synthetic clicks aren't a user-activation
  gesture for media, and even with `--autoplay-policy=no-user-gesture-required` the video stays
  buffering (spinner), so `play` never fires and the toggle won't flip in headless. Verify the
  play↔pause icon swap by setting `#vpToggle[data-playing]` directly and checking the icon
  `display`; trust the SDK events for real-browser playback.
- **Domain-locked Vimeo (2026-10-12):** some publisher videos (e.g. Muzzy via
  `tps-education.com/58?video=<id>`) are Vimeo "embed only on specific domains". Vimeo checks the
  iframe request's Referer, so the bare id from our domain returns "Because of its privacy
  settings, this video cannot be played here" — and the owner (overseas publisher) won't quickly
  add our domains. So `parseVideoSource` classifies any http(s) URL on a non-Vimeo host as
  `kind:"page"` and `mountExternalPage` **frames the publisher page itself** (its own Vimeo iframe
  is then requested from the allowed domain and plays). `.vp-external` hides our click layer and
  control bar — there's no `activePlayer` for that page. The page auto-opens its modal from
  `?video=`; if the publisher changes that page, these slots break and only they can fix it. Don't
  try Referer spoofing or proxying instead — that bypasses the owner's restriction.
- The modal opens on **every** level/month now (`openSlot()` → `getVideoUrl()`; an empty slot shows
  Coming soon). The old Level 1 / March-only gate `isLevel1March()` no longer exists (corrected
  `2026-10-19`). When testing per-route behavior, still use a **fresh Playwright page per route**
  (hash-only navigation doesn't re-run `app.js`, so `state.level` leaks — see the hash-nav note
  below).

## Responsive layout (hero, content board)

- **The lesson/weekday board overflows _inside_ `.lesson-board`, not the document.** `.lesson-board`
  has `overflow-x:auto` and `.lesson-grid` had `min-width:900px`, so on narrow viewports Thu/Fri get
  cut off behind an internal scrollbar while `document.documentElement.scrollWidth` still equals
  `clientWidth` (no page scroll). When checking for "no horizontal scroll," measure the **board's**
  `scrollWidth` vs `clientWidth`, not just the document's.
- **7-col board doesn't fit narrow screens.** The board is `[book card][week label][Mon–Fri]` = 7
  columns. It fits tablet landscape only after dropping the `min-width:900` floor + tightening
  padding/gaps (`@media 768–1249px`); it can't fit a phone at all, so on mobile (`≤767px`) the book
  cover is promoted to its **own full-width row** (`.book-title-card{grid-column:1/-1;grid-row:auto}`)
  leaving a 6-col `44px + repeat(5,1fr)` day grid. Full-width covers use `background-size:contain`
  (not `cover`) so the portrait cover isn't cropped to a wide band.
- **Breakpoint handoff math:** the base desktop board (900px grid + `clamp(106,6vw+50,146)` content
  padding + 50px board padding) only fits when `0.88·W − 200 ≥ 900`, i.e. **W ≥ 1250px**. So the
  tablet override must run up to **1249px** or a 1181–1249px gap still overflows. If you change the
  padding clamp or grid min, recompute this handoff width.
- **Hero buttons ABOVE the wave, image BEHIND it.** `.hero-wave` is `z-index:2`, a sibling of
  `.hero-grid`. The trick: **`.hero-grid` must NOT have a z-index** (so it creates no stacking
  context), and its children compete directly with the wave — `.hero-copy{z-index:3}` (text + app
  buttons on top of the white curve) and `.hero-image` / mobile `.hero-stage` at `z-index:1`
  (characters tuck behind it). ⚠ Do NOT raise `.hero-grid` itself (an earlier attempt set it to
  `z-index:3`) — that lifts the image above the wave too, so the characters stop emerging from behind
  the white curve. With this split, a tall copy column (tablet landscape) still keeps the buttons
  visible because they sit above the wave by z-index, not by vertical space.
- **Mobile hero is auto-height, not `--hero-height`.** Desktop/tablet pin the hero to a fixed
  `--hero-height` (620/380/340px) via `height` on `.hero-section.section-blue` + its `.section-inner`.
  On mobile that clipped the stacked content, so the `≤767px` block sets both to `height:auto` and
  the image (`.hero-stage`) goes from an absolute faded background to an in-flow block below the copy.
- **`.section-inner` is `min(80%, …)` wide by default** — on a phone that's only 80% of the viewport
  with big side margins. `#contentScreen .section-inner` is forced to `width:100%` (≥768 block); the
  mobile hero now does the same so the copy isn't needlessly narrow.

## Full-height fill & the `100vh − 185px` magic number

- **The tinted screen sections fill height via `min-height: calc(100vh − 185px)`** (`#monthScreen` /
  `#contentScreen` `.screen-active`), where **185 ≈ header + footer** at the DEFAULT (desktop/portrait)
  heights. The `<body>` is a flex column with `main{flex:1 0 auto}`, but the section itself is `display:block`
  — so this calc, not flex-grow, is what makes the level-tint background reach the footer.
- ⚠ **If a media query changes the header or footer height, this constant is wrong** and a white band
  appears between the section and the footer (the `<main>`/`<body>` `--canvas` bg showing through). This bit
  the **landscape tablet** month page: the round-12 block trims the footer to 16px padding (~50px) and the
  header is ~86px → real total **136**, so the base 185 over-subtracted ~49px → white gap. It bit AGAIN on
  desktop when the level-page copyright font shrank 13→11px (footer ~3px shorter → 3px white line on every
  level page). **Safety net (2026-07-21): `body[class*="level-theme-"] main` now carries the level tint**,
  so constant drift can no longer show white — but keep correcting the constant for real layout math. Fix = override the
  constant for that context (`calc(100vh − 136px)`) AND flex the inner `.section-box.section-white{flex:1;
display:flex; flex-direction:column; justify-content:center}` so content fills + vertically centers.
  The **content page** (`#contentScreen`) hit the SAME gap in landscape tablets and took the SAME
  `calc(100vh − 136px)` fix — but it only needs the min-height corrected (its `.section-blue` already carries
  the tint, so no inner flex; the board stays top-aligned and the tint fills below it to the footer).
- **Content banner is ONE row at every breakpoint (2026-08-01).** It used to stack the level name over a
  60px month circle (112.8px tall); it is now `grid-template-columns:auto auto` + `align-items:center` +
  **`justify-content:center`** (required — the banner is a stretched flex item of `.section-inner`, so
  without it the two auto tracks pin left) with a 46px/28px circle → **46px tall**. The landscape-tablet
  block had shipped this shape since round 12 and now only keeps its tighter `column-gap:12px` /
  `margin-bottom:8px`. Dead `#contentLevelBand` rules were deleted (the element left the markup long ago).
- ⚠ **The 86.8px the one-row banner frees is paid back as `padding-bottom` — do not "clean that up".**
  `positionBgElFrame()` sizes `.page-bg-el-frame` from the live `.section-inner` rect and saved background
  elements are stored as **% of that box**, so changing `.section-inner`'s height moves every already-placed
  decoration. The compensation is deliberate and must stay balanced: banner 112.8→46 (−66.8) + banner
  `margin-bottom` 26→14 (−12) + `[data-month] .section-inner` `padding-top` 20→12 (−8) = **−86.8**, returned
  as `padding-bottom` 96→**183** (`@media min-width:768px`) and 64→**151** (`@media max-width:767px`).
  Net height change ≈ +0.2px, and the freed space lands **inside** the frame at the bottom as the artwork
  band (146→233px desktop). **Change one side of that pair and you must change the other.**
  - ⚠ **PC(≥1181px)는 `2026-08-03`부터 예외다.** 페이지2에 세로 스크롤바가 생긴다는 요청으로
    PC에서만 하단 여백을 **234px 걷어냈다** — 새 `@media (min-width:1181px)` 블록에서
    `#contentScreen .section-inner{padding-bottom:4px}` +
    `#contentScreen .lesson-board{padding-top:14px; padding-bottom:6px}`.
    그래서 PC 아트워크 밴드는 233 → **10px**로 사실상 없다. 태블릿(183/68)·모바일(151)은
    위 균형 그대로다. 이 블록은 반드시 `@media (min-width:768px)`의 183px 규칙 **뒤에** 둬야
    한다 — 둘 다 `#contentScreen .section-inner`(1,1,0)라 소스 순서로 결정된다.
    파일 앞쪽(1324·1665행)의 기존 `min-width:1181px` 블록에 넣으면 조용히 죽는다.
  - ⚠ **페이지가 234px 짧아지면 레이어 기준 배경(전체 이미지·가로 100% 밴드)이 콘텐츠 대비
    위로 올라온다.** 실제로 L1/March의 저장된 노란 밴드가 마지막 요일 버튼 줄과 7px 겹치게
    됐다(버튼 뒤로 깔리므로 치명적이진 않다). 페이지 높이를 바꾸면 저장된 배경을 눈으로
    확인할 것.
- ⚠ **`#contentScreen[data-month] .section-inner` (1,2,0) silently beats every `#contentScreen
.section-inner` (1,1,0) rule — including ones inside media queries.** The landscape-tablet block's
  `padding-top:16px` had therefore never rendered (the real value was 20px). When the base dropped to 12px
  that block had to be **promoted to `[data-month]`** to stay frozen. The same trap hit
  `#contentScreen .content-main-header{margin-bottom:6px}` in that block — also dead until promoted.
  Check specificity before assuming a breakpoint override on this element applies at all.
- **The banner is lifted onto the Back/Next row with a negative margin, per breakpoint.** Left alone it
  is bottom-heavy — it is its own flex row under the Back/Next row, so the air above it (from the body's
  top edge) is 60–70px while the gap down to the toolbar is 14px. Each shift is a **−N/+N pair**
  (`margin-top:-N` + the same N added to `margin-bottom`) so the toolbar, the board and
  `.section-inner`'s height (= the bg-element frame) never move:
  | breakpoint | margin-top | margin-bottom | result (above/below) |
  | --- | --- | --- | --- |
  | PC `≥1181px` | −30 | 44 (14+30) | 40 / 44 |
  | tablet `768–1180` | −28 | 42 (14+28) | 42 / 42 |
  | tablet `768–1180` landscape | −26 | 32 (6+26) | 40 / 40 |
  ⚠ The values differ because each breakpoint has its own `padding-top` / header + banner
  `margin-bottom`; **recompute the pair rather than copying a number** when any of those change.
  ⚠ The banner BOX is full-width (a stretched flex item), so a rect-overlap test against the nav buttons
  is meaningless — measure `#contentLevelName` / `.content-banner-month strong` instead. Clearance is
  175–366px per side on tablets and PC.
- **Mobile (`<768px`) is deliberately NOT lifted** (60/14, still bottom-heavy). The nav buttons leave only
  ~17px of horizontal clearance beside the banner there, so raising it onto their row would crowd them.
  Fix that first if mobile centring is ever requested.
- **Landscape tablet (Galaxy Tab S4 1138×712) reclaimed 50px for the artwork band.** The slack was above
  the board: `.content-toolbar` `margin-top:36→8` / `margin-bottom:16→10` (the biggest pocket by far),
  `.section-inner` `padding-top:20→10`, header + banner `margin-bottom` `8→6` each, `.lesson-board`
  `padding-top:6→4`. All 50px went back as `padding-bottom:18→68`, so height stays 578px and the band
  grows 28→78px. This viewport has no spare height (docH == vh, no scroll), so **do not add net height
  here** — always trade above-the-board space for below-the-board space.
- **Landscape-tablet month buttons are width-capped for device parity.** Buttons are `1fr` of
  `--content-width` (`min(80%,…)`), so a wider tablet gets bigger buttons (Tab 1138 vs iPad 1024). Cap with
  `#monthScreen .month-grid{max-width:800px; margin-inline:auto}` → identical ~135px squares on both.
- ⚠ **Capping a button decouples it from the viewport — so any `vw`-based font inside it breaks.** The month
  number is `clamp(40px,7vw,92px)` and the label `1.6vw`; once the button is capped at ~135px, `7vw` at
  1138px still yields an ~80px number that overflows and **overlaps the absolutely-positioned top-left label**.
  Fix: in the capped (landscape-tablet) block, size the inner fonts with CONSTANTS that fit the fixed button
  (`strong{font-size:52px}`, label `span{top:16px;left:16px;font-size:14px}`) — not `vw`. The number is
  `align-self:center` (dead-center) while the label is `position:absolute;top:…`, so they collide whenever the
  centered number's box-top rises above the label's bottom. The cleaner long-term fix is container units
  (`.month-button{container-type:inline-size}` + `cqi` number) so the font always tracks the button regardless
  of caps — deferred (would also change the portrait/desktop sizing).

## Breakpoint gap: small portrait tablets (600–767px)

- **768px is the phone↔tablet divide, but tablets exist BELOW it.** Galaxy Tab S4 portrait is **712px**,
  Tab S7 **753px** — both `< 768`, so they miss every `@media (min-width:768px)` tablet rule and fall into
  the **phone path** (e.g. `.month-grid repeat(2)` + `(max-width:767px) portrait` `aspect-ratio:1/1`),
  which blows month buttons up to ~330px 2-col squares. iPad portrait (768) is fine because it just clears
  the bar. Fix pattern: a dedicated **`@media (min-width:600px) and (max-width:767px) and
(orientation:portrait)`** block that pulls the tablet layout (5-col compact) down into the gap. `min-width:600`
  keeps real phones (≤ ~430 portrait) out. Reuse the tablet block's vw-clamp font sizes so it matches iPad.
- ⚠ This gap can bite ANY screen that switches layout at 768, not just the month grid — when a portrait
  tablet "looks like a giant phone", suspect the 600–767 gap first. (So far only the month screen is patched.)

## Logo & week-label markup gotchas

- **The wordmark letters are NOT in `.brand-name`.** `.brand-name` is the flex wrapper; the visible
  "Reading"/"Adventure" letters are the child spans **`.brand-accent` / `.brand-adventures`**, each
  with a fixed `font-size: 33px`. To resize the logo you must target those two spans (e.g. scoped to
  a mobile media query) — changing `.brand-name` font-size only moves the inter-word gap, not the
  letters.
- **`.week-label` is `display:grid; place-items:center`** — every _top-level_ child becomes its own
  grid row. So `renderLessons` must wrap the week number + word in a SINGLE inline span
  (`.wk-text`); two sibling spans directly under `.week-label` stack vertically ("1" over "week")
  instead of reading "1 week". Mobile hides `.wk-word` to show just the number.

## Verification & tooling

- For visual-fidelity work, screenshot via Playwright and compare. `toHaveScreenshot({ animations:
'disabled' })` freezes the hero animation for stable pixel diffs — capture a baseline before,
  compare after.
- Playwright one-off scripts must live in the **project dir** (not `/tmp`) to resolve
  `@playwright/test` from `node_modules`. Import from `@playwright/test` (bare `playwright` isn't
  installed). Remember `b` = browser, `p` = page (`p.screenshot`, not `b.screenshot`).
- Navigating only the URL **hash** on the same Playwright page does NOT re-run `app.js` init
  (theme/state not re-applied). Use a **fresh page per level/route** when measuring.
- If you `display:none` an element a smoke test asserts visible (e.g. the content `#contentTitle`
  heading), the test breaks — update it to assert a now-visible element (e.g. `#contentLevelName`).
  Note `getByRole` ignores `display:none` nodes (out of the a11y tree), so duplicate-text headings
  on inactive screens don't trigger strict-mode conflicts.
- `npm.cmd run qa` runs Prettier over `*.md` too — run `npx prettier --write` on edited markdown
  or `check`/`qa` fails. Playwright browsers need `npx playwright install chromium` once.
- **If every Playwright test fails at once, check the browser cache before the code.** On
  `2026-10-19` all 126 failed with `browserType.launch: Executable doesn't exist at
…\ms-playwright\chromium_headless_shell-1223\…` — Chromium had vanished from
  `%LOCALAPPDATA%\ms-playwright` (only WebKit left). `npx.cmd playwright install chromium` fixed it.
- Always delete temp verification files (`_*.mjs`, `_*.png`) afterward — they are not gitignored.
- **Git Bash mangles `/q/...`-style strings in `curl -w` output** (MSYS path conversion turned
  `/q/b/3/w1-mon/` into `Q:/b/3/...` and `/` into `C:/Program Files/Git/`, `2026-10-19`). Prefix the
  command with `export MSYS_NO_PATHCONV=1;` when printing or passing URL paths, and read redirects
  from `curl -sI … | grep -i location` rather than `%{redirect_url}`. With it on, `/tmp/...` is no
  longer translated either — `curl -o /tmp/x` then fails silently; use a Windows path (`C:/...`).
- `scripts/run-playwright.mjs` passes extra arguments to Playwright (one file, `-g`, `--workers=N`).
  Or start Vite yourself (`node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173`), run
  `npx.cmd playwright test <file> -g <name>`, then stop Vite before `qa`.
- **전체 qa가 메모리 부족으로 멈추면** `npm.cmd run check` 뒤 `node scripts/run-playwright.mjs --workers=4`
  (설정 파일은 바꾸지 않는다, `2026-11-02`).
- A local static server matching the deploy (serve repo root, hash routing handled client-side)
  is the faithful way to preview; the Vite dev server also works for local checks.
- **Line endings (Windows):** `.gitattributes` (`* text=auto eol=lf`) forces LF so Windows
  autocrlf doesn't fight Prettier (which expects LF). Symptom without it: a `git checkout`
  re-CRLFs a file and `prettier --check` then fails on an otherwise-clean file, while
  `git diff --ignore-all-space` shows no content diff. Fix: `git add --renormalize .`. Avoid
  `git checkout -- <file>` on prettier-checked files unless you re-`prettier --write` after.
- **Never round-trip source files through PowerShell 5.1 text cmdlets** (`Get-Content` /
  `Set-Content` / `-replace` pipelines). The files are UTF-8 **without BOM**, so `Get-Content`
  reads them as ANSI/CP949 and silently mangles every multibyte char (♪, 📖, ★, — → `??`),
  and `-Encoding utf8` writes a BOM on top. This corrupted `app.js` once (recovered via
  `git checkout`). Do bulk replacements with the harness Edit tool (`replace_all`) instead.
- **No double quotes (`"`) inside `git commit -m` messages under PowerShell 5.1** — even in a
  single-quoted here-string (`@'…'@`), PS 5.1's native-arg requoting breaks at embedded `"`,
  splitting the message into bogus pathspecs (`error: pathspec '…' did not match`) and failing
  the commit. Symptom seen 2026-07-21. Fix: reword without `"`, or write the message to a temp
  file and use `git commit -F <file>`.
- **PowerShell `@'…'@` here-string = `@` 리터럴 오염 재발 위험.** 멀티라인 커밋 메시지를
  PowerShell here-string(`@'…'@`)으로 `git commit -m`에 넘기면 `@` 문자가 메시지에 남는 사례
  확인(2026-07-22). **권장: Git Bash heredoc 사용** — `git commit -F - <<'MSG' … MSG` 형식은
  `@` 오염이 없고 한국어·특수문자도 안전. PowerShell 5.1에서 멀티라인 커밋이 꼭 필요하면
  `git commit -F <tempfile>` (Bash `echo … > tmp && git commit -F tmp`)을 쓸 것.

## 히어로 배너 캐러셀 (`hero-banner.js`)

- **흰 곡선은 슬라이드 밖 고정 레이어다 (`2026-08-02`).** `.hero-section` 안에서
  `.hero-slides`(z1) / `svg.hero-wave`(z2)로 분리했다. 슬라이드가 `transform`·`opacity`로
  애니메이션하면 **자기 쌓임 맥락**을 만들어 내부 z-index가 밖으로 못 나가므로, 곡선을
  슬라이드 안에 넣으면 복제·이음매 문제가 생긴다. 밖에 두는 것이 정답. **곡선을 슬라이드
  안으로 옮기지 말 것.**
- **기본 히어로 슬라이드는 normal flow에 남아야 한다.** `.hero-slide--default`가 히어로
  높이를 정의하고 배너는 `absolute; inset:0`으로 그 박스를 채운다. 기본 슬라이드를
  absolute로 바꾸면 히어로 높이가 0이 되고 모바일(`height:auto`)이 붕괴한다.
- **애니메이션 CSS는 전부 `.hero-carousel--slide` / `--fade` 스코프 안에 둔다.** 배너가
  0장이면 hero-banner.js가 이 클래스를 붙이지 않아 **transition·transform·쌓임 맥락이 전혀
  생기지 않는다** → 배너 없는 상태는 기능 도입 전과 완전히 동일. 스코프 밖에 규칙을 쓰면
  이 보장이 깨진다.
- ⚠ **`.hero-copy`가 곡선 아래로 내려가면서 앱버튼 여백이 필수 조정 사항이 됐다.**
  이전엔 `.hero-copy`가 z3으로 곡선 위에 그려져 겹쳐도 보였지만, 이제 슬라이드 레이어
  안이라 **기하학적으로** 곡선을 피해야 한다. 조정 위치 2곳:
  - 베이스 `.hero-copy { padding-bottom: 172px }` — **≥1181px에만 유효**(768~1180 블록과
    ≤767 블록이 각각 덮어씀).
  - `@media (min-width:768px) and (max-width:1180px)` 블록의
    `.hero-section{height:auto; min-height:var(--hero-height)}` + `.hero-copy{padding-bottom:200px}`.
    ⚠ **768~900에서는 앱버튼이 2줄로 감싸져 130px**(다른 폭은 58px)이 되는 것이 여유를
    잡아먹는 진짜 원인이다. 이 구간 수치를 줄이려면 반드시 재실측할 것.
    ⚠ 여백을 건드리는 규칙은 상한 없는 `@media (min-width:768px)` 블록이 아니라
    **768~1180 블록**에 넣어야 한다 — 한 번 잘못 넣어 1920 히어로 높이가 434→464px로
    늘어난 적 있다.
- **여유 측정은 SVG 바운딩 박스가 아니라 path 샘플링으로.** 곡선의 흰 칠은 path 아래쪽만
  차지하므로 `.hero-wave`의 rect로 재면 과대평가된다. `path.getPointAtLength` 이분탐색으로
  버튼 x범위의 곡선 y를 구할 것(테스트에 `HERO_CLEARANCE` 헬퍼로 구현됨).
  ⚠ **측정 전 `document.fonts.ready` + 리사이즈 후 안정화 대기 필수** — 폰트 로딩과 캐릭터
  리그 리플로우 때문에 값이 최대 20px까지 흔들린다(이 때문에 초기 측정이 잘못 나왔었다).
- **타이머 정지는 app.js를 안 건드리고 `body[data-screen]` MutationObserver로.**
  `showScreen()`이 이미 이 속성을 쓴다. `visibilitychange`도 같은 핸들러를 재사용한다.
- `site_settings.hero_banner` jsonb — `mode`/`interval`/`focus`는 전부 화이트리스트 폴백
  (`normalizeHeroConfig`). 공개 데이터라 잘못된 값이 메인을 깨면 안 된다.
- 배너 업로드는 **`backgrounds` 버킷의 `banners/` 프리픽스** (배경 편집기는 `library/`).
  새 버킷·정책이 필요 없다.
- ⚠ **`/`로 처음 들어오면 `body[data-screen]`이 없다.** `index.html`의 `#homeScreen`이
  정적으로 `.screen-active`라 초기 로드에서는 `showScreen()`이 호출되지 않는다. 그래서
  `heroOnHome()`은 **속성이 없는 경우도 홈으로 취급**해야 한다 — 이걸 빠뜨려 "새로고침으로
  홈에 들어오면 캐러셀이 아예 안 도는" 버그가 있었다(`2026-08-02` 수정). `data-screen`으로
  화면을 판별하는 새 코드는 전부 같은 함정을 조심할 것.
- **전환 시간은 `--hero-transition` CSS 변수**(`hero-banner.js`가 주입, 1~5초). CSS의
  600ms는 폴백일 뿐이다. 순환 주기는 **`duration + interval`** — "유지 시간"이 배너가
  완전히 보이는 시간이라는 뜻이 되도록 한 것이고, 덕분에 긴 페이드가 짧은 유지 시간을
  잡아먹는 조합을 따로 검증할 필요가 없다.
- ⚠ **페이드는 "양쪽 opacity를 동시에 반대로" 굴리면 안 된다 (`2026-08-04` 수정).**
  두 슬라이드가 **각각 독립 합성**되므로 50/50 지점의 실제 픽셀은
  `0.5·새 + 0.25·옛 + 0.25·배경`이 되어 히어로 딥블루로 **가라앉는다**. 고정 50/50
  프레임 픽셀 측정으로 진짜 크로스디졸브 대비 **채널당 평균 30.03/255(최대 53.5)** 오차
  확인. 게다가 새 배너 가중치가 옛 배너의 2배라 전환이 실제보다 훨씬 급하게 느껴진다.
  → **나가는 슬라이드를 `is-leaving`으로 불투명하게 붙잡아 두고, 들어오는 슬라이드만
  0→1로 올린다** (`a·새 + (1−a)·옛`). 수정 후 오차 **0.33/255(최대 1.5)**.
- **그래서 들어오는 슬라이드는 반드시 위에 그려져야 한다** — `heroGoTo`가 단조 증가
  `heroState.zTop`을 인라인 `z-index`로 준다. DOM 순서만 믿으면 배너N→N+1은 맞지만
  **마지막 배너 → 기본 슬라이드(wrap)에서 역전**되어 옛 배너가 끝까지 비친다.
  `applyHeroBanner`는 재사용되는 기본 슬라이드의 인라인 `z-index`를 반드시 지울 것.
  (`.hero-slides`가 z1 쌓임 맥락이라 슬라이드 z가 아무리 커도 곡선 z2를 못 넘는다 — 안전.)
- **기본 슬라이드에 `background: var(--deep-blue)`가 필요하다.** 원래 배경이 없어
  (섹션이 칠한다) wrap에서 페이드인하는 동안 옛 배너가 계속 비치다가 끝에 튄다.
  단, **`.hero-carousel--*` 스코프 안에** 둬야 배너 0장일 때 무변경 보장이 유지된다.
- ⚠ **`is-leaving`을 뗄 때는 트랜지션을 꺼야 한다.** 그냥 떼면 opacity 1→0(페이드)나
  translateX −100%→100%(슬라이드)가 **전환 시간 내내 거꾸로 재생된다**(슬라이드 모드에서
  `tx: -1349 → -939 …`로 실측). `heroResetSlide()`가 `.is-resetting`(`transition:none`)을
  붙이고 `getBoundingClientRect()`로 플러시한 뒤 뗀다.
- ⚠⚠ **배너 캐러셀은 `prefers-reduced-motion` 예외다 — 이 블록을 되살리지 말 것
  (`2026-08-04`, 두 번 데임).** 히어로 캐릭터 리그·타이틀 워드 리빌과 같은 취급이다.
  관리자가 **전환 방식을 명시적으로 고르므로** 슬라이드는 실제로 슬라이드해야 한다.
  이 한 블록이 사용자 리포트 **2건을 연달아** 만들었다:
  1. `transition-duration: 0ms` → 모든 전환이 **즉시 컷** ("페이드가 안 보인다")
  2. 고치면서 넣은 `transform: none` → **슬라이드가 조용히 페이드로 격하**
     (이동량 실측 **1346px → 0px**) ("슬라이드가 안 보인다")
     ⚠ **둘 다 진단이 극히 어렵다** — 모드 클래스(`hero-carousel--slide`), `--hero-transition`,
     `state().mode`, transform 규칙이 **전부 정상으로 보이는데** 렌더링만 다르다. 게다가
     개발자 머신에 reduce가 꺼져 있으면 자동화 테스트에서 100% 재현되지 않는다.
     → **증상으로 구분하는 법**: 슬라이드를 골랐는데 **페이드처럼 보이면** reduce,
     **즉시 바뀌면** 다른 원인. (레지스트리 `UserPreferencesMask`나 Playwright가 띄운
     임시 프로필 Chrome은 사용자의 실제 브라우저와 다를 수 있으니 신뢰하지 말 것.)
     reduce를 다시 존중해야 하면 CSS 오버라이드가 아니라 **관리자 옵션**으로 뺄 것.
- ⚠ **배너 탭의 비동기 로드가 사용자의 선택을 덮어쓴다 (`2026-08-04` 수정).**
  `.admin-menu-btn[data-admin-view="banner"]` 핸들러가 `site_settings`를 fetch한 뒤
  `heroDraft = ...; syncHeroPanel()`을 무조건 실행했다. 그래서 **탭을 열자마자 옵션을
  바꾸면** 뒤늦게 도착한 fetch가 라디오를 저장값으로 되돌리고, 그 상태로 저장하면
  **옛 값이 그대로 다시 저장된다** — "전환 방식을 슬라이드로 바꿔도 적용 안 됨"의 정체.
  → `heroPanelLoad` 토큰: 탭 열기와 **모든 편집**(`heroEdited()`)이 증가시키고, 로드가
  끝났을 때 토큰이 바뀌었으면 결과를 버린다. 모드뿐 아니라 전환/유지 시간·배너 목록도
  같은 함정이었다.
  ⚠ **재현 테스트를 쓸 땐 저장값과 다른 값을 골라야 한다** — 저장값과 같은 값을 고르면
  덮어써도 티가 안 나서 "정상"으로 보인다(한 번 이 함정에 빠져 잘못 판정했다).
- **저장 버튼은 draft ≠ saved 일 때만 활성.** `heroSavedJson`(마지막 저장 상태의 JSON)과
  `normalizeHeroConfig(heroDraft)`의 JSON을 비교(`heroDraftChanged()`). "한 번이라도
  건드렸는가"가 아니라 **실제 차이**를 보므로 손으로 되돌리면 다시 비활성화된다.
  `normalizeHeroConfig`가 항상 같은 키 순서로 뱉기 때문에 문자열 비교가 성립한다 —
  필드를 추가할 때 이 전제를 깨지 말 것. 저장 중에도 disabled로 이중 제출을 막고,
  실패 시 `refreshHeroSaveState()`로 되살린다.
- ⚠ **`transition-duration` 계산값만 단언하는 테스트는 하드컷을 못 잡는다.** 하드컷도
  크로스페이드도 **끝값은 똑같이 opacity 1**이다. 전환 **도중**을 rAF로 샘플링해야 한다
  (`heroFadeTrace` 헬퍼). 실제로 이 구멍 때문에 reduce 하드컷이 테스트를 통과해 배포됐다.
  ⚠ 갓 삽입된 슬라이드는 **초기 스타일이 한 번 확정된 뒤**라야 전환이 걸린다 — 테스트에서
  `applyHeroBanner` 직후 `goTo`를 부르면 전환 없이 점프한다(rAF 2번 대기 필요).
  운영에서는 첫 전환까지 최소 4초라 문제되지 않는다.

## 게임 모달 (`#gameModal`)

- **세로 스크롤의 원인은 문서가 아니라 게임 페이지 내부의 스크롤 컨테이너다
  (`2026-08-02`).** `document.scrollHeight === clientHeight`가 모든 크기에서 참이라
  문서 레벨 측정만으로는 **재현이 안 된다**. 진짜 범인은
  `div.flex-1.min-h-0.overflow-y-auto` (Tailwind flex). 외부 페이지 스크롤을 조사할 때는
  반드시 `overflow-y:auto|scroll` 인 **모든 요소**의 `scrollHeight - clientHeight`를 볼 것.
- **임계값: iframe 뷰포트가 가로 ≥1024 AND 세로 ≥630이면 넘침이 사라진다.** 가로 1024는
  Tailwind `lg:` 브레이크포인트로, 1023 이하로 떨어지면 레이아웃이 세로로 쌓여 **880px**
  높이를 요구한다. 그래서 "모달을 조금 키우는" 식의 대응은 창 크기에 따라 다시 깨진다.
- **해법 = 16:9 카드 + iframe에 항상 최소 1024×630 이상의 박스 보장.** `fitGameFrame()`
  (app.js)이 카드 px를 계산하고 **`ResizeObserver`가 `#gameModal`을 관찰**한다.
  ⚠ 폴백 크기 1280×720을 바꿀 거면 **1024×630 아래로 내리지 말 것.**
- ⚠ **크로스오리진 iframe을 `transform: scale()`로 확대하지 말 것 (`2026-08-03` 버그).**
  브라우저는 그런 iframe을 **자기 레이아웃 크기로 래스터화한 뒤 비트맵을 늘리므로**
  배율 >1이면 그만큼 해상도가 날아간다. 1.24배에서 게임 글자가 눈에 띄게 번졌다
  (같은 카드에서 A/B 크롭 비교로 확인). **축소(<1)는 무해하다** — 다운샘플링이다.
  → `fitGameFrame()`은 카드 세로가 **660px(=630+여유) 이상이면 iframe을 카드 크기 그대로**
  레이아웃하고 `.game-frame-native`로 **`transform:none`**, 그보다 작을 때만 1280×720 +
  축소로 폴백한다. 16:9 카드에서는 세로만 보면 된다(세로 630이면 가로 1120 > 1024).
  ⚠ 확대를 다시 도입하지 말 것 — "조금만 키우면 되지 않나"가 이 버그의 출발점이었다.
- 테스트는 문자열 `transform:none`이 아니라 **계산된 매트릭스에서 배율을 파싱해** 단언한다.
  최대화 전환 중에는 `transform`이 보간되어 `matrix(1,0,0,1,0,0)`으로 나오기 때문이다.
  전환 대기는 **카드 rect + 프레임 transform이 두 샘플 연속 동일**할 때까지.
- ⚠ **scale-to-fit은 PC(≥1181px)에만.** 게임 페이지는 반응형이라 모바일에서 1280px를
  강제하면 배율이 0.3까지 떨어져 못 읽는다. `@media (max-width:1180px)`에서 iframe을
  `100%/none`으로 되돌린다.
- ⚠ **그 미디어 블록은 베이스 `#gameFrame` 규칙보다 뒤에 와야 한다.** 둘 다 `#id`
  (1,0,0)이라 소스 순서로 결정된다 — 처음에 기존 `@media (max-width:1180px)` 블록(베이스
  규칙보다 앞)에 넣었다가 **조용히 무시**되어 모바일에서도 1280×720이 적용됐다.
- ⚠ **카드 크기를 `aspect-ratio`로 잡지 말 것 (`2026-08-02` 버그).**
  `aspect-ratio:16/9; width:90%; max-height:90%`는 **창이 16:9보다 넓으면 깨진다** —
  명세상 `width`가 확정값이면 비율로 높이를 구한 뒤 `max-height`가 높이만 자르고 **폭은
  되줄어들지 않는다**. 카드가 납작해지는데 배율은 `cardWidth/1280`(폭 기준)이라 iframe이
  카드보다 세로로 커지고 `overflow:hidden`이 게임 타이틀·스피커 아이콘을 잘라냈다
  (1899×992에서 61px, 2560×1080에서 316px).
  → **`fitGameFrame()`이 `min(box.w*fill/1280, box.h*fill/720)`으로 카드 px를 직접 계산**한다.
  어떤 창 비율에서도 정확히 16:9다.
- ⚠ **가용 공간은 `#gameModal`의 rect로 재라. `document.documentElement.clientWidth`는 아니다.**
  `scrollbar-gutter: stable` 때문에 둘이 **15px 다르다**(1920 vs 1905). documentElement 값을
  쓰면 최대화 카드가 컨테이너보다 넓어져 다시 비율이 깨진다. `100vw`도 같은 이유로 금지.
- **첫 사이징은 `.game-no-anim`으로 트랜지션을 죽인 뒤 한다.** 컨테이너는 보여야 잴 수
  있는데, 그냥 재면 CSS 폴백 크기(90%)에서 계산값으로 0.2초 애니메이션이 보인다.
  `hidden=false` → `.game-no-anim` 추가 → `fitGameFrame()` → 강제 리플로우 → 클래스 제거.
- `#gameFrame`에도 `transition: transform .2s`가 필요하다 — 최대화 애니메이션 동안 카드만
  움직이고 배율이 즉시 튀면 그 0.2초간 다시 잘린다.
- ⚠ **테스트 뷰포트는 반드시 16:9보다 넓은 것을 포함할 것.** 최초 테스트가
  1920×1080(정확히 16:9) / 1440×900 / 1366×768 / 1280×720만 써서 **경계 위쪽을 한 번도
  안 밟아** 이 버그를 통과시켰다. 지금은 1899×992 · 1920×900 · 2560×1080이 들어있다.
  최대화 후 단언은 **고정 대기 대신 조건 대기**(카드 rect == 인라인 크기)로 — 워커 3개
  병렬에서 300ms가 부족해 flake가 났다.

## 배경 편집기 (`background-editor.js`)

- **요소 좌표계 = 콘텐츠 열 프레임 (`2026-07-26` 변경).** 요소의 `x`/`y`/`w` %는
  `#pageBgLayer` 직속이 아니라 그 안의 **`.page-bg-el-frame`** 기준이다. 프레임은
  `positionBgElFrame()`(app.js)이 활성 화면의 `.section-inner`를 실측해 px로 배치하며
  (resize/load 시 재계산), 뷰어·편집기(`bgElFrame()`) 모두 같은 프레임을 쓴다. 이렇게 해야
  PC(고정 900px 그리드)와 태블릿(별도 미디어블록)에서 요소가 콘텐츠 기준 같은 위치에 온다.
  ⚠ 이 변경 **이전에 저장된 요소 데이터는 좌표 의미가 달라져 위치가 틀어짐** — 편집기에서
  재배치 후 저장해야 한다. ⚠ 전체 배경(`.page-bg-full`)·틴트·스크림은 여전히 레이어
  전체(뷰포트) 기준 — 요소만 프레임 기준.
- **`page_backgrounds.month`는 `null` 대신 `''` (빈 문자열).** Supabase `upsert`의 `onConflict`
  옵션은 표현식 유니크 인덱스(`COALESCE(month,'')`)를 인식 못 해 PK 충돌을 올바르게 처리하지
  못한다. 해결책: `month` 컬럼을 `NOT NULL DEFAULT ''`로 PK에 포함시키고, 레벨 기본값 행에는
  `''`을 저장. 절대 `null`을 upsert하지 말 것 — 같은 행이 중복 삽입된다.
- **배경 레이어 스태킹 — 틴트 투명화는 `body.page-bg-active` 스코프.** 페이지 배경이 활성화되면
  `body.page-bg-active`가 붙고, 이 스코프 안에서 기존 per-level 틴트(`.section-blue`,
  `.section-white` 등)를 `background: transparent`로 초기화해 `#pageBgLayer`가 보이게 한다.
  이 규칙들은 `styles.css` 끝의 배경 섹션에 있으며, specificity 동률일 때는 **소스 순서가
  후순위**이므로 같은 specificity의 배경 관련 오버라이드는 반드시 **파일 끝 배경 섹션에 이어서**
  작성해야 앞에 있는 틴트 규칙을 이긴다. 배경 규칙을 파일 앞에 두면 틴트에 밀린다.
  **틴트 페인터는 전부 투명화해야 한다**: `main`, `#contentScreen.screen-active`,
  `#monthScreen[...].screen-active`, `.section-white`/`.section-blue`, `.site-footer`.
  실제로 `.screen-active` 2곳을 빠뜨려 "footer만 배경이 보이는" 버그가 났었다(2026-07-22).
  smoke 테스트의 computed-style 단언이 이제 이를 감시한다.
- **smoke 테스트는 실서비스 Supabase에 연결된다.** 배경 데이터가 실제로 저장돼 있으면 "배경
  없음" 가정의 테스트가 깨진다. 배경 테스트는 반드시 `resetBgCache()`(hydrate `settled` 대기
  후 클라이언트 캐시 클리어)로 시작할 것 — DB는 건드리지 않는다.
- **`background-editor.js`는 `app.js` 전역 렉시컬 스코프 의존.** 편집기는 `app.js`가 전역
  스크립트(`<script src="app.js">`)로 노출하는 변수·함수(`state`, `sb`, `showScreen` 등)를
  직접 참조한다. `app.js`를 ES 모듈(`type="module"`)로 바꾸면 전역 노출이 사라져 편집기가
  즉시 깨진다. 모듈 전환 시에는 반드시 `window.craBg` 브릿지처럼 명시적 export/window 노출로
  교체할 것.
- **`[hidden]` 속성은 같은 요소에 `display` 규칙이 있으면 무력화된다.** UA의
  `[hidden]{display:none}`보다 author 규칙(`display:grid` 등)이 항상 이긴다 —
  `.admin-view[hidden]` 때와 같은 패턴으로 `#bgElTools`가 항상 노출되는 버그가 있었다
  (2026-07-22 수정). 패널 전체에 `.bg-editor-panel [hidden]{display:none !important}` 가드를
  두었으니, 패널 안에서 `hidden`을 쓰는 새 요소는 자동으로 안전하다. 패널 밖에서 `hidden` +
  display 규칙 조합을 쓸 때는 반드시 `[hidden]` 가드를 함께 작성할 것.
- **패널 안 툴팁은 `position: fixed`(오프셋 전부 auto)로 클리핑을 탈출한다.** 패널이
  `overflow-y:auto`면 x축도 함께 클리핑되어 `absolute` 툴팁은 패널 밖에서 잘린다.
  `.bg-help::after`는 `position:fixed` + 오프셋 auto("static position" 배치, 뷰포트 기준이라
  클리핑 무시) + `transform: translate(-100%…)`로 아이콘 왼쪽(페이지 위)에 띄운다.
  ⚠ 조상에 `transform`/`filter`가 생기면 fixed의 기준이 그 조상으로 바뀌어 다시 잘린다 —
  패널에 transform을 추가하지 말 것.
- **고스트 미리보기 스태킹 (`body.bg-editing.bg-ghost`).** 편집 중 실제 페이지 내용을
  `main`/`.site-footer`에 `z-index:11; opacity:.45; pointer-events:none`으로 편집 레이어(z10)
  위에 반투명하게 띄운다(기본 ON, 패널 체크박스로 토글). z 순서: 레이어 10 < 고스트 11 <
  topbar 20 < 패널 45. 이 중 하나라도 바꾸면 나머지를 함께 검토할 것. `pointer-events:none`
  덕에 드래그는 레이어로 통과한다 — 편집 중 페이지 내 버튼(월그리드·Back/Next)이 안 눌리는
  것은 의도된 동작.
- **ESLint는 `background-editor.js`도 검사한다 (`eslint.config.mjs` 별도 블록).** app.js와
  공유하는 식별자(`sb`, `state`, `isAdmin`, `hydrateBackgrounds` 등)는 그 블록의 `globals`에
  선언돼 있다. 편집기에서 app.js의 **새** 전역을 참조하면 lint가 no-undef로 깨진다 —
  `eslint.config.mjs`의 globals 목록에 추가할 것. (`setTimeout`류는 여전히 `window.` 접두
  필수.) 영상 URL 기능은 이 문제를 피하려고 `window.craBg.parseBgVideoUrl` 식으로 브릿지
  경유 호출만 쓴다.
- **편집 캔버스에 iframe이 있으면 `layer.innerHTML = ""` 전체 wipe 금지 (`2026-07-26`,
  배경 영상 기능).** iframe은 DOM에서 떼었다 다시 붙이기만 해도 **전체 리로드**된다 —
  `renderBgEditCanvas()`는 선택/드래그 종료마다 실행되므로 전체 wipe면 영상 프리뷰가 매번
  재시작한다. 해결: 영상 노드를 `bgEdit.videoNode`/`videoNodeUrl`로 wipe 밖에서 관리하고
  (`syncBgVideoPreview()`), URL이 실제로 바뀐 때만 재생성. wipe는 `child !== bgEdit.videoNode`
  선택 삭제, DOM 순서는 full `prepend` + 프레임은 항상 마지막 append로 유지(full → video →
  el-frame). `enterBgEdit`/`exitBgEdit`에서 노드 참조를 반드시 리셋할 것(밖에서
  `applyPageBackground`가 레이어를 wipe해도 참조가 남으면 다음 세션에서 죽은 노드를 지킨다).
- **배경 영상 = `.page-bg-video` 레이어, 이미지가 폴백.** `data.videoUrl`(jsonb 필드)이 있으면
  `buildBgVideoLayer()`(app.js)가 full 뒤 DOM 순서로 영상을 깔고, `.page-bg-full`은 남겨서
  로딩 전/실패 시 폴백이 된다(파일 `<video>`는 error 시 self-remove; iframe은 실패 감지가
  안 되므로 이미지가 뒤에 있는 것 자체가 폴백). 임베드는 object-fit이 안 먹혀
  `sizeBgVideoCover()`가 16:9 오버사이즈 px를 계산한다 — 레이어 높이는 뷰포트가 아니라
  `.app-shell`(콘텐츠) 높이를 따르므로 resize와 load 모두에서 재계산해야 한다.
  ⚠ 무음(`mute`/`muted`) 없이는 브라우저가 자동재생을 차단한다 — 파라미터를 빼지 말 것.
  ⚠ Vimeo `background=1`(컨트롤 숨김)은 영상 소유자 유료 플랜 전용 — 무료 영상은 컨트롤이
  보일 수 있다(무음 루프는 동작).
- **가로 100% 밴드(`item.fw`)는 프레임이 아니라 레이어 기준 (`2026-08-02`).** 요소에
  `fw:true`가 붙으면 `.page-bg-el-frame`(콘텐츠 열)이 아니라 **`#pageBgLayer` 직속**으로
  렌더된다 — 레이어가 곧 `.app-shell`(뷰포트 가로 전체 · footer 바닥까지)이라 `width:100%`가
  "페이지 가로 100%"를 뜻하게 되는 게 이 기능의 전부다. 지오메트리는 `styleBgBand()`(app.js,
  `window.craBg`로 노출) **한 곳**에서만 계산하고 뷰어·편집기가 공유한다 — 두 벌로 늘리지 말 것.
  - **세로는 `%`가 아니라 앵커 + px(`anchor`/`off`)다.** 페이지 전체 높이는 디바이스마다
    크게 달라서 `y%`로 잡으면 바닥 밀착이 깨진다. `anchor:"bottom", off:0` = 어느 기기에서도
    footer 바닥에 정확히 밀착. **여기를 %로 되돌리지 말 것.**
  - **`x`/`y`/`w`/`r`은 밴드에서 무시하되 값은 보존한다** — 체크 해제 시 원래 자리·크기로
    복귀시키는 게 목적. 밴드 코드에서 이 필드들을 덮어쓰면 토글이 비가역이 된다.
  - **`r`(회전)은 밴드에 적용하지 않는다** — 회전한 띠는 좌우 끝에 삼각형 빈틈이 생겨
    "가로 100%"가 깨진다. 그래서 편집기도 밴드엔 회전·크기 핸들을 달지 않는다
    (tile만 높이 핸들 1개).
  - ⚠ **요소 z-index 명시 + 스크림 `z-index:1000`은 한 쌍이다.** 밴드는 프레임 밖이라
    DOM 순서로 앞뒤를 표현할 수 없어 `applyPageBackground`가 모든 요소에
    `z-index: index+1`을 준다(`[앞으로]`/`[뒤로]` 유지). 그런데
    `.page-bg-layer.has-full::after`(상단 스크림)는 의사요소라 **레이어의 마지막 자식**이고,
    전부 `z-index:auto`이던 시절엔 트리 순서만으로 요소 위에 칠해졌다. 요소에만 양수 z를
    주면 요소가 스크림 위로 튀어나와 **기존 페이지 겉모습이 바뀐다** — 그래서 스크림에
    `z-index:1000`을 줘 원래 순서를 유지한다. **둘 중 하나만 건드리지 말 것.**
  - 밴드가 페이지 내용을 덮는 일은 없다: 레이어는 `z-index:1`로 쌓임 맥락을 만들고
    `main`/`.site-footer`는 그 밖에서 `z-index:2`다. 레이어 내부 z를 아무리 올려도 못 넘는다.
  - 편집기 셸은 이제 두 부모(레이어/프레임)에 나뉘어 붙으므로 **NodeList 인덱스로 셸을 찾으면
    안 된다** — `shell.dataset.bgIndex` + `bgShellAt(index)`를 쓸 것.

## 페이지2 보드 공유 파일 — `board-view.js` · `board.css` (`2026-10-22`, Phase 2A)

- **`board.css`는 `styles.css`에서 잘라낸(복사 아님) 페이지2 보드 규칙이다** — 레벨 테마 변수(`.level-theme-N`),
  `.section-box/.section-inner/.section-blue`, 레벨 배너·타이틀 블록, 툴바(`.content-type*`), 보드 그리드(`.lesson-*`,
  `.book-title-card`, `.week-label`), 공유 3D 버튼 기본 규칙(`.level-button,.month-button,.content-type,.lesson-button,
.back-button`)과 그 미디어 블록 전부(128개 규칙, 1,113행). **`index.html`에서 `styles.css`보다 먼저 로드**해야 선생님
  사이트의 캐스케이드가 그대로다(남은 styles.css 규칙이 원래처럼 뒤에 온다). 보드 규칙은 board.css에만 둔다 — styles.css에
  다시 쓰면 두 파일이 어긋난다. 토큰(`--sunny-yellow`, `--radius-control`, 폰트)은 각 페이지 스타일시트(:root)가 준다.
- Back/Next(`.content-v2-back/next`, `.content-nav-*`), V2·V3 전용, hero·month 화면의 `.section-inner` 변형, 배경 레이어
  규칙은 styles.css에 남겼다(학생 페이지에 없는 요소).
- **`board-view.js`는 `video-source.js` 다음·`app.js`/`play.js` 앞에 로드되는 공유 classic script**(`ICON_SVGS`,
  `buildToolbarButton`, `buildCoverCard`, `buildWeekRow`). 최상위 DOM 접근 없음, 이벤트 없음. 이름 재선언 금지(SyntaxError),
  새 이름은 `/* exported */` + `eslint.config.mjs` `boardViewGlobals`.
- **픽셀 비교 테스트 `tests/board-visual.spec.js`(19장, `maxDiffPixels 0`, `threshold 0`)가 "페이지2 무변경"의 증거다.**
  처음엔 19장 중 1~3장이 간헐 실패했다 — 원인은 레이아웃이 아니라 **Windows 헤드리스 Chromium의 글자 안티에일리어싱
  비결정성**(원시 비교 2,076픽셀이 4~8단계 차이, 기본 임계값 0.2를 넘는 건 1~8픽셀, "Next"·푸터 글자 가장자리). 완화 대신
  `launchOptions.args`에 `--disable-lcd-text --disable-font-subpixel-positioning --font-render-hinting=none`을 줘서
  정확 일치로 만들었다(5회 연속 통과). 보드 CSS를 바꾸는 의도적 변경이면 `--update-snapshots`로 기준선을 갱신하고 PNG를
  커밋한다. 다른 스펙에는 이 플래그가 없으니 거기서 스크린샷을 비교하지 말 것.
- 기준선 생성 절차(추출 전 상태에서 찍어야 증거가 된다): `git stash` → 기준선 생성·커밋 → `git stash pop` → 비교.

## 학생 QR 페이지 2세대 — 교재 단위 (`2026-10-22`, Phase 2B)

- **QR 단위는 교재 1권: `/q/<lv>/<month>/<book>`** (`b`,`l1`~`l3` / `3`~`12` / `1`|`2`), 쿼리 폴백 `play.html?l=&m=&b=`.
  파서는 레벨 `1`~`3`도 별칭으로 받지만 생성(`bookQrPath`·CSV)은 `l1`~`l3`. **교재 토큰이 새 인쇄물 계약이다** —
  `BOOK_LAYOUT`(교재↔주차·툴바 슬롯, `video-source.js`, D1 코드 고정)을 바꾸면 인쇄된 QR이 다른 내용을 연다. 1세대 요일
  경로(`/q/b/3/w1-mon`, `?s=`, `?solo=`)는 **제거**(미등록·미인쇄) → invalid 카드. `qr/qr-list.csv` 70행(`npm run qr:list`).
- **학생 페이지 = 선생님 페이지2 보드 그대로.** `play.html`은 `#contentScreen … #lessonGrid`를 **같은 id·클래스**로 두고
  `board.css` + `board-view.js` 빌더로 그린다(`renderBoard`). 다른 점: 상단 플레이어 없음, Back/Next 없음, 헤더는 브랜드
  문구만, 푸터 저작권 1줄(링크 0 — 테스트가 `a[href]` 0개를 단언). 교재당 툴바 4버튼이라 `--wide` 없이 Beginner형 한 줄.
  주차 번호는 연속(교재 2 = 3·4 week). 빈 슬롯은 선생님처럼 표시 차이 없음 — 탭해야 Coming soon.
- **재생은 오버레이(`#playOverlay`)**: 보드 탭 = 제스처라 즉시 마운트. ✕·Esc·**뒤로가기**(열 때 `history.pushState` 1회,
  popstate로 닫음 — ✕/Esc도 `history.back()`을 거쳐 닫혀 히스토리가 쌓이지 않는다)로 닫힌다. 아이폰 전체화면·탭 레이어·
  종료 오버레이·⛶는 1세대 스테이지 그대로(`#playStage`가 오버레이 안으로). 상태는 `#play[data-state]`
  = loading|error|invalid|board, `#playOverlay[data-state]` = ready|playing|ended|empty. Next는 **같은 교재 안**(`nextFilledSlot(row,
level, book, slot)`)에서만.
- **표지는 정적 파일 `assets/covers/<level-slug>/<month-slug>/book-<n>.jpg`**(`coverAssetPath`, Storage 경로와 1:1,
  `COVER_EXT = "jpg"` — 업로드가 WebP 재인코딩이라고 적혀 있지만 실제 70개 전부 `image/jpeg`였다). 학생 페이지는 `new Image()`
  로 미리 읽어 성공할 때만 `.has-cover`(404면 흰 자리표시자, 요청 1회). **Storage는 절대 읽지 않는다.**
  관리자가 표지를 바꾸면 선생님 사이트는 즉시(Storage), 학생 페이지는 `npm run covers:sync -- --only level-2` → 커밋 →
  푸시 후 반영(관리자 표지 카드 밑 힌트). `--dry-run`은 REST 1회 + HEAD 70회(용량·타입만). `tests/covers.spec.js`가 70개
  존재·소문자·크기를 고정한다. `check-assets-case`는 리터럴 경로만 보므로 동적 경로는 이 테스트가 대신한다.
- ⚠ **`scripts/check-assets-case.mjs`는 주석 속 `assets/…` 문자열도 잡는다**(정규식이 리터럴만 봄). `play.js` 주석의
  `assets/covers/<level>…`가 `assets/covers/`(끝 슬래시)로 매칭돼 `qa`가 한 번 실패했다. 주석에는 `coverAssetPath`처럼 함수 이름으로
  적을 것. 동적 경로(표지 70개)는 `tests/covers.spec.js`가 대신 검사한다.
- **1세대의 🎮 목록 표시(`.play-game-mark`)는 목록과 함께 사라졌다**(보드는 선생님과 동일해야 하므로). 게임 슬롯은 탭하면
  "Let's play!" 카드. `tests/board-visual.spec.js`에 학생 페이지 4장(Beginner·Level 1 교재2 × 2 뷰포트) 기준선이 있다.

## 레벨 키 정리 (`2026-10-29`, A)

- **레벨 정의는 `video-source.js` `LEVELS` 한 곳.** 키 `beginner`·`level-1`·`level-2`·`level-3` = 화면 표기. 옛 키
  `"Level 1".."Level 4"`(옛 Level 1 = Beginner)는 `legacy`로만 남아 옛 북마크·이름 안 바뀐 DB 행을 읽을 때 쓴다.
  새 키를 화면 표기("Level 1")와 똑같이 쓰지 않은 이유: 옛 Beginner 키와 같은 문자열이 되어 전환이 모호해진다.
- ⚠ **테마 색을 키의 숫자에서 뽑지 말 것** — `levelThemeClass(key)` → `level-theme-<key>`. 예전 `/\d+/` 방식이면
  `level-1`이 Beginner 노랑이 되고 `beginner`에서 `play.js`가 예외로 멈춘다.
- ⚠ **표지 업로드 경로는 `levels/<key>/<month>/<book>`.** Storage의 옛 최상위 폴더 `level-1/…`은 옛 Beginner 표지이고
  `content_pages.covers`가 전체 URL로 가리킨다 → 새 키로 같은 경로에 upsert하면 Beginner 표지를 덮어쓴다. 옛 객체는
  지우지 말 것(아직 URL로 쓰임).
- **DB 전환 순서: 코드 푸시 → `supabase/levels/01-rename.sql`.** 코드가 옛 키·새 키를 둘 다 읽고(`rowsByNewKey`,
  학생 페이지 `level=in.(…)`, 배경 삭제는 두 키 모두) 새 키 행이 이긴다. SQL을 먼저 돌리면 옛 코드가 빈 화면.
  01은 끝에 CHECK를 걸어 옛 키 쓰기를 막는다. 호환 코드·CHECK의 migration.sql 합치기는 SQL 2(3.5) 백로그.
- 옛 주소 `#months/Level%201`은 로드 때 `history.replaceState`로 새 키 주소로 바뀐다(기록이 늘지 않음). 알 수 없는
  레벨은 홈.
- supabase-js `.in()`은 공백을 `+`로 보낸다(PostgREST는 공백으로 읽음) — 테스트에서 URL을 `decodeURIComponent`로
  읽으면 `+`가 남는다 → `new URL(url).searchParams`로 읽을 것. 직접 만드는 PostgREST 목록은 공백 있는 값을 `"…"`로.
- Playwright: 헤더 레벨 아이콘은 계속 움직여서 "stable"이 안 된다 → 클릭은 홈 레벨 카드(`#levelSection [data-level]`).
- `board-visual` 스텁은 이제 PostgREST처럼 `level`·`month` 필터를 지킨다. 예전엔 학생 페이지에 항상 첫 행(Beginner)을
  줘서 학생 Level 1 기준선 2장이 Beginner 데이터였다 → 옛 코드로 다시 찍은 뒤 새 코드를 0픽셀로 비교했다. 픽스처 행은
  일부러 옛 키(호환 읽기 검증) — 호환 제거 때 새 키로 바꾼다.
- ⚠ 정확 비교(0픽셀) 기준선은 **원래부터 약 2% 흔들린다**(375 등에서 글자 가장자리 ~400픽셀). `fe991f8`과 새 코드 모두
  48장 중 1장 — 실패 1건은 재실행으로 확인하고, 같은 장이 반복 실패할 때만 진짜 변화로 본다.
- Windows: Vite 개발 서버가 떠 있으면 감시 중인 폴더의 `git mv`가 `Permission denied` → 서버를 끄고 옮긴다.

## 레벨별 자료실 (`2026-10-29`, B — Phase 4 대체)

- **자료페이지 = 월 화면의 "자료 모드".** `screens.resources`가 `#monthScreen` 자체이고 `body[data-screen="resources"]`가
  월 버튼을 숨기고 `#resourceGrid`를 보인다 → 헤더·제목·레벨 색·배경(페이지1)·반응형 규칙이 월 페이지와 저절로 같다.
  자료 버튼은 `.month-button` 클래스를 재사용(크기·턱·색) + 자기 글자 규칙(`.res-name`, 높은 특이도).
- **표시 조건은 `updateAdminUI()` 한 곳**(`body.can-teacher-res` = 관리자 또는 LMS role 1·2). 로그인·로그아웃·로드 복원이
  모두 이 함수를 거치므로 새로고침 없이 바뀐다. 서버도 매번 다시 판정(RPC `teacher_resources_allowed`, Storage 정책).
- **`#resources/<key>` 직접 진입:** `app.js`는 월 화면을 먼저 열고, `teacher-resources.js`가 `window.craAuthReady`(로드 때
  로그인 확인이 끝나면 resolve) 뒤에 자료페이지로 가거나 `#months/<key>`로 주소를 바꾼다 — 금지 화면이 한 순간도 안 보임.
  ⚠ 뒤 스크립트가 app.js의 초기화 흐름에 기대야 하면 타이밍 말고 이런 Promise를 쓴다(첫 await가 마이크로태스크로 끝나면
  뒤 스크립트가 아직 실행 전일 수 있다).
- **다운로드 = Edge Function `teacher-resource-download`(PM 결정 (나), 2026-10-29).** 브라우저는 `{level, slot}`만 보내고
  (`sb.functions.invoke`), 함수가 관리자(JWT → `/auth/v1/user`) 또는 LMS(`x-lms-token`을 DB로 전달)를 판정 → service role로
  `teacher_resource_issue`(현재 파일·하루 한도 — D82부터 1,000회, 그 전 30회) → service role로 **15초 고정** 서명 → `&download=<이름 1회 인코딩>`을 붙인
  URL을 돌려준다. 페이지는 그 URL을 같은 탭의 숨은 `<a>`(target 없음)로 연다 — attachment 응답이라 페이지 그대로.
  ⚠ (가)(브라우저가 직접 서명)는 버렸다: 만료를 클라이언트가 정할 수 있어 오래가는 링크가 퍼지면 미캐시 이그레스가 샌다.
  ⚠ supabase-js `createSignedUrl(…, { download })`는 이름을 **두 번 인코딩**한다 — 함수에서도 옵션 대신 직접 붙인다.
- `lmsFetch`는 REST 외에 `…/functions/v1/teacher-resource-download`에만 `x-lms-token`을 붙인다 — 그 이름 **정확히**(뒤에
  `?`만 허용, `…-download-v2`는 안 붙음, 보안 재검토). Storage에는 안 붙음.
- ⚠ 전체 QA(3기기 병렬)에서는 PGlite SQL 테스트·브라우저 컨텍스트를 여러 개 여는 테스트가 기본 30초를 넘길 수 있다 →
  그런 테스트만 `test.setTimeout`을 늘린다(기대값은 그대로). 0픽셀 기준선 흔들림도 부하에서 더 잦다 — 재실행으로 판정.
  LMS 세션은 Storage 객체를 전혀 읽을 수 없다(anon 읽기 정책 없음).
- 함수는 한 파일·import 없음(대시보드 편집기에 붙여넣기, `supabase/functions/README.md`). Node 24가 `.ts`를 그대로 불러오므로
  `createHandler(env, fetch)`를 가짜 fetch로 테스트한다(`tests/teacher-resource-download.spec.js`). `Deno.serve`는
  `globalThis.Deno`가 있을 때만.
- 하루 한도: `teacher_resource_downloads`(RLS·정책 0·권한 회수, 함수 전용)에 성공한 발급만 기록, KST 자정 기준
  (`date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'`), 회원별 advisory lock으로 동시 요청도
  한도를 못 넘는다(D82, 2026-11-08: 30 → **1,000**), 30일 지난 행은 발급 때 삭제. 관리자는 기록·제한 없음.
- ⚠ **supabase-js는 `File`/`Blob` 업로드를 multipart로 보내 `contentType` 옵션이 무시된다** — 버킷 MIME 제한은 파일 자체의
  type을 보는데 일부 PC는 xlsx type이 빈 값이다 → `await file.arrayBuffer()` + 확장자로 정한 `contentType`으로 올린다.
- 교체 순서: 새 객체 업로드 → RPC `teacher_resource_set`(이전 경로 반환) → 이전 객체 삭제. set 실패면 새 객체를 지워 되돌림.
  삭제는 RPC `teacher_resource_clear` → 객체 삭제. 관리자 삭제 확인은 대화상자 대신 같은 버튼 2번(4초).
- Storage 삭제가 실패해 남은 고아 파일은 아무 선생님도 받을 수 없다 — 함수가 표가 가리키는 현재 파일만 서명한다.
- 운영 선생님 테스트 계정 SQL은 비밀번호를 **서버가 만들어 결과 표에만** 보여 준다 — 문장에 비밀번호 리터럴을 넣으면 오류 로그·
  `pg_stat_statements`·SQL Editor 기록에 남을 수 있다.
- 폰에서는 월 페이지 제목이 원래 **왼쪽 정렬**이다 → 버튼은 제목 아래 같은 왼쪽 선. ≥768은 제목 줄 오른쪽 끝(absolute,
  제목 위치 불변 — 테스트가 버튼 유무로 제목 rect를 비교).
- 영어 UI 규칙 예외: '레벨별 자료실'·버튼 이름·안내 문구는 PM이 정한 한국어(교사 전용 화면, R4 때와 같은 예외).
- 테스트 함정: `x?.token ?? "missing"`은 토큰이 `null`일 때도 "missing"이 된다 — 없음과 null을 구분하려면 찾은 뒤 분기.
- (D58 디자인, `2026-11-02`) 자료실 페이지 = 칸마다 카드 한 장(한 줄에 하나): 파일 아이콘(PDF = 글줄, 엑셀 = 표 + "PDF"/"XLS") ·
  제목 + "PDF · 1.2MB · 11/02 업데이트" · [내려받기]. 파일 없는 칸은 "아직 올라온 자료가 없어요"(버튼 아님). 형식·크기·날짜는
  **SQL 변경 없이** 기존 `teacher_resources_list`(`file_name`·`file_size`·`updated_at`, 관리자·지사·선생님 같은 답)에서. 값이
  없으면 그 부분만 뺀다. 날짜 = 보는 사람 시간(한국)의 MM/DD.
- ⚠ "월간.연간교육안"이 "월간. / 연간교육안"으로 끊기던 원인: `keep-all`이어도 **마침표 뒤는 줄바꿈 자리**다(한글 앞) → 제목을
  띄어쓰기로 나눠 단어마다 `white-space: nowrap`(`.res-word`). 띄어쓰기에서만 줄이 바뀐다.
- (D63, `2026-11-02`) 칸 = `monthly` 월간교육안(새) · `plan` **연간교육안(옛 월간.연간교육안 키 그대로 — 행·Storage 경로를
  옮기지 않으려고)** · `award` · `test`. 칸 목록이 있는 곳은 다섯 군데: CHECK `teacher_resources_slot_ok`, `teacher_resources_list`의
  values, Storage 업로드 정책 경로 정규식, Edge Function `SLOT_RE`, 화면 `RES_SLOTS` — 칸을 바꿀 때 모두 함께. ⚠ `create table if
not exists` 안의 CHECK는 이미 있는 표를 안 바꾼다 → 그 아래 `drop constraint if exists` + `add constraint`.
- (D64, `2026-11-02`) 칸 = 파일 **또는** 구글 드라이브 파일(ID만, `drive_id`). 드라이브 칸은 파일 열 3개가 NULL —
  `storage_path`의 경로 CHECK·`file_size` CHECK는 NULL이면 통과하므로 "파일 행에만" 걸린다. 규칙 2개(`source_ok`: 정확히 하나,
  `drive_ok`: ID 형식 25~64자). 해제는 기존 `teacher_resource_clear`(드라이브면 지울 경로 NULL). `teacher_resource_issue`는
  경로가 NULL이면 원래 "empty" → **Edge Function 무변경**. 목록 함수 결과에 열을 더하면 `create or replace`가 실패 →
  옛 모양일 때만 drop(`lms_member_list`와 같은 가드), drop하면 권한도 사라지므로 grant를 같은 파일·같은 DO 블록에.
  옛 화면(D63)은 `file_name`이 NULL인 드라이브 칸을 "준비 중"으로 본다(안전) → "SQL 먼저, 화면 나중".
- (D64 화면) 드라이브 카드의 [내려받기]는 `<a target=_blank>`(같은 `.res-download` 모양) → `#resourceGrid` 클릭 처리는
  `button.res-download`만 잡아야 한다(아니면 링크를 눌러도 Edge Function을 부름). 링크 해석은 `new window.URL`(lint 전역에
  `URL` 없음). 관리자 테스트: 저장·업로드마다 목록을 다시 그리므로 다음 클릭 전에 "옛 행 표시 → 사라질 때까지 대기"
  (`markRows`/`redrawn`) — 안 그러면 곧 바뀔 옛 행을 눌러 두 번 누르기 상태가 사라진다. 구글 요청은 `context.route`로 막는다
  (새 탭은 `page.route`에 안 걸림).
- (D65, `2026-11-02`) 칸 = `monthly-03`…`monthly-12` · `plan` · `award` · `test` · `script` · `pictures` · `flashcards`
  (62칸). 칸 목록이 있는 곳은 이제 네 군데(CHECK, 목록 values, Storage 정책 정규식, 화면 `RES_SLOTS`) — Edge Function
  `SLOT_RE`는 형식만 본다(DB가 판단, 없는 칸 = "empty" = 404). 칸을 **없앨** 때는 그 칸의 행이 남아 있으면 CHECK를 다시 거는
  ALTER가 실패한다 → `migration.sql`에 그 행이 있으면 문구로 멈추는 DO 블록(파일 전체가 한 트랜잭션이라 아무것도 안 바뀜),
  운영 precheck가 미리 알려 줌. 행은 관리자 화면에서 지워야 Storage 파일도 같이 정리된다(SQL로 지우면 파일이 남음).
- (D65 화면) 월 패널(`#resourceMonths`)은 DOM에서 월간교육안 카드 **바로 뒤**(키보드·휴대폰 순서), 격자는
  `grid-auto-flow: row dense` → PC에서는 옆 카드(연간교육안)가 첫 줄을 채우고 패널은 그 아래 전체 폭. `.res-months { display:
grid }`가 `hidden` 속성을 이기므로 `.res-months[hidden] { display: none }` 필요(관리자 묶음 본문도 같음). 펼침 버튼 이름 =
  "월간교육안 3~12월 보기"(aria-label; 처음엔 "월 선택"이었으나 뒤로 가기 "◂ 월 선택"과 겹쳐 빅웨이브 결정으로 바꿈) — 뒤로 가기는 테스트에서 `exact: true`. 320px에서 월 버튼 44px를 지키려면
  휴대폰 간격 6px. 관리자는 레벨 탭 = 그 레벨의 행만 DOM에 있음(Beginner 15 · Level 2 16) → 테스트는 탭부터 누른다. 저장 뒤
  다시 그려도 탭·묶음 펼침 상태는 유지(`resAdminLevel`·`resAdminMonthsOpen`).
- 옛 화면은 목록에 모르는 칸이 와도 **무시**한다(`resourceSlots`를 돌며 `rows.find`) → 칸 추가는 "SQL 먼저, 화면 나중"이 안전.
  `tests/fixtures/teacher-resources-4a9b23d.js`(D63 전 운영 화면, 수정 금지)로 확인. 운영 SQL Editor용 반영본은 DO 블록 하나로
  migration.sql에서 잘라 만든다(로컬 `docs/worker-briefs/2026-11-02-d63-sql-check.mjs` — 전체 카탈로그 비교).
- 월 페이지 '레벨별 자료실' 버튼은 레벨 색 채움(`#teacherResBtn`), 자료실 페이지 '월 선택'은 테두리 그대로(같은 `.teacher-res-button`).
  카드 회색 글자는 `#666`(사이트 `--muted-ink` #777은 흰 바탕 14px에서 4.5:1 미달).

## 자료실 게시판 (`2026-11-03`, PM 지시서 B1~B12 · T1~T3 · H1~H6)

- **파일:** SQL = `migration.sql` "Resource board" 블록(+ 레벨별 자료실 블록의 `site_flag`·T3), 읽기 전용 점검 `supabase/lms/verify-resource-board.sql`.
  화면 = `resource-board.js`(선생님) · `resource-board-admin.js`(관리자·스위치 2개) · `styles.css` 끝(헤더 버튼 + `bd-*` + `rb-*`).
  테스트 = `tests/resource-board-sql.spec.js`(PGlite) · `tests/resource-board.spec.js` + 가짜 Supabase `tests/resource-board-stub.mjs`.
- **주소:** `#board[?level=&cat=&q=&sort=&page=]` · `#board/<글 uuid>[?…]`. 앱 전체에 hashchange 처리기가 없어서 **게시판 파일만**
  hashchange를 듣는다 — 게시판 밖으로 뒤로 가기는 `rbLeave`(홈·월 화면·레벨별 자료실, 그 밖은 새로고침). 테스트에서 같은 페이지의
  `page.goto("/#months/…")`는 다시 라우팅되지 않는다 → `page.reload()`.
- **스위치 2개**(`site_settings` `resource_board_enabled` 기본 false · `teacher_resources_enabled` 기본 true): 화면은 회원가입 표시와 같은
  한 번의 요청으로 읽고(`getSignupVisible`) **`craAuthReady` 전에** 기다린다(딥 링크 판단에 필요). 서버 `site_flag`는 jsonb `true`/`false`만
  인정하고 나머지는 기본값. T3: 레벨별 자료실 끄면 목록 함수가 지사·선생님에게 0행(관리자는 그대로), **내려받기 함수는 그대로**(지시서).
- **스위치 저장 실패(`2026-11-05` #1):** 관리자 화면은 로그인이 끝나도(같은 브라우저 다른 탭의 Log out, 세션 만료) 그대로 남는다 —
  앱에 `onAuthStateChange` 처리기가 없어 `isAdmin`이 true로 남고, 저장 요청은 익명으로 나가 RLS가 42501로 거절. 로컬에서 이 순서로
  운영 증상("설정을 바꾸지 못했어요" + 켬으로 돌아감)이 똑같이 재현됨(로그인이 살아 있으면 세 스위치 모두 정상). 그래서
  `rbaSaveFlag`는 세션이 없으면 요청 없이 "관리자 로그인 상태를 확인할 수 없어요…", 서버 거절이면 문구 뒤 `(오류 <code>: <앞부분>)` +
  `console.error`. 다른 관리자 저장(내용·배너·회원)은 아직 옛 문구 그대로. 운영 진단 = 읽기 전용 DO(로컬 `docs/worker-briefs/2026-11-05-site-settings-diag-*`).
- **헤더 Teacher 버튼(#2 `2026-11-05`):** 한 줄 "Teacher"(Inter 800 14px, 아이콘과 세로 가운데). 예전 둘째 줄 '교사자료실'과 그
  부분 글꼴(`cra-teacher-label-kr.woff2`·OFL 파일·`@font-face`)은 **지움** — 화면 읽기용 이름은 `aria-label="Teacher 교사자료실"`
  그대로. 아이콘 = Lucide v1.66.0 `folder`·`user-cog`(ISC, 인라인 SVG — `index.html` 주석).
- 헤더 버튼 폭(H6): 1024~1366 다섯 폭 모두 겹침 없음, 가장 좁은 틈 21px(지사 "My Branch", 1280). 버튼이 더 생기면 다시 잴 것.
- **업로드:** supabase-js 대신 **XHR로 Storage REST에 직접**(진행 막대, 형식은 확장자로 — 한글은 브라우저가 빈 값을 준다), 동시 3개.
  경로 `<글 uuid>/<ms>-<6자>.<확장자>`(글 id는 화면이 `crypto.randomUUID`로 먼저 만든다). 테스트의 가짜 응답(route)은 업로드 진행
  이벤트를 보내지 않는다 → 테스트·사진에서는 막대가 비어 있다(실제 업로드는 찬다).
- **고아 파일(B8):** 저장 전 업로드는 × · 취소 · 다른 메뉴 · 사이트 보기 · 로그아웃 · 탭 닫기(pagehide)에서 지운다. 떠날 때는
  `fetch(keepalive)` + **떠나기 전에 받아 둔 토큰**(로그아웃이 세션을 먼저 지워도 지워지게). 강제 종료·정전은 남을 수 있음(사람이 버킷 확인).
- 저장 = 첨부 목록 전체를 순서대로 보냄(기존은 `{id}`만). 빠진 기존 첨부의 경로를 서버가 돌려주면 **그때** Storage에서 지운다.
  이미 붙은 파일을 "새 파일"로 다시 보내면 거절(보안 검토 L1 — 지워질 객체를 새 행이 가리키는 사고).
- 내려받기 한도(D82부터 1,000회)는 레벨별 자료실과 같은 기록표·같은 잠금(7302): 게시판 행은 `level='board'`, `slot=<첨부 id>`. 객체가 없으면 세지 않음.
  `verify-teacher-resources.sql` 21번은 "레벨별 자료실 기록을 만지는 함수는 목록에 있어야" → `board_attachment_issue`를 25번으로 넣음.
- `board_post_get`은 조회수를 쓰는 volatile 함수 → PostgREST **GET으로 부르면 읽기 전용 트랜잭션 오류**. supabase-js `rpc`(POST)만.
- 분류 7개는 **표를 만들 때 한 번만** 채운다(DO 블록) → 운영 apply DO는 그 블록 안쪽만 잘라 넣는다(DO 안에 DO 불가).
- 관리자 '+ 새 글 쓰기'는 공용 제목 줄에 있다 → `body[data-admin-view="board"]`(app.js `setAdminView`)와 `data-board-mode`로만 보인다.
- 파일 이름 정렬 = `localeCompare("en", {numeric:true})`(3월 < 10월, 라틴 먼저 — 윈도 탐색기와 같은 순서; `"ko"`는 한글이 먼저).
- 작업 함정: JS `replace(문자열, 문자열)`은 대체 문자열의 `$'`·`$&`를 특수 패턴으로 읽는다(SQL 정규식 `…)$'`가 깨짐) → 함수로 넘긴다.
  `getComputedStyle().fontFamily`는 `Inter`(따옴표 없음)와 `"Pretendard Std Variable"`(공백 있어 따옴표)로 다르게 돌려준다.

### 수정 1차 (`2026-11-04`, PM 지시서 F1~F4 · R1~R3)

- **F1 프리텐다드:** 선생님 게시판 화면(`#boardScreen`)만. CSS = jsDelivr **버전 고정**
  `orioncactus/pretendard@v1.3.9/…/pretendardvariable-dynamic-subset.min.css`(글꼴 이름 `Pretendard Variable`, 92조각 ·
  `font-display: swap`, 약 13KB gzip). 머리에 넣지 않고 **게시판을 처음 열 때** `<link id="boardFontLink">`를 붙인다
  (`rbEnsureFont`, 관리자 글꼴 `ensureAdminFont`와 같은 방식) → 다른 화면은 요청 0. 적용은 styles.css 선생님 게시판 절
  **맨 끝**의 `.board-screen, .board-screen * { font-family: var(--bd-font) }` — 같은 우선순위의 `bd-*` 규칙(Inter·
  Fredoka)을 이기려고 마지막에 둔다. 이 규칙 아래에 게시판 글꼴 규칙을 새로 쓰면 그쪽이 이긴다. 라이선스 = **SIL OFL 1.1**
  (글꼴을 우리 저장소에 두지 않고 CDN에서 그대로 씀 — 이름 변경 의무 없음). CSP는 없음(`vercel.json`·`index.html` 확인).
  jsDelivr가 막히면 대체 글꼴(Noto Sans KR → Inter)로 보인다. 테스트도 jsDelivr에서 받는다(supabase-js와 같은 의존).
- **F2:** 게시판 드라이브 첨부 = 레벨별 자료실 D64와 같은 `driveDownloadUrl`(`uc?export=download`) + 새 탭, 모양은 파일과 같은
  `.bd-att-dl`(그러나 `<a>`) — 클릭 처리는 계속 `button.bd-att-dl`만 잡는다(링크가 Edge Function을 부르지 않게).
- **F3 떠나기 확인:** 보류 업로드 = `!id && kind === "file"`(올리는 중·대기·완료·실패; 거절된 파일·드라이브·등록된 것 제외).
  사이트 안 이동 3곳(메뉴·사이트 보기·로그아웃)은 document **캡처 단계 클릭**에서 막고(`stopImmediatePropagation`), [중단하기]면
  새 토큰 → keepalive 삭제 → 같은 버튼을 `rbaPassing`으로 다시 누른다. `#` 바뀜·뒤로 가기는 resource-board.js의 hashchange가
  **먼저** `craBoardAdmin.hashChanged()`를 묻는다(관리자 파일이 뒤에 로드 — 같은 window 처리기 순서에 기대지 않음). 머묾 =
  `history.replaceState`로 편집기를 연 주소로 되돌림(hashchange 안 생김), 나감 = 편집기 닫고 `rbFollowHash()`(게시판이면 그 화면,
  아니면 `rbLeave`: 홈·월·레벨별 자료실·그 밖은 새로고침). 우리 창 = `role="alertdialog"`, 처음 초점 [계속 올리기], Tab은 두 버튼만,
  `focusin`으로 밖으로 새는 초점 되돌림, Esc·배경 = 머묾. `window.confirm` 쓰지 않음.
- **beforeunload 문구는 브라우저가 정한다(바꿀 수 없음).** 보류 업로드가 있을 때만 처리기를 **붙이고**, 없으면 뗀다
  (`rbaSyncUnload` — 늘 붙여 두면 bfcache를 막는 브라우저가 있음). 크롬은 사용자가 페이지를 한 번이라도 누른 뒤에만 묻는다.
  관리자 안내 = 게시 상자 아래 `#rbEdLeaveNote`.
- **고아 파일:** 강제 종료·정전 등은 여전히 남을 수 있다 → 읽기 전용 확인 `docs/worker-briefs/2026-11-04-board-orphans-do.sql`
  (로컬; 1일 넘은, 어떤 첨부도 가리키지 않는 `resource-board` 파일 목록·개수·크기, "글 있음/없음"). 삭제 SQL은 만들지 않는다(PM).
- **F4:** 제출 버튼 2개(`.rb-ed-submit` — 게시 상자 `#rbEdSave` · 등록 막대 `#rbEdBarSave`)는 같은 form의 submit. 잠김 =
  `disabled`(올리는 중·실패·등록 중). 등록 막대 = `.rb-ed-main` 안의 `position: sticky; bottom: 0` — 창(window)이 스크롤하므로
  동작(조상에 `overflow` 넣지 말 것). 휴대폰은 한 줄 배치라 게시·레벨·분류 상자로 내려가면 막대가 제자리(첨부 목록 아래)에 선다.
  "바뀐 내용" = 열 때 찍은 `rbaSnapshot()`(제목·내용·레벨·분류·공개·고정·첨부 id 순서)과 비교.
- **R1:** 파일 이름 = `_`·`-`·`.` 뒤에 `<wbr>` + `word-break: keep-all`(한글 낱말 안에서 안 끊김), 정말 긴 조각만 `anywhere`.
  ⚠ **look-behind 정규식(`(?<=…)`) 금지** — 아이폰 Safari 16.3 이하는 파일 전체를 못 읽어 사이트가 멈춘다(반복문으로 처리).
- **R2:** 처음 설치 분류 '그림 자료실'(띄어쓰기, 레벨별 자료실 칸 이름과 같게) — 로컬 커밋 `19a66cc`. 운영 apply·verify DO는
  `board-sql-check.mjs`가 다시 만들었다(검사 17/17).
- **테스트 함정:** ① 같은 문서 안에서 `page.goto("/#admin")`은 `#` 이동일 뿐 관리자 화면을 열지 않는다(`#admin`은 **처음 로드할 때만**
  열림) → `reload` 또는 다른 주소(`/?x=1#admin`). ② 새로고침을 사이에 둔 history 항목으로 **뒤로 가기는 다른 문서 이동** →
  우리 창이 아니라 beforeunload(Playwright가 자동으로 취소). 뒤로 가기 시험은 같은 문서 안에서 쌓은 항목으로. ③ beforeunload는
  `new Event("beforeunload", {cancelable:true})` → `defaultPrevented`로 켜짐 확인, 실제 창은 `page.close({ runBeforeUnload: true })`
  → `dialog` 이벤트. ④ 데스크톱에선 ↑↓ 버튼이 숨겨져 있다(휴대폰 전용) → 손잡이에 `press("ArrowDown")`.
- **크기 표시(PM 발견, 해결):** 파일 크기는 **한 함수** `formatFileSize`(teacher-resources.js — 게시판보다 먼저 로드)로 통일 —
  KB로 반올림해 **1,000KB 이상이면 MB**(소수 한 자리, "1006KB" → "1.0MB"), 붙여 씀("840KB"), 크기 없으면 빈칸. 레벨별 자료실 카드 ·
  관리자 배너 탭 줄(예전 "4.2 MB" 띄어쓰기 → "4.2MB") · 게시판 상세 · 게시판 관리자 첨부 줄(`rbFormatSize`는 이 함수를 부르기만
  함) 모두 같다. 테스트: teacher-resources "sizes up to 999KB…", resource-board "board file sizes…".
- **사진 도구 함정:** `fullPage` 사진은 sticky 막대를 **원래 창 높이의 바닥**(페이지 중간)에 그린다 → 11/03 사진 도구는 전체 사진을
  찍을 때 창 높이를 페이지 높이로 늘렸다가 되돌린다.

### 수정 2차 (`2026-11-05`, PM 지시서 #1~#5 · 로그인 끝남)

- **이름(#3):** 게시판은 선생님·관리자 화면 모두 **'교사자료실'**(띄어쓰기 없음). 옛 레벨별 기능(배너 메뉴 상자, 월 선택 화면 버튼·자료
  페이지)은 이때 이름을 그대로 두었다가 `2026-11-06`에 '레벨별 자료실'로 바꿈(아래 "이름 변경"). 휴대폰 관리자 메뉴 한 줄 확인됨.
- **배경(#4):** `.app-shell`은 100vh 세로 flex, `<main>`이 푸터까지 늘어나는데 색은 게시판 section에만 있었다 → 짧은 목록·글이면
  아래가 `<main>`의 흰색. `body[data-screen="board"] main { background: #eef6fd }`로 해결(높이 상수 없음, 다른 화면 무관).
- **글꼴 선택(#5, D77로 바뀜 — 아래 "나눔스퀘어라운드"):** `site_settings` `board_font_ko` / `board_font_en` = `pretendard` |
  `nanum-square-round`(화면 허용 목록 `BOARD_FONTS`, 없거나 이상한 값 = 프리텐다드; 읽기 = `getSignupVisible` 한 번의 요청; **SQL 변경
  없음** — 값에 제한 없음, 정책은 기존 읽기 공개·쓰기 `is_admin()`). `#boardScreen`·관리자 미리보기의 `data-font-ko/-en` → CSS 변수
  `--bd-en`, `--bd-ko` → `--bd-font` = 라틴 글꼴, 한글 글꼴, Noto Sans KR, Inter. 라틴 글꼴은 `unicode-range`가 라틴·숫자·문장부호뿐이라
  한글은 뒤의 한글 글꼴로 내려간다.
  - 프리텐다드 라틴 파일(`assets/fonts`, **수정하지 않은 원본 그대로** + OFL): `PretendardStdVariable.subset.6.woff2`(56,128 B, 가변
    45~920 — npm `pretendard-std@1.3.9` 동적 부분 글꼴 6번 = 저자가 만든 라틴 조각). 직접 자르지 않은 이유: OFL **예약 글꼴 이름**이
    있어 잘라서 고치면 이름을 바꿔야 한다 → 원본 조각을 그대로 둠. 한글 = jsDelivr `pretendardvariable-dynamic-subset`(v1.3.9,
    `rbEnsureFont`). **고른 것만** 불러온다(안 고른 CSS·파일 요청 0 — 테스트로 확인).
  - `#adminScreen *`(관리자 한 글꼴 규칙, 우선순위 1,0,0)이 미리보기 글꼴을 덮는다 → 미리보기 규칙은 `#adminScreen .rb-font-preview`.
  - 실제로 그려진 글꼴 확인 = CDP `CSS.getPlatformFontsForNode`(파일 안 이름: `Pretendard Std Variable`, `NanumSquareRoundEB` 등).
- **나눔스퀘어라운드(D77, `2026-11-06`):** 나눔고딕을 목록에서 빼고 이것으로 바꿈(옛 값 `nanum-gothic` = 프리텐다드로 보임, 운영 값은
  두 칸 모두 `pretendard`). 관리자 화면 자체 글꼴(한글 나눔고딕 · 영문 Inter, `ensureAdminFont`)은 그대로. 옛 나눔고딕 라틴 조각
  (`NanumGothic-latin-*.woff2` + OFL)은 저장소에서 지움.
  - 파일: 네이버 원본 4개(L 300 · R 400 · B 700 · EB 800, SIL OFL 1.1, 예약 이름 "Nanum")의 WOFF2 = npm `@kfonts/nanum-square-round@0.2.0`
    (jsDelivr 버전 고정). 고른 이유: 같은 패키지에 든 네이버 TTF와 글자 모양·글자 목록·이름이 **완전히 같음**(fontTools로 비교). 다른 후보
    `typeface-nanum-square-round@1.0.2`는 글리프가 2개 더 있어(변환 도구가 바꿈) 뺌. 굵기 대응: 400→R, **700·800·900→EB**(빅웨이브
    11/06: B는 프리텐다드 Bold 옆에서 가늘어 보임 → 파일은 그대로 두고 CSS의 700 글꼴 정의만 EB 파일을 가리킴; 500·600은 게시판에
    없음, 있으면 CSS가 400·700으로 고름), `font-synthesis: none`이라 가짜 굵게 없음. **L·B는 받지 않음**.
  - **함정(중요): 원본 파일이 한글 11,172자를 모두 글자표에 올려 두었지만 8,693자는 모양이 비어 있다**(그려지는 한글 2,479자 = KS X 1001
    2,350자 + 똠·쀍·햏·뷁 등). 글자표에 있으면 브라우저는 다음 글꼴로 넘어가지 않고 **빈칸**을 그린다(예: '펲'). → 한글 얼굴
    `CRA NanumSquareRound`의 `unicode-range` = 실제로 그려지는 3,610개 코드만(빈칸·제어 문자 포함, 1,828구간). 그 밖 글자(펲, €, 한자)는
    Noto Sans KR → 시스템으로 간다. 이 범위가 길어서(79KB, 서버 압축 시 약 5~9KB) `styles.css`가 아니라 **`nanum-square-round.css`**에 두고
    고를 때만 붙인다(`rbEnsureNsrFont`, `<link id="boardFontNsrLink">`). 이 파일은 손으로 고치지 않는다 — 로컬 스크립트
    (`docs/worker-briefs/2026-11-06-board-font/make-nsr-css.py`, fontTools, 원본 4개 + SHA256)로 만든다. 글꼴 버전을 바꾸면 다시 만든다.
  - 영문 별칭 `CRA NanumSquareRound Latin` = 같은 파일 + 라틴 범위(그 범위에서 파일에 있는 글자는 모두 그려짐). 한글·영문 둘 다 고르면
    선생님 게시판에서는 같은 파일을 **한 번만** 받는다(사진 도구로 확인: R·EB 각 1회, B 0). 단 관리자 미리보기(700, 한글·영문이
    한 줄에)는 같은 파일을 **동시에 두 번** 받는다(CDP로 확인 — B를 쓰던 때도 똑같이 2번, 이번 변경과 무관; 최고 관리자 화면만이라 그대로 둠).
  - 테스트(`resource-board.spec.js` "board font…" 5개): **글꼴 CDN 요청은 모두 막는다**(Google Fonts, jsDelivr의 css·woff2 — supabase-js
    스크립트는 막지 않음). 그래서 CDN 글꼴은 "그려짐" 대신 요청 주소 · 글꼴 순서 · 브라우저가 그 글꼴을 찾았는지(`FontFace` 상태)로 보고,
    한글 범위는 `FontFace.unicodeRange`로 본다(펲 빠짐, 똠·가 있음). 굵기별 파일은 스타일시트의 `@font-face` 규칙으로 보고(700·800 =
    EB), 요청은 R·EB뿐인지(B 0) 본다. 실제 모양 확인은 로컬 사진 도구(실제 CDN).
  - 테스트 함정: 글꼴 CDN을 막으면 `load`가 관리자 화면보다 먼저 와서 `openAdminBoard`가 메뉴를 너무 일찍 본다(데스크톱에서 숨은 ☰를
    누르려다 30초 멈춤) → 도우미가 `#adminScreen.screen-active`를 먼저 기다린다.
- **로그인 끝남 안내(§5):** `sb.auth.onAuthStateChange` `SIGNED_OUT`(다른 탭 로그아웃도 브로드캐스트로 옴 — 테스트 확인)이나 다른 탭의
  LMS 로그아웃(`cra_lms` 삭제 → `storage` 이벤트)이 관리자 화면이 열린 동안 오면 `#loginEndedModal` + `#adminScreen.inert = true`
  (쓰던 글자 그대로, 아무것도 누를 수 없음). 화면은 저절로 바뀌지 않고 [로그인 화면으로]만. 이 탭의 Log out은 `loggingOut`으로 제외.
  서버에서만 만료된 LMS 세션은 못 잡음(다음 호출이 실패). 게시판 글쓰기 중 올리던 파일은 로그인이 없어 **못 지울 수 있다** → 월 1회
  주인 없는 파일 확인 SQL(`docs/worker-briefs/2026-11-04-board-orphans-do.sql`, 로컬)로 찾는다.
- 테스트 함정: 게시판에서 다른 `#`(예: `#admin`)로 가면 앱이 **스스로 새로고침** → 테스트의 `reload()`와 부딪혀 `ERR_ABORTED` →
  `about:blank`를 거쳐 새로 연다. `stubBoard`는 컨텍스트 전체에 운영 Supabase 차단을 건다(다른 탭 안전망).
- 작업 함정: 파이썬으로 파일을 고칠 때 끝 표식이 시작 표식보다 **앞에** 있으면 빈 문자열 치환으로 파일이 폭발한다(11/05 styles.css,
  커밋 전 되돌림) — 끝 표식은 `s.index(B, a)`로 찾고 길이를 확인. 윈도 파이썬은 `newline=""` 없이 쓰면 CRLF가 된다.

### 이름 변경 '레벨별 자료실' (`2026-11-06`, PM 지시서)

- 옛 레벨별 기능(월 선택 화면 버튼 · 자료 페이지 · 배너 메뉴 상자 '레벨별 자료실 파일' · 켜기/끄기 알림)의 **화면 이름만**
  '레벨별 자료실'(띄어쓰기 있음). 게시판은 '교사자료실'(띄어쓰기 없음). 그대로 둔 것: 분류 이름(그림 자료실 등), DB 키
  `teacher_resources_enabled`, 코드 이름, 주소 `#resources/…`, SQL·Edge Function 주석(SQL 변경 없음), 옛 화면 고정본 `tests/fixtures/*`.
  자료 페이지 카드 묶음의 화면 읽기용 이름(`#resourceGrid` aria-label)도 "교사 자료" → "레벨별 자료실".
- 버튼은 한 글자 늘어 160×48px, 모든 레벨 · 1366/1024/768/390에서 한 줄. 제목과 가장 가까운 곳이 768 Beginner(오른쪽 간격 102px)
  → CSS 그대로.
- 검사(`resource-board.spec.js` "rename:" 2개): 화면 DOM 전체(숨은 화면 · 속성 · 입력값 · 탭 제목)에 옛 이름(띄어쓰기 포함 문자열) 0,
  index.html이 부르는 스크립트에는 **줄 전체 주석에만** 남을 수 있음(문자열로 다시 넣으면 실패) + 버튼 폭 검사.
- 환경 함정: 이 PC의 5173에 다른 프로젝트 Vite가 `::1`(IPv6)로 떠 있을 수 있다. 이 프로젝트는 `127.0.0.1:5173`이라 함께 돈다.
  `Get-NetTCPConnection`은 그 소켓의 상태 칸을 비우거나 FinWait로 보여 "비어 있음" 판단이 헷갈린다 → 주소까지 본다.

### 첨부 50개 · 구글 시트·문서·슬라이드 (`2026-11-07`, PM 지시서 D79·D80)

- **D79:** 글 하나 첨부 20 → **50개**(파일 + 링크 합계, 파일 하나 10MB 그대로). 화면 `RBA_MAX_FILES`, 서버 `board_post_save`의
  `> 50`(`'board: too many attachments (50 at most)'`). 올리기는 그대로 **동시 3개**(`RBA_PARALLEL`) — 50개를 한 번에 놓아도
  요청은 3개씩(테스트: 가짜 서버의 `maxInFlight ≤ 3`).
- **D80 DB:** 새 열 없이 `kind`에 `gsheet`·`gdoc`·`gslides` 추가, ID는 드라이브와 같은 `drive_id`(같은 정규식), 이름은 `label`.
  `create table if not exists`는 기존 표를 안 바꾸므로 표 정의 아래 **ALTER 한 문장**(종류·모양 규칙 drop + add)으로 다시 건다.
  저장 함수: 새 종류 받기, `{id, label}` 이름 바꾸기는 링크 4종류 모두. 목록·상세·내려받기 함수는 그대로(`kind`를 그대로 돌려줌,
  내려받기 함수는 저장 경로가 없으면 "empty"). 옛 레벨별 자료실(`teacher_resources`, `driveIdFromLink`)은 **안 바꿈** — docs 주소 계속 거절.
- **링크 해석(`rbaLinkFromText`, 관리자 파일만):** drive.google.com = 예전 그대로(`driveIdFromLink`). docs.google.com
  `/spreadsheets|document|presentation/d/<ID>/…`(앞뒤 `/u/<n>/`, `?usp=…&ouid=…`, `#gid=…`, `https://` 없음 모두 됨). 거절 문구 따로:
  웹 게시(`/d/e/2PACX-…`) · 설문(`/forms/`) · 그 밖 docs 주소 · 나머지. **`rtpof=true`**(엑셀·워드·PPT 파일을 드라이브에 올려
  구글 편집기로 연 주소 — 변환 안 된 원본)는 **드라이브 파일(`drive`)로** 받는다: 구글 내보내기 주소는 구글 자체 파일용이라 원본이
  안 받아질 수 있음(실제 구글 확인 못 함 — 빅웨이브 운영 확인 항목).
- **선생님 화면:** `RB_LINKS`(resource-board.js)가 종류별 아이콘·문구·내보내기 주소를 한곳에 — 시트 XLS(초록) "구글 시트 · 엑셀로
  받기" → `…/spreadsheets/d/<ID>/export?format=xlsx`, 문서 DOC(새 색 `#2b579a`) "… 워드로 받기" → `…/document/d/<ID>/export?format=docx`,
  슬라이드 PPT "… 파워포인트로 받기" → `…/presentation/d/<ID>/export?format=pptx`. 드라이브와 같은 `<a target=_blank rel="noopener
noreferrer">`(클릭 처리는 계속 `button.bd-att-dl`만). 새 종류의 설명 줄만 `word-break: keep-all`(`.bd-att-meta-export`) — 파일·드라이브
  줄은 예전 그대로. 관리자 첨부 줄의 크기 칸(72px)은 두 줄("구글 시트"/"엑셀로 받기", 슬라이드는 "PPT로 받기" — 칸이 좁아서).
- **순서:** 운영 SQL 먼저 → 푸시. 그 사이 옛 화면은 file·drive만, 20개까지만 보내므로 영향 없음(로컬 DO 검사: 옛 화면 호출 결과 같음).
  반대로 푸시 먼저면 새 종류 저장은 "첨부 목록을 저장하지 못했어요", 21개 이상은 "첨부는 50개까지예요"(서버는 20)로 막힘 — 데이터 손상 없음.
  캐시된 옛 선생님 화면이 새 종류 줄을 만나면 파일 버튼으로 그려져 함수가 "empty"(준비 중)라고 답함.
- 운영 SQL = 로컬 `docs/worker-briefs/2026-11-07-board-attach50-gdocs-{precheck,apply,verify}-do.sql`(apply는
  `*-sql-check.mjs`가 migration.sql 원문에서 잘라 만듦, 검사 = 운영 사본 `tests/fixtures/migration-7869dec.sql` + apply 두 번 = 새 설치).
  **`2026-11-08` 운영 반영**: precheck "반영 전" → apply 성공 → verify 통과 12/12 실패 0 → 그 뒤 푸시. 공유가 '링크가 있는 모든 사용자'가 아니면 구글이 로그인 화면을 보여 준다(드라이브와 같음). 권한은 **뷰어**로(안내 문구에 있음) —
  선생님은 링크의 ID를 볼 수 있어 `/edit`로 열 수 있다. 편집자로 공유하면 원본이 바뀌고, 내보내기는 늘 최신본이라 모두에게 퍼진다.
  시트의 숨긴 탭·문서의 메모도 파일에 함께 들어갈 수 있다(구글 내보내기 동작 — 공유 전에 확인).
- 테스트 함정: 휴대폰에서 숨긴 버튼 글자(`display: none`)는 크기 0 상자가 (0,0)에 잡혀 "줄 밖" 검사에 걸린다 → 폭 0은 뺀다.
  가짜 서버의 `samplePosts()`는 이미 저장 모양(`id`, `created_at`)이라 글을 더할 때도 그 모양으로.

### 모두 받기(ZIP)·선택 받기 · 하루 한도 1,000 (`2026-11-08`, PM 지시서 D81·D82)

- **D81 화면(`resource-board.js` "D81", 선생님 글 상세만):** 파일이 **2개 이상**인 글만 머리줄에 [전체 선택]·[모두 받기 (ZIP ·
  N개)], 파일 줄마다 체크(`<label>` 안 `<input type=checkbox>`, 이름 = "파일명 선택"), 링크 줄은 흐린 "–". 1개 이상 고르면 상자
  아래 선택 바(휴대폰은 `position: fixed` 아래 12px — `rbZipSpace`가 바 높이 + 24px를 `body`의 `--bd-zip-space`로 주고
  `body[data-screen="board"][data-zip-bar]`가 그만큼 아래 여백 + 게시판 바탕색 → 목록으로·저작권 줄이 바에 안 가려짐).
  1개만 고르면 ZIP 없이 그 줄의 `rbDownload`. 압축 중엔 두 받기 버튼 `disabled`. 글을 떠나면(`rbOpenList`·`rbOpenPost`·
  `rbHome`·게시판 밖 hashchange) `rbZipCancel` — 진행 중 fetch abort, 늦게 온 답은 버림.
- **받기:** 파일마다 지금 Edge 함수(`{attachment}`)로 주소를 받고 **바로** `fetch`(주소 15초) → 동시 3개(`RB_ZIP_PARALLEL`).
  Storage 서명 주소는 다른 출처라 CORS가 필요하다(Supabase Storage가 허용 — 운영 확인 항목). 파일 1개 = 하루 1회(그대로).
  200MB(`200×1024×1024`) 넘으면 시작 전에 막음(요청 0). 일부 실패 = 받은 것만 ZIP + 이름 안내, 전부 실패 = ZIP 없음 + 첫
  거절의 문구(429 → 한도 문구).
- **압축 = fflate 0.8.3(MIT)** `vendor/fflate-0.8.3.umd.js`(npm 원본 `umd/index.js` 그대로, 33,044 bytes, SHA-256
  `462ef8041fc970e3615a20a9dd2b2e3047a073b2da729ef4f02b634bba8b7b83`) + `vendor/fflate-0.8.3.LICENSE`(SHA-256
  `0a1df3a083d0c010560aa342e87959c8c1070e6fd54545741f083f22d0c8b551`). npm 레지스트리에서 받음, package.json에 없음(D61).
  **첫 ZIP 때만** `<script>`를 붙인다(`rbZipLib`, 첫 화면·다른 화면 요청 0). `zipSync` = 로컬 헤더에 크기가 들어가는 고전
  모양(데이터 서술자 없음 — 스트리밍 `Zip` 클래스보다 어느 압축 풀기 도구에서나 안전). 압축 강도: 이미 압축된 형식(pdf·
  xlsx·pptx·hwp·hwpx·jpg·png)은 **그대로(level 0)**, 옛 xls·ppt만 level 1(속도 우선). 한글 이름: fflate가 ASCII 밖 이름에
  UTF-8 표시(general purpose bit 11)를 켠다 → 윈도 10+·맥이 바르게 읽음. 저장 = blob URL + `<a download>`(아이폰 사파리
  13+ 포함, 60초 뒤 revoke). 이름: `글 제목.zip` / `글 제목_선택 N개.zip`, `\ / : * ? " < > |`·제어 문자 → `_`, 끝의 점·
  공백 제거, CON 같은 장치 이름·`__proto__` 앞에 `_`, 보이지 않는 표시(C1 제어·폭 0·방향 표시 U+202E 등)는 지움(보안 검토 —
  "안내‮fdp.hwp"가 다른 형식처럼 보이지 않게), 제목 80자; 안의 이름이 겹치면(대소문자 무시) `이름 (2).확장자`. 바꿀 때는
  파일 이름의 버전·`RB_ZIP_LIB`·테스트(`fflateNode`)·이 줄을 함께.
- **D82:** `teacher_resource_issue`·`board_attachment_issue`의 `>= 30` → `>= 1000`(한 계정 한 숫자, 기록 30일 보관·관리자
  무제한 그대로). 보안 검토: 한 계정이 하루에 받을 수 있는 양이 약 30 × 10MB → 1,000 × 10MB로 커진다(유출 계정·반복 스크립트
  기준) — 그래서 운영 SQL은 유료 플랜 전환 뒤에 실행(PM 결정), 더 막아야 하면 계정별 하루 용량 한도를 따로 둘 수 있다
  (기록 행에 파일 크기를 넣어 합계로 거절 — 아직 안 함). 두 화면 한도 문구 = "오늘 내려받기가 너무 많아 잠시 막혔어요. 관리자에게
  문의해 주세요." **Edge 함수
  (`supabase/functions/teacher-resource-download/index.ts`)는 고치지 않았다** — 주석의 "LMS members: 30 URLs per KST day"
  등 30은 D82 전 값(한도는 DB가 정함, 재배포 없음). 운영 SQL = 로컬 `docs/worker-briefs/2026-11-08-download-limit-1000-
{precheck,apply,verify}-do.sql`(apply는 `*-sql-check.mjs`가 migration.sql 원문에서 잘라 만듦; 검사 = `git show 9777457` 운영
  상태 + apply 두 번 = 새 설치, verify 10/10은 시험 지점·지사 계정을 잠깐 만들어 31번째·1,000번째·그다음을 불러 봄).
- **순서:** SQL 먼저 → 푸시 = 그 사이 옛 화면은 한도만 늘어난 것(문구는 옛 "다운로드 횟수를 모두…"지만 1,000회라 거의 안
  보임). 푸시 먼저 → SQL 전 = ZIP은 파일마다 1회라 7개 ZIP 몇 번이면 30에 닿아 "받지 못한 파일" + 새 한도 문구("관리자에게
  문의")가 나올 수 있음 — 데이터 문제 없음. 그래서 SQL 먼저.
- 테스트 함정: 선택 바 버튼엔 PC·휴대폰 문구가 둘 다 들어 있어(하나는 `display: none`) `toHaveText`가 둘을 이어 읽는다 →
  `toHaveAccessibleName`. ZIP 내용은 테스트 안에서 같은 vendor 파일을 `new Function`으로 Node에 올려 `unzipSync`(npm 패키지
  추가 없음), UTF-8 표시·압축 방식은 로컬 헤더를 직접 읽는다. 가짜 서버 `fileBody`·`refuse`·`getDelay`(+`maxGetInFlight`).
  PGlite SQL 테스트가 남은 메모리가 적을 때 worker 비정상 종료(`code=2147483651`)로 한 번 떨어짐 — 단독 재실행 통과.

### 선택 바 따라다니기 · 맨 위 버튼 · 바 진행 표시 (`2026-11-09`, PM 지시서 D84)

- **sticky를 막던 것:** `.bd-card`의 `overflow: hidden`. hidden(auto·scroll도)은 그 요소를 "스크롤 상자"로 만들어, 안의
  `position: sticky`가 창이 아니라 카드에 붙는다(카드는 스크롤되지 않으니 그냥 제자리). → `overflow: clip`(둥근 모서리 자르기는
  같고 스크롤 상자가 아님). 앞 줄에 `overflow: hidden`을 남겨 clip을 모르는 브라우저(사파리 15)는 예전처럼 바가 상자 끝에 머묾.
  카드 안에 sticky를 또 넣을 때 위쪽 조상의 overflow부터 볼 것(관리자 `.rb-ed-bar`는 그런 조상이 없어 처음부터 됨).
- **바 자리:** 상자 **안 맨 끝**(`box.append(status, list, bar)`). sticky는 부모 안에서만 움직이므로 부모 = 첨부 상자여야 상자
  끝에서 멈추고 [목록으로]·이웃 글을 안 가린다. 휴대폰 `position: fixed`는 그대로 — `overflow: clip`은 fixed 자식을 자르지
  않는다(카드가 그 기준 상자가 아님). 카드에 transform·filter를 넣으면 휴대폰 고정 바가 깨진다.
- **맨 위 버튼:** `#boardZipAllBtn` 하나를 `rbZipSync`가 바꾼다(`is-pick` + 아이콘·글자 교체) — 같은 요소라 키보드 포커스가
  남는다. 누르면 고른 게 있을 때 `rbZipGetPicked`(바 버튼과 같음). 그래서 선택 중엔 이름이 같은 버튼이 2개 → 테스트에서
  `page.getByRole("button", { name: "선택한 N개 받기 (ZIP)" })`는 둘에 걸린다(strict 오류) → `#boardZipBar` 안으로 좁힐 것.
- **바 진행 표시:** `job.total`·`job.done`을 `rbZipBarText`가 바에 쓴다(맨 위 status와 같은 숫자). 바는 live 영역이 아니라 두 번
  읽히지 않는다. 받는 중 [선택 해제]도 잠금(D84), 체크·[전체 선택]은 D81대로 안 잠김 → 받는 중 다 풀면 바가 숨고, 다시 고르면
  진행 중 문구로 나온다. 끝나면 고른 것은 남는다(D81).
- **D81부터 있던 함정(고침):** 압축 시작 때 `status.scrollIntoView({block: "nearest"})`가 상태 안내를 창 맨 위(y=0)로 올리는데
  사이트 머리줄(`.topbar` sticky, PC 80px·휴대폰 98px)이 그 위를 덮어 안내·완료·실패 문구가 안 보였다(바에서 누를 때). → 그
  순간 머리줄 높이 + 16px을 `scroll-margin-top`으로 준다(`rbZipShowStatus`).
- **200MB 초과 안내도 같은 스크롤(PM 결정, D84 추가):** 시작 전에 막는 안내가 바에서 누르면 화면 밖에 떴다 → 압축 시작과 같은
  `rbZipShowStatus`로 머리줄 아래에 보이게. 문구·막는 동작(요청 0, 잠금 없음, 선택 그대로)은 그대로.
- 테스트 함정: 바가 나타날 때 0.15초 올라오기(transform) 중엔 `boundingBox`가 12px 어긋난다 → `getAnimations()`의 `finished`를
  기다리거나 계산된 `animationName`으로 확인. 사진 도구 `docs/worker-briefs/2026-11-09-board-pickbar-sticky-screenshots.mjs`.

### 관리자 교사자료실 글 목록 정돈 (`2026-11-09`, PM 지시서 D85)

- **`data-level` 금지(정적 HTML):** `app.js`가 시작할 때 문서의 모든 `[data-level]`에 "그 레벨 월 화면으로" 클릭을 붙인다
  (`document.querySelectorAll("[data-level]")`). 레벨 칩에 `data-level`을 쓰면 누르는 순간 관리자 화면을 떠난다 → 칩은
  `data-rb-level`, 상태 버튼은 `data-rb-status`. 새 정적 버튼에 `data-level`·`data-view`를 쓰지 말 것(JS로 나중에 만든 요소는 해당 없음).
- **다른 관리자 표와 분리:** `.adm-table`·`primaryCell`·`makeCell`·`makeDeleteButton`(`lms-admin.js`, 회원·반·지사·일괄 등록이
  씀)을 이 목록은 안 쓴다 — `.rb-table`과 `rb-*` 클래스만. 그래서 `.adm-table`의 781px 아래 "접기·화살표" 규칙도 안 걸린다.
  `.rb-files`는 이미 글쓰기 화면의 첨부 상자 → 목록 칸은 `rb-col-files`.
- **표 ↔ 줄 목록은 목록 상자 폭으로:** PC 표는 고정 칸만 702px(+제목)이라 1024 창(사이드 메뉴 170px)에도 안 들어간다 → 가로
  스크롤 대신 `.rb-admin-list { container-type: inline-size }` + `@container (max-width: 879.98px)`로 줄 목록(휴대폰·태블릿·좁은
  PC 창). 컨테이너 쿼리를 모르는 브라우저는 표 + 가로 스크롤(`@supports not`). 컨테이너는 안쪽 `position: fixed`의 기준 상자가
  된다(layout containment) — 이 안에 fixed를 넣지 말 것. 휴대폰 필터 줄은 화면 폭(781px)으로.
- **⋯ 메뉴:** 관리 칸 안 absolute. 목록 상자 `position: relative; z-index: 2` — 아래 설정 상자의 `.adm-switch`(relative)가 메뉴를
  덮지 않게. 창 아래 자리가 없으면 위로(`is-up`). 닫기 = Esc(포커스 ⋯로) · 바깥 click(capture; 그 자리가 포커스 받는 곳이면
  그대로, 빈 곳이면 ⋯로) · focusout(Tab으로 나감). 휴대폰은 보기 아이콘 대신 메뉴 첫 항목(`.rb-menu-view`, PC `display: none`) →
  "첫 항목 포커스"는 `getClientRects()`로 보이는 것. 삭제 두 번 누르기는 `makeDeleteButton`과 같은 흐름을 `rbaDeleteItem`이
  "삭제…" 글자로 따로 가짐.
- **줄 바탕은 `tr`에:** 고정 줄 노랑·마우스 올림·F4 빛남을 `tr`에 준다(셀 배경이면 줄 목록에서 칸마다 조각). 마우스 올림은
  `@media (hover: hover)` 안 — 휴대폰은 누른 줄이 계속 칠해져 있다.
- **휴대폰 함정:** ① 세로 flex에 `flex-wrap: wrap`이 있으면 줄 폭이 내용(칩 전체 폭)으로 정해져 페이지가 390보다 넓어짐 → 휴대폰은
  `nowrap`. ② 390에서는 오른쪽 버튼(118px) 때문에 레벨·분류·"첨부·조회·날짜"가 한 줄에 다 안 들어감 → "첨부 N · 조회 N · 날짜"를
  날짜 칸 하나(`.rb-m-meta` + `<time>`, `nowrap`)로 묶어 통째로 다음 줄로(구분점이 줄 앞에 오지 않게). 테스트에서 날짜 칸
  `toHaveText`는 숨은 묶음 글자까지 읽음 → `.rb-col-date time`.
- **등록일:** `formatToParts`로 서울 연·월·일, 올해 = 지금 서울 연도(`rbaDate(iso, now)`; 12/31 23:59 KST = 지난해).
- 테스트 함정: 열린 ⋯ 메뉴가 바로 아래 줄의 ⋯를 덮는다 → "하나만 열림"은 덮이지 않는 줄로. 사진 도구
  `docs/worker-briefs/2026-11-09-admin-board-list-tidy-screenshots.mjs`.

### "다른 탭 로그아웃" 테스트가 흔들리던 원인 (`2026-11-09`, D85 지시서 §5)

- **원인(테스트):** 도우미 `logOutInAnotherTab`가 다른 탭에서 [로그아웃]을 누른 뒤 "홈 화면이 보임"을 기다리고 그 탭을 닫았는데,
  그 탭은 처음부터 홈 화면이라 **누르기 전부터 참인 조건**이었다. supabase-js의 로그아웃(탭 사이 잠금 → `/auth/v1/logout` →
  저장된 로그인 지움 → 다른 탭에 BroadcastChannel로 SIGNED_OUT)이 끝나기 전에 탭이 닫히면 알림이 안 가 창이 안 뜬다. 확인:
  같은 순서 12번 모두 그 순간 그 탭에 로그인이 남아 있었고 10번은 창이 안 떴다(PC 상태·메모리에 따라 비율이 달라 11/08부터 "가끔").
- **고침(테스트만):** 그 탭의 [로그아웃] 버튼이 사라질 때까지 기다린 뒤 닫는다(`logOut`이 signOut을 마친 뒤 버튼을 숨김) → 15/15,
  §5 단독 10번 연속 10/10. "로그인 살아 있음" 테스트의 고정 대기(500·300ms)도 조건으로(배너 탭 스위치가 읽힘 · 이 탭의
  SIGNED_OUT을 들은 뒤 — 앱의 리스너가 먼저 등록돼 먼저 돈다).
- **앱 문제 아님:** 실제로도 [로그아웃]을 누르자마자 그 탭을 닫으면 그 탭의 로그아웃이 끝나지 않아 로그인이 남는다 — 다른 탭도
  로그인 상태 그대로라 어긋남이 없다. `app.js` 변경 없음.
- 교훈: 누른 뒤의 결과를 기다릴 때는 누르기 전에도 참인 조건을 쓰지 말 것.

### 관리자 메뉴마다 주소 · 뒤로·앞으로·새로고침 · 확인창 확대 (`2026-11-09`, PM 지시서 D87, 근거 D86 조사)

- **주소:** `#admin/<메뉴>`(`adminViewTitles` 키), `#admin/board/new`, `#admin/board/edit/<id>`(UUID만). 옛 `#admin`·모르는 메뉴·그
  계정이 못 여는 메뉴 = 기본 메뉴로 **바꿔 씀**(replaceState, 기록 추가 없음). 기본 = 최고관리자 content, 지사·선생님 members.
- **스스로 바꾸는 주소는 `pushState`/`replaceState`만**(hashchange가 안 나서 자기 이동에 다시 반응하지 않음). 들어오기·메뉴 = push,
  같은 주소면 push 안 함(`adminPush`). `location.hash =`를 쓰는 다른 코드(`setHash`, `rbGo`)는 그대로 — 그 hashchange가 올 때는 이미
  `showScreen`이 끝나 화면이 관리자가 아니므로 반응 안 함.
- **hashchange 리스너는 하나**(`resource-board.js`): ① 로그인 끝남 창(§5)이 떠 있으면 아무것도 안 함 ② 편집기가 열려 있으면 편집기가
  먼저(F3) ③ `rbFollowHash` = 관리자 주소 → `craAdmin.follow`(app.js `adminFollowRoute`) / 교사자료실 → `rbRoute` / 교사자료실에서
  나감 → `rbLeave` / **관리자에서 나감 → `craAdmin.leave` = `openHashScreen`**(불러올 때 쓰는 화면 열기를 함수로 뺌 — 레벨별 자료실은
  그때 권한 확인까지). 사용자 화면끼리의 뒤로는 아직 반응 없음(D88).
- **로그인 확인 전에는 안 움직임:** `adminRoutesReady`(로그인 확인 직후 켜짐). 불러올 때는 hydrate 뒤 `adminFollowRoute({reopen:true})`로
  관리자 전체를 다시 그림(그 사이 [Admin]을 눌렀어도 콘텐츠 보드가 hydrate된 내용으로).
- **편집기 기록:** 목록에서 열면 push(+ `rbaListBelow` = 아래가 목록 기록인지), 주소로 열리면(새로고침·뒤로·앞으로·직접 입력) 그 자리.
  [계속 쓰기] = 편집 주소를 **새로 push**(D86 S1 원인: 예전엔 뒤로가 닿은 기록을 replaceState로 덮어 → 다음 뒤로가 사이트 밖).
  창이 떠 있는 동안 또 주소가 바뀌면 그 창이 답함(`rbaAnswer`) — 답할 때의 주소 기준. 저장·취소로 닫으면 아래가 목록이면
  `history.back()`(같은 목록 두 번·편집기 다시 열림 방지), 아니면 그 기록을 목록 주소로 바꿈.
- 메뉴·[사이트 보기]·[로그아웃]으로 편집기를 떠나면(F3 클릭 경로) 편집 기록이 그 아래에 남는다 → 거기서 뒤로 = 그 글 편집 화면이
  새로(저장된 내용으로) 열림. 잃는 것은 없어 그대로 둠.
- **확인창 확대(F3 변경):** `rbaSyncUnload` = 올리는 중 **또는 `rbaChanged()`**. `rbaRenderHead`가 입력·순서·파일 바뀔 때마다 부름.
  `rbaChanged`는 `ed.start`가 정해지기 전엔 거짓(열리는 중 잘못 켜지지 않게).
- **§5:** 창이 떠 있으면 주소 반응 0. [로그인 화면으로] → `craBoardAdmin.drop()` → `rbaCancelAsk`(열린 나가기 창을 답 없이(`null`)
  닫고 포커스 붙잡기 해제) — `then`들은 `null`이면 아무것도 안 함.
- 테스트 함정: ① PC 크기에서 휴대폰 크기로 바꾼 직후 왼쪽 메뉴가 0.2초 미끄러져 나가는 동안 "보임"이라 ☰를 안 누르게 됨 → 숨을 때까지
  기다린 뒤 ☰. ② 편집 중 바뀐 것이 있으면 `page.goto`(새 문서)가 브라우저 확인창에 막힘 → 먼저 [취소]→[나가기]. ③ `history.length`로
  기록 추가 여부 확인. 점검 스크립트 `docs/worker-briefs/2026-11-09-admin-routes-back-recheck.mjs`(D86 경로 그대로).

### Supabase 라이브러리 버전 고정 (`2026-11-08`, PM 결정 D83)

- `index.html`의 supabase-js 주소 `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2` → **`@2.119.0`**(그때 `@2`가 실제로
  주던 버전, 2026-11-04 공개 — 동작 변화 없음). 저장소 안에서 supabase-js를 불러오는 곳은 이 한 줄뿐이다(다른 html·스크립트 없음).
- **왜:** `@2`는 새 2.x가 나올 때마다 jsDelivr가 예고 없이 새 버전을 준다 → 우리가 배포하지 않아도 운영 화면의 로그인·내려받기
  동작이 바뀔 수 있다. 고정하면 바뀌는 때 = 우리가 커밋한 때.
- **올릴 때:** PM 결정 → 새 버전으로 `npm.cmd run qa`(테스트도 이 주소를 jsDelivr에서 그대로 받는다) → `index.html` 한 줄만 바꿔
  커밋. 버전은 npm 레지스트리(`npm view @supabase/supabase-js dist-tags`)에서 확인.

## 요일 슬롯 게임 URL (`2026-10-22`, R1)

- **비-Vimeo http(s) 호스트는 기본이 `kind:"page"`(출판사 페이지 iframe)이고, 게임은 `GAME_HOSTS`에 있는
  호스트만 `kind:"game"`이다**(`video-source.js isGameUrl`, YouTube 판정 다음·page 판정 앞). 관리자는 유형을
  고르지 않는다 — 호스트가 정한다 — 그래서 DB 값은 그대로 문자열이다. 새 게임 제공처가 생기면 상수에 추가하거나
  `site_settings.game_hosts`(`["host", …]`, 관리자 UI 없음 — SQL Editor)에 넣는다. 선생님 사이트는
  `getSignupVisible()`이 `signup_visible`과 `game_hosts`를 **한 요청**(`.in("key", …)`)으로 읽어
  `setExtraGameHosts`로 병합한다. **학생 페이지는 설정을 읽지 않으므로(REST 1회 원칙) 상수만 쓴다** — 설정으로만
  추가한 호스트는 학생 페이지에서 iframe(영상 창)으로 열린다. 둘 다 필요하면 상수에 넣고 배포.
- 선생님 사이트: `openSlot`이 등급 게이트 → 빈 슬롯 → **게임이면 `openGameModal`**(툴바 Game과 같은 모달) 순서.
  `openVideoPlayer`는 `game`을 받으면 `page`처럼 iframe으로 열어 Vimeo 오류를 피한다(도달하지 않는 방어 코드).
- 학생 페이지: `resolvePlayback`이 `kind:"game"`을 `type:"game"`으로 — 슬롯 종류(`slotKind`)와 무관. 목록 버튼은
  `.is-game` + `.play-game-mark`(🎮, 카드 이모지 재사용), aria-label 끝에 "· Game".
- 테스트: `smoke` "weekday slot with a game URL…", "grade 3 sees the no-access…", "site_settings.game_hosts merges…"
  (이 하나만 `site_settings` 요청을 스텁 — 기존 "REST 스텁 금지"는 타이밍 민감 스펙 얘기라 괜찮다), `play` "isGameUrl /
  parseVideoSource…", "weekday game URL offers the game…".

## QR 학생 페이지 (`play.html`, `2026-10-19`)

설계 `docs/superpowers/specs/2026-10-19-qr-student-play-page-design.md`. 도서 QR(네이버 QR) →
`/q/<lv>/<month>/<slot>` → `play.html`이 그 레벨·월의 `content_pages` 1행을 읽어 그 슬롯만 재생.

- ⚠ **슬롯 키와 `/q` 토큰은 인쇄물 계약이다.** `opening`·`ending`·`game`·`unit`·`w1-Mon`… 이름,
  레벨 코드(`b`=Beginner, `l1`~`l3`=표시 Level 1~3), 월 숫자(3~12)를 바꾸면 인쇄된 QR이 죽는다.
  (네이버 QR에서 연결 주소를 240개 다시 고치면 살릴 수는 있지만 비싸다.)
- **`video-source.js`는 `app.js`·`play.js`보다 먼저 로드되는 공유 classic script다.** 여기 있는
  이름(`months`, `TOOLBAR_BUTTONS`, `parseVideoSource`, `slotTitle` …)을 `app.js`에 다시 선언하면
  classic script 전역 스코프에서 재선언 `SyntaxError`가 나 **사이트 전체가 멈춘다.** 또한 이 파일은
  최상위에서 DOM을 건드리면 안 된다 — `scripts/make-qr-list.mjs`가 Node `vm`으로 읽는다.
  새 이름을 추가하면 파일 머리의 `/* exported */`와 `eslint.config.mjs`의 `videoSourceGlobals`도 갱신.
- **`play.html`의 자산 경로는 전부 절대경로**(`/play.js` …). `/q/b/3/w1-mon`에서 상대경로는
  `/q/b/3/play.js`로 풀려 404가 된다.
- **`/q/...` rewrite(`vercel.json`)는 Vite dev 서버에서 동작하지 않는다.** 로컬·테스트는
  `play.html?l=b&m=3&s=w1-mon` 쿼리 형식으로, rewrite는 배포 후 curl·실기기로 확인한다.
- **끝 슬래시: Vercel의 `/q/:path*`는 `/q/b/3/w1-mon/`을 매칭하지 않았다(첫 배포에서 404).** 직접 만든
  로컬 흉내 서버(정규식)는 통과시켜 놓쳤다 — **rewrite·redirect 동작은 흉내 서버가 아니라 배포 후 curl로만
  믿을 것.** 지금은 `"trailingSlash": false`로 끝 슬래시 주소가 308로 슬래시 없는 주소로 간다
  (`2026-10-19` `16be3c5`, 운영 확인). `/q`(슬래시 없음)도 rewrite에 걸려 학생 페이지의 invalid 카드가 뜬다.
- **`play.css`는 `styles.css`를 로드하지 않는다**(163KB, 선생님 사이트 전역 규칙). 필요한 토큰만
  복제했으니 `styles.css :root`나 DESIGN.md 레벨 표를 바꾸면 `play.css`도 맞춘다.
- **재생 방식은 호스트로 정해진다** (`play.js` `publisherStrategy()` → `PUBLISHER_STRATEGY`). 도메인
  잠금 Vimeo(`tps-education.com/58?video=`)는 `tps-education.com`·그 하위 호스트(`play.`)에서
  `"direct"`(`player.vimeo.com/video/<id>` iframe을 직접 만들고 SDK로 감쌈, `ended` → 종료 오버레이),
  그 외 호스트에서 `"page"`(퍼블리셔 페이지 iframe + 인라인 Next). id 추출은
  `parseVideoSource(url, { publisher: "direct" })` — 선생님 사이트는 옵션 없이 불러 `kind:"page"`
  그대로다. 로컬에서는 `?host=play.tps-education.com`으로 direct 경로를 흉내 낸다(127.0.0.1·localhost에서만
  유효). 로컬 Vimeo는 허용 도메인이 아니라 "개인정보보호 설정" 오류가 정상이다. Referer 위조·프록시·
  재업로드는 금지(출판사 접근제어 우회).
- **아이폰 Vimeo 전체화면은 iOS 자체 전체화면(`playsinline=0`)으로 한다.** 아이폰 Safari·앱 내 브라우저는
  요소 Fullscreen API가 없어(`fullscreenEnabled`·`webkitFullscreenEnabled` 둘 다 false) 우리 ⛶는 유사
  전체화면(주소창 남음)밖에 못 한다. 그래서 이 조건(`play.js` `noFullscreenApi()`, 재생할 때 판별)에서는
  Vimeo iframe에 `playsinline=0`을 주고 우리 ⛶를 숨긴다 — 재생이 시작되면 iOS가 전체화면으로 연다(10/19
  qrtest 실측: 우리 ▶·플레이어 ▶ 모두 즉시 전환). YouTube는 진짜 전체화면이 플레이어 자체 버튼
  (`controls 1`)뿐이라 로고·채널 링크가 노출되므로 손대지 않았다. 학생 페이지는 `vimeo.com/<id>`,
  `vimeo.com/<id>/<hash>`, `player.vimeo.com/video/<id>?h=`도 id(+hash)로 바꿔 직접 iframe을 만든다
  (`vimeoLink()`; 선생님 사이트 `app.js`는 SDK URL 경로 그대로).
- **일시정지한 플레이어는 밖으로 나가는 링크를 보여준다**(Vimeo 로고 — 무료 플랜은 못 없앰; YouTube 제목·로고·
  추천 영상). 그래서 탭 레이어는 한 번 재생된 뒤로는 **일시정지 중에도** 플레이어 전체를 덮고, 탭하면 다시
  재생한다(YouTube·Vimeo 공통). 첫 재생 전(자동재생 차단)에만 비워 둔다 — 플레이어 자체 ▶을 눌러야 해서.
  Vimeo iframe에는 `title=0&byline=0&portrait=0`(무료 플랜도 적용됨)을 준다.
- **play 호스트 라우팅(`vercel.json`): Vercel은 rewrite보다 실제 파일을 먼저 서빙한다.** 그래서
  `has: host` rewrite만으로는 `play.tps-education.com/`·`/index.html`이 선생님 사이트를 연다.
  이 둘은 `redirects`(파일 확인보다 먼저 적용)로 `/q`(invalid 카드)에 보내고, 파일 없는 나머지 경로만
  rewrite로 `/play.html`에 보낸다. 학생 페이지 자산(`/play.js`·`/play.css`·`/video-source.js`·
  `/supabase-config.js`)을 가리는 규칙을 넣지 말 것. `tests/vercel-config.spec.js`가 규칙을 고정하지만
  실제 동작은 배포 후 curl로만 믿는다.
- **자동재생 없음.** 모바일은 제스처 없이 소리 재생을 막으므로 ▶ 탭(또는 목록 탭) 안에서 플레이어를
  만든다. YouTube 위 탭 레이어는 **첫 PLAYING 이후에만** 켠다 — iOS가 스크립트 재생을 막으면 아이의
  첫 탭이 YouTube 자체 재생 버튼에 닿아야 하기 때문.
- **빈 플레이어 틀이 안내 카드를 덮는 함정:** `.play-frame`은 absolute라 in-flow 카드 버튼("Try
  again", "Let's play!") 위에 깔려 탭을 삼켰다(테스트로 발견). 카드가 보일 때(`.play[data-card]`)
  틀을 숨긴다.
- **같은 영상을 API 로딩 중에 두 번 탭하면 플레이어가 2개 생겨 소리가 겹쳤다**(영상 id 비교 가드는
  같은 id라 통과). 지금은 `playState.mountId`를 teardown마다 올리고, API를 기다리던 마운트는 id가
  바뀌었으면 버린다. 가드를 id·객체 비교로 되돌리지 말 것.
- **전체화면 스타일은 `:fullscreen`이 아니라 `data-fullscreen` 속성 기준**(`.play[data-fullscreen]`,
  유사 전체화면은 `body.play-fullscreen`도). 오래된 브라우저는 모르는 선택자가 섞인 규칙을 통째로
  버리고, 아이폰 Safari(유사 전체화면 경로)가 그 대상이다. `:fullscreen`으로 "정리"하지 말 것.
- **REST 읽기는 10초 타임아웃**(`FETCH_TIMEOUT_MS`, AbortController). 응답 없는 네트워크에서도
  "Can't load right now." + Try again이 뜬다. 테스트는 `page.clock`으로 시간을 넘긴다.
- **비용:** Storage 요청 0, `content_pages` 읽기는 로드당 1회(목록 전환은 캐시 사용), 쓰기 코드 없음.
  `tests/play.spec.js`는 **REST를 픽스처로 응답**한다 — `smoke.spec.js`의 "REST 스텁 금지"는 메인
  사이트의 타이밍 민감 스펙 때문이고, 별도 페이지인 학생 페이지에는 해당하지 않는다. 가드 스펙이
  Storage 0·REST 1회를 단언한다.
- **네이버 QR 입력 목록:** `npm run qr:list` → `qr/beginner-qr-list.csv`(+ `README-naver-qr.txt`).
  `qr/`는 `.gitignore`·`.vercelignore` 대상(생성물). REST 1회. `--offline`·`--host`·`--solo` 옵션.
