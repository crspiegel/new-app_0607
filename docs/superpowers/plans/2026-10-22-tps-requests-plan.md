# TPS 요청 5건 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 요일 슬롯 게임 URL(R1) → 교재 단위 QR 70개 + 페이지2와 동일한 학생 페이지(R2·R3) → LMS 4등급(R5)
→ 역할별 헤더 버튼(R4)을 네 Phase로 나눠, 각 Phase가 끝날 때마다 운영 배포 가능한 상태로 둔다.

**Architecture:** 정적 SPA 유지. 공유 classic script(`video-source.js` + 신규 `board-view.js`)와 물리 추출한
`board.css`를 선생님 페이지2와 학생 페이지가 함께 쓴다. 학생 페이지는 (level, month) 1행만 읽고 교재 슬롯만
그리며 표지는 저장소 정적 자산. LMS는 자체 `members` + 세션 토큰 테이블 + 헤더 기반 RLS(SQL만, 새 도구 없음).

**Tech Stack:** Vanilla HTML/CSS/JS, Vite(dev), Playwright, Supabase(Postgres RPC/RLS, Storage는 관리자만), Vercel 정적 배포.

**Spec:** `docs/superpowers/specs/2026-10-22-tps-requests-review.md` (정오표·권고·결정 질문 포함).
확정 결정 D1~D7은 지시서(`docs/worker-briefs/2026-10-22-tps-requests-brief-v2.md`, 로컬).

## Global Constraints

- 코드 작업 전 `PROJECT_MEMORY.md`·`NOTES.md`를 읽는다. 공유 classic script의 최상위 이름을 `app.js`에
  재선언하면 사이트 전체가 멈춘다(`SyntaxError`) — 새 공유 이름은 `/* exported */`와
  `eslint.config.mjs` `videoSourceGlobals`에도 추가.
- Supabase: 학생 페이지에서 Storage 요청 0건, REST 1회. 테스트는 REST 픽스처 + Storage 스텁. 라이브 Storage
  다운로드(표지 sync)는 **사용자 승인 후 1회**.
- 슬롯 키(`opening`, `w1-Mon` …)·`TOOLBAR_BUTTONS`·DB 값 형태는 바꾸지 않는다. 교재 토큰은 새 인쇄물 계약.
- 영어 UI(학생·선생님 화면), 이탤릭 금지, 아이 친화. 관리자 화면은 한글.
- `npm.cmd run check`(Stop 훅) 통과, 커밋 전 `npm.cmd run qa`(Vite 종료 후). **커밋·푸시는 사용자 요청 시에만**
  (push = 운영 배포). 아래 "커밋" 단계는 "사용자 승인 후 커밋"으로 읽는다.
- 기존 승인 화면(페이지2 등)은 픽셀 단위로 변하지 않아야 한다.

## Review Focus

1. **요일 슬롯에 게임 URL + 등급 3 세션** — 차단 팝업이 먼저 떠야 한다(`openSlot` 게이트 순서). Task 1.2 테스트.
2. **`/q/b/3/2`(Beginner 교재 2)** — invalid 카드, 빈 페이지·예외 없음. Task 2.3 테스트.
3. **표지 파일이 없는 교재** — 흰 자리표시자, 콘솔 에러·재시도 없음, Storage로 폴백하지 않음. Task 2.7 테스트.
4. **`board.css` 추출 후 관리자 화면·페이지1·홈** — 페이지2 외 화면이 보드 규칙 이동으로 바뀌지 않는지(픽셀
   비교에 홈·월그리드·관리자 보드 1장씩 추가). Task 2.4.
5. **아이폰 오버레이에서 Vimeo iOS 전체화면 종료** — 종료 후 오버레이가 남고 ▶로 재개(기존 동작 유지). Task 2.6
   기존 iPhone 테스트 3개 유지.

---

## Phase 1 — R1 요일 슬롯 게임 URL (배포 가능: 예, 단독)

의존: 없음. 추정 3~4h. 배포 후 관리자가 요일 슬롯에 게임 URL을 넣으면 즉시 동작.

### Task 1.1: `isGameUrl` + `parseVideoSource` 게임 분류

**Files:**

- Modify: `video-source.js` (`/* exported */` 주석, `parseVideoSource`, 신규 `GAME_HOSTS`·`isGameUrl`)
- Modify: `eslint.config.mjs` (`videoSourceGlobals`에 `isGameUrl`)
- Test: `tests/smoke.spec.js` "slot video classifier sends non-Vimeo pages to the page viewer" 확장, `tests/play.spec.js` "video-source.js loads before app.js without redeclaration" 확장

**Interfaces:**

- Produces: `isGameUrl(str) → boolean`, `parseVideoSource(str, opts) → { kind: "game", url }` (게임 호스트일 때).
  `GAME_HOSTS = ["book-english-games.vercel.app"]`.

