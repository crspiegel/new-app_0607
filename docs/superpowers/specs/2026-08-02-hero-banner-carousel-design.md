# 메인 히어로 배너 캐러셀 — 설계

작성 `2026-08-02`. 대상: 메인 페이지(`#homeScreen`) 히어로 섹션 + 관리자 화면.

## 목표

관리자가 히어로 섹션에 배너 이미지를 등록하고, **슬라이드 / 페이드** 중 한 방식으로
자동 전환되게 한다. 노출 시간은 **3·5·7·10초** 중 선택. 배너는 항상 **페이지 가로 100%**,
그리고 현재처럼 **하단 흰 곡선 아래**에 깔려 기존 비주얼을 유지한다.

## 레이어 구조 (사용자 확정안)

흰 곡선은 **슬라이드에 포함하지 않고 그 위에 고정된 단일 레이어**로 둔다. 슬라이드
레이어는 독립적으로 동작한다.

```
.hero-section (relative, overflow:hidden)   ← 뷰포트 가로 전체
  ├─ .hero-slides        z-index:1   ← 슬라이드 레이어 (독립 작동)
  │    ├─ .hero-slide (기본)          .section-inner.hero-grid = 텍스트+앱버튼+캐릭터
  │    └─ .hero-slide (배너) × N      img.hero-banner-img
  └─ svg.hero-wave       z-index:2   ← 고정, 슬라이드 미포함
```

왜 이 구조가 성립하는가: 슬라이드가 `transform`/`opacity`로 애니메이션하면 **자기 쌓임
맥락**을 만들어 내부 z-index가 밖으로 나가지 못한다. 곡선을 슬라이드 **밖** 상위 레이어에
두면 그 영향을 받지 않고 항상 위에 남는다. 곡선 복제·이음매 문제가 원천적으로 사라진다.

- 기본 슬라이드는 **normal flow**에 남아 히어로 높이를 정의한다 → 데스크톱 `--hero-height`
  434px / 모바일 `height:auto`가 그대로 유지되고, 전환 시 레이아웃이 흔들리지 않는다.
- 배너 슬라이드는 `position:absolute; inset:0`으로 같은 박스를 채운다.
- 배너 **0장이면 캐러셀을 아예 만들지 않는다** — DOM·타이머·클래스 미생성이라 현재와 동일.

### 전환

| 모드    | 구현 (600ms)                                                      |
| ------- | ----------------------------------------------------------------- |
| `fade`  | 나가는 슬라이드 `opacity 1→0`, 들어오는 슬라이드 `0→1`            |
| `slide` | 나가는 슬라이드 `translateX(0→-100%)`, 들어오는 슬라이드 `100%→0` |

트랙(flex) 없이 레이어별 변환만으로 처리한다.

## 태블릿 앱버튼 대응 (필수 — 이 구조의 유일한 부작용)

`.hero-copy`가 슬라이드 레이어 안으로 들어가면서 흰 곡선 **아래**가 된다. 8개 뷰포트에서
곡선 SVG path를 실제 샘플링해 측정한 결과:

| 뷰포트                 | 앱버튼이 흰 곡선에 가려지는 비율 |
| ---------------------- | -------------------------------- |
| 1920 · 1366            | 0% (11~12px 여유)                |
| 1180                   | 17% (9.6px)                      |
| 1024                   | **62% (36.2px)**                 |
| 768                    | **97% (125.7px)**                |
| 658 가로폰 · 390 · 320 | 0% (120~186px 여유)              |

즉 **768~1180 구간만** 문제다. 대응:

- **1024~1180**: `styles.css`의 `@media (min-width:768px) and (max-width:1180px)` 블록에 있는
  `.hero-copy { padding-bottom: 92px }`를 키워 카피를 위로 올린다. `.hero-copy`는
  `justify-content:center`인 flex 열이므로 **padding-bottom을 Δ 늘리면 콘텐츠는 Δ/2 만큼**
  올라간다 — 정확한 값은 구현 중 실측해서 정한다.
- **768 부근**: 필요한 이동량(≈126px)이 434px 히어로 안에서 확보되지 않는다. 이 폭에서는
  히어로를 `height:auto`로 풀어 콘텐츠가 자라게 한다. ⚠ 이 폭은 **현재도 이미**
  Google Play 버튼이 `overflow:hidden`에 잘려 "Get it on"만 보이는 상태이므로, 이 변경은
  기존 결함도 함께 해소한다.

**합격 기준:** 768 / 800 / 1024 / 1180에서 앱버튼 하단이 흰 곡선의 **칠해진** 상단보다
최소 8px 위. (측정은 path 샘플링 — SVG 바운딩 박스가 아니라 실제 흰 영역 기준.)
데스크톱·모바일은 변화 0.

