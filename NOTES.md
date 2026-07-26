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
- The device-auth login flow (`vercel login`, `gh auth login`) reuses the **browser session** —
  log the wrong account out of the site in the browser first, or it re-authorizes the wrong one.

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
  Supabase Auth (`auth.signInWithPassword({email:id})`); otherwise → **member** `sb.rpc("verify_member_login",
{p_id,p_password})` returning the grade (1-3) or null. ⚠ Don't issue member ids containing `@` — they'd
  misroute to the admin Auth path and fail.
- **Member grade is a CLIENT-SIDE gate**, not real auth. It lives in `state.grade` + `localStorage.cra_member`
  (`saveMemberSession`/`clearMemberSession`/`restoreMemberSession`), restored on load (an admin Supabase
  session supersedes it). It's spoofable on purpose — the real protection is RLS (only admins can WRITE
  content/members/settings; video URLs are public to read). The grade only drives the `#noAccessModal` popup
  in `openSlot` (grade 3 blocked; 1/2/admin/anon play).
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

## Video player modal (Vimeo)

- The custom video modal (Level 1 / March) drives a Vimeo iframe via the **Vimeo Player SDK**
  (`<script src="https://player.vimeo.com/api/player.js">`, loaded before `app.js`). It's an
  external CDN script — fine for the static no-build deploy, but make sure `.vercelignore`
  doesn't exclude anything it needs (it doesn't; the SDK is remote).
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
- The modal opens **only** on Level 1 / March — gated at click time by `isLevel1March()`, because
  `#contentScreen` + the 20 `renderLessons()` buttons are shared by all levels/months. When
  testing scope, use a **fresh Playwright page per route** (hash-only navigation doesn't re-run
  `app.js`, so `state.level` leaks and the gate looks broken — see the hash-nav note below).

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
- **Landscape-tablet content banner is 2-row.** Round-12 made the level banner one line
  (`content-level-banner{grid-auto-flow:column}`), cramming `Level 1 · band · ③`. Now a 2-col×2-row grid:
  name (r1c1) + month circle (r1c2), band spans r2. The circle is shrunk 60→46px there so the extra row
  doesn't push the 4-week board past the fold on the 712-tall Galaxy Tab. Scoped to `768–1180 landscape`;
  PC(>1180)/mobile keep the stacked banner.
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
- Always delete temp verification files (`_*.mjs`, `_*.png`) afterward — they are not gitignored.
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
