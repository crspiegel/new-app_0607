# Beginner QR코드 + 학생용 영상 페이지 — 설계

작성 `2026-10-19`. 대상: 새 학생용 페이지(`play.html`) + 네이버 QR 입력용 URL 목록.
근거: `docs/worker-briefs/2026-10-19-qr-student-play-page-brief.md` (승인된 요구사항).
상태: **초안 — 사용자 확인 질문(§9) 답변 전.** 호스팅 안(①/②)이 정해지기 전에도 구현을
시작할 수 있게 설계했다(§5 재생 전략 스위치).

## 1. 목표 · 범위 · 비범위

**목표.** 도서에 인쇄된 QR을 학생이 스마트폰으로 스캔하면, 선생님용 사이트(페이지2)가
아니라 **학생 전용 페이지에서 그 버튼의 영상(또는 게임)만** 열린다.

| 구분         | 내용                                                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 범위         | Beginner(내부 키 `"Level 1"`) 3월~12월, 월당 24슬롯(툴바 4 + 요일 20) = **QR 240개**. 학생 페이지 1개, `/q/...` 짧은 경로, 네이버 QR 입력용 CSV, 테스트.                                |
| 비범위       | 선생님 전용 전환(메인 사이트 로그인 강제), QR 이미지 자체 생성(네이버 QR 사용 — 사용자 결정), Vimeo 허용 도메인 추가 요청(불가 — 사용자 결정), Level 1~3 QR 발행(스킴만 확장 가능하게). |
| 금지(안티골) | Referer 위조 프록시·영상 재업로드(출판사 접근제어 우회·라이선스), 학생 페이지에서 메인 사이트·다른 레벨로 가는 링크, Storage 이미지 로드(egress), 기존 승인 화면 변경.                  |
| 실패로 볼 것 | 기술적으로 재생돼도 ① 아이가 다른 콘텐츠로 쉽게 이탈, ② 인쇄 후 URL 스킴을 바꿔야 하는 상황, ③ 학생 트래픽이 Supabase 402를 부르는 것.                                                  |

## 2. 분석 결과 요약 (2026-10-19 재조회)

REST 1회(`content_pages?level=eq.Level%201&select=level,month,videos,labels`, 6,271 B, Storage 0).

| 월       | 툴바 채움            | 요일 채움    | 요일 고유 URL | 비고                                                                            |
| -------- | -------------------- | ------------ | ------------- | ------------------------------------------------------------------------------- |
| 3월      | 3/4 (unit 비어 있음) | 20/20        | **5**         | w1은 Mon·Wed·Fri=Vimeo `/58?video=173725167`, **Tue·Thu=YouTube `LPl2AR2rm0g`** |
| 4월      | 3/4                  | 20/20        | 4             | 주당 1개 영상을 5일에 복사                                                      |
| 5월~12월 | 3/4                  | 4/20 (Mon만) | 4             | 전부 `tps-education.com/58·60·61?video=<id>`                                    |
| **합계** | 30/40                | 72/200       |               | **채움 102/240 (42.5%)**, 전체 고유 URL 44개                                    |

- 공통: `opening`=`youtu.be/tHybl0l9tbQ`, `ending`=`youtu.be/P23iESqE8lk`, `game`=
  `book-english-games.vercel.app/play/the-tractor`(10개월 동일), `unit` 10개월 전부 비어 있음,
  `labels` 전부 `{}`.
- 퍼블리셔 페이지: 3월·4월·5월 w1~2 = `/58`, 5월 w3 ~ 10월 = `/60`, 11·12월 = `/61`. 세 페이지
  모두 같은 스크립트(`urlParams.get('video')` → `player.vimeo.com/video/<id>?…&autoplay=1` iframe)로
  재생한다 → **Vimeo id 추출 규칙: 호스트가 `tps-education.com`(또는 하위)이고 `video` 쿼리가
  숫자이면 그 값.** 세 페이지 모두 `X-Frame-Options`/CSP frame-ancestors 없음(iframe 허용).
- 도메인 잠금 재현: `127.0.0.1`에서 `player.vimeo.com/video/{173725167, 173728500, 173431191}`
  3건 모두 "Because of its privacy settings, this video cannot be played here."
