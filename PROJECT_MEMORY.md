# Project Memory — Resume State

**Read this first when starting a new session.** It captures where we are, how we work, and
what's next, so any new session can continue without losing prior context.
(Document map → `CLAUDE.md`. Engineering gotchas → `NOTES.md`.)

## Snapshot

- Kindergarten English learning **static SPA** prototype (Cambridge Reading Adventures).
- Stack: HTML5 + CSS3 + Vanilla JS, served by Vite (dev only), Playwright smoke tests.
- Core files: `index.html`, `styles.css`, `app.js`.
- Supporting docs: `PRODUCT_SPEC.md`, `DESIGN.md`, `PLATFORM_ROADMAP.md`, `NOTES.md`.
- The later Next.js/Supabase/Capacitor rebuild is out of scope for now (`PLATFORM_ROADMAP.md`).

## ⏳ In-progress work (다음 세션에서 이어서)

**Check this FIRST when resuming.** If a session ends mid-task, record here: what was being
done, what's finished vs. remaining, the next concrete step, and any files touched but not
yet verified/committed. Clear the entry once the work is completed and logged below.

진행 중인 작업 없음 — **세션 종료 정리 완료 (`2026-08-05`)**. 워킹 트리 클린,
origin/master 동기화(`772035d`), `npm.cmd run qa` **114/114 green**, 두 도메인
(www.cambridgereading.com · new-app0607.vercel.app) 코어 파일 5종 전부 HTTP 200 확인.

이번 세션 커밋 2건: `d94af22` 히어로 배너 페이드/슬라이드 전환 + 관리자 배너 패널
→ `772035d` 배포 기록. 상세는 아래 첫 항목.

**이번 세션 요지** — 사용자 리포트 "배너 전환에 페이드가 안 보이고 즉시 바뀐다"에서
출발해 총 3라운드로 진행됐다. 원인은 결국 **`prefers-reduced-motion` 블록 하나**로,
같은 블록이 서로 다른 증상 2건을 연달아 만들었다(`transition-duration:0` → 즉시 컷,
그걸 고치며 넣은 `transform:none` → 슬라이드가 페이드로 격하). 부수적으로 크로스디졸브
합성 오류·wrap z-index 역전·역방향 재생·관리자 패널 경쟁 조건·저장 버튼 dirty 상태까지
정리했다.
⚠ **이 세션의 가장 큰 교훈**: 개발자 머신에 reduce가 꺼져 있으면 이 계열 버그는
자동화에서 **한 번도 재현되지 않는다**. 레지스트리·Playwright 임시 프로필 Chrome을
근거로 reduce 가설을 배제했다가 우회로를 2회 만들었다. 결정적 단서는 **"어떻게
보이는가"를 사용자에게 물은 것**이었다(슬라이드인데 페이드로 보인다 = reduce 지문).

⚠ **다음 세션 첫 확인 사항 — 사용자 배경 재배치 (코드 아님, 관리자 작업):**
페이지2가 PC에서 234px 짧아지면서 레이어 기준 배경이 콘텐츠 대비 위로 올라왔다.
① **Beginner/March**: 저장된 노란 밴드가 마지막 요일 버튼 줄과 **7px 겹침**(버튼 뒤로
깔려 치명적이진 않음) → 배경 편집기에서 밴드를 조금 내리면 해소.
② **Level 1/April · Level 2/April**(내부 키 `Level 2`/`Level 3`): 프레임 기준 요소
4개의 세로 위치 이동 → 그 두 페이지만 한 번 재배치 필요.

**다음 사용자 작업 후보:** 1366×768 이하까지 무스크롤이 필요해지면 푸터 여백·요일
버튼 간격 압축이 추가로 필요하다(이번엔 의도적으로 범위 밖).
**히어로 배너는 이제 운영 중** — `site_settings.hero_banner`에 배너 3장이 등록되어
기본 히어로까지 슬라이드 4개가 순환한다(`2026-08-05` 기준 `mode:"slide"`,
`interval:3`, `duration:2`).

⚠ **사용자 확인 필요**: 페이지가 234px 짧아지면서 L1/March에 저장된 노란 배경 밴드가
마지막 요일 버튼 줄과 **7px 겹친다**(버튼 뒤로 깔림). 배경 편집기에서 밴드를 조금
내리면 해소된다. 또 **Level 2/April · Level 3/April의 프레임 기준 요소 4개**는 프레임이
줄어 세로 위치가 이동했으므로 한 번 재배치 필요.

직전 작업 = **히어로 배너 페이드/슬라이드 전환 + 관리자 배너 패널 수정**
(`2026-08-05`, 커밋 `d94af22` → 기록 `772035d`). gotcha는 NOTES.md **히어로 배너
캐러셀** 섹션 — 특히 **reduced-motion 예외**(이 블록을 되살리지 말 것)와
**전환 도중을 샘플링해야 회귀가 잡힌다**는 두 항목.

그 이전 = **히어로 배너 캐러셀 + 전환 시간 옵션 + 게임 모달 스크롤/잘림/해상도
수정** 3건 (`2026-08-03`, 커밋 `43888cf`) → **페이지2 PC 하단 여백 축소**
(`de301a3`). 그 이전 = **배경 요소 "가로 100%"(전체 폭 밴드)** — 커밋 `53ffe82`
(`2026-08-02`).

⚠ **일괄 URL 입력 작업은 사용자 요청으로 취소됨 (`2026-08-02`).** 페이지2 game 버튼
70개(Beginner `game`×10월 + Level 1~3 `game`/`game2`×10월)에
`https://book-english-games.vercel.app/play/the-tractor`를 넣는 건이었으나 사용자가
직접 처리하기로 함 — **DB 변경 없음**. 참고: `content_pages` 쓰기는 RLS
`is_admin()`이라 관리자 로그인 세션 없이는 불가하고, 조회 시점(2026-08-02) 기준
`Beginner/March`만 이미 해당 URL이 들어가 있었다.

⚠ **알려진 도구 이슈:** `scripts/run-playwright.mjs`가 포트 5173을 하드코딩 —
`npm.cmd run dev`를 켜둔 채 `npm.cmd run qa`를 돌리면 테스트용 Vite가 5174로
밀리고 Playwright(baseURL 5173)는 사용자 dev 서버에 붙어 워커 경합으로 간헐적
30s 타임아웃이 난다. dev 서버를 끄고 qa를 돌리거나, `npm.cmd run check` +
`npx.cmd playwright test`로 나눠 실행할 것 (이번 세션은 후자로 검증).

- ✅ **히어로 배너 페이드 미작동 조사 + 수정 4건 (`2026-08-04`, 미배포):**
  사용자 리포트 = "배너가 페이드 없이 즉시 바뀐다". **먼저 재현·계측부터** 했고, 라이브
  (실 Chrome·콜드 로드·자연 타이머)에서는 3초 크로스페이드가 정상 동작함을 확인
  (양 도메인 에셋 md5 = 로컬, 캐시 문제 아님). 즉 "전환이 안 일어난다"는 결함은
  재현되지 않았고, 대신 원인 2가지를 찾아 4건을 고쳤다.
  - **원인 1 — `prefers-reduced-motion`이 페이드를 죽임.** 옛 CSS가
    `transition-duration: 0ms`라 reduce 환경에서 **정확히 "즉시 전환"** 이 된다
    (에뮬 대조 실측: no-preference 3s / reduce 0s). → `transition-property: opacity`로
    **이동만** 제거하고 페이드는 유지. 슬라이드 모드도 reduce에선 페이드로 격하.
    ⚠ 이 PC는 reduce가 꺼져 있다(레지스트리 + 실 Chrome `matches:false`) — 사용자가 다른
    기기/휴대폰으로 봤다면 이게 직접 원인.
  - **원인 2 — 크로스페이드가 배경으로 가라앉음.** 두 슬라이드를 동시에 반대로 굴리면
    독립 합성되어 50/50에서 `0.5·새 + 0.25·옛 + 0.25·딥블루`. 고정 50/50 프레임
    픽셀 측정 **평균 오차 30.03/255(최대 53.5)**. 게다가 새 배너 가중치가 2배라
    체감상 1초짜리 탁한 깜빡임이 된다. → **나가는 슬라이드를 불투명하게 붙잡고 들어오는
    것만 0→1**. 수정 후 오차 **0.33/255(최대 1.5)** — 사실상 완전 일치.
  - **부수 2건**: (a) `heroGoTo`가 들어오는 슬라이드에 인라인 `z-index`(단조 증가) 부여 —
    **wrap(마지막 배너→기본 슬라이드)에서 DOM 순서가 역전**되기 때문. + 기본 슬라이드에
    `background: var(--deep-blue)`(캐러셀 스코프). (b) `is-leaving` 해제 시
    `.is-resetting`(`transition:none`)으로 **역방향 재생 제거**(슬라이드 모드에서
    `tx: -1349 → -939` 실측).
  - **테스트 구멍도 메움**: 기존 테스트는 `transition-duration` **계산값만** 봐서
    하드컷을 통과시켰다(끝값은 둘 다 opacity 1). 전환 **도중**을 rAF 샘플링하는
    `heroFadeTrace` 헬퍼 + 테스트 4종 추가 → **qa 105/105 green**(93 → +12 = 4×3프로젝트).
  - 변경 파일: `styles.css`, `hero-banner.js`, `tests/smoke.spec.js`. 상세 gotcha →
    NOTES.md **히어로 배너 캐러셀** 섹션.
  - ✅ **사용자 로컬 확인: 페이드 정상.** 이어서 리포트된 2건도 같은 세션에서 처리:
    - 🐛 **"슬라이드로 바꿔도 적용 안 됨" = 관리자 패널 경쟁 조건.** 캐러셀·CSS는 정상
      (슬라이드 모드 transform `0 → -1346` / `1351 → 5` 실측). 진짜 원인은 **배너 탭의
      비동기 로드가 사용자의 선택을 덮어쓰는 것** — 탭을 열자마자 옵션을 바꾸면 뒤늦게
      도착한 fetch가 라디오를 저장값으로 되돌리고 그대로 저장된다. 실측 재현:
      `직후 fade → 2.5s 후 slide`로 복귀. → `heroPanelLoad` 토큰(탭 열기 + 모든 편집이
      증가, 늦게 온 로드는 결과 폐기). 수정 후 `직후 fade → 로드 후에도 fade`.
      ⚠ 처음 쓴 재현 테스트는 **저장값과 같은 값을 골라** 덮어쓰기가 안 보였다 —
      잘못 "정상"으로 판정했다가 반대값으로 다시 짜서 잡았다.
    - ✨ **저장 버튼 dirty 상태**: `heroSavedJson` vs `normalizeHeroConfig(heroDraft)`
      JSON 비교. 초기·저장 후 비활성, 변경 시 활성, **손으로 되돌리면 다시 비활성**
      (단순 touched 플래그가 아님). 저장 중 이중 제출 차단, 실패 시 복구.
      `.admin-banner-save:disabled` 회색 스타일 추가.
    - qa **111/111 green**(신규 테스트 2종 추가 = 105 → +6).
  - 🐛 **3차 리포트: "슬라이드 효과가 안 보인다" = 내가 넣은 reduce 블록이 원인.**
    페이드 수정 때 `transition-duration:0` 대신 넣은 **`transform: none`** 이
    슬라이드 모드를 **조용히 페이드로 격하**시키고 있었다(이동량 실측 **1346 → 0px**).
    즉 같은 CSS 블록이 리포트 2건을 연달아 만든 셈.
    - ⚠ **진단이 어려웠던 이유**: 모드 클래스·`--hero-transition`·`state().mode`·
      transform 규칙이 **전부 정상**이고, 이 PC는 reduce가 꺼져 있어 자동화(로컬·라이브·
      콜드로드·자연타이머·스크린샷)에서 **한 번도 재현되지 않았다.**
    - **결정적 단서는 "어떻게 보이는가"였다** — 슬라이드를 골랐는데 **페이드로 보인다**는
      사용자 답변이 곧 reduce의 지문(이동만 제거되고 opacity는 남음). 사용자 콘솔 접근이
      막혀 있어도(Chrome 붙여넣기 보호) 이 질문 하나로 확정할 수 있었다.
    - → **배너 캐러셀을 reduce 예외로** (히어로 리그·워드 리빌과 동일 취급). 관리자가
      전환 방식을 명시적으로 고르므로 슬라이드는 실제로 슬라이드해야 한다. 검증:
      reduce 에뮬레이션에서 이동량이 no-preference와 **동일**(2702px).
    - 회귀 테스트 `heroSlideTravel()` 추가 — **가로 이동량을 직접 단언**한다.
      기존 테스트는 전부 통과하면서 이 격하를 놓쳤다. qa **114/114 green**.
    - ⚠ 교훈: 레지스트리 `UserPreferencesMask`와 Playwright가 띄운 임시 프로필 Chrome은
      **사용자의 실제 브라우저와 다를 수 있다.** 1차 때 이 둘을 근거로 reduce 가설을
      배제한 것이 우회로를 2회 만들었다.
  - ✅ **배포 완료 (`2026-08-05`):** 사용자 로컬 확인(슬라이드 정상) 후 커밋 `d94af22`
    push → Vercel 자동 배포. new-app0607.vercel.app + www.cambridgereading.com 모두
    새 `styles.css`·`hero-banner.js` md5 **로컬과 일치** 확인. 라이브 실측(두 도메인 ×
    reduce on/off 4조합): 슬라이드 가로 이동 **1260~1270px**(reduce에서도 동일),
    페이드는 나가는 슬라이드 **opacity 1 고정** + 들어오는 것 `0.07→0.94`,
    저장 버튼 초기 **비활성**.
  - ⚠ **남은 미세 이슈(미수정, 운영 영향 거의 없음):** `applyHeroBanner`가 진행 중인
    **슬라이드별 리셋 타임아웃**(`heroResetSlide`, `duration+20ms`)을 취소하지 않는다.
    전환이 끝나기 전에 설정을 다시 적용하고 곧바로 새 전환을 시작하면, 옛 타이머가
    뒤늦게 터져 나가는 슬라이드의 `is-leaving`을 떼어 **즉시 사라지게** 만든다.
    라이브 검증 스크립트가 700ms 만에 모드를 바꾸다 실제로 이걸 밟았다.
    운영에서는 (a) `heroResetSlide`의 `is-active` 가드, (b) 관리자 화면에서는 회전이
    멈춰 있고 홈 복귀 후 첫 전환까지 최소 4초라 사실상 도달하지 않는다.
    고치려면 타이머 id를 슬라이드에 보관하고 `applyHeroBanner`에서 clear할 것.

- ✅ **페이지2 PC 하단 여백 축소 — 세로 스크롤바 제거 (`2026-08-03`):**
  플랜 승인 후 구현 (플랜: `C:\Users\USER\.claude\plans\stateful-spinning-charm.md`).
  - **실측**: 페이지2 문서 높이가 뷰포트와 거의 무관하게 **1086~1099px 고정**이라 스크롤
    여부는 뷰포트 **높이**만으로 결정됐다(1920×1080 6px / 1899×992 94px / 1536×864 222px /
    1366×768 331px 넘침). 줄일 수 있는 하단 여백 = 그리드 바닥~섹션 바닥 **233px**.
  - **PC(≥1181px) 전용 새 `@media` 블록**에서 234px 절감 —
    `.section-inner` padding-bottom 183→4, `.lesson-board` padding-top 25→14 · bottom 50→6.
    그리드·요일 버튼·푸터는 **손대지 않음**(높이 434 / 86 / 103 불변 실측).
  - **결과**: 1920×1080 · 1899×992 · 1600×900 · 1536×864 · 1440×900 **전부 스크롤 0**.
    1366×768(97px)·1280×720(145px)은 **의도적 범위 밖**(사용자 결정) — 거기까지 맞추려면
    푸터·그리드 간격까지 압축해야 한다.
  - **태블릿·모바일 완전 불변** 실측: 1180/1024 = 68px, 768 세로 = 183px, 390 = 151px.
  - ⚠ 새 블록은 `@media (min-width:768px)`의 183px 규칙 **뒤에** 둬야 한다(둘 다
    `#contentScreen .section-inner` (1,1,0) → 소스 순서). 파일 앞쪽 1181px 블록은 무용.
  - ⚠ **페이지가 짧아져 레이어 기준 배경이 콘텐츠 대비 위로 올라온다** — L1/March 노란
    밴드가 마지막 버튼 줄과 7px 겹침(버튼 뒤라 치명적 아님), Level 2·3의 April 프레임 기준
    요소 4개는 이동. 사용자 재배치 필요.
  - qa **93/93 green**(신규 테스트 2종).

