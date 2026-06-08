# 유치원 영어 학습 웹&앱 — Product Design Requirements (PDR) v1.0

## Current Override Notice

This file is the original v1.0 reference document. It is not the current source of truth for implementation.

Current working decisions:

- Short-term goal: complete the current static SPA prototype.
- Calendar: use a `Mon-Fri` 5-column learning calendar.
- Older `Sun-Sat` or 7-column calendar references in this file are overridden.
- Latest working guidance: `PROJECT_MEMORY.md`, `README.md`, `AGENT.md`, and `DESIGN.md`.

| 항목        | 내용                          |
| :---------- | :---------------------------- |
| 문서 버전   | v1.0                          |
| 작성일      | 2025년 7월                    |
| 대상 시스템 | 유치원 영어 교사용 학습 웹&앱 |
| 사용 대상   | 5세\~7세 유치원생 / 담당 교사 |

---

## 1\. 프로젝트 개요

### 1.1 목적

유치원 교사가 수업 중 TV/프로젝터를 통해 5\~7세 원아들에게 영어 학습 콘텐츠를 쉽게 제시할 수 있도록 제작하는 교육용 인터랙티브 학습 플랫폼.

### 1.2 핵심 요구사항 요약

- **대상 사용자:** 5\~7세 유치원 원아 (교사가 조작, 아이들이 시청)
- **학습 구조:** 4단계(레벨) × 10개월(3\~12월) × 5개 메뉴 콘텐츠
- **디자인:** 귀엽고 컬러풀, 단순한 UI/UX, 큰 버튼, 높은 가독성
- **콘텐츠 유형:** 동영상(MP4), E-book(FlipHTML5), 오디오 기반 챈트
- **반응형:** PC / 태블릿 / 모바일 모두 지원

### 1.3 참고 파일 분석 (0122\_최종코드.html)

| 항목           | 내용                                                           |
| :------------- | :------------------------------------------------------------- |
| 레이아웃       | CSS Grid 기반 책(E-book) 섬네일 4열 배치                       |
| 상단 영역      | 4개의 E-book 이미지 버튼 (220px 고정 너비, neumorphism 그림자) |
| 드롭다운       | 책 클릭 시 E-book / Song / Chant / Video 팝업 버튼 표시        |
| 하단 강의 섹션 | 사이드 북 이미지 \+ 4열 강의 버튼 그리드 (3개 섹션)            |
| 모달           | 동영상 팝업 (전체화면 지원, 배경 클릭 닫기)                    |
| 버튼 색상      | 노랑(1번) / 오렌지(2번) / 블루(3번) 그라디언트                 |
| 반응형         | 1024px / 768px / 480px 3단계 breakpoint                        |
| 자동 동기화    | 상단 책 이미지 → 하단 강의 사이드 이미지 자동 복사             |

---

## 2\. 정보 구조 (Information Architecture)

### 2.1 전체 사이트맵

메인 랜딩 (P-00)

├── 레벨 1 홈 (P-11)

│ ├── 3월 캘린더 (P-20) ── Opening Song / Story / Word Chant / Sentence Chant / Ending Song

│ ├── 4월 캘린더 (P-21)

│ ├── ...

│ └── 12월 캘린더 (P-29)

├── 레벨 2 홈 (P-12) ← 동일 구조 반복

├── 레벨 3 홈 (P-13) ← 동일 구조 반복

└── 레벨 4 홈 (P-14) ← 동일 구조 반복

총 페이지 수: 1(메인) \+ 4(레벨홈) \+ 40(캘린더) \= **45페이지**

### 2.2 화면 목록 (Page Inventory)