## 데이터 모델 — `site_settings` (스키마 변경 없음)

`key = 'hero_banner'`, `value` jsonb. 공개 읽기 + 관리자 쓰기 정책이 이미 존재한다.

```json
{
  "mode": "slide",
  "interval": 5,
  "banners": [
    { "src": "https://…/banners/1785…-spring.jpg", "focus": "top", "alt": "" }
  ]
}
```

- `mode`: `"slide"` | `"fade"` (그 외 → `"slide"`)
- `interval`: `3 | 5 | 7 | 10` 초 (그 외 → `5`)
- `focus`: `"top" | "center" | "bottom"` → `object-position` (그 외 → `"center"`)
- 배너 이미지: `width:100%; height:100%; object-fit:cover`
- 순서 = 배열 순서. **1번 슬라이드는 항상 기본 히어로**(설정 항목 없음).

업로드는 **기존 `backgrounds` 버킷의 `banners/` 프리픽스**를 쓴다 → 새 버킷·정책·대시보드
작업이 전혀 없다. 배경 편집기 라이브러리는 `library/` 프리픽스라 서로 섞이지 않는다.
제한은 배경 편집기와 동일: PNG/JPG/WebP, 5MB.

## 관리자 화면

`app.js`의 `adminViews` / `adminViewTitles` 맵에 세 번째 항목 추가
(`data-admin-view="banner"`, 타이틀 "배너 관리").

```
전환 방식   ◉ 슬라이드   ○ 페이드
유지 시간   ○ 3초  ◉ 5초  ○ 7초  ○ 10초
[ 배너 이미지 업로드 (PNG/JPG/WebP, 5MB) ]

1. [썸네일]  초점 ◉위 ○가운데 ○아래   [▲][▼][삭제]
2. [썸네일]  초점 ○위 ◉가운데 ○아래   [▲][▼][삭제]

[ 저장 ]     * 1번 슬라이드는 항상 기본 히어로입니다
```

업로드는 즉시 스토리지에 올라가고, **설정 반영은 [저장] 버튼**을 눌러야 한다(배경 편집기와
같은 명시적 저장 방식). 저장 실패 시 상태 메시지로 알린다.

## 코드 배치

`app.js`가 이미 93KB이므로 여기에 얹지 않고 **새 파일 `hero-banner.js`** 를 만들어
`background-editor.js`와 같은 방식(app.js 뒤 클래식 스크립트)으로 로드한다. 뷰어 캐러셀 +
관리자 패널이 한 파일에 들어간다. `app.js`는 `adminViews`에 항목 하나 추가하는 정도만 바뀐다.

⚠ 동반 수정 필수 (기존 gotcha):

- `eslint.config.mjs` — `hero-banner.js` 블록 + app.js 공유 전역 `globals` 선언
- `package.json` — `lint` / `format:check` 글롭에 `hero-banner.js` 추가
- `setTimeout`류는 `window.` 접두 필수

## 엣지 케이스

- `prefers-reduced-motion: reduce` → 순환은 유지하되 전환 애니메이션 0ms.
- `visibilitychange` → 탭 비활성 시 타이머 정지, 복귀 시 재개.
- 홈 화면을 벗어나면 타이머 정지 (`showScreen` 훅).
- 기본 슬라이드가 비활성일 때 캐릭터 리그 `animation-play-state: paused`.
- 배너 이미지 로드 실패(`error`) → 해당 슬라이드를 순환에서 제외.
- Supabase 미연결/설정 없음 → 캐러셀 미생성, 현재 히어로 그대로.

## 검증

`window.craHero` 브릿지로 설정을 시드해 Playwright로:

1. **회귀 가드** — 배너 0장: `.hero-slide` 배너 0개, 타이머 없음, `.hero-copy`/`.hero-rig`/
   `.hero-wave`의 기존 rect·computed z-index 불변.
2. 배너 2장 → 슬라이드 3장 순환, `interval` 경과 후 활성 슬라이드 전환.
3. 배너 폭 == `.hero-section` 폭 (320 / 768 / 1024 / 1366 / 1920).
4. 곡선이 배너 **위**(`.hero-wave` z2 > `.hero-slides` z1), 배너가 히어로 박스를 벗어나지 않음.
5. `mode` 별 transform / opacity 적용, `interval`·`mode`·`focus` 잘못된 값 → 폴백.
6. **앱버튼 합격 기준**(위 표) — 768 / 800 / 1024 / 1180에서 path 샘플링으로 8px 이상 여유.
7. `npm.cmd run qa` 전체 green.

## 변경 파일

`index.html` · `styles.css` · `app.js`(소폭) · **`hero-banner.js`(신규)** ·
`eslint.config.mjs` · `package.json` · `tests/smoke.spec.js`.
**Supabase 스키마·버킷 변경 없음.**
