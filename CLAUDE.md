# CLAUDE.md — Index

Auto-loaded entry point. **This is a map, not the detail** — follow the pointers below.

Kindergarten English learning **static SPA** (Cambridge Reading Adventures): Vanilla
HTML/CSS/JS + Vite (dev) + Playwright. Core files: `index.html`, `styles.css`, `app.js`.
(Originally built in Codex; harness adapted for Claude Code.)

## Documents — read what the task needs

| Doc                   | Holds                                                                    | Read when                                 |
| --------------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| `PROJECT_MEMORY.md`   | Live status, workflow, infra, backlog, open questions                    | **First, every session** (to resume)      |
| `NOTES.md`            | Engineering gotchas & past mistakes to avoid                             | Before fonts / header / deploy / git work |
| `PRODUCT_SPEC.md`     | Product scope, IA, navigation, main-page content, data model, acceptance | Building features                         |
| `DESIGN.md`           | Visual system (colors, type, components)                                 | Any visual work                           |
| `PLATFORM_ROADMAP.md` | Long-term login/admin/Supabase/app platform                              | Only for the future rebuild               |
| `README.md`           | Short public-facing repo readme                                          | —                                         |

## Must-know (details are in the docs above)

- **Commands:** `npm.cmd run dev` (local) · `npm.cmd run qa` (verify = checks + Playwright).
  On Windows PowerShell use `npm.cmd`. `qa` also runs Prettier over `*.md`.
- **Accounts (outward actions):** GitHub + Vercel are **`crspiegel` / crspiegel@gmail.com**
  (NOT any `wechange2023*`). Live site: https://new-app0607.vercel.app
- **Deploy:** static, **no build** (see `NOTES.md`). Flow = edit → `npm.cmd run qa` → commit →
  `git push` (Vercel auto-deploys). Commit/deploy **only when the user asks**.
- **Core constraints:** Mon-Fri 5-column calendar only; English UI; no italics; child-friendly.
  (Full detail in `PRODUCT_SPEC.md` / `DESIGN.md`.)
- **Verify, don't assume** — especially fonts and layout. See `NOTES.md`.
- After meaningful work, update `PROJECT_MEMORY.md` (status) and `NOTES.md` (any new gotcha).
