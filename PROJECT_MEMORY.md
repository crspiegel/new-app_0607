# Project Memory — Resume State

**Read this first when starting a new session.** It captures where we are, how we work, and
what's next, so any new session can continue without losing prior context.
(Document map → `CLAUDE.md`. Engineering gotchas → `NOTES.md`.)

## Snapshot

- Kindergarten English learning **static SPA** prototype (Cambridge Reading Adventures).
- Stack: HTML5 + CSS3 + Vanilla JS, served by Vite (dev only), Playwright smoke tests.
- Core files: `index.html`, `styles.css`, `app.js`.
- Supporting docs: `PRODUCT_SPEC.md`, `DESIGN.md`, `PLATFORM_ROADMAP.md`, `NOTES.md`.
- The later Next.js/Supabase/Capacitor rebuild is out of scope for now (`PLATFORM_ROADMAP.md`).

## Current phase: DESIGN ITERATION (live for client review)

We are polishing the visual design per the user's requests — one change at a time — and
deploying for client review. The app is **live**: https://new-app0607.vercel.app

### How we work in this phase

1. Make the requested change in `index.html` / `styles.css` / `app.js`.
2. Verify locally: `npx prettier --write` the edited files → `npm.cmd run check`; for visual
   changes, screenshot via Playwright (local static server) and check computed values.
3. Report changed files + verification. **Do NOT commit or deploy unless the user asks.**
4. When asked to commit/deploy: `npm.cmd run qa` → commit → `git push` (Vercel auto-deploys).
   Then verify the live site.

- User preference: work locally; commit & deploy only on request. Keep approved visuals exactly
  as-is unless a change is requested.
- Small, specific design tweaks → just execute + verify. Non-trivial/architectural work →
  use Plan mode first.

## Infrastructure

- **GitHub:** https://github.com/crspiegel/new-app_0607 (public, branch `master`, remote `origin`).
- **Vercel:** project `new-app_0607`, connected to the GitHub repo → `git push` = auto production
  deploy. **Static, no build** (`vercel.json` + `.vercelignore`; see `NOTES.md` for why no Vite build).
- **Accounts:** GitHub + Vercel are **`crspiegel` / crspiegel@gmail.com** (NOT any `wechange2023*`
  account). `git push` works (gh is the credential helper via `gh auth setup-git`).

## Design changes done so far

- **Repo hygiene (early):** docs consolidated 9→6, dead code removed, git initialized, deployed.
- **Header:** level icons 70×50, radius 24, numbers Sniglet 22px; `scrollbar-gutter: stable`
  (consistent cross-page alignment); nav drops to its own centered row at ≤1023px.
- **Month-select page:** labels show "March" (removed "MONTH"); per-level theme color aligned to
  each level's own color (L1 yellow / L2 red / L3 blue / L4 purple); book-band labels (e.g.
  "Pink A/B, Red, Yellow") under the level chip; box numbers **Manrope 800 / 52px** (white fill +
  theme-shadow stroke — the `[class*="level-theme-"]` rule overrides the base Concert One rule);
  box radius 39px.
- **Content (month detail) page** (V1 `#contentScreen`, all levels + all months):
  - Background = a light per-level tint (L1 ivory `#fff3cc`, L2 `#ffe8e8`, L3 `#e8f6ff`,
    L4 `#f4e3ff`); text uses the readable dark theme shade (`--level-accent-shadow`).
  - **Centered top banner**: Level name (Sniglet 40px) + book band (Inter 16px) + a month
    badge, all in the level's theme color. The month badge is a **bare number in a circle**
    (no "Month" label, no pill) — `60px` circle filled with the level theme color
    (`var(--level-accent)`), white **Manrope 800 / 36px** number (matches the month-select page
    typeface). The "Month" text node is hidden via `font-size:0` on `.content-banner-month`.
  - **Toolbar ↔ weekday board gap** tightened to ~50% (toolbar `margin-bottom:12` /
    `padding-bottom:7`; board `padding-top:25` in the ≥768px block so mobile keeps its padding).
  - The "X Reading Plan" h2 title is **hidden** (the whole `.content-v2-title-block`); its font
    trial had settled on Baloo 2 / 800 before it was hidden.
  - **Month navigation**: a header row just below the topbar with **Back = previous month (left)**
    and **Next = next month (right)**. Back hidden on March (first), Next hidden on December
    (last) via `#contentScreen[data-month="..."]`. `app.js` sets `#contentScreen` `data-month`
    (used for the layout + first/last logic) and `goToMonth(±1)` drives the buttons.
  - ⚠ Back no longer returns to the month-select screen — to change level/month otherwise, use
    the top-nav level icons (→ `#months`) or the brand logo (→ home).
  - **Lesson board redesign (client-approved on L1/April, then rolled out to ALL levels +
    ALL months):** toolbar reduced to **Opening + Ending Song only** (other three hidden),
    centered; weeks numbered **continuously 1–4** (across both books, in `renderLessons`);
    weekday buttons are **3D in the level theme color**; weekday text **24px** in a dark theme
    shade; **week-label cards are flat (2D) on a light theme tint**. Per-level colors come from
    new `.level-theme-N` vars `--content-day-bg/-shadow/-text` and `--content-week-tint`; the
    rules themselves are un-scoped (`#contentScreen ...`) so every level/month inherits them.
    L1 keeps the exact approved values (`#ffd43b` / `#8a6400` / `#ffe9a8`). (V2/V3 untouched.)
- **Main page section titles:** Nunito 900 / 33px; "Choose Your LEVEL" capitalized.
- **Footer color per level:** the shared `.site-footer` is green (`--owl-green`) on home/overview,
  but takes the active level's theme color on level pages (L1 yellow / L2 red / L3 blue /
  L4 purple). `app.js` `showScreen()` mirrors the level-theme class onto `<body>` for the four
  level screens (months/content/contentV2/contentV3); CSS:
  `body[class*="level-theme-"] .site-footer { background: var(--level-accent) }`. Footer text is
  still white (`--canvas`) — fine on red/blue/purple; ⚠ low contrast on L1 yellow (open item).
- **Login page (new, frontend-only — no real auth):** `#loginScreen`, routed from the header's
  rightmost login button (`data-view="login"` → `#login` hash; `setHash`/on-load handle it).
  Layout based on the Duolingo login screenshot but rebuilt in our design system: **'Log in'
  title in Cal Sans** (Google Fonts; `letter-spacing:0.03em`), soft-gray rounded `user ID` +
  `Password` inputs (focus → macaw-blue), big macaw-blue tactile **LOG IN** button (height 75px),
  one-line legal fine print. No sign-up, no OR/Google/Facebook (removed per request). Card is
  centered both axes between header/footer (`body.login-active main{display:flex}` +
  `#loginScreen.screen-active{flex:1;display:flex}` + section centers). **Footer turns white**
  on login (`body.login-active .site-footer`, hairline top, muted dark text). app.js toggles
  `login-active` on `<body>` in `showScreen()`.
- **Footer copyright:** year is now **2026** on all pages (was 2025). Copyright text **bold
  removed on the main/home page and the login page only** (others stay 800/bold — HOLD): home
  via `body:not(.subpage-active) .site-footer p{font-weight:400}`, login via
  `body.login-active .site-footer p`. Inter `400` weight added to the font import for a true
  regular.
- **Video player modal (Level 1 / March ONLY — `2026-06-10`):** clicking **Opening Song**,
  **Ending Song**, or any of the **20 weekday lesson buttons** opens a custom-shelled video
  modal. Scope is enforced at click time (`isLevel1March()` = `state.level === "Level 1" &&
state.month === "March"`), so the shared `#contentScreen` markup stays inert on every other
  level/month and on V2/V3. Built from scratch in our design system: centered overlay, **50vw**
  white card (`92vw` under 760px), 16:9 black stage, and a control row — **Play/Pause (single
  toggle) · Stop · Repeat · progress bar · Maximize**. Style (revised `2026-06-10`): **flat aqua**
  (`--macaw-blue`) circular buttons — no bevel/drop shadow, white icons, hover → `--macaw-blue-shadow`,
  Repeat-active → `--deep-blue`. Round **X** close is also flat aqua with a **thick white "x"**
  (`stroke-width:4`), top-right corner-overlap. Driven by the **Vimeo Player SDK** (`player.js`,
  before `app.js`; `controls:0` so our UI is the only UI). **One Play/Pause toggle**
  (`#vpToggle[data-playing]`) swaps icon via the Vimeo `play`/`pause`/`ended` events; **clicking the
  video** (transparent `.vp-click-layer` over the iframe — the cross-origin frame would otherwise
  eat the click) toggles play/pause too. Stop = `pause()` + `setCurrentTime(0)`; Repeat = `setLoop()`
  (`aria-pressed`); Maximize = Fullscreen API on the card (Vimeo's native fullscreen is hidden with
  its controls). Progress via `timeupdate`, click-to-seek. Close via X / overlay / **Esc**. The
  stage clips the iframe cleanly via layer promotion (`transform:translateZ(0)`) + matching
  `border-radius` on the iframe — fixes the thin black corner seam Chrome leaves when an ancestor's
  `border-radius` doesn't clip a child iframe. Sample video for all 22 buttons: Vimeo id `210024645`.
  Markup `#videoModal` lives before `app.js`; styles are a new self-contained block (no existing
  rules touched). _Not yet wired:_ per-button distinct URLs, other levels/months.
