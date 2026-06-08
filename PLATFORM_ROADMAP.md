# Claude Code 구축 작업 지침서

## Long-Term Reference Notice

This file is a long-term platform reference for Next.js/React, Supabase, admin, Vercel, and app packaging direction.

Current working decisions:

- Short-term goal: complete the current static SPA prototype first.
- Current implementation scope does not include login, admin, Supabase, or app packaging.
- Use `CLAUDE.md`, `PROJECT_MEMORY.md`, `PRODUCT_SPEC.md`, and `DESIGN.md` for current static SPA work.
- Return to this file when the user explicitly starts the long-term platform rebuild.

이 문서는 유치원 영어 학습 웹&앱 프로젝트를 로그인 기반 플랫폼으로 재구축할 때 Claude Code가 따라야 하는 장기 작업 지침이다. 현재 정적 SPA 단계 문서(`PRODUCT_SPEC.md`, `DESIGN.md`)와 함께 사용하되, 로그인, 관리자, 배포, 앱 출시와 관련된 방향은 이 문서를 우선 적용한다.

## 1. 프로젝트 방향

본 프로젝트는 단순 정적 콘텐츠 사이트가 아니라, 로그인 기반의 회원제 학습 플랫폼으로 구축한다.

최종 구조는 다음을 목표로 한다.

- 사용자 Web App
- Android/iOS 하이브리드 App
- Web 기반 통합 관리자 페이지
- Supabase 기반 인증, DB, 권한 관리
- Vercel 기반 웹 배포
- GitHub 기반 소스 관리

웹과 앱은 별도 운영 시스템을 두지 않는다. 모든 회원, 회원그룹, 콘텐츠 URL, 콘텐츠 접근 권한, 회원가입 노출 설정은 하나의 관리자 페이지에서 관리되어야 한다.

## 2. 핵심 아키텍처

권장 구조:

```text
Admin Web
  - 회원 관리
  - 회원그룹 관리
  - 콘텐츠 URL 관리
  - 콘텐츠 접근 권한 관리
  - 회원가입 페이지 노출 설정

User Web App
  - 로그인
  - 레벨 선택
  - 레벨별 Month 페이지
  - 영상 플레이어 모달
  - 권한 기반 콘텐츠 접근

Android/iOS App
  - User Web App을 하이브리드 앱으로 패키징
  - 동일 DB/API 사용
  - 동일 관리자 설정 반영
```

웹과 앱은 동일한 데이터와 권한 정책을 사용해야 한다. 앱 전용 관리자 기능을 따로 만들지 않는다.

## 3. 기술 방향

권장 기술 스택:

- Frontend: Next.js 또는 React 기반 Web App
- Backend/Auth/DB: Supabase
- Hosting: Vercel
- Repository: GitHub
- Mobile Packaging: Capacitor 기반 하이브리드 앱

현재 정적 SPA(`PRODUCT_SPEC.md`)는 HTML/CSS/Vanilla JS 중심 구조이나, v2.0 요구사항에서는 로그인, 관리자, DB, 권한 관리가 필요하므로 정적 구조만으로는 부족하다. 이후 구현 시에는 사용자와 협의하여 Next.js 또는 React 기반 구조로 전환하는 것을 우선 검토한다.

## 4. 사용자 접근 정책

기본 원칙:

- 학습 콘텐츠 사용은 로그인 사용자에게만 허용한다.
- 비로그인 사용자는 콘텐츠 페이지에 접근할 수 없다.
- 로그인 사용자는 자신에게 허용된 콘텐츠만 볼 수 있다.
- 관리자 페이지는 관리자 권한 계정만 접근할 수 있다.
- 특정 회원그룹에만 콘텐츠를 노출할 수 있어야 한다.

비로그인 사용자가 보호된 페이지에 접근하면 로그인 페이지로 이동시키거나 접근 제한 안내를 표시한다.

## 5. 로그인 및 회원가입 정책

### 로그인

- 로그인 버튼 클릭 시 아이디와 패스워드를 입력하는 로그인 페이지로 이동한다.
- 로그인 페이지에는 회원가입 버튼을 표시하지 않는다.
- 로그인 성공 후 사용자 메인 또는 원래 접근하려던 페이지로 이동한다.

### 회원가입

- 회원가입 기능은 구현한다.
- 기본적으로 사용자 화면에 노출하지 않는다.
- 관리자 페이지에서 회원가입 페이지 노출 토글을 ON으로 설정한 경우에만 사용자 화면에서 접근 가능하게 한다.

### 계정 생성