- [ ] **Step 1:** smoke 분류 테스트의 입력에 `https://book-english-games.vercel.app/play/the-tractor`를 추가하고 기대 배열에 `"game"`을 추가. play.spec 재선언 테스트의 `evaluate`에 `isGame: isGameUrl("https://book-english-games.vercel.app/play/x")`, `isGameSub: isGameUrl("https://a.book-english-games.vercel.app/")`, `notGame: isGameUrl("https://example.com/play")`를 추가(기대 true/true/false).
- [ ] **Step 2:** `npx.cmd playwright test tests/smoke.spec.js -g "classifier" --project=desktop` → FAIL(`"page"` ≠ `"game"`).
- [ ] **Step 3:** `video-source.js`에 `GAME_HOSTS`, `isGameUrl`(URL 파싱 실패 → false, 호스트 정확히 일치 또는 `.`+호스트로 끝남), `parseVideoSource`에서 YouTube 분기 다음에 게임 분기. `/* exported */`·eslint globals 갱신.
- [ ] **Step 4:** 두 테스트 PASS, `npm.cmd run check` 통과.
- [ ] **Step 5:** 커밋 `feat: classify game URLs in parseVideoSource`.

### Task 1.2: 선생님 사이트 — 요일 게임 슬롯은 게임 모달

**Files:**

- Modify: `app.js` `openSlot()` (843행 부근), `openSlotEditor()` 라벨·placeholder (2439행 부근)
- Modify: `index.html` `#adminSlotLabel` 기본 문구가 있으면 함께
- Test: `tests/smoke.spec.js` 신규 2개

**Interfaces:**

- Consumes: `parseVideoSource`, `openGameModal(url)`, `isBlockedByGrade()`.

- [ ] **Step 1:** 테스트 "weekday slot with a game URL opens the game modal": `craContent.settled` 대기 → `contentCache["Level 1||March"].videos["w1-Mon"]`에 게임 URL 시드 → `#content/Level%201/March`로 이동(`page.reload()`) → `.lesson-button[data-slot="w1-Mon"]` 클릭 → `#gameModal` visible, `#gameFrame` src = 게임 URL, `#videoModal` hidden. 테스트 "grade 3 still sees no-access before a weekday game": `localStorage.cra_member = {"id":"x","grade":3}` 시드 → 같은 클릭 → `#noAccessModal` visible, `#gameModal` hidden.
- [ ] **Step 2:** 실행 → FAIL(`#videoModal`이 열림).
- [ ] **Step 3:** `openSlot`에서 URL 획득 후 `parseVideoSource(url)?.kind === "game"`이면 `openGameModal(url)`로 분기. 편집기 요일 슬롯 라벨 "영상 URL (Vimeo·YouTube) 또는 게임 URL", placeholder에 게임 예시.
- [ ] **Step 4:** 신규 2개 + 기존 게임 모달 테스트 2개 PASS. `npm.cmd run check`.
- [ ] **Step 5:** 커밋 `feat: weekday slots open game URLs in the game modal`.

### Task 1.3: 학생 페이지 — 요일 게임 슬롯은 "Let's play!"

**Files:**

- Modify: `play.js` `resolvePlayback()`
- Test: `tests/play.spec.js` "play: resolvePlayback strategies" 확장 + "play: game slot navigates on tap"와 같은 형태의 요일 케이스 1개

- [ ] **Step 1:** `resolvePlayback("https://book-english-games.vercel.app/play/x", "video")` → `{ type: "game", url }` 기대. 픽스처 `videos["w1-Mon"]`을 게임 URL로 두고 `/play.html?l=b&m=3&s=w1-mon` 진입 → `#playGame` visible, 탭 → `page.url()`이 게임 URL(기존 게임 테스트와 같은 route 스텁).
- [ ] **Step 2:** 실행 → FAIL(`type: "frame"`).
- [ ] **Step 3:** `resolvePlayback`에서 `parsed.kind === "game"` → `{ type: "game", url: parsed.url }`.
- [ ] **Step 4:** PASS. `npm.cmd run qa` 전체(Vite 종료 후) 통과 확인 → Phase 1 배포 가능.
- [ ] **Step 5:** 커밋 `feat: student page offers game for weekday game URLs`. `PROJECT_MEMORY.md` In-progress 갱신.

**Phase 1 수용 기준:** 관리자가 요일 슬롯에 `book-english-games.vercel.app` URL 저장 → 선생님 사이트 클릭 시
툴바 Game과 같은 모달 / 학생 페이지에서는 "Let's play!" → 직접 이동. 영상 URL 동작 무변경. `qa` 전부 통과.

---

## Phase 2 — 교재 상수 · 표지 정적화 · 학생 페이지 재구축 · CSV 70행 (배포 가능: Task 2.8 끝에서)

의존: Phase 1(게임 분류). 추정 3~4일. **Task 2.1~2.4는 선생님 사이트만 건드리므로 각각 단독 배포 가능**(페이지2
무변경 증명 포함). 2.5~2.8은 학생 페이지를 새 스킴으로 바꾸므로 **한 번에 배포**(기존 요일 QR은 미등록이라
전환 비용 없음).

### Task 2.1: `BOOK_LAYOUT` 상수와 교재 헬퍼 (1~2h)

**Files:**

- Modify: `video-source.js` (`BOOK_LAYOUT`, `bookLayout`, `bookEntry`, `bookSlotKeys`, `bookToolbarButtons`, `levelFromQrCode` 별칭 `1~3`, `qrPath(level, month, book)`로 시그니처 변경, `bookQrName`)
- Modify: `eslint.config.mjs`
- Test: `tests/play.spec.js` 재선언 테스트 확장(순수 함수 단언)