- **Video player design pass (`2026-06-10`):** kept the flat-aqua/toggle/thick-X direction, polished
  within it. **Two-tier control bar** — full-width **progress row** (`current · bar · duration`) on
  top, **transport row** below (toggle/stop/repeat left, `.vp-spacer`, maximize right) — fixes the
  cramped mobile seek bar and the lopsided desktop layout. Added **time labels** (`formatTime`,
  tabular-nums) from `timeupdate`/`getDuration`; a **draggable thumb** with pointer drag-to-seek
  (`vpDragging` ignores `timeupdate` mid-drag; `is-dragging`/`:hover` grow the thumb); a **context
  title** `#vpTitle` (lesson buttons carry `data-vp-title` = `"<lessonType> · Week N"` set in
  `renderLessons`; toolbar passes "Opening/Ending Song"); **bigger primary toggle** (58 vs 50px);
  `:focus-visible` deep-blue rings (buttons are shadowless); a **pop-in** card animation +
  overlay fade (guarded by `prefers-reduced-motion`); a soft **dark-aqua radial** stage background
  so buffering reads as loading not broken; and `:fullscreen` light title/time text. ⚠ Headless
  can't load Vimeo duration/playback, so live time + drag-seek are verified by inspection (guarded
  on `vpDuration`), not headless run — see `NOTES.md`.
- **Video player controls reflow + end overlay (`2026-06-10`):** transport row is now a 3-zone grid
  (`grid-template-columns:1fr auto 1fr`) — **Repeat left** (`.vp-transport-left`), **Play/Pause +
  Stop centered** (`.vp-transport-center`), **Maximize right** (`.vp-transport-right`); replaced the
  old left-clustered + spacer layout. **End-of-video overlay** (`#vpEndOverlay`, inside `.vp-stage`,
  `z-index:2` above the click layer, opaque dark-aqua radial + a **Replay** pill) shows on the Vimeo
  `ended` event to **cover Vimeo's related-videos end screen** (no reliable cross-account embed param
  to disable it, so we overlay instead). Hidden on open/close and on the `play` event; Replay =
  `setCurrentTime(0)` + `play()` + hide. (Loop on → `ended` never fires → no overlay, as intended.)
- **Video player design-review pass 2 (`2026-06-10`):** (1) **title separator unified to `·`** —
  lesson buttons now `"<lessonType> · Week N · <day>"` (e.g. `Story · Week 1 · Tue`); dropped the
  earlier `-` between week/day. (2) **On-brand title** — 18px + a small aqua accent dot
  (`.vp-title::before`). (3) **Mute/volume toggle** (`#vpMute`, left zone next to Repeat) — Vimeo has
  no mute, so `setVolume(0)` / restore `vpLastVolume`; persists across opens, applied on player
  create; deep-blue active state + volume/muted icon swap. (5) **Buffered indicator**
  (`#vpProgressBuffer`, light aqua) driven by the Vimeo `progress` event. (6) **Darker time labels**
  (`#555`). (7) **Slider a11y** — progress bar is `role="slider"` with `aria-valuenow`, plus keyboard
  seeking (←/→ ±5s, Home/End). **Stop kept** (it's an original required control; the review's
  "reconsider" resolved to keep). `.vp-transport-left` is `display:flex` so Repeat+Mute sit in a row.
  ⚠ Live time / drag / keyboard-seek / mute audio still can't be exercised headless (no Vimeo
  duration/playback there) — verified by structure + inspection.
- **Video player inline volume slider (`2026-06-10`):** added a compact horizontal **volume slider**
  (`#vpVolume`, `role="slider"`) next to the mute button, wrapped together in `.vp-volume` in the
  left transport zone. Reuses the progress bar's aqua fill + white thumb at a smaller scale (84px).
  State is `vpVolumeLevel` (0–1) + `vpLastVolume`; **`applyVolume()`** is the single entry point
  (slider drag/click, keyboard ±10% via ←/→/↑/↓ + Home/End, and the mute button which toggles
  between 0 and the last non-zero level). `reflectVolumeUI()` keeps the slider fill/thumb +
  `aria-valuenow` + mute icon (muted = volume 0) in sync; a Vimeo `volumechange` listener mirrors
  external changes. Volume persists across opens and is applied on player create
  (`setVolume(vpVolumeLevel)`). **Responsive:** the slider is hidden under `560px`
  (`@media max-width:560px`) so phones keep just the mute toggle (no row overflow); the slider's UI
  is fully testable headless since `applyVolume` updates the DOM independently of Vimeo playback.
  ⚠ Naming gotcha: the DOM ref is `vpVolume` (element), the volume value is `vpVolumeLevel` — don't
  collide them (a `const`/`let` of the same name is a SyntaxError).
- **Video player title font + chunkier volume bar (`2026-06-10`):** the `.vp-title` is now
  **Readex Pro 600** (added `Readex+Pro:wght@600` to the Google Fonts `<link>`) in a readable light
  gray **`#9a9a9a`** (was Nunito 800 / `--ink`). The inline **volume slider is larger/plumper** —
  `104×13px` track (was 84×8) with a `21px` thumb (was 16) — per the request that it felt too small.
- **Video player title size + hover volume (`2026-06-10`):** title font reduced `18px → 15px`.
  The volume slider no longer sits permanently next to the progress bar (looked cluttered) — it's
  now a **hover/focus-revealed floating popover above the sound icon** (`.vp-volume` is the
  `position:relative` anchor; `.vp-volume-slider` is absolute, `opacity:0`/`pointer-events:none` by
  default, revealed via `.vp-volume:hover`/`:focus-within`, with a `::after` bridge over the gap so
  the hover doesn't drop). Still hidden under 560px (mute only). Floats to the **right of the sound
  icon** (`left:calc(100% + 12px); top:50%`) — the earlier above-the-icon position overlapped the
  progress bar; right placement sits in the empty gap between mute and the play buttons, clear of
  both. **Corner seam re-fix (`2026-06-10`):** the thin dark band at the video's rounded corners
  was the iframe's _own_ `border-radius` exposing the dark stage background. Fix = iframe is now
  **square (no radius) and overscans the stage 1px on every side** (`top/left:-1px;
width/height:calc(100% + 2px)`), so the stage's rounded `overflow:hidden` clip always cuts through
  solid video. See `NOTES.md`. **Fullscreen auto-hiding chrome (`2026-06-10`):** in fullscreen the
  title + controls + close become **YouTube-style auto-hiding overlays** — title overlays the top,
  controls the bottom (each over a scrim), hidden by default and revealed on pointer-move/tap, then
  re-hidden after 2.5s of inactivity (cursor hidden too). `app.js` toggles a **`.vp-fullscreen`
  class** on `fullscreenchange` (so the CSS keys off `:is(:fullscreen, .vp-fullscreen)` and the
  behaviour is testable without real fullscreen); `revealFsControls()` adds `.vp-controls-visible` +
  a `window.setTimeout` hide timer; `pointermove`/`pointerdown` on the card re-reveal. Non-fullscreen
  mode is untouched (chrome always visible). ⚠ ESLint has no `setTimeout`/`clearTimeout` globals —
  use `window.setTimeout`/`window.clearTimeout`. **Title week/day:** confirmed the
  20 weekday lesson buttons already show `"<type> · Week N · <day>"`; the toolbar Opening/Ending
  Song are month-level (no week/day) and the user chose to **keep them as just the song name**.
- **Book cover art on the title-card placeholders (Level 1 / March — `2026-06-10`):** the two
  white rounded placeholders left of the weekday groups (`.book-title-card`, rendered by
  `renderLessons`) now show real **Cambridge Reading Adventures covers** — `book-1` = "My Dad is a
  Builder" (`assets/l1-march-book-1.jpg`), `book-2` = "The Show and Tell Day"
  (`assets/l1-march-book-2.jpg`). `renderLessons` tags each card `book-1`/`book-2`; the covers are
  set as `background-image` **scoped to L1 March only** via
  `#contentScreen.level-theme-1[data-month="March"] .book-title-card.book-N`, so every other
  level/month keeps the empty white placeholder. **Final design:** `background-size: cover` (fills
  the card, aspect kept, slight crop accepted — no leftover background), **no 3D lip**, replaced by a
  **3px white outline OUTSIDE the cover** (`box-shadow: 0 0 0 3px #ffffff` — outset, not inset, so it
  never covers the image; follows the rounded corners; adds no layout box). The two cards are the
  same size (150×202) and span exactly week1→week2 / week3→week4 (grid-row span 2; card top/bottom
  align to the week rows at 0px). (Iterations the client rejected: `contain` + white box left
  letterbox margins; an inset outline intruded over the image — final is outset white 3px.) Source
  files were `e:\tps\app\9781107549739i.jpg` / `20260610_160816.jpg`. ⏳ Pending client design
  sign-off before rolling covers out to all levels/months — when extending, scope per
  level/month (the covers and ideally the outline color may differ per level).
- **DESIGN.md updated:** added an authoritative **"Implemented Design System (current build —
  source of truth)"** section documenting the real as-built values (tokens, fonts, the per-level
  theme token table, header/month/content specs, footer) — supersedes the legacy Duolingo-ABC
  reference where they differ.

