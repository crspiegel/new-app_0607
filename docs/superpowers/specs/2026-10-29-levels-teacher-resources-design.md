# 레벨 표기 정리(A) · 교사 자료실(B) — 설계 (멈춤 1 승인됨)

- 지시서: `docs/worker-briefs/2026-10-29-levels-teacher-resources-brief.md` (로컬 전용)
- 기준: `master` = `fe991f8` (3A 로컬, 미푸시 7), `origin/master` = `00f4bad`
- 상태: **멈춤 4(2026-10-29).** 서로 다르면 우선순위는 멈춤 4 > 멈춤 3 > 멈춤 1 PM 결정 > 본문.
- 표기: "내 판단"이라고 적은 것은 PM이 정하지 않은 부분을 작업자가 정한 것이다(PM이 6가지 모두 승인).

## 멈춤 1 PM 결정 (2026-10-29) — 본문보다 우선

| #   | 결정                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 서명 URL은 **(가) Storage RLS + 헤더**. 운영 확인 2회 승인·실행 결과: `OPTIONS /storage/v1/object/sign/teacher-resources/probe.pdf` → 200, `Access-Control-Allow-Headers: authorization, apikey, content-type, x-client-info, x-lms-token`; 공개 표지 `HEAD` → 200, `Access-Control-Allow-Origin: *`. 그 밖의 운영 Storage 요청 금지 |
| 2   | 표지 폴더 이름 변경(`git mv`). `qr/qr-list.csv`는 새 경로로 다시 생성(로컬 전용) — 70행 모두 `cover_file`만 바뀌고 `student_url` 등 나머지 열 동일                                                                                                                                                                                   |
| 3   | CSS 클래스도 새 키로: `level-theme-<key>`, 헤더 `nav-<key>`, 홈 카드 `level-button--<key>`(내 판단: 이름 모양). 합격 기준 = 픽셀 기준선 통과                                                                                                                                                                                         |
| 4   | 다운로드 횟수 제한 없음. **업로드 상한 10MB를 차단**으로: 버킷 `file_size_limit = 10485760`, 관리자 화면에서 올리기 전에 막고 한국어 안내. 본문의 50MB 상한·10MB 경고는 이것으로 대체                                                                                                                                                |
| 5   | 작업자 판단 6가지 승인. `LEVELS` 위치 = `video-source.js`(`index.html`·`play.html`이 각각 `app.js`·`play.js`보다 먼저 이미 불러옴)                                                                                                                                                                                                   |
| a   | 다운로드는 **Content-Disposition 방식 우선**: 서명 URL에 `&download=<encodeURIComponent(파일 이름)>`을 직접 붙여(1회 인코딩) 같은 탭의 숨은 `<a>`(target 없음)로 연다. Blob은 이 방식이 안 되는 근거가 있을 때만. 아이폰 사파리 실기기 확인은 배포 후 사용자 몫                                                                      |
| b   | `migration.sql` 재실행 안전성(옛 레벨 값 insert/upsert·01의 CHECK와 충돌 여부) 확인·보고. CHECK 합치기·호환 읽기 제거는 플랜 백로그(SQL 2 / 3.5)                                                                                                                                                                                     |
| c   | `teacher_resources`의 `test` 칸은 `level-2`·`level-3`에만 — CHECK                                                                                                                                                                                                                                                                    |
| d   | 운영 선생님 테스트 계정(role 2, 지사 hq) 생성 SQL을 `supabase/lms/` 아래에(사용자 실행, 3A 운영 반영 뒤)                                                                                                                                                                                                                             |
| e   | "넘으면 바로 402" 판단의 출처를 보고에 적는다                                                                                                                                                                                                                                                                                        |

## 멈춤 4 — PM 결정 (2026-10-29): (나) Edge Function + 하루 30회 (아래 "멈춤 3"보다 우선)

| 결정 | 내용                                                                                                                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 서명 URL: (가) → **(나) Edge Function `teacher-resource-download`**. 이유: (가)는 만료를 클라이언트가 정해 오래가는 링크가 퍼지면 미캐시 이그레스가 샌다(유예 소진 — 다음 초과 즉시 402) |
| 2    | **하루 다운로드 한도**: LMS 회원 1명당 KST 하루 30회(발급 기준), 관리자 무제한. 초과 시 "오늘 다운로드 횟수를 모두 사용했습니다. 내일 다시 시도해 주세요."                               |

### 구현

| 부분        | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 함수        | `supabase/functions/teacher-resource-download/index.ts` 한 파일(import 없음). CORS 허용 출처 5개(운영 www·apex, vercel.app, 로컬 127.0.0.1·localhost:5173), OPTIONS 204, `x-lms-token` 허용. `{level, slot}` 형식 검사 → 관리자 = `Authorization` JWT를 `/auth/v1/user`로 확인한 id, LMS = `x-lms-token`을 DB로 전달 → service role로 `teacher_resource_issue` → service role로 **15초 고정** 서명(요청의 `expiresIn` 무시) → `&download=<이름 1회 인코딩>` URL. 응답·오류에 키 없음 |
| DB          | `teacher_resource_issue(p_level, p_slot, p_admin_uid)` — **service_role만 실행**. 관리자 또는 `lms_member()` role 1·2(세션·회원·지사 활성) / 현재 파일만 / LMS는 KST 하루 30회(회원별 advisory lock) → 기록. `teacher_resource_downloads`(회원 id·level·slot·발급 시각): RLS·정책 0·권한 회수, 30일 지난 행은 발급 때 삭제                                                                                                                                                           |
| 제거        | LMS용 `storage.objects` 읽기 정책 `teacher_resources_lms_read`, RPC `teacher_resource_file`, 도우미 `teacher_resource_is_current` — `drop … if exists`(재실행 안전). 관리자 업로드·삭제 정책은 유지                                                                                                                                                                                                                                                                                  |
| 클라이언트  | `sb.functions.invoke("teacher-resource-download", {level, slot})` → 받은 URL을 같은 탭 숨은 `<a>`로. 401 → "다시 로그인해 주세요.", 404 → "아직 준비 중이에요.", 429 → 한도 문구, 그 외 → "내려받지 못했어요…". `lmsFetch` 토큰 대상: REST + 이 함수 주소(Storage 서명에는 더 이상 안 붙음)                                                                                                                                                                                          |
| 배포 절차서 | `supabase/functions/README.md` — 대시보드 편집기 붙여넣기, 이름, JWT 검증(켜 둠, 문제 시 끄기), 비밀 값 입력 없음, 배포 후 확인 4가지                                                                                                                                                                                                                                                                                                                                                |

### 최종 운영 순서 (멈춤 4 — 이것이 최신)

| 순서 | 누가          | 무엇                                                                                                                                                                                 | 확인                                                       |
| ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 1    | 사용자·작업자 | 3A 1~5단계(`supabase/lms/README.md`). 2단계 = 지금의 `migration.sql` 전체(3A + 교사 자료실 블록, 추가만 — 3A precheck·verify 기대값 불변, `test:sql`로 확인)                         | 3A 기대값 그대로. 버킷 `teacher-resources` 비공개·10MB     |
| 2    | PM            | **3A만 푸시: `git push origin fe991f8:master`** (그냥 `git push`는 A·B까지 나감)                                                                                                     | 회원 로그인·관리자 로그인                                  |
| 3    | 사용자        | `supabase/lms/teacher-test-account.sql` 실행 → 결과 표의 비밀번호는 5번에만 사용                                                                                                     | 표 1줄 `tps-teacher-test │ 2 │ hq │ true │ 0 │ (비밀번호)` |
| 4    | 사용자        | Edge Function 배포(`supabase/functions/README.md` 1~6단계)                                                                                                                           | 함수 목록에 `teacher-resource-download`                    |
| 5    | 사용자        | 다운로드 확인 — 로컬 `npm.cmd run dev` + 콘솔 `craDevLive(true)`: 관리자로 작은 PDF 업로드 → 테스트 계정으로 다운로드 → 학생·비로그인은 버튼 없음. (작업자 OPTIONS 1회는 PM 승인 시) | 같은 탭 저장·한글 이름. 실패하면 6번 전에 멈추고 보고      |
| 6    | PM            | A+B 푸시(`git push`)                                                                                                                                                                 | 운영 새 주소(`#months/beginner`)로 내용 그대로             |
| 7    | 사용자        | `supabase/levels/00-precheck.sql` → `01-rename.sql` → 00 재실행 — **6번 뒤에만**                                                                                                     | 옛 키 `after = 0`, 모두 `new`                              |
| 8    | 사용자        | 실제 파일 10개 업로드, 아이폰 사파리 실기기 다운로드, 테스트 계정 삭제(파일 맨 아래 한 줄), 월 1회 Usage(이그레스)                                                                   |                                                            |