- ✅ **메인 히어로 배너 캐러셀 (`2026-08-02`):** 브레인스토밍 → 사용자 구조 조정안 검증 →
  플랜 승인 후 구현
  (스펙: `docs/superpowers/specs/2026-08-02-hero-banner-carousel-design.md`).
  관리자가 메인 히어로에 배너 이미지를 등록하면 **기본 히어로를 1번 슬라이드로** 두고
  슬라이드/페이드로 자동 순환. 유지 시간 3·5·7·10초, 배너별 초점(위/가운데/아래),
  배너는 항상 페이지 가로 100%, 하단 흰 곡선 아래.
  - **레이어 구조(사용자 확정안)**: `.hero-section` 안에서 `.hero-slides`(z1) /
    `svg.hero-wave`(z2) **분리**. 곡선을 슬라이드에 넣지 않으므로 복제·이음매 문제가
    없고, 슬라이드가 쌓임 맥락을 만들어도 곡선이 항상 위. 기본 슬라이드는 normal flow에
    남아 히어로 높이를 정의, 배너는 `absolute; inset:0`.
  - **배너 0장이면 아무것도 만들지 않는다** — 애니메이션 CSS가 전부
    `.hero-carousel--*` 스코프라 transition·transform·쌓임 맥락이 생기지 않음.
  - 저장 = `site_settings.hero_banner` jsonb(**스키마 변경 없음**), 업로드 = 기존
    `backgrounds` 버킷 `banners/` 프리픽스(**새 버킷·정책 없음**). 관리자 3번째 탭 **배너**.
  - 코드는 `app.js`(93KB)에 얹지 않고 **신규 `hero-banner.js`** — `background-editor.js`와
    같은 클래식 스크립트 방식. `eslint.config.mjs`/`package.json` 글롭도 함께 등록.
  - ⚠ **필수 부작용 처리**: `.hero-copy`가 곡선 아래로 내려가 앱버튼이 가려짐
    (실측 1180 17% / 1024 62% / 768 97%). 여백 2곳 조정 — 베이스 `padding-bottom 130→172`
    (≥1181px), 768~1180 블록은 `height:auto; min-height:434` + `padding-bottom 92→200`.
    **768~900에서 앱버튼이 2줄(130px)로 감싸지는 게 여유를 잡아먹는 진짜 원인.**
    ⚠ 여백 규칙을 상한 없는 `@media (min-width:768px)`에 넣으면 데스크톱까지 번진다
    (1920 히어로 434→464px로 늘어난 적 있음).
  - **검증**: 320~1920 9개 폭에서 곡선 path 샘플링으로 앱버튼 여유 실측 — 최소 **26.4px**.
    데스크톱 히어로 높이 434px 불변, 768~1024는 의도적 증가(768: 434→609.6px).
    배너 `<img>` 박스가 히어로와 완전 일치(delta 0), `object-fit:cover`, 곡선 z2 > 슬라이드 z1.
  - ✅ **부수 효과**: 768px에서 **기존에 잘려 사라져 있던 Google Play 버튼 복구**
    (히어로가 자라며 `overflow:hidden` 클리핑 해소). 대신 캐릭터 아래 파란 여백이 생김.

- ✅ **히어로 전환 시간 옵션 + 게임 모달 3연속 수정 (`2026-08-02`~`08-03`):**
  플랜: `C:\Users\USER\.claude\plans\stateful-spinning-charm.md`.
  - **전환 시간 1~5초 옵션**(기본 2초, 페이드·슬라이드 공통). 하드코딩 600ms를
    `--hero-transition` 변수로 빼고 `hero-banner.js`가 주입. 저장 필드 `duration` 추가.
    **순환 주기 = `duration + interval`** 로 바꿔 "유지 시간"이 배너가 완전히 보이는
    시간을 뜻하게 됨 — 실측 5001ms(2+3).
  - 🐛 **함께 발견·수정**: `heroOnHome()`이 `body[data-screen]`만 봤는데 `/`로 처음
    들어오면 `#homeScreen`이 정적으로 `.screen-active`라 `showScreen()`이 호출되지 않아
    **속성 자체가 없다** → 새로고침으로 홈에 들어오면 캐러셀이 아예 안 돌고 있었다.
  - **게임 모달 ① 세로 스크롤** — 원인은 문서가 아니라 게임 페이지 내부의
    `div.flex-1.min-h-0.overflow-y-auto`(`document.scrollHeight === clientHeight`가 항상
    참이라 처음엔 재현 불가). 임계값 실측: iframe **가로 ≥1024 · 세로 ≥630**.
    해법 = 16:9 카드 + 최소 박스 보장. 1920/1536/1440/1366/1280/1200 전부 넘침 0px
    (이전 21~336px).
  - **게임 모달 ② 상단 잘림** — `aspect-ratio:16/9 + width:90% + max-height:90%`는
    명세상 폭이 확정이면 `max-height`가 높이만 자르고 폭은 안 줄어, 16:9보다 넓은 창에서
    카드가 납작해지는데 배율은 폭 기준이라 iframe이 세로로 넘쳐 잘렸다(1899×992 61px /
    2560×1080 316px). → `fitGameFrame()`이 **`min()`으로 카드 px를 직접 계산**.
    가용 공간은 `#gameModal` rect로 잰다 — `documentElement.clientWidth`는
    `scrollbar-gutter: stable` 때문에 15px 크다(1920 vs 1905).
    ⚠ **원인은 테스트 뷰포트 선정 실패** — 처음 고른 4개가 전부 16:9 이하였다.
  - **게임 모달 ③ 해상도 저하** — 크로스오리진 iframe을 `transform: scale()`로 **확대**하면
    브라우저가 자기 레이아웃 크기로 래스터화한 비트맵을 늘려 해상도가 날아간다
    (1.24~1.49배 → 9개 게임 전부 번짐, A/B 크롭 비교로 확정).
    → 카드 세로 ≥660px이면 iframe을 **카드 크기 그대로** 레이아웃 + `transform:none`,
    작을 때만 1280×720 + **축소**(축소는 무해). 실측 배율 1.0 · 내부 스크롤 0.
    부수효과: 확대가 없어져 글자가 약간 작아짐(사용자 승인 — 선명도 우선).
  - ⚠ scale-to-fit은 **PC(≥1181px)에만** — 모바일에서 1280px 강제 시 배율 0.3.
    ⚠ 미디어 오버라이드를 베이스 `#gameFrame`보다 **앞**에 두면 동일 specificity에서
    소스 순서로 밀려 조용히 죽는다(한 번 겪음).
  - qa **87/87 green**(신규 테스트 6종). 상세 → NOTES.md **히어로 배너 캐러셀** /
    **게임 모달** 섹션.

- ✅ **페이지1·2 배경 요소 "가로 100%"(전체 폭 밴드) 구현 (`2026-08-02`):**
  브레인스토밍 → 설계 승인 후 구현
  (스펙: `docs/superpowers/specs/2026-08-02-background-full-width-band-design.md`).
  하단 footer 영역에 화면 끝에서 끝까지 깔리는 배경 패턴을 만들 수 없다는 요청 —
  요소 좌표계가 `.page-bg-el-frame`(콘텐츠 열)이라 `w:100`이 "콘텐츠 폭 100%"였다.
  **요소별 플래그로 좌표계만 전환**: `fw:true`면 프레임이 아니라 `#pageBgLayer`
  (= `.app-shell`, 뷰포트 가로 전체 · footer 바닥까지) 직속으로 렌더 → `width:100%`가
  곧 페이지 가로 100%.
  - **저장 필드 5개 추가**(jsonb, **마이그레이션 불필요**): `fw` / `fmode`(`stretch`
    = 1장 확대 · `tile` = 가로 반복) / `anchor`(`bottom`·`top`) / `off`(px) / `th`(px).
    세로를 %가 아니라 **앵커+px**로 잡은 게 핵심 — 페이지 높이가 기기마다 달라 %면
    바닥 밀착이 깨진다. `anchor:"bottom", off:0` = 모든 기기에서 footer 바닥 밀착.
  - `x/y/w/r`은 밴드에서 **무시하되 보존** → 체크 해제 시 원래 자리·크기로 정확히 복귀.
    `r`(회전)은 밴드에 미적용(회전한 띠는 좌우 끝에 빈틈).
  - **기존 동작 유지**: `fw` 없는 기존 저장 요소는 현행 경로 그대로. 유일하게 기존 렌더에
    닿는 부분은 요소 `z-index` 명시(밴드가 프레임 밖이라 `[앞으로]/[뒤로]` 유지에 필요) —
    이것만 넣으면 요소가 상단 스크림 위로 튀어나오므로 **`.has-full::after`에
    `z-index:1000`을 함께** 부여해 원래 순서를 지켰다. 상세 → NOTES.md.
  - **편집기**: `[선택한 요소]`에 `☑ 가로 100%` + 채우기(늘리기/가로 반복) + 세로 기준
    (아래/위) 라디오. 체크 시 가까운 가장자리로 자동 앵커, 드래그는 세로만, tile은
    자유 가장자리에 높이 핸들 1개, ↑/↓ 1px(Shift 10px). 앵커 전환 시 픽셀 위치 유지.
  - **검증**: 실측 — 320/768/1024/1366/1920 전부 밴드 폭 == 레이어 폭, `off:0` 바닥 밀착
    (gap<1px), tile 높이 90px 불변, stretch 원본 비율 유지. 3배율 스크린샷으로
    **footer 카피라이트가 밴드 위에 렌더됨** 확인(레이어 z1 < main/footer z2).
    qa **66/66 green**(신규 테스트 3종 × 3프로젝트).
  - ⚠ 밴드는 footer 글자 **뒤**에 깔리므로, 무늬가 복잡한 이미지를 쓰면 카피라이트
    가독성이 떨어질 수 있다(색은 레벨 테마색). 필요하면 밝은/저대비 패턴을 쓸 것.
  - ✅ **배포 완료 (`2026-08-02`):** 커밋 `53ffe82` push → Vercel 자동 배포.
    new-app0607.vercel.app + www.cambridgereading.com 모두 새 styles.css
    (`.page-bg-band`, `.has-full::after` `z-index:1000`)·app.js(`styleBgBand`)·
    background-editor.js(`fillBgBandShell`) 서빙 확인. 라이브 실측(1528px):
    시드 tile 밴드 폭 1513 == 레이어 폭 1513(delta 0), `off:0` 바닥 gap 0,
    높이 90px, `repeat-x`/`auto 100%`, 밴드 z1 < footer z2.
    사용자가 저장해 둔 실제 밴드(L1/March, stretch, `off:-279`)도 정상 렌더 —
    원본 1080×270 → 1513×378로 **비율 정확히 유지**, 하단 약 99px 노출.
  - ⚠ `page_backgrounds.updated_at`은 `default now()`뿐이라 **upsert 갱신 시 옛 값이
    남는다**(트리거 없음). 최신 편집 시각으로 신뢰하지 말 것.

- ✅ **태블릿 배너 상하 여백 균등화 배포 완료 (`2026-08-02`):** 커밋 `e34a82c`
  push → Vercel 자동 배포. 두 도메인(new-app0607.vercel.app +
  www.cambridgereading.com) × 4개 뷰포트 라이브 실측 — iPad 가로·Tab 가로
  40/40, iPad 세로 42/42, PC 40/44, 툴바·그리드·하단 영역·innerH 전부 로컬과 일치.
  사용자 스샷 `008.png`(iPad 1024×768 가로): 레벨+월 라인이 아래 버튼그룹 쪽으로
  치우쳐 보인다는 지적 — 실측 결과 위 여백 66~70px / 아래 14px로 아래쪽 편중.
  PC와 동일한 **−N/+N 상쇄 기법**으로 태블릿에도 적용:
  `768~1180` 블록 `margin-top:-28px; margin-bottom:42px`,
  `768~1180 landscape` 블록 `margin-top:-26px; margin-bottom:32px`(자체 mb 6 + 26).
  결과 — iPad 가로·Galaxy Tab 가로·1180px **40/40**, iPad 세로 **42/42** 균등.
  툴바(212)·그리드(282)·하단 영역(78)·`.section-inner` 높이(578) **전부 불변** →
  저장된 배경 요소 제자리. Back/Next와 겹침 없음(좌우 여유 175~366px).
  PC는 40/44로 사실상 균등(요청대로 30px 적용한 결과) — 그대로 둠.
  모바일은 **의도적으로 제외**(좌우 여유가 17px뿐이라 올리면 Back/Next와 붙음).
  qa **57/57 green**.

- **다음 사용자 작업(진행 예정):** 페이지2 하단 확보 공간에 배경 이미지 요소 배치
  테스트. PC 233px / 태블릿 가로 78px / 태블릿 세로 213px / 모바일 161px.
  부족하면 다음 레버 → PC는 `.lesson-board` `padding-bottom` 50→20(+30),
  태블릿 가로는 `.lesson-button`·`.week-label` `min-height` 64px 축소(4행이라 5px당 20px).