- **Responsive optimization pass (`2026-06-11`, from user device testing — NOT yet committed):**
  Four fixes across tablet-landscape and mobile-portrait, verified by Playwright screenshots at
  360/390 (mobile) and 768/800/1024/1180/1280 (tablet→desktop); no horizontal scroll at any width.
  - **Hero buttons under the wave:** the decorative white `.hero-wave` is `z-index:2`; the hero
    content grid was `z-index:1`, so a tall copy column (tablet landscape) let the app-download
    buttons sink _behind_ the white wave. Fixed by raising `.hero-grid` to **`z-index:3`** (desktop
    unaffected — its image never reaches the wave).
  - **Tablet-landscape hero too narrow:** in `@media (min-width:768px) and (max-width:1180px)`,
    widened the copy column and shrank the image column + gap
    (`grid-template-columns: minmax(0,1.1fr) minmax(280px,0.72fr)`), pushed the image to the right
    (`.hero-stage{place-items:center end}`), and trimmed `.hero-copy` padding-bottom to 92px.
  - **Tablet-landscape content board cut off (Thu/Fri hidden, h-scrollbar inside `.lesson-board`):**
    root cause was `.lesson-grid{min-width:900px}` + the desktop's big content padding overflowing
    the viewport. New block **`@media (min-width:768px) and (max-width:1249px)`** drops the min-width
    floor, tightens the grid (`minmax(72px,150px) 60px repeat(5,minmax(54px,1fr))`, gap 16) and
    content padding (`clamp(28px,4vw,64px)`, board 30). Hands off to the base desktop layout at
    **≥1250px** where the 900px grid fits the default padding natively (computed: `0.88·W−200 ≥ 900`).
  - **Mobile-portrait hero stacked:** removed the fixed `--hero-height` clamp on mobile
    (`height:auto`), made `.hero-stage` in-flow below the copy at full opacity (was an absolute,
    faded, off-screen background decoration), and forced the two store buttons onto one row
    (`.app-downloads{flex-wrap:nowrap}` + `.app-download-button{flex:1 1 0;width:auto}`). Order is
    text → 2 buttons across → image (natural DOM order in the single-column grid).
  - **Month-select 2×5 on mobile:** base `.month-grid` is now `repeat(2,minmax(0,1fr))` (was `1fr`);
    still widens to 5 columns at ≥768px. Mobile month-button → full cell width, 96px min-height.
  - **Mobile-portrait content board (most severe):** restructured to a **6-column grid**
    (`44px` week-label + `repeat(5,minmax(0,1fr))`) with **each book cover promoted to its own
    full-width row** (`.book-title-card{grid-column:1/-1;grid-row:auto}`, `background-size:contain`
    so the whole portrait cover shows). This removes the wide book-card column that forced the
    h-scroll; all five weekdays fit and day text scales (`font-size:clamp(11px,3.2vw,15px)`).
    Opening/Ending Song are bigger and side by side (`.content-type{flex:1 1 0;min-height:60px}`).
    (The old `@media (max-width:420px)` lesson rules are now out-specified by these `#contentScreen`
    rules — harmless dead rules.)

- **Responsive pass — round 2 (`2026-06-11`, after user re-test at 320px Galaxy S9+; uncommitted):**
  - **Image must sit BEHIND the white wave (mobile + desktop + tablet).** Round 1 raised
    `.hero-grid` to `z-index:3` to save the buttons, which also lifted the character image above
    the wave. Fixed by **removing the z-index from `.hero-grid`** (so it creates no stacking context)
    and instead giving **`.hero-copy{z-index:3}`** (above the `z-index:2` wave) and leaving
    `.hero-image`/mobile `.hero-stage` at `z-index:1` (below it). Net: characters emerge from behind
    the white curve; the text + app buttons stay on top. Mobile `.hero-wave` shortened to 96px so the
    in-flow image only tucks its base behind the curve.
  - **Mobile store buttons overflowed at 320px** ("Google Play" escaped): shrank the icon (20px),
    `small` (9px), `strong` (12px) and button padding/gap in the `≤767px` block so both fit.
  - **Level cards 2×2 on mobile:** base `.level-grid` → `repeat(2,minmax(0,1fr))` (was 1fr); widens
    to 4 at ≥768px. Mobile level-button shrunk (min-height 158, rows `26px 1fr 38px`, strong 26px).
  - **Month buttons wider + title one line:** the month screen used the default 80% content width
    (big side margins → tall buttons, wrapped title). Forced **`#monthScreen .section-inner{width:100%}`**
    on mobile, shortened the button (min-height 84), and set `#monthTitle{white-space:nowrap;
font-size:clamp(24px,7vw,32px)}`.
  - **Mobile content covers:** round 1 made the book card full-width + `contain`, so the cover
    floated in an oversized white box. Now the **card is sized to the cover** (centered,
    `width:min(150px,46%)`, `aspect-ratio:150/202`) and uses the base `has-cover` rule
    (`background-size:cover` + rounded 22–26px + 3px white outline) → matches the PC card. Added
    `margin-top:12px` so book 2 doesn't butt against the week-2 row. Weekday buttons are now
    **square** (`aspect-ratio:1/1`, `min-height:0`); week-label `min-height:0` stretches to match.

- **Responsive pass — round 3 (`2026-06-11`, spacing/aspect polish; uncommitted):**
  - **Level cards wider:** the level section still used the 80% content width (narrow, tall cards).
    Forced `.level-section .section-inner{width:100%}` + `.level-grid{gap:14px}` on mobile and
    trimmed the card (`min-height:146`, rows `24px 1fr 36px`) → near-square 2×2.
  - **Content week-row spacing:** the mobile lesson grid went from uniform `gap:6px` to
    **`column-gap:6px; row-gap:14px`** so week 1 / week 2 (and 3 / 4) rows breathe; bumped the book
    cover `margin-top` 12→16 so book 2 clears the week-2 row above it.