**Interfaces:**

- Produces: `bookLayout(level) → [{book, weeks, toolbar, cover}]`, `bookEntry(level, book) → entry|null`,
  `bookSlotKeys(level, book) → string[]`(툴바 순서 + `w<n>-<Day>`), `bookToolbarButtons(level, book) → TOOLBAR_BUTTONS 항목[]`,
  `qrPath(level, month, book) → "/q/<lv>/<n>/<book>"`, `bookQrName(level, month, book) → "L1-03-2"`,
  `levelFromQrCode("1") → "Level 2"`.

- [ ] **Step 1:** 단언 추가: `bookSlotKeys("Level 2", 2)` 길이 14·첫 4개 `["opening","ending","game2","song2"]`·5번째 `"w3-Mon"`; `bookSlotKeys("Level 1", 1)` 24; `bookEntry("Level 1", 2) === null`; `qrPath("Level 3","March",2) === "/q/l2/3/2"`; `levelFromQrCode("l1") === levelFromQrCode("1")`; `bookQrName("Level 1","March",1) === "B-03-1"`.
- [ ] **Step 2:** FAIL(미정의).
- [ ] **Step 3:** 구현(스펙 §2.1 상수 그대로). 기존 `qrPath(level, month, slot)`는 `play.js slotAddress`·`make-qr-list.mjs`가 아직 쓰므로 **남겨 두고**, 교재용은 새 이름 `bookQrPath(level, month, book)`로 추가한다. Task 2.5에서 호출처를 바꾼 뒤 `qrPath`·`slotToQr`·`slotFromQr`를 제거한다(이 플랜의 `qrPath(level, month, book)` 표기는 `bookQrPath`로 읽는다).
- [ ] **Step 4:** PASS, `npm.cmd run check`.
- [ ] **Step 5:** 커밋 `feat: book layout constants and book-level QR path`.

### Task 2.2: 페이지2 픽셀 기준선 (1h) — 추출 **전** 커밋에서

**Files:**

- Create: `tests/board-visual.spec.js`
- Create: `tests/board-visual.spec.js-snapshots/*.png` (Playwright가 생성)

- [ ] **Step 1:** `test.describe("페이지2 visual")`: 4 레벨 × 뷰포트 {375×812, 812×375, 768×1024, 1366×900} = 16장 + 홈·월그리드·관리자 보드(로그인 없이 `renderAdminBoard`는 불가 → 관리자 보드는 제외, 대신 `#monthScreen` 1장·홈 1장). REST 픽스처(표지 = Storage 스텁 URL, labels 교재 제목), Storage 스텁, `document.fonts.ready` 대기, `animations: "disabled"`, `toHaveScreenshot({ maxDiffPixels: 0 })`. 데스크톱 프로젝트에서만.
- [ ] **Step 2:** `--update-snapshots`로 기준선 생성, 두 번째 실행 PASS(안정성 확인, 3회 반복).
- [ ] **Step 3:** 커밋 `test: page2 visual baseline before board extraction`.

### Task 2.3: `board-view.js` DOM 빌더 추출 (2h)

**Files:**

- Create: `board-view.js` (classic script; `ICON_SVGS`, `buildToolbarButton(item, label, { active })`, `buildCoverCard(bookIndex, title)`, `buildWeekRow(weekNumber, bookTitle)` → `{ label, buttons }`)
- Modify: `app.js` (`ICON_SVGS` 삭제, `renderContentToolbar`·`renderLessons`가 빌더 호출), `index.html`(스크립트 태그 `video-source.js` 다음), `package.json`(lint·format 대상), `scripts/check-assets-case.mjs`(scannedFiles), `eslint.config.mjs`(새 파일 블록 + `app.js` globals)
- Test: `tests/play.spec.js` 재선언 테스트에 `typeof buildToolbarButton === "function"` 추가

**Interfaces:**

- Produces: 위 세 빌더. 마크업은 현행 `renderContentToolbar`(`button.content-type[data-slot][data-kind] > span.content-type-icon + span.content-type-label (+ span.content-type-tag)`)·`renderLessons`(`div.book-title-card.book-N[role=img]`, `div.week-label > span.wk-text`, `button.lesson-button.day-N[data-slot][data-vp-title] > strong`)과 **문자 단위로 동일**.

- [ ] **Step 1:** 재선언 테스트 단언 추가 → FAIL.
- [ ] **Step 2:** 빌더 작성, `app.js` 두 함수를 빌더 호출로 교체(이벤트 위임은 그대로 `lessonGrid`·`contentToolbar`).
- [ ] **Step 3:** `tests/board-visual.spec.js` 16장 PASS(마크업 동일 증명) + smoke 툴바 테스트 7개 PASS + `check`.
- [ ] **Step 4:** 커밋 `refactor: share page2 board DOM builders (board-view.js)`.

### Task 2.4: `board.css` 물리 추출 (3~4h)

**Files:**

- Create: `board.css`
- Modify: `styles.css`(규칙 **이동**, 복사 금지), `index.html`(`board.css`를 `styles.css` 앞에), `package.json`·`check-assets-case.mjs`(대상 추가)

