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
- **Headless can't actually play Vimeo:** Playwright synthetic clicks aren't a user-activation
  gesture for media, and even with `--autoplay-policy=no-user-gesture-required` the video stays
  buffering (spinner), so `play` never fires and the toggle won't flip in headless. Verify the
  play↔pause icon swap by setting `#vpToggle[data-playing]` directly and checking the icon
  `display`; trust the SDK events for real-browser playback.
- The modal opens **only** on Level 1 / March — gated at click time by `isLevel1March()`, because
  `#contentScreen` + the 20 `renderLessons()` buttons are shared by all levels/months. When
  testing scope, use a **fresh Playwright page per route** (hash-only navigation doesn't re-run
  `app.js`, so `state.level` leaks and the gate looks broken — see the hash-nav note below).

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