| 화면 ID    | 화면명           | 접근 경로                                 | 설명                                                                                          |
| :--------- | :--------------- | :---------------------------------------- | :-------------------------------------------------------------------------------------------- |
| P-00       | 메인 랜딩 페이지 | 앱 진입                                   | 블루 배경의 영상형 동적 히어로, Level 1\~4 선택, Cambridge Reading Adventures 소개, 주요 특징 |
| P-11\~P-14 | 레벨 1\~4 홈     | 메인 상단 메뉴 또는 히어로 하단 레벨 버튼 | 3월\~12월 Month 버튼 10개 표시                                                                |
| P-20\~P-29 | 3월\~12월 캘린더 | 레벨홈 → 월 버튼                          | 타이틀 이미지 \+ 메뉴버튼 \+ 학습 캘린더                                                      |
| P-30       | Opening Song     | 캘린더 → 메뉴버튼                         | 노래 영상/음원 모달                                                                           |
| P-31       | Story            | 캘린더 → 메뉴버튼                         | 스토리 영상 / E-book 뷰어                                                                     |
| P-32       | Word Chant       | 캘린더 → 메뉴버튼                         | 단어 챈트 영상                                                                                |
| P-33       | Sentence Chant   | 캘린더 → 메뉴버튼                         | 문장 챈트 영상                                                                                |
| P-34       | Ending Song      | 캘린더 → 메뉴버튼                         | 마무리 노래 영상                                                                              |

---

## 3\. 페이지별 UI 상세 명세

### 3.1 메인 랜딩 페이지 (P-00)

**역할:** 브랜드 비주얼 제시 \+ Level 1\~4 학습 진입 \+ Cambridge Reading Adventures 핵심 소개

**구성 요소:**

- 헤더: 앱 로고 이미지 \+ 브랜드명 텍스트
- 헤더 메뉴: 텍스트 형식의 Level 1 / Level 2 / Level 3 / Level 4 메뉴
- 히어로 섹션: 기존 블루 배경(`#2b70c9`), 약 420px 높이, `002_B.png` 대표 이미지 상하 꽉 찬 배치, 영상처럼 천천히 움직이는 자동 애니메이션
- 히어로 하단 Level 선택 버튼 4개 (Level 1 / Level 2 / Level 3 / Level 4)
- Cambridge Reading Adventures 소개내용: 프로그램 목적과 읽기 학습 여정 요약
- Cambridge Reading Adventures 주요 특징: 레벨형 읽기 경로, 스토리/논픽션 구성, 교실 수업 활용성 요약
- 푸터: 저작권 정보 (선택)

**레이아웃 (반응형):**

| 화면 크기       | 레벨 버튼 배치    |
| :-------------- | :---------------- |
| PC (\>768px)    | 4개 1열 가로 배치 |
| 태블릿 (≤768px) | 2×2 그리드        |
| 모바일 (≤480px) | 1열 세로 배치     |

---

### 3.2 레벨 홈 페이지 (P-11\~P-14)

**역할:** 해당 레벨의 3월\~12월 Month 버튼 10개 표시

**구성 요소:**

- 상단: 레벨 타이틀 배너 (예: "Level 1" \+ 배경색)
- 월 버튼 그리드: 3월\~12월 총 10개 버튼
  - 영문 월 이름 표기 (March / April / … / December)
  - 월별 아이콘 또는 계절 이모지 함께 표시
    - 3월🌸 4월🌷 5월☀️ 6월🌈 7월🌊 8월🏖️ 9월🍂 10월🎃 11월🍁 12월❄️
  - hover: `scale(1.1)`, 300ms
- 뒤로가기 버튼 (상단 좌측) → 메인 복귀

**레이아웃 (반응형):**

| 화면 크기       | 월 버튼 배치 |
| :-------------- | :----------- |
| PC              | 5×2 그리드   |
| 태블릿 (≤768px) | 3\~4열       |
| 모바일 (≤480px) | 2열          |

---

### 3.3 월간 학습 스케줄 캘린더 페이지 (P-20\~P-29)

**역할:** 해당 월 학습 일정 캘린더 \+ 5개 콘텐츠 메뉴 버튼

**레이아웃 구조 (상→하 순서):**

┌─────────────────────────────────────────┐

│ ① 레벨 & 월 타이틀 이미지 (img 태그) │