### 보안 재검토 (rls-security-reviewer, 멈춤 4) — 치명·높음 없음

| #    | 등급 | 지적                                                                                                                     | 처리                                                                                            |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| M1   | 중   | 한도는 "발급" 기준 — 받은 URL 하나는 만료 전까지 몇 번이든 GET 가능(악의적 선생님이 병렬 요청하면 이그레스 증폭)         | **PM 승인 → 15초로 단축(반영).** 링크는 받자마자 같은 탭에서 열리므로 충분. 아래 "M1 반영" 참고 |
| L1   | 낮   | `v_role not in (1,2)`가 NULL이면 거부를 빠져나감(지금은 `role` NOT NULL이라 불가)                                        | **수정** — `not coalesce(v_role in (1, 2), false)`                                              |
| L2   | 낮   | 본문 검사가 `String()` 변환 — 배열 `["beginner"]`도 통과                                                                 | **수정** — `typeof … === "string"` + 테스트                                                     |
| L3   | 낮   | `lmsFetch` 주소 비교에 경계 없음(`…-download-v2`에도 토큰)                                                               | **수정** — 함수 주소 정확히(뒤에 `?`만 허용) + 테스트                                           |
| L4   | 낮   | 운영 함수가 localhost 출처 허용                                                                                          | 유지(PM: 로컬 dev 허용). 인증이 쿠키가 아닌 헤더라 다른 로컬 페이지가 토큰을 얻을 수 없음       |
| L5   | 낮   | 실패 요청에 속도 제한 없음(호출 한도만 소모, 유출 없음)                                                                  | 유지 — 보고만                                                                                   |
| L6   | 낮   | 테스트 계정 비밀번호가 임시 표에 세션 동안 남음                                                                          | **수정** — 스크립트 끝에서 임시 표 삭제 + 테스트                                                |
| 정보 | —    | KST 자정 앞뒤 30+30회(스펙대로), 서명 실패도 1회로 셈(닫힌 실패), 관리자 무기록, 30일 정리 비용 무시 가능, 낡은 주석 2곳 | 낡은 주석 **수정**, 나머지 그대로                                                               |

**M1 반영 (PM 승인, 2026-10-29):** 서명 URL 만료 = **15초**, 서버 고정 그대로(`EXPIRES_IN`, 요청의 `expiresIn` 무시).

- 15초는 다운로드 **시작** 기준이라 큰 파일도 도중에 끊기지 않는다.
- 남는 위험(받은 URL 하나로 15초 안에 반복 다운로드)은 하루 30회(발급 기준) + 파일 10MB 상한으로 막는다.

확인된 것: 만료·객체를 호출자가 못 바꿈, `p_admin_uid` 위조 불가(service_role만 실행), 관리자 판정은 Auth가 서명·만료·세션 확인,
`x-lms-token`은 형식 검사 후 DB 전달만(권한 상승 없음), 한도는 회원 단위·advisory lock, 응답·오류에 키 없음, LMS 세션은 Storage
읽기 불가, 기록 표 직접 접근 불가.

## 멈춤 3 — B 구현에서 달라진 점 (본문 B보다 우선)

| 항목               | 본문(멈춤 1 초안)                     | 실제 구현                                                                                                                                                                                            |
| ------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 자료페이지         | 별도 화면 `#resourceScreen`           | **월 화면의 "자료 모드"**(`screens.resources` = `#monthScreen`, `body[data-screen="resources"]`가 3~12월 버튼을 숨기고 다운로드 버튼을 보임). 헤더·제목·색·배경·반응형이 월 페이지와 구조적으로 같다 |
| 폰 버튼 위치       | 제목 아래 가운데                      | 제목 아래 **왼쪽**(폰에서는 월 페이지 제목이 원래 왼쪽 정렬 — 제목은 1px도 안 움직임, 테스트로 고정)                                                                                                 |
| 크기 상한          | 50MB + 10MB 경고                      | **10MB 차단**(버킷 `file_size_limit = 10485760`, 표 CHECK, 관리자 화면 사전 차단)                                                                                                                    |
| 다운로드           | Blob 우선                             | **Content-Disposition 우선**(PM 결정 a): 서명 URL + `&download=` 1회 인코딩, 숨은 `<a>` 같은 탭                                                                                                      |
| 업로드             | `upload(path, file, { contentType })` | `upload(path, await file.arrayBuffer(), { contentType })` — supabase-js가 File을 multipart로 보내 `contentType`이 무시되는 문제 회피                                                                 |
| SQL                | B5 초안                               | 실제는 `supabase/migration.sql` "Teacher resources" 블록. 차이: set/clear `search_path = public, extensions`, 관리자 Storage 정책에 `test` 칸은 `level-2/3` 경로만                                   |
| 선생님 테스트 계정 | —                                     | `supabase/lms/teacher-test-account.sql` — 서버가 무작위 비밀번호를 만들어 결과 표에 한 번만 보여 줌(문장에 비밀번호 없음 → 기록·로그에 안 남음, 보안 검토 반영)                                      |

### 최종 운영 순서 (멈춤 3 — ⚠ 멈춤 4 표로 대체됨)

| 순서 | 누가          | 무엇                                                                                                                                                                             | 확인                                                       |
| ---- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1    | 사용자·작업자 | 3A 1~5단계(`supabase/lms/README.md`). 2단계는 지금의 `migration.sql` 전체 — 맨 끝 B 블록도 함께 실행된다(추가만, 3A precheck·verify 기대값 불변 — `test:sql`로 확인)             | 3A 기대값 그대로. 버킷 `teacher-resources` 비공개·10MB     |
| 2    | PM            | **3A만 푸시:** `git push origin fe991f8:master`(3A 마지막 커밋까지만 — 그냥 `git push`면 A·B까지 나간다)                                                                         | 회원 로그인·관리자 로그인                                  |
| 3    | 사용자        | B SQL — 1에서 이미 실행됐으면 생략(아니면 `migration.sql` 전체 재실행, 재실행 안전)                                                                                              | `Success`                                                  |
| 4    | 사용자        | 보완 d: `supabase/lms/teacher-test-account.sql` 실행 → 결과 표의 비밀번호로 5번 확인(아무것도 입력하지 않음)                                                                     | 표 1줄 `tps-teacher-test │ 2 │ hq │ true │ 0 │ (비밀번호)` |
| 5    | 사용자        | (가) 확인 2 — 로컬 개발 서버(`npm.cmd run dev`) + 콘솔 `craDevLive(true)` 후 새로고침: 관리자로 작은 PDF 1개 업로드(배너 탭) → 로그아웃 → `tps-teacher-test`로 로그인해 다운로드 | 같은 탭에서 저장, 한글 이름. 학생·비로그인은 버튼 없음     |
| 6    | PM            | A+B 푸시(`git push`)                                                                                                                                                             | 운영 새 주소(`#months/beginner`)로 내용 그대로             |
| 7    | 사용자        | 보완 b: `supabase/levels/00-precheck.sql` → `01-rename.sql` → 00 재실행 — **6번 뒤에만**                                                                                         | 옛 키 `after = 0`, 모두 `new`                              |
| 8    | 사용자        | 실제 파일 업로드(10칸), 아이폰 사파리 실기기 다운로드 확인, (5번이 끝나면 바로) 테스트 계정 삭제(파일 맨 아래 한 줄), 월 1회 Usage(이그레스) 확인                                |                                                            |

- 5번에서 (가)가 안 되면(선생님 다운로드가 "다시 로그인해 주세요") 6번 전에 멈추고 보고 → (나) Edge Function으로 전환.
- 6번 전이라도 B 코드는 B SQL(1·3번)이 먼저 있어야 한다 — 없으면 선생님에게 "자료 목록을 불러오지 못했어요"만 보인다
  (닫힌 실패). 7번(A rename)은 6번 앞에 오면 옛 코드가 빈 화면이 된다.

### 보안 검토 (rls-security-reviewer, 멈춤 3)

