# 페이지 배경 편집기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 페이지1(월그리드)·페이지2(요일그리드)의 body+footer 배경을 실제
페이지 위에서 WYSIWYG로 편집(전체 배경이미지 + 투명 PNG 요소 배치)하고, 페이지2는
레벨 기본값 + 월별 오버라이드로 저장한다. 스펙:
`docs/superpowers/specs/2026-07-21-page-background-editor-design.md`

**Architecture:** 뷰어(레이어 렌더링·캐시·hydrate)는 `app.js`에 최소 추가, 편집기는
새 파일 `background-editor.js`(클래식 스크립트, app.js 뒤 로드 → 전역 렉시컬 스코프
공유). 배경 레이어 `#pageBgLayer`는 `.app-shell`의 absolute 자식(z-index 1)으로,
불투명 sticky 토프바(z-index 20)가 위를 덮어 헤더 제외가 자동 성립. 배경 활성 시
main/footer의 틴트를 투명화하고 틴트를 레이어가 대신 칠해 이음새 없는 body+footer
커버를 만든다. 데이터는 Supabase 테이블 `page_backgrounds` + Storage 버킷
`backgrounds`.

**Tech Stack:** Vanilla JS (클래식 스크립트, 프레임워크 없음) · Supabase JS v2
(`window.supabase`, 전역 `sb`) · Playwright (`tests/smoke.spec.js`) · Vite dev 서버

## Global Constraints

- Windows PowerShell에서는 `npm.cmd` 사용 (`npm run` 아님).
- 검증 명령: `npm.cmd run qa` (checks + Playwright). 빌드 없음 (정적 배포).
- `git push`는 사용자가 요청할 때만. 태스크별 로컬 커밋은 수행.
- 커밋 메시지는 PowerShell 큰따옴표 함정 회피를 위해 here-string(`@'...'@`) 사용
  (NOTES.md 참조). 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 사용자 화면 UI는 영어, 관리자 UI는 한국어(기존 관례). 이탤릭 금지.
- 레벨 내부 키는 `"Level 1".."Level 4"` (화면 표시는 `levelLabel()`로 변환).
- "레벨 기본값" 행은 `month = ''` (빈 문자열)로 저장한다 — 스펙의 `null` 표기는
  Task 1에서 `''`로 정정 (Supabase upsert `onConflict`가 표현식 인덱스를 지원하지
  않아 PK `(level, page, month)`를 쓰기 위함. 의미 동일).
- 배경 미설정 페이지는 기존과 픽셀 단위 동일해야 한다.
- 코드 스타일: 2-space, 큰따옴표, 기존 주석 밀도를 따름.

## 파일 구조

| 파일 | 역할 |
| --- | --- |
| `supabase/migration.sql` (수정) | `page_backgrounds` 테이블 + RLS + `backgrounds` 버킷 정책 추가 |
| `app.js` (수정) | 뷰어: `bgCache`/`getBackgroundEntry`/`applyPageBackground`/`hydrateBackgrounds`, `showScreen` 훅, `window.craBg` 브리지 |
| `background-editor.js` (신규) | 편집기 전체: 진입/종료, 라이브러리, 캔버스 조작, 저장, 네비 가드, 관리자 바로가기 |
| `index.html` (수정) | FAB 버튼 + 편집 패널 마크업, `#adminViewContent` 바로가기 버튼, `<script src="background-editor.js">` |
| `styles.css` (수정, 끝에 추가) | 레이어/스태킹/투명화 오버라이드 + 편집기 UI |
| `tests/smoke.spec.js` (수정) | 방문자 무변화 보증 + 시드 렌더링 테스트 |
| `docs/superpowers/specs/2026-07-21-page-background-editor-design.md` (수정) | `null` → `''` 표기 정정 |

---

### Task 1: Supabase 스키마 (테이블 + 버킷 정책) & 스펙 정정

**Files:**

- Modify: `supabase/migration.sql` (파일 끝, 250행 근처 "AFTER running" 블록 **앞**에 삽입)
- Modify: `docs/superpowers/specs/2026-07-21-page-background-editor-design.md`

**Interfaces:**

- Produces: 테이블 `public.page_backgrounds(level text, page text, month text not null default '', data jsonb, updated_at timestamptz)` PK `(level, page, month)`. 읽기 공개 / 쓰기 admin. Storage 버킷 `backgrounds` 읽기 공개 / 쓰기 admin.
- Consumes: 기존 `public.is_admin()` 함수 (migration.sql:64-72).

- [ ] **Step 1: migration.sql에 스키마 추가**

`supabase/migration.sql`의 `-- AFTER running the above:` 주석 블록(247행) 바로 앞에 삽입:

```sql
-- ---------------------------------------------------------------------------
-- Page backgrounds (페이지1/페이지2 body+footer 배경, 관리자 편집)
--   One row per (level, page, month). page = 'page1' | 'page2'.
--   month = '' means "level default" (page1 rows always use '').
--   A month row REPLACES the level default entirely (no merging).
--   data: { "full": "<public url>" | null,
--           "elements": [ { "src", "x", "y", "w", "r", "fx", "z" } ] }
--   x/y = element center as % of the layer, w = width % of the layer,
--   r = rotation deg, fx = horizontal flip, z = stacking order.
-- ---------------------------------------------------------------------------
create table if not exists public.page_backgrounds (
  level      text not null,
  page       text not null check (page in ('page1', 'page2')),
  month      text not null default '',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (level, page, month)
);

alter table public.page_backgrounds enable row level security;

drop policy if exists page_backgrounds_read on public.page_backgrounds;
create policy page_backgrounds_read on public.page_backgrounds
  for select using (true);

drop policy if exists page_backgrounds_write on public.page_backgrounds;
create policy page_backgrounds_write on public.page_backgrounds
  for all using (public.is_admin()) with check (public.is_admin());

-- Storage policies for the "backgrounds" bucket
-- (Create the bucket first in the Dashboard: Storage → New bucket → name
--  "backgrounds" → PUBLIC. Then these policies allow public read + admin writes.)
drop policy if exists backgrounds_public_read on storage.objects;
create policy backgrounds_public_read on storage.objects
  for select using (bucket_id = 'backgrounds');

drop policy if exists backgrounds_admin_write on storage.objects;
create policy backgrounds_admin_write on storage.objects
  for all
  using (bucket_id = 'backgrounds' and public.is_admin())
  with check (bucket_id = 'backgrounds' and public.is_admin());
```

- [ ] **Step 2: 스펙 문서의 null 표기 정정**

`docs/superpowers/specs/2026-07-21-page-background-editor-design.md`에서:

- `월(비어있으면 "레벨 기본값")` → 그대로 두되, `` `month`(text, null = 레벨 기본값) `` 를
  `` `month`(text, `''` = 레벨 기본값) `` 로 변경.
