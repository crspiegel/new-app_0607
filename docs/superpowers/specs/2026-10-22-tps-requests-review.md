# TPS 요청 5건(10/20 미팅) — 설계 검토

작성 `2026-10-22`. 근거: PM 지시서 v2(로컬 사본 `docs/worker-briefs/2026-10-22-tps-requests-brief-v2.md`),
확정 결정 D1~D7. 이 문서는 **분석과 설계 권고**다. 구현 플랜은
`docs/superpowers/plans/2026-10-22-tps-requests-plan.md`. 코드·DB는 바꾸지 않았다.

검증 방법: 소스 읽기(`app.js`, `play.js`, `video-source.js`, `styles.css`, `index.html`, `vercel.json`,
`supabase/migration.sql`, 테스트 4개, 스크립트), `content_pages` REST 1회(Level 1~3 30행,
`select=level,month,covers,labels`, 12,170 B, Storage 0), 선생님 페이지2 Playwright 실측(375×812 ·
812×375, Supabase 요청 전부 스텁 → egress 0).

## 0. PM 사전 분석 정오표 (지시서 §3)

| #   | PM 가정                                                                         | 판정                                          | 소스로 확인한 사실                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 비-Vimeo http 호스트는 전부 `kind:"page"` → 게임 URL도 영상 모달                | **맞음**                                      | `video-source.js parseVideoSource`: YouTube → `youtube`, 숫자 → `vimeo`, `isExternalVideoPage`(vimeo.com 아닌 http(s)) → `page`, 나머지 `vimeo`. 요일 클릭은 `lessonGrid` 위임 → `openSlot` → `openVideoPlayer` → `mountExternalPage`(iframe + `.vp-external`). 게임 모달은 **툴바 `kind:"game"` 버튼만** `openGameSlot` → `openGameModal`. 학생 페이지 `play.js resolvePlayback`도 `slotKind()`가 툴바 기준이라 요일 게임 URL은 `type:"frame"`(iframe)이 된다.                                                                                                                                     |
| A2  | Level 1~3 교재 2권 = 툴바 슬롯 2개씩 + `covers` 2개, 주차↔교재 연결 없음        | **절반만 맞음**                               | 툴바 슬롯↔교재는 코드에 없다(`TOOLBAR_BUTTONS.default`: game/game2/song1/song2, 라벨 기본값만 "I Sit"/"I Like School"). 그러나 **주차↔교재는 레이아웃에 있다**: `renderLessons`가 `monthlyBooks` 2권 × 2주로 돌며 표지 1 = 1·2주, 표지 2 = 3·4주 옆에 놓고(`.book-title-card{grid-row:span 2}`), 관리자 `renderAdminBoard`도 같다(Beginner는 표지 1 + 4주). DB 실데이터(30행 전부 채움): `labels`가 `game`=`song1`=교재1 제목, `game2`=`song2`=교재2 제목으로 **운영 관행상 교재별 짝이 확정**돼 있다(예 Level 3 March: The Tractor / I Can Help). `covers`는 `book-1`·`book-2` Storage public URL. |
| A3  | 현재 `/q/<lv>/<month>/<slot>` 요일 단위                                         | **맞음**                                      | `play.js parsePlayRoute` 정규식 3토큰 + 쿼리 `?l=&m=&s=`. `vercel.json`: `/q/:path*` → `/play.html`, play 호스트 `/`·`/index.html` → `/q` redirect, 나머지 rewrite. `tests/play.spec.js` 44개 + `qr-list.spec.js` 2개(240행 고정). `scripts/make-qr-list.mjs`는 `LEVEL="Level 1"` 고정, 24슬롯×10월.                                                                                                                                                                                                                                                                                                |
| A4  | `play.html`은 `styles.css`·`app.js` 미사용, 동일 디자인에는 공유 모듈 추출 필요 | **맞음**                                      | `play.html`은 `/play.css`(13.8 KB, 토큰 복제) + `video-source.js` + `play.js`만. 페이지2 렌더는 `renderContentToolbar`(전역 `state.level/month`, `contentToolbar` DOM, `ICON_SVGS`, `getSlotLabel`→`contentCache`)와 `renderLessons`(`lessonGrid`, `monthlyBooks`)에 묶여 있다. **추출 난이도 중**: DOM 생성 부분은 순수하고 짧다(툴바 40행, 보드 45행). CSS는 `styles.css` 6,527행 중 페이지2 관련 선택자가 331~2,685행과 ≤767·768~1180·≥1181 미디어 블록(3,295~4,130행 등)에 흩어져 있다(관련 선택자 약 237개).                                                                                   |
| A5  | 표지는 Storage public URL                                                       | **맞음**                                      | `uploadCover`: `covers/<slug(level)>/<slug(month)>/<book>` 업로드 → `getPublicUrl` + `?t=<ms>` → `content_pages.covers[book]`. 읽기는 `getCover` → `refreshCovers`가 `.book-title-card` `background-image`로. 경로에 확장자가 없다(`book-1`). 로컬 시드 `assets/l1-march-book-1.jpg`는 Level 1 March에만.                                                                                                                                                                                                                                                                                           |
| A6  | 모달 재생으로 바꾸면 아이폰 전체화면 로직을 모달로 옮겨야 함                    | **맞음, 단 공유 대상은 `#videoModal`이 아님** | 아이폰 로직(`noFullscreenApi`, Vimeo `playsinline=0`, 유사 전체화면 `body.play-fullscreen`, 일시정지 탭 레이어)은 전부 `play.js`(≈690행)·`play.css`에 있고, 선생님 `#videoModal`(index.html 270행 + app.js 774~1,260행 전송 UI)에는 없다. 선생님 모달은 `vpFrame`·`activePlayer`·전역 `state` 결합이 강하다 → §2.6: `play.js`의 스테이지를 오버레이로 바꿔 쓰면 옮길 것이 없다.                                                                                                                                                                                                                     |
| A7  | localStorage 멤버 세션 + `state.grade===3` 게이트, 자체 members 테이블          | **맞음**                                      | `members(id text pk, password_hash bcrypt, grade 1~3, display_name, active)`. 로그인: `#loginForm`에서 `@` 포함 → Supabase Auth(관리자, `public.admins` + `is_admin()`), 아니면 `rpc verify_member_login` → grade → `localStorage.cra_member`. **grade는 UI 게이트일 뿐**(3 = 영상 차단 팝업, 1·2·익명 = 재생). 비밀번호는 서버 RPC에서만 비교(`SECURITY DEFINER`). 아이디·비밀번호 규칙 `^[!-~]{4,}$`(ASCII, 한글 불가). 회원 CRUD: `create_member`·`update_member`·`set_member_active` RPC(관리자만), 목록은 `members` select(RLS 관리자). 자가입 꺼짐(의도).                                     |
| A8  | 사이트 설정 키/값 테이블 없음                                                   | **틀림**                                      | `public.site_settings(key text pk, value jsonb)`가 있고 공개 읽기·관리자 쓰기 RLS. 현재 키: `signup_visible`, `hero_banner`(hero-banner.js). R4 버튼관리는 여기 `header_buttons` 키로 저장하면 테이블 추가가 없다.                                                                                                                                                                                                                                                                                                                                                                                  |

추가로 확인한 것:

- Supabase Auth 자가입은 10/06부터 **의도적으로 꺼져 있다**(봇 가입). R5에서 다시 켜지 않는다.
- 선생님 페이지 콜드 로드는 REST 4회(`site_settings` 2, `content_pages?select=*` 전 40행,
  `page_backgrounds?select=*`) + Storage(배너·배경·표지)다. 학생 페이지가 이 경로를 타면 D3·D4를 어긴다(§2.4).
- 페이지2 375×812 실측(스텁): 가로 넘침 없음(scrollWidth 375), 헤더 101px, 툴바 6버튼 224px(2열),
  보드 2권 749px(표지 149×200 가운데 + 주 2줄, 요일 버튼 54×54), 문서 높이 1,462px.
  Beginner는 툴바 4버튼 304px(세로 쌓임), 보드 513px, 문서 1,306px. 812×375 가로는 PC형 그리드(표지 150px 열).
- 요일 버튼 54px는 DESIGN 권장 터치 타깃 56px에 2px 모자란다 — 기존 승인 화면이므로 손대지 않는다.

## 1. R1 — 요일 슬롯 게임 URL

### 1.1 안 비교

