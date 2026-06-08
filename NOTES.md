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

## Verification & tooling

- For visual-fidelity work, screenshot via Playwright and compare. `toHaveScreenshot({ animations:
'disabled' })` freezes the hero animation for stable pixel diffs — capture a baseline before,
  compare after.
- Playwright one-off scripts must live in the **project dir** (not `/tmp`) to resolve
  `@playwright/test` from `node_modules`. Import from `@playwright/test` (bare `playwright` isn't
  installed). Remember `b` = browser, `p` = page (`p.screenshot`, not `b.screenshot`).
- Navigating only the URL **hash** on the same Playwright page does NOT re-run `app.js` init
  (theme/state not re-applied). Use a **fresh page per level/route** when measuring.
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