- `유니크: (level, page, coalesce(month, ''))` 문장을
  `기본키: (level, page, month) — month는 '' 기본값의 not null 컬럼 (Supabase upsert onConflict 호환)` 으로 변경.

- [ ] **Step 3: SQL 문법 검증 (재실행 안전성 육안 확인)**

`if not exists` / `drop policy if exists` 패턴이 파일 전체 관례와 일치하는지 확인.
로컬 Postgres가 없으므로 실행 검증은 사용자 대시보드 실행 시점에 이뤄진다.

- [ ] **Step 4: 사용자 안내 메시지 준비 (플래그)**

이 태스크 완료 보고에 반드시 포함: **"Supabase 대시보드에서 (1) Storage → New
bucket → `backgrounds` → PUBLIC 생성, (2) SQL Editor에서 migration.sql의 새 섹션
실행이 필요합니다"** — 이 두 가지는 사용자만 할 수 있는 수동 단계.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migration.sql "docs/superpowers/specs/2026-07-21-page-background-editor-design.md"
git commit -m @'
feat: page_backgrounds 테이블 + backgrounds 버킷 정책 (배경 편집기 1/8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 2: 뷰어 — 배경 레이어 렌더링 + 캐시 + hydrate

**Files:**

- Modify: `app.js` (4곳: ~180행 뒤 신규 섹션, `showScreen` 230-253행, 부트 IIFE 2181-2195행, 파일 끝)
- Modify: `styles.css` (파일 끝에 추가)
- Test: `tests/smoke.spec.js`

**Interfaces:**

- Consumes: `state`, `screens`, `sb`, `contentCache` 패턴 (app.js 기존).
- Produces: 전역 `bgCache`(객체, 키 `${level}||${page}||${month||""}`),
  `bgKey(level, page, month)`, `getBackgroundEntry(level, page, month)` (월 행 →
  기본값 행 → null), `applyPageBackground(screenName)`, `async hydrateBackgrounds()`,
  `window.craBg = { bgCache, bgKey, getBackgroundEntry, applyPageBackground }`,
  `document.body.dataset.screen`(현재 스크린 이름), body 클래스 `page-bg-active`,
  DOM `#pageBgLayer` > `.page-bg-full` + `img.page-bg-el`.
  CSS 좌표 계약: 요소는 `left/top = x/y %`(중심 기준, `translate(-50%,-50%)`),
  `width = w %`, `rotate(r deg)`, `scaleX(fx ? -1 : 1)`.

- [ ] **Step 1: 실패하는 Playwright 테스트 작성**

`tests/smoke.spec.js` 끝에 추가:

```js
test("page background layer stays inert for visitors", async ({ page }) => {
  await page.goto("/#content/Level%201/March");
  await expect(page.locator("#contentScreen")).toHaveClass(/screen-active/);
  // No saved background → body class off, layer empty, page unchanged.
  await expect(page.locator("body")).not.toHaveClass(/page-bg-active/);
  await expect(page.locator("#pageBgLayer")).toHaveCount(1);
  await expect(page.locator("#pageBgLayer .page-bg-el")).toHaveCount(0);
});

test("seeded background renders full image and elements, month row wins", async ({
  page,
}) => {
  await page.goto("/#content/Level%201/March");
  await page.evaluate(() => {
    const { bgCache, bgKey, applyPageBackground } = window.craBg;
    bgCache[bgKey("Level 1", "page2", "")] = {
      full: "assets/l1-march-book-1.jpg",
      elements: [
        { src: "assets/l1-march-book-2.jpg", x: 20, y: 30, w: 10, r: 15, fx: true, z: 0 },
      ],
    };
    applyPageBackground("content");
  });
  await expect(page.locator("body")).toHaveClass(/page-bg-active/);
  await expect(page.locator("#pageBgLayer .page-bg-full")).toHaveCount(1);
  await expect(page.locator("#pageBgLayer .page-bg-el")).toHaveCount(1);
  // A month row REPLACES the level default entirely (no merging).
  await page.evaluate(() => {
    const { bgCache, bgKey, applyPageBackground } = window.craBg;
    bgCache[bgKey("Level 1", "page2", "March")] = { full: null, elements: [] };
    applyPageBackground("content");
  });
  await expect(page.locator("body")).not.toHaveClass(/page-bg-active/);
  await expect(page.locator("#pageBgLayer .page-bg-el")).toHaveCount(0);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm.cmd run qa`
Expected: 새 테스트 2개 FAIL (`#pageBgLayer` 없음 / `window.craBg` undefined). 기존 3개 PASS 유지.

- [ ] **Step 3: app.js 뷰어 구현**

(a) `getCover()`(180행) 바로 뒤에 삽입:

```js
/* ---- Page backgrounds (페이지1 = month grid, 페이지2 = weekday board) ---
   Admin-composed decorative backgrounds for the body+footer area of the two
   level pages. Rows live in Supabase page_backgrounds keyed (level, page,
   month) where month '' = the level-wide default; a month row REPLACES the
   default entirely (no merging). data: { full, elements: [{ src, x, y, w, r,
   fx, z }] } — x/y = center %, w = width % of the layer, r = deg, fx = flip.
   The layer paints the level tint itself while active so the main/footer
   tints can go transparent without a visible change (seamless body+footer). */
const bgCache = {};
function bgKey(level, page, month) {
  return `${level}||${page}||${month || ""}`;
}
function getBackgroundEntry(level, page, month) {
  return (
    bgCache[bgKey(level, page, month)] ||
    bgCache[bgKey(level, page, "")] ||
    null
  );
}

const appShell = document.querySelector(".app-shell");
// Which screens have an editable background, and their storage page key.
const SCREEN_BG_PAGE = { months: "page1", content: "page2" };

function ensureBgLayer() {
  let layer = document.querySelector("#pageBgLayer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "pageBgLayer";
    layer.className = "page-bg-layer";
    layer.setAttribute("aria-hidden", "true");
    appShell.append(layer);
  }
  return layer;
}

function applyPageBackground(screenName) {
  const layer = ensureBgLayer();
  const page = SCREEN_BG_PAGE[screenName];
  const entry = page
    ? getBackgroundEntry(
        state.level,
        page,
        page === "page2" ? state.month : "",
      )
    : null;
  layer.innerHTML = "";
  const active = Boolean(
    entry && (entry.full || (entry.elements && entry.elements.length)),
  );
  document.body.classList.toggle("page-bg-active", active);
  if (!active) return;
  if (entry.full) {
    const full = document.createElement("div");
    full.className = "page-bg-full";
    full.style.backgroundImage = `url("${entry.full}")`;
    layer.append(full);
  }
  [...(entry.elements || [])]
    .sort((a, b) => (a.z || 0) - (b.z || 0))
    .forEach((item) => {
      const img = document.createElement("img");
      img.className = "page-bg-el";
      img.alt = "";
      img.draggable = false;
      img.src = item.src;
      img.style.left = `${item.x}%`;
      img.style.top = `${item.y}%`;
      img.style.width = `${item.w}%`;
      img.style.transform = `translate(-50%, -50%) rotate(${item.r || 0}deg) scaleX(${item.fx ? -1 : 1})`;
      // A deleted library file must never break the page — drop just the img.
      img.addEventListener("error", () => img.remove());
      layer.append(img);
    });
}
```

(b) `showScreen()` 수정 — 두 경로 모두에 훅 (230-253행):

`if (!screens[name])` 이른 반환 분기 안, `screens.home.classList.add(...)` 뒤 **`return;` 문 앞**에:

```js
    document.body.dataset.screen = "home";
    applyPageBackground("home");
```

함수 끝 `screens[name].classList.add("screen-active");` 바로 뒤에:

```js
  document.body.dataset.screen = name;
  applyPageBackground(name);
```

(c) `hydrateContent()`(1459-1470행) 바로 뒤에 삽입:

```js
// Load every page_backgrounds row so the two level pages paint saved
// backgrounds. Mirrors hydrateContent: fetch-all into the cache, then
// repaint whichever screen is showing.
async function hydrateBackgrounds() {
  if (!sb) return;
  const { data, error } = await sb.from("page_backgrounds").select("*");
  if (error || !data) return;
  data.forEach((row) => {
    bgCache[bgKey(row.level, row.page, row.month)] = row.data || {};
  });
  const active = Object.entries(screens).find(([, el]) =>
    el.classList.contains("screen-active"),
  );
  if (active) applyPageBackground(active[0]);
}
```

(d) 부트 IIFE(2181행)의 `await hydrateContent();` 다음 줄에:

```js
  await hydrateBackgrounds();
```

(e) 파일 맨 끝(부트 IIFE 뒤)에:

```js
// Bridge for background-editor.js (separate classic script) and Playwright.
window.craBg = { bgCache, bgKey, getBackgroundEntry, applyPageBackground };
```

- [ ] **Step 4: styles.css 파일 끝에 추가**

```css
/* ==== Page background layer (admin-composed, 페이지1/페이지2) ============
   #pageBgLayer sits above the body/footer tints but below all content; the
   opaque sticky topbar (z-index 20) paints over its top edge, which is what
   excludes the header area. While active, the layer takes over painting the
   level tint so main/footer can go transparent — a full image then reaches
   every edge of body+footer with no seam. */
.app-shell {
  position: relative;
}
.page-bg-layer {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: none;
  overflow: hidden;
  pointer-events: none;
}
body.page-bg-active .page-bg-layer {
  display: block;
  background: var(--level-accent-soft, var(--canvas));
}
.page-bg-full {
  position: absolute;
  inset: 0;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}
.page-bg-el {
  position: absolute;
  height: auto;
  user-select: none;
}
body.page-bg-active main,
body.page-bg-active .site-footer {
  position: relative;
  z-index: 2;
  background: transparent;
}
body.page-bg-active #monthScreen[class*="level-theme-"] .section-white,
body.page-bg-active #contentScreen .section-blue {
  background: transparent;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm.cmd run qa`
Expected: 전체 PASS (기존 3 + 신규 2).

- [ ] **Step 6: 수동 무변화 검증**

`npm.cmd run dev` 후 브라우저에서 홈 → Beginner → March 진입. 배경 미설정 상태에서
페이지1/페이지2가 기존과 동일한지(틴트·풋터 색 포함) 육안 확인.

- [ ] **Step 7: Commit**

```powershell
git add app.js styles.css tests/smoke.spec.js
git commit -m @'
feat: 페이지 배경 뷰어 레이어 + bgCache/hydrate (배경 편집기 2/8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 3: 편집기 셸 — FAB + 패널 마크업 + 진입/종료

**Files:**

- Modify: `index.html` (`</footer>` 뒤 779행 근처에 마크업, 1242행 `app.js` 스크립트 뒤에 스크립트 태그)
- Create: `background-editor.js`
- Modify: `styles.css` (파일 끝에 추가)
- Test: `tests/smoke.spec.js`

**Interfaces:**

- Consumes: `window.craBg`, 전역 `sb`/`state`/`isAdmin`/`levelLabel` (app.js 렉시컬
  전역), body `data-screen`/`is-admin` 클래스 (Task 2, 기존 `updateAdminUI`).
- Produces: 전역 객체 `bgEdit`(on/screen/page/data/dirty/selected/discardArmed),
  `enterBgEdit()`, `exitBgEdit()`, `setBgStatus(text)`, `bgLayer()`,
  `bgDeepCopy(entry)`, `bgMarkDirty()`, `refreshBgSourceLine()`, body 클래스
  `bg-editing`. DOM id: `#bgEditFab #bgEditorPanel #bgEditorTarget #bgEditorSource
  #bgEditorStatus #bgEditorClose #bgFullSlot #bgFullHint #bgFullClear #bgUploadBtn
  #bgLibraryGrid #bgElTools #bgSaveMonth #bgSaveDefault #bgDeleteOverride
  #bgSavePage1`. Task 4·5·6이 이 id와 헬퍼를 그대로 사용한다.
  `renderBgLibrary()`/`renderBgEditCanvas()`는 이 태스크에서는 **빈 스텁**으로 두고
  Task 4·5가 구현한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/smoke.spec.js` 끝에 추가:

```js
test("background edit button hidden for non-admin visitors", async ({
  page,
}) => {
  await page.goto("/#content/Level%201/March");
  await expect(page.locator("#contentScreen")).toHaveClass(/screen-active/);
  // FAB exists in the DOM but CSS keeps it display:none without body.is-admin.
  await expect(page.locator("#bgEditFab")).toBeHidden();
  await expect(page.locator("#bgEditorPanel")).toBeHidden();
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm.cmd run qa`
Expected: 신규 테스트 FAIL (`#bgEditFab` 미존재).

- [ ] **Step 3: index.html 마크업 추가**

`</footer>` 닫힌 뒤 `</div>`(`.app-shell` 종료, 779행) **다음**에 삽입:

```html
    <!-- Admin-only page-background editor (see background-editor.js).
         The FAB shows only via CSS on body.is-admin + data-screen months/
         content; the panel is toggled by enterBgEdit/exitBgEdit. -->
    <button type="button" class="bg-edit-fab" id="bgEditFab">배경 편집</button>
    <aside class="bg-editor-panel" id="bgEditorPanel" hidden aria-label="배경 편집">
      <div class="bg-editor-head">
        <strong>배경 편집</strong>
        <span id="bgEditorTarget"></span>
        <button type="button" id="bgEditorClose" aria-label="편집 닫기">✕</button>
      </div>
      <p class="bg-editor-source" id="bgEditorSource"></p>
      <div class="bg-editor-section">
        <strong>전체 배경</strong>
        <div class="bg-full-slot" id="bgFullSlot">
          <span id="bgFullHint">라이브러리의 [전체 배경] 버튼으로 지정</span>
          <button type="button" id="bgFullClear" hidden>전체 배경 제거</button>
        </div>
      </div>
      <div class="bg-editor-section">
        <strong>라이브러리</strong>
        <button type="button" id="bgUploadBtn">이미지 업로드 (PNG/JPG/WebP, 5MB)</button>
        <div class="bg-library-grid" id="bgLibraryGrid"></div>
      </div>
      <div class="bg-editor-el-tools" id="bgElTools" hidden>
        <button type="button" data-el-act="flip">좌우반전</button>
        <button type="button" data-el-act="forward">앞으로</button>
        <button type="button" data-el-act="backward">뒤로</button>
        <button type="button" data-el-act="delete">요소 삭제</button>
      </div>
      <div class="bg-editor-save">
        <span class="bg-editor-status" id="bgEditorStatus"></span>
        <button type="button" id="bgSaveMonth">이 월에만 저장</button>
        <button type="button" id="bgSaveDefault">레벨 기본값으로 저장</button>
        <button type="button" id="bgDeleteOverride">이 월 개별설정 삭제</button>
        <button type="button" id="bgSavePage1">저장</button>
      </div>
    </aside>
```

그리고 1242행 `<script src="app.js"></script>` 다음 줄에:

```html
    <script src="background-editor.js"></script>
```

- [ ] **Step 4: background-editor.js 생성 (셸)**

```js
/* ==== Page-background editor (admin only) ================================
   Loaded AFTER app.js as a classic script, so it shares app.js's top-level
   lexical scope: sb, state, isAdmin, adminState, levelLabel, showScreen,
   setHash, updateContentMonthNumber, applyLevelTheme, monthLevelTag — plus
   the viewer bridge window.craBg. Editing happens directly on the public
   #pageBgLayer (WYSIWYG): the working copy renders with the same geometry
   as the viewer (center-% x/y, width-% w), wrapped in .bg-edit-el shells
   that add drag / resize / rotate handles. Nothing touches Supabase until a
   save button runs. */

const BG_BUCKET = "backgrounds";
const BG_LIB_PREFIX = "library";
const BG_MAX_BYTES = 5 * 1024 * 1024; // spec: 5MB per file
const BG_TYPES = ["image/png", "image/jpeg", "image/webp"];

const bgFab = document.querySelector("#bgEditFab");
const bgPanel = document.querySelector("#bgEditorPanel");
const bgTargetTag = document.querySelector("#bgEditorTarget");
const bgSourceLine = document.querySelector("#bgEditorSource");
const bgStatusTag = document.querySelector("#bgEditorStatus");
const bgLibraryGrid = document.querySelector("#bgLibraryGrid");
const bgUploadBtn = document.querySelector("#bgUploadBtn");
const bgFullClear = document.querySelector("#bgFullClear");
const bgFullHint = document.querySelector("#bgFullHint");
const bgElTools = document.querySelector("#bgElTools");
const bgSaveMonth = document.querySelector("#bgSaveMonth");
const bgSaveDefault = document.querySelector("#bgSaveDefault");
const bgDeleteOverride = document.querySelector("#bgDeleteOverride");
const bgSavePage1 = document.querySelector("#bgSavePage1");
const bgCloseBtn = document.querySelector("#bgEditorClose");

const bgEdit = {
  on: false,
  screen: "", // "months" | "content" — key for applyPageBackground on exit
  page: "", // "page1" | "page2"
  data: { full: null, elements: [] }, // working copy (saved only on demand)
  dirty: false,
  selected: -1, // index into data.elements
  discardArmed: false, // two-step "discard changes" on close
};

function bgLayer() {
  return document.querySelector("#pageBgLayer");
}
function setBgStatus(text) {
  if (bgStatusTag) bgStatusTag.textContent = text || "";
}
function bgDeepCopy(entry) {
  return entry
    ? JSON.parse(JSON.stringify(entry))
    : { full: null, elements: [] };
}
function bgMarkDirty() {
  bgEdit.dirty = true;
  bgEdit.discardArmed = false;
  setBgStatus("변경됨 — 저장 필요");
}

// Which source row is the page currently using? (page2 only — page1 has no
// override concept.)
function refreshBgSourceLine() {
  if (bgEdit.page !== "page2") {
    bgSourceLine.textContent = "";
    return;
  }
  const key = window.craBg.bgKey(state.level, "page2", state.month);
  bgSourceLine.textContent = window.craBg.bgCache[key]
    ? `현재 ${state.month}은 개별 설정을 사용 중입니다.`
    : "현재 이 월은 레벨 기본값을 사용 중입니다.";
}

// Stubs — Task 4 (library) and Task 5 (canvas) fill these in.
async function renderBgLibrary() {}
function renderBgEditCanvas() {}

function enterBgEdit() {
  const name = document.body.dataset.screen;
  const page = name === "months" ? "page1" : name === "content" ? "page2" : "";
  if (!page || !isAdmin || !sb) return;
  bgEdit.on = true;
  bgEdit.screen = name;
  bgEdit.page = page;
  const month = page === "page2" ? state.month : "";
  bgEdit.data = bgDeepCopy(
    window.craBg.getBackgroundEntry(state.level, page, month),
  );
  if (!Array.isArray(bgEdit.data.elements)) bgEdit.data.elements = [];
  bgEdit.dirty = false;
  bgEdit.selected = -1;
  bgEdit.discardArmed = false;
  // page-bg-active turns on the tint hand-off CSS even before anything is
  // saved, so what the admin sees while editing is exactly what saving gives.
  document.body.classList.add("bg-editing", "page-bg-active");
  bgPanel.hidden = false;
  bgTargetTag.textContent =
    page === "page1"
      ? `${levelLabel(state.level)} · 페이지1`
      : `${levelLabel(state.level)} · ${state.month}`;
  const isPage2 = page === "page2";
  bgSaveMonth.hidden = !isPage2;
  bgSaveDefault.hidden = !isPage2;
  bgDeleteOverride.hidden = !isPage2;
  bgSavePage1.hidden = isPage2;
  refreshBgSourceLine();
  setBgStatus("");
  renderBgLibrary();
  renderBgEditCanvas();
}

function exitBgEdit() {
  bgEdit.on = false;
  document.body.classList.remove("bg-editing");
  bgPanel.hidden = true;
  bgElTools.hidden = true;
  // Repaint from the saved cache (also recomputes body.page-bg-active).
  window.craBg.applyPageBackground(bgEdit.screen);
}

bgFab.addEventListener("click", enterBgEdit);

bgCloseBtn.addEventListener("click", () => {
  if (bgEdit.dirty && !bgEdit.discardArmed) {
    bgEdit.discardArmed = true;
    setBgStatus("저장하지 않은 변경이 있습니다 — 한 번 더 누르면 버립니다.");
    return;
  }
  exitBgEdit();
});
```

- [ ] **Step 5: styles.css 파일 끝에 편집기 셸 CSS 추가**

```css
/* ==== Background editor (admin only) ===================================== */
.bg-edit-fab {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 40;
  display: none;
  padding: 12px 18px;
  border: 0;
  border-radius: 999px;
  background: var(--owl-green, #2e7d32);
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}
body.is-admin[data-screen="months"] .bg-edit-fab,
body.is-admin[data-screen="content"] .bg-edit-fab {
  display: inline-flex;
}
body.bg-editing .bg-edit-fab {
  display: none;
}

.bg-editor-panel {
  position: fixed;
  top: 90px;
  right: 12px;
  bottom: 12px;
  z-index: 45;
  width: min(320px, 90vw);
  overflow-y: auto;
  padding: 14px;
  border-radius: 14px;
  background: #fff;
  color: var(--ink, #222);
  font-size: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
}
.bg-editor-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bg-editor-head strong {
  font-size: 16px;
}
.bg-editor-head #bgEditorTarget {
  flex: 1;
  font-size: 12px;
  color: #666;
}
.bg-editor-head #bgEditorClose {
  border: 0;
  background: none;
  font-size: 16px;
  cursor: pointer;
}
.bg-editor-source {
  margin: 6px 0 0;
  font-size: 12px;
  color: #666;
}
.bg-editor-section {
  margin-top: 14px;
  display: grid;
  gap: 8px;
}
.bg-editor-panel button {
  font: inherit;
  font-size: 13px;
  padding: 7px 10px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background: #fafafa;
  cursor: pointer;
}
.bg-editor-el-tools {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.bg-editor-save {
  margin-top: 16px;
  display: grid;
  gap: 6px;
}
.bg-editor-status {
  min-height: 18px;
  font-size: 12px;
  color: #b3261e;
}
/* While editing, the layer accepts the pointer and rises above page content
   (still under the topbar z-20 and the panel z-45). */
body.bg-editing .page-bg-layer {
  display: block;
  pointer-events: auto;
  z-index: 10;
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm.cmd run qa`
Expected: 전체 PASS.

- [ ] **Step 7: 수동 확인 (관리자 플로우)**

dev 서버에서 관리자 로그인 → 페이지2 진입 → 우하단 "배경 편집" FAB 표시 → 클릭 시
패널 열림(라이브러리는 아직 빈 스텁) → ✕로 닫힘 확인. 비로그인 창에서는 FAB이 안
보이는지 확인.

- [ ] **Step 8: Commit**

```powershell
git add index.html background-editor.js styles.css tests/smoke.spec.js
git commit -m @'
feat: 배경 편집기 셸 - FAB/패널/진입종료 (배경 편집기 3/8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 4: 라이브러리 — Storage 목록 · 업로드 · 삭제

**Files:**

- Modify: `background-editor.js` (Task 3의 `renderBgLibrary` 스텁 교체 + 업로드 핸들러)
- Modify: `styles.css` (파일 끝에 추가)

**Interfaces:**

- Consumes: `sb.storage.from("backgrounds")` (list/upload/remove/getPublicUrl),
  `bgEdit`, `bgMarkDirty()`, `setBgStatus()`, `renderBgEditCanvas()` (Task 5 구현
  전에는 no-op — 문제 없음).
- Produces: `renderBgLibrary()` 실구현, `bgPublicUrl(path)`,
  `async bgUploadFile(file)`. 썸네일 클릭 → `bgEdit.data.elements`에
  `{ src, x: 50, y: 40, w: 20, r: 0, fx: false, z: <index> }` push.
  [전체 배경] 버튼 → `bgEdit.data.full = url`.

- [ ] **Step 1: renderBgLibrary 스텁 교체**

Task 3의 `async function renderBgLibrary() {}` 를 다음으로 교체:

```js
function bgPublicUrl(path) {
  return sb.storage.from(BG_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function renderBgLibrary() {
  bgLibraryGrid.innerHTML = "";
  const { data, error } = await sb.storage
    .from(BG_BUCKET)
    .list(BG_LIB_PREFIX, {
      limit: 200,
      sortBy: { column: "created_at", order: "desc" },
    });
  if (error) {
    setBgStatus("라이브러리를 불러올 수 없습니다.");
    return;
  }
  if (!data.length) {
    bgLibraryGrid.innerHTML =
      '<p class="bg-lib-empty">아직 이미지가 없습니다 — 업로드로 시작하세요.</p>';
    return;
  }
  data.forEach((item) => {
    const path = `${BG_LIB_PREFIX}/${item.name}`;
    const url = bgPublicUrl(path);
    const card = document.createElement("div");
    card.className = "bg-lib-item";
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "bg-lib-thumb";
    thumb.title = "클릭하면 화면 중앙에 요소로 추가";
    thumb.style.backgroundImage = `url("${url}")`;
    thumb.addEventListener("click", () => {
      bgEdit.data.elements.push({
        src: url,
        x: 50,
        y: 40,
        w: 20,
        r: 0,
        fx: false,
        z: bgEdit.data.elements.length,
      });
      bgEdit.selected = bgEdit.data.elements.length - 1;
      bgMarkDirty();
      renderBgEditCanvas();
    });
    const actions = document.createElement("div");
    actions.className = "bg-lib-actions";
    const asFull = document.createElement("button");
    asFull.type = "button";
    asFull.textContent = "전체 배경";
    asFull.addEventListener("click", () => {
      bgEdit.data.full = url;
      bgMarkDirty();
      renderBgEditCanvas();
    });
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "삭제";
    // Two-step confirm (no window.confirm — matches the codebase's modal-free
    // inline patterns and keeps automation-safe).
    del.addEventListener("click", async () => {
      if (del.dataset.armed !== "1") {
        del.dataset.armed = "1";
        del.textContent = "정말 삭제?";
        setBgStatus("이 이미지를 쓰는 페이지에서는 요소가 사라집니다.");
        return;
      }
      const { error: rmErr } = await sb.storage.from(BG_BUCKET).remove([path]);
      if (rmErr) setBgStatus("삭제 실패.");
      else {
        setBgStatus("라이브러리에서 삭제했습니다.");
        renderBgLibrary();
      }
    });
    actions.append(asFull, del);
    card.append(thumb, actions);
    bgLibraryGrid.append(card);
  });
}
```

- [ ] **Step 2: 업로드 핸들러 추가 (renderBgLibrary 아래)**

```js
bgUploadBtn.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = BG_TYPES.join(",");
  input.multiple = true;
  input.addEventListener("change", async () => {
    for (const file of input.files) await bgUploadFile(file);
  });
  input.click();
});

async function bgUploadFile(file) {
  if (!BG_TYPES.includes(file.type)) {
    setBgStatus("PNG / JPG / WebP 파일만 올릴 수 있습니다.");
    return;
  }
  if (file.size > BG_MAX_BYTES) {
    setBgStatus("파일당 5MB 이하만 올릴 수 있습니다.");
    return;
  }
  setBgStatus("업로드 중…");
  const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const { error } = await sb.storage
    .from(BG_BUCKET)
    .upload(`${BG_LIB_PREFIX}/${Date.now()}-${safe}`, file, {
      contentType: file.type,
    });
  if (error) {
    setBgStatus("업로드 실패.");
    return;
  }
  setBgStatus("업로드 완료.");
  await renderBgLibrary();
}
```

- [ ] **Step 3: styles.css 파일 끝에 라이브러리 CSS 추가**

```css
.bg-library-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.bg-lib-item {
  display: grid;
  gap: 4px;
}
.bg-lib-thumb {
  width: 100%;
  aspect-ratio: 1;
  border: 1px solid #ddd;
  border-radius: 8px;
  background-color: #f2f2f2;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  cursor: pointer;
}
.bg-lib-actions {
  display: flex;
  gap: 4px;
}
.bg-lib-actions button {
  flex: 1;
  padding: 3px 4px;
  font-size: 11px;
}
.bg-lib-empty {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 12px;
  color: #888;
}
```

- [ ] **Step 4: 회귀 확인**

Run: `npm.cmd run qa`
Expected: 전체 PASS (라이브러리는 admin 세션이 필요해 E2E 제외 — 수동 검증).

- [ ] **Step 5: 수동 확인**

관리자 로그인 → 편집 모드 → [이미지 업로드]로 투명 PNG 1장 업로드 → 썸네일이
그리드에 나타남 → 삭제 버튼 2단계 확인 동작. (Task 1의 버킷 생성이 선행되어야 함
— 아직이면 이 스텝은 Task 8 수동 QA로 미룬다고 보고에 명시.)

- [ ] **Step 6: Commit**

```powershell
git add background-editor.js styles.css
git commit -m @'
feat: 배경 라이브러리 - 업로드/목록/삭제 (배경 편집기 4/8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 5: 캔버스 편집 — 드래그 · 크기 · 회전 · 반전 · 순서 · 전체배경

**Files:**

- Modify: `background-editor.js` (Task 3의 `renderBgEditCanvas` 스텁 교체 + 조작 로직)
- Modify: `styles.css` (파일 끝에 추가)

**Interfaces:**

- Consumes: `bgEdit`, `bgLayer()`, `bgMarkDirty()`, `bgFullClear`/`bgFullHint`/
  `bgElTools` (Task 3 DOM).
- Produces: `renderBgEditCanvas()` 실구현 — `#pageBgLayer` 안에 `.page-bg-full` +
  `.bg-edit-el` 셸(뷰어와 동일 좌표계) 렌더. `selectBgElement(index)`,
  `startBgDrag(event, index, mode)` (mode: "move"|"resize"|"rotate").
  뷰어와의 기하 일치 규칙: 셸이 `left/top/width/rotate`, 내부 `img`가
  `scaleX(fx)` — 저장 데이터는 뷰어 `applyPageBackground`가 그대로 재현한다.

- [ ] **Step 1: renderBgEditCanvas 스텁 교체**

```js
function renderBgEditCanvas() {
  const layer = bgLayer();
  layer.innerHTML = "";
  if (bgEdit.data.full) {
    const full = document.createElement("div");
    full.className = "page-bg-full";
    full.style.backgroundImage = `url("${bgEdit.data.full}")`;
    layer.append(full);
  }
  bgFullClear.hidden = !bgEdit.data.full;
  bgFullHint.hidden = Boolean(bgEdit.data.full);
  bgEdit.data.elements.forEach((item, index) => {
    layer.append(bgEditShell(item, index));
  });
  bgElTools.hidden = bgEdit.selected < 0;
}

// One positioned wrapper per element: the img mirrors the viewer geometry
// (center-% left/top, width-%, rotate on the shell, flip on the img), plus
// resize/rotate handles when selected.
function bgEditShell(item, index) {
  const shell = document.createElement("div");
  shell.className = "bg-edit-el";
  if (index === bgEdit.selected) shell.classList.add("selected");
  shell.style.left = `${item.x}%`;
  shell.style.top = `${item.y}%`;
  shell.style.width = `${item.w}%`;
  shell.style.transform = `translate(-50%, -50%) rotate(${item.r || 0}deg)`;
  const img = document.createElement("img");
  img.src = item.src;
  img.alt = "";
  img.draggable = false;
  img.style.transform = `scaleX(${item.fx ? -1 : 1})`;
  shell.append(img);
  if (index === bgEdit.selected) {
    const resize = document.createElement("span");
    resize.className = "bg-edit-handle bg-edit-resize";
    resize.title = "크기";
    const rotate = document.createElement("span");
    rotate.className = "bg-edit-handle bg-edit-rotate";
    rotate.title = "회전";
    shell.append(resize, rotate);
    wireBgHandle(resize, index, "resize");
    wireBgHandle(rotate, index, "rotate");
  }
  shell.addEventListener("pointerdown", (event) => {
    if (event.target.classList.contains("bg-edit-handle")) return;
    selectBgElement(index);
    startBgDrag(event, index, "move");
  });
  return shell;
}

function selectBgElement(index) {
  if (bgEdit.selected === index) return;
  bgEdit.selected = index;
  renderBgEditCanvas();
}
```

- [ ] **Step 2: 드래그/크기/회전 세션 로직 추가**

```js
// One pointer session drives move / resize (ratio-locked width) / rotate.
// The listeners live on document, so re-rendering the shells mid-drag is safe.
function startBgDrag(event, index, mode) {
  event.preventDefault();
  const item = bgEdit.data.elements[index];
  const rect = bgLayer().getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const start = { x: item.x, y: item.y, w: item.w, r: item.r || 0 };
  const centerPx = {
    x: rect.left + (item.x / 100) * rect.width,
    y: rect.top + (item.y / 100) * rect.height,
  };
  const startDist = Math.max(
    8,
    Math.hypot(startX - centerPx.x, startY - centerPx.y),
  );
  const startAngle = Math.atan2(startY - centerPx.y, startX - centerPx.x);

  function onMove(move) {
    if (mode === "move") {
      item.x = start.x + ((move.clientX - startX) / rect.width) * 100;
      item.y = start.y + ((move.clientY - startY) / rect.height) * 100;
      // Decorations may bleed off the edges, but never get lost entirely.
      item.x = Math.min(150, Math.max(-50, item.x));
      item.y = Math.min(150, Math.max(-50, item.y));
    } else if (mode === "resize") {
      const dist = Math.hypot(
        move.clientX - centerPx.x,
        move.clientY - centerPx.y,
      );
      item.w = Math.min(200, Math.max(2, start.w * (dist / startDist)));
    } else {
      const angle = Math.atan2(
        move.clientY - centerPx.y,
        move.clientX - centerPx.x,
      );
      item.r = Math.round(start.r + ((angle - startAngle) * 180) / Math.PI);
    }
    bgMarkDirty();
    renderBgEditCanvas();
  }
  function onUp() {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  }
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

function wireBgHandle(handle, index, mode) {
  handle.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    startBgDrag(event, index, mode);
  });
}
```

- [ ] **Step 3: 요소 툴바 + 전체배경 해제 + 빈 곳 클릭 해제 추가**

```js
bgElTools.addEventListener("click", (event) => {
  const act = event.target.dataset.elAct;
  if (!act || bgEdit.selected < 0) return;
  const els = bgEdit.data.elements;
  const index = bgEdit.selected;
  if (act === "flip") els[index].fx = !els[index].fx;
  if (act === "delete") {
    els.splice(index, 1);
    bgEdit.selected = -1;
  }
  // Array order IS the stacking order (normalized to z on save).
  if (act === "forward" && index < els.length - 1) {
    [els[index], els[index + 1]] = [els[index + 1], els[index]];
    bgEdit.selected = index + 1;
  }
  if (act === "backward" && index > 0) {
    [els[index], els[index - 1]] = [els[index - 1], els[index]];
    bgEdit.selected = index - 1;
  }
  bgMarkDirty();
  renderBgEditCanvas();
});

bgFullClear.addEventListener("click", () => {
  bgEdit.data.full = null;
  bgMarkDirty();
  renderBgEditCanvas();
});

// Clicking empty layer space clears the selection.
document.addEventListener("pointerdown", (event) => {
  if (!bgEdit.on) return;
  if (event.target === bgLayer()) {
    bgEdit.selected = -1;
    renderBgEditCanvas();
  }
});
```

- [ ] **Step 4: styles.css 파일 끝에 캔버스 CSS 추가**

```css
.bg-edit-el {
  position: absolute;
  cursor: grab;
  touch-action: none;
}
.bg-edit-el img {
  display: block;
  width: 100%;
  height: auto;
  pointer-events: none;
  user-select: none;
}
.bg-edit-el.selected {
  outline: 2px dashed #1f5fa8;
  outline-offset: 2px;
}
.bg-edit-handle {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 2px solid #1f5fa8;
  border-radius: 50%;
  background: #fff;
}
.bg-edit-resize {
  right: -10px;
  bottom: -10px;
  cursor: nwse-resize;
}
.bg-edit-rotate {
  top: -26px;
  left: 50%;
  transform: translateX(-50%);
  cursor: grab;
}
```

- [ ] **Step 5: 회귀 + 수동 확인**

Run: `npm.cmd run qa` → 전체 PASS.
수동: 편집 모드에서 썸네일 클릭 → 중앙에 요소 등장 → 드래그 이동, 모서리 핸들
크기(비율 유지), 상단 핸들 회전, 좌우반전/앞으로/뒤로/삭제 동작, [전체 배경] 지정
후 cover로 꽉 참 + [전체 배경 제거] 동작 확인. 풋터 영역까지 드래그해 요소가
풋터 위에 그려지는지 확인.

- [ ] **Step 6: Commit**

```powershell
git add background-editor.js styles.css
git commit -m @'
feat: 배경 캔버스 편집 - 드래그/크기/회전/반전/순서 (배경 편집기 5/8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 6: 저장 · 월별 오버라이드 삭제 · 미저장 네비 가드

**Files:**

- Modify: `background-editor.js` (파일 끝에 추가)

**Interfaces:**

- Consumes: `bgEdit`, `state`, `sb`, `window.craBg`, `setBgStatus()`,
  `refreshBgSourceLine()`, `renderBgEditCanvas()`, `bgDeepCopy()`, Task 3 버튼 DOM.
- Produces: `bgNormalized()`, `async bgSave(month)` — upsert
  `{ level, page, month: month || "", data }` with `onConflict: "level,page,month"`;
  저장 성공 시 `window.craBg.bgCache[bgKey(...)]` 갱신. 오버라이드 삭제는 행
  delete + 캐시 키 제거 + 기본값으로 작업본 재로드.

- [ ] **Step 1: 저장/삭제 로직 추가 (background-editor.js 끝)**

```js
/* ---- persistence -------------------------------------------------------- */

function bgNormalized() {
  return {
    full: bgEdit.data.full || null,
    elements: bgEdit.data.elements.map((item, index) => ({
      ...item,
      z: index,
    })),
  };
}

async function bgSave(month) {
  setBgStatus("저장 중…");
  const data = bgNormalized();
  const { error } = await sb.from("page_backgrounds").upsert(
    { level: state.level, page: bgEdit.page, month: month || "", data },
    { onConflict: "level,page,month" },
  );
  if (error) {
    setBgStatus("저장 실패.");
    return;
  }
  window.craBg.bgCache[window.craBg.bgKey(state.level, bgEdit.page, month)] =
    data;
  bgEdit.dirty = false;
  bgEdit.discardArmed = false;
  setBgStatus("저장 완료.");
  refreshBgSourceLine();
}

bgSavePage1.addEventListener("click", () => bgSave(""));
bgSaveMonth.addEventListener("click", () => bgSave(state.month));
bgSaveDefault.addEventListener("click", () => bgSave(""));

bgDeleteOverride.addEventListener("click", async () => {
  setBgStatus("삭제 중…");
  const { error } = await sb
    .from("page_backgrounds")
    .delete()
    .match({ level: state.level, page: "page2", month: state.month });
  if (error) {
    setBgStatus("삭제 실패.");
    return;
  }
  delete window.craBg.bgCache[
    window.craBg.bgKey(state.level, "page2", state.month)
  ];
  // The editor falls back to the level default, same as the public page will.
  bgEdit.data = bgDeepCopy(
    window.craBg.getBackgroundEntry(state.level, "page2", state.month),
  );
  if (!Array.isArray(bgEdit.data.elements)) bgEdit.data.elements = [];
  bgEdit.dirty = false;
  bgEdit.selected = -1;
  setBgStatus("개별설정 삭제 — 이 월은 레벨 기본값을 사용합니다.");
  refreshBgSourceLine();
  renderBgEditCanvas();
});
```

- [ ] **Step 2: 미저장 네비 가드 추가 (그 아래)**

```js
// While editing with unsaved changes, swallow in-app navigation clicks
// (month Back/Next, month grid, top nav, brand, admin button) in the capture
// phase — before app.js's own handlers run.
document.addEventListener(
  "click",
  (event) => {
    if (!bgEdit.on || !bgEdit.dirty) return;
    const nav = event.target.closest(
      ".content-nav-prev, .content-nav-next, .month-button, .top-nav-link, .brand, [data-view], .admin-nav-button",
    );
    if (!nav || bgPanel.contains(nav)) return;
    event.preventDefault();
    event.stopPropagation();
    setBgStatus("저장하지 않은 변경이 있습니다 — 저장하거나 ✕로 닫아 주세요.");
  },
  true,
);
```

- [ ] **Step 3: 회귀 + 수동 확인**

Run: `npm.cmd run qa` → 전체 PASS.
수동 (Task 1의 SQL/버킷 적용 후):

1. L1(Beginner)·March 페이지2에서 요소 배치 → [레벨 기본값으로 저장] → April~
   December 이동 시 같은 배경 표시.
2. April에서 배치 변경 → [이 월에만 저장] → April만 다르고 다른 월은 기본값 유지.
3. April에서 [이 월 개별설정 삭제] → 즉시 기본값 복귀 + 상태문구 확인.
4. 페이지1에서 [저장] → 새로고침 후에도 유지 (hydrate 확인).
5. 요소 드래그 후 저장 없이 Back/Next·월버튼·상단네비 클릭 → 이동 차단 + 경고
   문구. 저장 후에는 정상 이동.
6. 다른 브라우저(비로그인)에서 같은 페이지 → 배경 보이고 FAB 없음, 버튼 클릭 정상.

- [ ] **Step 4: Commit**

```powershell
git add background-editor.js
git commit -m @'
feat: 배경 저장/월별 오버라이드/네비 가드 (배경 편집기 6/8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 7: 관리자 화면 바로가기 버튼

**Files:**

- Modify: `index.html` (`#adminViewContent`의 레벨/월 `<select>` 컨트롤 행 — `#adminMonth` 셀렉트 뒤)
- Modify: `background-editor.js` (파일 끝에 추가)
- Modify: `styles.css` (파일 끝에 추가)

**Interfaces:**

- Consumes: `adminState`(app.js 전역 — `#adminLevel`/`#adminMonth` 셀렉트와 동기),
  `state`, `monthLevelTag`, `levelLabel()`, `updateContentMonthNumber()`,
  `applyLevelTheme()`, `setHash()`, `showScreen()`, `enterBgEdit()` (Task 3).
- Produces: `#adminBgBtn` 버튼 — 클릭 시 선택된 레벨/월의 페이지2로 이동하며 편집
  모드 자동 진입 (관리자모드-사용자화면 일치 원칙 유지).

- [ ] **Step 1: index.html에 버튼 추가**

`#adminViewContent` 안에서 `<select ... id="adminMonth">...</select>`를 감싸는
컨트롤 행(주변에 `.admin-select` 요소들이 있는 곳)의 마지막 셀렉트 뒤에:

```html
              <button type="button" class="admin-bg-btn" id="adminBgBtn">
                배경 편집
              </button>
```

- [ ] **Step 2: background-editor.js 끝에 핸들러 추가**

```js
// Admin-screen shortcut: jump to the selected level/month's 페이지2 and start
// editing right away (work rule: the admin screen mirrors the user screen).
const adminBgBtn = document.querySelector("#adminBgBtn");
if (adminBgBtn) {
  adminBgBtn.addEventListener("click", () => {
    state.level = adminState.level;
    state.month = adminState.month;
    monthLevelTag.textContent = levelLabel(state.level);
    updateContentMonthNumber();
    applyLevelTheme();
    setHash("content");
    showScreen("content");
    enterBgEdit();
  });
}
```

- [ ] **Step 3: styles.css 파일 끝에 버튼 스타일 추가**

```css
.admin-bg-btn {
  padding: 8px 14px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background: #fff;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.admin-bg-btn:hover {
  background: #f2f6ff;
}
```

- [ ] **Step 4: 회귀 + 수동 확인**

Run: `npm.cmd run qa` → 전체 PASS.
수동: #admin에서 Level 2·May 선택 → [배경 편집] → 페이지2(May)로 이동 + 패널
자동 오픈 + 대상 표기 "Level 1 · May"(표시 라벨) 확인.

- [ ] **Step 5: Commit**

```powershell
git add index.html background-editor.js styles.css
git commit -m @'
feat: 관리자 화면 배경 편집 바로가기 (배경 편집기 7/8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 8: 최종 QA + 문서 갱신

**Files:**

- Modify: `PROJECT_MEMORY.md` (현재 상태 섹션)
- Modify: `NOTES.md` (새 gotcha)

**Interfaces:**

- Consumes: Task 1~7 전체 결과물.
- Produces: 배포 가능 상태(사용자 push 요청 대기) + 문서 최신화.

- [ ] **Step 1: 전체 QA**

Run: `npm.cmd run qa`
Expected: checks + Playwright 전체 PASS (기존 3 + 신규 3).

- [ ] **Step 2: 스펙 완료 기준 수동 점검 (체크리스트)**

- 4레벨 × 페이지1 저장/표시.
- 페이지2 기본값 저장 → 10개 월 반영 / 월 오버라이드 → 해당 월만 / 오버라이드
  삭제 → 기본값 복귀.
- 비관리자에게 FAB 안 보임 (Playwright로도 보증됨).
- 배경 미설정 페이지 기존과 동일 (Playwright inert 테스트 + 육안).
- 반응형: 창 폭을 모바일 크기로 줄여 요소가 같은 상대 위치·상대 크기로 스케일
  되는지 확인.
- 이미지 로드 실패 폴백: 라이브러리에서 사용 중 이미지 삭제 후 해당 페이지 요소만
  사라지고 페이지 정상 동작.

- [ ] **Step 3: PROJECT_MEMORY.md 갱신**

현재 상태 섹션에 추가: 배경 편집기 완료 내역(기능 요약 1-2줄), Supabase 수동 단계
(backgrounds 버킷 + migration.sql 재실행) 완료 여부, 남은 일이 있으면 백로그에.

- [ ] **Step 4: NOTES.md에 gotcha 기록**

추가할 항목: (1) `page_backgrounds.month`는 null 대신 `''` — Supabase upsert
`onConflict`가 표현식 유니크 인덱스를 못 타서 PK 컬럼에 포함시킨 것. (2) 배경
레이어 스태킹 — 틴트 투명화는 `body.page-bg-active`에서만; 새 CSS를 이 규칙들보다
**앞에** 추가하면 specificity 동률에서 밀릴 수 있으니 배경 관련 오버라이드는 파일
끝 배경 섹션에 이어서 쓸 것. (3) `background-editor.js`는 app.js의 전역 렉시컬
스코프에 의존 — app.js를 모듈로 바꾸면 깨진다.

- [ ] **Step 5: Commit**

```powershell
git add PROJECT_MEMORY.md NOTES.md
git commit -m @'
docs: 배경 편집기 완료 기록 + gotcha (배경 편집기 8/8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

- [ ] **Step 6: 사용자 보고**

push는 하지 않는다. 사용자에게: 완료 요약 + Supabase 수동 단계 안내(미완이면) +
"배포하려면 push 요청" 안내.