- ✅ **페이지2 배너 한 줄 배치 + 하단 배경 공간 확보 배포 완료 (`2026-08-01`):**
  커밋 `9305c23` push → Vercel 자동 배포. new-app0607.vercel.app +
  www.cambridgereading.com 모두 새 styles.css·app.js 서빙 확인. 라이브 실측 —
  PC 1366: 배너 top 120/h46, 원형 46px, 그리드 316, 하단 233, innerH 903;
  태블릿 가로 1138×712: 그리드 282, 하단 78, innerH 578 — **로컬과 완전 일치**.
  (같은 커밋에 툴바 아이콘 원형 배경 + GAME/SONG 태그 20% 축소도 포함.)
  플랜 승인 후 구현 (플랜: `C:\Users\USER\.claude\plans\flickering-booping-moler.md`).
  하단에 배경 아트워크를 깔 공간이 146px뿐이고 요일 버튼에 가려 효과가 없다는 요청.
  **CSS만 수정** (index.html·app.js 무변경). (1) 레벨명+월 원형을 **한 줄**로
  (`grid-template-columns:auto auto` + `align-items/justify-content:center`,
  `gap:4px 14px`) — 배너 **112.8 → 46px**. (2) 월 원형 **60→46px / 폰트 36→28px**
  (레벨명 40.8px 라인에 맞춤, 두 자리 "12"도 여유). (3) 배너 `margin-bottom` 26→14,
  `[data-month] .section-inner` `padding-top` 20→12 → 그리드 **86.8px 상승**.
  (4) 절감분을 **`padding-bottom`으로 되돌려**(768+ 96→183, 767- 64→151)
  `.section-inner` 높이를 보존 → **하단 배치 영역 146 → 233px(+60%)**, 기존 저장
  배경 요소 좌표 불변. (5) 태블릿 가로 블록은 중복 선언 제거 후 `column-gap:12px`/
  `margin-bottom:8px`만 유지 + `padding-top`을 `[data-month]`로 승격해 **완전 동결**.
  죽은 `#contentLevelBand` 규칙 삭제.
  검증: 전 브레이크포인트 변경 전/후 대조 실측 — 프레임 높이 드리프트 데스크톱·태블릿
  세로·모바일 **≤0.3px**, 태블릿 가로 **0px**; 페이지1(`#monthLevelTag` 40px)·V2 월
  pill(26×26/16px) 무영향 확인. qa **57/57 green**(배너 1줄 회귀 테스트 3 추가).
  상세 gotcha → NOTES.md.
  - ⚠ 그리드가 86.8px 올라왔으므로 **기존에 316~403px 구간에 배치된 배경 요소는
    새로 버튼에 가려질 수 있음** — 해당 레벨/월은 눈으로 확인 필요.
  - **2차 조정 (`2026-08-01`, 사용자 스샷 `007.png` = Galaxy Tab S4 1138×712 피드백):**
    - **PC(≥1181px): 레벨+월 라인만 30px 위로**, 요일 그리드는 그대로.
      `@media (min-width:1181px)`에 `margin-top:-30px; margin-bottom:44px`
      (−30/+30 상쇄) → 배너가 Back/Next와 같은 줄로 올라가고 툴바·보드·
      `.section-inner` 높이·하단 233px 모두 불변. 배너 콘텐츠와 Back/Next 사이
      여유는 최소폭 1181px에서도 좌우 ~360px.
    - **태블릿 가로(768~1180 landscape): 상단 여백 50px을 하단으로 이관.**
      툴바 `margin-top 36→8`·`margin-bottom 16→10`(가장 큰 여유), `.section-inner`
      `padding-top 20→10`, 헤더·배너 `margin-bottom 8→6`, 보드 `padding-top 6→4`
      → `padding-bottom 18→68`. 그리드 상단 332→**282**, 하단 배치 영역
      28→**78px**, `.section-inner` 높이 578 **불변**(저장된 배경 요소 제자리).
      이 뷰포트는 여유 높이가 0(docH==vh)이라 **순증 금지** — 위에서 빼서 아래로만.
    - 태블릿 세로·모바일은 의도적으로 변화 없음(각각 213px·161px 유지).
      qa **57/57 green**.
      페이지2 툴바 아이콘 뒤에 **아이콘 색 계열의 연한 파스텔 원형 배경** 추가
      (참고 스샷 `005.png` 스타일, 배경 도형은 원형으로). 영상 `#ffe4e4` /
      게임 `#ece4ff` / 음악 `#d8f6ec` — `--icon-tint` + `content-type-icon--<family>`
      모디파이어 클래스(`renderContentToolbar`가 item.icon으로 생성).
      `.content-type-icon`을 **`box-sizing:content-box`** 로 두어 기존 브레이크포인트
      width/height가 그대로 "글리프 크기" 의미를 유지 → 원 = 글리프 + 2×padding
      (base 5px, --wide 4px). ⚠ **원이 라벨 폭을 잠식해 ~860px 이상에서 새 말줄임 발생**
      → 버튼 좌우 패딩에서 상쇄(base --wide `clamp(8,0.85vw,13)`→`clamp(6,0.7vw,10)`,
      태블릿 블록 `clamp(8,0.9vw,12)`/gap5 → `clamp(4,0.5vw,8)`/gap4). 360~1600px
      14개 폭에서 변경 전(padding:0 에뮬레이션)과 대조 검증 — 1250/1366px에서 가장 긴
      라벨만 1px 작음, 그 외 동일. 768/800px 말줄임은 **변경 전부터 있던 기존 현상**.
      qa **54/54 green**(아이콘 원형 테스트 신규 3). 상세 → NOTES.md.
  - **태그 20% 축소 (`2026-08-01`, 사용자 지시):** 태그가 라벨 일부를 가릴 수 있다는
    우려로 리본 전체를 비례 축소 — 폰트 10→8px, 패딩 `7/9/4`→`5/7/4`, 오버행
    `top:-4`→`-3px`(padding-top의 오버행 몫과 커플링), 라운드 `3/8`→`2/6`,
    letter-spacing 0.5→0.4, 그림자 `0 2px 3px`→`0 1px 2px`. 실측 결과
    **49.8×21 → 39.4×17px**(가로 21%↓, 세로 19%↓, 면적 36%↓), 태블릿 768px의
    라벨-태그 겹침 면적 1px²→**0**. qa **54/54 green**.
  - ⚠ 태블릿 768px 라벨 말줄임은 **원형 배경 도입 전부터 있던 것**(bare 대조로 확인).
    이번 작업 범위 밖 — 필요하면 별도 요청.

- ✅ **페이지2 툴바 리디자인 배포 완료 (`2026-08-01`).** 플랜 승인 후 구현
  (스펙: `docs/superpowers/specs/2026-08-01-content-toolbar-redesign-design.md`).
  (1) **아이콘 통일** 전 레벨: 영상(재생▶ opening/ending)·게임(게임패드
  game/game2)·음악(음표 unit/song1/song2) 라인 SVG(`ICON_SVGS`), **원형 배경
  제거**. (2) **GAME/SONG 모서리 태그** 레벨 1~3만(슬롯 기반 자동, `--tag-game`
  오렌지/`--tag-song` 블루), Beginner 태그·이름 불변. (3) 레벨 2~4 **기본 이름
  접미사 제거** ("I Sit Game"→"I Sit" 등 — 태그가 유형 표시). (4) **--wide 툴바
  고정 균등폭** + 2줄 클램프 + `fitToolbarText()` 폰트 축소(하한 11px)+말줄임 —
  도서명이 길어도 버튼 크기 불변. (5) 플레이어 제목 "도서명 · Song" 데이터 합성
  (기존 `span:last-child` 스크래핑 제거 — 태그와 충돌). qa **51/51 green** +
  6뷰포트 스크린샷 실측(모바일 --wide 50px 패딩 잠식 버그도 실측으로 발견·수정).
  변경: app.js, styles.css, tests/smoke.spec.js(+3), 스펙. 상세 gotcha → NOTES.md.
  - **피드백 1차 반영 (`2026-08-01`):** (a) GAME/SONG 태그 → **버튼 윗변을 뒤에서
    앞으로 타고 넘는 리본** — 윗변 위로 나온 구간 + 앞면이 **단색**(오렌지/블루),
    아래 모서리 라운드 8px, 폰트 9→10px·패딩 확대로 통통하게. top 오프셋과
    padding-top의 오버행 몫은 커플링된 한 값(NOTES 참조). (b) 아이콘 → **컬러 입체 스타일**
    (참고 스샷 `005.png`, 배경 도형 제외) — 코랄 재생▶ / 보라 게임패드(옐로·그린
    버튼 점) / 티얼 음표, 공통 기법 = 어두운 립 +1.3px 오프셋 + 흰 글린트, 색상은
    SVG에 내장(defs 그라데이션 금지 — 반복 버튼의 id 충돌). `stroke:currentColor`
    규칙·active 아이콘 색 규칙 제거. qa **51/51 green** + 데스크톱/모바일/Beginner
    스크린샷 실측(버튼 폭 157.8px 균등 유지, 클리핑 없음).
  - **피드백 2차 반영 (`2026-08-01`):** 태그 리본의 (1) **버튼 바깥 구간
    색을 안쪽과 동일한 단색으로 통일** — 1차의 어두운 뒷면색이 "접힌 면"이 아니라
    별개의 진한 막대로 보인다는 피드백(`--tag-game-back`/`--tag-song-back` 변수와
    linear-gradient 제거), (2) **바깥 구간 높이 8px → 4px(50%)** (`top:-8→-4px`,
    `padding-top:11→7px` 동반 수정 — 두 값은 커플링). 태그 총높이 25→21px.
    qa **51/51 green** + 데스크톱·모바일 실측(오버행 4px, 배경 단색 rgb(255,150,0)
    /rgb(28,176,246), 클리핑 없음).
  - ✅ **배포 (`2026-08-01`):** 사용자 확인 후 커밋 `3450d3f` push → Vercel 자동
    배포. new-app0607.vercel.app + www.cambridgereading.com 모두 새 styles.css
    (리본 태그 `top:-4px`, back-shade 변수 없음)·app.js(컬러 아이콘 `#ff6b6b`)
    서빙 확인. 라이브 페이지2(레벨2/March) 실측: 아이콘 SVG 6개, 태그 4개
    오버행 4px·단색 — 로컬과 동일.
  - ⚠ **테스트 러너 포트 충돌 (발견, 미수정):** `scripts/run-playwright.mjs`가
    포트 5173을 하드코딩 — 사용자 dev 서버가 5173을 점유 중이면 테스트용 Vite는
    5174로 밀리고 Playwright(baseURL 5173)는 **사용자 dev 서버**에 붙는다. 워커
    3개 경합으로 간헐적 30s 타임아웃 발생(이번 세션 1건, 단독 재실행 1.4s 통과).
    dev 서버를 끄고 qa를 돌리거나, 러너가 빈 포트를 잡도록 고칠 것.
- ✅ **페이지2 툴바 버튼 이름 편집 기능 배포 완료 (`2026-07-31`):** 커밋 `53991f3`
  push → Vercel 자동 배포. new-app0607.vercel.app + www.cambridgereading.com 모두
  새 app.js(`craContent`/`getSlotLabel`)·index.html(이름란, 지우기 버튼 제거) 서빙
  확인. 사용자 로컬 테스트 통과 후 배포. 플랜 승인 후 구현
  (플랜: `C:\Users\USER\.claude\plans\atomic-frolicking-lampson.md`,
  스펙: `docs/superpowers/specs/2026-07-31-toolbar-button-labels-design.md`).
  관리자 보드 슬롯 모달에서 툴바 버튼(페이지2 요일그리드 위) 이름을 레벨+월별로
  편집 — `content_pages.labels` jsonb + 이름/URL 각각 "현재 레벨 전체 적용"
  체크박스(10개 월 배치 upsert), 지우기 버튼 제거(사용자 지시), 빈 이름 = 기본
  이름 폴백. qa **42/42 green**. 변경 파일: app.js, index.html, styles.css,
  supabase/migration.sql, tests/smoke.spec.js(+테스트 3종), 스펙 문서. 상세
  gotcha → NOTES.md Supabase 섹션.
  - ⚠ **labels 컬럼 ALTER**(migration.sql에 추가됨)는 Supabase SQL 편집기에서
    실행되어야 관리자 저장이 동작. 로컬에서 저장 테스트가 성공했다면 이미 실행된
    것 (미실행이면 이름/URL/표지 저장 전부 "저장 실패."). 읽기는 컬럼 없어도 안전.
- ✅ **배경 영상 URL 기능 배포 완료 (`2026-07-26`):** 커밋 `f76dd57` push → Vercel 자동
  배포. 사용자 로컬 테스트 완료 후 배포. 플랜 승인 후 구현
  (플랜: `C:\Users\USER\.claude\plans\fancy-cooking-simon.md`). 배경 편집기(페이지1·2)의
  전체 배경 섹션에 **영상 URL 입력란**([적용]/[영상 제거], Enter 지원) 추가 — YouTube /
  Vimeo / mp4·webm 직접 URL을 `parseBgVideoUrl()`(app.js, craBg 노출)로 판별해
  `page_backgrounds.data.videoUrl`(jsonb 필드 추가, 마이그레이션 불필요)에 저장.
  뷰어는 `buildBgVideoLayer()`가 `.page-bg-video`(full 뒤 DOM 순서 = 이미지가 로딩/실패
  폴백)로 무음·자동재생·루프 렌더: 파일은 `<video>`+object-fit cover, 임베드는
  `sizeBgVideoCover()`가 16:9 오버사이즈 px 계산(resize/load 재계산). 영상도 `has-full`
  스크림 적용. 편집기 캔버스는 라이브 프리뷰 — iframe 리로드 방지 위해 `bgEdit.videoNode`를
  선택적 wipe 밖에서 관리(NOTES.md gotcha 참조). 변경 파일: app.js, background-editor.js,
  index.html, styles.css, tests/smoke.spec.js(테스트 3개 추가). qa 33/33 green.
  ⚠ Vimeo `background=1` 파라미터는 영상 소유자가 유료 플랜일 때만 동작(아니면 무음
  루프까지만, 컨트롤 노출 가능). 기존 저장 요소 재배치 사용자 작업은 여전히 남음(아래 ⚠).
- ✅ **아래 1~4차 전부 배포 완료 (`2026-07-26`):** 커밋 `05d95ed` push → Vercel 자동 배포.
  new-app0607.vercel.app + www.cambridgereading.com 모두 새
  styles.css(`.page-bg-el-frame`)·app.js(`positionBgElFrame`)·background-editor.js·
  index.html(원형 FAB) 서빙 확인. ⚠ 남은 사용자 작업: **기존 저장 요소는 편집기에서 한 번
  재배치 후 저장**(4차 좌표계 전환 때문 — 아래 참조).
- **배경 편집기 위젯 개선 (`2026-07-26`):** 사용자 요청 2건.
  (1) **편집 패널 = 드래그 가능한 플로팅 창** — 오른쪽 고정 패널이 화면 오른쪽에 요소를
  배치할 때 가리는 문제. `.bg-editor-head`가 드래그 핸들(cursor:move, user-select/touch-action
  none); 첫 드래그에서 auto top/right/bottom 지오메트리를 명시적 left/top + 고정 height로
  동결 후 뷰포트 안에서 클램프 이동(`background-editor.js` pointerdown/move/up). 위치는
  닫았다 열어도 유지되며 `bgClampPanel()`이 재진입 시 뷰포트 축소를 보정. (2) **FAB =
  44px 원형 아이콘 버튼** — 녹색 '배경 편집' 텍스트 필이 디자인 검토를 방해 → 텍스트 제거,
  이미지 라인 SVG 아이콘 + aria-label/title 유지. Supabase 연결 실패 시 텍스트 스왑은
  `bgFabIcon`(innerHTML 백업) + `.bg-fab-wide`(필 형태 복원) 클래스로 처리 후 2.5s 뒤 복구.
  smoke 테스트에 패널 드래그 회귀 검증 추가(모바일은 좌측 0px 클램프라 상대 이동만 단언).
  `npm.cmd run qa` 24/24 green + Playwright 스크린샷으로 페이지1/2 FAB·드래그 실측 확인.
- **배경 편집기 위젯 개선 2차 (같은 세션):** 사용자 스샷
  피드백 3건. (1) **라이브러리 썸네일이 안 보이거나 잘리던 버그** — `.bg-editor-panel
button`의 `background:#fafafa` **단축 속성**(0,1,1)이 `.bg-lib-thumb`(0,1,0)의
  `background-size:contain`을 덮어써 원본 크기 좌상단 크롭으로 렌더 → 썸네일을 CSS 배경
  대신 **실제 `<img>` + `object-fit:contain`**으로 교체(+투명/흰 이미지용 체커보드 배경).
  (2) **패널 4모서리 라운드** — `overflow-y:auto` 스크롤바가 패널 가장자리를 각지게 만들던
  것을 헤더 고정 + `.bg-editor-body`(본문만 스크롤) 구조로 변경, 패널은 `overflow:hidden` +
  radius 16. ⚠ 패널에 `display:flex`를 주면서 `[hidden]`이 깨지므로
  `.bg-editor-panel[hidden]{display:none!important}` 가드 필수(기존 admin-view 버그와 동일
  패턴). (3) **저장 성공 시 confirm 팝업 후 자동 닫기** — `bgSave` 끝에서 "저장 완료. 편집
  창을 닫을까요?" `window.confirm` → 확인 시 `exitBgEdit()`, 취소 시 세션 유지. qa 24/24
  green + 스크린샷으로 썸네일/라운드 실측 확인(저장 confirm은 Supabase 쓰기라 코드 검증만).
- **3차 (같은 세션):** 요소 **리사이즈 핸들을 오른쪽 아래 → 오른쪽 위 모서리로 이동**
  (사용자: 아래쪽 잡기가 불편). 리사이즈 수학은 중심-거리 기반이라 CSS만 변경
  (`.bg-edit-resize` top:-10/right:-10, cursor `nesw-resize`). Playwright로 핸들 위치 +
  드래그 확대(22→32%) 실측, qa 24/24 green.
- **4차 (같은 세션, 플랜 승인 후 구현):** **PC↔태블릿 요소 위치 불일치 해결** — 요소
  좌표계를 뷰포트(`.app-shell` 박스)에서 **콘텐츠 열 프레임**(`.page-bg-el-frame`,
  `.section-inner` 실측 추종)으로 변경. `positionBgElFrame()`(app.js, craBg로 노출) +
  뷰어/편집기 렌더·드래그 rect 모두 프레임 기준, resize/load 재계산. 플랜:
  `C:\Users\USER\.claude\plans\concurrent-swinging-blossom.md`. 검증: 1280/1024/800
  뷰포트에서 요소 중심의 콘텐츠-상대 좌표 소수 3자리까지 일치, qa 24/24 green(시드
  테스트에 프레임 정렬 단언 추가). ⚠ **기존 저장 요소는 좌표 의미가 바뀌어 재배치
  필요**(사용자에게 안내함). 상세 gotcha → NOTES.md 배경 편집기 섹션.