- 게임 `the-tractor`: 375×812에서 가로 넘침 없음(`scrollWidth 375`, 높이 812), 8개 미니게임 메뉴.
  **"Tractor"는 표시 Level 2 도서**(엑셀 `Level 2 TRACTOR`)라 Beginner용 게임이 아닌 자리표시자로 보인다.
- 엑셀 `영상링크_20260731.xlsx`: Beginner 관련 행은 "전체공통" 2개(Good Morning/Bye — DB와 동일)뿐.
  나머지는 표시 Level 1~3 노래와 Level 2 Tractor/Playground 요일 YouTube 링크. **Beginner 요일
  영상의 출처는 엑셀이 아니다.**
- `tps-education.com` DNS는 **호스트코코아**(`bns1~4.hostcocoa.com`) 관리. 하위 도메인 CNAME은
  TPS의 호스트코코아 계정에서 추가해야 한다.

## 3. QR이 가리키는 주소 (확정안)

**2단 간접 링크.** 인쇄 QR = 네이버 QR 단축 주소 → (네이버에서 수정 가능) → 우리 학생 페이지
경로(슬롯 식별자) → 페이지가 DB에서 현재 영상 URL을 읽음. 영상 교체는 관리자 화면에서,
도메인 교체는 네이버 QR에서 처리하므로 **인쇄물은 어느 쪽 변경에도 살아남는다.**

| 비교                     | 영상 URL 직접 인코딩                 | 학생 페이지 경로 인코딩 (채택)     |
| ------------------------ | ------------------------------------ | ---------------------------------- |
| 영상 교체·삭제           | QR 사망(네이버에서 240개 수동 수정)  | 관리자 화면에서 URL만 바꾸면 반영  |
| 도메인 잠금 Vimeo        | 재생 불가(퍼블리셔 페이지 통째 노출) | 학생 페이지가 재생 방식 선택(§5)   |
| 유튜브 앱 이탈·광고·추천 | 노출                                 | 임베드 + 컨트롤 최소화로 차단      |
| 홉 수                    | 네이버 1홉                           | 네이버 1홉 + 페이지 로드(REST 1회) |

**경로 포맷 (내 판단 — 인쇄물에는 네이버 주소만 들어가므로 바꿀 수 있지만, 네이버 240개를
다시 고치는 비용이 있으니 첫 등록 전에 확정):**

```
https://<host>/q/<lv>/<month>/<slot>          (예: /q/b/3/w1-mon, /q/b/12/opening)
https://<host>/play.html?l=<lv>&m=<month>&s=<slot>   (쿼리 fallback, 로컬 Vite·테스트용)
```

| 토큰    | 값                                                                                            | 규칙                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `lv`    | `b`=Beginner(`"Level 1"`), `l1`=`"Level 2"`, `l2`=`"Level 3"`, `l3`=`"Level 4"`               | **화면 표시명 기준**(인쇄물·교사가 보는 이름). 내부 키는 바꾸지 않는다.                                          |
| `month` | `3`~`12`                                                                                      | 화면의 월 숫자(=`months` index+3). 0 패딩 없이.                                                                  |
| `slot`  | `opening`·`ending`·`game`·`unit`(Level 1~3은 `game2`·`song1`·`song2`도) · `w1-mon` … `w4-fri` | **DB 슬롯 키를 소문자로**. 파서가 `w1-Mon`으로 복원. 대소문자 무시. 변환표 없음 → 키 이름을 바꾸지 않는 한 안전. |

- ⚠ **슬롯 키(`opening`, `w1-Mon` …)는 이제 인쇄물 계약이다.** 이름을 바꾸면 QR이 죽는다.
  `NOTES.md`에 기록한다.
- 쿼리 `?solo=1`은 (A) 플레이어 전용 모드(§4).
- 네이버 QR 관리 이름: `B-03-W1-MON`, `B-03-OPENING`, `B-12-GAME` (레벨-월 2자리-슬롯 대문자,
  정렬하면 책 순서).

