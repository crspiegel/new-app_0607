# Product Spec — Kindergarten English Learning SPA

This is the product and build reference for the kindergarten English learning web/app
(Cambridge Reading Adventures): information architecture, navigation flow, content menus,
main-page content, components, data model, implementation plan, and acceptance criteria.

See `CLAUDE.md` for the document map, commands, working protocol, and key decisions — it is
the auto-loaded entry point and the single source for those. Current user decisions override
older text: the short-term goal is to complete the static SPA prototype, and the calendar is
a **Mon-Fri 5-column** learning calendar (older Sun-Sat / 7-column references are not current).

## Project Context

This project is a kindergarten English learning web/app for classroom use. The primary
operator is the teacher, and the primary audience is children aged 5-7 watching on a TV,
projector, tablet, or mobile device.

Longer-term architecture (login, members, admin, Supabase, Vercel, hybrid app packaging) is
out of the current static-SPA scope and is documented in `PLATFORM_ROADMAP.md`.

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
- `P-11` to `P-14`: Level home pages for Beginner and Level 1-3
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

Implementation may use a single-page app pattern in HTML/CSS/Vanilla JS as long as the user-facing structure and navigation match this spec.

### Levels (2026-10-29)

Four levels, defined once in `video-source.js` `LEVELS`:

| Key        | On screen | Student QR token | Old key (until 2026-10) |
| ---------- | --------- | ---------------- | ----------------------- |
| `beginner` | Beginner  | `b`              | `Level 1`               |
| `level-1`  | Level 1   | `l1` (or `1`)    | `Level 2`               |
| `level-2`  | Level 2   | `l2` (or `2`)    | `Level 3`               |
| `level-3`  | Level 3   | `l3` (or `3`)    | `Level 4`               |

The key is used everywhere inside the site: DB rows, the URL hash (`#months/level-1`,
`#content/level-1/March`), `data-level`, the CSS class `level-theme-<key>` and file paths
(`assets/covers/<key>/…`). Old bookmarks with an old key (`#months/Level%201`) are rewritten to
the new key on load. The QR tokens never change (printed books).

## Design Requirements

Follow `DESIGN.md` first for visual direction, with these constraints:

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

- Beginner
- Level 1
- Level 2
- Level 3

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

## Main Landing Page Content

The main page introduces Cambridge Reading Adventures and provides Beginner / Level 1-3 entry. Section
order: Header → Hero → Level Selection → Program Intro → Key Features → Footer. Excluded from
the main page: reading-band progression detail, the complete book list, and any monthly
calendar or content-entry UI. (Absorbed from the former `MAIN_PAGE_CONTENT.md`; source PDF:
`CRA _시안2_수정_220706.pdf`.)

### Hero Section

- Eyebrow: `Brighter Thinking Better Learning`
- Title: `Cambridge Reading Adventures`
- Subtitle: `A colorful leveled reading program that helps young English learners build confidence through stories, nonfiction, and guided classroom activities.`
- Brand note: `Cambridge University Press`
- Background: blue `#2b70c9`, ~420px desktop height; the hero image fills top and bottom and
  slowly pans/zooms/floats to feel video-like. Primary image: `assets/cra-hero.jpg`.

### Level Selection

Title: `Choose Your Level`. Description: `Select a level to begin monthly lessons with songs,
stories, chants, and reading activities.`

| Button   | Subtitle          |
| -------- | ----------------- |
| Beginner | Starter Readers   |
| Level 1  | Growing Readers   |
| Level 2  | Confident Readers |
| Level 3  | Fluent Explorers  |

The top navigation also exposes the four levels (Beginner, Level 1-3) as menus that link to the
same flow.

### Program Intro

Title: `A Reading Journey for Every Young Learner`. Body: `Cambridge Reading Adventures is a
leveled reading program designed to guide children from first words and simple sentence
patterns to richer stories, nonfiction topics, and independent reading.` Image:
`assets/cra-books.jpg`.

### Key Features

Title: `Why Cambridge Reading Adventures Works`. Image: `assets/cra-band-samples.jpg`.

| Feature                | Copy                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Leveled Reading Path   | Color bands make reading progression visible and easy to guide.                     |
| Stories and Nonfiction | Learners meet illustrated stories, real-world topics, animals, places, and people.  |
| Classroom Ready        | Short, structured reading supports vocabulary, listening, speaking, guided reading. |

Language policy: user-facing UI is English; Korean explanations may accompany planning docs only.

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

## Student QR Page (`play.html`, 2026-10-22)

- One printed QR per **book**: Beginner 1 book/month (10 codes), Level 1-3 2 books/month
  (book 1 = weeks 1-2, book 2 = weeks 3-4; 60 codes) — 70 codes, `/q/<lv>/<month>/<book>`
  (`b`, `l1`-`l3` / `3`-`12` / `1`|`2`). List for Naver QR: `npm run qr:list` → `qr/qr-list.csv`.
- The page is the monthly calendar page's board for that book only, with the same markup and
  stylesheet (`board.css`, `board-view.js`): the shared Good Morning / Good Bye buttons, that
  book's Game and Song, its cover and its weeks. No header navigation, no Back/Next, no links out,
  no login (public). A tap opens the player overlay (video) or the game (same tab).
- Covers are committed static files (`assets/covers/...`), never Supabase Storage; one REST read
  per visit. Replacing a cover in the admin screen needs `npm run covers:sync` + deploy.
- Host `play.tps-education.com` (publisher Vimeo embedded directly); `www.cambridgereading.com/q/…`
  also works (publisher page framed).

## Teacher Resources (교사 자료실, 2026-10-29)

- Who: admins and LMS branch (role 1) / teacher (role 2) accounts. Students (role 3) and visitors
  never see the button or the page; the server refuses them too (RPCs + Storage policy).
- Each level's month page has a '교사 자료실' button at the right end of the title row (under the
  title on phones). It opens that level's resource page `#resources/<key>`: the same page with the
  March-December buttons replaced by download buttons, same level colors.
- Buttons (fixed names): Beginner, Level 1 → 월간.연간교육안 · 상장; Level 2, Level 3 → 월간.연간교육안 ·
  상장 · 테스트 (10 slots). A slot without a file is a grey, disabled "준비 중" button.
- One file per slot (PDF / xlsx / xls, 10 MB max) in the private Storage bucket `teacher-resources`.
  A download is a 60-second signed URL (expiry fixed on the server) issued by the Edge Function
  `teacher-resource-download` and opened in the same tab (the file is saved, the page stays).
- Limit: 30 downloads per LMS member per day (KST); admins unlimited. Over the limit the page says
  "오늘 다운로드 횟수를 모두 사용했습니다. 내일 다시 시도해 주세요."
- Admin: 배너 tab → "교사 자료실 파일": per slot the current file name · size · date, upload (replace —
  the old file is deleted) and a two-click delete.
- The Korean labels are a PM-set exception to the English UI (teacher-only screens).
- This replaces the cancelled header "선생님자료실" link button (former Phase 4 / R4).

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