- **+ 배너 가독성 스크림 (같은 세션, 인터뷰로 사용자 선택):** 전체 배경 이미지가 있으면
  레벨명·월 아이콘이 안 보이는 문제 → 사용자가 4안 중 **상단 흰색 그라데이션** 선택,
  페이지1+2 모두 적용. 구현: `.page-bg-layer.has-full::after`(0→280px α.95→.88, 420px에서
  투명; 배너 하단은 데스크톱 271px/모바일 282px로 측정). `has-full` 클래스는
  `applyPageBackground`(뷰어)와 `renderBgEditCanvas`(편집기, WYSIWYG)가 토글. **요소만 있고
  전체 이미지가 없으면 스크림 없음**(틴트가 이미 밝음). smoke 테스트에 has-full/gradient
  단언 추가. qa 24/24 green.
  - **스크림 수정 (사용자 지시):** 흰색 → **레벨 틴트색**(`var(--level-accent-soft)` 그대로
    사용 — 레벨 전환 시 자동 추종), 시작 불투명도 **100%**, 높이 420→**294px**(70%).
  - **스크림 수정 2 (`2026-07-23`, 사용자 스샷 피드백):** 0px 시작이면 100% 지점이 불투명
    헤더(86px) 뒤에 숨어 첫 가시 지점이 이미 ~70%로 빠져 보이는 문제 → **0~120px 100% 유지**
    후 294px에서 투명 (3-stop). + **레벨명 텍스트 흰색 글로우**: `body.page-bg-active`
    스코프에서 `#contentLevelName`/`#monthLevelTag`에 3겹 white text-shadow(6/14/28px) —
    배경 없는 페이지는 변화 없음. qa 24/24 green.
  - **스크림 수정 3 (사용자 지시):** 페이드 끝점 294→**382px**(+30%), 100% 유지 구간(120px)은
    그대로. 최종 형태: 0~120px 레벨 틴트 100% → 382px 투명.
  - ✅ **배포 완료 (`2026-07-23`):** 커밋 `b670534` push → Vercel 자동 배포.
    new-app0607.vercel.app + cambridgereading.com 모두 새 styles.css(382px 스크림)·
    background-editor.js(고스트 토글) 서빙 확인. 라이브 확인 시점에 L1/March의
    `page_backgrounds` 데이터가 비어 있어(full:null, elements:[]) 배경 미표시 — 코드가 아니라
    DB 데이터 상태(사용자 테스트 중 비워진 것)로, 배경을 다시 저장하면 스크림·글로우가 적용됨.

## Current phase: DESIGN ITERATION (live for client review)

We are polishing the visual design per the user's requests — one change at a time — and
deploying for client review. The app is **live**: https://new-app0607.vercel.app

### How we work in this phase

1. Make the requested change in `index.html` / `styles.css` / `app.js`.
2. Verify locally: `npx prettier --write` the edited files → `npm.cmd run check`; for visual
   changes, screenshot via Playwright (local static server) and check computed values.
3. Report changed files + verification. **Do NOT commit or deploy unless the user asks.**
4. When asked to commit/deploy: `npm.cmd run qa` → commit → `git push` (Vercel auto-deploys).
   Then verify the live site.

- User preference: work locally; commit & deploy only on request. Keep approved visuals exactly
  as-is unless a change is requested.
- **Rule: the admin mode must always mirror the user screen.** Every user-visible content
  element (toolbar buttons, covers, slots) needs a matching admin editor, same order,
  level-aware label. Update `renderAdminBoard()` / `slotLabel()` together with any user-side
  content UI change.
- Small, specific design tweaks → just execute + verify. Non-trivial/architectural work →
  use Plan mode first.

## Infrastructure

- **GitHub:** https://github.com/crspiegel/new-app_0607 (public, branch `master`, remote `origin`).
- **Vercel:** project `new-app_0607`, connected to the GitHub repo → `git push` = auto production
  deploy. **Static, no build** (`vercel.json` + `.vercelignore`; see `NOTES.md` for why no Vite build).
- **Accounts:** GitHub + Vercel are **`crspiegel` / crspiegel@gmail.com** (NOT any `wechange2023*`
  account). `git push` works (gh is the credential helper via `gh auth setup-git`).
- **Custom domain:** `cambridgereading.com` (registered at **Gabia**), connected `2026-07-15` via
  Gabia DNS records (nameservers unchanged). `www` = primary, apex → `www` (308). Live vercel.app URL
  (`new-app0607.vercel.app`) still works. Details/values → `NOTES.md` "Custom domain (Gabia + Vercel)".

## Design changes done so far

- **Repo hygiene (early):** docs consolidated 9→6, dead code removed, git initialized, deployed.
- **Header:** level icons 70×50, radius 24, numbers Sniglet 22px; `scrollbar-gutter: stable`
  (consistent cross-page alignment); nav drops to its own centered row at ≤1023px.
- **Month-select page:** labels show "March" (removed "MONTH"); per-level theme color aligned to
  each level's own color (L1 yellow / L2 red / L3 blue / L4 purple); book-band labels (e.g.
  "Pink A/B, Red, Yellow") under the level chip; box numbers **Manrope 800 / 52px** (white fill +
  theme-shadow stroke — the `[class*="level-theme-"]` rule overrides the base Concert One rule);
  box radius 39px.
- **Content (month detail) page** (V1 `#contentScreen`, all levels + all months):
  - Background = a light per-level tint (L1 ivory `#fff3cc`, L2 `#ffe8e8`, L3 `#e8f6ff`,
    L4 `#f4e3ff`); text uses the readable dark theme shade (`--level-accent-shadow`).
  - **Centered top banner**: Level name (Sniglet 40px) + book band (Inter 16px) + a month
    badge, all in the level's theme color. The month badge is a **bare number in a circle**
    (no "Month" label, no pill) — `60px` circle filled with the level theme color
    (`var(--level-accent)`), white **Manrope 800 / 36px** number (matches the month-select page
    typeface). The "Month" text node is hidden via `font-size:0` on `.content-banner-month`.
  - **Toolbar ↔ weekday board gap** tightened to ~50% (toolbar `margin-bottom:12` /
    `padding-bottom:7`; board `padding-top:25` in the ≥768px block so mobile keeps its padding).
  - The "X Reading Plan" h2 title is **hidden** (the whole `.content-v2-title-block`); its font
    trial had settled on Baloo 2 / 800 before it was hidden.
  - **Month navigation**: a header row just below the topbar with **Back = previous month (left)**
    and **Next = next month (right)**. Back hidden on March (first), Next hidden on December
    (last) via `#contentScreen[data-month="..."]`. `app.js` sets `#contentScreen` `data-month`
    (used for the layout + first/last logic) and `goToMonth(±1)` drives the buttons.
  - ⚠ Back no longer returns to the month-select screen — to change level/month otherwise, use
    the top-nav level icons (→ `#months`) or the brand logo (→ home).
  - **Lesson board redesign (client-approved on L1/April, then rolled out to ALL levels +
    ALL months):** toolbar reduced to **Opening + Ending Song only** (other three hidden),
    centered; weeks numbered **continuously 1–4** (across both books, in `renderLessons`);
    weekday buttons are **3D in the level theme color**; weekday text **24px** in a dark theme
    shade; **week-label cards are flat (2D) on a light theme tint**. Per-level colors come from
    new `.level-theme-N` vars `--content-day-bg/-shadow/-text` and `--content-week-tint`; the
    rules themselves are un-scoped (`#contentScreen ...`) so every level/month inherits them.
    L1 keeps the exact approved values (`#ffd43b` / `#8a6400` / `#ffe9a8`). (V2/V3 untouched.)
- **Main page section titles:** Nunito 900 / 33px; "Choose Your LEVEL" capitalized.
- **Footer color per level:** the shared `.site-footer` is green (`--owl-green`) on home/overview,
  but takes the active level's theme color on level pages (L1 yellow / L2 red / L3 blue /
  L4 purple). `app.js` `showScreen()` mirrors the level-theme class onto `<body>` for the four
  level screens (months/content/contentV2/contentV3); CSS:
  `body[class*="level-theme-"] .site-footer { background: var(--level-accent) }`. Footer text is
  still white (`--canvas`) — fine on red/blue/purple; ⚠ low contrast on L1 yellow (open item).
- **Login page (new, frontend-only — no real auth):** `#loginScreen`, routed from the header's
  rightmost login button (`data-view="login"` → `#login` hash; `setHash`/on-load handle it).
  Layout based on the Duolingo login screenshot but rebuilt in our design system: **'Log in'
  title in Cal Sans** (Google Fonts; `letter-spacing:0.03em`), soft-gray rounded `user ID` +
  `Password` inputs (focus → macaw-blue), big macaw-blue tactile **LOG IN** button (height 75px),
  one-line legal fine print. No sign-up, no OR/Google/Facebook (removed per request). Card is
  centered both axes between header/footer (`body.login-active main{display:flex}` +
  `#loginScreen.screen-active{flex:1;display:flex}` + section centers). **Footer turns white**
  on login (`body.login-active .site-footer`, hairline top, muted dark text). app.js toggles
  `login-active` on `<body>` in `showScreen()`.
- **Footer copyright:** year is now **2026** on all pages (was 2025). Copyright text **bold
  removed on the main/home page and the login page only** (others stay 800/bold — HOLD): home
  via `body:not(.subpage-active) .site-footer p{font-weight:400}`, login via
  `body.login-active .site-footer p`. Inter `400` weight added to the font import for a true
  regular.
- **Video player modal (Level 1 / March ONLY — `2026-06-10`):** clicking **Opening Song**,
  **Ending Song**, or any of the **20 weekday lesson buttons** opens a custom-shelled video
  modal. Scope is enforced at click time (`isLevel1March()` = `state.level === "Level 1" &&
state.month === "March"`), so the shared `#contentScreen` markup stays inert on every other
  level/month and on V2/V3. Built from scratch in our design system: centered overlay, **50vw**
  white card (`92vw` under 760px), 16:9 black stage, and a control row — **Play/Pause (single
  toggle) · Stop · Repeat · progress bar · Maximize**. Style (revised `2026-06-10`): **flat aqua**
  (`--macaw-blue`) circular buttons — no bevel/drop shadow, white icons, hover → `--macaw-blue-shadow`,
  Repeat-active → `--deep-blue`. Round **X** close is also flat aqua with a **thick white "x"**
  (`stroke-width:4`), top-right corner-overlap. Driven by the **Vimeo Player SDK** (`player.js`,
  before `app.js`; `controls:0` so our UI is the only UI). **One Play/Pause toggle**
  (`#vpToggle[data-playing]`) swaps icon via the Vimeo `play`/`pause`/`ended` events; **clicking the
  video** (transparent `.vp-click-layer` over the iframe — the cross-origin frame would otherwise
  eat the click) toggles play/pause too. Stop = `pause()` + `setCurrentTime(0)`; Repeat = `setLoop()`
  (`aria-pressed`); Maximize = Fullscreen API on the card (Vimeo's native fullscreen is hidden with
  its controls). Progress via `timeupdate`, click-to-seek. Close via X / overlay / **Esc**. The
  stage clips the iframe cleanly via layer promotion (`transform:translateZ(0)`) + matching
  `border-radius` on the iframe — fixes the thin black corner seam Chrome leaves when an ancestor's
  `border-radius` doesn't clip a child iframe. Sample video for all 22 buttons: Vimeo id `210024645`.
  Markup `#videoModal` lives before `app.js`; styles are a new self-contained block (no existing
  rules touched). _Not yet wired:_ per-button distinct URLs, other levels/months.
- **Video player design pass (`2026-06-10`):** kept the flat-aqua/toggle/thick-X direction, polished
  within it. **Two-tier control bar** — full-width **progress row** (`current · bar · duration`) on
  top, **transport row** below (toggle/stop/repeat left, `.vp-spacer`, maximize right) — fixes the
  cramped mobile seek bar and the lopsided desktop layout. Added **time labels** (`formatTime`,
  tabular-nums) from `timeupdate`/`getDuration`; a **draggable thumb** with pointer drag-to-seek
  (`vpDragging` ignores `timeupdate` mid-drag; `is-dragging`/`:hover` grow the thumb); a **context
  title** `#vpTitle` (lesson buttons carry `data-vp-title` = `"<lessonType> · Week N"` set in
  `renderLessons`; toolbar passes "Opening/Ending Song"); **bigger primary toggle** (58 vs 50px);
  `:focus-visible` deep-blue rings (buttons are shadowless); a **pop-in** card animation +
  overlay fade (guarded by `prefers-reduced-motion`); a soft **dark-aqua radial** stage background
  so buffering reads as loading not broken; and `:fullscreen` light title/time text. ⚠ Headless
  can't load Vimeo duration/playback, so live time + drag-seek are verified by inspection (guarded
  on `vpDuration`), not headless run — see `NOTES.md`.
- **Video player controls reflow + end overlay (`2026-06-10`):** transport row is now a 3-zone grid
  (`grid-template-columns:1fr auto 1fr`) — **Repeat left** (`.vp-transport-left`), **Play/Pause +
  Stop centered** (`.vp-transport-center`), **Maximize right** (`.vp-transport-right`); replaced the
  old left-clustered + spacer layout. **End-of-video overlay** (`#vpEndOverlay`, inside `.vp-stage`,
  `z-index:2` above the click layer, opaque dark-aqua radial + a **Replay** pill) shows on the Vimeo
  `ended` event to **cover Vimeo's related-videos end screen** (no reliable cross-account embed param
  to disable it, so we overlay instead). Hidden on open/close and on the `play` event; Replay =
  `setCurrentTime(0)` + `play()` + hide. (Loop on → `ended` never fires → no overlay, as intended.)
- **Video player design-review pass 2 (`2026-06-10`):** (1) **title separator unified to `·`** —
  lesson buttons now `"<lessonType> · Week N · <day>"` (e.g. `Story · Week 1 · Tue`); dropped the
  earlier `-` between week/day. (2) **On-brand title** — 18px + a small aqua accent dot
  (`.vp-title::before`). (3) **Mute/volume toggle** (`#vpMute`, left zone next to Repeat) — Vimeo has
  no mute, so `setVolume(0)` / restore `vpLastVolume`; persists across opens, applied on player
  create; deep-blue active state + volume/muted icon swap. (5) **Buffered indicator**
  (`#vpProgressBuffer`, light aqua) driven by the Vimeo `progress` event. (6) **Darker time labels**
  (`#555`). (7) **Slider a11y** — progress bar is `role="slider"` with `aria-valuenow`, plus keyboard
  seeking (←/→ ±5s, Home/End). **Stop kept** (it's an original required control; the review's
  "reconsider" resolved to keep). `.vp-transport-left` is `display:flex` so Repeat+Mute sit in a row.
  ⚠ Live time / drag / keyboard-seek / mute audio still can't be exercised headless (no Vimeo
  duration/playback there) — verified by structure + inspection.
- **Video player inline volume slider (`2026-06-10`):** added a compact horizontal **volume slider**
  (`#vpVolume`, `role="slider"`) next to the mute button, wrapped together in `.vp-volume` in the
  left transport zone. Reuses the progress bar's aqua fill + white thumb at a smaller scale (84px).
  State is `vpVolumeLevel` (0–1) + `vpLastVolume`; **`applyVolume()`** is the single entry point
  (slider drag/click, keyboard ±10% via ←/→/↑/↓ + Home/End, and the mute button which toggles
  between 0 and the last non-zero level). `reflectVolumeUI()` keeps the slider fill/thumb +
  `aria-valuenow` + mute icon (muted = volume 0) in sync; a Vimeo `volumechange` listener mirrors
  external changes. Volume persists across opens and is applied on player create
  (`setVolume(vpVolumeLevel)`). **Responsive:** the slider is hidden under `560px`
  (`@media max-width:560px`) so phones keep just the mute toggle (no row overflow); the slider's UI
  is fully testable headless since `applyVolume` updates the DOM independently of Vimeo playback.
  ⚠ Naming gotcha: the DOM ref is `vpVolume` (element), the volume value is `vpVolumeLevel` — don't
  collide them (a `const`/`let` of the same name is a SyntaxError).
- **Video player title font + chunkier volume bar (`2026-06-10`):** the `.vp-title` is now
  **Readex Pro 600** (added `Readex+Pro:wght@600` to the Google Fonts `<link>`) in a readable light
  gray **`#9a9a9a`** (was Nunito 800 / `--ink`). The inline **volume slider is larger/plumper** —
  `104×13px` track (was 84×8) with a `21px` thumb (was 16) — per the request that it felt too small.
