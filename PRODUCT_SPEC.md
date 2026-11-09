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

## Teacher Resources (레벨별 자료실, 2026-10-29) (옛 이름 '교사 자료실', 2026-11-06 변경)

- Who: admins and LMS branch (role 1) / teacher (role 2) accounts. Students (role 3) and visitors
  never see the button or the page; the server refuses them too (RPCs + Storage policy).
- Each level's month page has a '레벨별 자료실' button at the right end of the title row (under the
  title on phones). It opens that level's resource page `#resources/<key>`: the same page with the
  March-December buttons replaced by download buttons, same level colors.
- Cards (fixed names, D63 2026-11-02): Beginner, Level 1 → 월간교육안 · 연간교육안 · 상장; Level 2, Level 3
  → 월간교육안 · 연간교육안 · 상장 · 테스트 (14 slots). Slot keys: `monthly` (월간교육안, new) · `plan`
  (연간교육안 — the old 월간.연간교육안 key, so earlier files are the 연간교육안 files) · `award` · `test`.
  One card per row (D58): file icon · title + "PDF · 1.2MB · 11/02 업데이트" · [내려받기]; a slot without
  a file says "아직 올라온 자료가 없어요" (not a button).
- D65 (2026-11-02, replaces the D63 card list): 월간교육안 is one slot per month, March-December
  (`monthly-03` … `monthly-12`); three new kinds on every level, registered per level: 핵심문장
  스크립트 (`script`) · 그림 자료실 (`pictures`) · 플래쉬카드 (`flashcards`). Card order: 월간교육안 →
  연간교육안 → 상장 → 테스트 (Level 2/3 only) → 핵심문장 스크립트 → 그림 자료실 → 플래쉬카드 (6 cards on
  Beginner / Level 1, 7 on Level 2 / 3; 15 / 15 / 16 / 16 = 62 slots). Cards in a grid: 2 per row on a
  PC, 1 on a phone. [월간교육안] ("3월~12월 · N개 등록", [3~12월 보기 ▾]) opens a full-width panel under the
  grid with the ten month buttons (5 × 2 on a PC): a month with a file or a link is a level-colored
  button (file = our download, Drive = new tab), an empty month is a dim button that cannot be pressed;
  pressing again closes it. D63's single `monthly` slot is gone — its files are deleted in the admin
  screen before the change. Each slot keeps the D64 rule (a file OR a Drive link) and the file rules
  (PDF / Excel, 10 MB, the day's limit, 15 s); big files or other formats go as Drive links. Admin: level
  tabs, a foldable 월간교육안 group ("N/10 등록"), then the other slots.
- D64 (2026-11-02): each slot holds EITHER an uploaded file OR a Google Drive file link (the admin's
  file shared "anyone with the link"; only its ID is stored). Registering one removes the other (a
  replaced file is deleted from Storage). A Drive card says "구글 드라이브 · 11/02 업데이트" and its
  [내려받기] opens `https://drive.google.com/uc?export=download&id=<ID>` in a new tab — straight from
  Google: no Storage traffic, no Edge Function, no daily limit. Links accepted: drive.google.com
  `/file/d/<ID>/…`, `/open?id=<ID>`, `/uc?…id=<ID>`; Google Docs/Sheets/Slides links are refused
  ("PDF나 엑셀 파일로 드라이브에 올린 뒤 그 파일 링크를 넣어 주세요").
- One file per slot (PDF / xlsx / xls, 10 MB max) in the private Storage bucket `teacher-resources`.
  A download is a 15-second signed URL (expiry fixed on the server) issued by the Edge Function
  `teacher-resource-download` and opened in the same tab (the file is saved, the page stays).
- Limit: 30 downloads per LMS member per day (KST); admins unlimited. Over the limit the page says
  "오늘 다운로드 횟수를 모두 사용했습니다. 내일 다시 시도해 주세요."
- Admin: 배너 tab → "레벨별 자료실 파일": per slot the current file name · size · date, upload (replace —
  the old file is deleted) and a two-click delete.
- The Korean labels are a PM-set exception to the English UI (teacher-only screens).
- This replaces the cancelled header "선생님자료실" link button (former Phase 4 / R4).

## Resource Board (교사자료실 게시판, 2026-11-03 · 수정 1차 2026-11-04 · 수정 2차 2026-11-05)

A board of posts with attachments for teachers, next to the 레벨별 자료실 above. PM briefs
`2026-11-03` (B1-B12, T1-T3, H1-H6), `2026-11-04` (F1-F4, R1-R3) and `2026-11-05` (2차: #1-#5, login ended).
Its name on every screen (teachers' and admin) is **교사자료실** (no space); the per-level one above is
**레벨별 자료실** (with a space).

- **Who reads:** the top admin and LMS branch (role 1) / teacher (role 2) accounts. They get a
  "Teacher" button in the header (one line; before My Class / Admin; a folder icon on phones) that
  opens `#board`. Students (role 3) and visitors never see the button; an address sends them to the
  home page, and the server answers them nothing (RPCs + private Storage).
- **Who writes:** the top admin only — admin screen → 교사자료실 (list, 교사자료실 설정, editor). Every write is
  an RPC that checks `is_admin()` again.
- **List** (`#board[?level=&cat=&q=&sort=&page=]`): title/body search, level chips (a level = that
  level and 공통), category chips (7 to start: 월간교육안, 연간교육안, 상장, 테스트, 핵심문장 스크립트, 그림
  자료실, 플래쉬카드 — the admin renames, reorders, adds, and deletes an empty one), 전체 N개, 최신순 /
  조회순, pinned (공지) first, 10 a page; a table on a PC, cards on a phone. Filters live in the address (Back
  and reload keep them). NEW = posted in the last 7 days (KST); views count once per member per day.
- **Post** (`#board/<id>`): tags, title, date · views · files, body, the attachments in the admin's
  order, 이전 글 / 다음 글 in the list's order, 목록으로.
- **Font (F1, #5, D77):** the teachers' board screens (list, post, empty states, notes; PC and phone) wear
  one face pair for every letter (Korean, Latin, numbers — level tags, NEW, dates, views, file names,
  button labels). The top admin picks it in 교사자료실 설정: Korean [프리텐다드(기본) / 나눔스퀘어라운드]
  and Latin [프리텐다드(기본) / 나눔스퀘어라운드], saved at once ("글꼴을 바꿨어요."; `site_settings`
  `board_font_ko` / `board_font_en` = `pretendard` | `nanum-square-round`; anything else, the old
  `nanum-gothic` included = Pretendard), with a one-line preview. Only the picked faces load. A letter
  나눔스퀘어라운드 does not draw falls to the next font (never a blank or a box). The header, footer,
  레벨별 자료실 and all other admin screens keep their fonts (the admin's own Korean stays 나눔고딕).
- **Background (#4):** the light-blue board background runs from the header to the footer however short
  the page.
- **Attachments:** up to 50 per post (D79, 2026-11-07 — was 20; files and links together), each a file
  OR a Google Drive file link OR (D80, this board only) a Google Sheets / Docs / Slides link.
  - File: PDF · Excel (xlsx/xls) · 한글 (hwp/hwpx) · PowerPoint (pptx/ppt) · JPG · PNG, 10 MB max, in the
    private bucket `resource-board`. [내려받기] = a 15-second signed URL from the Edge Function
    `teacher-resource-download` (`{attachment}`), saved in the same tab with the original name.
  - Drive (F2): [내려받기] opens Google's direct download
    `https://drive.google.com/uc?export=download&id=<ID>` in a new tab (the D64 rule — not the preview
    page; no Storage traffic, not counted in the daily limit). The row says "구글 드라이브 · 바로 받기". A
    very big file (about 100 MB+) may show Google's one-time "can't scan for viruses" page first.
  - Google Sheets / Docs / Slides (D80): [내려받기] opens Google's export address in a new tab, so the
    teacher gets an Excel / Word / PowerPoint file —
    `https://docs.google.com/spreadsheets/d/<ID>/export?format=xlsx`, `…/document/d/<ID>/export?format=docx`,
    `…/presentation/d/<ID>/export?format=pptx` — always the latest version TPS saved (no Storage traffic, not
    counted). Rows: XLS (green) "구글 시트 · 엑셀로 받기", DOC (blue) "구글 문서 · 워드로 받기", PPT (orange)
    "구글 슬라이드 · 파워포인트로 받기". Sharing must be "링크가 있는 모든 사용자", as for Drive files.
  - The admin's link box ("드라이브 링크 추가") takes a Drive file link or a Sheets / Docs / Slides share link
    (also with `/u/<n>/`, `?usp=…&ouid=…`, `#gid=…`). Refused, each with what to paste instead: a "웹에 게시"
    address (`/d/e/2PACX-…`), Google Forms, any other Docs page. The editor's row says "구글 시트 / 엑셀로
    받기" (etc.). 레벨별 자료실 keeps the D64 rule (Docs addresses refused).
  - Phones: an icon-only [내려받기]; a long file name wraps after `_` `-` `.` or a space, 2 lines max (R1).
  - **모두 받기 · 선택 받기 (D81, 2026-11-08):** a post with **two or more files** shows [전체 선택] and
    [모두 받기 (ZIP · N개)] (N = the files that go in) in the box head, and a check on each file row (a link row
    shows a dim "–"). Picking one or more shows the 선택 바 under the box: "N개 선택", "압축 파일(ZIP) 1개로 받아요 ·
    크기" (one: "1개는 압축하지 않고 바로 받아요 · 크기"), [선택 해제], [선택한 N개 받기 (ZIP)] (one: "선택한 1개
    받기"). On a phone [모두 받기] is the box's full width and the bar is fixed at the bottom ("해제" / "선택한 N개
    받기"), the page keeping room below it. One picked = no ZIP: that row's own download. The rows' own
    [내려받기] stay. The ZIP is made in the browser: each file's URL comes from the Edge Function as for its row
    (one file = one of the day's downloads) and is fetched at once, 3 at a time; 200 MB at most per ZIP
    (more is refused before it starts: "한 번에 200MB까지 받을 수 있어요. 파일을 골라서 나눠 받아 주세요.").
    Google links never go in (Google refuses another site's fetch): "구글 링크 N개(종류)는 압축에 들어가지
    않아요. 그 줄의 [내려받기]로 따로 받아 주세요." under the head, on posts that have them. Status in the box
    (`role="status"`): "압축하는 중… n / N개 (창을 닫지 말아 주세요)" + a bar → "압축 파일을 받았어요 (N개 · 크기).
    내려받기 폴더에서 '파일명.zip'을 확인해 주세요." + [닫기]; a file that fails is left out and named ("받지
    못한 파일이 있어요: 이름 — 잠시 뒤 다시 시도해 주세요."); all failing = no ZIP, the refusal said as for one
    file. Both buttons are locked while it runs; leaving the post stops it. Names: `글 제목.zip` /
    `글 제목_선택 N개.zip` (`\ / : * ? " < > |` → `_`); the same name twice inside → `이름 (2).확장자`.
  - **선택 바 따라다니기 · 맨 위 버튼 · 바 진행 표시 (D84, 2026-11-09):** the 선택 바 is the 첨부파일 box's last
    part. On a PC it sticks 16px over the window's bottom while the list goes on below and rests at the box's end
    (이전·다음 글 and [목록으로] never covered); it rises briefly as it appears (not with reduced motion). A phone
    keeps the D81 bar fixed at the bottom. While something is picked the top button is [선택한 1개 받기] /
    [선택한 N개 받기 (ZIP)] (phone: the same words) and does what the bar's button does; no pick = [모두 받기 (ZIP ·
    N개)] again. While a ZIP is made the bar also says "압축하는 중… n / N개" + "창을 닫지 말아 주세요" over a thin
    progress bar (the status above stays the one read aloud), [선택 해제] and both 받기 buttons locked (the checks
    and [전체 선택] are not); after it (done or failed) the bar says "N개 선택" again, the picks kept. A ZIP
    started from far down (or the 200MB refusal) scrolls the status into view below the site header.
- **Download limit (D82, 2026-11-08):** 1,000 a day per LMS member (KST) — was 30; a safety stop for a
  leaked account or a loop that real teachers never reach. One shared count with 레벨별 자료실 (board rows
  logged as `level='board'`); a ZIP of N files counts N. Admins unlimited. A missing file is not counted.
  When reached, both screens say "오늘 내려받기가 너무 많아 잠시 막혔어요. 관리자에게 문의해 주세요."
- **Admin list (D85, 2026-11-09):** one row a post — [pin] · 제목 · 레벨 · 분류 · 첨부 · 조회 · 등록일 · 관리
  (no 공지 / 상태 columns). Pinned = a pin (read "고정 글"), a light yellow row and a darker line under the
  last pinned one; hidden = a grey [숨김] before a grey title. 레벨 = a color dot + the name; 분류 = the same
  pill as 교사자료실 설정. 첨부 (clip; 0 paler) · 조회 · 등록일 right-aligned, same-width digits; 등록일 this
  year `11.02`, older `2025.11.02` (Seoul time, `<time datetime>`). The title is one line ("…", the whole
  title as its tooltip) and opens the editor like [수정]. 관리 = [수정] · 보기 (new tab, "<제목> 사용자 화면에서
  보기 (새 탭)") · [⋯] whose menu holds only [삭제…] (the same two presses: "한 번 더 누르면 삭제"); one menu at
  a time, its first item focused, Esc / a press outside / Tab out close it (Esc and an empty spot put the
  focus back on [⋯]). Filters: level chips (전체 · Beginner · Level 1-3 · 공통, `aria-pressed`, no counts) ·
  분류 list · status buttons (전체 · 공개 · 숨김) · title search on Enter; the same `board_admin_list`
  arguments as before, page 1 again on a change. "전체 N개" + "고정 글 먼저 · 최근 등록순" (the RPC's order).
  A box too narrow for the table (phones, tablets, a PC window under about 1,150px) shows a row list: the
  title line, then level · category · "첨부 N · 조회 N · 11.02" (one piece), [수정] and [⋯] 44px at the
  right, 보기 inside [⋯]. Phone filters: the chips slide sideways, 분류 + 상태 on one line, the search box
  full width under them. Pager, the just-saved light (F4), empty / refusal sentences and 교사자료실 설정
  unchanged.
- **Editor (admin):** title (required, 100), body (optional, 5,000), level (공통 / one level), category,
  공개, 📌 고정. Files are dropped (many at once, name order "3월 < 10월") or picked, uploaded 3 at a
  time with a bar each; refused ones (type, size, empty) are listed in red; rows reorder by dragging
  the handle, ↑ ↓ on it, or the phone buttons.
  - **Register (F4):** [등록하기] (new post) / [수정 완료] (existing post) — big in the 게시 box and on the
    등록 bar right under the file list, which stays at the bottom of the window while scrolling (PC and
    phone). The bar says "올리는 중 6/10…" (button locked) → "파일 10개가 올라갔어요. [등록하기]를
    눌러야 선생님 화면에 보여요." (button highlighted) → with a failure "올리지 못한 파일 1개 — 빼거나
    다시 올린 뒤 등록하세요." (locked). File rows: "✓ 올림 · 등록 전" (grey) until registered, "등록됨"
    after. An empty title moves to the title box with a note. Success: "등록했어요" / "수정했어요", back to
    the list with that row lit up for a moment. Changing only the body or the attachment order also
    needs [수정 완료].
  - **Leaving (F3):** uploads made in this edit and not registered (uploading, waiting, done or failed)
    are pending. Leaving inside the site (취소, another admin menu, 사이트 보기, 로그아웃, another post,
    Back / a changed `#`) with pending uploads shows our window "업로드를 중단하시겠습니까?" / "중단하면
    이번에 올린 파일 N개가 모두 취소돼요. 이미 등록된 파일은 그대로 남아요." / [중단하기] (red) · [계속
    올리기] (focused; also Esc). 중단하기 = stop the uploads, delete all of them from Storage, then go;
    계속 올리기 = stay (Back: the address is put back). Other unsaved changes ask "수정한 내용을 저장하지
    않고 나갈까요?". Nothing unsaved = no window. Closing the tab, reloading or another address: the
    browser's own question (its wording cannot be changed) only while uploads are pending; leaving
    then deletes them (`pagehide`, keepalive). A forced browser kill can leave files — a read-only
    check lists them (no delete SQL).
- **Switches (교사자료실 설정, B12 · T1):** `resource_board_enabled` (default off) shows / hides the header
  button and the board for branch / teacher accounts (an address does not open it; posts and files
  stay; the top admin may still preview with a note). The 배너 tab's 레벨별 자료실 switch
  (`teacher_resources_enabled`, default on) hides the month-page 레벨별 자료실 button and list for everyone
  (files and links stay; the download function itself is unchanged).
- **Login ended (2차 §5):** if the login ends while the admin screen is open (Log out in another tab,
  an expired session — top admin or a branch / teacher account), a window says "로그인이 끝났어요." / "다시
  로그인한 뒤 이어서 해 주세요." over the locked admin screen (nothing typed vanishes, nothing can be saved)
  until [로그인 화면으로].

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