| 항목                    | ① 호스트 자동 감지                                                                                                       | ② 편집기 유형 선택 + DB `{kind:"game",url}`                                                                                                                                                      | ③ 둘 다     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| 변경 범위               | `video-source.js`에 `GAME_HOSTS` 상수 + `parseVideoSource`가 `{kind:"game",url}` 반환, `openSlot`·`resolvePlayback` 분기 | ①에 더해 슬롯 편집 모달에 유형 라디오, `videos[slot]`가 문자열 또는 객체, 읽는 곳 전부(`getVideoUrl`, 관리자 버튼, `make-qr-list`, `play.js slotUrl`, `nextFilledSlot`, 테스트 픽스처) 객체 처리 | ② 전부 + ①  |
| DB 변경                 | 없음(문자열 그대로)                                                                                                      | 없음(jsonb 값 형태만 바뀜, 하위 호환 문자열)                                                                                                                                                     | 없음        |
| 새 게임 호스트가 생기면 | 상수 1줄 추가 + 배포                                                                                                     | 관리자가 유형만 고르면 됨                                                                                                                                                                        | 자동 + 수동 |
| 오판 위험               | 목록에 없는 게임 호스트 → 영상 iframe으로 열림(지금과 같음, 더 나빠지지 않음)                                            | 관리자가 유형을 틀리면 게임이 영상 창에                                                                                                                                                          | 최소        |
| 테스트 영향             | `smoke` "slot video classifier" 1개에 케이스 추가, `play` resolvePlayback 1개 확장, 새 테스트 2개                        | 위 + 편집기·객체 값 테스트 4~6개                                                                                                                                                                 | 가장 많음   |
| 추정                    | 3~4h                                                                                                                     | 8~10h                                                                                                                                                                                            | 10~12h      |

**권고 ①.** 게임은 지금까지 한 호스트(`book-english-games.vercel.app`, Level 1~3 30행 + Beginner 10행
전부)에서만 온다. DB 값 형태를 바꾸지 않으므로 70개 QR·CSV·학생 페이지·관리자 화면 어디에도 파급이
없다. 두 번째 게임 호스트가 생기면 상수에 추가하고, 세 번째가 생길 때 ②로 올린다.

### 1.2 동작 설계 (①)

- `video-source.js`: `const GAME_HOSTS = ["book-english-games.vercel.app"]`, `isGameUrl(str)`(호스트 정확히
  일치 또는 하위 도메인). `parseVideoSource`에서 YouTube 판정 **다음**, `isExternalVideoPage` **앞**에
  `if (isGameUrl(str)) return { kind: "game", url: str }`. `/* exported */`·`eslint.config.mjs`
  `videoSourceGlobals`에 `isGameUrl` 추가(NOTES 규칙).
- 선생님(`app.js openSlot`): grade 게이트 → 빈 슬롯 → `parseVideoSource(url).kind === "game"`이면
  `openGameModal(url)`(툴바 Game 버튼과 같은 `#gameModal`, 1280×720 fit 로직 그대로), 아니면
  `openVideoPlayer`. `openVideoPlayer`는 `kind:"game"`을 받으면 안전하게 `mountExternalPage`로
  떨어지게 두되 도달하지 않는다.
- 관리자: `openSlotEditor`의 요일 슬롯 라벨을 "영상 URL (Vimeo·YouTube) 또는 게임 URL"로, 자리표시자에
  게임 예시 1줄. `adminSlotButton`은 그대로(URL 표시). 유형 선택 UI 없음.
- 학생(`play.js resolvePlayback`): `kind:"game"` → `{ type: "game", url }` → 기존 "Let's play!" 카드 →
  `location.assign`(직접 이동, 뒤로가기 복귀). `nextFilledSlot`은 게임을 건너뛰므로 변경 없음.
- 선생님 사이트 `#gameModal`과 학생 직접 이동의 차이는 그대로 유지(모바일 게임 페이지는 반응형, 선생님
  모달은 PC 1280×720 기준 — NOTES "게임 모달").

## 2. R2 + R3 — 교재 단위 학생 페이지

### 2.1 교재 상수 (D1, 코드 고정)

`video-source.js`(공유, DOM 없음)에 둔다 — `make-qr-list.mjs`가 Node `vm`으로 읽어 CSV를 만들기 때문.

```js
const BOOK_LAYOUT = {
  "Level 1": [
    { book: 1, weeks: [1, 2, 3, 4], toolbar: ["opening", "ending", "game", "unit"], cover: "book-1" },
  ],
  default: [
    { book: 1, weeks: [1, 2], toolbar: ["opening", "ending", "game", "song1"], cover: "book-1" },
    { book: 2, weeks: [3, 4], toolbar: ["opening", "ending", "game2", "song2"], cover: "book-2" },
  ],
};
function bookLayout(level); // 배열
function bookEntry(level, book); // 항목 또는 null (Beginner에 book 2 → null)
function bookSlotKeys(level, book); // toolbar 순서 + 그 주차의 w<n>-<Day> 20/10개
function bookToolbarButtons(level, book); // TOOLBAR_BUTTONS 항목 중 toolbar 키만, 그 순서
```

- 툴바 슬롯 키 확정: Beginner = `opening ending game unit`(4), Level 1~3 교재1 = `opening ending game song1`,
  교재2 = `opening ending game2 song2`(각 4). Good Morning/Bye는 두 교재에 공통 노출.
- `TOOLBAR_BUTTONS`·슬롯 키·DB 값은 **바꾸지 않는다**(관리자 화면·선생님 사이트 무변경).
- 테스트: `bookSlotKeys("Level 2", 2)`가 `["opening","ending","game2","song2","w3-Mon",…,"w4-Fri"]`(14개),
  Beginner book 1이 24개, `bookEntry("Level 1", 2) === null`.

### 2.2 QR 산정표 (70개)

| 레벨(표시) | 내부 키   | 월   | 교재/월 | QR     |
| ---------- | --------- | ---- | ------- | ------ |
| Beginner   | `Level 1` | 3~12 | 1       | 10     |
| Level 1    | `Level 2` | 3~12 | 2       | 20     |
| Level 2    | `Level 3` | 3~12 | 2       | 20     |
| Level 3    | `Level 4` | 3~12 | 2       | 20     |
| **합계**   |           |      |         | **70** |

### 2.3 경로 스킴 · 기존 경로 · CSV

**새 경로:** `/q/<lv>/<month>/<book>` — `lv` ∈ `b`,`l1`,`l2`,`l3`(현행 유지), `month` 3~12, `book` `1`|`2`
(Beginner는 `1`만). 쿼리 폴백 `play.html?l=b&m=3&b=1`(테스트·Vite). 예 `/q/l2/3/2` = 표시 Level 2 · 3월 · 교재 2.

- PM 예시의 레벨 토큰 `b,1,2,3`도 **파서가 별칭으로 받는다**(`levelFromQrCode("1") → "Level 2"`). 생성은
  `l1~l3`로 권고: `/q/1/3/1`처럼 레벨과 교재가 둘 다 숫자면 CSV·네이버 관리 화면에서 사람이 헷갈린다.
  (**확인 필요 — PM 결정**: 생성 토큰을 `l1`으로 둘지 `1`로 바꿀지.)
- `?solo=1`은 폐기(목록이 곧 보드이므로 모드가 없다). `?s=`도 폐기.
- **기존 요일 경로 `/q/b/3/w1-mon` 처리 권고: 제거**(invalid 카드). 네이버 QR 미등록·미인쇄·외부 공유
  없음이라 지킬 계약이 없고, 리다이렉트를 두면 슬롯→교재 역매핑 코드와 테스트가 영구히 남는다. 요일
  토큰이 오면 "Oops! This code doesn't work." 카드(링크 없음)로 충분하다. NOTES의 "슬롯 키 = 인쇄물 계약"
  항목은 "교재 토큰 = 인쇄물 계약"으로 바꾼다.
- `vercel.json`은 변경 없음(`/q/:path*` rewrite가 그대로 받는다). `tests/vercel-config.spec.js` 무변경.
- CSV 재생성 범위: `scripts/make-qr-list.mjs`를 전 레벨 70행으로(열: `qr_name, level, month, book,
title, student_url, cover_file, filled_slots`). `qr_name` = `B-03-1`, `L1-03-2`(레벨-월2자리-교재).
  `title`은 그 교재의 `labels[game|game2]`(DB 교재 제목) 또는 기본값. 기존 `qr/beginner-qr-list.csv`는
  `qr/qr-list.csv`로 대체(폴더 git 제외). 테스트 `qr-list.spec.js`를 70행 고정으로 교체.

### 2.4 디자인 공유 — (가) 추출 vs (나) 학생 모드 라우트

| 항목                      | (가) 보드 렌더러 + CSS 추출                                                                             | (나) 선생님 앱(`index.html`)에 학생 모드                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D3 "해당 교재 데이터만"   | `play.js`가 (level, month) 1행만 읽고 교재 슬롯만 쓴다                                                  | `hydrateContent`가 **`content_pages?select=*` 40행 전부** + `page_backgrounds` 전부 + `site_settings` 2회. 학생 모드 분기를 `hydrate*` 4곳에 넣어야 함                                                 |
| D4 "Storage 0"            | 표지는 정적 자산, 배너·배경 없음                                                                        | 히어로 배너(`hero-banner.js`)·페이지 배경(`applyPageBackground`)·Storage 표지를 전부 조건 분기로 꺼야 함. 하나라도 놓치면 학생 트래픽이 Storage egress → 402                                           |
| 이동 차단                 | 페이지에 링크·내비가 없다                                                                               | 헤더 레벨 버튼(`[data-level]`), 월 Back/Next, `#content/...` 해시 라우팅, 로그인 버튼 등 **DOM과 핸들러를 숨기는 게 아니라 못 만들게** 해야 함. URL 해시만 바꿔도 다른 레벨이 열린다(`setHash` 라우팅) |
| 로드 비용                 | `board.css`(추출분, ~40 KB 추정) + `board-view.js` + `play.js`                                          | `styles.css` 163 KB + `app.js` 101 KB + supabase-js + Vimeo SDK + hero-banner + background-editor                                                                                                      |
| 아이폰 전체화면·탭 레이어 | `play.js` 그대로                                                                                        | `#videoModal`로 옮겨 다시 구현(A6)                                                                                                                                                                     |
| "완전히 동일" 보장        | 같은 마크업·같은 클래스·**같은 CSS 파일**(복사 아님) + 픽셀 비교 테스트                                 | 같은 코드라 동일                                                                                                                                                                                       |
| 회귀 위험                 | CSS 추출 시 캐스케이드 순서(NOTES: `#gameFrame` 미디어 블록 순서 사고). 페이지2 전후 픽셀 비교로 잡는다 | `app.js` 전역에 모드 분기가 퍼짐. 선생님 사이트 전체가 회귀 대상                                                                                                                                       |
| 추정                      | 2.5~3일                                                                                                 | 2~2.5일이지만 D3·D4 위반 가능성이 구조적                                                                                                                                                               |