- **Video player title size + hover volume (`2026-06-10`):** title font reduced `18px → 15px`.
  The volume slider no longer sits permanently next to the progress bar (looked cluttered) — it's
  now a **hover/focus-revealed floating popover above the sound icon** (`.vp-volume` is the
  `position:relative` anchor; `.vp-volume-slider` is absolute, `opacity:0`/`pointer-events:none` by
  default, revealed via `.vp-volume:hover`/`:focus-within`, with a `::after` bridge over the gap so
  the hover doesn't drop). Still hidden under 560px (mute only). Floats to the **right of the sound
  icon** (`left:calc(100% + 12px); top:50%`) — the earlier above-the-icon position overlapped the
  progress bar; right placement sits in the empty gap between mute and the play buttons, clear of
  both. **Corner seam re-fix (`2026-06-10`):** the thin dark band at the video's rounded corners
  was the iframe's _own_ `border-radius` exposing the dark stage background. Fix = iframe is now
  **square (no radius) and overscans the stage 1px on every side** (`top/left:-1px;
width/height:calc(100% + 2px)`), so the stage's rounded `overflow:hidden` clip always cuts through
  solid video. See `NOTES.md`. **Fullscreen auto-hiding chrome (`2026-06-10`):** in fullscreen the
  title + controls + close become **YouTube-style auto-hiding overlays** — title overlays the top,
  controls the bottom (each over a scrim), hidden by default and revealed on pointer-move/tap, then
  re-hidden after 2.5s of inactivity (cursor hidden too). `app.js` toggles a **`.vp-fullscreen`
  class** on `fullscreenchange` (so the CSS keys off `:is(:fullscreen, .vp-fullscreen)` and the
  behaviour is testable without real fullscreen); `revealFsControls()` adds `.vp-controls-visible` +
  a `window.setTimeout` hide timer; `pointermove`/`pointerdown` on the card re-reveal. Non-fullscreen
  mode is untouched (chrome always visible). ⚠ ESLint has no `setTimeout`/`clearTimeout` globals —
  use `window.setTimeout`/`window.clearTimeout`. **Title week/day:** confirmed the
  20 weekday lesson buttons already show `"<type> · Week N · <day>"`; the toolbar Opening/Ending
  Song are month-level (no week/day) and the user chose to **keep them as just the song name**.
- **Book cover art on the title-card placeholders (Level 1 / March — `2026-06-10`):** the two
  white rounded placeholders left of the weekday groups (`.book-title-card`, rendered by
  `renderLessons`) now show real **Cambridge Reading Adventures covers** — `book-1` = "My Dad is a
  Builder" (`assets/l1-march-book-1.jpg`), `book-2` = "The Show and Tell Day"
  (`assets/l1-march-book-2.jpg`). `renderLessons` tags each card `book-1`/`book-2`; the covers are
  set as `background-image` **scoped to L1 March only** via
  `#contentScreen.level-theme-1[data-month="March"] .book-title-card.book-N`, so every other
  level/month keeps the empty white placeholder. **Final design:** `background-size: cover` (fills
  the card, aspect kept, slight crop accepted — no leftover background), **no 3D lip**, replaced by a
  **3px white outline OUTSIDE the cover** (`box-shadow: 0 0 0 3px #ffffff` — outset, not inset, so it
  never covers the image; follows the rounded corners; adds no layout box). The two cards are the
  same size (150×202) and span exactly week1→week2 / week3→week4 (grid-row span 2; card top/bottom
  align to the week rows at 0px). (Iterations the client rejected: `contain` + white box left
  letterbox margins; an inset outline intruded over the image — final is outset white 3px.) Source
  files were `e:\tps\app\9781107549739i.jpg` / `20260610_160816.jpg`. ⏳ Pending client design
  sign-off before rolling covers out to all levels/months — when extending, scope per
  level/month (the covers and ideally the outline color may differ per level).
- **DESIGN.md updated:** added an authoritative **"Implemented Design System (current build —
  source of truth)"** section documenting the real as-built values (tokens, fonts, the per-level
  theme token table, header/month/content specs, footer) — supersedes the legacy Duolingo-ABC
  reference where they differ.

- **Responsive optimization pass (`2026-06-11`, from user device testing — NOT yet committed):**
  Four fixes across tablet-landscape and mobile-portrait, verified by Playwright screenshots at
  360/390 (mobile) and 768/800/1024/1180/1280 (tablet→desktop); no horizontal scroll at any width.
  - **Hero buttons under the wave:** the decorative white `.hero-wave` is `z-index:2`; the hero
    content grid was `z-index:1`, so a tall copy column (tablet landscape) let the app-download
    buttons sink _behind_ the white wave. Fixed by raising `.hero-grid` to **`z-index:3`** (desktop
    unaffected — its image never reaches the wave).
  - **Tablet-landscape hero too narrow:** in `@media (min-width:768px) and (max-width:1180px)`,
    widened the copy column and shrank the image column + gap
    (`grid-template-columns: minmax(0,1.1fr) minmax(280px,0.72fr)`), pushed the image to the right
    (`.hero-stage{place-items:center end}`), and trimmed `.hero-copy` padding-bottom to 92px.
  - **Tablet-landscape content board cut off (Thu/Fri hidden, h-scrollbar inside `.lesson-board`):**
    root cause was `.lesson-grid{min-width:900px}` + the desktop's big content padding overflowing
    the viewport. New block **`@media (min-width:768px) and (max-width:1249px)`** drops the min-width
    floor, tightens the grid (`minmax(72px,150px) 60px repeat(5,minmax(54px,1fr))`, gap 16) and
    content padding (`clamp(28px,4vw,64px)`, board 30). Hands off to the base desktop layout at
    **≥1250px** where the 900px grid fits the default padding natively (computed: `0.88·W−200 ≥ 900`).
  - **Mobile-portrait hero stacked:** removed the fixed `--hero-height` clamp on mobile
    (`height:auto`), made `.hero-stage` in-flow below the copy at full opacity (was an absolute,
    faded, off-screen background decoration), and forced the two store buttons onto one row
    (`.app-downloads{flex-wrap:nowrap}` + `.app-download-button{flex:1 1 0;width:auto}`). Order is
    text → 2 buttons across → image (natural DOM order in the single-column grid).
  - **Month-select 2×5 on mobile:** base `.month-grid` is now `repeat(2,minmax(0,1fr))` (was `1fr`);
    still widens to 5 columns at ≥768px. Mobile month-button → full cell width, 96px min-height.
  - **Mobile-portrait content board (most severe):** restructured to a **6-column grid**
    (`44px` week-label + `repeat(5,minmax(0,1fr))`) with **each book cover promoted to its own
    full-width row** (`.book-title-card{grid-column:1/-1;grid-row:auto}`, `background-size:contain`
    so the whole portrait cover shows). This removes the wide book-card column that forced the
    h-scroll; all five weekdays fit and day text scales (`font-size:clamp(11px,3.2vw,15px)`).
    Opening/Ending Song are bigger and side by side (`.content-type{flex:1 1 0;min-height:60px}`).
    (The old `@media (max-width:420px)` lesson rules are now out-specified by these `#contentScreen`
    rules — harmless dead rules.)

- **Responsive pass — round 2 (`2026-06-11`, after user re-test at 320px Galaxy S9+; uncommitted):**
  - **Image must sit BEHIND the white wave (mobile + desktop + tablet).** Round 1 raised
    `.hero-grid` to `z-index:3` to save the buttons, which also lifted the character image above
    the wave. Fixed by **removing the z-index from `.hero-grid`** (so it creates no stacking context)
    and instead giving **`.hero-copy{z-index:3}`** (above the `z-index:2` wave) and leaving
    `.hero-image`/mobile `.hero-stage` at `z-index:1` (below it). Net: characters emerge from behind
    the white curve; the text + app buttons stay on top. Mobile `.hero-wave` shortened to 96px so the
    in-flow image only tucks its base behind the curve.
  - **Mobile store buttons overflowed at 320px** ("Google Play" escaped): shrank the icon (20px),
    `small` (9px), `strong` (12px) and button padding/gap in the `≤767px` block so both fit.
  - **Level cards 2×2 on mobile:** base `.level-grid` → `repeat(2,minmax(0,1fr))` (was 1fr); widens
    to 4 at ≥768px. Mobile level-button shrunk (min-height 158, rows `26px 1fr 38px`, strong 26px).
  - **Month buttons wider + title one line:** the month screen used the default 80% content width
    (big side margins → tall buttons, wrapped title). Forced **`#monthScreen .section-inner{width:100%}`**
    on mobile, shortened the button (min-height 84), and set `#monthTitle{white-space:nowrap;
font-size:clamp(24px,7vw,32px)}`.
  - **Mobile content covers:** round 1 made the book card full-width + `contain`, so the cover
    floated in an oversized white box. Now the **card is sized to the cover** (centered,
    `width:min(150px,46%)`, `aspect-ratio:150/202`) and uses the base `has-cover` rule
    (`background-size:cover` + rounded 22–26px + 3px white outline) → matches the PC card. Added
    `margin-top:12px` so book 2 doesn't butt against the week-2 row. Weekday buttons are now
    **square** (`aspect-ratio:1/1`, `min-height:0`); week-label `min-height:0` stretches to match.

- **Responsive pass — round 3 (`2026-06-11`, spacing/aspect polish; uncommitted):**
  - **Level cards wider:** the level section still used the 80% content width (narrow, tall cards).
    Forced `.level-section .section-inner{width:100%}` + `.level-grid{gap:14px}` on mobile and
    trimmed the card (`min-height:146`, rows `24px 1fr 36px`) → near-square 2×2.
  - **Content week-row spacing:** the mobile lesson grid went from uniform `gap:6px` to
    **`column-gap:6px; row-gap:14px`** so week 1 / week 2 (and 3 / 4) rows breathe; bumped the book
    cover `margin-top` 12→16 so book 2 clears the week-2 row above it.

- **Responsive pass — round 4 (`2026-06-11`, after user landscape-phone re-test 658×320; uncommitted):**
  - **Compact mobile header.** The `≤767px` topbar was ~135px tall: the base `.topbar{gap:16px}`
    added ~32px of row-gaps between the three wrapped rows (brand / empty `.topbar-actions` / nav).
    Set mobile **`.topbar{gap:2px; min-height:0; padding:8px 24px}`**, shrank the logo
    (`.brand-name` → `clamp(18px,4.6vw,22px)`), tightened the brand→nav gap (`.top-nav{margin-top:0}`),
    and shrank the nav icons (`.top-nav-link` 50→46/min-h 56→48, `.nav-book` 50×36→46×33,
    number 20→18). Now ~105px. (Touch target eased 56→48 on mobile to hit the height the user asked
    for — a small, deliberate compromise.)
  - **Landscape content board ballooned** (width 658 hits the `≤767px` mobile board, whose
    `aspect-ratio:1` day buttons fill 5 stretched 1fr columns → ~150px squares with tiny text).
    Fixed by **capping + centering the board** (`#contentScreen .lesson-grid{max-width:430px;
margin-inline:auto}`) so buttons stay phone-sized (~68px) on wide screens; portrait (<430px)
    just shrinks to fit, unchanged. Widened the week column (`clamp(46px,13vw,60px)`) and enlarged
    the day text (`clamp(13px,3.8vw,19px)`) + week label (`clamp(10px,2.4vw,13px)`) so text scales
    with the button. NB: large-phone landscapes ≥768px (e.g. iPhone 844) use the _tablet_ board
    (768–1249 block), not this one.

- **Responsive pass — round 5 (`2026-06-11`, logo size + week label + landscape header; uncommitted):**
  - **Logo halved on mobile.** ⚠ The wordmark letters are **`.brand-accent` + `.brand-adventures`**
    spans (fixed `33px`), NOT `.brand-name` (which is just the flex wrapper) — shrinking `.brand-name`
    did nothing. Overrode the two spans to `clamp(14px,4.2vw,17px)` in the `≤767px` block (scoped to
    mobile, so desktop/tablet stay 33px). Header followed: ~106→~85px portrait.
  - **Week label = number only on mobile.** `renderLessons` now emits
    `<span class="wk-text"><span class="wk-num">N</span> <span class="wk-word">week</span></span>`;
    mobile hides `.wk-word` (just "N"), desktop shows "N week". ⚠ The number/word MUST be wrapped in
    one inline `.wk-text` span — `.week-label` is `display:grid; place-items:center`, so two _top-level_
    children become separate grid rows and the label stacked "N" over "week" on desktop. Narrowed the
    mobile week column (`clamp(24px,6.5vw,34px)`) → bigger day buttons; week-number font bumped.
  - **Landscape phone header = one row.** New `@media (max-width:767px) and (orientation:landscape)`:
    `.topbar{flex-wrap:nowrap}` with logo left + level nav right (`.top-nav{order:2;justify-content:
flex-end}`), small logo + nav icons → ~55px (was a stacked ~105px). Large-phone landscapes ≥768px
    already get the horizontal tablet header.

- **Responsive pass — round 6 (`2026-06-11`, song buttons + iPad level cards + landscape months;
  uncommitted):**
  - **Portrait song buttons stacked.** New `@media (max-width:767px) and (orientation:portrait)`:
    `#contentScreen .content-toolbar{flex-direction:column}` → Opening Song on top, Ending Song
    below, each wider (`width:100%; max-width:340px; min-height:64px; font-size:18px`).
  - **Removed a dead duplicate** `#contentScreen .content-type` (leftover) that had been re-shrinking
    the song buttons to `10px/18px` — that was why the landscape song text looked tiny.
  - **Landscape song/day text bumped** (in the landscape block): `.content-type` 16px / icon 26px,
    `.lesson-button strong` 21px, `.week-label` 19px so text reads in proportion to the buttons.
  - **iPad (1024 landscape) level cards → 1:1.** `@media (min-width:900px) and (max-width:1180px)`:
    level section goes **full width** (was 80%, which made the 4 cards narrow), `.level-grid{align-items:start}`
    (⚠ without this the default row **stretch** overrides `aspect-ratio`), `.level-button{min-height:0;
aspect-ratio:1/1}` → ~206px squares at 1024. Lower bound 900px (below that 4 columns get too
    narrow and "Level N" crowds); desktop ≥1181 untouched.
  - **Landscape month buttons ~60%** (in the landscape block): `.month-button{width:60%}`, strong
    40→24. ⚠ Height floor is set by the higher-specificity `#monthScreen[class*="level-theme-"]
.month-button{min-height:137px}`, so the shrink override must reuse that exact selector
    (`min-height:80px`) — a plain `.month-button` rule loses. Now ~179×80 (was ~305×137).

- **Responsive pass — round 7 (`2026-06-11`, gaps + login icon visibility; uncommitted):**
  - **Landscape month gap.** Round 6's `width:60%` inside full 1fr cells left a big gap between the
    two columns. Switched to **`#monthScreen .month-grid{grid-template-columns:repeat(2,180px);
justify-content:center;column-gap:18px}`** + `.month-button{width:100%}` so the two buttons sit
    close together, centered (same ~180px size, much smaller gap).
  - **Portrait song buttons −20% width.** Portrait `#contentScreen .content-type` max-width 340→272
    (text unchanged at 18px).
  - **Login icon shown when signed in (bug).** `.login-button` had no signed-in hide logic, so Admin +
    Log out + Login all showed at once. Added global **`body.is-admin .login-button{display:none}`**
    (hides on desktop/tablet/mobile when signed in).
  - **Login icon on mobile.** The `≤767px` block had `.login-button{display:none}` (no login on
    phones). Now shown (`display:inline-grid; 40×40`); **portrait** pins it top-right of the header
    (`position:absolute;top:8px;right:14px`) beside the centered logo, **landscape** keeps it hidden
    (single-row header already tight with logo + 5 nav icons). Mobile logo +20%
    (`.brand-accent/.brand-adventures` clamp(14,4.2vw,17) → clamp(17,5vw,20)).