- 일반 사용자가 직접 가입하는 흐름은 기본 흐름이 아니다.
- 로그인 가능한 계정은 관리자 페이지의 회원 생성 기능으로 만들 수 있어야 한다.
- 아이디/비밀번호는 서비스 정책상 특별한 글자 수 제한을 두지 않는다.
- 단, 사용하는 인증 시스템이나 DB의 기술적 최대 길이는 내부적으로 따를 수 있다.

## 6. 관리자 페이지 범위

관리자 페이지는 Web으로만 제공한다. 웹 사용자와 앱 사용자를 모두 같은 관리자 페이지에서 관리한다.

필수 기능:

- 관리자 로그인
- 관리자 대시보드
- 회원 목록 열람
- 회원 등록
- 회원 탈퇴 또는 비활성화
- 회원그룹 생성
- 회원그룹 수정
- 회원그룹 삭제
- 회원별 그룹 지정
- 그룹별 회원 목록 열람
- 레벨/월/버튼별 콘텐츠 URL 등록
- 콘텐츠 공개/비공개 설정
- 콘텐츠 접근 가능 그룹 지정
- 회원가입 페이지 사용자 노출 토글

회원 탈퇴는 실제 삭제와 비활성화 중 어떤 방식인지 구현 전에 사용자에게 확인한다. 특별한 지시가 없다면 운영 안정성을 위해 비활성화를 우선 고려한다.

## 7. 사용자 페이지 범위

사용자 페이지는 Web App으로 구현하고, 이후 Android/iOS 앱에서 동일 화면을 사용한다.

필수 화면:

- 로그인 페이지
- 사용자 메인
- 레벨 선택 페이지 또는 영역
- Level 1-4 홈
- 각 레벨별 3월-12월 Month 페이지
- 콘텐츠 플레이어 모달
- 접근 제한 안내 또는 로그인 유도 화면

기본 학습 흐름:

```text
로그인
→ 레벨 선택
→ 월 선택
→ Month 페이지 진입
→ 콘텐츠 버튼 클릭
→ 전용 플레이어 모달에서 영상 재생
```

기존 PRD의 4레벨 x 10개월 x 5개 메뉴 구조는 유지한다.

## 8. 콘텐츠 관리 및 재생 정책

콘텐츠 URL은 코드에 하드코딩하지 않는 것을 목표로 한다. 관리자 페이지에서 등록된 URL을 DB에서 조회하여 사용자 화면에 반영한다.

콘텐츠 관리 단위:

- Level
- Month
- Button 또는 Menu Type
- Content Type
- Content URL
- 공개 여부
- 접근 가능 회원그룹

현재 고정 메뉴:

| 메뉴           | 용도             |
| -------------- | ---------------- |
| Opening Song   | 영상 또는 음원   |
| Story          | 영상 또는 E-book |
| Word Chant     | 영상 또는 음원   |
| Sentence Chant | 영상 또는 음원   |
| Ending Song    | 영상 또는 음원   |

사용자 화면에서 각 레벨별 Month 페이지의 버튼을 클릭하면 전용 플레이어 모달이 열리고 영상이 재생되어야 한다.

영상과 연결되어야 하는 버튼 범위는 추후 재정리 예정이므로, 구현 시 버튼과 콘텐츠 연결 구조를 유연하게 설계한다.

## 9. 데이터 모델 초안

구현 전 DB 스키마를 먼저 설계한다.

필수 테이블 후보:

- `profiles` 또는 `members`
- `member_groups`
- `member_group_members`
- `levels`
- `months`
- `content_buttons`
- `content_items`
- `content_access_rules`
- `site_settings`

예상 책임:

- `members`: 회원 기본 정보와 상태
- `member_groups`: 회원그룹 정보
- `member_group_members`: 회원과 그룹의 관계
- `levels`: Level 1-4 정보
- `months`: 3월-12월 정보
- `content_buttons`: Opening Song, Story 등 버튼 정의
- `content_items`: 실제 콘텐츠 URL과 타입
- `content_access_rules`: 그룹별 콘텐츠 접근 권한
- `site_settings`: 회원가입 페이지 노출 여부 등 전역 설정

Supabase Auth를 사용할 경우, 로그인 계정 정보와 서비스 프로필 정보의 분리 방식을 먼저 정한다.

## 10. 구축 단계

### 1단계: 문서 정리

- `PRODUCT_SPEC.md`를 v2.0(로그인/관리자/권한) 요구사항에 맞게 개정한다.
- 로그인, 관리자, 권한, 배포, 앱 출시 범위를 PRD에 명시한다.
- 기존 정적 콘텐츠 전제와 충돌하는 부분을 정리한다.

### 2단계: 기술 구조 확정