- **Responsive pass — round 4 (`2026-06-11`, after user landscape-phone re-test 658×320; uncommitted):**
  - **Compact mobile header.** The `≤767px` topbar was ~135px tall: the base `.topbar{gap:16px}`
    added ~32px of row-gaps between the three wrapped rows (brand / empty `.topbar-actions` / nav).
    Set mobile **`.topbar{gap:2px; min-height:0; padding:8px 24px}`**, shrank the logo
    (`.brand-name` → `clamp(18px,4.6vw,22px)`), tightened the brand→nav gap (`.top-nav{margin-top:0}`),
    and shrank the nav icons (`.top-nav-link` 50→46/min-h 56→48, `.nav-book` 50×36→46×33,
    number 20→18). Now ~105px. (Touch target eased 56→48 on mobile to hit the height the user asked
    for — a small, deliberate compromise.)
  - **Landscape content board ballooned** (width 658 hits the `≤767px` mobile board, whose
    `aspect-ratio:1` day buttons fill 5 stretched 1fr columns → ~150px squares with tiny text).
    Fixed by **capping + centering the board** (`#contentScreen .lesson-grid{max-width:430px;
margin-inline:auto}`) so buttons stay phone-sized (~68px) on wide screens; portrait (<430px)
    just shrinks to fit, unchanged. Widened the week column (`clamp(46px,13vw,60px)`) and enlarged
    the day text (`clamp(13px,3.8vw,19px)`) + week label (`clamp(10px,2.4vw,13px)`) so text scales
    with the button. NB: large-phone landscapes ≥768px (e.g. iPhone 844) use the _tablet_ board
    (768–1249 block), not this one.

- **Responsive pass — round 5 (`2026-06-11`, logo size + week label + landscape header; uncommitted):**
  - **Logo halved on mobile.** ⚠ The wordmark letters are **`.brand-accent` + `.brand-adventures`**
    spans (fixed `33px`), NOT `.brand-name` (which is just the flex wrapper) — shrinking `.brand-name`
    did nothing. Overrode the two spans to `clamp(14px,4.2vw,17px)` in the `≤767px` block (scoped to
    mobile, so desktop/tablet stay 33px). Header followed: ~106→~85px portrait.
  - **Week label = number only on mobile.** `renderLessons` now emits
    `<span class="wk-text"><span class="wk-num">N</span> <span class="wk-word">week</span></span>`;
    mobile hides `.wk-word` (just "N"), desktop shows "N week". ⚠ The number/word MUST be wrapped in
    one inline `.wk-text` span — `.week-label` is `display:grid; place-items:center`, so two _top-level_
    children become separate grid rows and the label stacked "N" over "week" on desktop. Narrowed the
    mobile week column (`clamp(24px,6.5vw,34px)`) → bigger day buttons; week-number font bumped.
  - **Landscape phone header = one row.** New `@media (max-width:767px) and (orientation:landscape)`:
    `.topbar{flex-wrap:nowrap}` with logo left + level nav right (`.top-nav{order:2;justify-content:
flex-end}`), small logo + nav icons → ~55px (was a stacked ~105px). Large-phone landscapes ≥768px
    already get the horizontal tablet header.

- **Responsive pass — round 6 (`2026-06-11`, song buttons + iPad level cards + landscape months;
  uncommitted):**
  - **Portrait song buttons stacked.** New `@media (max-width:767px) and (orientation:portrait)`:
    `#contentScreen .content-toolbar{flex-direction:column}` → Opening Song on top, Ending Song
    below, each wider (`width:100%; max-width:340px; min-height:64px; font-size:18px`).
  - **Removed a dead duplicate** `#contentScreen .content-type` (leftover) that had been re-shrinking
    the song buttons to `10px/18px` — that was why the landscape song text looked tiny.
  - **Landscape song/day text bumped** (in the landscape block): `.content-type` 16px / icon 26px,
    `.lesson-button strong` 21px, `.week-label` 19px so text reads in proportion to the buttons.
  - **iPad (1024 landscape) level cards → 1:1.** `@media (min-width:900px) and (max-width:1180px)`:
    level section goes **full width** (was 80%, which made the 4 cards narrow), `.level-grid{align-items:start}`
    (⚠ without this the default row **stretch** overrides `aspect-ratio`), `.level-button{min-height:0;
aspect-ratio:1/1}` → ~206px squares at 1024. Lower bound 900px (below that 4 columns get too
    narrow and "Level N" crowds); desktop ≥1181 untouched.
  - **Landscape month buttons ~60%** (in the landscape block): `.month-button{width:60%}`, strong
    40→24. ⚠ Height floor is set by the higher-specificity `#monthScreen[class*="level-theme-"]
.month-button{min-height:137px}`, so the shrink override must reuse that exact selector
    (`min-height:80px`) — a plain `.month-button` rule loses. Now ~179×80 (was ~305×137).

- **Responsive pass — round 7 (`2026-06-11`, gaps + login icon visibility; uncommitted):**
  - **Landscape month gap.** Round 6's `width:60%` inside full 1fr cells left a big gap between the
    two columns. Switched to **`#monthScreen .month-grid{grid-template-columns:repeat(2,180px);
justify-content:center;column-gap:18px}`** + `.month-button{width:100%}` so the two buttons sit
    close together, centered (same ~180px size, much smaller gap).
  - **Portrait song buttons −20% width.** Portrait `#contentScreen .content-type` max-width 340→272
    (text unchanged at 18px).
  - **Login icon shown when signed in (bug).** `.login-button` had no signed-in hide logic, so Admin +
    Log out + Login all showed at once. Added global **`body.is-admin .login-button{display:none}`**
    (hides on desktop/tablet/mobile when signed in).
  - **Login icon on mobile.** The `≤767px` block had `.login-button{display:none}` (no login on
    phones). Now shown (`display:inline-grid; 40×40`); **portrait** pins it top-right of the header
    (`position:absolute;top:8px;right:14px`) beside the centered logo, **landscape** keeps it hidden
    (single-row header already tight with logo + 5 nav icons). Mobile logo +20%
    (`.brand-accent/.brand-adventures` clamp(14,4.2vw,17) → clamp(17,5vw,20)).

- **Responsive pass — round 8 (`2026-06-11`, mobile header refactor + landscape board; uncommitted):**
  Reworked the whole mobile header for both orientations and both signed-in states.
  - **Logo now LEFT-aligned on mobile** (base `≤767px`: `.brand{width:auto;justify-content:flex-start}`,
    `.brand-name` left) instead of centered.
  - **Admin / Log out are circular icon buttons on mobile.** Added `<svg class="action-icon">` (user /
    log-out glyphs) + `<span class="action-label">` to both buttons in `index.html`. Desktop hides the
    icon and shows the text pill (unchanged); mobile hides the label and makes them 34px circles
    (`border-radius:50%`). The login icon is also 34px, sized ~to the logo height (was 40px, "too big").
  - **Portrait header**: row 1 = logo (left) + actions (right, `.topbar-actions{order:1;margin-left:auto}`);
    the level nav drops to its own centered row below. Removed the old absolute-positioned login icon.
  - **Landscape header**: single row = logo (left) · nav (center, `.top-nav{order:1;flex:1;
justify-content:center}`) · actions (right, `order:2`). The login icon now SHOWS in landscape
    (the round-7 `display:none` was removed). Signed in → Admin/Log out circles replace it.
  - **#5 Landscape content board = book covers on the RIGHT.** Landscape uncaps the board
    (`max-width:none`) and switches to a PC-style 7-col grid `[week] repeat(5,1fr) [cover]`; the cover
    is `grid-column:7; grid-row:span 2` (spans its two week rows, like PC but right-side instead of
    left). Portrait keeps the capped, cover-stacked-on-top layout. ⚠ The book card's base mobile
    `aspect-ratio:150/202` + `width:min(150px,46%)` must be reset (`aspect-ratio:auto; width:100%`) in
    landscape so it fills the cover column × 2-row height.

- **Responsive pass — round 9 (`2026-06-11`, icon polish + landscape board = exactly PC; uncommitted):**
  - **Admin / Log out → plain line icons, no circle.** Admin SVG swapped to a **key** glyph; Log out
    keeps the standard door+arrow. Mobile drops the circular background. ⚠ The base `.admin-nav-button`
    pill styles (background/border-radius) are declared **later** in the file at equal specificity, so
    the mobile override had to be raised to **`.topbar-actions .admin-nav-button`** (0,2,0) to win.
  - **Landscape board now EXACTLY like PC** (round 8 had the cover on the right; user wanted PC = cover
    on the LEFT): grid is `[cover] [week] repeat(5,1fr)`, cover `grid-column:auto; grid-row:span 2`
    (auto-placed in column 1 like PC).
  - **Portrait song buttons → ~60% width** (max-width 272→164); label 18→15px, icon 28→22px so the
    text stays inside the narrower button.