**QR 인쇄 밀도.** 인쇄 QR에 들어가는 것은 네이버 단축 주소(블로그 기준 `m.site.naver.com/…`
형태, 약 30자 — 미확인)라 **우리 경로 길이는 밀도와 무관**하다. 30바이트면 오류정정 M → 버전 3
(29×29 모듈), 네이버 로고 삽입으로 H면 → 버전 4(33×33). 여백 4모듈 포함 41모듈을 20mm에 넣으면
모듈 0.49mm, 15mm면 0.37mm. **권장: 20mm 이상, 단색(검정/흰 배경), 시험 인쇄 후 저가
안드로이드·아이폰 기본 카메라로 스캔 확인.** (비교: 우리 주소를 직접 넣으면 45자 내외 → M 버전 4.)

## 4. (A) / (B) 비교와 권고

같은 페이지 하나로 둘 다 된다. (B)가 기본, (A)는 목록을 숨긴 모드.

| 항목                    | (A) 플레이어 전용 (`?solo=1`)  | (B) 플레이어 + 목록 (권고)                       |
| ----------------------- | ------------------------------ | ------------------------------------------------ |
| 화면                    | 플레이어 + ▶ 오버레이 + 제목만 | 위 플레이어, 아래 그 레벨·그 월 24개 목록        |
| 잘못 스캔했을 때        | 다시 스캔해야 함               | 목록에서 바로 선택                               |
| 수업 흐름 이어보기      | 불가                           | 월→금 순서로 이어보기, 영상 끝에 "Next" 가능     |
| 이탈 위험               | 최소                           | 같은 월 안으로 한정(다른 월·레벨·메인 링크 없음) |
| 빈 슬롯 많은 달(5~12월) | 해당 없음                      | Tue~Fri 16칸이 "Soon" — 흐리게 표시(내 판단)     |

**권고 (B).** 이유: 잘못 스캔해도 복구되고, 책의 한 달 흐름과 같은 그림(4주×5일)을 보여 준다.
목록은 해당 레벨·월로 한정하고 메인 사이트로 가는 링크는 두지 않는다. 최종 선택은 사용자(§9-2).

**모바일 세로 와이어프레임 (B)** — `DESIGN.md` L1 토큰(sunny-yellow 계열), Fredoka/Nunito,
이탤릭 금지, 영어 UI, 터치 타깃 ≥56px.

```
┌───────────────────────────────┐  배경 --level-accent-soft (#fff3cc)
│  Beginner · March  ③          │  레벨명(Sniglet) + 월 숫자 배지(Manrope 800, 원형)
├───────────────────────────────┤
│ ┌───────────────────────────┐ │
│ │                           │ │  16:9 플레이어 (가로 100%)
│ │          (  ▶  )          │ │  큰 ▶ 탭 오버레이 (지름 ≥96px) — 탭 전 재생 안 함
│ │                           │ │
│ └───────────────────────────┘ │
│  Week 1 · Mon · Opening Song  │  제목 (slotLabel 형식)
│  [⏯] [↺ Again]      [⛶]       │  최소 컨트롤 (§5 전략별, 퍼블리셔 iframe이면 숨김)
├───────────────────────────────┤
│ [Good Morning][Good Bye]      │  툴바 4 (2×2), 현재 항목 하이라이트
│ [Game]        [Unit Song]     │
│  1 │ Mon Tue Wed Thu Fri      │  주차별 5칸 × 4줄 (페이지2와 같은 모양)
│  2 │ Mon Tue Wed Thu Fri      │  현재 칸 = 진한 테두리 + ▶ 아이콘
│  3 │ Mon Tue Wed Thu Fri      │  빈 칸 = 흐림 + "Soon"(탭하면 Coming soon 카드)
│  4 │ Mon Tue Wed Thu Fri      │
└───────────────────────────────┘  푸터·내비·로그인 없음
```

(A)는 위 그림에서 목록 영역이 없고 플레이어가 세로 중앙에 온다. 가로로 돌리면 두 모드 모두
플레이어가 화면을 채운다(CSS `orientation: landscape`) — **아이폰 Safari는 요소 Fullscreen API를
지원하지 않으므로** 전체화면은 이 회전 레이아웃이 주 경로다.

## 5. 데이터 흐름과 재생 전략