- **Responsive pass — round 8 (`2026-06-11`, mobile header refactor + landscape board; uncommitted):**
  Reworked the whole mobile header for both orientations and both signed-in states.
  - **Logo now LEFT-aligned on mobile** (base `≤767px`: `.brand{width:auto;justify-content:flex-start}`,
    `.brand-name` left) instead of centered.
  - **Admin / Log out are circular icon buttons on mobile.** Added `<svg class="action-icon">` (user /
    log-out glyphs) + `<span class="action-label">` to both buttons in `index.html`. Desktop hides the
    icon and shows the text pill (unchanged); mobile hides the label and makes them 34px circles
    (`border-radius:50%`). The login icon is also 34px, sized ~to the logo height (was 40px, "too big").
  - **Portrait header**: row 1 = logo (left) + actions (right, `.topbar-actions{order:1;margin-left:auto}`);
    the level nav drops to its own centered row below. Removed the old absolute-positioned login icon.
  - **Landscape header**: single row = logo (left) · nav (center, `.top-nav{order:1;flex:1;
justify-content:center}`) · actions (right, `order:2`). The login icon now SHOWS in landscape
    (the round-7 `display:none` was removed). Signed in → Admin/Log out circles replace it.
  - **#5 Landscape content board = book covers on the RIGHT.** Landscape uncaps the board
    (`max-width:none`) and switches to a PC-style 7-col grid `[week] repeat(5,1fr) [cover]`; the cover
    is `grid-column:7; grid-row:span 2` (spans its two week rows, like PC but right-side instead of
    left). Portrait keeps the capped, cover-stacked-on-top layout. ⚠ The book card's base mobile
    `aspect-ratio:150/202` + `width:min(150px,46%)` must be reset (`aspect-ratio:auto; width:100%`) in
    landscape so it fills the cover column × 2-row height.

- **Responsive pass — round 9 (`2026-06-11`, icon polish + landscape board = exactly PC; uncommitted):**
  - **Admin / Log out → plain line icons, no circle.** Admin SVG swapped to a **key** glyph; Log out
    keeps the standard door+arrow. Mobile drops the circular background. ⚠ The base `.admin-nav-button`
    pill styles (background/border-radius) are declared **later** in the file at equal specificity, so
    the mobile override had to be raised to **`.topbar-actions .admin-nav-button`** (0,2,0) to win.
  - **Landscape board now EXACTLY like PC** (round 8 had the cover on the right; user wanted PC = cover
    on the LEFT): grid is `[cover] [week] repeat(5,1fr)`, cover `grid-column:auto; grid-row:span 2`
    (auto-placed in column 1 like PC).
  - **Portrait song buttons → ~60% width** (max-width 272→164); label 18→15px, icon 28→22px so the
    text stays inside the narrower button.

- **Responsive pass — round 10 (`2026-06-11`, icon size + square month buttons; uncommitted):**
  - **Log out / Admin icons matched in size.** Both `.action-icon` boxes were already 24px, but the
    (horizontal) key glyph filled less of its box than the log-out glyph, so log-out looked bigger.
    Redrew the Admin key as a **vertical key** (head + stem + teeth) that fills the box to the same
    height as log-out → equal visual size.
  - **Portrait month buttons → 1:1.** Added (portrait) `#monthScreen[class*="level-theme-"]
.month-button{min-height:0; aspect-ratio:1/1}` — keeps the column width, drops the 137px height
    floor so height = width. Now 129² at 320, 164² at 390. (Landscape month buttons keep their own
    180×80 rule.)

- **Responsive pass — round 11 (`2026-06-11`, slightly bigger portrait logo; uncommitted):**
  Portrait header row 1 height is set by the 34px action icons; the logo (brand) was only ~19–22px
  tall, so there was headroom. Bumped the portrait `.brand-accent/.brand-adventures` to
  `clamp(22px,6.5vw,26px)` (brand now ~25–28px, still < 34px) → bigger logo with **no change to the
  101px header height or the right-side icons**. Scoped to portrait (landscape logo untouched).

