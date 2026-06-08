# MAIN_PAGE_CONTENT.md

## 목적

이 문서는 `CRA _시안2_수정_220706.pdf`의 프로그램 소개 내용을 기반으로, 현재 웹&앱의 Main 랜딩페이지에 노출할 핵심 콘텐츠만 정리한 구축 기획 자료입니다.

실제 구축 시 메인페이지는 Cambridge Reading Adventures의 첫인상과 프로그램 이해에 필요한 주요 콘텐츠를 먼저 제공하고, 히어로 섹션 바로 아래에서 Level 1~4 학습 진입을 제공합니다.

## 원본 자료

- PDF: `e:\claude-code\design-app\CRA _시안2_수정_220706.pdf`
- 프로그램명: Cambridge Reading Adventures
- 출판/브랜드: Cambridge University Press
- 슬로건: Brighter Thinking Better Learning
- 한글명: 캠브리지 리딩 어드벤처

## 준비된 이미지 에셋

PDF에서 메인페이지 구현용 대표 이미지를 추출했습니다.

| 파일                                 | 용도                                 |
| ------------------------------------ | ------------------------------------ |
| `assets/cra-hero.jpg`                | 메인 히어로 이미지                   |
| `assets/cra-program-logo.jpg`        | 프로그램 로고/브랜드 보조 이미지     |
| `assets/cra-books.jpg`               | 프로그램 소개 보조 이미지            |
| `assets/cra-band-samples.jpg`        | 주요 특징 또는 밴드 특징 보조 이미지 |
| `assets/cra-band-index.jpg`          | 내부 검수/데이터 확인용              |
| `assets/cra-index-upper.jpg`         | 내부 검수/데이터 확인용              |
| `assets/cra-index-lower.jpg`         | 내부 검수/데이터 확인용              |
| `assets/cra-index-voyagers-full.jpg` | 내부 검수/데이터 확인용              |

메인페이지에는 `cra-hero.jpg`, `cra-books.jpg`, `cra-band-samples.jpg`를 우선 활용합니다. 도서 전체 목록 이미지는 메인에 직접 노출하지 않고, 데이터 검수 또는 별도 상세 화면 기획에만 사용합니다.

## Main Page 콘텐츠 구성안

메인페이지에는 주요 콘텐츠와 학습 진입 버튼을 노출합니다.

1. Hero Section
2. Level 1~Level 4 선택 버튼
3. Cambridge Reading Adventures 소개 내용
4. Cambridge Reading Adventures 주요 특징

아래 항목은 메인페이지에서 제외합니다.

- Reading Band Progression 상세표
- Complete Book List 전체 도서 목록
- 월별 학습 캘린더 또는 학습 콘텐츠 진입 UI

상단 메뉴에는 텍스트 형식으로 Level 1~Level 4 메뉴를 제공하고, 메인 히어로 섹션 아래에는 큰 버튼 형식의 Level 1~Level 4 선택 영역을 제공합니다.

## Section 1. Hero Section

### UI 목적

사용자가 앱 진입 즉시 Cambridge Reading Adventures의 브랜드와 프로그램 정체성을 이해하도록 합니다.

### 콘텐츠

**Eyebrow**

```text
Brighter Thinking Better Learning
```

**Title**

```text
Cambridge Reading Adventures
```

**Subtitle 후보**

```text
A colorful leveled reading program that helps young English learners build confidence through stories, nonfiction, and guided classroom activities.
```

**보조 표기**

```text
Cambridge University Press
```

### 이미지

- `assets/cra-hero.jpg`

### 배경 색상 및 인터랙션

- 기존 블루 계열 배경 사용
- 적용값: `#2b70c9`
- 첨부 이미지 `002_B.png`를 히어로 섹션 상하에 꽉 차게 배치
- 히어로 섹션 높이는 데스크톱 기준 약 420px 수준으로 유지
- 영상처럼 보이도록 이미지가 천천히 확대, 이동, 부유하는 자동 애니메이션 적용

## Section 2. Level Selection

### UI 목적

메인 히어로를 확인한 뒤 바로 Level 1~4 학습 화면으로 진입할 수 있도록 합니다.

### 추천 타이틀

```text
Choose Your Level
```

### 추천 설명

```text
Select a level to begin monthly lessons with songs, stories, chants, and reading activities.
```

### 버튼 구성

| Button  | Suggested Subtitle | Linked Content Direction    |
| ------- | ------------------ | --------------------------- |
| Level 1 | Starter Readers    | Pink A/B, Red, Yellow       |
| Level 2 | Growing Readers    | Blue, Green, Orange         |
| Level 3 | Confident Readers  | Turquoise, Purple, Gold     |
| Level 4 | Fluent Explorers   | White and Adventure Strands |

## Section 3. Cambridge Reading Adventures 소개 내용

### UI 목적

프로그램의 목적, 구성 방향, 학습 여정을 간결하게 전달합니다.

### 추천 타이틀

```text
A Reading Journey for Every Young Learner
```

### 추천 본문

```text
Cambridge Reading Adventures is a leveled reading program designed to guide children from first words and simple sentence patterns to richer stories, nonfiction topics, and independent reading.
```

### 핵심 메시지

- Color-banded readers support step-by-step reading growth.
- Fiction and nonfiction titles introduce familiar classroom topics and wider world knowledge.
- Rich images and clear language help young learners read with confidence.
- The program can support teacher-led lessons, classroom display, and guided reading practice.

### 이미지

- `assets/cra-books.jpg`

## Section 4. Cambridge Reading Adventures 주요 특징

### UI 목적

메인페이지에서 프로그램의 장점을 빠르게 스캔할 수 있도록 카드형 또는 3열 요약형으로 구성합니다.

### 추천 타이틀

```text
Why Cambridge Reading Adventures Works
```

### 특징 카드 콘텐츠

| Feature                | Main Page Copy                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Leveled Reading Path   | Color bands make reading progression visible and easy to guide.                                    |
| Stories and Nonfiction | Learners meet illustrated stories, real-world topics, animals, places, and people.                 |
| Classroom Ready        | Short, structured reading experiences support vocabulary, listening, speaking, and guided reading. |

### 이미지

- `assets/cra-band-samples.jpg`

## 구축 시 권장 메인페이지 섹션 순서

```text
Header
Hero Section
Level Selection
Cambridge Reading Adventures 소개 내용
Cambridge Reading Adventures 주요 특징
Footer
```

## 구현 전 확인 필요 항목

1. 상단 Level 1~4 텍스트 메뉴와 히어로 하단 Level 1~4 버튼의 동일 플로우 연결 확인
2. 메인페이지 언어 정책 확정
   - 기존 요구사항 기준: 영어 UI
   - PDF 소개자료 기준: 한국어 설명 포함 가능
   - 추천: 사용자 노출 UI는 영어 중심, 관리자/기획 문서에는 한국어 설명 병기
3. 도서 전체 목록과 밴드 상세 정보는 메인 제외 후 별도 상세 화면 또는 내부 데이터로 관리