├─────────────────────────────────────────┤

│ ② 콘텐츠 메뉴 버튼 5개 (가로 배열) │

│ \[Opening Song\]\[Story\]\[Word Chant\] │

│ \[Sentence Chant\]\[Ending Song\] │

├─────────────────────────────────────────┤

│ ③ 월간 학습 스케줄 캘린더 │

│ (7열 그리드, 학습 이벤트 색상 코딩) │

└─────────────────────────────────────────┘

**캘린더 상세 명세:**

| 항목           | 상세 내용                                            |
| :------------- | :--------------------------------------------------- |
| 형태           | 월간(Monthly) 그리드, 요일 기준 7열 (Sun\~Sat)       |
| 표시 기간      | 3월\~12월 (10개월, 레벨별 10개 \= 총 40페이지)       |
| 셀 구성        | 날짜 숫자 \+ 학습 이벤트 텍스트/아이콘               |
| 이벤트 색상    | 메뉴 버튼 5종 색상과 동일하게 매핑                   |
| 헤더           | 레벨 & 월 타이틀 이미지(img 태그) — Body 최상단 배치 |
| 메뉴 버튼 위치 | 타이틀 이미지 아래, 캘린더 그리드 위                 |
| 반응형         | 최대 1300px / 768px / 480px breakpoint               |

---

## 4\. 콘텐츠 메뉴 버튼 명세 (5종)

캘린더 페이지 상단에 위치하는 5개 메뉴 버튼 상세 명세.

| 버튼명         | 배경색           | 아이콘    | 연결 콘텐츠            |
| :------------- | :--------------- | :-------- | :--------------------- |
| Opening Song   | `#EF476F` 핑크   | 🎵 음표   | Opening Song 영상/음원 |
| Story          | `#2E75B6` 블루   | 📖 책     | Story 영상 / E-book    |
| Word Chant     | `#06D6A0` 민트   | 🔤 알파벳 | Word Chant 영상        |
| Sentence Chant | `#7B2D8B` 퍼플   | 💬 말풍선 | Sentence Chant 영상    |
| Ending Song    | `#FF6B35` 오렌지 | 🎤 마이크 | Ending Song 영상       |

**버튼 공통 CSS 규격:**

/\* 버튼 공통 스타일 \*/

.menu-btn {

min-width: 140px;

height: 56px; /\* 5\~7세 터치 최적화 \*/

font-size: 16\~18px;

font-weight: bold;

text-transform: uppercase;

letter-spacing: 0.5px;

border-radius: 16\~24px; /\* 어린이 친화 둥근 모서리 \*/

background: linear-gradient(180deg, \[밝은색\] 0%, \[진한색\] 100%);

box-shadow: inset 하이라이트 \+ 외부 드롭섀도;

transition: transform 0.2s, box-shadow 0.2s;

}

.menu-btn:hover { transform: scale(1.05) translateY(-2px); }

.menu-btn:active { transform: scale(0.98) translateY(1px); }

**버튼 배치 (반응형):**

| 화면 크기       | 배치              |
| :-------------- | :---------------- |
| PC              | 5개 1열 가로 배치 |
| 태블릿 (≤768px) | 3 \+ 2 배치       |
| 모바일 (≤480px) | 2 \+ 3 배치       |

---

## 5\. UI/UX 디자인 가이드라인

### 5.1 디자인 원칙 5가지

| 원칙                   | 내용                                 | 적용 예시                                  |
| :--------------------- | :----------------------------------- | :----------------------------------------- |
| 단순성 (Simplicity)    | 불필요한 정보 제거, 핵심 기능만 노출 | 3클릭 이내 콘텐츠 도달, 뒤로가기 항상 표시 |
| 가시성 (Visibility)    | 큰 버튼, 명확한 레이블, 충분한 여백  | 버튼 최소 56px 높이, 16px 이상 폰트        |
| 즐거움 (Delight)       | 생동감 있는 색상, 귀여운 아이콘      | hover 시 통통 튀는 scale 애니메이션        |
| 일관성 (Consistency)   | 동일한 버튼 패턴, 색상 체계 반복     | 5개 메뉴 버튼 색상·모양 전 페이지 동일     |
| 접근성 (Accessibility) | 고대비, 큰 텍스트, 명확한 포커스     | 색상+아이콘 이중 표시, aria-label 적용     |