- Next.js/React 전환 여부를 확정한다.
- Supabase Auth 사용 여부를 확정한다.
- 관리자와 사용자 화면을 같은 프로젝트에 둘지, 별도 앱으로 분리할지 결정한다.
- Capacitor 기반 앱 패키징 방식을 확정한다.

### 3단계: DB 및 권한 설계

- 회원/그룹/콘텐츠/설정 테이블을 설계한다.
- Row Level Security 정책을 검토한다.
- 관리자 권한과 일반 회원 권한을 분리한다.
- 그룹별 콘텐츠 접근 정책을 정의한다.

### 4단계: 관리자 페이지 구축

- 관리자 로그인
- 회원 목록
- 회원 등록
- 회원 탈퇴 또는 비활성화
- 회원그룹 관리
- 회원별 그룹 지정
- 콘텐츠 URL 등록
- 콘텐츠 접근 그룹 지정
- 회원가입 노출 토글

관리자 페이지를 먼저 구축해야 사용자 웹과 앱에서 사용할 데이터 관리 기준이 안정된다.

### 5단계: 사용자 Web App 구축

- 로그인 페이지
- 로그인 상태 관리
- 보호 라우트
- 레벨 선택
- Month 페이지
- 콘텐츠 버튼 렌더링
- 영상 플레이어 모달
- 권한 없는 콘텐츠 비활성화 또는 숨김 처리

### 6단계: 웹 배포

- GitHub 저장소 정리
- Supabase 프로젝트 연결
- Vercel Preview 배포
- 환경변수 설정
- 관리자/사용자 기능 검증
- Production 배포

### 7단계: 하이브리드 앱 구축

- Capacitor 프로젝트 구성
- 사용자 Web App 연결
- Android 빌드 검증
- iOS 빌드 검증
- 로그인 세션 유지 확인
- 영상 플레이어 동작 확인
- 앱 아이콘과 스플래시 설정

### 8단계: QA 및 운영 준비

- PC/태블릿/모바일 반응형 확인
- Android/iOS WebView 영상 재생 확인
- 권한별 콘텐츠 노출 확인
- 관리자 변경 사항이 웹/앱에 반영되는지 확인
- 비로그인 접근 차단 확인
- 회원가입 노출 토글 확인

## 11. 구현 전 확인 필요 사항

아래 항목은 구현 전에 사용자에게 확인한다.

- 관리자 최초 계정 생성 방식
- Supabase Auth 사용 여부
- 회원 탈퇴를 삭제로 처리할지 비활성화로 처리할지
- 회원그룹별 제한 대상이 페이지인지, 콘텐츠 버튼인지, 콘텐츠 URL인지
- 영상 호스팅 위치가 cafe24 CDN인지, Supabase Storage인지, 외부 URL인지
- 영상 플레이어가 iframe 중심인지 HTML5 video 중심인지
- 앱 출시가 하이브리드 래핑인지 별도 네이티브 개발인지
- 관리자와 사용자 앱을 같은 코드베이스로 둘지 분리할지

## 12. Claude Code 작업 원칙

Claude Code는 작업을 시작할 때 다음 순서로 문서를 확인한다.

1. `CLAUDE.md`
2. `PLATFORM_ROADMAP.md`
3. `PRODUCT_SPEC.md`
4. `DESIGN.md`

구현 작업 시 원칙:

- 문서 수정 요청과 코드 구현 요청을 구분한다.
- 사용자가 계획만 요청한 경우 코드 파일을 수정하지 않는다.
- 사용자 웹과 앱을 따로 설계하지 말고, Web App 중심으로 공통 구조를 유지한다.
- 관리자 기능은 Web 하나에서 통합 관리되도록 설계한다.
- 콘텐츠 URL은 가능하면 코드가 아닌 DB에서 관리한다.
- 인증과 권한 검증은 UI 표시만으로 처리하지 않는다.
- 비로그인 사용자가 콘텐츠 URL을 직접 알더라도 접근이 제한되는 구조를 목표로 한다.
- 앱 패키징 전에 웹앱 기능과 모바일 반응형을 먼저 안정화한다.

## 13. 현재 구현 파일에 대한 주의

현재 루트에는 `index.html`, `styles.css`, `app.js` 기반 구현이 존재한다. 이 파일들은 기존 정적 사이트 방향의 산출물일 수 있다.

향후 로그인, 관리자, Supabase, Vercel, 앱 패키징까지 진행하려면 기존 파일을 그대로 확장할지, Next.js/React 기반으로 새 구조를 만들지 먼저 결정해야 한다.

사용자가 명시적으로 요청하기 전까지는 기존 구현 파일을 임의로 대규모 전환하지 않는다.