**권고 (가).** 근거는 D3·D4다 — (나)는 "선생님 사이트를 덜어내는" 방식이라 Storage·전 테이블 로드·해시
이동을 빠짐없이 막았다는 증명이 어렵고, 한 번 놓치면 402다. (가)는 "필요한 것만 더하는" 방식이다.

(가)의 구체 설계:

1. **`board.css` 물리 추출.** `styles.css`에서 페이지2 보드에 필요한 규칙(레벨 테마 변수 `.level-theme-N`,
   `.section-box/.section-inner/.section-blue`, `.content-level-banner`, `.content-main-header` 타이틀 블록,
   `.content-toolbar` + `.content-type*` + `--wide`, `.lesson-board/.lesson-grid/.book-title-card/.week-label/
.lesson-button`, 그 미디어 블록들, 이탤릭 금지, 폰트 스택)을 **잘라서** 새 파일로 옮기고 `index.html`은
   `board.css`를 `styles.css` **앞**에, `play.html`은 `board.css` + `play.css`를 로드한다.
   순서 변경 회귀는 **추출 전 페이지2 스크린샷(4 레벨 × 4 뷰포트 375×812·812×375·768×1024·1366×900) 대
   추출 후 픽셀 비교(Playwright `toHaveScreenshot`, maxDiffPixels 0)**로 막는다. 추출 대상 규칙을
   `styles.css`에 남겨 두는 복사 방식은 금지(드리프트).
2. **`board-view.js`(공유 classic script, `video-source.js` 다음·`app.js`/`play.js` 앞).** 순수 DOM 빌더만:
   `ICON_SVGS`(app.js에서 이동), `buildToolbarButton(item, label)`, `buildCoverCard(bookIndex)`,
   `buildWeekRow(weekNumber, bookTitle)`(= `.week-label` + 5 `.lesson-button[data-slot][data-vp-title]`).
   `app.js renderContentToolbar`·`renderLessons`는 이 빌더를 호출하도록 바꾼다(동작 무변경, `smoke` 툴바
   테스트 7개가 회귀 가드). NOTES의 "재선언 SyntaxError" 규칙이 그대로 적용된다.
3. **학생 페이지 마크업.** `play.html`의 `<main>` 안에 선생님 페이지2와 **같은 id·클래스**(`#contentScreen
.section-box … #lessonGrid`)로 보드를 만든다 — `board.css`의 `#contentScreen …` 선택자가
   그대로 맞으므로 "완전히 동일"이 CSS 수준에서 보장된다. 다른 점: 상단 플레이어 없음, Back/Next 없음,
   헤더는 브랜드 문구만(버튼 아님, 레벨 내비·로그인 없음), 푸터 저작권 1줄(링크 없음). 주차 번호는
   선생님 화면과 같은 연속 번호(교재 2 = 3·4 week).
4. **툴바.** 교재당 4버튼이라 `--wide`(6버튼 2열) 규칙이 아니라 Beginner형 한 줄 레이아웃이 적용된다.
   Level 1~3의 GAME/SONG 리본 태그는 `item.tag`가 있으므로 그대로 붙는다. (**확인 필요**: Level 1~3
   학생 페이지가 4버튼 한 줄로 보이는 것이 "완전히 동일"의 의도에 맞는지 — 6버튼 중 다른 교재 2개를
   비워 둘 수는 없다.)
5. **모바일 세로 예상 높이**(실측 기반): 헤더(브랜드만) ≈60 + 배너 46 + 타이틀 40 + 툴바 4버튼 ≈304(Beginner
   형 세로 쌓임) + 보드(표지 200 + 2줄 136 + 여백) ≈ 380 → 약 870px, 812px 화면에서 **1화면 조금 넘김**.
   Beginner(4줄)는 ≈ 1,000px. 스크롤 허용(선생님 페이지2도 1,462px). 가로 회전은 PC형 그리드.

### 2.5 데이터 조회 (D3)

- `play.js fetchPageRow`는 지금처럼 `content_pages?level=eq.X&month=eq.Y&select=videos,labels` 1회.
  응답(≈1~1.5 KB)에는 다른 교재의 슬롯 값도 들어 있다. **권고: 그대로 두고 클라이언트에서
  `bookSlotKeys`로 걸러 쓴다.** 이유: ① 영상·게임 URL은 선생님 사이트에서 이미 공개로 읽히는 값이라
  비밀이 아니다, ② D3가 "URL 직접 입력까지 막지 못함"을 인정한다, ③ egress 차이가 수백 바이트다.
- 줄이고 싶을 때의 선택지(필수 아님): PostgREST `select=videos->>opening,…`는 하이픈 키(`w1-Mon`)의
  파싱이 불확실(**미검증**). 확실한 길은 `rpc book_slots(p_level, p_month, p_keys text[])` →
  `jsonb_object_agg`로 요청한 키만 반환(SECURITY INVOKER, 공개). 키 목록은 클라이언트가 보내므로
  D1(코드 고정)과 충돌하지 않는다. Phase 2 범위 밖, 백로그.
- 차단은 UI로: 페이지에 다른 교재·월·레벨로 가는 버튼·링크 없음, `history` 조작 없음, 빈 슬롯 =
  "Coming soon" 카드. 문서·NOTES에 "URL을 손으로 바꾸면 다른 교재가 열린다"를 명시한다.

### 2.6 영상/게임 열기 — `#videoModal` 공유 vs 별도

| 항목            | 선생님 `#videoModal` 공유                                                                        | **`play.js` 스테이지를 오버레이로(권고)**                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 코드            | index.html 270행 마크업 + app.js 전송 UI 490행 + CSS, 전역 `state`·`vpFrame` 결합 → 추출 큰 작업 | 이미 있는 `#playStage`(YouTube·Vimeo SDK·frame, ▶ 오버레이, 탭 레이어, 종료 오버레이, ⛶)를 `position:fixed` 카드로 |
| 아이폰 전체화면 | 없음 → 새로 구현(A6)                                                                             | `noFullscreenApi()` → Vimeo `playsinline=0`, 유사 전체화면, 일시정지 레이어 **그대로**                             |
| 닫기            | ✕·Esc                                                                                            | ✕·Esc·뒤로가기(`history.pushState` 1단계, popstate로 닫기)                                                         |
| Next            | 없음                                                                                             | `nextFilledSlot`을 **교재 슬롯 범위로 한정**(다른 교재로 넘어가지 않음)                                            |
| 게임            | `#gameModal`(PC 1280×720 기준)                                                                   | 직접 이동(`location.assign`, 현행) — 모바일 반응형 게임에 맞음. 툴바 Game·요일 게임 동일                           |

학생 페이지에서 툴바·요일 버튼 탭 → 오버레이 열림 + 즉시 마운트(탭 = 제스처) → 재생. 기존 44개
`play.spec.js`의 플레이어 테스트는 "오버레이가 열린 상태"를 전제로 셀렉터만 바뀐다.

### 2.7 표지 정적 자산 (D4)

- **경로 규칙:** `assets/covers/<level-slug>/<month-slug>/book-<n>.jpg` — Storage 경로(`slugify(level)/
slugify(month)/book-n`)와 1:1(예 `assets/covers/level-3/march/book-2.jpg`). 확장자는 다운로드 시
  `Content-Type`으로 정한다(업로드가 `shrinkImage` → JPEG일 가능성이 높지만 확인 후 고정).
- **`scripts/sync-covers.mjs`:** REST 1회(`content_pages?select=level,month,covers`) → 각 URL을 Storage에서
  1회 다운로드(70개 × ≤800px ≈ 5~8 MB, **실행 전 사용자 승인**) → 파일 저장 → `qr/covers-manifest.json`
  (level, month, book, 파일, 바이트, 원본 `?t=`) 기록. `--only <level>` 옵션. `.vercelignore`에 `scripts`가
  이미 있어 배포되지 않는다. 이미지 재압축은 하지 않는다(이미 800px·q0.82).
- **학생 페이지 표지 URL:** `coverAssetPath(level, month, book)` = 위 규칙 → 없으면 흰 자리표시자(요청 404
  1회, 허용). `check-assets-case.mjs`는 소스의 리터럴 `assets/…`만 보므로 동적 경로는 잡지 못한다 →
  `tests/covers.spec.js`(Node)가 **70개 파일 존재**를 단언한다. Windows에서 만든 파일명이 전부 소문자인지도
  같은 테스트에서 본다(Vercel Linux 대소문자).