- [ ] **Step 1:** 이동 대상 목록을 먼저 적는다: `:root` 폰트·반경 토큰 중 보드가 쓰는 것, `.level-theme-1..4` 변수 블록, `.section-box/.section-inner/.section-blue`, `.content-level-banner*`, `.content-v2-month-pill`, `.content-main-header`·`.content-v2-title-block`·`.content-v2-level`(Back/Next 버튼 규칙은 남김), `#contentScreen .content-toolbar*`, `.content-type*`, `.content-toolbar--wide`, `.lesson-board`, `.lesson-grid`, `.book-title-card*`, `.week-label*`, `.lesson-button*`, 이들이 들어 있는 모든 `@media` 블록의 해당 부분, `font-style: normal` 전역 규칙. 원본 순서를 유지한 채 잘라 붙인다.
- [ ] **Step 2:** `tests/board-visual.spec.js` 실행 → 차이가 있으면 **순서 문제**로 보고 이동 단위를 되돌리며 범인을 찾는다(NOTES에 기록). 16장 + 홈·월그리드 PASS가 완료 조건. `maxDiffPixels` 완화 금지.
- [ ] **Step 3:** `npm.cmd run qa` 전체 PASS.
- [ ] **Step 4:** 커밋 `refactor: extract page2 board styles into board.css`. NOTES에 "board.css는 styles.css보다 먼저 로드, 보드 규칙은 board.css에만" 추가.

### Task 2.5: 라우트·CSV·테스트를 교재 단위로 (2h)

**Files:**

- Modify: `play.js` `parsePlayRoute`(3번째 토큰 = book, `?b=`), `slotAddress` 제거(주소 고정), `?solo` 제거
- Modify: `scripts/make-qr-list.mjs`(전 레벨 70행, 열 `qr_name, level, month, book, title, student_url, cover_file, filled_slots`, 기본 `--out qr/qr-list.csv`, `--host` 기본값 `https://play.tps-education.com`)
- Modify: `tests/qr-list.spec.js`(70행, 첫 행 `B-03-1,Beginner,3,1,…,https://play.tps-education.com/q/b/3/1,…`, 마지막 `L3-12-2`), `tests/play.spec.js` "route variants"·"invalid route"(요일 토큰·Beginner book 2·`b=0` → invalid)

**Interfaces:**

- Produces: `parsePlayRoute(pathname, search) → { level, month, book } | null`.

- [ ] **Step 1:** 테스트 수정 → FAIL.
- [ ] **Step 2:** 구현. `qr/README-naver-qr.txt` 메모를 70개·교재 기준으로 갱신(스크립트가 생성).
- [ ] **Step 3:** `node scripts/make-qr-list.mjs --offline --out <scratch>` 70행 확인, 테스트 PASS.
- [ ] **Step 4:** 커밋 `feat: book-level QR routes and 70-row Naver list`.

### Task 2.6: 학생 페이지 보드 + 재생 오버레이 (6~8h, 2 커밋)

**Files:**

- Modify: `play.html`(브랜드 헤더 + `#contentScreen` 동일 마크업 + 저작권 푸터 + `#playOverlay`(기존 `#playStage`·카드·종료 오버레이 포함)), `play.css`(보드 토큰은 `board.css`로 → `play.css`는 헤더·푸터·오버레이만), `play.js`(교재 렌더 `renderBook()`, `openOverlay(slot)`/`closeOverlay()`, `nextFilledSlot`을 `bookSlotKeys` 범위로, `history.pushState`로 뒤로가기 닫기), `eslint.config.mjs`(play.js globals에 board-view 이름)
- Test: `tests/play.spec.js` 전면 갱신(§5), `tests/board-visual.spec.js`에 학생 페이지 4장(Beginner 1권·Level 2 교재1·교재2, 375×812·1366×900)

**Interfaces:**

- Consumes: `bookEntry`, `bookSlotKeys`, `bookToolbarButtons`, `buildToolbarButton`, `buildCoverCard`, `buildWeekRow`, `coverAssetPath`(Task 2.7 — 이 Task에서는 빈 문자열 반환 스텁으로 시작).

- [ ] **Step 1 (보드):** 테스트 "book page renders only that book": `/play.html?l=l1&m=3&b=2` → 툴바 4버튼 순서 `opening ending game2 song2`, `.lesson-button` 10개(`w3-Mon`…`w4-Fri`), `.week-label` 텍스트 `3`·`4`, `.book-title-card` 1개, `w1-Mon` 버튼 없음, 링크(`a[href]`) 0개, 레벨 내비 없음. Beginner `b=1` → 4버튼 + 20개. 라벨은 픽스처 `labels.game2`.
- [ ] **Step 2:** FAIL → `renderBook()` 구현(마크업은 빌더로, id·클래스 선생님과 동일) → PASS.
- [ ] **Step 3 (오버레이):** 기존 플레이어 테스트를 "요일 버튼 탭 → `#playOverlay` visible → 즉시 마운트" 흐름으로 바꾼다. 추가: ✕·Esc·`history.back()`으로 닫힘·플레이어 teardown, Next는 같은 교재 안에서만(교재1 마지막 `w2-Fri` 다음은 Next 없음), 빈 슬롯 탭 → Coming soon 카드가 오버레이 안에, 게임 → "Let's play!" 카드. iPhone 3개·레이어 2개·전체화면 5개 테스트 유지.
- [ ] **Step 4:** PASS, 학생 페이지 스냅샷 4장 생성. `check` 통과.
- [ ] **Step 5:** 커밋 2개 `feat: student page renders one book like page2`, `feat: student player becomes an overlay`.

