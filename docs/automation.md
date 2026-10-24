# Claude Code 자동화 진단 — new-app

진단: 2026-10-23 (`claude-code-setup:claude-automation-recommender`, 전역 규칙 7절 1회 실행).
스택: 정적 SPA(Vanilla HTML/CSS/JS) + Vite(dev) + Playwright + Prettier/ESLint + Supabase(SQL Editor로 운영 반영)

| 항목                                           | 종류         | 상태      | 위치 또는 이유                                                                                                                                                                                                                   |
| ---------------------------------------------- | ------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 자동 검증 `npm run check`                      | 검증         | 기존 유지 | `.claude/verify.json` (전역 Stop 훅이 실행)                                                                                                                                                                                      |
| 인수인계 문서 갱신 알림                        | 훅(Stop)     | 기존 유지 | `.claude/settings.json`                                                                                                                                                                                                          |
| Prettier 자동 포맷(편집 직후)                  | 훅           | 적용      | `.claude/settings.json` PostToolUse `Edit\|Write` — 프로젝트 안의 `.js/.mjs/.css/.html/.md`만(2026-10-24: 프로젝트 밖 파일 제외 추가), `worker-briefs`·`.claude`·`node_modules`·`test-results`·`archive` 제외. `check` 실패 예방 |
| `supabase-sql-change`                          | 스킬         | 적용      | `.claude/skills/supabase-sql-change/SKILL.md` — SQL 변경 절차(추가만·재실행 안전·PGlite 검증·운영은 사용자 실행)                                                                                                                 |
| `rls-security-reviewer`                        | 서브에이전트 | 적용      | `.claude/agents/rls-security-reviewer.md` — RLS·SECURITY DEFINER·권한·로그인 코드 읽기 전용 검토(Phase 3.2~3.5)                                                                                                                  |
| `cutout-rig-animation`·`word-reveal-animation` | 스킬         | 기존 유지 | `.claude/skills/`                                                                                                                                                                                                                |
| `git push` 확인 훅(PreToolUse)                 | 훅           | 보류      | 푸시 관련 훅은 규칙상 보류. 2026-10-24 PM 지시로 로컬 자동 허용 `Bash(git push *)`·`PowerShell(git push *)` 삭제 → 푸시는 매번 확인 후(PM이 "푸시"라고 할 때만)                                                                  |
| Supabase MCP                                   | MCP          | 보류      | 액세스 토큰이 필요하고 운영 DB 직접 접근이 된다(이 프로젝트는 운영 SQL을 사용자가 실행). 쓰려면 사용자가 직접: `claude mcp add supabase -- npx -y @supabase/mcp-server-supabase --read-only --project-ref <ref>` + 토큰 환경변수 |
| context7 MCP(라이브러리 문서)                  | MCP          | 보류      | 키는 없어도 되지만 질의가 외부로 전송된다(외부 전송 → 보류). 쓰려면: `claude mcp add context7 -- npx -y @upstash/context7-mcp`                                                                                                   |
| Playwright MCP                                 | MCP          | 보류      | 이미 Playwright 테스트 + 브라우저 확장(Edge)이 있어 중복                                                                                                                                                                         |
| 세션 종료 명령                                 | 명령         | 기존 유지 | 전역 `session-close`("세션 종료"·`/session-close`). 새로 만들지 않음                                                                                                                                                             |

## 확인 필요

- Supabase MCP를 읽기 전용으로라도 쓸지(현재 방침: 운영 DB는 사용자가 SQL Editor로만).