- **관리자 표지 교체 절차(권고: 수동 스크립트, 빌드 단계 아님):** 관리자 화면 업로드(Storage, 선생님
  사이트 즉시 반영) → `npm run covers:sync -- --only "Level 3"` → 커밋·푸시 → 학생 페이지 반영. 빌드 단계
  방식은 이 프로젝트의 "static, no build" 원칙과 배포마다 Storage egress(5~8 MB)를 깨므로 보류. 관리자
  표지 카드 밑에 "학생 QR 페이지 반영은 sync 후 배포" 한 줄을 넣는다(관리자 미러 규칙).
- 선생님 사이트는 당분간 Storage 유지(D4). 저장소 용량 +5~8 MB(현재 assets 5.8 MB).

### 2.8 모바일 세로 실측 (선생님 페이지2, 375×812, Storage 스텁)

| 항목                | Level 1~3 (6버튼·2권)                             | Beginner (4버튼·1권) |
| ------------------- | ------------------------------------------------- | -------------------- |
| 문서 폭 / 높이      | 375 / 1,462                                       | 375 / 1,306          |
| 헤더(`.topbar`)     | 101px                                             | 101px                |
| 툴바                | 224px(2열 3행)                                    | 304px(세로 4개)      |
| 보드                | 749px: 표지 149×200 중앙 → 주 1·2 → 표지 → 주 3·4 | 513px: 표지 → 주 1~4 |
| 요일 버튼 / 주 라벨 | 54×54 / 24×54                                     | 같음                 |
| 가로 812×375        | PC형 그리드(표지 150px 열, 요일 76×64)            | —                    |

스크린샷은 세션 스크래치 폴더(로컬 임시). 학생 페이지 픽셀 비교 기준선은 Phase 2 Task에서 다시 찍는다.

## 3. R4 — 헤더 '선생님자료실' 버튼 (R5 이후 Phase) — **취소 (2026-10-29)**

> PM 결정(2026-10-29): 이 안(헤더 알약 버튼 + 외부 링크)은 만들지 않는다. 레벨별 월 선택 페이지의 '교사 자료실' 버튼 +
> 레벨별 자료페이지 + 비공개 Storage 다운로드로 대체 — `docs/superpowers/specs/2026-10-29-levels-teacher-resources-design.md`
> (B). 아래는 기록용.

- **저장:** `site_settings` 키 `header_buttons` = `[{ id, label, url, newTab, visible, minRole }]`.
  테이블·RLS 추가 없음(공개 읽기, 관리자 쓰기 정책 재사용). `minRole`: `0` 최고관리자, `1` 지사, `2`
  선생님, `3` 학생, `9` 전체 공개.
- **노출:** `updateAdminUI()` 옆 `renderHeaderButtons()`가 세션 역할(§4)로 `minRole` 비교 → `.topbar-actions`
  **Admin 버튼 왼쪽**에 알약 버튼(`.login-button` 계열 스타일, 새창이면 `rel="noopener"`). 익명·학생에게는
  DOM에 넣지 않는다(숨김이 아니라 미생성). 서버 강제는 없다(링크 URL은 공개 값) — 자료실 자체가
  접근 제어를 해야 한다면 그쪽 몫임을 명시.
- **관리자 화면:** `.admin-menu`에 "버튼" 탭(`data-admin-view="buttons"`, 최고관리자만). 행 편집: 라벨·URL·
  새창·표시·노출 등급·순서. 저장은 `site_settings` upsert 1회.
- **영어 UI 규칙과 한글 라벨:** 사이트 규칙은 영어 UI지만 이 버튼은 **로그인한 교사용**이고 PM이 라벨을
  '선생님자료실'로 지정했다. 라벨은 관리자 입력값이므로 코드 규칙과 충돌하지 않는다(기본값만 한글). NOTES에
  예외로 기록.
- 의존: 역할 세션(R5). R5 전에 만들면 "로그인한 사람 모두"로만 노출할 수 있어 요구와 다르다 → Phase 4.

## 4. R5 — LMS

### 4.1 현황 대조표

| 항목        | 현재                                                                | 새 요구                                                                                   |
| ----------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 최고관리자  | Supabase Auth 사용자 + `admins` 행, 이메일 아이디, `is_admin()` RLS | 그대로(바꿀 이유 없음). 지사·회원·반 전체 관리                                            |
| 회원 등급   | `members.grade` 1·2·3, 의미 = 1·2 재생 / 3 차단 팝업                | 1 지사, 2 선생님, 3 학생(열람). **3의 의미가 "차단"에서 "열람"으로 바뀐다**(확인 필요 §6) |
| 소속        | 없음                                                                | `branch_id`(지사), `classes`, `class_members`                                             |
| 아이디      | 전역 유일, ASCII 4자+                                               | **지사 내 유일**, 한글 허용, 중복 시 접미사 제안                                          |
| 비밀번호    | ASCII 4자+ 상한 없음                                                | 4~10자, 숫자만 가능                                                                       |
| 로그인 보호 | 없음                                                                | IP·아이디별 시도 제한 필수                                                                |
| 세션        | localStorage `{id, grade}`(위조 가능, UI 게이트)                    | 서버가 검증할 수 있는 세션(지사·선생님이 **쓰기**를 하므로 RLS가 믿을 근거 필요)          |
| 관리자 메뉴 | 콘텐츠·회원·배너(관리자만)                                          | 역할별 메뉴(§4.6)                                                                         |
| 자가입      | 꺼짐(의도)                                                          | 그대로 꺼짐. 계정은 상위 역할이 생성                                                      |

### 4.2 인증 방식 비교

