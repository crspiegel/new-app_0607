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

## Confirmed product decisions

- Continue/complete the static SPA (no frontend framework yet).
- Calendar: **Mon-Fri 5-column** only; no weekend columns. (Overrides any Sun-Sat/7-col text.)
- English UI, no italics, child-friendly, touch targets ≥56px.
- Content URLs not ready → use sample Vimeo embeds when wiring modals.
- Default verification: `npm.cmd run qa`. On Windows PowerShell use `npm.cmd`.

## Implementation status

- Main page, Level 1-4 selection, March-December month selection, and hash routing all work
  (`#months/Level%201`, `#content/Level%201/March`).
- Three content-screen variants exist:
  - **V1 `#content/...`** — default; temporary `Book A/B × 2 weeks × Mon-Fri` board. Design
    changes target this (and shared `.content-v2-*` classes).
  - **V2 `#content-v2/...`** — alternate, preserved (kept on the green styling).
  - **V3 `#content-v3/...`** — Mon-Fri weekday-board candidate; uses `data-content-type`,
    `data-week`, `data-day` for future modal playback.
- Not built yet: `contentData.js`, `calendarData.js`, `modal.js`, the Vimeo/video modal.

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