### Task 2.7: 표지 정적 자산 (2h + 승인 대기)

**Files:**

- Create: `scripts/sync-covers.mjs`(REST 1회 → 다운로드 → `assets/covers/<level-slug>/<month-slug>/book-<n>.<ext>` + `qr/covers-manifest.json`, `--only`, `--dry-run`)
- Modify: `video-source.js` `coverAssetPath(level, month, book)`(`slugify`를 `app.js`에서 이동), `play.js`(표지 적용, 없으면 자리표시자), `package.json`(`covers:sync`), `app.js` 관리자 표지 카드 힌트 1줄
- Test: `tests/covers.spec.js`(Node: `BOOK_LAYOUT` 전 조합 70개 파일 존재·소문자·≤300 KB), `tests/play.spec.js` 가드 "no Storage request"에 표지 포함 확인

- [ ] **Step 1:** `tests/covers.spec.js` 작성 → FAIL(파일 없음). `coverAssetPath("Level 3","March",2) === "assets/covers/level-3/march/book-2.jpg"` 단언.
- [ ] **Step 2:** 스크립트 작성, `--dry-run`으로 목록·바이트 합계 출력(REST만). **사용자에게 다운로드 승인 요청**(예상 5~8 MB, Storage 1회).
- [ ] **Step 3:** 승인 후 실행 → 70개 파일. 확장자가 JPEG가 아니면 `coverAssetPath` 규칙을 실제 타입으로 고정하고 테스트 갱신.
- [ ] **Step 4:** `covers.spec` PASS, `check:assets` PASS, 학생 페이지 스냅샷 4장 갱신(표지 있는 버전).
- [ ] **Step 5:** 커밋 `feat: static book covers for the student page` (+ 자산). NOTES에 교체 절차 기록.

### Task 2.8: 통합 검증·문서·배포 준비 (2h)

- [ ] **Step 1:** `npm.cmd run qa` 전체 PASS(Vite 종료 후). 실패 시 수정 후 재실행.
- [ ] **Step 2:** 로컬 Vite에서 수동 확인: `/play.html?l=b&m=3&b=1`, `?l=l2&m=3&b=2`, 375×812·812×375(DevTools), 요일 탭 → 오버레이 → 재생(YouTube 픽스처 아님, `craDevLive(true)`는 사용자 승인 시에만).
- [ ] **Step 3:** 문서: `NOTES.md`("교재 토큰 = 인쇄물 계약", board.css 순서, 표지 sync), `PROJECT_MEMORY.md`(상태·QR 70), `PRODUCT_SPEC.md`(학생 페이지 항목), `qr/README-naver-qr.txt`.
- [ ] **Step 4:** 사용자 요청 시 커밋·푸시 → 배포 후 curl: `/q/b/3/1` 200·noindex, `/q/b/3/w1-mon` 200(invalid 카드), `/q/l2/3/2` 200, `/assets/covers/level-3/march/book-2.jpg` 200, play 호스트 `/` → 307 `/q`. 아이폰·안드로이드 실기기 1회(교재1 요일 → Vimeo iOS 전체화면).

**Phase 2 수용 기준:** 70개 CSV, 학생 페이지가 교재 1권만 보여 주고 페이지2 스냅샷과 같은 CSS/마크업, Storage 0,
REST 1, 다른 교재·월·레벨로 가는 UI 없음, 페이지2·홈·월그리드 픽셀 무변경, `qa` 전부 통과.

---

## Phase 3 — R5 LMS (3.1·3.2 세부화 `2026-10-23`, 3.3~3.5는 상위 단계만)

의존: 없음(Phase 2와 독립, 단 같은 `app.js`를 고치므로 Phase 2 뒤에 착수). 추정 5~7일. 배포 가능: 3.2까지는
기존 로그인이 그대로 동작하므로 중간 배포 가능, 3.5 이후 구 RPC 제거. **3.1·3.2의 확정 결정은 지시서
`docs/worker-briefs/2026-10-23-phase3a-brief.md`(로컬) D5a~D15 — 스펙 §4.9에 요약.**

| 단계 | 내용                                                                                                                                                                       | 수용 기준                                                                 | 검증                                                                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 3.1  | SQL 1차(추가만): `branches`·본사 행, `members` 확장, `classes`·`class_members`·`lms_sessions`·`login_attempts`, `lms_member()`, `lms_login/session/logout`, 시도 제한, RLS | migration.sql 재실행 idempotent, 기존 로그인 RPC 그대로 동작, 흔적 0 검증 | PGlite `npm run test:sql` + 운영 SQL Editor `verify-3a.sql`(사용자) |
| 3.2  | 로그인 폼(지사 **자동 판별**, 복수 일치 시 지사 선택) + 세션 토큰 클라이언트 + grade 3 차단 제거                                                                           | 기존 회원 본사로 로그인, 관리자 `@` 경로 무변경, 잠금 메시지              | Playwright REST 픽스처                                              |
| 3.3  | 역할별 관리자 메뉴·가드(지사·반·회원 뷰), 동명이인 접미사 제안, 로그인 "잠금 해제"(최고관리자·지사, `login_attempts`)                                                      | §4.6 표대로 노출, 학생 `#admin` 차단                                      | Playwright + RLS 스크립트(승인 후)                                  |
| 3.4  | 엑셀 업로드(SheetJS, 미리보기, 1트랜잭션 RPC, 결과표), 템플릿 2종 파일                                                                                                     | 500행 한도, 전체 롤백, 결과표                                             | 픽스처 xlsx 3종(정상·중복·오류)                                     |
| 3.5  | SQL 2차(구 RPC 제거, pk 교체, `lms_probe_headers` 제거), 문서(`NOTES`, `SUPABASE_SETUP`), 보안 체크리스트(§4.8)                                                            | 구 RPC 호출 0                                                             | `qa` + 실계정 4종                                                   |