| 항목                | (가) Supabase Auth                                                                                  | (나) 자체 members + Edge Function 로그인(JWT)                                                           | **(다') 자체 members + 세션 토큰 테이블 + 헤더 RLS (권고)**                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 한글 아이디(D5)     | 불가(이메일/전화만). 합성 이메일(`<해시>@lms.invalid`)로 우회 가능하나 아이디 변경·중복 제안이 복잡 | 가능                                                                                                    | 가능                                                                                                                                                       |
| 비밀번호 4~10자(D6) | 대시보드 최소 길이 설정의 하한이 6으로 알려짐(**확인 필요**) → 4자리 숫자 불가 가능성               | 가능(우리 규칙)                                                                                         | 가능                                                                                                                                                       |
| 시도 제한(D6)       | Auth 자체 IP 레이트리밋만(아이디별 잠금 없음). 커스텀은 Edge Function 필요                          | Edge Function에서 IP·아이디 카운터                                                                      | 로그인 RPC에서 `login_attempts` 테이블로 아이디별 잠금. IP는 PostgREST `request.headers`의 `x-forwarded-for`로(**확인 필요**, 없으면 아이디별 + 전역 한도) |
| RLS 근거            | `auth.uid()` 표준                                                                                   | 커스텀 JWT 클레임(`auth.jwt()->>'lms_role'`) 표준. 단 JWT 서명키(레거시 HS256 vs 신규 서명키) 확인 필요 | 정책 함수 `lms_member()`가 `request.headers`의 `x-lms-token`으로 `lms_sessions` 조회. PostgREST가 지원하는 공식 경로                                       |
| 계정 생성           | 자가입 꺼짐 → service role 필요 → Edge Function                                                     | Edge Function                                                                                           | SECURITY DEFINER RPC(지금 `create_member`와 같은 방식)                                                                                                     |
| 새 도구·비밀        | 없음(계정 생성 함수는 필요)                                                                         | Supabase CLI·Deno·함수 배포·JWT 시크릿 보관                                                             | **없음** — SQL Editor에 migration.sql 재실행(현행 운영 방식)                                                                                               |
| 정적 SPA 유지       | 유지                                                                                                | 유지(함수는 Supabase 측)                                                                                | 유지                                                                                                                                                       |
| 기존 회원 이전      | 비밀번호 해시 호환 불가 → 전원 재발급                                                               | 해시 그대로                                                                                             | 해시 그대로                                                                                                                                                |
| 추정                | 6~8일 + 우회 설계                                                                                   | 6~8일 + 도구 셋업 1일                                                                                   | 5~7일                                                                                                                                                      |

**권고 (다').** D5(한글)·D6(4자리·시도 제한)을 우회 없이 충족하고, 이 프로젝트가 이미 쓰는 방식(migration.sql

- RPC + RLS, 도구·비밀 추가 없음)의 연장이다. (나)는 같은 테이블 위에서 세션 토큰을 JWT로 바꾸는
  업그레이드 경로로 남긴다(테이블 설계는 둘 다 동일).

(다') 핵심:

- `rpc lms_login(p_branch_code text, p_login_id text, p_password text)` → 시도 제한 확인 → bcrypt 비교 →
  `lms_sessions` 행 생성(토큰 32바이트 난수 base64url, 만료 30일 슬라이딩) → `{token, role, branch_id,
branch_name, display_name}` 반환. 실패 시 카운터 증가(아이디 키 `branch/login`, IP 키), 5회 실패 → 15분
  잠금, 잠금 중엔 비밀번호 비교 없이 거부.
- 클라이언트: `supabase.createClient(url, key, { global: { headers: { "x-lms-token": token } } })`를
  로그인 후 다시 만든다(토큰은 localStorage, 로그아웃 = `rpc lms_logout` + 삭제).
- 정책 함수 `lms_member()`(stable, security definer): 헤더 토큰 → 유효 세션 → `(member_id, role,
branch_id)` 반환, 없으면 null. 모든 LMS 정책이 이 함수로 판단.
- 로그인 폼: 지사 선택(드롭다운, 공개 `branches(id,name)` 읽기) + 아이디 + 비밀번호. `@` 포함 → 관리자
  Auth 경로(현행), 아니면 `lms_login`. 아이디 규칙은 지사 내 유일이라 **지사를 반드시 받아야** 한다.

### 4.3 스키마 초안 (`supabase/migration.sql`에 추가, 전부 idempotent)

```sql
create table branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,           -- 로그인 폼 선택값·URL에 쓰는 짧은 코드 (예 'hq', 'busan')
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- members 확장 (기존 행 보존)
alter table members add column member_id uuid not null default gen_random_uuid();
alter table members add column branch_id uuid references branches(id);
alter table members rename column id to login_id;     -- 기존 pk 해제 후
alter table members rename column grade to role;      -- 1 지사 · 2 선생님 · 3 학생 (check 유지)
alter table members add column password_changed_at timestamptz, add column last_login_at timestamptz;
-- pk: member_id, unique (branch_id, lower(login_id))
create table classes (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id),
  name text not null,
  teacher_id uuid references members(member_id),      -- 담당 선생님(선생님이 만들면 자동 = 본인)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, name)
);
create table class_members (
  class_id uuid references classes(id) on delete cascade,
  member_id uuid references members(member_id) on delete cascade,
  primary key (class_id, member_id)
);
create table lms_sessions (
  token text primary key, member_id uuid not null references members(member_id) on delete cascade,
  created_at timestamptz default now(), expires_at timestamptz not null, last_seen_at timestamptz
);
create table login_attempts (
  key text primary key,                 -- 'id:<branch_id>/<login_id>' 또는 'ip:<addr>'
  fails int not null default 0, locked_until timestamptz, updated_at timestamptz default now()
);
```

- 아이디 규칙(D5): `^[\p{L}\p{N}._-]{2,20}$`(한글·영문·숫자·`._-`, 공백·`@` 불가), 대소문자 구분 없음
  (`lower()` 유니크 인덱스). 비밀번호(D6): `^[\x21-\x7E]{4,10}$`(숫자만 가능).
- **동명이인:** `create_member`가 `(branch_id, lower(login_id))` 충돌 시 예외 `duplicate_login_id`에
  **다음 빈 접미사**(`김민준2`, `김민준3` …)를 hint로 돌려준다. 화면은 "이미 있는 아이디입니다 —
  '김민준2'로 만들까요?" [만들기] 1클릭. 엑셀 업로드는 "중복이면 접미사 자동 적용" 체크박스.
- 기존 회원: `branch_id` = 마이그레이션에서 만드는 본사 지사(`code 'hq'`), `role` = 기존 `grade` 값 그대로.
- 기존 `verify_member_login`·`create_member`·`update_member`·`set_member_active`는 새 RPC로 대체 후 제거.

### 4.4 RLS 매트릭스 (역할 × 테이블 × CRUD)

범례: ✓ 직접 테이블, R = RPC로만(비밀번호 해시·역할 검사 때문), ✗ 없음. "자기 지사" = `branch_id =
lms_member().branch_id`, "자기 반" = `classes.teacher_id = me` 또는 `class_members`에 포함.

| 테이블           | 익명                               | 학생(3)          | 선생님(2)                                                                                                 | 지사(1)                                         | 최고관리자(`is_admin()`) |
| ---------------- | ---------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------ |
| `content_pages`  | select                             | select           | select                                                                                                    | select                                          | all                      |
| `site_settings`  | select                             | select           | select                                                                                                    | select                                          | all                      |
| `branches`       | select(id,name,code만 — 로그인 폼) | select 자기 지사 | select 자기 지사                                                                                          | select 자기 지사                                | all                      |
| `members`        | ✗                                  | select 자기 행   | select 자기 지사의 학생 + 자기 행; insert R(학생만, 자기 지사); update R(자기 반 학생 비번 초기화·비활성) | select/insert R/update R 자기 지사(선생님·학생) | all(R 포함)              |
| `classes`        | ✗                                  | select 자기 반   | select 자기 지사; insert ✓(teacher_id = me 강제, 자기 지사); update ✓ 자기 반                             | all ✓ 자기 지사                                 | all                      |
| `class_members`  | ✗                                  | select 자기 행   | select 자기 반; insert/delete ✓ 자기 반 + 자기 지사 학생만                                                | all ✓ 자기 지사                                 | all                      |
| `lms_sessions`   | ✗                                  | ✗(RPC만)         | ✗                                                                                                         | ✗                                               | select(감사)             |
| `login_attempts` | ✗                                  | ✗                | ✗                                                                                                         | ✗                                               | select                   |

- 학생은 **어디에도 쓰기 없음**. 관리자 모드는 클라이언트에서 메뉴 미생성 + 서버에서 위 정책.
- `with check`까지 모두 명시(insert에서 다른 지사 id를 넣는 경로 차단).

### 4.5 엑셀 업로드

- **파싱 위치: 브라우저**(SheetJS `xlsx` CDN, 관리자 화면에서만 지연 로드). 서버 함수 없음(정적 SPA 유지).
  CSV도 같은 경로로 받는다.
- 템플릿 2종(첫 행 = 열 이름, 한글):
  1. `회원_일괄등록.xlsx`: `역할(선생님|학생)`, `아이디`, `비밀번호`, `이름`, `반(선택)`. 최고관리자용에는
     `지사` 열이 추가.
  2. `반_배정.xlsx`: `반`, `아이디`.
- 검증(클라이언트, 업로드 전): 열 이름, 역할 값, 아이디·비밀번호 규칙, 파일 내 중복, 권한(선생님은 학생만),
  반 존재 여부. 그 다음 `rpc lms_check_login_ids(p_ids text[])` 1회로 DB 중복을 받아 **미리보기 표**에
  행별 상태(신규/중복→제안 아이디/오류)를 보여 준다.
- 실행: `rpc lms_bulk_create_members(p_rows jsonb, p_auto_suffix boolean)` **1회 = 1 트랜잭션**(plpgsql).
  오류 행이 하나라도 있으면 전체 롤백하고 행별 사유를 돌려준다(부분 성공 없음 — 중복 계정이 반만 생기는
  상황을 막는다). 결과표: 행 / 아이디(최종) / 역할 / 반 / 결과. 반 배정도 같은 방식 `lms_bulk_assign`.
- 한도: 1회 500행(초과 시 파일을 나누라고 안내).

### 4.6 관리자 화면

| 메뉴(`.admin-menu`) | 최고관리자     | 지사(1)                     | 선생님(2)                      | 학생(3) |
| ------------------- | -------------- | --------------------------- | ------------------------------ | ------- |
| 콘텐츠              | ✓              | ✗                           | ✗                              | ✗       |
| 배너                | ✓              | ✗                           | ✗                              | ✗       |
| 버튼(R4)            | ✓              | ✗                           | ✗                              | ✗       |
| 지사                | ✓(생성·비활성) | ✗                           | ✗                              | ✗       |
| 회원                | ✓ 전체         | ✓ 자기 지사 선생님·학생     | ✓ 자기 지사 학생(생성)         | ✗       |
| 반                  | ✓ 전체         | ✓ 자기 지사(생성·담당 배정) | ✓ 자기 반(생성 시 담당 = 본인) | ✗       |
| 엑셀 업로드         | ✓              | ✓                           | ✓(학생만)                      | ✗       |

- 라우트 가드: `openAdmin()`이 `isAdmin || role in (1,2)`일 때만 열고 `setAdminView`는 역할 허용 목록 밖
  뷰를 거부. 헤더 Admin 버튼은 역할 1·2에도 표시(이름을 "Admin" 그대로 둘지 **확인 필요**).
- 학생: Admin 버튼 미생성, `#admin` 해시 직접 입력 → 로그인 화면으로. 영상 재생은 허용(열람).
- 회원 목록은 지사·반 필터 + 검색. 비밀번호 초기화는 RPC(새 비밀번호 입력, 규칙 4~10자).

### 4.7 마이그레이션 (무중단 순서)

1. SQL 1차(추가만): `branches` + 본사 행, `members` 새 컬럼(`member_id`, `branch_id` ← 본사, `role` ← grade),
   `classes`·`class_members`·`lms_sessions`·`login_attempts`, 새 RPC·정책 함수·RLS **추가**. 기존 RPC와
   `id` 컬럼은 남긴다(구 클라이언트가 계속 동작).
2. 클라이언트 배포: 로그인 폼(지사 선택) + 세션 토큰 + 역할별 관리자 메뉴. 기존 회원은 본사 지사 + 기존
   아이디·비밀번호로 그대로 로그인.
3. 검증(실계정 4종) 후 SQL 2차: 구 RPC 제거, `id` → `login_id` rename, pk 교체, 구 unique 제거.
4. `NOTES.md`·`SUPABASE_SETUP.md` 갱신(관리자 아이디는 여전히 이메일, `@` 분기 유지).

### 4.8 보안 위험 목록

| 위험                            | 대응                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 4자리 숫자 비밀번호 무차별 대입 | 아이디별 5회/15분 잠금 + IP별 한도(헤더 확보 시) + 실패 응답 지연 없음(DB 부하 방지). 학생은 쓰기 권한이 없어 피해 범위가 열람        |
| 토큰 탈취(XSS)                  | 외부 스크립트는 CDN 4개(supabase-js, Vimeo, YouTube, SheetJS)뿐, 버전 고정 권고. 토큰은 URL에 넣지 않음. 만료 30일·로그아웃 즉시 무효 |
| Supabase API 로그에 헤더 노출   | `x-lms-token`이 로그에 남는지 **확인 필요**; 남으면 토큰을 해시해 저장(DB에는 `sha256(token)`)                                        |
| 지사 간 데이터 누출             | 모든 정책에 `branch_id = lms_member().branch_id` + `with check`. 정책 테스트 스크립트(anon 키 + 역할별 토큰으로 거부 확인)            |
| 선생님이 다른 지사·역할 생성    | RPC가 호출자 역할·지사로 입력값을 **덮어쓴다**(입력 신뢰 안 함)                                                                       |
| 세션 테이블 비대                | 로그인 RPC에서 만료 행 삭제(pg_cron 불필요)                                                                                           |
| 아이디 열거                     | 중복 확인 RPC는 호출자 지사 안에서만 답한다                                                                                           |
| 관리자 계정                     | 변경 없음(Supabase Auth + 이메일). 자가입 계속 꺼짐                                                                                   |
| 기존 grade 3 "차단" 의미 소실   | §6 질문. 차단을 유지하려면 `members.blocked boolean` 별도 플래그                                                                      |

### 4.9 정오 메모 — Phase 3A 지시서(`2026-10-23`) 결정 D5a~D15 반영

§4.2~4.4의 초안 위에 덮어쓴다(충돌 시 이 표가 우선). 구현: `supabase/migration.sql` "LMS (Phase 3A)" 블록, 검증
`tests/lms-sql.spec.js`·`supabase/lms/verify-3a.sql`.

| #    | 초안(§4.2~4.4)                                            | 확정 · 구현                                                                                                                                                                                                                  |
| ---- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D7a  | `lms_login(p_branch_code, p_login_id, p_password)`        | `lms_login(p_login_id, p_password, p_branch_id default null)`. 활성 지사의 활성 회원 전체에서 정규화 아이디 검색 → bcrypt. 일치 1 = 세션, 2+ = `{status:'choose', branches}`(비밀번호가 맞은 뒤에만), `p_branch_id`로 재호출 |
| D7b  | `unique (branch_id, lower(login_id))`                     | `(lms_norm_id(id), branch_id)` 유니크(전 역할) + 지사 계정(role 1)은 `lms_norm_id(id)` 전역 유니크(부분 인덱스)                                                                                                              |
| D7c  | 실패 시 예외                                              | 예외 없음. 항상 jsonb `ok·choose·invalid·locked`. 아이디 없음 = 비밀번호 틀림(같은 응답), 아이디 없을 때 더미 bcrypt 1회                                                                                                     |
| D7d  | 5회 → 15분, IP 한도 미정, 키 `branch/login`               | 키 `id:<정규화 아이디>` 5회 → 10분(1일 창 — 잠금 후 실패마다 재잠금), `ip:<addr>` 30회/10분 → 10분. 성공 시 아이디 키 삭제, 잠금 중 비교 안 함, `lms_login`이 만료 세션·1일 지난 시도 행 정리                                |
| D7e  | `x-forwarded-for`(확인 필요)                              | `lms_client_ip()` 한 곳. 1차 = `cf-connecting-ip`만, 없으면 null(IP 제한 생략). 탐침(`lms_probe_headers`, 임시) 결과로 이 함수만 패치                                                                                        |
| D10a | 토큰 원문 저장, 로그 노출 시 해시(확인 필요)              | **항상 `sha256(token)`만 저장**(`lms_sessions.token_hash`). 원문은 `lms_login` 응답 1회. 32바이트 base64url(43자)                                                                                                            |
| D10b | `lms_member()` stable security definer                    | 같음 + `search_path = public, extensions`, `request.headers`가 `''`일 때도 안전. 정책은 `(select … from lms_member() m)`                                                                                                     |
| D10c | 30일 슬라이딩(방법 미정)                                  | `lms_session()`(volatile)이 연장·`last_seen_at` 갱신·`{role, branch_id, branch_name, display_name}` 반환, 무효면 null. `lms_logout()` = 행 삭제                                                                              |
| D5a  | `^[\p{L}\p{N}._-]{2,20}$`                                 | Postgres 정규식에 `\p{L}` 없음 → `^[0-9a-z가-힣._-]{2,20}$`, **생성·변경 시에만**(3.3 RPC). 로그인은 `lms_norm_id` = NFC → 앞뒤 공백 제거 → 소문자만                                                                         |
| D6a  | `^[\x21-\x7E]{4,10}$`                                     | 같은 규칙을 **설정 시에만**. 로그인은 기존 비밀번호(10자 초과 등) 그대로 받음                                                                                                                                                |
| D13  | `role` = 기존 `grade` 그대로                              | 최소 권한: 전원 `hq`(TPS 본사), grade 1·2 → **2**, grade 3 → 3. 3.1~3.3 사이 구 관리자 탭 생성·수정분은 트리거가 같은 매핑으로 채움                                                                                          |
| D14  | `branches` 익명 select(로그인 폼), `members` 학생 자기 행 | `branches` 익명 select 없음(지사 목록 폼 없음), LMS는 자기 지사 행만. `members`는 LMS select 정책 없음(해시 보호) — 본인 정보는 `lms_session()`                                                                              |
| D15  | 3.2에서 역할별 헤더 버튼                                  | 3.2는 LMS 사용자 = Log out만. My Branch·My Class는 3.3                                                                                                                                                                       |
| D8a  | §6-4 등급 3 차단 폐기                                     | 3.2에서 차단 팝업 게이트·테스트 제거(새 의미 = 학생 열람)                                                                                                                                                                    |
| 3.1  | `id` → `login_id` rename, pk 교체                         | 3.1에서는 하지 않음(`id`·`grade`·pk·구 RPC 유지). 3.5에서                                                                                                                                                                    |

**구현 중 확인한 사실(워커):**

- RLS 정책 안에서 호출하는 함수는 **조회하는 역할의 EXECUTE 권한**이 필요하다 → `lms_member()`와 반 정책 도우미
  2개(`lms_my_class_ids`·`lms_managed_class_ids`)는 anon에 grant(호출자 자신의 세션 정보만 반환).
- 인덱스 식 함수도 **행을 쓰는 역할의 EXECUTE**를 검사한다 → `lms_norm_id`는 authenticated에 grant(관리자의
  members 직접 쓰기). anon은 계속 막힘.
- `classes` ↔ `class_members` 정책이 서로를 조회하면 재귀 오류 → SECURITY DEFINER 도우미로 끊었다.
- 새 테이블 권한은 Supabase 기본 권한에 기대지 않고 명시(`revoke all` 후 필요한 것만 `grant`).

**독립 보안 검토 반영(`2026-10-23`, 읽기 전용 리뷰 에이전트):**

| 지적                                                                               | 반영                                                                                                                       |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 높음 — 구 `verify_member_login`이 anon에 열린 무제한 비밀번호 확인 창구(잠금 우회) | 같은 시그니처·결과(grade 또는 NULL)로 재정의: **본사(hq) 회원만**, `lms_login`과 같은 잠금 공유, 없는 아이디도 더미 bcrypt |
| 중간 — 동시 요청이 잠금 검사를 함께 통과                                           | `lms_throttle_wait()`가 아이디 키별 `pg_advisory_xact_lock` 후 잠금 확인(같은 아이디 시도는 순서대로)                      |
| 중간 — 같은 정규화 아이디의 내 계정 로그인으로 남의 실패 카운터 초기화             | 비밀번호가 **그 아이디의 모든 계정**에 맞을 때만 초기화                                                                    |
| 중간 — IPv6 주소 회전                                                              | `lms_client_ip()`가 주소로 파싱(실패 = NULL), IPv6는 /64로 묶음                                                            |
| 낮음 — 비밀번호를 바꿔도 세션 유지                                                 | 트리거가 비밀번호 변경 시 그 회원의 세션 삭제                                                                              |
| 낮음 — 깨진 해시에서 `crypt()` 예외(로그인 전체가 오류)                            | 비교를 예외 블록으로 감싸 불일치 처리                                                                                      |
| 낮음 — 검증 SQL이 아무 오류나 "거부"로 통과, 비관리자 Auth 사용자 쓰기 미검증 등   | `42501`만 인정, 비관리자 authenticated 읽기·쓰기, 창 만료 후 재계산, 위 수정마다 케이스 추가(115행)                        |

**위험·미결:**

1. **pk(`id`)가 전역 유일이라 3.5 전에는 "완전히 같은" 아이디를 두 지사에 만들 수 없다.** 지금 D7a의 choose는
   대소문자·NFC 변형(`kim`/`KIM`)으로만 생긴다. 3.3에서 지사가 계정을 만들면 다른 지사와 같은 아이디가 pk 충돌로
   실패하므로, **pk 교체(3.5의 일부)를 3.3 전에 할지** 결정 필요.
2. 지사 계정 전역 유일은 role 1끼리만 인덱스로 보장. "지사 아이디 = 다른 지사 선생님 아이디" 금지는 3.3 생성
   RPC에서 검사할지 결정 필요.
3. 브라우저가 `x-lms-token` 사용자 정의 헤더를 보내려면 Supabase CORS가 그 헤더를 허용해야 한다 — 탐침 때 사전
   요청으로 확인(3.2 전제).
4. IP 헤더 확정 전에는 아이디 제한만 동작. `lms_login`은 익명 호출 가능하므로 bcrypt 부하는 Supabase API 자체
   한도와 IP 제한(헤더 확정 후)에 기댄다.
5. **잠금 악용:** 남의 아이디를 알면 10분마다 1번 틀려 계속 잠가 둘 수 있고, 한 유치원(같은 IP)에서 10분에 30번
   틀리면 그 반 전체가 10분 잠긴다. 관리자는 `login_attempts`를 읽기만 가능 → 3.3 관리자 화면에 "잠금 해제" 추가 제안.
6. **흔한 이름(동명이인) 사용성:** pk 교체 후 같은 아이디가 여러 지사에 생기면, 한쪽 학생의 성공이 공유 카운터를
   지우지 않으므로 두 학생의 오타가 하루 동안 합산된다(5회 → 잠금). 3.5에서 카운터 키를 계정 단위로 나눌지 결정.
7. 아이디 키 직렬화는 PGlite(연결 1개)에서 동시성 재현이 안 돼 코드 경로만 검증됨.

**정오 메모 — Phase 3B-1 지시서(`2026-10-31`) D41~D47·D49 반영 (`2026-11-01`).** 위 표·§4.3~4.6 초안보다 우선. 구현:
`supabase/migration.sql` "LMS (Phase 3B)" 블록, 점검 `supabase/lms/00-precheck-3b.sql`, 검증 `supabase/lms/verify-3b.sql`·
`tests/lms-3b-sql.spec.js`.

| #   | 초안·이전 결정                                            | 확정 · 구현                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D41 | pk 교체는 3.5(위 3.1 행), 위험 1                          | **3B에서 교체.** `members_member_id_key`(외래 키들이 쓰던 member_id 고유 인덱스)를 그대로 기본 키로(외래 키 무변경). 아이디 유일성 = 기존 두 인덱스. 같은 아이디를 다른 지사에 만들 수 있다(위험 1 해소). 운영 의존 객체는 precheck-3b가 조회(D27·D28 전례)   |
| D42 | 구 RPC는 3.5에서 제거                                     | `create_member`·`update_member`·`set_member_active`(+ 운영 전용 5인자) 삭제, migration.sql 위쪽 정의도 삭제. `grade`는 **NULL 허용**(워커 선택: 새 계정은 role만). `verify_member_login`·`grade`·`lms_probe_headers`는 3.5                                    |
| D43 | `id` → `login_id` rename(§4.3)                            | 취소. 열 이름 `id` 유지(RPC 결과에서만 `login_id`)                                                                                                                                                                                                            |
| D44 | 지사 안 유일 + 접미사 제안, 위험 2                        | 지사 계정 아이디 = 모든 지사의 모든 회원과 겹치면 안 됨, 다른 회원 아이디 = 모든 지사 계정과 겹치면 안 됨(인덱스가 아니라 RPC가 검사, 쓰기는 advisory lock 하나로 직렬화). 지사 안 중복 → 다음 빈 접미사(`김민준2`). 아이디·비밀번호 규칙은 생성·변경 때만    |
| D45 | §4.4 RLS 매트릭스(직접 쓰기 ✓)                            | **쓰기는 전부 SECURITY DEFINER RPC**(LMS 역할의 직접 쓰기 정책 없음 — 워커 선택). 호출자 = 관리자 JWT 또는 LMS 토큰(`lms_caller()`), 역할·지사는 호출자 것으로 덮어씀. 범위 밖·안 보이는 대상 = `42501`, 그 밖 = jsonb `status`                               |
| D46 | 위험 5(잠금 해제 제안)                                    | `lms_unlock_member`(관리자·지사 = 지사 회원·선생님 = 자기 반 학생), `lms_unlock_key`(관리자만, IP 포함). 아이디 키는 지사 공통이라 다른 지사의 같은 아이디도 함께 풀림(수용). 회원 목록에 `locked`·`lock_retry_sec`                                           |
| D47 | §4.4(지사 all)                                            | 삭제 = 최고관리자만(회원·반). 지사·선생님은 활성 전환만. 비활성(트리거 `members_lms_end_sessions`)·비밀번호 초기화(`members_lms_compat`)·지사 비활성 시 세션 즉시 삭제                                                                                        |
| D49 | 배포 단위                                                 | 3.3 + 3.4 한 번에. 운영 순서 = 테스트 계정 삭제 확인 → precheck-3b → migration.sql 전체 → verify-3b → 곧바로 푸시(안내문은 멈춤 3)                                                                                                                            |
| —   | §4.5 `lms_check_login_ids(p_ids)`·`lms_bulk_*(p_rows, …)` | `lms_check_login_ids(p_ids, p_role, p_branch_id?)`(역할별 규칙이 달라서), `lms_bulk_assign(p_rows, p_branch_id?)`(반 이름은 지사 안에서만 유일 — 관리자는 지사 지정). 지사 계정 아이디는 모든 지사 기준으로 "중복" 답(D44 생성 규칙과 같은 답)                |
| D50 | 위 R1(멈춤 1 보고)                                        | 로그인 성공 뒤 그 기기에 지사(id·이름만)를 기억 → 다음 로그인부터 `p_branch_id`. 로그아웃해도 유지. 기억된 지사로 invalid면 지사 없이 재시도 안 함. 로그인 창에 지사 이름 + "Not <지사>?"(기억 삭제). 관리자 `@` 무변경 (3B-2 화면)                           |
| D51 | 위 M1                                                     | 선생님은 **반이 없는** 자기 지사 학생만 자기 반에 넣는다(`lms_class_add_member` 42501, `lms_bulk_assign` 행 사유 `in_other_class`). 빼기는 가능. 다른 반 학생 이동 = 지사 계정·최고관리자. 목록에 `in_class`(어느 반이든 있음 — 선생님에게 반 이름은 안 보임) |
| D52 | 위 L8                                                     | 아이디 변경 = 최고관리자·지사 계정만. 선생님이 `p_login_id`를 보내면 42501(이름·비밀번호·활성만)                                                                                                                                                              |

**위험·미결(3B-1):**

1. **대량 생성 시간:** Supabase 기본 `statement_timeout`(anon 3초·authenticated 8초)을 넘을 수 있다 — LMS 사용자는 anon이고 행마다
   bcrypt 1회. PGlite로는 실제 시간을 잴 수 없어 멈춤 3(운영)에서 행 수별 시간 확인 필요. 넘으면 클라이언트가 나눠 보내야 하는데, 그러면
   "1회 = 전부 롤백" 범위가 파일 전체가 아니라 묶음 단위가 된다(PM 결정 필요).
2. 아이디 변경(`lms_member_update`의 `p_login_id`)은 D44 "변경 RPC"를 근거로 넣었다. "이름 수정"이 표시 이름만 뜻했다면 빼도 된다.
3. 반 배정 대상은 학생(role 3)만으로 막았다(선생님은 `classes.teacher_id`로만 반에 연결).

**독립 보안 검토 반영(`2026-11-01`, rls-security-reviewer):**

| 지적                                                                                                                                                                                                                                            | 반영                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **높음 H1** — 선생님이 다른 지사 선생님과 같은 아이디의 학생을 만들고 그 비밀번호를 추측값으로 바꿔 로그인 → 자기 학생만 맞으면 `ok`, 추측이 맞으면 `choose` → 실패 기록 0으로 무제한 추측, 결국 상대 토큰                                      | `lms_login`이 **계정별 실패 키 `m:<member_id>`**도 센다: 비교했는데 안 맞은 계정마다 1회(다른 계정이 맞아도), 잠긴 계정은 비교하지 않음(같은 bcrypt 시간), `p_branch_id`가 있으면 그 지사만 비교. `verify_member_login`도 같은 키 |
| **높음 H2** — 잠기면 자기 학생 "잠금 해제"로 지사 공통 `id:` 키를 지워 반복                                                                                                                                                                     | 상대 계정의 실패는 그 계정 키에 쌓여 `id:` 키를 지워도 소용없음. `lms_unlock_member`는 `id:`·`m:` 둘 다 지우되 범위 검사는 그대로(다른 지사 계정 키는 못 지움). 관리자 `lms_unlock_key`는 `m:` 키도                               |
| 낮음 L1 대량 생성 선생님 행에 반 → 선생님이 반 학생으로 / L3 선생님 목록의 `class_ids`가 남의 반까지                                                                                                                                            | 반 지정 행은 학생만(`not_student`) / 선생님에게는 자기 반만                                                                                                                                                                       |
| 낮음 L6 role·grade 둘 다 없는 행이 선생님(role 2)이 됨, grade만 바꿔도 role이 바뀜                                                                                                                                                              | `lms_members_compat`: grade가 있을 때만 매핑, UPDATE 때 grade→role 따라가기 삭제(옛 회원 탭이 없어짐)                                                                                                                             |
| 낮음 L7 잠금 번호 7302가 교사 자료실과 겹침 / L9 `crypt`가 `public`에서 먼저 찾아짐 / L11 precheck가 인덱스 이름만 봄 / L12 trace 세션 수가 운영 트래픽에 흔들림                                                                                | 7303 / 3B 함수는 `extensions.crypt` 등 스키마 명시 / precheck 21번 행(고유·유효·부분 아님·member_id 한 열) / trace에서 전체 세션 수 비교를 빼고 테스트 회원의 `m:` 키 확인                                                        |
| 중간 M1 선생님이 같은 지사 아무 학생을 자기 반에 넣은 뒤 수정 → "자기 반 학생만"이 사실상 "지사 모든 학생"                                                                                                                                      | **PM 결정 필요**(그대로 수용 / 반이 없는 학생만 넣기 — 다른 반 학생 이동은 지사 계정만)                                                                                                                                           |
| 중간 M2 3B SQL만 먼저 운영에 돌리면 옛 관리자 '회원' 탭(옛 RPC)이 멈춤 / M3 대량 생성 시간·전역 잠금                                                                                                                                            | M2: D49대로 새 관리자 화면과 **같은 푸시**에서만 운영 반영 / M3: 위 위험 1, 멈춤 3에서 실측                                                                                                                                       |
| 낮음 L2 비밀번호 초기화와 동시에 옛 비밀번호로 로그인하면 그 세션이 남음(수 ms) · L4 지사 계정 아이디는 `duplicate` 답으로 확인 가능(D44 구조) · L5 같은 아이디 계정 수가 로그인 시간에 드러남 · L8 아이디 변경 · L10 운영 실행 중 members 잠금 | 보고만(3.5 또는 PM 결정). L10은 사용이 적은 시간에 실행                                                                                                                                                                           |

검증: `verify-3b` 274행에 공격 재현 구역(`homonym`) 추가 — 수정 전 SQL에서 해당 행 실패 확인 후 수정. 수정마다 되돌린 변형 9종 모두 실패 행.

**재검토(같은 에이전트, 수정본): 높음 0** — H1·H2 막힘 확인. 새로 나온 것:

| 지적                                                                                                                                                                                                  | 처리                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **중간 R1(H1 수정의 부작용)** — 다른 지사에 같은 아이디·**다른 비밀번호**가 있으면, 지금 클라이언트(첫 호출에 지사 없음)로 한쪽이 정상 로그인할 때마다 다른 쪽 `m:` 키에 1회 → 하루 5회면 상대가 잠김 | **PM 결정 필요.** 추천: 서버는 그대로(H1 차단 유지), 3B-2 화면 지시서에 "로그인 성공 뒤 그 기기에 지사를 기억해 다음부터 `p_branch_id`로 보냄"을 넣는다. D49대로 SQL과 화면이 같은 푸시라 운영에는 R1이 나가지 않는다. 대안(지사 없는 성공 때 남의 키를 안 셈)은 H1을 다시 연다 — 비추천. verify-3b에 현재 동작을 고정(지사 없이 +1, 지사 지정 시 0) |
| 낮음 R2 같은 아이디 계정을 일부러 만든 내부자가 상대 계정을 일반 잠금 한도(하루 약 149회)로 떠보거나 10분씩 잠글 수 있음                                                                              | 수용(예전 공통 키로도 아이디 단위 잠금은 가능했음). PM에 명시                                                                                                                                                                                                                                                                                        |
| 낮음 R3 "비교한 계정이 전부 자기 키로 잠김" 때의 `locked` 답이 그 아이디의 계정 존재를 약하게 시사                                                                                                    | 수용(응답 형식은 기존 잠금과 같음)                                                                                                                                                                                                                                                                                                                   |
| 낮음 R4 `extensions.` 명시가 3B 함수에만                                                                                                                                                              | `lms_login`·`verify_member_login`에도 적용                                                                                                                                                                                                                                                                                                           |

**3B-2 1단계 재검토(D51·D52 반영, `2026-11-01`): 높음 0, 중간 0.** 선생님이 남의 반 학생을 빼앗거나 고치는 경로(넣기·대량 배정·대량 생성·수정·
잠금 해제·빼기·반 생성/변경) 모두 막힘 확인. 낮음 N1 "같은 순간 두 번 넣기면 D51 검사를 둘 다 통과" → 학생별 잠금
`pg_advisory_xact_lock(7304, …)`(넣기·대량 배정, 모든 호출자) 반영. N2 `in_class`로 같은 지사 학생의 "반 있음" 1비트 = 수용(D51
화면에 필요, 42501 응답으로도 알 수 있음). N3 `lms_member_list` 지웠다 만드는 가드 = 재실행 안전(참고). 참고: D51을 글자 그대로
구현해 선생님이 **자기 반 X → 자기 반 Y**로 옮기는 것도 한 번에는 42501(빼고 넣으면 됨). 지사 생성에 코드 입력(`p_code`, 3B-2 화면
지시서) 추가 — 옛 1인자 시그니처는 drop(PostgREST 모호성 방지). 재검토 #4(잠금·코드 반영본): **높음 0, 중간 0**. 낮음 N4 대량 배정
두 건이 같은 학생들을 반대 순서로 잠그면 교착(40P01 — 한쪽 전부 롤백, 다시 보내면 됨) → 3.4 지시서에서(정렬 잠금 또는 1회 재시도).
낮음 N5 관리자가 같은 지사 이름·코드로 동시에 두 번 만들면 `duplicate` 대신 23505 오류(데이터는 고유 제약이 지킴) → 수용.

## 5. 테스트·검증 방침 요약

- 공유 파일 규칙(`video-source.js`, 새 `board-view.js`): 재선언 금지 테스트(기존 "loads before app.js
  without redeclaration" 확장).
- 페이지2 무변경 증명: 추출 전후 픽셀 비교 16장(§2.4-1). 기준선은 추출 **전** 커밋에서 찍는다.
- 학생 페이지: REST 픽스처, Storage 0건 가드(기존), 교재별 슬롯 14/24개, 다른 교재 슬롯이 DOM에 없음,
  요일 게임 URL → "Let's play!", 아이폰 프로젝트 테스트 유지.
- CSV 70행·표지 파일 70개 존재(Node 테스트).
- LMS: RPC 단위는 SQL Editor 수동 + Playwright는 REST를 픽스처로(로그인·역할 메뉴·가드). RLS 거부는
  별도 Node 스크립트(실 프로젝트, 읽기 전용 호출, 사용자 승인 후).

## 6. 남은 결정 질문 — **PM 답변 반영 (`2026-10-22` Phase 1 지시서)**

| #   | 질문                                      | 결정                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | QR 레벨 토큰 생성값                       | `b`, `l1`~`l3` 유지. 파서는 `1~3`도 수용                                                                                                                                                                                                                    |
| 2   | Level 1~3 학생 툴바                       | 4버튼 한 줄(Good Morning · Good Bye · 그 교재 Game · 그 교재 Song). 모양·색은 선생님 사이트와 동일                                                                                                                                                          |
| 3   | 학생 페이지 헤더                          | 브랜드 문구만(레벨 버튼·Admin·Log out 없음)                                                                                                                                                                                                                 |
| 4   | 기존 등급 3 "영상 차단"                   | 폐기 → 새 등급 3 = 학생(열람). 마이그레이션 때 현재 등급 3 회원 목록만 보고                                                                                                                                                                                 |
| 5   | 역할별 헤더 버튼 이름                     | 최고관리자 "Admin", 지사 "My Branch", 선생님 "My Class"                                                                                                                                                                                                     |
| 6   | 지사 입력 방식                            | **지사 자동 판별**: 아이디+비밀번호를 전 지사에서 검색 → 1건이면 로그인, 2건 이상이면 지사 선택 화면. 지사 계정은 전역 유일(코드 불필요). 시도 제한(IP·아이디) 필수. 한글 아이디: 저장·비교 시 NFC 정규화, 앞뒤 공백 제거, 내부 공백 금지, 영문 소문자 통일 |
| 7   | 표지 정적화 Storage 다운로드(1회, 5~8 MB) | **승인** — Phase 2 시작 시 실행                                                                                                                                                                                                                             |

§4.2의 `lms_login(p_branch_code, …)`는 6번 결정에 따라 `lms_login(p_login_id, p_password)` → 전 지사 검색,
복수 일치 시 `{ choose: [{branch_id, branch_name}] }`를 돌려주고 두 번째 호출에 `p_branch_id`를 받는 형태로
Phase 3 세부화 때 고친다. 시도 제한 키는 아이디 단독(`id:<login_id>`)과 IP.