| #   | 지적                                                                                                                                       | 처리                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 만료 시간은 클라이언트가 정한다 — 토큰을 꺼낸 선생님이 `expiresIn`을 크게 줘 몇 년짜리 링크를 만들 수 있고, 로그아웃·계정 정지 뒤에도 유효 | **PM 결정 필요.** (가)는 서버가 만료를 강제할 수 없다(만료값은 요청 본문 — Postgres로 안 넘어옴). 멈춤 1 비교에서 놓친 점. 완화: 관리자가 같은 칸에 다시 올리면 새 경로가 되고 옛 객체가 지워져 옛 링크가 죽는다 |
| 2   | 교체·삭제 뒤 Storage 삭제가 실패한 고아 파일을 role 1·2가 계속 목록·서명 가능                                                              | **수정함.** 읽기 정책에 `teacher_resource_is_current(name)` 추가 — 표가 가리키는 현재 파일만. 테스트로 고정                                                                                                      |
| 3   | 테스트 계정 SQL의 비밀번호 리터럴이 오류 로그·쿼리 통계에 남을 수 있음                                                                     | **수정함.** 서버가 무작위 비밀번호를 만들어 결과에만 표시                                                                                                                                                        |
| 4   | 공개 저장소에 아이디가 있는 운영 계정                                                                                                      | 운영 순서에 "확인 직후 삭제" 명시                                                                                                                                                                                |
| 5   | 일반 Auth 사용자 + LMS 토큰이면 목록은 보이나 서명은 실패                                                                                  | 닫힌 실패 — 그대로                                                                                                                                                                                               |

---

## A. 레벨 표기 정리

### A1. 옛 키 ↔ 새 키 ↔ 화면 표기 (근거)

| 옛 내부 키 | 새 내부 키 | 화면 표기 | QR 토큰(변경 없음) | 색   | 근거                                                                                                       |
| ---------- | ---------- | --------- | ------------------ | ---- | ---------------------------------------------------------------------------------------------------------- |
| `Level 1`  | `beginner` | Beginner  | `b`                | 노랑 | `video-source.js:42-47` `LEVEL_LABELS`, `:235-240` `QR_LEVEL_CODES`, `index.html:36-79`, `board.css:23-54` |
| `Level 2`  | `level-1`  | Level 1   | `l1` (별칭 `1`)    | 빨강 | 같음, 별칭 `video-source.js:241`                                                                           |
| `Level 3`  | `level-2`  | Level 2   | `l2` (별칭 `2`)    | 파랑 | 같음                                                                                                       |
| `Level 4`  | `level-3`  | Level 3   | `l3` (별칭 `3`)    | 보라 | 같음                                                                                                       |

PM 예상 대응이 코드와 일치한다. DB 시드에는 레벨 값이 없다(행은 관리자가 저장할 때 생긴다).

**새 키 형식 = 소문자 슬러그(`beginner`, `level-1..3`)** — 내 판단. 이유: 옛 값(`Level 1`, 대문자·공백)과
**한 글자도 겹치지 않는다.** 그래서 DB·주소·코드 어디서든 "이 값이 옛 키인가"를 모호함 없이 판별할 수 있다
(새 키를 `Level 1`처럼 화면 표기와 똑같이 쓰면 옛 Beginner와 새 Level 1이 같은 문자열이 되어 북마크·DB 전환이
위험해진다). 주소에서 `%20`도 사라진다.

**레벨 정의 1곳:** `video-source.js` 맨 위 `LEVELS` 표(이미 교사 사이트·학생 페이지·Node 스크립트가 함께 읽는
공유 상수 파일). 내 판단 — 새 `levels.js`를 만들면 두 HTML·두 스크립트·lint 목록 배선이 늘어난다.

```js
const LEVELS = [
  { key: "beginner", label: "Beginner", qr: "b", legacy: "Level 1" },
  { key: "level-1", label: "Level 1", qr: "l1", legacy: "Level 2" },
  { key: "level-2", label: "Level 2", qr: "l2", legacy: "Level 3" },
  { key: "level-3", label: "Level 3", qr: "l3", legacy: "Level 4" },
];
// levelLabel(key) · levelFromQrCode(code) · levelFromLegacy("Level 2") → "level-1"
// levelThemeClass(key) → "level-theme-level-1"  (숫자 파싱 금지 — 아래 A2 #4)
```

### A2. 전수 조사 (grep: `Level [1-4]`, `Level%20`, `level-[1-4]`, `level-theme-N`, `level-one..four`)

| #   | 위치                                                                                          | 현재 값                                         | 바꿀 값                                                                   | 운영 DB 변경    | 위험                                                                                             |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------ | ------------------------ |
| 1   | `video-source.js` `LEVEL_LABELS`·`TOOLBAR_BUTTONS`·`BOOK_LAYOUT`·`QR_LEVEL_CODES/ALIASES`     | `"Level 1".."Level 4"` 키                       | `LEVELS` 표 1곳에서 파생                                                  | —               | QR 토큰 대응이 바뀌면 인쇄 QR이 죽는다 → 70개 URL 고정 테스트                                    |
| 2   | `video-source.js:218` `coverAssetPath` (슬러그)                                               | `assets/covers/level-1/…` = Beginner            | `assets/covers/beginner/…` (키 그대로)                                    | —               | 폴더를 안 바꾸면 새 `level-1` 키가 Beginner 표지를 가리킨다 → #10과 같은 커밋                    |
| 3   | `app.js:503-533` `setHash`, `:2764-2806` 초기 라우터                                          | `#months/Level%201`, `#content/Level%201/March` | `#months/beginner`, `#content/level-1/March` + 옛 주소 replace 이동       | —               | 북마크 → 이동 테스트로 고정                                                                      |
| 4   | `app.js:483` `levelToThemeClass`, `play.js:648`                                               | 키에서 숫자 추출(`/\d+/`)                       | `LEVELS`에서 직접                                                         | —               | 그대로 두면 `level-1`→노랑(Beginner 색), `beginner`→`play.js` 예외로 학생 페이지 멈춤            |
| 5   | `app.js:1678-1679` 관리자 기본값·레벨 목록, `:2479` 단일 표지 판정                            | `"Level 1"`                                     | `"beginner"`, `LEVELS`                                                    | —               | 관리자 드롭다운 값만 바뀜(표기는 그대로)                                                         |
| 6   | `app.js:117-127` 로컬 시드 `contentData`                                                      | `"Level 1"` + `assets/l1-march-book-*.jpg`      | `"beginner"` + `assets/beginner-march-book-*.jpg`(파일 이름 변경)         | —               | `l1`이 이제 Level 1(QR 토큰)이라 혼동 → 이름 변경(내 판단)                                       |
| 7   | `app.js:2709` 표지 업로드 Storage 경로 `slugify(level)/month/book`                            | `level-1/march/book-1` (Beginner)               | `levels/<새 키>/<month>/<book>` (접두어 추가)                             | —               | **그대로 두면 새 Level 1 표지 업로드가 옛 Beginner 객체를 덮어쓴다(upsert).** 접두어로 충돌 차단 |
| 8   | `index.html` `data-level` 8곳, 클래스 `nav-level-one..four`·`level-one..four`                 | 옛 키·위치 이름                                 | 새 키, `nav-level-<key>`·`level-<key>`                                    | —               | CSS 선택자 동시 변경 — 픽셀 기준선(`board-visual`)으로 확인                                      |
| 9   | CSS `.level-theme-1..4`(board.css 6, styles.css 8), `play.css` `body[data-level="Level N"]` 3 | 숫자·옛 키                                      | `.level-theme-<key>`, `body[data-level="<key>"]`                          | —               | 총 28곳, 화면 변화 0이어야 함 → 픽셀 기준선 그대로 통과가 기준                                   |
| 10  | `assets/covers/level-1..4/` (70장, git 추적)                                                  | 옛 슬러그 폴더                                  | `beginner`, `level-1..3` (`git mv` 순서: level-1→beginner, 2→1, 3→2, 4→3) | —               | 순서가 틀리면 덮어씀 → 70장 해시가 옛 대응과 같음을 테스트                                       |
| 11  | `scripts/make-qr-list.mjs:21`, `scripts/sync-covers.mjs:22`(`--only "Level 3"`)               | 옛 키 목록                                      | `LEVELS`, `--only level-2`(옛 이름도 받아 줌)                             | —               | CSV의 `cover_file` 열만 달라짐(A6 결정 1)                                                        |
| 12  | `play.js:193-199` 학생 페이지 REST `level=eq.<key>`                                           | 옛 키                                           | 새 키 + 옛 키 함께 조회, 새 키 행 우선(A4 호환)                           | —               | 호환 없이 배포하면 DB 전환 전후로 학생 페이지가 빈 보드                                          |
| 13  | `background-editor.js:915,958` 배경 upsert/delete                                             | `state.level`(옛 키)                            | 새 키                                                                     | —               | 쓰기는 항상 새 키                                                                                |
| 14  | DB `content_pages.level` (pk 일부)                                                            | `Level 1..4`                                    | 새 키                                                                     | **필요**        | A4 순서                                                                                          |
| 15  | DB `page_backgrounds.level` (pk 일부)                                                         | `Level 1..4`                                    | 새 키                                                                     | **필요**        | A4 순서                                                                                          |
| 16  | DB 3A LMS 블록(branches·members·classes·sessions)                                             | 레벨 없음                                       | —                                                                         | 없음            | —                                                                                                |
| 17  | RPC `book_slots`                                                                              | **없음**(리뷰 문서 언급뿐, SQL에 없음)          | —                                                                         | 없음            | —                                                                                                |
| 18  | `site_settings`(hero_banner·game_hosts·signup_visible)                                        | 레벨 없음                                       | —                                                                         | 없음            | —                                                                                                |
| 19  | Storage `covers` 버킷 기존 객체 `level-N/…`                                                   | `content_pages.covers`에 **전체 URL**로 저장    | 그대로 둠(URL이 계속 유효)                                                | 없음            | 옛 객체는 교체될 때까지 쓰인다 — 지우면 안 됨                                                    |
| 20  | Storage `backgrounds` 버킷                                                                    | `BG_LIB_PREFIX/<시각>-이름` (레벨 없음)         | —                                                                         | 없음            | —                                                                                                |
| 21  | 테스트: smoke ~55, play ~56, board-visual 10, covers 3, qr-list 5                             | 옛 키·주소                                      | 새 키 + 새 테스트(옛 주소 이동, QR 고정)                                  | —               | 픽셀 기준선 파일 이름은 그대로 둔다(화면이 같아야 하므로)                                        |
| 22  | 문서: PRODUCT_SPEC 19, NOTES 5, PROJECT_MEMORY 2, migration.sql 주석                          | "내부 키는 Level 1..4" 설명                     | 새 체계로                                                                 | —               | 날짜 붙은 옛 spec/plan·archive는 기록이라 고치지 않는다                                          |
| 23  | `qr/qr-list.csv`(로컬), 학생 QR `/q/b                                                         | l1..l3/…`                                       | URL은 이미 최종 표기                                                      | **바꾸지 않음** | —                                                                                                | 70개 URL을 테스트로 고정 |

