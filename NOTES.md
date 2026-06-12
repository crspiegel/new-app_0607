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
  header is ~86px → real total **136**, so the base 185 over-subtracted ~49px → white gap. Fix = override the
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
