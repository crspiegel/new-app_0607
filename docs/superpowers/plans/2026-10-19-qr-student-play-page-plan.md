# Beginner QR 학생용 영상 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QR(네이버) → `/q/<lv>/<month>/<slot>` 학생 전용 페이지에서 그 슬롯의 영상(또는 게임)만
재생하고, 아래에 같은 레벨·월 목록을 보여 준다.

**Architecture:** 정적 페이지 `play.html` + classic script `play.js`/`play.css`. 레벨·슬롯 데이터와
URL 파서는 `app.js`에서 `video-source.js`로 **옮겨** 두 페이지가 같이 로드한다. 데이터는 Supabase
REST 1행을 `fetch`로 읽고(supabase-js 없음, Storage 0), 도메인 잠금 Vimeo는 `PUBLISHER_STRATEGY`
상수로 재생 방식을 고른다(기본 `"page"`).

**Tech Stack:** Vanilla JS(classic script, 빌드 없음) · Supabase REST · YouTube IFrame API · Vimeo
Player SDK · Vercel `rewrites` · Playwright(`tests/play.spec.js`) · Vite(dev 전용)

**Spec:** `docs/superpowers/specs/2026-10-19-qr-student-play-page-design.md`

## Global Constraints

- Windows PowerShell에서는 `npm.cmd`. 검증 = `npm.cmd run check`(Stop 훅 자동) + 커밋 전 `npm.cmd run qa`.
  `qa` 전 `npm.cmd run dev` 종료(5173 포트 하드코딩).
- **커밋·푸시는 사용자가 요청할 때만**(push = 운영 배포). 아래 "Commit" 단계는 사용자 승인 시에만 실행하고,
  메시지는 Git Bash heredoc `git commit -F - <<'MSG'`(NOTES: PS 5.1 따옴표 함정).
- 빌드 없음: `vite build` 금지, `vercel.json`의 `framework:null`/`buildCommand:null`/`outputDirectory:"."` 유지.
- 학생 UI는 영어, 이탤릭 금지, 터치 타깃 ≥56px, 색은 `DESIGN.md` L1 토큰(`--level-accent #ffc800`,
  `--level-accent-shadow #d49a00`, `--level-accent-soft #fff3cc`, `--content-day-bg #ffd43b`,
  `--content-day-shadow #c78f00`, `--content-day-text #8a6400`, `--content-week-tint #ffe9a8`),
  폰트 Fredoka(제목)/Nunito(본문)/Sniglet(레벨명)/Manrope 800(월 숫자).
- 학생 페이지: Storage 요청 0, `content_pages` 요청은 페이지 로드당 1회, 메인 사이트·다른 레벨 링크 없음,
  로그인·grade 게이트 미적용.
- 슬롯 키(`opening`,`ending`,`game`,`unit`,`game2`,`song1`,`song2`,`w1-Mon`…`w4-Fri`)는 인쇄물 계약 — 이름 변경 금지.
- `play.html`의 모든 자산 경로는 절대경로(`/play.js`, `/video-source.js`, `/supabase-config.js`, `/play.css`).
- YouTube `playerVars`는 `app.js`와 같게(`controls:0, rel:0, modestbranding:1, playsinline:1, fs:0,
disablekb:1, iv_load_policy:3, cc_load_policy:0`), `disableYouTubeCaptions`는 `onReady`·PLAYING·`onApiChange` 3곳.
- 영상 자동재생 금지 — ▶ 탭(또는 목록 탭) 후에만 플레이어를 만든다.

## Review Focus

1. **경로 변형** — `/q/b/3/W1-MON`, 끝 슬래시 `/q/b/3/w1-mon/`, 월 `03` → 모두 정상 해석. (Task 2 테스트)
2. **행은 있는데 슬롯이 공백 문자열** `"  "` → 오류가 아니라 Coming soon. (Task 2 테스트)
3. **REST 200 + 빈 배열**(그 월 행 없음) → 오류가 아니라 Coming soon, 목록은 전부 Soon. (Task 2 테스트)
4. **표시 Level 1~3 코드 `l1`** → 툴바 6 + 요일 20 = 26개 목록, Beginner 전용 가정 없음. (Task 3 테스트)
5. **마지막 채워진 슬롯에서 영상 종료** → [Next] 숨김(빈 슬롯으로 넘어가지 않음). (Task 3 테스트)

