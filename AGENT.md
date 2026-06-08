# AGENT.md

## Current Working Priority

For the current phase, follow documents in this order:

1. `CLAUDE.md` as the Claude Code auto-loaded entry point
2. `PROJECT_MEMORY.md`
3. `README.md`
4. `AGENT.md`
5. `DESIGN.md`
6. `PRD_v1.0.md` as original v1.0 reference only
7. `CODEX_BUILD_GUIDE.md` as long-term platform reference only

Current user decisions override older document text. The active short-term goal is to complete the current static SPA prototype. The active calendar requirement is a `Mon-Fri` 5-column learning calendar. Older `Sun-Sat` or 7-column calendar references are not current.

## Project Context

This project is a kindergarten English learning web/app for classroom use. The primary operator is the teacher, and the primary audience is children aged 5-7 watching on a TV, projector, tablet, or mobile device.

The current working direction is documented in `PROJECT_MEMORY.md`, `README.md`, this file, and `DESIGN.md`. `PRD_v1.0.md` remains the original planning source. `CODEX_BUILD_GUIDE.md` remains the long-term platform source for login, admin, Supabase, Vercel, and app packaging direction.

Latest architecture note:

- The product should be treated as a login-based learning platform, not only a static content site.
- Web and Android/iOS app content must be managed from one Web admin page.
- The preferred direction is a Web App plus hybrid mobile app packaging.
- Admin, member, member group, content URL, and access-control requirements are defined in `CODEX_BUILD_GUIDE.md`.
- These architecture notes are long-term direction and are not part of the current static SPA completion scope unless the user explicitly changes the short-term target.

## Operating Protocol

- Plan-first workflow is active.
- Non-trivial user requests should be designed in Claude Code Plan mode and approved before implementation.
- Implementation changes should report changed files, verification results, and remaining questions.
- Default verification command after meaningful changes is `npm.cmd run qa`, unless the plan scopes verification differently.

## Product Goal

Build an interactive learning platform that lets a kindergarten teacher reach English learning content within three clicks:

1. Choose a level.
2. Choose a month.
3. Choose a learning menu or calendar activity.

The app must feel simple, colorful, readable, and classroom-friendly. Controls must be large enough for touch and visible from a classroom display.

## Target Users

- Teacher: operates the web/app during class.
- Children aged 5-7: watch, listen, sing, chant, and follow along.
- Supported devices: PC, tablet, mobile, TV/projector through browser output.

## Core Information Architecture

The full target structure is:

- `P-00`: Main landing page
- `P-11` to `P-14`: Level home pages for Level 1-4
- `P-20` to `P-29`: Monthly calendar pages for March-December per level
- `P-30` to `P-34`: Content menu actions
  - Opening Song
  - Story
  - Word Chant
  - Sentence Chant
  - Ending Song

Target total page model from the PRD:

- 1 main page
- 4 level home pages
- 40 monthly calendar pages
- 5 content action types

Implementation may use a single-page app pattern in HTML/CSS/Vanilla JS as long as the user-facing structure and navigation match the PRD.

## Current Scope Boundary

Do not implement or modify the website until the user explicitly asks for the next build step. Planning/documentation requests should only update planning or guidance documents.

Allowed for planning/documentation work:

- Read `PRD_v1.0.md`
- Read `DESIGN.md`
- Read and update `CODEX_BUILD_GUIDE.md`
- Update planning documents when requested

Not allowed during planning-only requests:

- Modify `index.html`
- Modify `styles.css`
- Modify `app.js`
- Add new runtime features
- Refactor current implementation
- Start a dev server unless explicitly requested later

## Design Requirements

Follow `DESIGN.md` first for visual direction, with these PRD constraints:

- No italic text anywhere.
- Use large, readable labels.
- Use bright child-friendly colors.
- Buttons must have clear hover and active feedback.
- UI must be simple enough for teacher-led classroom operation.
- Use high contrast and avoid tiny labels.
- Maintain responsive layouts for PC, tablet, and mobile.

The current `DESIGN.md` is inspired by Duolingo ABC style but adapted to rectangular section boxes. Do not use angled, wavy, diagonal, blob, or scalloped section dividers.

## Required Navigation Flow

### Main Landing Page

Purpose:

- Show brand/program identity.
- Provide four level selection buttons.

Required controls:

- Level 1
- Level 2
- Level 3
- Level 4

Responsive layout:

- PC: 4 buttons in one row
- Tablet: 2 x 2 grid
- Mobile: 1 column

### Level Home Page

Purpose:

- Show selected level.
- Let teacher choose a month from March to December.

Required controls:

- March
- April
- May
- June
- July
- August
- September
- October
- November
- December

Responsive layout:

- PC: 5 x 2 grid
- Tablet: 3-4 columns
- Mobile: 2 columns

### Monthly Calendar Page

Purpose:

- Show level and month.
- Show five content menu buttons.
- Show monthly learning calendar.

Required top-down layout:

1. Level and month title image or banner
2. Five content menu buttons
3. Monthly calendar grid

Calendar requirement:

- Monthly grid
- 5 columns: Mon-Fri only
- Date number plus learning event text/icon
- Event colors map to content menu colors
- Weekend columns are not shown.

## Content Menu System

The five menu buttons are fixed across all monthly pages.

| Menu           | Color     | Content Type                    |
| -------------- | --------- | ------------------------------- |
| Opening Song   | `#EF476F` | Video/audio modal               |
| Story          | `#2E75B6` | Story video or FlipHTML5 E-book |
| Word Chant     | `#06D6A0` | Chant video/audio               |
| Sentence Chant | `#7B2D8B` | Chant video/audio               |
| Ending Song    | `#FF6B35` | Video/audio modal               |

