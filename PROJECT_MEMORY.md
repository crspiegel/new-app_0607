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
- **Phase 3 — TODO:** login wiring (admin = real Auth, members = `verify_member_login` RPC),
  activate grade-3 gate, admin member management, hidden signup (`site_settings.signup_visible`),
  ID/pw rule `/^[\x21-\x7E]{4,}$/` (≥4, ASCII only, no Korean), logout.

### ▶ RESUME HERE (next session — `2026-06-11`)

- **Uncommitted local change (`2026-06-11`):** responsive optimization — **2 rounds** (`styles.css`
  only): round 1 (tablet-landscape + mobile-portrait base fixes) + round 2 (after the user's 320px
  Galaxy S9+ re-test: image-behind-wave z-index, 320px store-button overflow, level 2×2, month
  width/aspect/title, mobile content covers + square day buttons). See the two "Responsive …" bullets
  above. `npm.cmd run qa` green; verified by Playwright clips at 320/390/1024/1280.
  **Awaiting user device re-test, then commit/deploy on request.**
- **Done & committed:** Phase 1 (player on all 40 pages) + Phase 2 (Supabase admin manager).
  Header layout fix applied (`.topbar-actions` wrapper groups Admin/Log out/Login at the right).
- **User-tested OK so far:** admin login, admin page, **cover image upload + drag-drop reflects
  on the user page**. ✅
- **NOT yet user-tested (do first tomorrow):** (1) video **URL registration** via the slot
  modal → plays on the user content page; (2) **cross-device** reflection (phone/other browser).
  If these work, Phase 2 is fully signed off.
- **Then start Phase 3** (login + 3 grades). Note for Phase 3: the login form currently sends the
  `user ID` field as an **email** to Supabase Auth (admin path). Phase 3 must add the member
  branch: if Auth fails, try `sb.rpc('verify_member_login', {p_id, p_password})` → set
  `state.grade` → grade-3 click shows `#noAccessModal` (already built, dormant). Member admin UI +
  signup toggle still to build.
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