---

## 선행 (사용자 작업 — 코드 아님, Task 2와 병행 가능)

- [ ] **①안 실측:** TPS 호스트코코아 DNS에 테스트 CNAME(예: `qrtest.tps-education.com`) → 별도 임시 Vercel
      프로젝트(운영 저장소 아님)에 준비된 테스트 페이지 배포 → 데스크톱·아이폰·안드로이드에서 3개 영상
      (`/58`·`/60`·`/61` 대표 id) 재생 여부 기록. 결과로 `PUBLISHER_STRATEGY` 결정.
- [ ] **②안 확인:** TPS 아임웹 관리자에서 헤더·푸터 없는 빈 페이지 + 코드 위젯이 가능한지(현재 `/58`에
      `?video=` 스크립트가 이미 있음). 가능하면 그 페이지 주소를 `PUBLISHER_PLAYER_URL`로.
- [ ] 설계 §9 질문 6개 답변.

---

### Task 1: `video-source.js` 추출 (P1 — 동작 변경 없음)

**Files:**

- Create: `video-source.js`
- Modify: `app.js:6-26`(months·lessonTypes·weekdays), `app.js:67-137`(LEVEL_LABELS·levelLabel·TOOLBAR_BUTTONS·toolbarButtons), `app.js:904-939`(YT_ID_RE·parseVideoSource·isExternalVideoPage), `app.js:1273-1287`(disableYouTubeCaptions), `app.js:237` 주석 "22 per page" → "24 (Beginner) / 26 (Level 1-3)"
- Modify: `index.html:1638` 앞에 `<script src="video-source.js"></script>`
- Modify: `eslint.config.mjs`, `package.json`(`lint`·`format:check`에 `video-source.js`)
- Test: `tests/play.spec.js`(신규 — 이 태스크는 첫 스펙만)

**Interfaces:**

- Produces (전역, classic script): 옮긴 이름 그대로 + 신규
  - `weekdaySlotKeys(): string[]` → `["w1-Mon", …, "w4-Fri"]` (20개, 주 우선)
  - `allSlotKeys(level: string): string[]` → `toolbarButtons(level).map(b=>b.slot)` + `weekdaySlotKeys()`
  - `publisherVimeoId(url: string): number|null` — 호스트가 `tps-education.com` 또는 그 하위이고 `video` 쿼리가 `^\d+$`이면 숫자, 아니면 `null`
  - `qrLevelCode(level): "b"|"l1"|"l2"|"l3"|null` / `levelFromQrCode(code): "Level 1".."Level 4"|null`(대소문자 무시)
  - `slotToQr(slot): string`(소문자) / `slotFromQr(token, level): string|null`(`allSlotKeys(level)`에서 대소문자 무시 일치)
  - `monthNumber(month): 3..12|null` / `monthFromNumber(n: number|string): string|null`(`"03"` 허용)
  - `qrPath(level, month, slot): string` → 예 `"/q/b/3/w1-mon"`

- [ ] **Step 1: 실패 테스트 작성** — `tests/play.spec.js`에 `"video-source.js loads before app.js without redeclaration"`:
      `/` 로드, `pageerror` 0건, `page.evaluate`로 `typeof publisherVimeoId === "function"`,
      `publisherVimeoId("https://tps-education.com/58?video=173725167") === 173725167`,
      `publisherVimeoId("https://www.tps-education.com/60?video=173728500") === 173728500`,
      `publisherVimeoId("https://youtu.be/tHybl0l9tbQ") === null`, `publisherVimeoId("https://example.com/?video=1") === null`,
      `allSlotKeys("Level 1").length === 24`, `allSlotKeys("Level 2").length === 26`,
      `qrPath("Level 1","March","w1-Mon") === "/q/b/3/w1-mon"`, `slotFromQr("W4-FRI","Level 1") === "w4-Fri"`,
      `slotFromQr("song1","Level 1") === null`, `monthFromNumber("03") === "March"`, `monthFromNumber(13) === null`,
      `window.craVideo.parseVideoSource === parseVideoSource`. 기존 `smoke.spec.js`의 `beforeEach`(dev-live + Storage 스텁)를 이 파일에도 둔다.