### Task 3.1: SQL 1차 — 추가만 (로컬 완료 `4356e19`, 운영 반영은 사용자)

**Files:**

- Modify: `supabase/migration.sql` — 끝의 "LMS (Phase 3A)" 블록(관리자 등록 안내 주석 앞). 위쪽 기존 부분은 무변경.
- Create: `supabase/lms/00-precheck.sql`(읽기 전용, 표 1개), `supabase/lms/verify-3a.sql`(anon + `x-lms-token`
  흉내, 전부 rollback, 표 1개), `supabase/lms/README.md`(실행 순서)
- Test: `tests/lms-sql.spec.js`(`npm run test:sql`), devDependency `@electric-sql/pglite`

**Interfaces (Produces — 3.2가 쓰는 것):**

- `rpc lms_login(p_login_id, p_password, p_branch_id?)` → 항상 jsonb, 예외 없음:
  `{status:'ok', token, role, branch_id, branch_name, display_name}` · `{status:'choose', branches:[{branch_id, branch_name}]}`
  (비밀번호가 맞은 뒤에만, 이름순) · `{status:'invalid'}` · `{status:'locked', retry_after_sec}`
- `rpc lms_session()`(헤더 `x-lms-token`) → `{role, branch_id, branch_name, display_name}` 또는 `null`, 만료 +30일
- `rpc lms_logout()` → 세션 행 삭제. `lms_member()` → RLS용 `(member_id, role, branch_id)`

- [x] **Step 1:** 로컬 검증 수단 — PGlite 0.5(Postgres 18 WASM + pgcrypto)에서 bcrypt·`normalize`·
      `set local role anon`·`request.headers` RLS 동작 확인. Docker·전역 설치 불필요.
- [x] **Step 2 (테스트 먼저):** `tests/lms-sql.spec.js` — Supabase 흉내(anon/authenticated, `extensions`·`auth`·
      `storage`, Supabase 기본 권한) → 구 스키마 + 구 회원 4명 → precheck → migration **2회**(member_id 불변) →
      D13 매핑 → `verify-3a.sql` 전 행 pass → 흔적 0 → 관리자 직접 쓰기(인덱스 식 권한) → 구·신 로그인.
- [x] **Step 3:** 블록 작성 → PASS. verify 93행 중 92 pass, 1 skip(로컬에 관리자 행 없음 → 운영에서 실행).
- [x] **Step 3b:** 독립 보안 검토(읽기 전용 에이전트) 반영 — 구 `verify_member_login` 잠금 공유·본사 한정, 아이디별
      직렬화, 공유 아이디 카운터 규칙, IPv6 /64, 비밀번호 변경 시 세션 삭제, 깨진 해시. 검증 케이스 먼저 추가(5건 FAIL
      확인, 수정 전 SQL에서는 깨진 해시가 검증 전체를 멈춤) → 수정 → 115행 중 114 pass, 1 skip, 흔적 0. 스펙 §4.9.
- [ ] **Step 4 (사용자):** `00-precheck.sql` 실행 → 표를 워커에게. 기대: pgcrypto `extensions`, normalize `true`,
      회원 1명(grade 3), 충돌 `0`. 다르면 멈춤.
- [ ] **Step 5 (사용자):** `migration.sql` 전체 실행 → `Success. No rows returned`.
- [ ] **Step 6 (워커):** anon 키로 `POST /rest/v1/rpc/lms_probe_headers` 3회 — ① 그대로,
      ② `X-Forwarded-For: 203.0.113.9` 추가, ③ `x-lms-token: probe-<랜덤>` 추가. 그리고 CORS 사전 요청 1회:
      `OPTIONS`에 `Origin` = 운영 사이트, `Access-Control-Request-Headers` = `x-lms-token,apikey,authorization`
      (허용 헤더에 `x-lms-token`이 있어야 브라우저가 보낼 수 있다). 위조 불가한 IP 헤더 판정 → 필요하면
      `lms_client_ip()` 패치 SQL 1개(사용자 실행).
- [ ] **Step 7 (사용자):** Logs → API에서 ③의 `probe-…` 검색 → 노출 여부 기록(`NOTES.md`).
- [ ] **Step 8 (사용자):** `verify-3a.sql` → 전 행 pass, `trace` 행 0. 결과 요약을 PROJECT_MEMORY에.

### Task 3.2: 로그인 클라이언트 (멈춤 1 승인 뒤, Task 3.1 Step 5 이후 푸시)

**Files:**

