# CLAUDE.md

This file is the entry point Claude Code auto-loads for this project. It gives the
short version and points to the detailed working documents. This project was previously
developed in Codex; the harness documents have been adapted for Claude Code.

## Project

A kindergarten English learning web/app (Cambridge Reading Adventures) for classroom use.
The operator is the teacher; the audience is children aged 5-7 watching on a TV, projector,
tablet, or mobile device. The short-term goal is to **complete the current static SPA
prototype** before any later Next.js/Supabase/Capacitor rebuild.

Stack: HTML5 + CSS3 + Vanilla JavaScript, served by Vite, with Playwright smoke tests.
Core files: `index.html`, `styles.css`, `app.js`.

## Documentation Priority

Read these in order. Current user decisions override older document text.

1. `CLAUDE.md` (this file) — auto-loaded entry point and quick orientation
2. `PROJECT_MEMORY.md` — session-resume state, current decisions, next work, open questions
3. `README.md` — commands and verification
4. `AGENT.md` — product scope, information architecture, implementation plan, acceptance criteria
5. `DESIGN.md` — visual direction
6. `PRD_v1.0.md` — original v1.0 reference only
7. `CODEX_BUILD_GUIDE.md` — long-term platform reference (login/admin/Supabase/Vercel/app packaging)

## Commands

Run from the project root. On Windows PowerShell, prefer `npm.cmd` if script execution
policy blocks `npm`; on other shells `npm run ...` is fine.

- `npm.cmd run dev` — run the static app with Vite
- `npm.cmd run check:assets` — verify referenced asset paths match real file names (incl. case)
- `npm.cmd run check` — asset, lint (ESLint), and format (Prettier) checks
- `npm.cmd run test:e2e` — Playwright smoke tests across desktop, tablet, and mobile
- `npm.cmd run qa` — run all checks plus browser smoke tests (default verification)

Note: `format:check` runs Prettier over `*.md`, so any Markdown edit must be Prettier-clean
or `check`/`qa` will fail. Playwright browsers may need `npx playwright install` once.

## Key Decisions & Constraints

- Calendar: **Mon-Fri 5-column** monthly learning calendar only. Older Sun-Sat / 7-column
  references in `PRD_v1.0.md` and elsewhere are overridden.
- User-facing UI is in **English**. No italic text anywhere. Bright, child-friendly colors,
  large readable labels, touch targets >= 56px.
- Content URLs are not finalized; use sample Vimeo embeds for modal/player work.
- Do not introduce a frontend framework or heavy dependencies during the static SPA phase.
- Default verification after meaningful changes: `npm.cmd run qa`.

## Working Protocol (Claude Code)

The older documents describe a "PM sub-agent → Worker Codex" flow. In Claude Code, apply
the equivalent native workflow:

- For any non-trivial change, use **Plan mode** to design and get the user's sign-off before
  editing code.
- For broad exploration or parallelizable work, delegate to **subagents via the Agent tool**.
- After meaningful changes, run `npm.cmd run qa` (unless the plan scopes verification differently).
- Distinguish documentation-only requests from code-implementation requests; do not modify
  `index.html` / `styles.css` / `app.js` during planning-only work.
- Keep `PROJECT_MEMORY.md` updated after meaningful planning, implementation, or verification.

## Current Status (pointer)

`index.html` currently hosts multiple content-screen variants (V1 default Book board,
V2 alternate, V3 Mon-Fri learning-calendar candidate at `#content-v3/...`). Hash routing
works (`#months/Level%201`, `#content/Level%201/March`). Data files
(`contentData.js`, `calendarData.js`, `modal.js`) and the Vimeo modal are not built yet.

For the authoritative, up-to-date status, backlog, and open questions, see
**`PROJECT_MEMORY.md`** — do not duplicate that state here.