- **Tablet (pad) pass — round 12 (`2026-06-11`, iPad / Galaxy Tab month + content; uncommitted):**
  Scope = `@media (min-width:768px) and (max-width:1180px)` (covers iPad 1024, iPad Air 1180,
  Galaxy Tab S4 1138, iPad/Air portrait, iPad Pro 12.9 **portrait** 1024). iPad Pro 12.9 **landscape**
  (1366) is >1180 → uses the desktop layout and already fits (per user), so its month buttons stay
  164×137 (not square) — the one acknowledged exception to "1:1 on all pads".
  - **#1/#2 Month buttons square + scaled.** Were a fixed 137px tall with wildly varying widths
    (78px iPad-portrait → 164px) so the month name overflowed and number/box ratios were random. Now:
    `#monthScreen .section-inner{width:100%}`, `.month-grid{align-items:start}`,
    `#monthScreen[class*="level-theme-"] .month-button{min-height:0; aspect-ratio:1/1}` → square
    (105²–172²). Number + (absolutely-positioned) label scale with viewport: `.month-button strong
{font-size:clamp(40px,7vw,92px)}`, label `span{top/left/font-size:clamp(...)}` so the ratio is
    consistent across sizes.
  - **#3/#4 Landscape tablets fit (no vertical scroll).** New `…and (orientation:landscape)` block
    trims the desktop's heavy vertical chrome so the month page fits header→footer and ALL four week
    rows of the content board clear the fold (Galaxy Tab S4 712-tall was cutting week 4):
    footer padding 44→16; `#contentScreen .section-inner` top/bottom 84/96→16/18; the content banner
    goes **horizontal** (`grid-auto-flow:column`, ~137→~60px); banner/header/toolbar margins trimmed;
    and the row-height drivers shrunk — `.lesson-button{min-height:64}` AND
    `#contentScreen .week-label{min-height:64}` (⚠ the **week-label's** 86px min-height was the real
    row-height driver via the book cover's 2-row span, not the day button). Result: iPad-land 768/768,
    Tab S4 712/712, content board lastDay@614 — all fit with no scroll. (Portrait tablets keep the
    taller layout — they have the vertical room.)

- **Mobile-portrait session — round 13 (`2026-06-12`, header icons + Back/Next + video volume; uncommitted):**
  - **Header Admin/Log out icons smaller + matched.** Mobile `.action-icon` 24→**21px** (= login icon);
    the log-out glyph (door+arrow) fills its viewBox more than the narrow key, so it's trimmed to
    **18px** to read the same size as the Admin **key** icon. (`@media ≤767px` block.)
  - **Month-detail Back/Next ~80%.** Portrait `#contentScreen .content-nav-prev/.content-nav-next`:
    50px/15px → **40px/12px** (padding 0 14, bevel 3px). Scoped to portrait only.
  - **Video player volume = tap-to-reveal VERTICAL popover (mobile portrait, windowed + fullscreen).**
    Replaced the earlier always-visible bottom bar (it bloated the toolbar) and fixed "no volume in
    fullscreen". Tapping the speaker (`#vpMute`) toggles `.vp-volume-open` on `.vp-volume` → a 14×120
    vertical slider floats above the speaker (`bottom:calc(100% + 12px)`, `z-index:7` above the FS
    scrim). Drag/keyboard adjust; **mute by dragging to 0**; **3s inactivity auto-close** + **outside-tap
    close** (capture-phase `document` pointerdown). In FS, opening pins `vp-controls-visible` and
    cancels the 2.5s hide timer so the popover isn't hidden with the chrome; closing resumes auto-hide.
    Control buttons shrunk to ~80% (`.vp-btn` 40px, `.vp-toggle` 46px). Desktop/tablet keep the
    horizontal hover popover unchanged. ⚠ See `NOTES.md` for the `--vol` var + matchMedia-sync +
    focus-within-neutralise gotchas. ⚠ iOS may ignore programmatic `setVolume` (hardware-only) — UI
    shows but audio may not change on some real devices; verify on device.

- **Tablet-portrait fix — round 14 (`2026-06-12`, Galaxy Tab month buttons; uncommitted):**
  Galaxy Tab S4 **portrait (712px)** month buttons ballooned to ~330px 2-col squares. Root cause:
  712 < 768 so it misses the tablet block (`min-width:768`) and falls into the **phone 2-col path**
  (`.month-grid repeat(2)` + the `(max-width:767px) portrait` `aspect-ratio:1/1`). Fixed with a new
  **`@media (min-width:600px) and (max-width:767px) and (orientation:portrait)`** block that pulls the
  iPad tablet layout down: `#monthScreen .month-grid{grid-template-columns:repeat(5,1fr); align-items:start}`
  - the same number/label vw-clamps as the tablet block (2528·2532). Now 5×2 compact squares (~123px @712),
    matching iPad. Phones (<600 portrait) keep 2-col; iPad(768)/landscape unchanged. Verified Playwright:
    712→5col square, 768→5col (regress), 390→2col (regress), 1138-landscape→unchanged. ⚠ The 600–767 portrait
    gap may also affect level/content screens — only the **month screen** was fixed (user-scoped).

- **Tablet-landscape month — round 15 (`2026-06-12`, button-size parity + footer white gap; uncommitted):**
  iPad/Galaxy Tab **landscape** month page had (1) device-varying button sizes (1fr of `--content-width`
  min(80%) → iPad 1024=151px vs Tab 1138=172px) and (2) a **white band between the tinted section and the
  footer** on iPad (~49px). Root cause of the gap: `#monthScreen.screen-active{min-height:calc(100vh - 185px)}`
  uses the old header+footer magic number, but the round-12 landscape block trims the footer (→~50px); real
  header(86)+footer(50)=**136**, so 185 over-subtracts ~49px → white `<main>` bg shows. Fixed **in the
  landscape tablet block** (`(min-width:768px) and (max-width:1180px) and (orientation:landscape)`):
  `screen-active{min-height:calc(100vh - 136px); display:flex}` + `.section-box.section-white{flex:1;
display:flex; flex-direction:column; justify-content:center}` (tint fills to footer, buttons vertically
  centered) and `#monthScreen .month-grid{max-width:800px; margin-inline:auto}` (5 cols → ~135px squares,
  **identical on both devices**). Verified: iPad-LS & Tab-LS both 135×135 + gap 0; iPad-portrait/desktop
  unchanged. ⚠ 136 depends on this block's footer/header heights — recompute if they change (see NOTES).

- **Tablet-landscape month — round 16 (`2026-06-12`, label/number overlap; uncommitted):** round-15's grid
  cap fixed the button at ~135px but left the number font at `clamp(40px,7vw,92px)` and the label at
  `1.6vw` (viewport-relative) → at 1138px the number swelled to ~80px and overlapped the top-left month
  label (Galaxy Tab landscape). Since the capped button no longer tracks the viewport, switched the fonts to
  constants **in the same landscape block**: `.month-button strong{font-size:52px}` + the label `span`
  `{top:16px; left:16px; font-size:14px}`. Verified worst overlap −6px (clear) on iPad-LS & Tab-LS, identical;
  portrait/desktop untouched. ⚠ The cap↔vw-font decoupling is the lesson (see NOTES).

- **Tablet-landscape CONTENT page — round 17 (`2026-06-12`, footer white gap + banner one-line; uncommitted):**
  Landscape tablet `#content/...` had (1) a white band between the tint and footer (Tab 1138=20px, iPad
  1024=49px) and (2) the level banner crammed onto one line (`Level 1 · band · ③`) by round-12's
  `grid-auto-flow:column`. Both fixed **in the landscape tablet block** (`768–1180 landscape`):
  (1) `#contentScreen.screen-active{min-height:calc(100vh - 136px)}` (same 185→136 magic-number fix as the
  month page — header86+trimmed-footer50; the `.section-blue` tint then fills to the footer). (2) Banner →
  **2 rows**: `content-level-banner{grid-auto-flow:row; grid-template-columns:auto auto}` with `#contentLevelName`
  at (r1,c1), `.content-banner-month` at (r1,c2), `#contentLevelBand` spanning (r2, 1/-1) → "Level 1" + ③
  circle on top, band below. Circle shrunk 60→**46px** (number 36→28) to keep the 4-week board inside the fold
  on the short Galaxy Tab (712). Verified: gap 0 + 2-row banner + no vertical scroll on Tab-LS & iPad-LS;
  **iPad Pro 1366 (PC, >1180), phone, desktop ALL unchanged** (circle 60, stacked banner).

- **Session `2026-06-21` — branding, layout polish, hero animation, cleanup (all committed/pushed):**
  Naming convention used with client (빅웨이브/BigWave): **메인**=`#homeScreen`, **페이지1**=`#monthScreen`
  (월 선택), **페이지2**=`#contentScreen` (월 상세); **월그리드**=`#monthGrid`, **요일그리드**=페이지2 Mon–Fri
  board; 영역 = 헤더 / body / 풋터.
  - **Header/branding:** logo wordmark → **"Cambridge Reading"**; level nav hidden on 메인 only
    (`body:not(.subpage-active) .top-nav{display:none}`).
  - **메인페이지:** removed _Program Introduction_ + _Key Features_ sections; _Start Reading_ removed its
    title/eyebrow/desc (kept the 4 level buttons); level buttons stripped of pill-kicker + book-band text,
    set to **6:4** ratio, label dead-centered; hero height −30% (`--hero-height` 620→434) and the white
    wave follows; footer on 메인 → **white bg + dark-gray (`--ink`) text**.
  - **No-scroll layouts:** 메인 uses `body:not(.subpage-active) main{display:flex;column}` + `#homeScreen`
    flex:1 + level-section centers buttons (works mobile too — vertical-centering fix); tablet-landscape +
    PC: level buttons scale to fit at 6:4, **PC (≥1181px) keeps side margins**, tablet uses full width.
  - **페이지1:** level marking unified with 페이지2's `#contentLevelName` (Sniglet 40, theme-shadow) and
    centered; removed "Choose a Month" + strand text; **월그리드 numbers gained a "월" suffix** (Nanum Gothic
    Coding 700, baseline-aligned via inline-flex flex-end + per-digit `translateY`); tablet month buttons
    match **PC proportion** (fixed 137px height + full width; removed the `max-width:800px` cap).
  - **페이지2:** removed `#contentLevelBand` book-band text (all levels); added **Word Game** (🧩) +
    **Sentence Game** (🎯, U+1F3AF) buttons after Ending Song; tablet toolbar buttons scaled to ~PC
    proportion (`clamp(12px,1.2vw,14px)`, radius/bevel scaled to avoid distorted shadow); **toolbar aligned
    to the Mon–Fri columns** (left pad 272 tablet / 342 PC, right inset 30/50, `space-between`) + ~16px gap
    above the board (Galaxy-Tab-safe, no scroll). ⚠ PC content page already scrolls at ≤1080px height.
  - **Level-page footer:** `body[class*="level-theme-"] .site-footer` → \*\*body tint bg (`--level-accent-soft`)
    - theme-shadow text\*\* (was saturated accent + white), so body feels less cramped.
  - **Hero character animation (cutout rig):** client supplied **layered transparent PNGs same-canvas**
    (`assets/hero-rig-base/f-arm/d-arm/f-head/d-head.png`; base has connection areas **extended** so rotation
    reveals real body, not a gap). `.hero-rig` carries float+sizing; each part rotates around its joint
    (`transform-origin` %); arm wave ±9°/±6°, head sway ±3°; **speed ×1.5** (arm 1.73s, heads 2.0–2.27s,
    float 4.33s). **Exempt from `prefers-reduced-motion`** (client wants it always on — their OS has reduce
    motion ON). Old flat `hero-builder-characters_02.PNG` no longer referenced (kept on disk).
  - **Hero title:** word-by-word reveal — words wrapped in `.hero-word`, staggered (~0.17s) pop-up; also
    exempt from reduce-motion.
  - **Reusable skills added** (`.claude/skills/`): `cutout-rig-animation` (+`scripts/rig-helper.py`) and
    `word-reveal-animation` — for repeating these on other pages.
  - **Code review + cleanup** (objective subagent + independent verify): removed ~188 lines of dead CSS
    (intro/feature/library/`.level-kicker`/`#monthTitle`/`.month-strand` etc. — matched no element);
    merged the 2 Google-Fonts `<link>`s into 1 (**FOUT mitigation** — the flash is normal `display=swap`
    async swap, NOT leftover code; full removal needs font `preload`/self-host = deferred); `app.js`
    prettier; **smoke tests updated to current UI → 9/9 pass**, `npm run check` green. **V2/V3 calendar
    screens kept** (smoke tests assert they "remain available"). **18 orphaned asset images kept** per
    client (design reference).
  - **Infra note:** worked via gh account **`bigwavecto`**, added as a **collaborator** (write) on
    `crspiegel/new-app_0607`; pushes work from this account now. (Repo/Vercel owner is still `crspiegel`.)
  - Commits today: `e015e8b` (UI), `0816144` (hero rig), `4b8fdb6` (word reveal), `d78f5b0` (skills),
    `0044b01` (cleanup).
  - **Deferred / open:** full FOUT removal (font preload/self-host); whether to delete the 18 orphaned
    assets later.

- **Session `2026-06-28` — Level 1 페이지2 요일그리드 단일 표지 (uncommitted):** client wants **Level 1
  only** to show **one** cover in the 요일그리드 instead of two, keeping the cover's **current size/aspect**
  and centering it vertically across the 1–4 week span; Levels 2–4 keep both covers. Plan file:
  `C:\Users\USER\.claude\plans\zippy-discovering-allen.md`.
  - **Public 페이지2 (CSS only, `styles.css`):** `#contentScreen.level-theme-1 .book-title-card.book-2
{display:none}` (all breakpoints) + inside `@media (min-width:768px)`: `.book-1{grid-column:1;
grid-row:1/span 4; align-self:center; aspect-ratio:150/202; min-height:0}` — book-1 reserves the whole
    left column so the 24 weekday cells auto-flow unchanged, while the cover stays current-size and centered.
    **No column-width change** → tablet/mobile no-scroll layouts untouched. Mobile (`max-width:767`) keeps the
    existing full-width banner; the `min-width:768` rule and the `max-width:767` block meet with no gap.
  - **ADMIN (`app.js` `renderAdminBoard` + `styles.css`):** Level 1 now renders a **single** `.admin-book
.admin-book--single` block = one cover (`book-1`) + **weeks 1–4** (slot keys `w1..w4` are independent of
    the cover, so all 4 weeks of video editors remain); other levels keep the 2-block loop. CSS
    `.admin-book--single .admin-cover{align-self:center}`.
  - Pre-existing **test cover images ignored** per client (will be re-uploaded; orphaned `book-2` data is fine).
  - `npm.cmd run qa` green (lint + prettier + 9/9 Playwright). **Committed** `ff4660e`.

- **Session `2026-06-28b` — admin polish + player (Vimeo→Vimeo/YouTube), sample fallback removed:**
  - **Admin typography:** unified the whole admin body to Google Sans via `#adminScreen, #adminScreen *
{font-family:var(--font-google-sans)}` (id+universal outranks the per-element Sniglet/Nunito/Inter; no
    `!important`). Header admin buttons + slot modal left as-is.
  - **Admin board width / no h-scroll:** the weekday board overflowed because `.admin-week-row`'s `1fr`
    (=`minmax(auto,1fr)`) couldn't shrink below the `.admin-slot-url` nowrap min-content. Fixed with
    `minmax(0,1fr)` on `.admin-book` + `.admin-week-row` (base **and** the `max-width:760px` block) +
    `min-width:0` on `.admin-slot`/`.admin-weeks`. Also widened admin body to use the viewport:
    `#adminScreen .admin-inner{width:100%; max-width:var(--site-max-width); margin-inline:auto;
padding-inline:max(50px,4vw)}` (≥50px gutters, 1600 cap).
  - **Admin sections split into tabs:** top-center **plain-text menu** (`.admin-menu`/`.admin-menu-btn`,
    underline-on-active — deliberately not pill buttons, to read differently from the kid-facing header nav)
    toggles `#adminViewContent` (level/month + board) vs `#adminViewMembers` (member mgmt). JS
    `setAdminView(view)` flips `[hidden]` + active class + `#adminTitle`; `openAdmin()` defaults to content.
    `.admin-view[hidden]{display:none}` guard needed because `.admin-view` sets `display:flex`.
  - **Video player now Vimeo OR YouTube.** Refactored the Vimeo-only player to a uniform `activePlayer`
    interface (play/pause/setCurrentTime/setVolume/setLoop/destroy). `parseVideoSource()` detects
    youtube.com/youtu.be/embed/shorts/live → `mountYouTube` (IFrame API, lazy-loaded; custom controls drive
    it; **250ms poll** for progress since YT has no timeupdate; loop handled on ENDED); else `mountVimeo`
    (unchanged behavior). `#vpClickLayer` over the iframe keeps native chrome inert. Admin URL field label →
    "Vimeo or YouTube".
  - **Sample-video fallback REMOVED.** `parseVideoSource` returns null for empty; `openSlot` shows a new
    **"Coming soon!"** popup (`#comingSoonModal`, reuses no-access shell, English copy) instead of playing
    `SAMPLE_VIMEO_ID` (constant deleted).
  - **DB:** client cleared all stored video URLs via Supabase SQL `update content_pages set videos='{}'::jsonb`
    (covers preserved). Content lives in `content_pages` (videos/covers jsonb), read by anon key, written by
    admin (RLS). Supabase config in `supabase-config.js`.
  - `npm.cmd run qa` green (9/9). Client verified Vimeo+YouTube playback + empty-slot popup before commit.

- **Session `2026-06-28c` — admin member editor (grade + password):** added a per-member **Edit** button in the
  Members tab → opens a modal (mirrors the slot-editor modal) to change a member's **grade (permission)** and
  optionally **reset the password** (blank = keep current). Backed by a new Supabase RPC
  **`update_member(p_id, p_grade, p_password default null)`** added to `supabase/migration.sql` (SECURITY
  DEFINER, `is_admin()` gate, bcrypt `crypt(pw, gen_salt('bf'))` — same as `create_member`; revoked from anon).
  **Client ran the SQL in Supabase** and verified grade-only + password-change edits before commit. The id and
  active flag are not editable here (active = the existing Activate/Deactivate toggle via `set_member_active`).
  JS: `openMemberEditor`/`commitMemberEdit` call `update_member`; new `.admin-member-actions` wraps Edit +
  toggle. `npm.cmd run qa` green (9/9).

- **Session `2026-06-28d` — admin Korean localization + refresh fix:**
  - **Admin UI → Korean.** Translated the admin-only chrome (menu/title, hints, member form labels +
    placeholders, buttons, status/toast messages, cover-card labels, both modals — slot editor + member editor)
    to Korean. **Kept English on purpose:** content-slot names that mirror the kid-facing page (Opening Song /
    `Week 1 · Mon · Story`), data values (Level 1 / March / Mon–Fri), the user-facing login page, and the header
    Admin / Log out buttons (shared chrome next to the user-facing Login). Added **Noto Sans KR** to the font
    import and a new `--font-admin` (Latin → Google Sans, Korean → Noto Sans KR) applied to `#adminScreen` +
    both admin modals (which live outside `#adminScreen`).
  - **Member list slow-to-appear on refresh — FIXED.** Root cause: the bootstrap IIFE's `#admin` deep-link path
    rendered only `renderAdminBoard()` and **omitted `renderMembers()`** (unlike `openAdmin()`); with no
    hashchange router, the list stayed blank until `openAdmin()` re-ran (e.g. re-clicking Admin). Fix: the
    refresh `#admin` path now calls **`openAdmin()`** (full init incl. member list + default tab; bounces
    non-admins to login). DB/RLS/auth were never the problem.
  - `npm.cmd run qa` green (9/9). Client verified refresh now shows members immediately. Open: whether to also
    localize the header Admin / Log out buttons (deferred).

- **Session `2026-06-28e` — favicon (logo letter "C"):** added a brand favicon = the logo's first letter **C**
  (the "Cambridge" wordmark colour, teal `#16b8ad`) — a rounded-square teal tile with a chunky rounded white
  **C** drawn as a stroked arc (font-independent so it renders anywhere). Files at repo root: **`favicon.svg`**
  (primary, scalable), **`favicon-32.png`** (legacy), **`apple-touch-icon.png`** (180, full-square for iOS).
  `scripts/make-favicon.mjs` rasterizes the PNGs from the SVG via headless Chromium (no image libs). Linked in
  `index.html` <head> (icon svg + png + apple-touch-icon). `npm.cmd run qa` green (9/9).

## Platform build — approved 3-phase plan (`2026-06-10`)

Plan file: `C:\Users\dupy2\.claude\plans\steady-roaming-yao.md`. Adds the video
player to **all levels/months**, an **admin content manager**, and **login + 3
permission grades**. **Backend = Supabase** (Auth + Postgres + Storage) added to
the **current static SPA via the CDN UMD build** (`window.supabase`) — NO Next.js
rewrite, NO build step. Reads public (anon key), **writes admin-only via RLS**.
Delivery is **phased**; content access gate is **UI-level** (grade 3 → cute popup).

- **Phase 1 — DONE (`2026-06-10`):** player rolled out to all 40 pages; no Supabase yet.
  - `app.js` `contentData` map + `getVideoUrl/getCover(level, month, slot|book)` — the
    single data source; Phase 2 swaps the backing store to Supabase with no caller change.
    Seeded only with L1/March covers; everything else falls back to the sample video.
  - **Slot keys** (22/page): toolbar `data-slot="opening"/"ending"`; weekday buttons
    `data-slot="w{1..4}-{Mon..Fri}"` set in `renderLessons`.
  - `isLevel1March()` gate **removed**. New `openSlot(slot, label)` → grade-3 check →
    `getVideoUrl` → `openVideoPlayer(label, source)`. `openVideoPlayer` now takes a source
    (`resolveVimeoSource`: numeric id / id-string / Vimeo URL, else sample fallback).
  - **Covers are data-driven now:** the 3 hard-coded `#contentScreen.level-theme-1[data-month="March"]`
    CSS rules were replaced by a generic `.book-title-card.has-cover` rule; `refreshCovers()`
    (called in `updateContentMonthNumber`) sets/clears `has-cover` + inline `background-image`
    from `getCover` per current level/month. L1/March visuals unchanged.
  - **`#noAccessModal`** popup (markup + styles + `showNoAccessPopup`/`hideNoAccessPopup`,
    Esc/overlay/OK close) built and wired — **dormant until Phase 3** sets `state.grade`.
  - Verified: player opens on L2/May & L3/September (rollout); L1/March covers intact; other
    pages keep empty placeholder; month-nav clears covers; `npm.cmd run qa` green. ⚠ Vimeo
    playback still un-testable headless (modal visibility is set before the SDK call, so the
    open/close is verifiable; playback is not).
- **Phase 2 — DONE (`2026-06-10`):** Supabase wired into the static SPA; admin content manager live.
  - **Provisioned (user, project `jguuexcgyvyljbcqfpib`):** ran `supabase/migration.sql`
    (tables `content_pages`/`members`/`admins`/`site_settings`, `is_admin()`, RLS, pgcrypto RPCs),
    created public `covers` bucket, created first admin (Auth user + `admins` row). Keys live in
    **`supabase-config.js`** (`window.SUPABASE_URL` + anon key; ships — NOT in `.vercelignore`).
    `SUPABASE_SETUP.md` + `supabase/` are git-tracked but `.vercelignore`'d.
  - **Client:** `<script @supabase/supabase-js@2>` (CDN UMD, `window.supabase`) + `supabase-config.js`
    load before `app.js`. `const sb = window.supabase.createClient(...)` (null-guarded).
  - **Data source swap:** `contentCache` (keyed `level||month`) hydrated on load via
    `sb.from('content_pages').select('*')`; `getVideoUrl/getCover` read cache → fall back to the
    local seed. `refreshCovers()` re-runs after hydrate if a content page is showing.
  - **Admin auth (Phase 2 = admin only):** login form (`#loginForm`) → `sb.auth.signInWithPassword`
    ({email: idField}) → `sb.rpc('is_admin')`; admin session reveals header **Admin** + **Log out**
    buttons (`body.is-admin`). `#admin` route guarded (non-admins bounce to login). Member-grade
    login is **Phase 3**.
  - **Gray mirror editor** (`#adminScreen`, built by `renderAdminBoard`): level/month `<select>`s;
    songs row + 2 books × (cover card + 2 weeks × 5 day slots). Slot button → `#adminSlotModal`
    (prefilled current URL) → `savePage` upserts whole `content_pages` row (videos+covers together).
    Cover card = drag-drop/click → `sb.storage.from('covers').upload(path,{upsert})` →
    `getPublicUrl` + `?t=Date.now()` cache-bust → stored in `covers[book]`. `slugify(level)/slugify(month)/book-N`.
  - Verified headless: Supabase lib+config load, anon hydrate, admin UI hidden when logged out,
    `#admin`→login bounce, bad login reaches Supabase Auth and shows error; `npm.cmd run qa` green.
    ⚠ Real admin login + URL edit + cover upload + cross-device reflection need the admin's
    credentials → **manual test** (can't run headless).
- **Phase 3 — FRONTEND DONE (`2026-06-12`, uncommitted; backend RPCs already existed):** login + 3
  grades wired. **No SQL changes** — `migration.sql` already had every Phase-3 RPC (`verify_member_login`,
  `create_member`, `set_member_active`, `site_settings`). All work was `app.js`/`index.html`/`styles.css`.
  - **Login branch** (`#loginForm`): `id.includes("@")` → admin Supabase Auth (existing); else →
    `sb.rpc("verify_member_login",{p_id,p_password})` → grade or null. ⚠ A member id containing `@`
    would misroute to admin Auth — issue members `@`-free ids.
  - **Member session** = client-side: `state.grade` + `localStorage.cra_member` (helpers
    `saveMemberSession`/`clearMemberSession`/`restoreMemberSession`). UI-level gate only (spoofable;
    write-protection is the real security via RLS). Restored on load (admin session supersedes).
  - **Grade gate**: `openSlot`→`isBlockedByGrade()` (`state.grade===3`) already existed; now fed real
    grade → grade-3 click shows `#noAccessModal`; grade1/2/admin/anon play.
  - **Signed-in UI**: `updateAdminUI` toggles `body.is-admin` (admin) + **`body.signed-in`** (admin OR
    member); Log out shows when signed-in, Admin only for admin, Login hidden when signed-in
    (CSS `body.signed-in .login-button{display:none}`). Logout clears both admin + member session.
  - **Admin member panel** (`#adminScreen` → `.admin-members`): create form (id/pw/grade/name →
    `create_member`), list (`from("members").select(...)`), Activate/Deactivate (`set_member_active`).
    `renderMembers()` called from `openAdmin()`.
  - **Signup = hidden placeholder** (user-chosen): `#loginSignup` form hidden unless
    `site_settings.signup_visible` true (public read, `refreshSignupUI()` on load); admin checkbox
    `#signupToggle` upserts the flag. **Submit creates NO account** → shows "Please ask your teacher
    to create your account." (accounts stay admin-created).
  - Verified headless: gate (grade3 popup / grade1 play / anon full), login routing (member-rpc vs
    admin-auth), signed-in UI, logout clears session, signup hidden by default + placeholder note,
    member-create admin guard. `npm.cmd run qa` green. ⚠ **Manual test needs real admin creds**: create
    grade1/2/3 members → log in as each (grade3=popup, grade1/2=play); flip the signup toggle.

### ▶ RESUME HERE (`2026-07-15`)

- **Custom domain `cambridgereading.com` CONNECTED (`2026-07-15`).** Registered at **Gabia**;
  connected to Vercel project `new-app_0607` via the **DNS-record method** (Gabia nameservers kept,
  no NS change). Vercel has both `cambridgereading.com` (apex) + `www.cambridgereading.com` added;
  **`www` is the primary (Production), apex 308-redirects to `www`**. Gabia DNS records saved:
  `A @ → 216.198.79.1` and `CNAME www → e17453d2652fa5ed.vercel-dns-017.com.` (TTL 1800). DNS already
  resolves correctly on 8.8.8.8. **Awaiting:** Vercel to flip to "Valid Configuration" + auto-issue
  SSL (user to click **Refresh** in Settings→Domains; then verify `https://cambridgereading.com` +
  `https://www.cambridgereading.com` load with a lock). See `NOTES.md` → "Custom domain (Gabia + Vercel)".
- **Local repo synced to GitHub (`2026-07-15`).** Local `master` was 11 commits behind + had
  divergent **uncommitted** local work (6 files, +937 lines, NOT on GitHub). Fast-forwarded local to
  `origin/master` (`6c456ea`). The divergent local work was **backed up** before overwrite:
  `git stash@{0}` ("backup-local-uncommitted-before-github-sync") + a patch file in the session
  scratchpad (`local-backup-20260715.patch`). **OPEN DECISION:** confirm with user whether that
  stashed local work is obsolete (→ `git stash drop`) or must be recovered.

### ▶ Session log (`2026-06-12`)

- **All responsive/design work COMMITTED + DEPLOYED** (`a762cc7`, pushed to `master`, Vercel live).
  Rounds 1–17: mobile-portrait (header icons, Back/Next, video vertical-volume popover) + tablet
  portrait (600–767 month 5-col) + tablet landscape (month button parity/overlap/white-gap, content
  white-gap + 2-row banner). Live verified.
- **Phase 1 + Phase 2 — DONE & SIGNED OFF (`2026-06-12`).** User-tested OK: admin login, admin page,
  cover upload+drag-drop reflection, **video URL registration → plays on user page**, **cross-device
  reflection**. ✅ Phase 2 fully closed.
- **Phase 3 (login + 3 grades) — FRONTEND DONE (`2026-06-12`, UNCOMMITTED).** See the Phase 3 bullet
  above for detail. Headless-verified + `npm.cmd run qa` green. **Awaiting:** (1) user manual test with
  real admin creds (create grade1/2/3 members → log in as each; signup toggle), (2) commit/deploy on
  request. No SQL re-run needed (RPCs already provisioned).
- **Then: items 3–4** (backlog/optional polish), **then LAST: font-loading FOUT** improvement
  (memory `deferred-font-fout.md`).
- **Infra reminders:** Supabase project `jguuexcgyvyljbcqfpib`; keys in `supabase-config.js`
  (ships; anon key is public-safe). `SUPABASE_SETUP.md` + `supabase/migration.sql` are the
  provisioning record (`.vercelignore`'d). Live site auto-deploys on push to `master`.

## Confirmed product decisions

- Continue/complete the static SPA (no frontend framework yet).
- Calendar: **Mon-Fri 5-column** only; no weekend columns. (Overrides any Sun-Sat/7-col text.)
- English UI, no italics, child-friendly, touch targets ≥56px.
- Content URLs not ready → use sample Vimeo embeds when wiring modals.
- Default verification: `npm.cmd run qa`. On Windows PowerShell use `npm.cmd`.

## Implementation status

- Main page, Level 1-4 selection, March-December month selection, and hash routing all work
  (`#months/Level%201`, `#content/Level%201/March`, `#login`).
- **Login page** (`#login` / `#loginScreen`) — frontend-only, linked from the header login
  button (see "Design changes done so far"). No backend/auth yet.
- Three content-screen variants exist:
  - **V1 `#content/...`** — default; temporary `Book A/B × 2 weeks × Mon-Fri` board. Design
    changes target this (and shared `.content-v2-*` classes).
  - **V2 `#content-v2/...`** — alternate, preserved (kept on the green styling).
  - **V3 `#content-v3/...`** — Mon-Fri weekday-board candidate; uses `data-content-type`,
    `data-week`, `data-day` for future modal playback.
- **Video modal** is built inline (markup in `index.html` `#videoModal`, logic in `app.js`,
  styles in `styles.css`) and wired on **Level 1 / March only** with one sample Vimeo
  (`210024645`) — see "Design changes done so far". No separate `modal.js` was created.
- Not built yet: `contentData.js`, `calendarData.js`; per-button distinct video URLs; rolling
  the modal out to other levels/months once real content is ready.

- **Level display labels remapped (`2026-07-20`, local only — awaiting review before push):**
  on-screen labels are now Beginner / Level 1 / Level 2 / Level 3 (old Level 1→Beginner, 2→1,
  3→2, 4→3). Internal keys stay `"Level 1".."Level 4"` everywhere (DB `content_pages.level`,
  URL hash, `data-level`, `adminState`) — only display is remapped via `levelLabel()` /
  `LEVEL_LABELS` in `app.js`. Header nav Beginner book shows big "B" + small "Beginner" label.
  Admin level dropdown shows the new labels (option values unchanged). Smoke test updated.

- **Beginner content-button renames (`2026-07-20`, local only — awaiting review before push):**
  on the Beginner content page (all 10 months) the four visible toolbar buttons are renamed:
  Opening Song→**Good Morning Song**, Ending Song→**Good Bye Song**, Word Game→**Game**,
  Sentence Game→**Unit Song**. Other levels keep the defaults. Driven by `CONTENT_TYPE_LABELS`
  / `contentTypeLabel()` / `refreshContentTypeLabels()` in `app.js` + `data-label-key` on the
  toolbar buttons; `slotLabel(slot, level)` makes the admin song-slot labels level-aware
  (admin has no game slots). Video-player title follows the button text automatically.

- **Game modal (`2026-07-20`, local only — awaiting review before push):** the (Word) Game
  toolbar button on 페이지2 now opens the admin-entered URL in an iframe modal (`#gameModal`).
  Opens at **70vw×70vh**; top-right buttons: Restore (70%), Maximize (fills the visible
  viewport — CSS `100%` of the fixed container, NOT `100vw`, because of the reserved scrollbar
  gutter), Close (X, red). Esc/overlay also close; closing clears the iframe src to stop audio.
  URL lives in the existing `content_pages.videos` JSON under slot key **`game`** (per
  level/month, no DB migration needed); admin board's top row now has a third slot button
  (Opening · Ending · Game, `.admin-songs` grid 2→3 cols), labels level-aware via `slotLabel`.
  Same gating as videos: grade 3 → no-access popup, empty slot → coming-soon popup.

- **Unit Song video slot + game-modal chrome fix (`2026-07-20`, local only):** the 4th toolbar
  button (Unit Song / Sentence Game) now plays a video from new slot key **`unit`**
  (`data-slot="unit"` → the shared song/video player, YouTube/Vimeo both fine). Admin top row
  mirrors the user toolbar exactly: Opening · Ending · Game · Unit (`.admin-songs` 4 cols).
  Game modal: gray title strip removed — controls float top-right over the iframe
  (`.game-modal-bar` absolute + transparent, `.game-frame-wrap` fills the card). Controls show
  **2 at a time** (default size → Maximize+Close; maximized → Restore+Close, CSS toggled off
  `.game-maximized`); bare white icons (no circle fill), 70% opacity at rest, hover = 100% +
  thin circular white outline (drop-shadow keeps them readable on light games). **Tablet and
  below (`max-width: 1180px`)**: always opens full-screen, only the Close button shows (the 70%
  default was too small there).

- **Level 1-3 six-button toolbar (`2026-07-20`, local only — awaiting review before push):**
  the 페이지2 toolbar is now **rendered per level from `TOOLBAR_BUTTONS` in `app.js`** (static
  markup removed from `index.html`; single source of truth shared by the user toolbar AND the
  admin top row — the mirror rule is now structural). Beginner keeps its 4 buttons; internal
  "Level 2".."Level 4" (displayed Level 1-3) get 6: Good Morning Song / Good Bye Song /
  **I Sit Game / I Like School Game** (game modal, slots `game`/`game2`) / **I Sit Song /
  I Like School Song** (video player, slots `song1`/`song2`). 6-button layout =
  `.content-toolbar--wide` 3×2 grid (2×3 on mobile portrait); on ≥768px it overrides the
  board-aligned left padding (342px PC / 272px tablet) with normal 50px so labels stay
  single-line. Toolbar clicks are now **delegated** on `.content-toolbar` (buttons re-render).
  Dead CSS removed: nth-child hide rules + grid-column placements for the old static toolbar.
  **Rev 2 (same day):** the 6 buttons now sit on **ONE row spanning the full board width**
  (cover-image left edge → Friday right edge, `justify-content: space-between`, side padding =
  board padding 50px PC / 30px tablet). Buttons are slimmer than Beginner's (side pad
  `clamp(7px,0.8vw,12px)` PC) with a **viewport-scaled font** (`clamp(11.5px, 1.78vw − 9px,
15.5px)` PC; steeper than plain vw because icons/padding don't shrink). Tablet (768-1180)
  additionally hides the icon circles and uses `clamp(10.5px, 2.1vw − 6px, 14px)` so one row
  holds even at 768px. <768px falls back: landscape 3×2, portrait 2×3 grid. **Rev 3:** icons
  restored on tablet (20px, font `clamp(10.5px, 1.9vw − 7px, 14px)`) — hidden ONLY at
  768-899px (portrait iPad, genuinely no room); button side padding bumped (PC
  `clamp(8px,0.85vw,13px)`, tablet `clamp(8px,0.9vw,12px)`).
- **Admin game-slot editor labels + footer size (`2026-07-21`, local only):** the slot-URL
  editor's label/placeholder now switch by slot kind in `openSlotEditor()` (`#adminSlotLabel`):
  game slots read "게임 URL (사용자 화면에서 모달창으로 열림)", video slots keep the
  Vimeo/YouTube wording. (The game slots already opened the game modal on the user side —
  verified with stubbed Supabase rows — only the editor's wording was misleading.) Level-page
  footer copyright shrunk 13px → **11px** (`body[class*="level-theme-"] .site-footer p`);
  home (12px) and login footers unchanged. The shrink exposed a ~3px **white band** above the
  footer (the `100vh − 185px` min-height constant no longer matched the shorter footer) — fixed
  structurally: `body[class*="level-theme-"] main` now carries the level tint, so constant
  drift can never show white again (see `NOTES.md` "Full-height fill").

- **배경 편집기 구현 완료 (`2026-07-22`, 8/8 태스크 완료):** 관리자 전용 "배경 편집" FAB →
  페이지1(#monthScreen)/페이지2(#contentScreen) 위에 WYSIWYG 오버레이 편집기; 이미지 업로드·
  라이브러리 패널·드래그/리사이즈/회전/플립/순서 조작; [이 월에만 저장]/[레벨 기본값으로 저장]/
  [이 월 개별설정 삭제](페이지2) · [저장](페이지1) 버튼; 비저장 이탈 가드. 뷰어(`app.js`):
  `#pageBgLayer`, `body.page-bg-active` 틴트 핸드오프, `bgCache` / `hydrateBackgrounds()` /
  `window.craBg` 브릿지. 신규 파일: `background-editor.js`. Supabase: 신규 테이블
  `page_backgrounds` + Storage 버킷 `backgrounds`. Playwright 21/21 pass.
  - ✅ **Supabase 수동 단계 완료** (2026-07-22, 사용자): "backgrounds" 버킷 생성 +
    `migration.sql` 실행. 실사용 테스트에서 **전체 배경이 footer만 덮는 버그** 발견 →
    `#contentScreen.screen-active` / `#monthScreen[...].screen-active` 틴트 2곳이 투명화
    목록에서 누락된 것이 원인, 수정 완료(`5f70c34`). computed-style 회귀 테스트 추가.
    부수 수정: smoke 배경 테스트가 실서비스 Supabase 데이터에 의존하던 문제 →
    `resetBgCache()`로 결정적으로 변경 (NOTES.md 참조).
  - ✅ **수동 QA 전체 완료 (2026-07-22, 사용자 직접 확인):** 전체 배경(body+footer),
    요소 배치/드래그 저장, 페이지2 기본값→월 오버라이드→삭제 흐름, 미저장 이동 가드,
    반응형 스케일 — 모두 정상.
  - ✅ **배포 완료 (2026-07-22):** push `e67d0b8 → 7abe59e`(17커밋) → Vercel 자동 배포.
    new-app0607.vercel.app 및 cambridgereading.com(→ www 308 리다이렉트) 모두 새 빌드
    서빙 확인. 사용자가 **라이브 사이트에서 배경 편집 정상 동작 최종 확인**.

- **배경 편집기 UX/코드 개선 (`2026-07-22b`, 커밋 대기):** 관리자 실사용 시뮬레이션(Playwright
  스텁) + 웹빌더 관례 비교 + 시니어 코드 리뷰로 발견한 문제를 일괄 개선. **UX:**
  ① **고스트 미리보기(신규, 기본 ON)** — 편집 중 실제 페이지 내용이 반투명(45%)으로 배경 위에
  겹쳐 보여 배치를 실제 레이아웃 기준으로 할 수 있음(이전엔 불투명 틴트가 내용을 전부 가림);
  패널 체크박스로 토글. ② **'?' 도움말 툴팁** — 겹쳐보기/전체 배경/라이브러리/선택한 요소/저장
  5곳에 hover·focus 툴팁(구현 트릭은 NOTES 참조). ③ **핸들 구분** — 크기=모서리 사각형,
  회전=위쪽 ↻ 원형+연결선; 드래그 중 **수치 배지**(크기 %, 각도 °), Shift=15° 스냅.
  ④ **키보드** — Delete=요소 삭제, 화살표=미세 이동(Shift=크게), Esc=선택 해제→(재차) 닫기
  (미저장 가드 동일). ⑤ **저장 버튼 위계** — 주 액션 초록, 위험 액션(개별설정 삭제/요소 삭제)
  빨강 계열; 요소 도구에 **복제** 추가, 섹션 제목("선택한 요소") 추가. ⑥ 라이브러리에
  "썸네일 클릭 = 추가" 캡션 + 업로드 후 안내문구, 다중 업로드 진행 표시(n/m).
  ⑦ **월 오버라이드가 있는 상태에서 [레벨 기본값으로 저장] 시** "이 화면에는 보이지 않음"을
  상태줄에 명시(저장이 안 된 걸로 오해하던 함정). **버그/코드:** ⑧ `#bgElTools`가 `[hidden]`인데
  항상 노출되던 버그(`display:grid`가 UA hidden을 이김) → 패널 전역 `[hidden]` 가드로 수정+
  회귀 테스트. ⑨ 드래그 성능 — pointermove마다 레이어 전체 innerHTML 재구축하던 것을 해당
  요소 인라인 스타일만 갱신(마무리에 1회 재렌더)으로 변경. ⑩ `pointercancel` 처리(터치 중단 시
  리스너 누수 방지). ⑪ 라이브러리 삭제 2단계 확인이 **영구 arm**되던 문제 → 4초 후 자동 해제.
  ⑫ hydrate 실패 시 편집 영구 불가 → FAB 클릭이 `hydrateBackgrounds()` 재시도 후 자동 진입.
  ⑬ 저장/삭제 중복 클릭 가드(`bgEdit.saving`). ⑭ **ESLint가 background-editor.js를 검사 안
  하던 것** → lint 대상 + 공유 전역 선언 추가(`eslint.config.mjs`), bare `setTimeout` →
  `window.setTimeout`. 신규 테스트: 요소도구 hidden/고스트 스태킹/키보드 삭제/Esc 닫기
  (3뷰포트 ×). `npm.cmd run qa` 24/24 green. 스크린샷 검증 완료(툴팁·배지·고스트·핸들).

## Backlog (feature work, after design)

1. Decide whether V3 (Mon-Fri calendar) should replace the default `#content/...` route.
2. Add `contentData.js` (sample Vimeo embeds), `calendarData.js` (Mon-Fri events), `modal.js`.
3. Wire top content buttons + calendar buttons to sample Vimeo modal playback.
4. Extend Playwright tests for modal open/close behavior.
5. Responsive + accessibility QA pass.

## Open questions

- Delete `contentScreenV2`, or keep it as an archived/reference section?
- One sample Vimeo for all buttons, or different URLs per content type?
- Story: Vimeo only for now, or include an E-book placeholder?
- Levels 2-4 reuse Level 1 sample data until real content is ready?
- Should V3 become the default `#content/...` route after client review?

## Resume checklist

1. **Check "⏳ In-progress work" at the top of this file** — if a task was cut off mid-way,
   continue it from the recorded next step before taking new work.
2. Read this file (status + workflow), then `CLAUDE.md` (doc map) and `NOTES.md` (gotchas).
3. Skim `PRODUCT_SPEC.md` + `DESIGN.md` for product/visual constraints relevant to the task.
4. Design phase: make the change locally + verify; commit/deploy only on request.
5. Run `npm.cmd run qa` before committing; `git push` auto-deploys to production.
6. **Session wrap-up:** log completed work in "Design changes done so far" (dated, with the
   why/how); anything unfinished goes into "⏳ In-progress work" with the next concrete step.