### 5.2 색상 시스템

| 색상명        | HEX       | 적용 위치                  |
| :------------ | :-------- | :------------------------- |
| 딥 네이비     | `#1B3A6B` | 타이틀, 섹션 헤더          |
| 브라이트 블루 | `#2E75B6` | Story 버튼, 서브 헤딩      |
| 오렌지        | `#FF6B35` | Ending Song 버튼, CTA      |
| 옐로우        | `#FFD166` | 배지, 하이라이트           |
| 민트 그린     | `#06D6A0` | Word Chant 버튼, 성공 상태 |
| 핑크 레드     | `#EF476F` | Opening Song 버튼          |
| 퍼플          | `#7B2D8B` | Sentence Chant 버튼        |
| 라이트 그레이 | `#F2F2F2` | 배경, 비활성 상태          |

- WCAG AA 기준 명암비 4.5:1 이상 준수
- 버튼 배경 \+ 흰색 텍스트 조합으로 가독성 확보
- 배경은 부드러운 파스텔 계열로 눈 피로도 최소화

### 5.3 타이포그래피

| 용도           | 폰트                  | 크기/굵기          | 비고                         |
| :------------- | :-------------------- | :----------------- | :--------------------------- |
| 앱 타이틀      | Nunito / Noto Sans KR | 36px / Black 900   | 영문+한글, 둥근 느낌         |
| 레벨·월 타이틀 | Nunito Bold           | 28\~32px / Bold    | 이미지 대체 가능             |
| 메뉴 버튼      | Nunito / Arial        | 16\~18px / Bold    | 대문자, letter-spacing 0.5px |
| 캘린더 이벤트  | Noto Sans KR          | 12\~14px / Regular | 모바일 10px 이상 유지        |
| 날짜 숫자      | Nunito                | 16px / SemiBold    | 주말 색상 구분               |
| 일반 본문      | Noto Sans KR          | 14\~16px / Regular | 줄 간격 1.6 이상             |

### 5.4 애니메이션 & 인터랙션

/\* 버튼 Hover \*/

transform: translateY(-5px) scale(1.05);

transition: 200ms ease;

/\* 버튼 Active \*/

transform: translateY(1px) scale(0.98);

transition: 100ms ease;

/\* 드롭다운 팝업 \*/

@keyframes popUp {

from { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.9); }

to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }

}

animation: popUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);

/\* 모달 오픈 \*/

fade-in \+ scale: 0.9 → 1, duration 250ms

/\* 월 버튼 Hover \*/

transform: scale(1.1);

transition: 300ms ease;

---

## 6\. 반응형 레이아웃 명세

| 구분        | Breakpoint   | 레벨 버튼  | Month 버튼 | 메뉴 버튼(5종) |
| :---------- | :----------- | :--------- | :--------- | :------------- |
| 대형 PC     | \> 1300px    | 4개 1열    | 5×2 그리드 | 5개 1열        |
| PC          | 1024\~1300px | 4개 1열    | 5×2 그리드 | 5개 1열        |
| 태블릿      | 768\~1024px  | 2×2 그리드 | 3\~4열     | 3+2 배치       |
| 소형 태블릿 | 480\~768px   | 2×2 그리드 | 2\~3열     | 2+3 배치       |
| 모바일      | \< 480px     | 1열 세로   | 2열        | 2+3 배치       |

**공통 규칙:**

- `max-width: 1300px`, `margin: 0 auto` — 컨테이너 중앙 정렬
- `box-sizing: border-box` 전역 적용
- 이미지: `width: 100%`, `height: auto`, `object-fit: cover/contain`
- 모바일에서 side book 이미지 `display: none` 처리

