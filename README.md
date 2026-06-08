# Kindergarten English Learning SPA

Static SPA prototype for a kindergarten English learning platform.

When resuming a new session, read `PROJECT_MEMORY.md` first.

## Commands

- `npm install`: install local tooling.
- `npm.cmd run dev`: run the static app with Vite.
- `npm.cmd run check:assets`: verify referenced asset paths match the real file names, including case.
- `npm.cmd run check`: run asset, lint, and formatting checks.
- `npm.cmd run test:e2e`: run Playwright smoke tests across desktop, tablet, and mobile projects.
- `npm.cmd run qa`: run all checks and browser smoke tests.

On non-Windows shells, `npm run ...` is also fine. On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

## Current Documentation Priority

For the current static SPA phase, follow documents in this order:

1. `CLAUDE.md` as the Claude Code auto-loaded entry point
2. `PROJECT_MEMORY.md`
3. `README.md`
4. `AGENT.md`
5. `DESIGN.md`
6. `PRD_v1.0.md` as original reference only
7. `CODEX_BUILD_GUIDE.md` as long-term platform reference only

Current user decisions override older documents. The active calendar requirement is `Mon-Fri` 5 columns, not a `Sun-Sat` 7-column calendar.

## Current Build Direction

The short-term target is to finish the current static SPA prototype before a later Next.js, Supabase, and Capacitor rebuild.

Immediate implementation order:

1. Stabilize the current static SPA harness.
2. Replace the temporary lesson board with a 5-column Mon-Fri monthly learning calendar.
3. Split `contentData.js`, `calendarData.js`, and `modal.js`.
4. Connect content buttons and calendar events to video/E-book modals.
5. Run responsive and accessibility QA before deployment.
