# LMS SQL 1차 (Phase 3A) — 운영 반영 순서

운영 DB에는 **사용자가 Supabase SQL Editor에서 직접** 실행한다(워커는 운영 DB에 접속하지 않는다).
열기: Supabase 대시보드 → 프로젝트 → **SQL Editor** → **New query** → 파일 내용 전체 붙여넣기 → **Run**.
SQL Editor는 마지막 결과 표만 보여 준다. 여기 SQL 파일은 모두 결과가 표 한 개로 나오게 만들어 두었다.

실제로 한 순서(2026-10-29~30, 운영 결과 = 마지막 열). 다른 프로젝트·재구축 때도 이 순서를 따른다.

| 순서 | 누가   | 무엇                                                                                                                                               | 기대 결과                                                                                                                                                                                         | 운영 결과                                                                                                                                         |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 사용자 | `supabase/lms/00-precheck.sql` 실행 (읽기 전용)                                                                                                    | 표 14행. 3번 `extensions`, 4번 `true`, 5번 `1`, 8번 `1`, 11번 `0`, 14번 빈칸. 표 전체를 워커에게 붙여넣기                                                                                         | 10/29 통과                                                                                                                                        |
| 2    | 사용자 | (워커가 "문제없음"이라고 하면) `supabase/migration.sql` **파일 전체** 실행                                                                         | `Success. No rows returned`. 재실행 안전(기존 부분은 이미 운영과 같고, 새로 추가되는 것은 LMS·교사 자료실 블록뿐). 실행 뒤 precheck 14번 = LMS 객체 목록                                          | 10/29 통과                                                                                                                                        |
| 3    | 워커   | 헤더 탐침: `lms_probe_headers`를 anon 키로 curl 3회(기본 / 가짜 IP 헤더 / `x-lms-token`) + CORS 사전 요청 1회                                      | 어느 헤더가 위조 불가한 실제 IP인지 판정 → 필요하면 `lms_client_ip()` 패치 SQL 1개를 사용자에게 전달                                                                                              | **패치 불필요**(PM 결정 D20): `CF-Connecting-IP`를 넣은 요청은 Cloudflare 엣지가 403 `error code: 1000`으로 막음 → `cf-connecting-ip`만 믿으면 됨 |
| 4    | 사용자 | 대시보드 **Logs → API Gateway** 에서 3번 시각의 요청과 `probe-…` 값 검색                                                                           | 탐침 요청이 보이는지, 요청 기록(Raw JSON)에 토큰 원문이 있는지 워커에게 알려 주기(토큰은 해시로 저장하므로 정보성 확인)                                                                           | **토큰 원문 없음**(D26): 탐침 3건(POST 2·OPTIONS 1) 기록, 가짜 IP 요청 기록 없음, Raw JSON에서 토큰 헤더 이름·값 0건 → 대책 없음                  |
| 5    | 사용자 | `supabase/lms/verify-3a.sql` 실행                                                                                                                  | 116행. 맨 위 `SUMMARY` `115 / 115`·`pass = true`, 모든 행 `pass = true`, 마지막 `trace` 행 `branches=0 members=0 classes=0 attempts=0`. 표 전체를 워커에게 붙여넣기                               | 1차 `114 / 115`: 114번 = `ERROR` `42725 function public.create_member(unknown, unknown, smallint, unknown) is not unique` → 7·8단계               |
| 6    | 사용자 | `supabase/lms/verify-teacher-resources.sql` 실행 (읽기 전용, 교사 자료실 블록 — verify-3a는 이 블록을 안 봄)                                       | 24행. `SUMMARY` `22 / 22`·`true`, 1~22번 `true`, 23번 `info` = `backgrounds_admin_write, backgrounds_public_read, covers_admin_write, covers_public_read, teacher_resources_admin_all`(pass 빈칸) | 10/30 통과                                                                                                                                        |
| 7    | 사용자 | **5단계 114번 행이 위 42725일 때만** `supabase/lms/fix-create-member-overload.sql` 실행 — 저장소에 없던 5인자 `create_member` 오버로드 하나만 삭제 | 표 1행 `1 \| create_member(text, text, smallint, text) \| true`. 재실행 안전(같은 결과)                                                                                                           | 10/30 통과(운영에만 있던 `create_member(text, text, smallint, text, jsonb)` 삭제)                                                                 |
| 8    | 사용자 | `supabase/lms/verify-3a.sql` 재실행                                                                                                                | 5단계 기대 결과 그대로. 114번 = `compat` `old admin tab: create_member / update_member (as an admin)` · `role=3 hq=true → grade1: role=2 pwchanged=true`                                          | 10/30 통과: 116행, `115 / 115`, 4번 `total=1 role2=0 role3=1`, trace 0                                                                            |

