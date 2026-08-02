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