### A3. 새 해시 주소 · 옛 주소 이동

| 화면          | 새 주소                          | 옛 주소 (북마크)           |
| ------------- | -------------------------------- | -------------------------- |
| 월 선택       | `#months/beginner`               | `#months/Level%201`        |
| 요일 보드     | `#content/level-1/March`         | `#content/Level%202/March` |
| 시안 화면 2·3 | `#content-v2/…`, `#content-v3/…` | 같은 규칙                  |
| 자료페이지(B) | `#resources/level-2`             | (새 화면, 옛 주소 없음)    |

- 이동: 페이지를 열 때 레벨 칸을 `decodeURIComponent` → 옛 키(`Level 1..4`, 대소문자·공백 관대)면 새 키로 바꿔
  `history.replaceState`로 주소만 교체(뒤로 가기에 옛 주소가 남지 않음) → 그다음 평소처럼 화면 결정.
- 알 수 없는 레벨(`#months/foo`): 지금은 제목 "foo"로 월 화면이 뜬다 → 홈으로(내 판단).
- 월 칸은 지금처럼 `March` 그대로(이번 범위 밖).

### A4. DB 처리 — 비교와 추천

| 안                                 | 방법                                                                                        | 장점                                       | 단점                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| ① 값 변경만 (코드 새 키 전용)      | SQL로 값 바꿈 + 같은 때 푸시                                                                | 코드 단순                                  | **SQL과 배포 사이 공백 동안 사이트가 빈 화면**(교사·학생 모두). 순서가 어느 쪽이든 깨진다       |
| ② 코드 호환만 (DB 옛 값 영구 유지) | 코드가 DB 경계에서 새 키↔옛 키 변환                                                         | 운영 작업 0                                | DB에 옛 이름이 영원히 남는다(이번 작업의 목적과 반대). 새 표(`teacher_resources`)와 체계가 섞임 |
| **③ 호환 읽기 + 값 변경 (추천)**   | 코드: 읽을 때 옛 값·새 값 둘 다 받고(새 키 행 우선), 쓸 때는 새 키만 → 푸시 → SQL로 값 변경 | **공백 0**, DB 최종 상태 깔끔, 재실행 안전 | SQL 1회 + 호환 코드 ~30줄(나중에 삭제)                                                          |

**배포 순서(③):** 코드 푸시 → 운영 확인 → 사용자가 `supabase/levels/01-rename.sql` 실행 → `02` 결과 확인.
**SQL을 먼저 실행하면 안 된다**(옛 코드가 새 값을 못 읽어 빈 화면). 01에 넣는 CHECK 제약이 이후 옛 키 쓰기를
막아 준다(순서 실수 시 조용한 오염 대신 저장 오류로 드러남). 호환 코드는 SQL 확인 뒤 별도 커밋으로 지운다.

- 이 SQL은 `migration.sql`에 넣지 않는다(일회성 데이터 이동이고, migration.sql은 3A 2단계에서 통째로 실행되므로
  코드 배포 전에 돌아가 버린다).

```sql
-- supabase/levels/00-precheck.sql — 읽기 전용. 결과 표 1개.
select t.tbl as "table", t.level, count(*)::int as rows,
       case when t.level in ('Level 1','Level 2','Level 3','Level 4') then 'old → will move'
            when t.level in ('beginner','level-1','level-2','level-3') then 'new'
            else 'UNKNOWN — stop and report' end as note
  from (select 'content_pages' as tbl, level from public.content_pages
        union all
        select 'page_backgrounds', level from public.page_backgrounds) t
 group by t.tbl, t.level
 order by 1, 2;
```

```sql
-- supabase/levels/01-rename.sql — 코드(A) 운영 반영 '후'에만. 한 트랜잭션, 재실행 안전.
-- 옛 키 행을 새 키로 옮긴다. 새 코드가 이미 같은 페이지를 새 키로 저장했다면(그 사이 관리자 편집)
-- 새 키 행이 이기고 옛 행은 지운다. 두 번째 실행은 옮길 행이 없어 아무것도 바꾸지 않는다.
begin;

create temp table lv_map (old text primary key, new text not null unique) on commit drop;
insert into lv_map values
  ('Level 1', 'beginner'), ('Level 2', 'level-1'), ('Level 3', 'level-2'), ('Level 4', 'level-3');

create temp table lv_before on commit drop as
select tbl, level, count(*)::int as n
  from (select 'content_pages' as tbl, level from public.content_pages
        union all select 'page_backgrounds', level from public.page_backgrounds) t
 group by tbl, level;

-- 1) 새 키 행이 이미 있는 옛 행 = 낡은 사본 → 삭제
delete from public.content_pages o using lv_map m
 where o.level = m.old
   and exists (select 1 from public.content_pages n where n.level = m.new and n.month = o.month);
delete from public.page_backgrounds o using lv_map m
 where o.level = m.old
   and exists (select 1 from public.page_backgrounds n
                where n.level = m.new and n.page = o.page and n.month = o.month);

-- 2) 나머지 옛 행 → 새 키 (CASE 한 번, 옛·새 값이 겹치지 않으므로 pk 충돌 없음)
update public.content_pages set level = case level
  when 'Level 1' then 'beginner' when 'Level 2' then 'level-1'
  when 'Level 3' then 'level-2'  when 'Level 4' then 'level-3' end
 where level in ('Level 1', 'Level 2', 'Level 3', 'Level 4');
update public.page_backgrounds set level = case level
  when 'Level 1' then 'beginner' when 'Level 2' then 'level-1'
  when 'Level 3' then 'level-2'  when 'Level 4' then 'level-3' end
 where level in ('Level 1', 'Level 2', 'Level 3', 'Level 4');

-- 3) 이후 옛 키·오타 저장을 막는다 (재실행 안전: drop if exists → add)
alter table public.content_pages drop constraint if exists content_pages_level_key;
alter table public.content_pages add constraint content_pages_level_key
  check (level in ('beginner', 'level-1', 'level-2', 'level-3'));
alter table public.page_backgrounds drop constraint if exists page_backgrounds_level_key;
alter table public.page_backgrounds add constraint page_backgrounds_level_key
  check (level in ('beginner', 'level-1', 'level-2', 'level-3'));

-- 4) 결과 표: 표·레벨별 실행 전/후 행 수 (옛 키는 after = 0 이어야 함)
select coalesce(b.tbl, a.tbl) as "table", coalesce(b.level, a.level) as level,
       coalesce(b.n, 0) as before, coalesce(a.n, 0) as after
  from lv_before b
  full join (select tbl, level, count(*)::int as n
               from (select 'content_pages' as tbl, level from public.content_pages
                     union all select 'page_backgrounds', level from public.page_backgrounds) t
              group by tbl, level) a
    on a.tbl = b.tbl and a.level = b.level
 order by 1, 2;

commit;
```