```
URL 파싱(/q/... 또는 ?l=&m=&s=)
  → 잘못된 경로: "Oops! This code doesn't work." 카드 (링크 없음)
  → fetch REST 1행: GET {SUPABASE_URL}/rest/v1/content_pages
        ?level=eq.<internal>&month=eq.<Month>&select=videos,labels   (apikey 헤더, supabase-js 미사용)
  → 실패/402/오프라인: "Can't load right now." + [Try again] (자동 재시도 없음)
  → 행 없음 또는 슬롯 비어 있음: "Coming soon!" 카드 (목록은 그대로)
  → kind 판정 (video-source.js parseVideoSource + publisherVimeoId)
       youtube → YT IFrame API, playsinline:1, controls:0, disableYouTubeCaptions 3곳 그대로
       page(tps-education + video id) → PUBLISHER_STRATEGY 에 따라
            "direct"      : player.vimeo.com/video/<id> 를 Vimeo SDK로 직접 (①안, 하위 도메인 호스팅 시)
            "player-page" : iframe https://tps-education.com/<플레이어 페이지>?video=<id> (②안)
            "page"        : iframe 원래 퍼블리셔 URL (③안, 현재 사이트와 같은 방식 — 기본값)
       page(그 외 호스트) → iframe 원래 URL
       vimeo(허용된 id/URL) → Vimeo SDK
  → game 슬롯: "Let's play!" 카드 → 탭 시 location.assign(gameUrl) (같은 탭, 뒤로가기로 복귀)
  → 목록에서 다른 항목 탭: 같은 행 캐시로 즉시 전환(재요청 없음) + history.replaceState 로 경로 갱신
```

- **자동재생:** 진입 시 재생하지 않는다. ▶ 오버레이 탭 = 사용자 제스처 → 그때 플레이어 생성 +
  `play()`. 목록 탭도 제스처이므로 바로 재생.
- **`PUBLISHER_STRATEGY` 기본값 `"page"`** — 오늘 당장 재생되는 유일한 방식. ①/② 실측이 끝나면 이
  상수 하나만 바꾼다. 선생님 사이트(`app.js`)의 `kind:"page"` 동작은 바꾸지 않는다.
- **영상 종료:** 정지 + 종료 오버레이 [Watch again] / [Next ▶](B만, 다음 비어 있지 않은 슬롯).
  (사용자 확인 §9-6 전 내 판단.)
- **오프라인(dev):** `supabase-config.js`를 그대로 로드한다 → localhost에서는 URL/키가 비어
  REST를 부르지 않고 "Can't load" 상태. Playwright는 기존처럼 `cra:dev-live` 로 opt-in.

## 6. 코드 공유 — `video-source.js`

`app.js`는 classic script이고 DOM 참조(`vpFrame`, `videoModal` …)가 최상위에 있어 학생 페이지가
그대로 불러올 수 없다. **데이터·순수 함수만** 새 classic script `video-source.js`로 **옮긴다**(복사 아님):

`months`, `lessonTypes`, `weekdays`, `LEVEL_LABELS`, `levelLabel`, `TOOLBAR_BUTTONS`, `toolbarButtons`,
`YT_ID_RE`, `parseVideoSource`, `isExternalVideoPage`, `disableYouTubeCaptions` + 신규 순수 함수
`publisherVimeoId`, `weekdaySlotKeys`, `allSlotKeys`, `qrLevelCode`/`levelFromQrCode`, `slotToQr`/`slotFromQr`, `monthNumber`/`monthFromNumber`, `qrPath` (시그니처는 플랜 Task 1).

- classic script끼리는 최상위 `const`가 전역 렉시컬 스코프를 공유하므로 **`app.js`에서 해당 선언을
  지우지 않으면 `SyntaxError: redeclaration`** 으로 사이트 전체가 죽는다 → P1의 핵심 회귀 위험.
- `index.html`: `video-source.js`를 `app.js` **앞**에 로드. `eslint.config.mjs`: `app.js`·
  `background-editor.js`·`hero-banner.js`의 globals에 옮긴 이름 추가, `video-source.js`·`play.js`는
  `sourceType:"script"` 블록에.
- `mountYouTube`/`mountVimeo`는 모달 DOM·전역 상태에 묶여 있어 공유하지 않는다. `play.js`에 작은
  전용 마운트를 두고, **자막 OFF(`disableYouTubeCaptions` 3곳 호출)와 YouTube `playerVars`는 동일하게**.

## 7. 파일 변경 목록

