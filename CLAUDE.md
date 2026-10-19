# CLAUDE.md — Index

Auto-loaded entry point. **This is a map, not the detail** — follow the pointers below.

Kindergarten English learning **static SPA** (Cambridge Reading Adventures): Vanilla
HTML/CSS/JS + Vite (dev) + Playwright. Core files: `index.html`, `styles.css`, `app.js`.
(Originally built in Codex; harness adapted for Claude Code.)

## Documents — read what the task needs

| Doc                              | Holds                                                                    | Read when                                 |
| -------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| `PROJECT_MEMORY.md`              | Live status, workflow, infra, backlog, open questions                    | **First, every session** (to resume)      |
| `docs/PROJECT_MEMORY-archive.md` | Past history moved out of PROJECT_MEMORY (verbatim)                      | Only when digging into history            |
| `NOTES.md`                       | Engineering gotchas & past mistakes to avoid                             | Before fonts / header / deploy / git work |
| `PRODUCT_SPEC.md`                | Product scope, IA, navigation, main-page content, data model, acceptance | Building features                         |
| `DESIGN.md`                      | Visual system (colors, type, components)                                 | Any visual work                           |
| `PLATFORM_ROADMAP.md`            | Long-term login/admin/Supabase/app platform                              | Only for the future rebuild               |
| `README.md`                      | Short public-facing repo readme                                          | —                                         |

## Must-know (details are in the docs above)

- **Commands:** `npm.cmd run dev` (local) · `npm.cmd run qa` (verify = checks + Playwright).
  On Windows PowerShell use `npm.cmd`. `qa` also runs Prettier over `*.md`.
- **Accounts (outward actions):** GitHub + Vercel are **`crspiegel` / crspiegel@gmail.com**
  (NOT any `wechange2023*`). Live site: https://new-app0607.vercel.app
  Claude Code의 Vercel 플러그인 도구는 이 프로젝트와 다른 계정에 연결되어 있으므로 이 프로젝트에는
  쓰지 않는다.
- **Deploy:** static, **no build** (see `NOTES.md`). Flow = edit → `npm.cmd run qa` → commit →
  `git push` (Vercel auto-deploys). Commit/deploy **only when the user asks**.
- **Core constraints:** Mon-Fri 5-column calendar only; English UI; no italics; child-friendly.
  (Full detail in `PRODUCT_SPEC.md` / `DESIGN.md`.)
- **Verify, don't assume** — especially fonts and layout. See `NOTES.md`.
- After meaningful work, update `PROJECT_MEMORY.md` (status) and `NOTES.md` (any new gotcha).
- **Auto-verify:** `.claude/verify.json` runs `npm run check` (assets + lint + Prettier, ~5s) via the
  Stop hook. Playwright E2E (`npm run qa`) is NOT in it — run it by hand before every commit.

## Superpowers 연동

- `PRODUCT_SPEC.md`를 승인된 요구사항으로 본다. brainstorming에서 요구사항을 다시 캐묻지 않고
  구현 방법에 집중한다.
- 화면 작업은 `DESIGN.md`를 따르고, 함정은 `NOTES.md`를 따른다.
- 작은 수정(오타, 한두 줄, 설정값)은 Superpowers 절차를 생략하고 바로 처리한다.
- 수용 기준은 `PRODUCT_SPEC.md`의 **Acceptance Checklist**다. 커밋 전에 `npm.cmd run qa`로 확인한다.

## 세션 종료 정보

- 세션을 마치는 명령은 **"세션 종료"**와 **`/session-close`** 두 가지다.
- **기록:** `.claude/WORKLOG.md`에 항목을 추가하고(최신이 위, 로컬 전용), `PROJECT_MEMORY.md`의 상태를
  갱신하고, 새 함정은 `NOTES.md`에 적는다. WORKLOG는 세션 시작 훅이 "열린 과제 + 최근 2개 항목"을
  **6,000자까지만** 읽으므로 그 안에 들게 쓴다.
- **백업:** 커밋·푸시는 하지 않는다. 이 저장소는 push하면 바로 운영 사이트에 배포되므로 커밋·푸시는
  사용자가 요청할 때만 한다.
