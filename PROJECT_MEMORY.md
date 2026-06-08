# Project Memory

Use this file first when resuming after a reboot, VS Code restart, or a new Claude Code session.

## Project Snapshot

- Project: kindergarten English learning static SPA prototype.
- Short-term goal: finish the current static SPA prototype before any Next.js/Supabase rebuild.
- Core files: `index.html`, `styles.css`, `app.js`.
- Supporting docs: `AGENT.md`, `DESIGN.md`, `README.md`, `CODEX_BUILD_GUIDE.md`, `PRD_v1.0.md`.
- Note: `PRD_v1.0.md` and `CODEX_BUILD_GUIDE.md` may contain encoding issues; prefer `AGENT.md`, `DESIGN.md`, and this file for current working direction.

## Source Of Truth

Use documents in this order for the current static SPA phase:

1. `CLAUDE.md`: Claude Code auto-loaded entry point and quick orientation.
2. `PROJECT_MEMORY.md`: session resume state, current decisions, next work.
3. `README.md`: commands and verification.
4. `AGENT.md`: current product scope, IA, implementation plan, acceptance criteria.
5. `DESIGN.md`: visual direction.
6. `PRD_v1.0.md`: original v1.0 reference only.
7. `CODEX_BUILD_GUIDE.md`: long-term platform reference only.

Current user decisions override older document text. In particular, any `Sun-Sat` or 7-column calendar requirement is overridden by the current `Mon-Fri` 5-column calendar decision.

## Current Operating Protocol

- Plan-first workflow is active.
- Non-trivial user requests should be designed in Claude Code Plan mode and approved before implementation.
- Implementation proceeds only after scope, priority, risks, and verification are clear.
- Report changed files, verification results, and remaining issues after each change.
- Update this file briefly after meaningful planning, implementation, or verification changes.

## Confirmed Decisions

- Short-term direction: `A`, continue and complete the current static SPA.
- Calendar layout: `Mon-Fri` 5-column learning calendar only.
- Weekend columns should not be shown.
- Content URLs are not ready yet.
- Use sample Vimeo embed video URLs for modal/player implementation.
- Default verification command: `npm.cmd run qa`.
- PowerShell may block `npm`; use `npm.cmd`.

## Current Implementation Status

- Main page exists.
- Level 1-4 selection works.
- March-December month selection works.
- Hash routing works:
  - `#months/Level%201`
  - `#content/Level%201/March`
- Current content screen is still a temporary `Book A/B x 2 weeks x Mon-Fri` board.
- Required `Mon-Fri` monthly learning calendar is implemented as a separate V3 candidate, but it is not yet the default content route.
- `contentData.js`, `calendarData.js`, and `modal.js` do not exist yet.
- Vimeo/video modal is not implemented yet.
- `contentScreenV2` still exists as a duplicate/alternate screen and needs a decision.
- `contentScreenV3` has been added as a separate design candidate at `#content-v3/Level%201/March`.
- `contentScreenV2` remains preserved and available at `#content-v2/Level%201/March`.
- `contentScreenV3` is now a weekday-only learning board: 4 learning weeks x `Mon-Fri` buttons, with no date numbers.
- V3 buttons use future-ready attributes for modal playback: `data-content-type`, `data-week`, and `data-day`.

## Harness / Verification

Harness has been added.

- `npm.cmd run dev`: run Vite local server.
- `npm.cmd run check:assets`: verify asset path case.
- `npm.cmd run lint`: run ESLint.
- `npm.cmd run format:check`: run Prettier check.
- `npm.cmd run test:e2e`: run Playwright smoke tests.
- `npm.cmd run qa`: run all checks and browser smoke tests.

Last known status:

- `npm.cmd run check`: passed.
- `npm.cmd run test:e2e`: passed.
- `npm.cmd run qa`: passed.
- Documentation alignment pass completed: current source-of-truth order and Mon-Fri override notices were added to planning/reference docs.

## Active Backlog

1. Review `contentScreenV3` and decide whether it should become the default content screen.
2. Add `contentData.js` with sample Vimeo embed data.
3. Add `calendarData.js` with Mon-Fri sample learning events.
4. Add `modal.js` for Vimeo iframe modal behavior.
5. Connect top content buttons to sample Vimeo modal playback.
6. Connect calendar weekday/activity buttons to sample Vimeo modal playback.
7. Extend Playwright tests for modal open/close behavior.
8. Run responsive and accessibility QA.
9. Update handoff notes after calendar/modal implementation.

## Next Implementation Task

Recommended next implementation ticket:

- Review `contentScreenV3` at `#content-v3/Level%201/March`.
- Decide whether V3 should replace the default `#content/...` route.
- Then connect V3 buttons to sample Vimeo modal playback using data files.

## Open Questions

- Should `contentScreenV2` be deleted, or kept as an archived/reference section?
- Should sample Vimeo use one video for all buttons, or different sample URLs by content type?
- Should Story use Vimeo only for now, or include an E-book placeholder?
- Should Level 2-4 reuse Level 1 sample data until real content is ready?
- Should V3 become the default `#content/...` route after client review?

## Session Resume Checklist

1. Read this file.
2. Read `README.md` for commands.
3. Read `AGENT.md` and `DESIGN.md` for product/design constraints.
4. Run `npm.cmd run check` if files changed since last session.
5. Before implementation, design non-trivial requests in Plan mode (Plan-first workflow).
6. After implementation, run `npm.cmd run qa` unless the plan scopes verification differently.