| 파일                                        | 변경                                                                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `video-source.js` (신규)                    | §6 추출 + 신규 순수 함수                                                                                                                                                          |
| `app.js`                                    | 추출한 선언 삭제(동작 변경 없음). 237행 주석 "22 per page" → 24로 정정                                                                                                            |
| `index.html`                                | `<script src="video-source.js">` 1줄 (app.js 앞)                                                                                                                                  |
| `play.html` / `play.js` / `play.css` (신규) | 학생 페이지. **자산 경로는 전부 절대경로(`/play.js`)** — `/q/b/3/` 깊이에서 상대경로가 깨진다. `styles.css`(163KB)는 로드하지 않고 `play.css`에 필요한 토큰만(주석으로 출처 명시) |
| `vercel.json`                               | `rewrites: [{ "source": "/q/:path*", "destination": "/play.html" }]`. ①안이면 host 조건 규칙 추가(§8)                                                                             |
| `.vercelignore`                             | 변경 없음 확인(새 공개 파일 4개가 걸리지 않음). `scripts/make-qr-list.mjs`는 이미 `scripts` 제외                                                                                  |
| `package.json`                              | `lint`·`format:check` 대상에 `video-source.js play.js play.html play.css` 추가, 스크립트 `"qr:list"`                                                                              |
| `scripts/check-assets-case.mjs`             | `scannedFiles`에 `play.html`, `play.css`, `play.js` 추가                                                                                                                          |
| `eslint.config.mjs`                         | §6 globals                                                                                                                                                                        |
| `scripts/make-qr-list.mjs` (신규)           | 네이버 QR 입력용 CSV 생성(REST 1회, 의존성 없음). **QR 이미지 생성·`qrcode` 패키지 없음**                                                                                         |
| `tests/play.spec.js` (신규)                 | §10                                                                                                                                                                               |
| `NOTES.md` / `PROJECT_MEMORY.md`            | 슬롯 키 = 인쇄물 계약, 절대경로, `/q` rewrite는 Vite에서 안 됨, 재생 전략 상수                                                                                                    |

## 8. 호스팅 안 (사용자 결정 대기 — §9-1)

| 안  | 학생 페이지 위치                                              | `PUBLISHER_STRATEGY` | 전제 / 사용자 작업                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ①   | `play.tps-education.com` → 같은 Vercel 프로젝트에 도메인 추가 | `"direct"`           | **하위 도메인에서 Vimeo 재생 실측**(테스트 페이지 준비됨, 보고 참조). TPS 호스트코코아에서 CNAME. 이 호스트에서는 `/q/*`·플레이 자산만 응답하고 나머지는 404(vercel.json `has: host` 규칙) — 학생 도메인에서 선생님 사이트가 열리지 않게 |
| ②   | `www.cambridgereading.com/q/...`                              | `"player-page"`      | TPS가 아임웹에 헤더·푸터 없는 플레이어 페이지 추가(지금 `/58` 페이지에 이미 같은 스크립트가 코드 위젯으로 있음 → 가능성 높음). iframe 2겹이라 전체화면은 두 iframe 모두 `allowfullscreen` 필요                                           |
| ③   | `www.cambridgereading.com/q/...`                              | `"page"`             | 없음(지금 바로 가능). Muzzy 사이트 전체가 iframe에 보임 — **임시 운영용**                                                                                                                                                                |

**권고:** ③으로 먼저 구현·배포 가능 상태를 만들고(인쇄를 막지 않음), ① 실측 결과에 따라 ① → 안
되면 ②로 상수만 전환. 네이버 QR의 연결 주소는 최종 호스트가 정해진 뒤 한 번만 입력하는 것이 가장 쌉다.

## 9. 사용자 확인 질문 (우선순위 순)

이미 결정된 것: QR 단위 = 요일 버튼당 240개, 공통 영상·게임도 월별로 발행(240에 포함), QR은 네이버.

1. **호스팅:** ①(TPS 하위 도메인, DNS 작업 필요) / ②(아임웹 플레이어 페이지) / ③(임시 iframe) 중
   어디까지 진행할지. ① 실측을 위해 TPS 호스트코코아 DNS에 테스트 CNAME을 걸 수 있는지.
