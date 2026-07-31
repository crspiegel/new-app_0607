# 페이지2 툴바 버튼 이름 편집 (관리자모드) — 설계 (2026-07-31)

## 목적

페이지2(`#contentScreen`, 요일 그리드 화면)의 요일 그리드 바로 위 툴바 버튼들
(`.content-toolbar`)의 표시 이름이 `TOOLBAR_BUTTONS` 상수(app.js)에 하드코딩되어
있어 관리자가 바꿀 수 없었다. 관리자가 관리자 보드의 기존 슬롯 편집 모달에서
버튼 이름을 직접 입력·수정할 수 있게 한다.

## 사용자와 확정한 결정

1. **적용 범위: 레벨+월별 개별** — 커스텀 이름은 (레벨, 월) 단위로 저장.
2. **편집 UI: 기존 슬롯 편집 모달**(`#adminSlotModal`)에 "버튼 이름" 입력란 추가.
   툴바 슬롯일 때만 표시 — 요일 슬롯(w1-Mon~w4-Fri)은 기존 URL-only 모달 유지.
3. **저장: `content_pages.labels` jsonb 컬럼** —
   `alter table ... add column if not exists labels jsonb not null default '{}'::jsonb`
   (supabase/migration.sql에 추가; Supabase SQL 편집기에서 실행 필요).
4. **"현재 레벨 전체 적용" 체크박스는 이름·URL 각각 별도** — 체크된 필드만
   해당 레벨의 10개 월(March~December) 전체에 일괄 적용(단일 배치 upsert).
5. **지우기 버튼 제거** — 입력란을 직접 비우고 저장하면 삭제되므로 불필요
   (사용자 지시). 모달 액션은 취소/저장만 남음.
6. **빈 이름 = 기본 이름 폴백** — 커스텀 라벨 삭제 → `TOOLBAR_BUTTONS` 기본
   이름으로 복귀. 이름 입력란에는 커스텀 값만 담고 기본 이름은 placeholder
   (`기본: …`)로 노출.

## 구조

- **읽기:** `getSlotLabel(level, month, slot)` = `contentCache[..].labels[slot]`
  (있으면) ?? `toolbarButtons(level)` 기본 라벨. `renderContentToolbar()`와
  `slotLabel(slot, level, month)`(관리자 보드/모달 제목)가 사용. 비디오
  플레이어 제목은 버튼 span 텍스트를 읽으므로 자동 반영(admin mirrors user).
- **하이드레이션:** `hydrateContent()`가 labels를 캐시에 적재하고, 콘텐츠 화면이
  떠 있으면 툴바를 재렌더(첫 페인트가 기본 라벨로 그려지는 레이스 해소).
  `window.craContent.settled` 플래그(craBg.settled 미러)로 테스트가 대기.
- **쓰기:** `commitSlot({url, name, applyAllName, applyAllUrl})` 단일 경로.
  전체 적용 체크 시 10개 월 행 배열을 한 번에 upsert(없던 월 행은 생성).
  `savePage`는 labels 포함 전체 행 upsert — **labels 컬럼이 없으면 저장이 전부
  실패하므로 ALTER 선행 필수.**
- **테스트:** `window.craContent` 브리지 + `resetContentLabels()` 헬퍼(실 DB
  라벨을 클라이언트 캐시에서 비워 기본 이름을 결정적으로 만듦). 신규 테스트
  3종(커스텀 라벨 렌더+폴백 / 관리자 보드 미러 / 모달 필드 표시·숨김).

## 수용 기준 (qa 42/42 green, 2026-07-31)

- 커스텀 이름이 사용자 툴바·관리자 보드 상단 행·모달 제목·비디오 플레이어
  제목에 동일하게 표시된다.
- 이름을 비우고 저장하면 기본 이름으로 복귀한다.
- 전체 적용 체크 시 체크된 필드만 그 레벨의 모든 월에 반영된다.
- 요일 슬롯 모달은 기존과 동일(이름란·체크박스 없음)하다.
- Supabase 미연결 시 기본 이름으로 렌더된다.