---

## 7\. 컴포넌트 명세

### 7.1 동영상 모달 컴포넌트 (CustomVideoModal)

| 속성           | 상세                                                |
| :------------- | :-------------------------------------------------- |
| 트리거         | `openCustomModal(url)` / `openFullScreenModal(url)` |
| 닫기           | ✕ 버튼 또는 배경 오버레이 클릭                      |
| 배경           | `rgba(0,0,0,0.85)` 오버레이, `body` scroll lock     |
| 영상 표시      | iframe 임베드, 기본 90% 너비 / 최대 900px           |
| 전체화면       | `.full-screen` 클래스 토글 → 100% 영역 확장         |
| 영상 정지      | 닫기 시 `iframe.src = ''` 초기화                    |
| 추가 구현 권장 | ESC 키로 닫기                                       |

### 7.2 드롭다운 메뉴 컴포넌트 (DropdownMenu)

| 속성       | 상세                                                                        |
| :--------- | :-------------------------------------------------------------------------- |
| 트리거     | 책 이미지 클릭 → `toggleMenu()`                                             |
| 위치       | 클릭 버튼 하단 중앙 (`position: absolute`, `left: 50%`, `translateX(-50%)`) |
| 배경       | `rgba(255,255,255,0.8)` \+ `backdrop-filter: blur(5px)`                     |
| 애니메이션 | `@keyframes popUp` (0.3s, spring cubic-bezier)                              |
| 닫기       | 다른 영역 클릭 시 자동 닫힘 (document click 이벤트)                         |

### 7.3 이미지 동기화 (syncSideImages)

// 상단 책 이미지 src를 하단 강의 섹션 사이드 이미지로 자동 복사