기대: 옛 키 4줄은 `after = 0`, 새 키 줄의 `after` = 해당 옛 키 `before`(+그 사이 새로 생긴 행). 두 번째 실행은
`before = after`. (`02` 확인 쿼리는 00-precheck와 같으므로 00을 다시 실행해 "old" 줄이 없는지 본다.)

### A5. 호환 읽기(③) 구현 요점

- `hydrateContent`/`hydrateBackgrounds`: 행의 `level`을 `levelFromAny()`로 새 키로 바꿔 캐시에 넣되, **옛 키 행을
  먼저, 새 키 행을 나중에** 넣어 새 키 행이 이긴다.
- `play.js` 학생 페이지: `level=in.(level-1,"Level 2")`로 1회 조회, 새 키 행 우선.
- `sync-covers.mjs`: 같은 변환.
- 쓰기(관리자 콘텐츠·배경·표지): 항상 새 키.

### A6. PM 결정이 필요한 것 (A)

1. **`qr/qr-list.csv`의 `cover_file` 열**: 표지 폴더 이름을 바꾸면 이 열(정보용, 네이버 QR 등록에는 안 쓰임)이
   달라진다. QR URL·이름은 그대로. 추천: 폴더는 바꾸고, 로컬 CSV 파일은 **다시 만들지 않는다**(등록 스냅샷 유지),
   생성 스크립트·테스트의 기대값만 새 폴더로. 대안: 표지 폴더는 옛 이름 유지(CSV 완전 동일, 대신 `level-1`
   폴더 = Beginner 혼동이 남음).
