# Kindergarten English Learning SPA

Static SPA prototype for a kindergarten English learning platform (Cambridge Reading
Adventures). Vanilla HTML/CSS/JS served by Vite, with Playwright smoke tests.

## Where to start

- **`CLAUDE.md`** — entry point: document map, commands, key decisions, working protocol.
- **`PROJECT_MEMORY.md`** — current status, backlog, and open questions (read when resuming).
- **`PRODUCT_SPEC.md`** / **`DESIGN.md`** — product/build spec and visual direction.
- **`PLATFORM_ROADMAP.md`** — long-term login/admin/Supabase/app-packaging direction.

## Commands

Run from the project root. On Windows PowerShell, prefer `npm.cmd` if script execution policy
blocks `npm`; on other shells `npm run ...` is fine.

- `npm.cmd run dev` — run the static app with Vite
- `npm.cmd run check` — asset, lint (ESLint), and format (Prettier) checks
- `npm.cmd run test:e2e` — Playwright smoke tests (desktop, tablet, mobile)
- `npm.cmd run qa` — all checks plus browser smoke tests (default verification)

First-time Playwright runs may need `npx playwright install chromium`.