- **Responsive pass — round 10 (`2026-06-11`, icon size + square month buttons; uncommitted):**
  - **Log out / Admin icons matched in size.** Both `.action-icon` boxes were already 24px, but the
    (horizontal) key glyph filled less of its box than the log-out glyph, so log-out looked bigger.
    Redrew the Admin key as a **vertical key** (head + stem + teeth) that fills the box to the same
    height as log-out → equal visual size.
  - **Portrait month buttons → 1:1.** Added (portrait) `#monthScreen[class*="level-theme-"]
.month-button{min-height:0; aspect-ratio:1/1}` — keeps the column width, drops the 137px height
    floor so height = width. Now 129² at 320, 164² at 390. (Landscape month buttons keep their own
    180×80 rule.)

- **Responsive pass — round 11 (`2026-06-11`, slightly bigger portrait logo; uncommitted):**
  Portrait header row 1 height is set by the 34px action icons; the logo (brand) was only ~19–22px
  tall, so there was headroom. Bumped the portrait `.brand-accent/.brand-adventures` to
  `clamp(22px,6.5vw,26px)` (brand now ~25–28px, still < 34px) → bigger logo with **no change to the
  101px header height or the right-side icons**. Scoped to portrait (landscape logo untouched).

- **Tablet (pad) pass — round 12 (`2026-06-11`, iPad / Galaxy Tab month + content; uncommitted):**
  Scope = `@media (min-width:768px) and (max-width:1180px)` (covers iPad 1024, iPad Air 1180,
  Galaxy Tab S4 1138, iPad/Air portrait, iPad Pro 12.9 **portrait** 1024). iPad Pro 12.9 **landscape**
  (1366) is >1180 → uses the desktop layout and already fits (per user), so its month buttons stay
  164×137 (not square) — the one acknowledged exception to "1:1 on all pads".
  - **#1/#2 Month buttons square + scaled.** Were a fixed 137px tall with wildly varying widths
    (78px iPad-portrait → 164px) so the month name overflowed and number/box ratios were random. Now:
    `#monthScreen .section-inner{width:100%}`, `.month-grid{align-items:start}`,
    `#monthScreen[class*="level-theme-"] .month-button{min-height:0; aspect-ratio:1/1}` → square
    (105²–172²). Number + (absolutely-positioned) label scale with viewport: `.month-button strong
{font-size:clamp(40px,7vw,92px)}`, label `span{top/left/font-size:clamp(...)}` so the ratio is
    consistent across sizes.
  - **#3/#4 Landscape tablets fit (no vertical scroll).** New `…and (orientation:landscape)` block
    trims the desktop's heavy vertical chrome so the month page fits header→footer and ALL four week
    rows of the content board clear the fold (Galaxy Tab S4 712-tall was cutting week 4):
    footer padding 44→16; `#contentScreen .section-inner` top/bottom 84/96→16/18; the content banner
    goes **horizontal** (`grid-auto-flow:column`, ~137→~60px); banner/header/toolbar margins trimmed;
    and the row-height drivers shrunk — `.lesson-button{min-height:64}` AND
    `#contentScreen .week-label{min-height:64}` (⚠ the **week-label's** 86px min-height was the real
    row-height driver via the book cover's 2-row span, not the day button). Result: iPad-land 768/768,
    Tab S4 712/712, content board lastDay@614 — all fit with no scroll. (Portrait tablets keep the
    taller layout — they have the vertical room.)

- **Mobile-portrait session — round 13 (`2026-06-12`, header icons + Back/Next + video volume; uncommitted):**
  - **Header Admin/Log out icons smaller + matched.** Mobile `.action-icon` 24→**21px** (= login icon);
    the log-out glyph (door+arrow) fills its viewBox more than the narrow key, so it's trimmed to
    **18px** to read the same size as the Admin **key** icon. (`@media ≤767px` block.)
  - **Month-detail Back/Next ~80%.** Portrait `#contentScreen .content-nav-prev/.content-nav-next`:
    50px/15px → **40px/12px** (padding 0 14, bevel 3px). Scoped to portrait only.
  - **Video player volume = tap-to-reveal VERTICAL popover (mobile portrait, windowed + fullscreen).**
    Replaced the earlier always-visible bottom bar (it bloated the toolbar) and fixed "no volume in
    fullscreen". Tapping the speaker (`#vpMute`) toggles `.vp-volume-open` on `.vp-volume` → a 14×120
    vertical slider floats above the speaker (`bottom:calc(100% + 12px)`, `z-index:7` above the FS
    scrim). Drag/keyboard adjust; **mute by dragging to 0**; **3s inactivity auto-close** + **outside-tap
    close** (capture-phase `document` pointerdown). In FS, opening pins `vp-controls-visible` and
    cancels the 2.5s hide timer so the popover isn't hidden with the chrome; closing resumes auto-hide.
    Control buttons shrunk to ~80% (`.vp-btn` 40px, `.vp-toggle` 46px). Desktop/tablet keep the
    horizontal hover popover unchanged. ⚠ See `NOTES.md` for the `--vol` var + matchMedia-sync +
    focus-within-neutralise gotchas. ⚠ iOS may ignore programmatic `setVolume` (hardware-only) — UI
    shows but audio may not change on some real devices; verify on device.

- **Tablet-portrait fix — round 14 (`2026-06-12`, Galaxy Tab month buttons; uncommitted):**
  Galaxy Tab S4 **portrait (712px)** month buttons ballooned to ~330px 2-col squares. Root cause:
  712 < 768 so it misses the tablet block (`min-width:768`) and falls into the **phone 2-col path**
  (`.month-grid repeat(2)` + the `(max-width:767px) portrait` `aspect-ratio:1/1`). Fixed with a new
  **`@media (min-width:600px) and (max-width:767px) and (orientation:portrait)`** block that pulls the
  iPad tablet layout down: `#monthScreen .month-grid{grid-template-columns:repeat(5,1fr); align-items:start}`
  - the same number/label vw-clamps as the tablet block (2528·2532). Now 5×2 compact squares (~123px @712),
    matching iPad. Phones (<600 portrait) keep 2-col; iPad(768)/landscape unchanged. Verified Playwright:
    712→5col square, 768→5col (regress), 390→2col (regress), 1138-landscape→unchanged. ⚠ The 600–767 portrait
    gap may also affect level/content screens — only the **month screen** was fixed (user-scoped).

- **Tablet-landscape month — round 15 (`2026-06-12`, button-size parity + footer white gap; uncommitted):**
  iPad/Galaxy Tab **landscape** month page had (1) device-varying button sizes (1fr of `--content-width`
  min(80%) → iPad 1024=151px vs Tab 1138=172px) and (2) a **white band between the tinted section and the
  footer** on iPad (~49px). Root cause of the gap: `#monthScreen.screen-active{min-height:calc(100vh - 185px)}`
  uses the old header+footer magic number, but the round-12 landscape block trims the footer (→~50px); real
  header(86)+footer(50)=**136**, so 185 over-subtracts ~49px → white `<main>` bg shows. Fixed **in the
  landscape tablet block** (`(min-width:768px) and (max-width:1180px) and (orientation:landscape)`):
  `screen-active{min-height:calc(100vh - 136px); display:flex}` + `.section-box.section-white{flex:1;
display:flex; flex-direction:column; justify-content:center}` (tint fills to footer, buttons vertically
  centered) and `#monthScreen .month-grid{max-width:800px; margin-inline:auto}` (5 cols → ~135px squares,
  **identical on both devices**). Verified: iPad-LS & Tab-LS both 135×135 + gap 0; iPad-portrait/desktop
  unchanged. ⚠ 136 depends on this block's footer/header heights — recompute if they change (see NOTES).

- **Tablet-landscape month — round 16 (`2026-06-12`, label/number overlap; uncommitted):** round-15's grid
  cap fixed the button at ~135px but left the number font at `clamp(40px,7vw,92px)` and the label at
  `1.6vw` (viewport-relative) → at 1138px the number swelled to ~80px and overlapped the top-left month
  label (Galaxy Tab landscape). Since the capped button no longer tracks the viewport, switched the fonts to
  constants **in the same landscape block**: `.month-button strong{font-size:52px}` + the label `span`
  `{top:16px; left:16px; font-size:14px}`. Verified worst overlap −6px (clear) on iPad-LS & Tab-LS, identical;
  portrait/desktop untouched. ⚠ The cap↔vw-font decoupling is the lesson (see NOTES).

- **Tablet-landscape CONTENT page — round 17 (`2026-06-12`, footer white gap + banner one-line; uncommitted):**
  Landscape tablet `#content/...` had (1) a white band between the tint and footer (Tab 1138=20px, iPad
  1024=49px) and (2) the level banner crammed onto one line (`Level 1 · band · ③`) by round-12's
  `grid-auto-flow:column`. Both fixed **in the landscape tablet block** (`768–1180 landscape`):
  (1) `#contentScreen.screen-active{min-height:calc(100vh - 136px)}` (same 185→136 magic-number fix as the
  month page — header86+trimmed-footer50; the `.section-blue` tint then fills to the footer). (2) Banner →
  **2 rows**: `content-level-banner{grid-auto-flow:row; grid-template-columns:auto auto}` with `#contentLevelName`
  at (r1,c1), `.content-banner-month` at (r1,c2), `#contentLevelBand` spanning (r2, 1/-1) → "Level 1" + ③
  circle on top, band below. Circle shrunk 60→**46px** (number 36→28) to keep the 4-week board inside the fold
  on the short Galaxy Tab (712). Verified: gap 0 + 2-row banner + no vertical scroll on Tab-LS & iPad-LS;
  **iPad Pro 1366 (PC, >1180), phone, desktop ALL unchanged** (circle 60, stacked banner).

- **Session `2026-06-21` — branding, layout polish, hero animation, cleanup (all committed/pushed):**
  Naming convention used with client (빅웨이브/BigWave): **메인**=`#homeScreen`, **페이지1**=`#monthScreen`
  (월 선택), **페이지2**=`#contentScreen` (월 상세); **월그리드**=`#monthGrid`, **요일그리드**=페이지2 Mon–Fri
  board; 영역 = 헤더 / body / 풋터.
  - **Header/branding:** logo wordmark → **"Cambridge Reading"**; level nav hidden on 메인 only
    (`body:not(.subpage-active) .top-nav{display:none}`).
  - **메인페이지:** removed _Program Introduction_ + _Key Features_ sections; _Start Reading_ removed its
    title/eyebrow/desc (kept the 4 level buttons); level buttons stripped of pill-kicker + book-band text,
    set to **6:4** ratio, label dead-centered; hero height −30% (`--hero-height` 620→434) and the white
    wave follows; footer on 메인 → **white bg + dark-gray (`--ink`) text**.
  - **No-scroll layouts:** 메인 uses `body:not(.subpage-active) main{display:flex;column}` + `#homeScreen`
    flex:1 + level-section centers buttons (works mobile too — vertical-centering fix); tablet-landscape +
    PC: level buttons scale to fit at 6:4, **PC (≥1181px) keeps side margins**, tablet uses full width.
  - **페이지1:** level marking unified with 페이지2's `#contentLevelName` (Sniglet 40, theme-shadow) and
    centered; removed "Choose a Month" + strand text; **월그리드 numbers gained a "월" suffix** (Nanum Gothic
    Coding 700, baseline-aligned via inline-flex flex-end + per-digit `translateY`); tablet month buttons
    match **PC proportion** (fixed 137px height + full width; removed the `max-width:800px` cap).
  - **페이지2:** removed `#contentLevelBand` book-band text (all levels); added **Word Game** (🧩) +
    **Sentence Game** (🎯, U+1F3AF) buttons after Ending Song; tablet toolbar buttons scaled to ~PC
    proportion (`clamp(12px,1.2vw,14px)`, radius/bevel scaled to avoid distorted shadow); **toolbar aligned
    to the Mon–Fri columns** (left pad 272 tablet / 342 PC, right inset 30/50, `space-between`) + ~16px gap
    above the board (Galaxy-Tab-safe, no scroll). ⚠ PC content page already scrolls at ≤1080px height.
  - **Level-page footer:** `body[class*="level-theme-"] .site-footer` → \*\*body tint bg (`--level-accent-soft`)
    - theme-shadow text\*\* (was saturated accent + white), so body feels less cramped.
  - **Hero character animation (cutout rig):** client supplied **layered transparent PNGs same-canvas**
    (`assets/hero-rig-base/f-arm/d-arm/f-head/d-head.png`; base has connection areas **extended** so rotation
    reveals real body, not a gap). `.hero-rig` carries float+sizing; each part rotates around its joint
    (`transform-origin` %); arm wave ±9°/±6°, head sway ±3°; **speed ×1.5** (arm 1.73s, heads 2.0–2.27s,
    float 4.33s). **Exempt from `prefers-reduced-motion`** (client wants it always on — their OS has reduce
    motion ON). Old flat `hero-builder-characters_02.PNG` no longer referenced (kept on disk).
  - **Hero title:** word-by-word reveal — words wrapped in `.hero-word`, staggered (~0.17s) pop-up; also
    exempt from reduce-motion.
  - **Reusable skills added** (`.claude/skills/`): `cutout-rig-animation` (+`scripts/rig-helper.py`) and
    `word-reveal-animation` — for repeating these on other pages.
  - **Code review + cleanup** (objective subagent + independent verify): removed ~188 lines of dead CSS
    (intro/feature/library/`.level-kicker`/`#monthTitle`/`.month-strand` etc. — matched no element);
    merged the 2 Google-Fonts `<link>`s into 1 (**FOUT mitigation** — the flash is normal `display=swap`
    async swap, NOT leftover code; full removal needs font `preload`/self-host = deferred); `app.js`
    prettier; **smoke tests updated to current UI → 9/9 pass**, `npm run check` green. **V2/V3 calendar
    screens kept** (smoke tests assert they "remain available"). **18 orphaned asset images kept** per
    client (design reference).
  - **Infra note:** worked via gh account **`bigwavecto`**, added as a **collaborator** (write) on
    `crspiegel/new-app_0607`; pushes work from this account now. (Repo/Vercel owner is still `crspiegel`.)
  - Commits today: `e015e8b` (UI), `0816144` (hero rig), `4b8fdb6` (word reveal), `d78f5b0` (skills),
    `0044b01` (cleanup).
  - **Deferred / open:** full FOUT removal (font preload/self-host); whether to delete the 18 orphaned
    assets later.

- **Session `2026-06-28` — Level 1 페이지2 요일그리드 단일 표지 (uncommitted):** client wants **Level 1
  only** to show **one** cover in the 요일그리드 instead of two, keeping the cover's **current size/aspect**
  and centering it vertically across the 1–4 week span; Levels 2–4 keep both covers. Plan file:
  `C:\Users\USER\.claude\plans\zippy-discovering-allen.md`.
  - **Public 페이지2 (CSS only, `styles.css`):** `#contentScreen.level-theme-1 .book-title-card.book-2
{display:none}` (all breakpoints) + inside `@media (min-width:768px)`: `.book-1{grid-column:1;
grid-row:1/span 4; align-self:center; aspect-ratio:150/202; min-height:0}` — book-1 reserves the whole
    left column so the 24 weekday cells auto-flow unchanged, while the cover stays current-size and centered.
    **No column-width change** → tablet/mobile no-scroll layouts untouched. Mobile (`max-width:767`) keeps the
    existing full-width banner; the `min-width:768` rule and the `max-width:767` block meet with no gap.
  - **ADMIN (`app.js` `renderAdminBoard` + `styles.css`):** Level 1 now renders a **single** `.admin-book
.admin-book--single` block = one cover (`book-1`) + **weeks 1–4** (slot keys `w1..w4` are independent of
    the cover, so all 4 weeks of video editors remain); other levels keep the 2-block loop. CSS
    `.admin-book--single .admin-cover{align-self:center}`.
  - Pre-existing **test cover images ignored** per client (will be re-uploaded; orphaned `book-2` data is fine).
  - `npm.cmd run qa` green (lint + prettier + 9/9 Playwright). **Committed** `ff4660e`.

- **Session `2026-06-28b` — admin polish + player (Vimeo→Vimeo/YouTube), sample fallback removed:**
  - **Admin typography:** unified the whole admin body to Google Sans via `#adminScreen, #adminScreen *
{font-family:var(--font-google-sans)}` (id+universal outranks the per-element Sniglet/Nunito/Inter; no
    `!important`). Header admin buttons + slot modal left as-is.
  - **Admin board width / no h-scroll:** the weekday board overflowed because `.admin-week-row`'s `1fr`
    (=`minmax(auto,1fr)`) couldn't shrink below the `.admin-slot-url` nowrap min-content. Fixed with
    `minmax(0,1fr)` on `.admin-book` + `.admin-week-row` (base **and** the `max-width:760px` block) +
    `min-width:0` on `.admin-slot`/`.admin-weeks`. Also widened admin body to use the viewport:
    `#adminScreen .admin-inner{width:100%; max-width:var(--site-max-width); margin-inline:auto;
padding-inline:max(50px,4vw)}` (≥50px gutters, 1600 cap).
  - **Admin sections split into tabs:** top-center **plain-text menu** (`.admin-menu`/`.admin-menu-btn`,
    underline-on-active — deliberately not pill buttons, to read differently from the kid-facing header nav)
    toggles `#adminViewContent` (level/month + board) vs `#adminViewMembers` (member mgmt). JS
    `setAdminView(view)` flips `[hidden]` + active class + `#adminTitle`; `openAdmin()` defaults to content.
    `.admin-view[hidden]{display:none}` guard needed because `.admin-view` sets `display:flex`.
  - **Video player now Vimeo OR YouTube.** Refactored the Vimeo-only player to a uniform `activePlayer`
    interface (play/pause/setCurrentTime/setVolume/setLoop/destroy). `parseVideoSource()` detects
    youtube.com/youtu.be/embed/shorts/live → `mountYouTube` (IFrame API, lazy-loaded; custom controls drive
    it; **250ms poll** for progress since YT has no timeupdate; loop handled on ENDED); else `mountVimeo`
    (unchanged behavior). `#vpClickLayer` over the iframe keeps native chrome inert. Admin URL field label →
    "Vimeo or YouTube".
  - **Sample-video fallback REMOVED.** `parseVideoSource` returns null for empty; `openSlot` shows a new
    **"Coming soon!"** popup (`#comingSoonModal`, reuses no-access shell, English copy) instead of playing
    `SAMPLE_VIMEO_ID` (constant deleted).
  - **DB:** client cleared all stored video URLs via Supabase SQL `update content_pages set videos='{}'::jsonb`
    (covers preserved). Content lives in `content_pages` (videos/covers jsonb), read by anon key, written by
    admin (RLS). Supabase config in `supabase-config.js`.
  - `npm.cmd run qa` green (9/9). Client verified Vimeo+YouTube playback + empty-slot popup before commit.

- **Session `2026-06-28c` — admin member editor (grade + password):** added a per-member **Edit** button in the
  Members tab → opens a modal (mirrors the slot-editor modal) to change a member's **grade (permission)** and
  optionally **reset the password** (blank = keep current). Backed by a new Supabase RPC
  **`update_member(p_id, p_grade, p_password default null)`** added to `supabase/migration.sql` (SECURITY
  DEFINER, `is_admin()` gate, bcrypt `crypt(pw, gen_salt('bf'))` — same as `create_member`; revoked from anon).
  **Client ran the SQL in Supabase** and verified grade-only + password-change edits before commit. The id and
  active flag are not editable here (active = the existing Activate/Deactivate toggle via `set_member_active`).
  JS: `openMemberEditor`/`commitMemberEdit` call `update_member`; new `.admin-member-actions` wraps Edit +
  toggle. `npm.cmd run qa` green (9/9).

- **Session `2026-06-28d` — admin Korean localization + refresh fix:**
  - **Admin UI → Korean.** Translated the admin-only chrome (menu/title, hints, member form labels +
    placeholders, buttons, status/toast messages, cover-card labels, both modals — slot editor + member editor)
    to Korean. **Kept English on purpose:** content-slot names that mirror the kid-facing page (Opening Song /
    `Week 1 · Mon · Story`), data values (Level 1 / March / Mon–Fri), the user-facing login page, and the header
    Admin / Log out buttons (shared chrome next to the user-facing Login). Added **Noto Sans KR** to the font
    import and a new `--font-admin` (Latin → Google Sans, Korean → Noto Sans KR) applied to `#adminScreen` +
    both admin modals (which live outside `#adminScreen`).
  - **Member list slow-to-appear on refresh — FIXED.** Root cause: the bootstrap IIFE's `#admin` deep-link path
    rendered only `renderAdminBoard()` and **omitted `renderMembers()`** (unlike `openAdmin()`); with no
    hashchange router, the list stayed blank until `openAdmin()` re-ran (e.g. re-clicking Admin). Fix: the
    refresh `#admin` path now calls **`openAdmin()`** (full init incl. member list + default tab; bounces
    non-admins to login). DB/RLS/auth were never the problem.
  - `npm.cmd run qa` green (9/9). Client verified refresh now shows members immediately. Open: whether to also
    localize the header Admin / Log out buttons (deferred).

- **Session `2026-06-28e` — favicon (logo letter "C"):** added a brand favicon = the logo's first letter **C**
  (the "Cambridge" wordmark colour, teal `#16b8ad`) — a rounded-square teal tile with a chunky rounded white
  **C** drawn as a stroked arc (font-independent so it renders anywhere). Files at repo root: **`favicon.svg`**
  (primary, scalable), **`favicon-32.png`** (legacy), **`apple-touch-icon.png`** (180, full-square for iOS).
  `scripts/make-favicon.mjs` rasterizes the PNGs from the SVG via headless Chromium (no image libs). Linked in
  `index.html` <head> (icon svg + png + apple-touch-icon). `npm.cmd run qa` green (9/9).

## Platform build — approved 3-phase plan (`2026-06-10`)

Plan file: `C:\Users\dupy2\.claude\plans\steady-roaming-yao.md`. Adds the video
player to **all levels/months**, an **admin content manager**, and **login + 3
permission grades**. **Backend = Supabase** (Auth + Postgres + Storage) added to
the **current static SPA via the CDN UMD build** (`window.supabase`) — NO Next.js
rewrite, NO build step. Reads public (anon key), **writes admin-only via RLS**.
Delivery is **phased**; content access gate is **UI-level** (grade 3 → cute popup).

- **Phase 1 — DONE (`2026-06-10`):** player rolled out to all 40 pages; no Supabase yet.
  - `app.js` `contentData` map + `getVideoUrl/getCover(level, month, slot|book)` — the
    single data source; Phase 2 swaps the backing store to Supabase with no caller change.
    Seeded only with L1/March covers; everything else falls back to the sample video.
  - **Slot keys** (22/page): toolbar `data-slot="opening"/"ending"`; weekday buttons
    `data-slot="w{1..4}-{Mon..Fri}"` set in `renderLessons`.
  - `isLevel1March()` gate **removed**. New `openSlot(slot, label)` → grade-3 check →
    `getVideoUrl` → `openVideoPlayer(label, source)`. `openVideoPlayer` now takes a source
    (`resolveVimeoSource`: numeric id / id-string / Vimeo URL, else sample fallback).
  - **Covers are data-driven now:** the 3 hard-coded `#contentScreen.level-theme-1[data-month="March"]`
    CSS rules were replaced by a generic `.book-title-card.has-cover` rule; `refreshCovers()`
    (called in `updateContentMonthNumber`) sets/clears `has-cover` + inline `background-image`
    from `getCover` per current level/month. L1/March visuals unchanged.
  - **`#noAccessModal`** popup (markup + styles + `showNoAccessPopup`/`hideNoAccessPopup`,
    Esc/overlay/OK close) built and wired — **dormant until Phase 3** sets `state.grade`.
  - Verified: player opens on L2/May & L3/September (rollout); L1/March covers intact; other
    pages keep empty placeholder; month-nav clears covers; `npm.cmd run qa` green. ⚠ Vimeo
    playback still un-testable headless (modal visibility is set before the SDK call, so the
    open/close is verifiable; playback is not).
- **Phase 2 — DONE (`2026-06-10`):** Supabase wired into the static SPA; admin content manager live.
  - **Provisioned (user, project `jguuexcgyvyljbcqfpib`):** ran `supabase/migration.sql`
    (tables `content_pages`/`members`/`admins`/`site_settings`, `is_admin()`, RLS, pgcrypto RPCs),
    created public `covers` bucket, created first admin (Auth user + `admins` row). Keys live in
    **`supabase-config.js`** (`window.SUPABASE_URL` + anon key; ships — NOT in `.vercelignore`).
    `SUPABASE_SETUP.md` + `supabase/` are git-tracked but `.vercelignore`'d.
  - **Client:** `<script @supabase/supabase-js@2>` (CDN UMD, `window.supabase`) + `supabase-config.js`
    load before `app.js`. `const sb = window.supabase.createClient(...)` (null-guarded).
  - **Data source swap:** `contentCache` (keyed `level||month`) hydrated on load via
    `sb.from('content_pages').select('*')`; `getVideoUrl/getCover` read cache → fall back to the
    local seed. `refreshCovers()` re-runs after hydrate if a content page is showing.
  - **Admin auth (Phase 2 = admin only):** login form (`#loginForm`) → `sb.auth.signInWithPassword`
    ({email: idField}) → `sb.rpc('is_admin')`; admin session reveals header **Admin** + **Log out**
    buttons (`body.is-admin`). `#admin` route guarded (non-admins bounce to login). Member-grade
    login is **Phase 3**.
  - **Gray mirror editor** (`#adminScreen`, built by `renderAdminBoard`): level/month `<select>`s;
    songs row + 2 books × (cover card + 2 weeks × 5 day slots). Slot button → `#adminSlotModal`
    (prefilled current URL) → `savePage` upserts whole `content_pages` row (videos+covers together).
    Cover card = drag-drop/click → `sb.storage.from('covers').upload(path,{upsert})` →
    `getPublicUrl` + `?t=Date.now()` cache-bust → stored in `covers[book]`. `slugify(level)/slugify(month)/book-N`.
  - Verified headless: Supabase lib+config load, anon hydrate, admin UI hidden when logged out,
    `#admin`→login bounce, bad login reaches Supabase Auth and shows error; `npm.cmd run qa` green.
    ⚠ Real admin login + URL edit + cover upload + cross-device reflection need the admin's
    credentials → **manual test** (can't run headless).
- **Phase 3 — FRONTEND DONE (`2026-06-12`, uncommitted; backend RPCs already existed):** login + 3
  grades wired. **No SQL changes** — `migration.sql` already had every Phase-3 RPC (`verify_member_login`,
  `create_member`, `set_member_active`, `site_settings`). All work was `app.js`/`index.html`/`styles.css`.
  - **Login branch** (`#loginForm`): `id.includes("@")` → admin Supabase Auth (existing); else →
    `sb.rpc("verify_member_login",{p_id,p_password})` → grade or null. ⚠ A member id containing `@`
    would misroute to admin Auth — issue members `@`-free ids.
  - **Member session** = client-side: `state.grade` + `localStorage.cra_member` (helpers
    `saveMemberSession`/`clearMemberSession`/`restoreMemberSession`). UI-level gate only (spoofable;
    write-protection is the real security via RLS). Restored on load (admin session supersedes).
  - **Grade gate**: `openSlot`→`isBlockedByGrade()` (`state.grade===3`) already existed; now fed real
    grade → grade-3 click shows `#noAccessModal`; grade1/2/admin/anon play.
  - **Signed-in UI**: `updateAdminUI` toggles `body.is-admin` (admin) + **`body.signed-in`** (admin OR
    member); Log out shows when signed-in, Admin only for admin, Login hidden when signed-in
    (CSS `body.signed-in .login-button{display:none}`). Logout clears both admin + member session.
  - **Admin member panel** (`#adminScreen` → `.admin-members`): create form (id/pw/grade/name →
    `create_member`), list (`from("members").select(...)`), Activate/Deactivate (`set_member_active`).
    `renderMembers()` called from `openAdmin()`.
  - **Signup = hidden placeholder** (user-chosen): `#loginSignup` form hidden unless
    `site_settings.signup_visible` true (public read, `refreshSignupUI()` on load); admin checkbox
    `#signupToggle` upserts the flag. **Submit creates NO account** → shows "Please ask your teacher
    to create your account." (accounts stay admin-created).
  - Verified headless: gate (grade3 popup / grade1 play / anon full), login routing (member-rpc vs
    admin-auth), signed-in UI, logout clears session, signup hidden by default + placeholder note,
    member-create admin guard. `npm.cmd run qa` green. ⚠ **Manual test needs real admin creds**: create
    grade1/2/3 members → log in as each (grade3=popup, grade1/2=play); flip the signup toggle.

### ▶ RESUME HERE (`2026-06-12`)

- **All responsive/design work COMMITTED + DEPLOYED** (`a762cc7`, pushed to `master`, Vercel live).
  Rounds 1–17: mobile-portrait (header icons, Back/Next, video vertical-volume popover) + tablet
  portrait (600–767 month 5-col) + tablet landscape (month button parity/overlap/white-gap, content
  white-gap + 2-row banner). Live verified.
- **Phase 1 + Phase 2 — DONE & SIGNED OFF (`2026-06-12`).** User-tested OK: admin login, admin page,
  cover upload+drag-drop reflection, **video URL registration → plays on user page**, **cross-device
  reflection**. ✅ Phase 2 fully closed.
- **Phase 3 (login + 3 grades) — FRONTEND DONE (`2026-06-12`, UNCOMMITTED).** See the Phase 3 bullet
  above for detail. Headless-verified + `npm.cmd run qa` green. **Awaiting:** (1) user manual test with
  real admin creds (create grade1/2/3 members → log in as each; signup toggle), (2) commit/deploy on
  request. No SQL re-run needed (RPCs already provisioned).
- **Then: items 3–4** (backlog/optional polish), **then LAST: font-loading FOUT** improvement
  (memory `deferred-font-fout.md`).
- **Infra reminders:** Supabase project `jguuexcgyvyljbcqfpib`; keys in `supabase-config.js`
  (ships; anon key is public-safe). `SUPABASE_SETUP.md` + `supabase/migration.sql` are the
  provisioning record (`.vercelignore`'d). Live site auto-deploys on push to `master`.

## Confirmed product decisions

- Continue/complete the static SPA (no frontend framework yet).
- Calendar: **Mon-Fri 5-column** only; no weekend columns. (Overrides any Sun-Sat/7-col text.)
- English UI, no italics, child-friendly, touch targets ≥56px.
- Content URLs not ready → use sample Vimeo embeds when wiring modals.
- Default verification: `npm.cmd run qa`. On Windows PowerShell use `npm.cmd`.

## Implementation status

- Main page, Level 1-4 selection, March-December month selection, and hash routing all work
  (`#months/Level%201`, `#content/Level%201/March`, `#login`).
- **Login page** (`#login` / `#loginScreen`) — frontend-only, linked from the header login
  button (see "Design changes done so far"). No backend/auth yet.
- Three content-screen variants exist:
  - **V1 `#content/...`** — default; temporary `Book A/B × 2 weeks × Mon-Fri` board. Design
    changes target this (and shared `.content-v2-*` classes).
  - **V2 `#content-v2/...`** — alternate, preserved (kept on the green styling).
  - **V3 `#content-v3/...`** — Mon-Fri weekday-board candidate; uses `data-content-type`,
    `data-week`, `data-day` for future modal playback.
- **Video modal** is built inline (markup in `index.html` `#videoModal`, logic in `app.js`,
  styles in `styles.css`) and wired on **Level 1 / March only** with one sample Vimeo
  (`210024645`) — see "Design changes done so far". No separate `modal.js` was created.
- Not built yet: `contentData.js`, `calendarData.js`; per-button distinct video URLs; rolling
  the modal out to other levels/months once real content is ready.

## Backlog (feature work, after design)

1. Decide whether V3 (Mon-Fri calendar) should replace the default `#content/...` route.
2. Add `contentData.js` (sample Vimeo embeds), `calendarData.js` (Mon-Fri events), `modal.js`.
3. Wire top content buttons + calendar buttons to sample Vimeo modal playback.
4. Extend Playwright tests for modal open/close behavior.
5. Responsive + accessibility QA pass.

## Open questions

- Delete `contentScreenV2`, or keep it as an archived/reference section?
- One sample Vimeo for all buttons, or different URLs per content type?
- Story: Vimeo only for now, or include an E-book placeholder?
- Levels 2-4 reuse Level 1 sample data until real content is ready?
- Should V3 become the default `#content/...` route after client review?

## Resume checklist

1. Read this file (status + workflow), then `CLAUDE.md` (doc map) and `NOTES.md` (gotchas).
2. Skim `PRODUCT_SPEC.md` + `DESIGN.md` for product/visual constraints relevant to the task.
3. Design phase: make the change locally + verify; commit/deploy only on request.
4. Run `npm.cmd run qa` before committing; `git push` auto-deploys to production.