2. **(A)/(B):** (B) 권고.
3. **게임:** 탭하면 게임 페이지로 직접 이동(권고). 그리고 10개월 게임이 모두 `the-tractor`(표시
   Level 2 도서)인 이유 — 월별 Beginner 게임이 나올 예정인지.
4. **공개 여부:** 학생 페이지는 로그인 없이 공개로 가정(QR 흐름상 로그인 비현실적).
5. **인쇄:** QR 크기(20mm 이상 권장)·단색 여부, 시험 인쇄 가능 여부.
6. **영상 종료 후:** 정지 + [Watch again]/[Next] 오버레이(내 판단) vs 자동 다음 / 반복.

## 10. 위험과 완화

| 위험                                  | 완화                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase 402 (유예 소진)              | 페이지당 REST 1행(~650 B 본문), Storage 0, supabase-js·auth 호출 없음. 학생 1,000명 × 월 30스캔 × ~1.5 KB ≈ **45 MB/월**(5 GB 쿼터의 1% 미만). 영상 트래픽은 YouTube/Vimeo 몫. 테스트는 REST를 픽스처로 응답(아래). 402가 나도 학생 페이지만 "Can't load" — 인쇄물은 유효 |
| 모바일 자동재생 차단                  | ▶ 탭 오버레이로 제스처 확보, `playsinline:1`. 실기기 체크리스트(P6)                                                                                                                                                                                                       |
| 아이폰 전체화면                       | 요소 Fullscreen API 미지원 → 가로 회전 레이아웃이 주 경로, 전체화면 버튼은 지원 시에만 표시                                                                                                                                                                               |
| 도메인 잠금 Vimeo                     | §8 전략 스위치. 우회(Referer 위조·프록시·재업로드) 금지                                                                                                                                                                                                                   |
| ③안 이탈                              | 임시로만 사용, 최종은 ①/②                                                                                                                                                                                                                                                 |
| 게임 세로 화면                        | `the-tractor` 375px 실측 통과. 새 게임 URL이 들어오면 같은 확인(P6)                                                                                                                                                                                                       |
| 인쇄 후 스킴 변경                     | 1차 간접(네이버) 덕분에 경로를 바꿔도 네이버에서 240개 수정으로 복구 가능 — 단 비용이 커서 첫 등록 전에 §3 확정                                                                                                                                                           |
| 네이버 QR 의존                        | 240개가 **한 네이버 계정**에 묶임 → 개인 계정이 아닌 TPS 공용 계정 권장. 생성 개수 제한·"링크로 바로 이동" 옵션·대량 등록 가능 여부는 **미확인**(검색으로 확인 못 함 — 네이버 안내 확인 필요)                                                                             |
| 슬롯 키 변경                          | 인쇄물 계약으로 문서화. 테스트가 24개 키 목록을 고정값으로 단언                                                                                                                                                                                                           |
| P1 추출 회귀(중복 선언 → 사이트 다운) | P1은 동작 변경 없는 이동만, `qa` 126개 + 신규 "중복 선언 없음" 확인                                                                                                                                                                                                       |
| Vercel 플랜                           | 학생 트래픽이 붙으면 Vercel 대역폭·플랜 조건(Hobby의 상업적 이용 제한)을 한 번 확인할 것 — 확인 필요                                                                                                                                                                      |

## 11. 테스트 방침

- 새 파일 `tests/play.spec.js`. 학생 페이지는 **REST를 `page.route`로 픽스처 응답**한다(라이브 egress 0,
  결정적). 기존 `smoke.spec.js`의 "REST 스텁 금지"는 메인 사이트의 타이밍 민감 스펙 때문이며 별도
  페이지인 여기엔 해당하지 않는다(내 판단 — NOTES에 이유 기록).
- 가드: Storage 요청 0건, `content_pages` 요청 정확히 1건(목록 전환 후에도).
- `/q/...` rewrite는 Vite에서 동작하지 않으므로 테스트는 `play.html?l=&m=&s=`로, rewrite는 배포 후
  수동 확인(curl 200 + 실기기).

## 12. 백로그 후보 (필수 아님)

- 관리자 슬롯 편집기에 "QR 링크 보기/복사"(관리자 미러 규칙).
- 선생님 사이트 `mountExternalPage`도 ②의 플레이어 페이지로 바꾸면 Muzzy 메뉴 노출이 사라짐.