2. CSS 클래스 이름 변경(A2 #8·#9, 28곳) 포함 여부. 추천: 포함(픽셀 기준선이 그대로 통과하는 것이 합격 기준).

---

## B. 교사 자료실

### B1. 월 선택 페이지 구조와 버튼 위치

현재(`index.html:299-320`):

```
section#monthScreen.screen.level-theme-N
  .section-box.section-white > .section-inner
    .month-header                       ← margin-bottom 80px, ≥768px에서 flex(space-between)
      .screen-heading.month-heading     ← 가운데 정렬, width 100%
        strong#monthLevelTag "Beginner"
    .month-grid#monthGrid               ← 3~12월 버튼 10개(app.js renderMonths)
```

추가: `.month-header` 안에 `<button id="teacherResBtn" hidden>`(레벨 색 아이콘 + "교사 자료실").

| 화면 폭                     | 배치                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ≥768px (스크린샷 빨간 상자) | `.month-header { position: relative }` + 버튼 `position: absolute; right: 0; top: 50%; translateY(-50%)` → 제목은 지금 자리(가운데) 그대로 |
| <768px (휴대폰 세로·가로)   | 버튼이 제목 **아래 줄 가운데**로 내려감(일반 흐름, `margin-top: 12px`), 제목 크기·위치 변화 없음                                           |

버튼 모양(내 판단): 흰 바탕 + 레벨 색 글자·테두리 + 아래 4px 입체 턱(DESIGN "Tactile Depth"), 높이 ≥56px,
`Noto Sans KR` 800(이미 로드됨). 월 버튼과 경쟁하지 않는 보조 버튼.

표시 조건: `updateAdminUI()`(관리자 로그인·LMS 로그인·로그아웃·페이지 로드 복원이 모두 이 함수를 부름)에서
`body.can-teacher-res` = `isAdmin || state.lms?.role ∈ {1, 2}` 토글 → CSS로 보임/숨김. **새로고침 없이 바뀐다.**
(실제 권한은 서버가 RPC·Storage 정책으로 다시 판정 — 버튼 숨김은 편의일 뿐.)

### B2. 자료페이지 화면안 (`#resources/<key>`, 레벨별 1개)

```
┌ header (그대로) ───────────────────────────────────────────────┐
│                     Beginner                    [ ◂ 월 선택 ] │ ← 제목 = 월 페이지와 같은 요소·스타일
│                                                               │   오른쪽 버튼 = 교사 자료실 자리의 거울(내 판단)
│        ┌──────────────┐   ┌──────────────┐                   │
│        │PDF           │   │PDF           │                   │ ← 월 버튼과 같은 계열(레벨 색 채움·39px 둥근 모서리·7px 턱)
│        │  월간.연간    │   │    상장      │                   │   왼쪽 위 작은 글씨 = 파일 종류(PDF/EXCEL)
│        │   교육안      │   │              │                   │   가운데 = 버튼 이름(고정, Noto Sans KR)
│        └──────────────┘   └──────────────┘                   │
│   Level 2·3은 [테스트] 1칸 더(3칸 가운데 정렬)                │
│   파일 없음 → 회색·비활성, 왼쪽 위 "준비 중"                  │
│   안내 줄(aria-live): 실패 시 짧은 문구                       │
└ footer (그대로, 레벨 색) ─────────────────────────────────────┘
```

- 버튼 크기는 월 버튼과 같게(내 판단), 2~3개를 가운데 정렬. 배경은 그 레벨의 페이지1 배경을 그대로 씀(월
  페이지와 같아 보이게, 내 판단).
- 재사용: `.month-header`·`#monthLevelTag` 스타일, `.month-button` 레벨 색 규칙, `showScreen()`·
  `applyLevelTheme()`·`levelPageScreens`(푸터 색), `applyPageBackground()`(page1).
- 권한 없는 직접 진입: 로그인 상태 확인(`refreshAdminStatus`·`restoreLmsSession`)이 끝날 때까지는 월 화면을
  보여 주고, 허용이면 자료페이지로, 아니면 `#months/<key>`로 replace(금지된 화면이 잠깐도 안 보이게, 내 판단).
- 다운로드 중: 그 버튼에 "내려받는 중…", 중복 클릭 무시.
- 실패 문구(내 판단, 한국어 — B3 영어 UI 예외 참고):
  권한 없음/세션 만료 → "다시 로그인해 주세요." · 파일 없음 → "아직 준비 중이에요." · 그 외 → "내려받지 못했어요.
  잠시 후 다시 시도해 주세요."
- **새 탭·페이지 이동 없음**: 서명 URL을 `fetch` → Blob → `<a download="원래 이름">` 클릭(같은 탭, 오류는
  전부 잡힘, 한글 파일 이름을 브라우저가 그대로 씀). 대안(Storage GET에 CORS가 없을 때): 서명 URL에
  `&download=<encodeURIComponent(이름)>`를 직접 붙여 같은 탭 링크 클릭(첨부 응답이라 이동하지 않음).
  ⚠ supabase-js `createSignedUrl(path, 15, { download })`는 파일 이름을 **두 번 인코딩**한다(B4 근거) → 쓰지 않는다.

### B3. 관리자 '배너' 메뉴에 추가할 섹션

현재 '배너' 탭(`index.html:806-938`, `hero-banner.js`): "메인 히어로 배너" 설정 + 이미지 목록 + **저장** 버튼
(배너 설정만 저장). 그 아래 구분선 다음에 새 섹션:

```
────────────────────────────────────────────────────────────────
교사 자료실 파일
PDF·엑셀(xlsx, xls), 최대 50MB. 올리는 즉시 반영되고, 새 파일을 올리면 이전 파일은 지워집니다.
(위 '저장' 버튼과 관계없음)

Beginner
  월간.연간교육안 │ 2026 Beginner 연간교육안.pdf · 4.2 MB · 2026-10-29 │ [교체] [삭제]
  상장            │ 파일 없음                                          │ [업로드]
Level 1   (2칸)   Level 2   (3칸: + 테스트)   Level 3   (3칸)
상태 줄(aria-live): "업로드 중…" / "완료" / 오류
```

- 칸 10개 = 레벨 4묶음. 각 칸: 현재 파일 이름·크기·올린 날짜, 업로드(교체), 삭제(확인은 같은 줄 2단계 버튼 —
  `confirm()` 대화상자 대신, 내 판단).
- 업로드 순서: 파일 검사(확장자·50MB, 10MB 넘으면 이그레스 경고 문구) → Storage `upload(<key>/<slot>/<Date.now()>.<ext>,
contentType=확장자로 결정)` → RPC `teacher_resource_set` (이전 경로를 돌려줌) → 이전 객체 `remove`.
  set 실패 시 방금 올린 객체를 지워 되돌린다. 이전 객체 삭제 실패는 고아 파일로 남을 뿐(접근 불가) → 상태 줄 안내.
- 삭제 순서: RPC `teacher_resource_clear`(경로를 돌려줌) → Storage `remove`.
- 관리자 미러 규칙(사용자 화면 ↔ 관리자 편집기) 충족: 자료페이지 10칸 = 이 섹션 10칸.
- 코드는 새 클래식 스크립트 `teacher-resources.js`(hero-banner.js처럼 app.js 뒤 로드, lint·prettier 목록에 추가) — 내 판단(app.js 2,860줄).

**영어 UI 규칙 예외:** "교사 자료실", "월간.연간교육안", "상장", "테스트", 안내 문구는 PM이 정한 한국어
(교사 전용 화면, R4 때와 같은 예외). NOTES에 예외로 기록한다.

### B4. ★ 서명 URL 발급 방식 비교

근거(직접 확인 2건 포함):

- Storage API는 RLS 쿼리 전 `set_config('request.headers', $6, true)`를 실행하고(직접 확인:
  [scope.ts](https://github.com/supabase/storage/blob/dcbb8eb78fd389a51ba0e6477fde0c02f6466986/src/internal/database/postgres/scope.ts)),
  `$6` = 들어온 요청 헤더 전체(허용 목록 없음, Node가 키를 소문자로) —
  [db.ts L65-76](https://github.com/supabase/storage/blob/dcbb8eb78fd389a51ba0e6477fde0c02f6466986/src/http/plugins/db.ts#L65-L76),
  [pg-connection.ts L669-670](https://github.com/supabase/storage/blob/dcbb8eb78fd389a51ba0e6477fde0c02f6466986/src/internal/database/pg-connection.ts#L669-L670).
  v0.35.0(2023-04)부터([commit 382c587](https://github.com/supabase/storage/commit/382c5870d78b3131987557a5b39d2698ca5cfd1d)).
- 서명 발급(`POST /object/sign/…`)은 `findObject` = 호출자 역할(anon/authenticated)로 RLS를 거친 SELECT
  ([object.ts L1650-1657](https://github.com/supabase/storage/blob/dcbb8eb78fd389a51ba0e6477fde0c02f6466986/src/storage/object.ts#L1650-L1657)).
  서명 URL로 받는 GET은 RLS 없이 슈퍼유저로 실행.
- **공식 문서에는 Storage 정책에서 `request.headers`를 쓰는 방법이 없다.** 미해결 이슈
  [supabase#29908](https://github.com/supabase/supabase/issues/29908): 같은 헤더 정책이 INSERT는 되는데 `download()`
  SELECT는 실패, 사용자 댓글 "signed url로 하면 된다"(관리자 답변 없음).
- 운영 게이트웨이가 `/storage/v1`에서 `x-lms-token` 사전 요청을 허용하는지 **미확인**(REST는 허용 — NOTES:249).
  Storage API 자체는 CORS를 안 하고 게이트웨이에 맡김([app.ts L32-33](https://github.com/supabase/storage/blob/dcbb8eb78fd389a51ba0e6477fde0c02f6466986/src/app.ts#L32-L33));
  자체 호스팅 Kong 설정은 요청 헤더를 그대로 허용.
- 현재 `lmsFetch`는 `/rest/v1/`에만 토큰을 붙인다(`app.js:1647-1666`) — (가)는 `/storage/v1/object/sign/teacher-resources/`까지 넓혀야 함.
- supabase-js(CDN `@2` = 2.118.0, 고정 안 됨) `createSignedUrl`의 download 옵션: `URLSearchParams` 후 전체 `encodeURI`
  → 이중 인코딩(직접 확인: [StorageFileApi.ts](https://github.com/supabase/supabase-js/blob/ecab7fb696e331b460205f233c76ef94a2e36c85/packages/core/storage-js/src/packages/StorageFileApi.ts)).
- Edge Function: `SUPABASE_SERVICE_ROLE_KEY` 기본 제공([secrets](https://supabase.com/docs/guides/functions/secrets)),
  대시보드에서 만들기 가능(버전 관리 없음, [quickstart-dashboard](https://supabase.com/docs/guides/functions/quickstart-dashboard)),
  CORS 직접 처리·허용 헤더에 `x-lms-token` 추가 필요([cors](https://supabase.com/docs/guides/functions/cors)),
  무료 50만 회/월, 사전 요청은 과금 안 됨.
- Vercel: 루트 `api/`의 파일이 함수가 됨([node-js](https://vercel.com/docs/functions/runtimes/node-js)), 파일시스템이
  rewrite보다 우선. 단 이 프로젝트 `.vercelignore`가 `package.json`을 빼므로 npm 의존성 없이 `fetch`로만 작성.

| 기준                     | (가) Storage RLS + 헤더                               | (나) Supabase Edge Function                                | (다) Vercel 서버 함수                                    |
| ------------------------ | ----------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| 권한 판정                | Storage가 정책에서 `lms_member()` 호출                | 함수가 호출자 헤더 그대로 RPC 호출 → DB가 판정             | (나)와 같음                                              |
| service role 키          | **필요 없음**                                         | Supabase 함수 환경에만(자동 제공, 저장소·브라우저 0)       | **Vercel 환경변수에 복사**(키가 두 번째 회사에 놓임)     |
| 근거 수준                | 소스로 확인, **공식 문서 없음**, 관련 미해결 이슈 1건 | 공식 문서 패턴                                             | 공식 문서 패턴                                           |
| 운영 미확인 항목         | 게이트웨이 CORS(`x-lms-token`), 운영 Storage 버전     | `verify_jwt`(옛 anon 키는 통과 예상, 키 체계 전환 시 끄기) | `/api` 동작(문서상 OK), 환경변수 설정                    |
| 사용자 운영 작업         | SQL만                                                 | SQL + 대시보드에서 함수 만들기·붙여넣기·배포(변경 때마다)  | SQL + Vercel 환경변수 + 배포 모델 변경(정적 → 함수 포함) |
| 로컬 개발·테스트         | Playwright 스텁만                                     | 함수는 로컬 Vite에서 안 돔 → 스텁                          | 같음                                                     |
| 비용·지연                | 추가 0                                                | 호출당 수백 ms(콜드 스타트), 무료 한도 넉넉                | 비슷                                                     |
| 실패할 때                | **닫힌 채로 실패**(서명 거부 → 안내 문구, 유출 없음)  | 닫힌 채로 실패                                             | 닫힌 채로 실패                                           |
| Supabase가 내부를 바꾸면 | 조용히 다운로드 불가가 될 수 있음                     | 영향 거의 없음                                             | 영향 거의 없음                                           |

**추천: (가), 단 운영 확인 2가지를 통과한 경우. 실패하면 (나)로.**
이유: 키를 어디에도 두지 않고, 3A와 같은 방식(헤더 → `lms_member()`)이며, 사용자 운영 작업이 SQL뿐이다. 실패해도
닫힌 채로 실패한다(권한 없는 사람이 받는 일은 없음). 두 안 모두 같은 RPC(`teacher_resource_file`)를 쓰도록 설계해서,
(나)로 바꿀 때는 함수 1개 + 클라이언트 10줄만 바뀐다.

확인 방법(PM 승인 필요 — 운영 Storage에 요청):

1. 작업자: `OPTIONS /storage/v1/object/sign/teacher-resources/probe.pdf` 사전 요청 1회
   (`Access-Control-Request-Headers: authorization, apikey, content-type, x-client-info, x-lms-token`) → 200·허용 헤더 확인.
   같은 요청으로 서명 GET의 CORS(Blob 방식 가능 여부)는 공개 표지 1장 `HEAD`(Origin 포함)로 확인.
2. 사용자: B SQL 실행 후, 관리자 로그인으로 작은 PDF 1개 업로드(로컬 `craDevLive(true)` 또는 대시보드) →
   선생님(role 2) 테스트 계정으로 다운로드. 운영에는 지금 role 2 계정이 없다(3A precheck: 등급 3만 1명) → 관리자가
   회원 탭에서 등급 1/2 계정 1개를 만들어야 한다(→ role 2).

### B5. SQL 초안 (전문, 멈춤 1 당시) — ⚠ 실제는 `supabase/migration.sql` "Teacher resources" 블록(10MB 등, 위 "멈춤 3" 표)

```sql
-- ============================================================================
-- Teacher resources (교사 자료실, 2026-10-29) — 1 private bucket + 1 table
-- ----------------------------------------------------------------------------
-- ADD-ONLY and safe to re-run. Needs the "LMS (Phase 3A)" block above
-- (lms_member). Level keys are the NEW keys: beginner · level-1..3.
-- Slots: plan (월간.연간교육안) · award (상장) · test (테스트, level-2/3 only).
-- Admins upload / replace / delete. Admins and LMS role 1 (branch) / 2
-- (teacher) list and download through 15-second signed URLs. Nobody reads
-- the table directly — RPCs only.
-- ============================================================================

-- Private bucket: 50 MB, PDF / xlsx / xls only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teacher-resources', 'teacher-resources', false, 52428800,
        array['application/pdf',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- One row per filled slot. storage_path is ASCII only:
-- <level>/<slot>/<upload epoch ms>.<ext>; the original (Korean) name lives in
-- file_name and becomes the download name.
create table if not exists public.teacher_resources (
  level        text not null,
  slot         text not null,
  storage_path text not null unique,
  file_name    text not null check (length(file_name) between 1 and 200),
  file_size    bigint not null check (file_size between 1 and 52428800),
  updated_at   timestamptz not null default now(),
  primary key (level, slot),
  constraint teacher_resources_slot_ok check (
    (level in ('beginner', 'level-1') and slot in ('plan', 'award'))
    or (level in ('level-2', 'level-3') and slot in ('plan', 'award', 'test'))),
  constraint teacher_resources_path_ok check (
    storage_path ~ ('^' || level || '/' || slot || '/[0-9]{13}\.(pdf|xlsx|xls)$'))
);

-- RLS on with NO policies: anon / authenticated get nothing directly.
alter table public.teacher_resources enable row level security;
revoke all on public.teacher_resources from anon, authenticated;

-- Who may list and download: an admin, or an LMS branch (1) / teacher (2).
create or replace function public.teacher_resources_allowed()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.is_admin()
      or exists (select 1 from public.lms_member() m where m.role in (1, 2));
$$;

-- The level's slots in button order with the current file (NULL file = an
-- empty slot, shown as "준비 중"). No rows for anyone else or a bad level.
create or replace function public.teacher_resources_list(p_level text)
returns table (slot text, file_name text, file_size bigint, updated_at timestamptz)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.slot, r.file_name, r.file_size, r.updated_at
    from (values ('plan', 1), ('award', 2), ('test', 3)) as s (slot, ord)
    left join public.teacher_resources r
      on r.level = p_level and r.slot = s.slot
   where public.teacher_resources_allowed()
     and p_level in ('beginner', 'level-1', 'level-2', 'level-3')
     and (s.slot <> 'test' or p_level in ('level-2', 'level-3'))
   order by s.ord;
$$;

-- One slot's file for a download: {"path", "name"}, or NULL (empty slot or
-- not allowed). The client then asks Storage for a 15-second signed URL.
create or replace function public.teacher_resource_file(p_level text, p_slot text)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object('path', r.storage_path, 'name', r.file_name)
    from public.teacher_resources r
   where r.level = p_level
     and r.slot = p_slot
     and public.teacher_resources_allowed();
$$;

-- Admin: point a slot at an object that was just uploaded. Returns the
-- REPLACED object's path (the client deletes it from Storage), or NULL.
create or replace function public.teacher_resource_set(
  p_level text, p_slot text, p_path text, p_name text, p_size bigint
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'teacher-resources' and o.name = p_path) then
    raise exception 'teacher resource: % is not in storage', p_path;
  end if;
  select r.storage_path into v_old
    from public.teacher_resources r
   where r.level = p_level and r.slot = p_slot
   for update;
  insert into public.teacher_resources as r
    (level, slot, storage_path, file_name, file_size, updated_at)
  values (p_level, p_slot, p_path, btrim(p_name), p_size, now())
  on conflict (level, slot) do update
    set storage_path = excluded.storage_path,
        file_name    = excluded.file_name,
        file_size    = excluded.file_size,
        updated_at   = now();
  return nullif(v_old, p_path);
end;
$$;

-- Admin: empty a slot. Returns the object path to delete from Storage, or NULL.
create or replace function public.teacher_resource_clear(p_level text, p_slot text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  delete from public.teacher_resources r
   where r.level = p_level and r.slot = p_slot
  returning r.storage_path into v_old;
  return v_old;
end;
$$;

-- Storage: admins write (only well-formed ASCII paths) and read.
drop policy if exists teacher_resources_admin_all on storage.objects;
create policy teacher_resources_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'teacher-resources' and public.is_admin())
  with check (
    bucket_id = 'teacher-resources'
    and public.is_admin()
    and name ~ '^(beginner|level-1|level-2|level-3)/(plan|award|test)/[0-9]{13}\.(pdf|xlsx|xls)$');

-- (가) only: an LMS branch / teacher session (x-lms-token header, which the
-- Storage API exposes as request.headers) may read = get a signed URL.
-- Drop this policy if the Edge Function route (나) is chosen instead.
drop policy if exists teacher_resources_lms_read on storage.objects;
create policy teacher_resources_lms_read on storage.objects
  for select to anon
  using (bucket_id = 'teacher-resources'
         and exists (select 1 from public.lms_member() m where m.role in (1, 2)));

-- Grants: the helper is internal; list/file are public RPCs (they answer
-- nothing to the wrong caller); set/clear are for signed-in admins.
revoke execute on function public.teacher_resources_allowed() from public, anon, authenticated;
grant execute on function public.teacher_resources_list(text) to anon, authenticated;
grant execute on function public.teacher_resource_file(text, text) to anon, authenticated;
revoke execute on function public.teacher_resource_set(text, text, text, text, bigint) from public, anon;
revoke execute on function public.teacher_resource_clear(text, text) from public, anon;
grant execute on function public.teacher_resource_set(text, text, text, text, bigint) to authenticated;
grant execute on function public.teacher_resource_clear(text, text) to authenticated;

notify pgrst, 'reload schema';
-- ==== end Teacher resources ====
```

(나)를 고를 경우 추가: `supabase/functions/teacher-resource-url/index.ts`(저장소에 원본, 사용자가 대시보드에 붙여넣기).
요청 `{level, slot}` → 호출자의 `Authorization`·`x-lms-token`을 그대로 붙여 `rpc/teacher_resource_file` 호출(판정은
DB) → 결과가 있으면 service role로 `POST /storage/v1/object/sign/teacher-resources/<path>` `{expiresIn: 15}` →
`signedURL + '&download=' + encodeURIComponent(name)` 반환. CORS 허용 출처: `https://www.cambridgereading.com`,
`https://cambridgereading.com`, `https://new-app0607.vercel.app`, 로컬 `http://127.0.0.1:5173`. 허용 헤더에 `x-lms-token`.
위 `teacher_resources_lms_read` 정책은 빼고, 클라이언트 `lmsFetch`는 넓히지 않는다.

### B6. 테스트 목록

PGlite(`npm run test:sql`, 시뮬레이션 — 셰임에 `storage.buckets`·`storage.objects` 열 추가):

| #   | 확인                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | migration.sql 전체 2회 실행 성공(재실행 안전), 버킷 행 1개(비공개·52428800·MIME 3개), 3A verify 전 행 pass 유지                                                                                               |
| 2   | anon·authenticated가 `teacher_resources` 직접 select/insert → 거부(42501)                                                                                                                                     |
| 3   | `teacher_resources_list`: 비로그인 0행, role 3 0행, role 1·2·관리자 → Beginner/Level 1 2행, Level 2/3 3행, 잘못된 레벨 0행                                                                                    |
| 4   | `teacher_resource_file`: 같은 권한 규칙, 빈 칸 NULL                                                                                                                                                           |
| 5   | `teacher_resource_set/clear`: 비관리자 42501, 관리자 성공, 교체 시 이전 경로 반환, Beginner `test` 칸·잘못된 경로·Storage에 없는 객체 → 거부                                                                  |
| 6   | `storage.objects` 정책(헤더를 `request.headers`로 흉내): role 1·2 토큰 → 자료 객체 select 가능, role 3·무토큰 → 0행, 관리자 → insert 가능(올바른 경로)·잘못된 경로 거부, 비관리자 authenticated → insert 거부 |
| 7   | A `01-rename.sql`: 옛 키 → 새 키, 새 키가 먼저 있으면 새 키 행 유지, 결과 표 before/after, 2회차 무변화, CHECK가 옛 키 쓰기 거부                                                                              |

PGlite로 **불가능**한 것과 확인 방법:

| 항목                                                  | 방법                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| 운영 Storage가 `request.headers`를 넘겨 서명이 되는지 | B4 확인 2(사용자, 선생님 테스트 계정으로 실제 다운로드)         |
| 게이트웨이 CORS(`x-lms-token`)·서명 GET CORS          | B4 확인 1(작업자 OPTIONS·HEAD, PM 승인 후)                      |
| 버킷의 50MB·MIME 제한                                 | 사용자: 관리자 화면에서 .docx·50MB 초과 업로드 → 거부 문구 확인 |
| 한글 파일 이름 다운로드                               | 사용자: 한글 이름 PDF 다운로드 → 저장된 이름 확인               |
| (나) 함수 런타임                                      | 사용자 배포 후 같은 다운로드 확인                               |

Playwright(전부 스텁, 운영 호출 0 — QA 예산 가드 유지):
버튼 표시(관리자·role 1·role 2 보임 / role 3·비로그인 숨김), 로그인·로그아웃 시 새로고침 없이 변화, 자료페이지 4개
(2·2·3·3칸, 이름 고정), 준비 중 비활성, 다운로드 성공(download 이벤트·한글 이름·새 페이지 없음), 실패 3종 문구(이동
없음), 권한 없는 직접 진입 → 월 페이지, 관리자 섹션 업로드·교체·삭제 호출 순서와 롤백, 파일 형식·크기 검사, 모바일 배치,
옛 주소 → 새 주소(4레벨 × months/content/v2/v3), QR 70개 URL·별칭 고정, 표지 70장 이동 후 해시 동일.

---

## 공통

### C1. 3A 운영 SQL과의 관계

- A의 데이터 SQL은 `migration.sql`에 넣지 않으므로 3A 2단계와 무관.
- B 블록이 `migration.sql`에 들어간 뒤 3A 2단계(파일 전체)를 실행하면 B도 함께 실행된다. **안전하다**: 전부 추가만
  (새 버킷·표·함수·정책), 기존 표·함수·정책을 바꾸지 않음, 옛 코드는 이것들을 부르지 않음. 3A precheck(회원·LMS 객체만
  읽음)·verify-3a(LMS 동작만 확인, 함수 전체 목록을 세지 않음)의 기대값은 바뀌지 않는다 — `test:sql`이 전체 파일 2회 +
  verify-3a를 돌리므로 구현 때 자동 확인된다.
- 단, B 블록이 운영에서 예상 밖 오류(예: `storage.buckets` 권한)를 내면 3A 2단계가 같이 멈춘다 → 권장: **3A는 지금
  파일(`fe991f8`) 그대로 먼저 끝내고**, B는 나중에 파일 전체를 한 번 더 실행(재실행 안전).

### C2. 권장 운영 순서 (3A → A → B)

| 순서 | 누가          | 무엇                                                                                     |
| ---- | ------------- | ---------------------------------------------------------------------------------------- |
| 1    | 사용자·작업자 | 3A 1~5단계(지금 파일 그대로) → 멈춤 2 보고 완성                                          |
| 2    | PM            | 3A "푸시"                                                                                |
| 3    | 사용자        | B: `migration.sql` 전체 재실행 → `Success`. 버킷 확인 쿼리 1줄                           |
| 4    | 작업자        | (가) 확인 1: OPTIONS·HEAD (PM 승인 후)                                                   |
| 5    | 사용자        | 회원 탭에서 등급 1/2 테스트 계정 1개(→ role 2), (가) 확인 2: 작은 PDF 업로드·다운로드    |
| 6    | PM            | A+B "푸시" (A 호환 읽기 포함, 이때 DB는 아직 옛 키)                                      |
| 7    | 사용자        | `supabase/levels/00-precheck.sql` → `01-rename.sql` → 00 재실행("old" 줄 없음)           |
| 8    | 사용자        | 실제 자료 파일 10개 업로드, 운영 확인(관리자·선생님·학생·비로그인), 월 1회 이그레스 확인 |
| 9    | 작업자        | 호환 읽기 코드 삭제 커밋(다음 푸시 때)                                                   |

(나)로 갈 경우 3과 6 사이에 "사용자: 대시보드에서 Edge Function 만들기·배포"가 들어간다.

### C3. 예상 변경 파일

| 작업 | 파일                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | `video-source.js`, `app.js`, `play.js`, `background-editor.js`, `index.html`, `board.css`, `styles.css`, `play.css`, `scripts/make-qr-list.mjs`, `scripts/sync-covers.mjs`, `assets/covers/**`(70장 이동), `assets/l1-march-book-{1,2}.jpg`(이름 변경), `tests/{smoke,play,board-visual,covers,qr-list}.spec.js`, 새 `tests/levels.spec.js`, 새 `supabase/levels/{README.md,00-precheck.sql,01-rename.sql}`, `tests/lms-sql.spec.js`(rename SQL 검증), `PRODUCT_SPEC.md`, `NOTES.md`, `PROJECT_MEMORY.md`, 이 설계 문서 |
| B    | `index.html`, 새 `teacher-resources.js`, `app.js`(표시 토글·라우트·`lmsFetch` 범위), `styles.css`, `package.json`(lint·format 목록), `supabase/migration.sql`(B 블록), `tests/lms-sql.spec.js`, 새 `tests/teacher-resources.spec.js`, `docs/superpowers/plans/2026-10-22-tps-requests-plan.md`·`specs/2026-10-22-tps-requests-review.md`(Phase 4 취소), `PRODUCT_SPEC.md`, `NOTES.md`, `PROJECT_MEMORY.md`, (나)면 `supabase/functions/teacher-resource-url/index.ts`                                                   |

### C4. 위험 요소

| #   | 위험                                                                                                                                                                                                                                                                         | 대응                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | **이그레스**: 서명 URL은 매번 토큰이 달라 CDN 캐시가 안 됨 → 다운로드 = 미캐시 이그레스(무료 5GB/월, [egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)). 유예기간 소진 — 초과 즉시 전 서비스 402. 예: 선생님 200명 × 3파일 × 10MB = 6GB/월 → 초과 | 파일을 작게(관리자 화면 10MB 경고), 월 1회 Usage 확인. **선택**: 회원당 하루 다운로드 횟수 제한(PM 결정) |
| 2   | (가)가 문서화 안 된 내부 동작에 기대고, 관련 이슈가 열려 있음                                                                                                                                                                                                                | 운영 확인 2가지, 실패 시 (나). 실패해도 닫힌 채로 실패                                                   |
| 3   | supabase-js CDN `@2` 고정 안 됨 + download 이중 인코딩                                                                                                                                                                                                                       | download 옵션 안 씀(Blob 또는 직접 붙이기). 버전 고정은 이번 범위 밖(별도 제안)                          |
| 4   | A SQL을 코드보다 먼저 실행 → 빈 화면                                                                                                                                                                                                                                         | 호환 읽기(③) + README 순서 + CHECK 제약                                                                  |
| 5   | 표지 업로드 경로 충돌(A2 #7)                                                                                                                                                                                                                                                 | `levels/` 접두어, 옛 객체는 URL로 계속 사용                                                              |
| 6   | 픽셀 기준선(교재 보드 정확 비교)                                                                                                                                                                                                                                             | A는 화면 변화 0이 합격 기준                                                                              |
| 7   | 운영에 role 2 계정이 없음                                                                                                                                                                                                                                                    | C2 순서 5에서 사용자가 생성                                                                              |
| 8   | 서명 요청에 토큰 헤더가 실림 → API 로그 노출 가능성은 3A REST와 동일                                                                                                                                                                                                         | 3A 4단계(로그 확인) 결과를 그대로 적용                                                                   |