## 지켜야 할 것

- 1번 결과의 11번(정규화 후 충돌하는 아이디)이 `0`이 아니거나 5~8번 회원 수가 예상과 다르면 **2번을 하지 말고** 멈춘다.
- 2번에서 오류가 나면 오류 문구를 그대로 워커에게 붙여넣는다(부분 실행돼도 다시 전체 실행하면 된다).
- 5·8단계 `verify-3a.sql`은 테스트용 지사·계정(`zz-v…`, `검증지사…`)을 만들었다가 **전부 되돌린다**. 마지막 `trace` 행이
  `branches=0 members=0 classes=0 attempts=0`이면 운영에 흔적이 없다는 뜻이다.
- `false`·`ERROR` 행이 있으면 고치지 말고 표 전체를 워커에게 붙여넣는다. 7단계는 그 원인이 확인된 경우에만 쓴다.
- 7단계는 `DROP` 하나뿐이다(CASCADE 없음 — 이 함수에 기대는 객체가 있으면 실패하고 아무것도 안 바뀐다). 저장소의
  `create_member(text, text, smallint, text)`, `members.profile` 열(운영에만 있음, 3.5에서 결정), 다른 함수는 건드리지 않는다.
  SQL Editor가 파괴적 작업 확인 창을 띄우면 진행한다.
- 결과 표에는 비밀번호·해시·토큰 원문이 나오지 않는다(토큰은 `token=43ch`처럼 길이만).
- 클라이언트(3.2 로그인 화면) 푸시는 **2번이 끝난 뒤에만** 한다. 순서가 바뀌면 로그인 요청이 404로 실패한다.

## 파일

- `00-precheck.sql` — 읽기 전용 현황(회원 수·아이디 규칙·충돌·pgcrypto·normalize).
- `../migration.sql` — 맨 끝 "LMS (Phase 3A)" 블록이 이번 추가분(지사·역할·반·세션·로그인 RPC·RLS).
- `verify-3a.sql` — anon 역할 + `x-lms-token` 헤더로 브라우저 호출을 흉내 내 로그인·세션·RLS·잠금·구 RPC 호환을
  확인하고 전부 되돌린다.
- `verify-teacher-resources.sql` — 읽기 전용(카탈로그 select 하나). 교사 자료실 버킷·테이블·RPC 실행 권한·Storage 정책.
- `fix-create-member-overload.sql` — 운영에만 있던 `create_member` 5인자 오버로드(`p_profile jsonb` 기본값) 삭제.
  기본값 있는 인자가 붙은 오버로드는 기존 4인자 호출을 모호하게 만든다(SQL `42725`, 관리자 '회원 저장' REST `PGRST203`).
- 로컬 검증: `npm.cmd run test:sql` (PGlite 임베디드 Postgres, 운영 접속 없음) — `tests/lms-sql.spec.js`(운영의 오버로드
  재현 → 42725 → 7단계 → 통과 포함), `tests/teacher-resources-sql.spec.js`.

## 교사 자료실 확인용 선생님 테스트 계정 (2026-10-29)

`teacher-test-account.sql` — 운영에 role 2(선생님)·지사 hq 계정 `tps-teacher-test`를 만든다(교사 자료실 (가) 확인 2:
실제 다운로드). **3A 운영 반영(위 2번) 뒤, 교사 자료실 B SQL(`migration.sql` 재실행) 뒤에** 실행한다.

- **아무도 비밀번호를 입력하지 않는다.** 서버가 12자 무작위 비밀번호를 만들어 결과 표의 `password` 칸에 **한 번만**
  보여 준다. SQL 문장에 비밀번호가 없으므로 SQL Editor 기록·오류 로그·쿼리 통계에 남지 않는다(보안 검토 반영).
  그 자리에서 확인에만 쓰고 파일·문서·채팅·커밋에 옮기지 않는다.
- 기대 결과: 표 1줄 `tps-teacher-test | 2 | hq | true | 0 | (비밀번호)`. 다시 실행하면 새 비밀번호(이전 것은 무효)·
  재활성화·세션 종료.
- ⚠ 아이디가 공개 저장소에 있다 → **확인이 끝나면 바로** 파일 맨 아래 한 줄
  (`delete from public.members where id = 'tps-teacher-test';`)만 따로 실행해 지운다.
- 대안: 관리자 화면 '회원' 탭에서 등급 2로 만들어도 role 2·hq가 된다.
