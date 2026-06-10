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