- Modify: `app.js` — 로그인 핸들러의 비-`@` 경로를 `lms_login`으로, 지사 선택 단계, 토큰 저장·클라이언트 헤더,
  페이지 로드 `lms_session`, 로그아웃 `lms_logout`, `cra_member` 삭제, `isBlockedByGrade`·`showNoAccessPopup`
  게이트 제거(D8a), `updateAdminUI`(LMS 사용자 = Log out만, D15). `index.html` — `#loginScreen` 안에 숨김
  지사 선택 영역(`#loginBranchChoice`, "Choose your branch" + 버튼 목록). `styles.css` — 지사 버튼(DESIGN.md 토큰).
- Test: `tests/lms-login.spec.js` 신규(REST 픽스처: `**/rest/v1/rpc/lms_login|lms_session|lms_logout`를
  `page.route`로 응답, 실제 호출 0), `tests/smoke.spec.js` "grade 3 sees the no-access popup…" → "student plays the
  weekday game"(차단 없음)으로 의미 변경.
- 스크린샷: `docs/screenshots/phase3/` 로그인 기본·choose·invalid·locked × 375×812·1366×900(8장).

**구현 메모:**

- 비밀번호는 choose 재호출 때문에 **변수에만** 보관(저장 금지), 성공·취소·화면 이탈 시 비운다.
- 토큰: `localStorage.cra_lms` = `{token, role, branch_name, display_name}`(표시용 캐시). 로드 때 `lms_session()` 1회 →
  `null`이면 키 삭제·비로그인. `cra_member`는 읽으면 삭제.
- 헤더: **PM 결정(멈춤 1) = fetch 래퍼.** 클라이언트 1개 + `global.fetch`가 Supabase REST(`/rest/v1/`) 요청에만
  현재 토큰을 `x-lms-token`으로 붙인다. 토큰 없으면 헤더 없음, 관리자 Auth 경로 무변경.
- 메시지: invalid "Please check your ID and password." / locked "Too many tries. Please try again in N minutes."
  (N = `ceil(retry_after_sec / 60)`). 클라이언트 형식 검사(`ACCOUNT_RE`)는 LMS 경로에서 뺀다(서버가 정규화,
  한글 아이디 허용 — D5a). 빈 칸만 막는다.

- [x] **Step 1 (테스트 먼저):** `tests/lms-login.spec.js` — ① ok → 홈, Log out 보임, Admin 숨김, `cra_lms` 저장
      ② choose → 지사 버튼 2개 → 선택 시 `p_branch_id` 포함 재호출 → ok ③ invalid 문구 ④ locked "N minutes"
      ⑤ 새로고침 → `lms_session` 1회 → 로그인 유지 ⑥ `lms_session` null → 키 삭제·비로그인 ⑦ Log out →
      `lms_logout` 호출·키 삭제 ⑧ 옛 `cra_member` 삭제 ⑨ `@` 아이디 → `auth/v1/token`만, `lms_login` 0회
      ⑩ 학생(role 3)으로 요일 슬롯 → 차단 팝업 없이 재생 ⑪ 로그인 후 REST 요청 헤더에 `x-lms-token`.
- [x] **Step 2:** FAIL 확인(11/12) → 구현 → PASS(12×3). 비로그인 로그인 화면은 변경 전 빌드와 로그인 카드 이미지·
      레이아웃 값 동일(375·1366).
- [x] **Step 3:** smoke의 grade 3 테스트 새 의미로 수정, `npm run check`.
- [ ] **Step 4:** Vite 종료 → `npm.cmd run qa` 전체 PASS → 스크린샷 8장 → 로컬 커밋.
- [ ] **Step 5 (멈춤 2):** 보고 — 운영 SQL(Task 3.1 Step 5) 실행 확인 전에는 푸시하지 않는다.

Phase 3 남은 결정: 3.2 헤더 방식(재생성 vs fetch 래퍼), 3.3 착수 전 pk 교체 시점(스펙 §4.9 위험 1).

---

## A — 레벨 표기 정리 (2026-10-29, 3A 운영 작업 보류 중 끼워 넣음)

설계·결정: `docs/superpowers/specs/2026-10-29-levels-teacher-resources-design.md`(멈춤 1 승인). 배포 가능: 단독, 단
**코드 푸시 → `supabase/levels/01-rename.sql`** 순서(사용자 실행).

- [x] 테스트 먼저: `tests/levels.spec.js`(LEVELS 표, QR 70개 URL·이름 고정, 표지 이동 해시, 옛 주소 이동, 호환 읽기·새 키
      우선, 관리자 쓰기·표지 경로, 배경 삭제 두 키, 학생 페이지 한 번 읽기), `tests/levels-sql.spec.js`(00·01 SQL) → RED 확인.
- [x] `video-source.js` `LEVELS` 한 곳 정의(키 `beginner`·`level-1..3`, `qr`, `legacy`) + `levelFromAny`·`levelDbKeys`·
      `levelThemeClass`. 화면 코드·CSS(`level-theme-<key>` 등 28곳)·`index.html` `data-level`·스크립트를 새 키로.
- [x] 표지 폴더 `assets/covers/level-1..4` → `beginner`, `level-1..3`(순서대로 `git mv`), 시드 `assets/l1-march-*` →
      `beginner-march-*`. `qr/qr-list.csv` 재생성(로컬): 70행 모두 `cover_file`만 바뀜, QR URL 동일.