- [ ] **Step 2: 실패 확인** — `npx.cmd playwright test tests/play.spec.js --project=desktop` (dev 서버 따로 띄움) → FAIL `publisherVimeoId is not defined`
- [ ] **Step 3: 구현** — 선언을 `video-source.js`로 **잘라 옮기고**(`app.js`에 남기면 redeclaration으로 사이트 전체 정지), 신규 함수 추가. eslint: `video-source.js`·`play.js`를 `sourceType:"script"` 블록에, 옮긴 이름을 `app.js`·`background-editor.js`·`hero-banner.js` globals에 추가.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, 그리고 `npm.cmd run qa` → 기존 126 + 신규 통과(실패 0)
- [ ] **Step 5: 수동 회귀** — `npm.cmd run dev` + `craDevLive(true)`로 Beginner/March 페이지2에서 요일·툴바 버튼이 예전처럼 열림(영상 1개, 게임 1개, Coming soon 1개) 확인 후 `craDevLive(false)`
- [ ] **Step 6: Commit (사용자 승인 시)** — `refactor: 레벨·슬롯 데이터와 영상 파서를 video-source.js로 분리`

### Task 2: 학생 페이지 코어 (P2 — 라우트·REST·상태·플레이어)

**Files:**

- Create: `play.html`, `play.js`, `play.css`
- Modify: `package.json`(lint/format 대상에 `play.js play.html play.css`), `scripts/check-assets-case.mjs`(`scannedFiles`에 `play.html`,`play.css`,`play.js`)
- Test: `tests/play.spec.js`

**Interfaces:**

- Consumes: Task 1 전역 전부, `supabase-config.js`의 `window.SUPABASE_URL`/`window.SUPABASE_ANON_KEY`
- Produces (`play.js`, `window.craPlay`로 노출):
  - `parsePlayRoute(pathname: string, search: string): {level, month, slot, solo: boolean}|null` — `/q/<lv>/<m>/<slot>`(끝 슬래시 허용) 우선, 없으면 `?l=&m=&s=`; `solo`는 `?solo=1`
  - `fetchPageRow(level, month): Promise<{videos: object, labels: object}|null>` — `GET {SUPABASE_URL}/rest/v1/content_pages?level=eq.<enc>&month=eq.<enc>&select=videos,labels`, 헤더 `apikey`·`Authorization: Bearer`; 빈 배열 → `null`; HTTP 오류·네트워크 오류·URL/키 없음 → throw
  - `resolvePlayback(url: string, kind: "video"|"game", strategy): {type:"youtube",id}|{type:"vimeo",id?,url?}|{type:"frame",url}|{type:"game",url}|null`
  - 상수 `PUBLISHER_STRATEGY = "page"`(허용값 `"page"|"direct"|"player-page"`), `PUBLISHER_PLAYER_URL = ""`(②안 확정 시 채움; 비어 있으면 `"player-page"`는 `"page"`로 동작)
  - DOM 계약: `<main id="play" data-state="loading|ready|playing|ended|empty|error|invalid">`, `#playLevel`, `#playMonth`, `#playTitle`, `#playStage`, `#playFrame`, `#playStart`(▶), `#playRetry`, `#playGame`
  - 문구(고정): invalid `"Oops! This code doesn't work."` · error `"Can't load right now."` + 버튼 `"Try again"` · empty `"Coming soon!"` + `"This video isn't ready yet. Check back soon!"` · game 버튼 `"Let's play!"`
  - 제목: 요일 = `slotLabel`과 같은 `"Week 1 · Mon · Opening Song"`, 툴바 = `labels[slot]` 있으면 그것, 없으면 `TOOLBAR_BUTTONS` 기본 라벨