function syncSideImages() {

\['1','2','3'\].forEach(n \=\> {

    const main \= document.getElementById(\`main-book-${n}\`);

    const side \= document.getElementById(\`side-book-${n}\`);

    if (main && side) side.src \= main.src;

});

}

// 실행: DOM 로드 즉시 \+ window.load 이벤트

---

## 8\. 기술 스택

| 구분       | 기술/도구                           | 비고                   |
| :--------- | :---------------------------------- | :--------------------- |
| 프론트엔드 | HTML5 / CSS3 / Vanilla JS           | 별도 프레임워크 미사용 |
| 레이아웃   | CSS Grid / Flexbox                  | 반응형 다단 그리드     |
| 폰트       | Google Fonts (Noto Sans KR, Nunito) | 한글+영문 혼용         |
| 아이콘     | SVG Inline Icons                    | 색상 변경 용이         |
| 미디어     | iframe / HTML5 Video                | MP4, FlipHTML5 E-book  |
| 모달       | Custom CSS Modal                    | 동영상 전체화면 지원   |
| 애니메이션 | CSS Transition / @keyframes         | transform/opacity 전용 |
| 배포       | cafe24 / 외부 CMS 위젯              | 현행 인프라 유지       |

**외부 의존성:**

- Google Fonts CDN: `Noto Sans KR`, `Nunito`
- FlipHTML5: E-book iframe 임베드
- cafe24 CDN: MP4 영상 파일 호스팅

**성능 고려사항:**

- 이미지: WebP 우선, JPEG fallback
- 하단 강의 섹션 이미지: `loading="lazy"` 적용
- CSS 애니메이션: `transform`, `opacity`만 사용 (GPU 가속)
- JS: IIFE 패턴으로 전역 네임스페이스 오염 방지

---

## 9\. 기능 요구사항 목록

| No   | 구분       | 요구사항                                                  | 우선순위 | 비고                                      |
| :--- | :--------- | :-------------------------------------------------------- | :------- | :---------------------------------------- |
| F-01 | 내비게이션 | 메인 상단 메뉴와 히어로 하단에서 레벨(1\~4단계) 선택 제공 | 필수     | 상단은 텍스트 메뉴, 히어로 하단은 큰 버튼 |
| F-02 | 내비게이션 | 레벨 홈에서 3월\~12월 Month 버튼 10개 표시                | 필수     | —                                         |
| F-03 | 내비게이션 | 월 버튼 클릭 시 해당 월 캘린더 페이지로 이동              | 필수     | —                                         |
| F-04 | 내비게이션 | 모든 페이지에 뒤로가기 버튼 제공                          | 필수     | —                                         |
| F-05 | 콘텐츠     | 캘린더 상단에 레벨 & 월 타이틀 이미지 표시                | 필수     | img 태그                                  |
| F-06 | 콘텐츠     | Opening Song 버튼 → 해당 영상/음원 재생                   | 필수     | iframe 모달                               |
| F-07 | 콘텐츠     | Story 버튼 → 스토리 영상 또는 E-book 뷰어                 | 필수     | —                                         |
| F-08 | 콘텐츠     | Word Chant 버튼 → 단어 챈트 영상 재생                     | 필수     | —                                         |
| F-09 | 콘텐츠     | Sentence Chant 버튼 → 문장 챈트 영상 재생                 | 필수     | —                                         |
| F-10 | 콘텐츠     | Ending Song 버튼 → 마무리 노래 영상 재생                  | 필수     | —                                         |
| F-11 | 모달       | 동영상 모달: 배경 클릭 또는 ✕ 버튼으로 닫기               | 필수     | iframe src 초기화                         |
| F-12 | 모달       | E-book 모달: 전체화면 모드 지원                           | 필수     | .full-screen 클래스                       |
| F-13 | 캘린더     | 월간 그리드(7열) 형태로 학습 일정 표시                    | 필수     | —                                         |
| F-14 | 캘린더     | 캘린더 셀에 학습 이벤트 색상 코딩 표시                    | 권장     | 5종 색상 매핑                             |
| F-15 | 반응형     | PC/태블릿/모바일 반응형 레이아웃                          | 필수     | 5단계 breakpoint                          |
| F-16 | 접근성     | 버튼에 alt / aria-label 속성 적용                         | 권장     | WCAG AA 기준                              |
| F-17 | UX         | 버튼 hover/active 트랜지션 애니메이션                     | 필수     | CSS transform                             |
| F-18 | UX         | 드롭다운 메뉴 popUp 애니메이션                            | 필수     | @keyframes                                |
| F-19 | UX         | 이미지 동기화 (상단→하단 강의 섹션)                       | 권장     | 기존 구조 참고                            |
| F-20 | 성능       | 미디어 파일 lazy loading 적용                             | 권장     | loading="lazy"                            |

---

## 10\. 콘텐츠 데이터 구조

### 10.1 콘텐츠 URL 매핑

// contentData\[레벨\]\[월\]\[메뉴\] \= { url, type }

const contentData \= {

level1: {

    march: {

      openingSong:    { url: 'https://.../opening\_L1\_Mar.mp4',   type: 'video' },

      story:          { url: 'https://online.fliphtml5.com/.../', type: 'ebook' },

      wordChant:      { url: 'https://.../wordchant\_L1\_Mar.mp4', type: 'video' },

      sentenceChant:  { url: 'https://.../senchant\_L1\_Mar.mp4',  type: 'video' },

      endingSong:     { url: 'https://.../ending\_L1\_Mar.mp4',    type: 'video' },

    },

    april: { /\* ... \*/ },

    // 3월\~12월

},

level2: { /\* ... \*/ },

level3: { /\* ... \*/ },

level4: { /\* ... \*/ },

// 총 4레벨 × 10개월 × 5메뉴 \= 최대 200개 URL

};

// type에 따라 모달 종류 결정

// 'video' → openCustomModal(url)

// 'ebook' → openFullScreenModal(url)

### 10.2 캘린더 이벤트 데이터

// calendarData\[레벨\]\[월\]\[날짜\] \= \[{ label, type, color }\]

const calendarData \= {

level1: {

    march: {

      3:  \[{ label: 'Opening Song', type: 'openingSong', color: '\#EF476F' }\],

      5:  \[{ label: 'Story',        type: 'story',       color: '\#2E75B6' }\],

      10: \[{ label: 'Word Chant',   type: 'wordChant',   color: '\#06D6A0' }\],

      // ...

    }

}

};

// 이벤트 색상 매핑 (메뉴 버튼 색상과 동일)

const COLOR_MAP \= {

openingSong: '\#EF476F', // 핑크

story: '\#2E75B6', // 블루

wordChant: '\#06D6A0', // 민트

sentenceChant: '\#7B2D8B', // 퍼플

endingSong: '\#FF6B35', // 오렌지

};

---

## 11\. 작업 우선순위 및 마일스톤

| 단계 | 마일스톤          | 주요 작업                                                             | 산출물                        |
| :--- | :---------------- | :-------------------------------------------------------------------- | :---------------------------- |
| M1   | 기반 구조 구축    | 글로벌 CSS 변수, 폰트, 공통 컴포넌트(모달, 버튼)                      | `common.css`, `modal.js`      |
| M2   | 메인 & 레벨 홈    | 메인 랜딩 주요 콘텐츠 및 레벨 선택 \+ 4개 레벨 홈 (Month 버튼 그리드) | `index.html`, `level1~4.html` |
| M3   | 캘린더 (레벨1)    | 레벨1 3\~12월 캘린더 10페이지 \+ 메뉴 버튼 5종 연동                   | 캘린더 10페이지               |
| M4   | 캘린더 (레벨2\~4) | 동일 구조 반복, 콘텐츠 URL만 교체                                     | 캘린더 30페이지               |
| M5   | 콘텐츠 연동       | 영상/E-book URL 전체 매핑, 모달 정상 작동 확인                        | `contentData.js`              |
| M6   | 반응형 & QA       | 전 breakpoint 검수, 크로스브라우저 테스트                             | QA 체크리스트                 |
| M7   | 배포 & 최적화     | 이미지 최적화, lazy loading, 최종 배포                                | 최종 빌드                     |

---

## 12\. 부록 — 참고 파일 CSS 클래스 레퍼런스

| 클래스명                    | 역할                                                      |
| :-------------------------- | :-------------------------------------------------------- |
| `.custom-widget-container`  | 전체 컨테이너, `max-width: 1300px`, 중앙 정렬             |
| `.custom-unified-grid`      | 상단 책 이미지 4열 CSS Grid (PC: 220px 고정, 반응형: 1fr) |
| `.grid-slot.ebook-style`    | 책 이미지 슬롯 \+ neumorphism 그림자 스타일               |
| `.dropdown-menu`            | 책 클릭 시 팝업 메뉴 (blur 배경, popUp 애니메이션)        |
| `.drop-btn`                 | 드롭다운 내 버튼 (그라디언트, 3D 섀도)                    |
| `.btn-color-1/2/3`          | 책 번호별 버튼 색상 (노랑/오렌지/블루 그라디언트)         |
| `.lecture-section`          | 하단 강의 섹션 flex 컨테이너                              |
| `.lecture-side-img-wrapper` | 강의 섹션 좌측 책 이미지 (모바일에서 `display: none`)     |
| `.lecture-buttons-grid`     | 강의 버튼 4열 그리드 (`flex: 1`, `max-width: 800px`)      |
| `.custom-text-divider`      | 섹션 구분선 (점선 \+ 이미지 중앙 배치)                    |
| `#customVideoModal`         | 동영상 팝업 모달 (`position: fixed`, `z-index` 최상위)    |
| `.custom-modal-wrapper`     | 모달 콘텐츠 래퍼 (90% 너비, 최대 900px)                   |
| `.full-screen`              | 모달 전체화면 모드 클래스 (E-book 뷰어용)                 |
| `.month-btn`                | 월 선택 버튼 (`hover: scale(1.1)`)                        |

---

_PDR v1.0 | 2025년 7월 | 유치원 영어 학습 웹&앱_