Menu button requirements:

- Minimum height: 56px
- Font size: 16-18px where possible
- Rounded rectangle shape
- Hover: scale and lift
- Active: pressed/down state
- Use icon plus text where possible

## Data Model Direction

Future implementation should separate content data from rendering logic.

Recommended files:

- `contentData.js`: content URLs and content type mapping
- `calendarData.js`: monthly schedule events
- `modal.js`: video/E-book modal behavior

Recommended content structure:

```js
const contentData = {
  level1: {
    march: {
      openingSong: { url: "...", type: "video" },
      story: { url: "...", type: "ebook" },
      wordChant: { url: "...", type: "video" },
      sentenceChant: { url: "...", type: "video" },
      endingSong: { url: "...", type: "video" },
    },
  },
};
```

Recommended calendar structure:

```js
const calendarData = {
  level1: {
    march: {
      3: [{ label: "Opening Song", type: "openingSong", color: "#EF476F" }],
      5: [{ label: "Story", type: "story", color: "#2E75B6" }],
    },
  },
};
```

## Component Requirements

### Video Modal

- Triggered by content menu or calendar event.
- Uses iframe or HTML5 video.
- Overlay background: `rgba(0,0,0,0.85)`.
- Close through close button, overlay click, and ideally ESC.
- On close, reset media source so playback stops.
- Lock body scroll while open.

### E-book Modal

- Supports FlipHTML5 iframe.
- Supports fullscreen-style mode through `.full-screen`.
- Must be easy to close and return to the calendar.

### Dropdown Menu

If book-thumbnail interactions are reintroduced:

- Triggered by book image click.
- Positioned below clicked image.
- Uses popup animation.
- Closes when clicking outside.

## Accessibility Requirements

- All buttons need clear text labels.
- Image buttons need `alt` text or `aria-label`.
- Color must not be the only meaning signal; pair color with icon/text.
- Maintain WCAG AA contrast where practical.
- Touch targets should be at least 56px high for child/classroom use.
- Focus states must remain visible.

## Responsive Breakpoints

Use these PRD breakpoints as the target:

| Range             | Level Buttons | Month Buttons | Menu Buttons |
| ----------------- | ------------- | ------------- | ------------ |
| `> 1300px`        | 4 in one row  | 5 x 2         | 5 in one row |
| `1024px - 1300px` | 4 in one row  | 5 x 2         | 5 in one row |
| `768px - 1024px`  | 2 x 2         | 3-4 columns   | 3 + 2        |
| `480px - 768px`   | 2 x 2         | 2-3 columns   | 2 + 3        |
| `< 480px`         | 1 column      | 2 columns     | 2 + 3        |

## Technical Stack

Use:

- HTML5
- CSS3
- Vanilla JavaScript
- CSS Grid and Flexbox
- CSS transitions/keyframes using `transform` and `opacity`

Avoid:

- Introducing a frontend framework unless the user explicitly requests it.
- Heavy dependencies.
- Complex state management libraries.

## Implementation Plan

### M1: Foundation

Goal:

- Establish global variables, typography, layout primitives, buttons, and modal foundations.

Deliverables:

- Shared CSS structure
- Button system
- Modal shell
- Base JS utilities

### M2: Main and Level Homes

Goal:

- Implement the main landing page and level-to-month navigation.

Deliverables:

- Main landing page
- Four level views or equivalent SPA states
- March-December month grid
- Back navigation

### M3: Level 1 Monthly Calendars

Goal:

- Build the complete monthly calendar pattern for Level 1.

Deliverables:

- March-December calendar views for Level 1
- Five content menu buttons
- Calendar event rendering

### M4: Levels 2-4 Monthly Calendars

Goal:

- Reuse the Level 1 calendar structure for Levels 2-4.

Deliverables:

- Remaining 30 monthly calendar views or data-driven equivalents
- Level-specific title/banner handling

### M5: Content Integration

Goal:

- Connect all video and E-book URLs.

Deliverables:

- `contentData.js`
- Video modal playback
- E-book iframe modal
- Close/reset behavior

### M6: Responsive QA

Goal:

- Validate the app across PC, tablet, and mobile breakpoints.

Deliverables:

- Responsive fixes
- Accessibility pass
- Browser QA checklist

### M7: Optimization and Handoff

Goal:

- Prepare for deployment.

Deliverables:

- Image optimization
- Lazy loading
- Final cleanup
- Deployment notes

## Immediate Next Recommended Step

Before coding, confirm the implementation shape:

1. Single-page app with dynamic state in `index.html`, `styles.css`, and JS modules.
2. Or static page files such as `level1.html`, `level2.html`, etc.

Recommended approach:

- Use a data-driven single-page app pattern because the structure repeats across 4 levels x 10 months x 5 content menus.
- Split content and calendar data into separate JS files when implementation begins.

## Acceptance Checklist

The site should be considered ready only when:

- Main page has four level buttons.
- Each level exposes March-December.
- Each month exposes five content menus.
- Monthly calendar uses a 5-column Mon-Fri grid.
- Content menu colors match the PRD.
- Video and E-book modals open and close correctly.
- Back navigation is always available.
- PC/tablet/mobile layouts match the PRD.
- No italic text appears anywhere.
- Buttons are readable, large, and animated.
- Images are optimized and lazy-loaded where appropriate.