테스트 공통: `page.route("**/rest/v1/content_pages*", …)`로 픽스처 응답(REST egress 0 — 설계 §11). 픽스처는 2026-10-19 March 행 모양(`opening`·`ending`·`game` 채움, `unit` 없음, `w1-Mon`=`https://tps-education.com/58?video=173725167`, `w1-Tue`=`https://youtu.be/LPl2AR2rm0g`, 나머지 요일 일부 채움) + `w2-Tue: "  "`. 게임 호스트는 `route.fulfill`로 빈 HTML.

- [ ] **Step 1: 실패 테스트 작성** (`tests/play.spec.js`):
  - `"play: weekday route shows title and tap-to-play"` — `/play.html?l=b&m=3&s=w1-mon` → `data-state=ready`, `#playLevel` "Beginner", `#playMonth` "3", `#playTitle` "Week 1 · Mon · Opening Song", `#playStart` 보임, `#playFrame iframe` 0개(탭 전 마운트 없음); `#playStart` 클릭 → `#playFrame iframe` 1개, `src`가 `https://tps-education.com/58?video=173725167`(기본 전략 `"page"`)
  - `"play: route variants"` — `?l=B&m=03&s=W1-MON`과 `/play.html?l=b&m=3&s=w1-mon`가 같은 제목; `parsePlayRoute("/q/b/3/w1-mon/","")` → `{level:"Level 1",month:"March",slot:"w1-Mon",solo:false}`
  - `"play: invalid route"` — `?l=x&m=3&s=w1-mon`, `?l=b&m=2&s=w1-mon`, `?l=b&m=3&s=w5-mon` 각각 `data-state=invalid` + 문구, 페이지 내 `a[href]` 0개, `content_pages` 요청 0
  - `"play: empty, whitespace and missing row are coming soon"` — `s=unit`, `s=w2-tue`(`"  "`), 그리고 REST가 `[]`일 때 `s=w1-mon` → 모두 `data-state=empty` + "Coming soon!"
  - `"play: REST failure shows retry"` — REST `402` → `data-state=error`, "Try again" 클릭 → `content_pages` 요청 2회째, 픽스처로 바꾼 뒤 `ready`
  - `"play: game slot navigates on tap"` — `s=game` → `#playGame` "Let's play!", 클릭 후 `page.url()` === `https://book-english-games.vercel.app/play/the-tractor`
  - `"play: resolvePlayback strategies"` — evaluate: tps URL + `"page"` → `{type:"frame",url:<원본>}`; + `"direct"` → `{type:"vimeo",id:173725167}`; + `"player-page"`(PLAYER_URL 비어 있음) → `"page"`와 같음; `youtu.be/LPl2AR2rm0g` → `{type:"youtube",id:"LPl2AR2rm0g"}`; `"12345"` → `{type:"vimeo",id:12345}`; 게임 URL + `"game"` → `{type:"game"}`; `""` → `null`
  - `"play: cost guard"` — 위 시나리오 중 하나에서 Storage URL 요청 0, `content_pages` 요청 정확히 1
  - `"play: offline by default on localhost"` — dev-live 플래그 없이(별도 `test.describe`에서 initScript 미적용) `*.supabase.co` 요청 0, `data-state=error`