- [x] 픽셀 기준선 그대로 통과(학생 Level 1 2장은 스텁을 PostgREST처럼 고친 뒤 **옛 코드로** 다시 찍음 — NOTES "레벨 키 정리").

### 백로그 — SQL 2 (Phase 3.5)에 합칠 것

- `supabase/levels/01-rename.sql`의 CHECK(`content_pages_level_key`, `page_backgrounds_level_key`)를 `migration.sql`로
  옮긴다(운영에서 01이 실행된 뒤에만 — 그 전에 넣으면 옛 키 행 때문에 실패).
- 옛 키 호환 읽기 삭제: `app.js` `rowsByNewKey`, `play.js` `level=in.(…)`, `background-editor.js` 두 키 삭제,
  `video-source.js` `levelDbKeys`(옛 북마크 주소 이동 `levelFromLegacy`는 남겨도 됨), 스크립트 2개의 옛 키 처리.
  `tests/board-visual.spec.js` 픽스처 행을 새 키로.

## B — 교사 자료실 (2026-10-29, Phase 4를 대체)

설계·결정: `docs/superpowers/specs/2026-10-29-levels-teacher-resources-design.md`. 레벨별 월 선택 페이지 제목 줄 오른쪽에
'교사 자료실'(관리자·LMS role 1·2만) → 그 레벨 자료페이지(= 월 페이지의 "자료 모드", 3~12월 버튼 자리에 다운로드 2~3개) →
비공개 Storage 버킷 `teacher-resources`(10MB, PDF·xlsx·xls)의 60초 서명 URL을 같은 탭에서 엶. 관리자 '배너' 탭에 10칸 업로드.

- [x] 테스트 먼저: `tests/teacher-resources-sql.spec.js`(버킷·표 직접 접근 차단·RPC 권한 5종 호출자·CHECK·Storage 정책·
      선생님 테스트 계정 SQL), `tests/teacher-resources.spec.js`(버튼 노출·로그인/로그아웃 즉시 반영·위치·자료페이지 4개·
      다운로드·실패 3종·권한 없는 직접 진입·토큰 범위·관리자 업로드/교체/삭제·10MB/형식 차단) → RED 확인.
- [x] SQL: `migration.sql` "Teacher resources" 블록(추가만, 재실행 안전). 운영 선생님 테스트 계정
      `supabase/lms/teacher-test-account.sql`(비밀번호는 자리표시자).
- [x] 클라이언트: `teacher-resources.js`(새 classic script), `app.js` 연결(화면·해시·`canSeeTeacherResources`·
      `craAuthReady`·`lmsFetch`가 서명 요청에만 토큰), `index.html`, `styles.css`.
- [x] 멈춤 3 PM 결정: 다운로드를 (나) Edge Function `teacher-resource-download`로(60초 서버 고정, `teacher_resource_issue`
      service role 전용), 하루 30회/LMS 회원(KST, 관리자 무제한, `teacher_resource_downloads`). 테스트:
      `tests/teacher-resource-download.spec.js`(함수, 가짜 fetch) + SQL·화면 테스트 갱신. 배포 절차 `supabase/functions/README.md`.
- [ ] 운영(사용자): 설계 문서 "최종 운영 순서"(3A → 3A만 푸시 → 테스트 계정 → 함수 배포 → 다운로드 확인 → A+B 푸시 →
      levels SQL → 파일 업로드·아이폰 확인·테스트 계정 삭제).

## Phase 4 — R4 '선생님자료실' 헤더 버튼 — **취소 (2026-10-29)**

> PM 결정: 위 **B — 교사 자료실**이 대체한다(헤더 알약 버튼·`site_settings.header_buttons`·관리자 "버튼" 탭은 만들지
> 않는다). 아래는 기록용으로 남긴다.

의존: Phase 3(역할 세션). 추정 1일. 배포 가능: 단독.

| 단계 | 내용                                                                                           | 수용 기준                                                   | 검증                     |
| ---- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------ |
| 4.1  | `site_settings.header_buttons` 읽기 + `renderHeaderButtons()`(Admin 왼쪽 알약, `minRole` 비교) | 익명·학생 DOM 미생성, 선생님 이상 표시, 새창 `rel=noopener` | Playwright 역할별 픽스처 |
| 4.2  | 관리자 "버튼" 탭(최고관리자): 라벨·URL·새창·표시·노출 등급·순서 편집, upsert 1회               | 저장 후 헤더 즉시 반영(관리자 미러)                         | Playwright + `check`     |
| 4.3  | 문서(NOTES 영어 UI 예외, PRODUCT_SPEC)                                                         |                                                             | `qa`                     |

---

## 전체 일정·배포 요약

| Phase | 추정  | 배포 단위                      | 선행                    |
| ----- | ----- | ------------------------------ | ----------------------- |
| 1     | 3~4h  | 단독                           | —                       |
| 2     | 3~4일 | 2.1~2.4 각각 / 2.5~2.8 한 번에 | Phase 1                 |
| 3     | 5~7일 | 3.1~3.2 / 3.3~3.4 / 3.5        | Phase 2(코드 충돌 회피) |
| 4     | —     | **취소** → B 교사 자료실       | —                       |