- [ ] **Step 2: 실패 확인** — `npx.cmd playwright test tests/play.spec.js` → 신규 스펙 FAIL(404 `play.html`)
- [ ] **Step 3: 구현** — `play.html`: `<head>`에 `index.html`과 같은 Google Fonts 링크 중 Fredoka·Nunito·Sniglet·Manrope만, `/play.css`; 본문 끝에 `/video-source.js` → `/supabase-config.js` → `/play.js`(Vimeo SDK는 `"direct"` 전략일 때만 `play.js`가 동적 로드, YouTube API도 첫 재생 때 동적 로드). `play.css`는 `styles.css`를 로드하지 않고 필요한 토큰만 `:root`에 복제(출처 주석), `* { font-style: normal !important; font-synthesis: none; }`, 16:9 스테이지, ▶ 오버레이 지름 ≥96px. 마운트는 `play.js` 전용 함수(모달 코드 재사용 안 함).
- [ ] **Step 4: 통과 확인** — `npx.cmd playwright test tests/play.spec.js` PASS(3 프로젝트), `npm.cmd run check` PASS
- [ ] **Step 5: 스크린샷 확인** — 375×812·768×1024·1366×900에서 ready/empty/error 상태 캡처, 이탤릭·가로 스크롤 없음 확인(임시 `_*.png`는 확인 후 삭제)
- [ ] **Step 6: Commit (사용자 승인 시)** — `feat: QR 학생용 영상 페이지(play.html) 코어`

### Task 3: 목록(B) · solo(A) · 종료 오버레이 (P3)

**Files:**

- Modify: `play.html`, `play.js`, `play.css`
- Test: `tests/play.spec.js`

**Interfaces:**

- Consumes: Task 2 `parsePlayRoute`, 캐시된 행, `allSlotKeys`, `qrPath`
- Produces: `#playList` 안 `.play-item[data-slot]`(툴바 먼저, 이어서 주차별 5개 × 4줄), 현재 항목 `aria-current="true"`, 빈 항목 `.is-empty` + 텍스트 "Soon"; 종료 오버레이 `#playEnd` 안 `#playAgain`("Watch again"), `#playNext`("Next")
- `nextFilledSlot(row, level, slot): string|null` — `allSlotKeys` 순서에서 뒤쪽 첫 비어 있지 않은 **video** 슬롯(게임 제외)

- [ ] **Step 1: 실패 테스트 작성**:
  - `"play list: 24 items for Beginner, current highlighted"` — `?l=b&m=3&s=w1-tue` → `.play-item` 24개, `[data-slot="w1-Tue"]`만 `aria-current="true"`, 빈 슬롯(`unit`)은 `.is-empty`
  - `"play list: 26 items for Level 1-3 code"` — `?l=l1&m=3&s=w1-mon`(픽스처 level 무관 응답) → `.play-item` 26개
  - `"play list: switching reuses the row"` — `w1-Mon` → `[data-slot="w2-Mon"]` 클릭 → 제목 "Week 2 · Mon · Opening Song", URL 쿼리/경로 `w2-mon`, `content_pages` 요청 총 1회, 클릭이 제스처이므로 바로 `#playFrame iframe` 1개
  - `"play list: empty item shows coming soon without leaving"` — `.is-empty` 클릭 → "Coming soon!" 카드, 목록 유지
  - `"play solo mode hides the list"` — `&solo=1` → `#playList` 숨김(`toBeHidden`)
  - `"play end overlay: next only when a filled slot follows"` — evaluate로 `nextFilledSlot` 단언: 픽스처에서 `w1-Mon` 다음 = `w1-Tue`; 마지막 채워진 슬롯 → `null`; 종료 상태 강제(`data-state=ended` 설정 함수 `craPlay.showEnded()`) 시 `null`이면 `#playNext` 숨김
- [ ] **Step 2: 실패 확인** — `npx.cmd playwright test tests/play.spec.js -g "play list|solo|end overlay"` → FAIL
- [ ] **Step 3: 구현** — 목록은 페이지2와 같은 모양(주차 라벨 + Mon~Fri), 현재 칸 진한 테두리 + ▶, 빈 칸 흐림. 전환 시 `history.replaceState`로 현재 주소 형태(`/q/...` 또는 쿼리)를 유지하며 슬롯만 교체. 종료 이벤트(YouTube ENDED / Vimeo `ended`)에서 `showEnded()`. 퍼블리셔 iframe(`frame`)은 종료를 알 수 없으므로 오버레이 없음.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS, `npm.cmd run check` PASS
- [ ] **Step 5: 스크린샷 확인** — 375×812에서 (B) 전체 화면 1장, (A) 1장, 5월(빈 칸 많은 달 픽스처) 1장 → 사용자에게 보여 화면 승인 받기
- [ ] **Step 6: Commit (사용자 승인 시)** — `feat: 학생 페이지 목록·solo 모드·종료 오버레이`

### Task 4: `/q` 경로 · 배포 설정 (P4)

**Files:**

- Modify: `vercel.json`
- Verify only: `.vercelignore`
- Test: 배포 후 수동(curl)

**Interfaces:**

- Produces: `vercel.json` `"rewrites": [{ "source": "/q/:path*", "destination": "/play.html" }]`. ①안 확정 시에만 추가: host가 `play.tps-education.com`이면 `/q/:path*`·`/play.*`·`/video-source.js`·`/supabase-config.js` 외 경로는 `/play.html`로 rewrite(선생님 사이트 비노출 — `parsePlayRoute`가 null → invalid 카드).

- [ ] **Step 1: 설정 추가** — 위 rewrite. 기존 키 3개 유지.
- [ ] **Step 2: 로컬 정적 확인** — `.vercelignore`에 `play.html`·`play.js`·`play.css`·`video-source.js`가 걸리지 않음을 `git check-ignore`가 아닌 **파일 목록 대조**로 확인(`.vercelignore`는 gitignore 문법이지만 git이 읽지 않음). `npm.cmd run qa` PASS.
- [ ] **Step 3: Commit + Push (사용자 요청 시에만 — 운영 배포)**
- [ ] **Step 4: 배포 후 확인** — `curl -s -o /dev/null -w '%{http_code}'`로 `https://www.cambridgereading.com/q/b/3/w1-mon` 200, `/play.html` 200, `/q/b/3/w1-mon` 응답 본문에 `id="play"` 포함, `/docs/…` 여전히 404, 메인 `/` 200. 휴대폰으로 `/q/b/3/w1-mon` 열어 ▶ 재생.

### Task 5: 네이버 QR 입력용 목록 (P5)

**Files:**

- Create: `scripts/make-qr-list.mjs`
- Modify: `package.json` 스크립트 `"qr:list": "node scripts/make-qr-list.mjs"`
- Output: `qr/beginner-qr-list.csv` (**저장소 밖 또는 `.gitignore`·`.vercelignore`에 `qr/` 추가** — 배포 금지)

**Interfaces:**

- Consumes: `video-source.js`(Node `vm`으로 읽어 `months`·`allSlotKeys`·`qrPath`·`qrLevelCode` 재사용 — 단일 소스), `supabase-config.js`의 URL·anon 키(정규식 추출)
- Produces: CSV(UTF-8 BOM — 엑셀 한글), 열 `qr_name,level,month,slot,label,student_url,current_video_url`, 240행, 정렬 = 월 → 툴바(opening, ending, game, unit) → w1-Mon…w4-Fri. `qr_name` = `B-03-W1-MON`/`B-03-OPENING`, `student_url` = `--host`(기본 `https://www.cambridgereading.com`) + `qrPath(...)` (+ `--solo`면 `?solo=1`)

- [ ] **Step 1: 실패 테스트** — `node scripts/make-qr-list.mjs --offline --out <scratch>/t.csv`(REST 생략, `current_video_url` 빈칸) 후 검사: 데이터 행 240, 헤더 일치, `qr_name` 중복 0, 첫 행 `B-03-OPENING,Beginner,3,opening,Good Morning Song,https://www.cambridgereading.com/q/b/3/opening,`. (스크립트 미존재로 FAIL)
- [ ] **Step 2: 구현** — 온라인 모드는 `content_pages?level=eq.Level%201&select=month,videos,labels` **1회**.
- [ ] **Step 3: 확인** — 오프라인 검사 PASS; 온라인 1회 실행 → 채움 102/240(2026-10-19 기준, 바뀌었으면 보고)
- [ ] **Step 4: 사용자 전달** — CSV + 네이버 등록 절차 메모(최종 호스트 확정 후 등록, "링크로 바로 이동" 옵션 확인, TPS 공용 계정 권장)
- [ ] **Step 5: Commit (사용자 승인 시)** — 스크립트만(CSV 제외)

### Task 6: 실기기 검증 체크리스트 (P6 — 수동)

결과를 `docs/superpowers/plans/` 이 파일 하단 표에 기록한다.

| #   | 기기                                    | 확인                                                                                  |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | 아이폰 Safari / 기본 카메라 스캔        | 시험 인쇄 QR(20mm) 인식 → 네이버 → 학생 페이지 1홉 이내, ▶ 탭 재생(소리), 인라인 재생 |
| 2   | 안드로이드 Chrome / 기본 카메라(저가폰) | 위와 같음 + 15mm 인쇄본 인식 여부                                                     |
| 3   | 두 기기                                 | YouTube 자막 OFF(계정 "항상 자막" 켠 상태), 가로 회전 시 플레이어가 화면 채움         |
| 4   | 두 기기                                 | 퍼블리셔 영상: 현재 전략으로 재생, 아이가 다른 화면으로 이탈하는 경로 기록            |
| 5   | 두 기기                                 | 게임 탭 → 게임 페이지, 뒤로가기 → 학생 페이지 복귀(자동재생 없음)                     |
| 6   | 두 기기                                 | 비행기 모드 → "Can't load right now." → 복구 후 Try again                             |

### Task 7: 문서 갱신 (P7)

- [ ] `NOTES.md`: "QR 학생 페이지" 절 — 슬롯 키 = 인쇄물 계약, `play.html` 절대경로, `/q` rewrite는 Vite에서 안 됨(쿼리 fallback), 학생 페이지 테스트가 REST를 픽스처로 응답하는 이유, `PUBLISHER_STRATEGY` 의미, `video-source.js`를 `app.js` 앞에 로드·중복 선언 금지. 그리고 낡은 항목 정정: "The modal opens only on Level 1 / March — `isLevel1March()`"(함수 없음, 지금은 모든 레벨·월)
- [ ] `PROJECT_MEMORY.md`: In-progress/Recent state, Infrastructure에 `/q` 경로
- [ ] `npx.cmd prettier --write` 수정한 `.md`, `npm.cmd run check` PASS

---

## Task 6 결과 기록 (배포 후 사용자 작성)

배포 후 `https://www.cambridgereading.com/q/b/3/w1-mon` 등으로 확인. 결과·기기·날짜를 적는다.

| #   | 기기 / 브라우저                         | 결과                     | 메모                                                               |
| --- | --------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| 1   | 아이폰 Safari / 기본 카메라 스캔        | 부분 확인 (10/19)        | w1-tue(YouTube)·w1-mon(퍼블리셔) 탭 재생·소리 정상. QR 스캔 미확인 |
| 2   | 안드로이드 Chrome / 기본 카메라(저가폰) | 미확인                   |                                                                    |
| 3   | 자막 OFF · 가로 회전                    | 아이폰 정상 (10/19)      | 자막 OFF·전체화면(⛶/가로 회전/✕ 복귀) 정상. 안드로이드 미확인      |
| 4   | 퍼블리셔 영상 재생 · 이탈 경로          | 아이폰 재생 정상 (10/19) | w1-mon 재생 정상. 이탈 경로 기록 없음. 안드로이드 미확인           |
| 5   | 게임 이동 · 뒤로가기 복귀               |                          |                                                                    |
| 6   | 비행기 모드 → Try again                 |                          |                                                                    |

- 2026-10-19 아이폰 Safari — w1-tue(YouTube)·w1-mon(퍼블리셔) 탭 재생·소리·자막 OFF·전체화면(⛶/가로 회전/✕ 복귀) 정상. 안드로이드·QR 스캔 미확인.
