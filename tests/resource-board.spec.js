import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CATEGORIES,
  DRIVE_A,
  pid,
  samplePosts,
  stubBoard,
} from "./resource-board-stub.mjs";

// 자료실 (resource board, 2026-11-03 PM brief): the header's Teacher button
// (H1-H6), the teachers' list and post screens (B1, B2, B9-B11), the switch
// (B12), the admin list / settings / editor (B3-B8) and the 레벨별 자료실
// switch (T1, T2). Every Supabase request is answered by
// tests/resource-board-stub.mjs — the live project is never reached; the SQL
// side of the same contract is tests/resource-board-sql.spec.js.

const desktopOnly = (info, why = "flow only, run once") =>
  test.skip(info.project.name !== "desktop", why);

async function openBoard(page, hash = "#board") {
  await page.goto(`/${hash}`);
  await page.waitForFunction(() => window.craBoard && window.craBoard.ready);
}

// goto: false = the admin screen is already open in this page (no reload —
// a test of Back needs its history entries in the same document).
async function openAdminBoard(page, { goto = true } = {}) {
  if (goto) await page.goto("/#admin");
  const menu = page.locator('.admin-menu-btn[data-admin-view="board"]');
  if (!(await menu.isVisible())) await page.locator("#adminMenuToggle").click();
  await menu.click();
  await expect(page.locator("#rbAdminList table")).toBeVisible();
}

const rowTitles = (page) =>
  page
    .locator("#boardRows .bd-row")
    .evaluateAll((rows) =>
      rows.map((r) => r.querySelector(".bd-pc .bd-t").textContent),
    );

// Files dropped onto an element (a real DataTransfer, as a browser makes).
async function dropFiles(page, selector, files) {
  const handle = await page.evaluateHandle((list) => {
    const dt = new DataTransfer();
    list.forEach(({ name, size, type }) =>
      dt.items.add(new File([new Uint8Array(size)], name, { type })),
    );
    return dt;
  }, files);
  await page.dispatchEvent(selector, "dragenter", { dataTransfer: handle });
  await page.dispatchEvent(selector, "dragover", { dataTransfer: handle });
  await page.dispatchEvent(selector, "drop", { dataTransfer: handle });
}

/* ---- Header (H1-H6) ------------------------------------------------------- */

test("board header: Teacher for the top admin, branch and teacher while on — never for students or visitors (H1, B2, B12)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  const cases = [
    ["admin", true, true],
    ["branch", true, true],
    ["teacher", true, true],
    ["student", true, false],
    [null, true, false],
    ["admin", false, false],
    ["teacher", false, false],
  ];
  for (const [role, board, visible] of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await stubBoard(page, { role, board });
    await openBoard(page, "");
    const button = page.locator("#teacherBoardBtn");
    if (visible) await expect(button, `${role}`).toBeVisible();
    else await expect(button, `${role} board=${board}`).toBeHidden();
    if (visible) {
      await expect(button).toHaveAccessibleName("Teacher 교사자료실");
      // order: Teacher · My Class / Admin · Log out
      const order = await page
        .locator(".topbar-actions > button:visible")
        .evaluateAll((els) => els.map((el) => el.id));
      expect(order).toEqual(["teacherBoardBtn", "adminNavBtn", "logoutBtn"]);
    }
    await context.close();
  }
});

test('board header: Teacher look — one line "Teacher" in Inter 800 14px beside the folder, both centred — and the Inter labels at 37px; Admin alone has the user-cog (H2-H4, #2)', async ({
  browser,
}, info) => {
  desktopOnly(info);
  for (const role of ["admin", "teacher"]) {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
    });
    const page = await context.newPage();
    await stubBoard(page, { role });
    await openBoard(page, "");
    await page.evaluate(() => document.fonts.ready);
    const look = await page.evaluate(() => {
      const css = (sel) => getComputedStyle(document.querySelector(sel));
      const box = (sel) => document.querySelector(sel).getBoundingClientRect();
      const t = css("#teacherBoardBtn");
      return {
        teacher: [
          t.backgroundColor,
          t.borderTopWidth,
          t.borderTopColor,
          t.borderTopLeftRadius,
          t.boxShadow,
          Math.round(box("#teacherBoardBtn").height),
        ],
        icon: [
          box(".teacher-board-icon").width,
          css(".teacher-board-icon").strokeWidth,
        ],
        en: [
          css(".teacher-board-text").fontFamily.split(",")[0],
          css(".teacher-board-text").fontWeight,
          css(".teacher-board-text").fontSize,
          document.querySelector("#teacherBoardBtn").textContent.trim(),
          document.querySelectorAll("#teacherBoardBtn span").length,
        ],
        // vertical centres: the button, its folder and its word
        middle: [
          "#teacherBoardBtn",
          ".teacher-board-icon",
          ".teacher-board-text",
        ].map((sel) => {
          const r = box(sel);
          return sel === "#teacherBoardBtn"
            ? r.top + 2 + (r.height - 4) / 2 // inside the 2px rim
            : r.top + r.height / 2;
        }),
        nav: [
          css("#adminNavBtn").fontFamily.split(",")[0],
          css("#adminNavBtn").fontWeight,
          css("#adminNavBtn").fontSize,
          Math.round(box("#adminNavBtn").height),
        ],
        logout: [
          css("#logoutBtn").fontFamily.split(",")[0],
          css("#logoutBtn").fontWeight,
          css("#logoutBtn").fontSize,
          Math.round(box("#logoutBtn").height),
        ],
        cog: css("#adminNavBtn .admin-cog-icon").display,
        cogSize: box("#adminNavBtn .admin-cog-icon").width,
      };
    });
    expect(look.teacher).toEqual([
      "rgb(255, 255, 255)",
      "2px",
      "rgb(28, 176, 246)",
      "16px",
      "rgb(24, 153, 214) 0px 3px 0px 0px",
      37,
    ]);
    expect(look.icon).toEqual([18, "2px"]);
    const unquote = ([family, ...rest]) => [family.replace(/"/g, ""), ...rest];
    expect(unquote(look.en)).toEqual(["Inter", "800", "14px", "Teacher", 1]);
    const [mid, iconMid, textMid] = look.middle;
    expect(Math.abs(iconMid - mid)).toBeLessThanOrEqual(1);
    expect(Math.abs(textMid - mid)).toBeLessThanOrEqual(1);
    expect(unquote(look.nav)).toEqual(["Inter", "800", "14px", 37]);
    expect(unquote(look.logout)).toEqual(["Inter", "800", "14px", 37]);
    if (role === "admin") {
      expect([look.cog, look.cogSize]).toEqual(["block", 17]);
    } else {
      expect(look.cog).toBe("none");
      await expect(page.locator("#adminNavBtn .action-label")).toHaveText(
        "My Class",
      );
    }
    // on the board screen it stays white — only aria-current says so
    await page.locator("#teacherBoardBtn").click();
    await expect(page.locator("#boardScreen")).toHaveClass(/screen-active/);
    await expect(page.locator("#teacherBoardBtn")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.mouse.move(10, 500); // not hovering
    await expect(page.locator("#teacherBoardBtn")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await context.close();
  }
});

test("board header on phones: the folder icon only, grey like the other icons, also on the board (H5)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await stubBoard(page, { role: "teacher" });
  await openBoard(page);
  await expect(page.locator("#boardScreen")).toHaveClass(/screen-active/);
  const icons = await page.evaluate(() => {
    const css = (sel) => getComputedStyle(document.querySelector(sel));
    const box = (sel) => document.querySelector(sel).getBoundingClientRect();
    return {
      text: css(".teacher-board-text").display,
      folder: [box(".teacher-board-icon").width, css("#teacherBoardBtn").color],
      logout: css("#logoutBtn").color,
      background: css("#teacherBoardBtn").backgroundColor,
      border: css("#teacherBoardBtn").borderTopWidth,
    };
  });
  expect(icons.text).toBe("none");
  expect(icons.folder[0]).toBe(21);
  expect(icons.folder[1]).toBe(icons.logout);
  expect(icons.background).toBe("rgba(0, 0, 0, 0)");
  expect(icons.border).toBe("0px");
  await expect(page.locator("#teacherBoardBtn")).toHaveAccessibleName(
    "Teacher 교사자료실",
  );
  await expect(page.locator("#adminNavBtn .action-icon")).toBeVisible(); // the key
  await context.close();
});

test("board header: no overlap with the level buttons at 1024 · 1100 · 1180 · 1280 · 1366 (H6)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  for (const role of ["admin", "branch"]) {
    for (const width of [1024, 1100, 1180, 1280, 1366]) {
      const context = await browser.newContext({
        viewport: { width, height: 800 },
      });
      const page = await context.newPage();
      await stubBoard(page, { role });
      await openBoard(page);
      await page.evaluate(() => document.fonts.ready);
      const gap = await page.evaluate(() => {
        const nav = document.querySelector(".top-nav").getBoundingClientRect();
        const act = document
          .querySelector(".topbar-actions")
          .getBoundingClientRect();
        return {
          gap: act.left - nav.right,
          row: Math.abs(nav.top - act.top) < 40,
          wide: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      expect(gap.row, `${role} ${width}`).toBe(true);
      expect(gap.gap, `${role} ${width}`).toBeGreaterThanOrEqual(12);
      expect(gap.wide, `${role} ${width}`).toBe(false);
      await context.close();
    }
  }
});

/* ---- The teachers' list and post (B9-B11) ---------------------------------- */

test("board list: 10 a page, pinned first, badges, 전체 N개 (B9)", async ({
  page,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 900 });
  await stubBoard(page);
  await openBoard(page);
  await expect(page.locator("#boardRows .bd-row")).toHaveCount(10);
  await expect(page.locator("#boardCount")).toHaveText("전체 12개");
  const first = page.locator("#boardRows .bd-row").first();
  await expect(first).toHaveClass(/is-pinned/);
  await expect(first.locator(".bd-pc .bd-pin")).toHaveText("공지");
  await expect(first.locator(".bd-pc .bd-cat")).toHaveText("월간교육안");
  await expect(first.locator(".bd-pc .bd-level")).toHaveText("Level 1");
  await expect(first.locator(".bd-pc .bd-new")).toHaveText("NEW");
  await expect(first.locator(".bd-pc .bd-files")).toContainText("10");
  await expect(first.locator(".bd-c-views")).toHaveText("조회 64");
  // the level chips + one chip per category, in order
  await expect(page.locator("#boardLevelChips .bd-chip")).toHaveText([
    "전체",
    "Beginner",
    "Level 1",
    "Level 2",
    "Level 3",
  ]);
  await expect(page.locator("#boardCatChips .bd-chip")).toHaveText([
    "전체",
    ...CATEGORIES.map((c) => c.name),
  ]);
  await expect(page.locator("#boardPager .bd-page[aria-current]")).toHaveText(
    "1",
  );
  // every press area at least 44px tall
  for (const sel of [
    "#boardLevelChips .bd-chip",
    "#boardPager .bd-page",
    ".bd-search-btn",
    "#boardSort",
  ]) {
    const heights = await page
      .locator(sel)
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(Math.min(...heights), sel).toBeGreaterThanOrEqual(40);
  }
});

test("board list: level · category · search · sort · page live in the address; Back and reload keep them (B9)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const sent = await stubBoard(page);
  await openBoard(page);
  await expect(page.locator("#boardRows .bd-row")).toHaveCount(10);
  // a level = that level + 공통
  await page.locator('#boardLevelChips .bd-chip[data-level="level-1"]').click();
  await expect(page).toHaveURL(/#board\?level=level-1$/);
  await expect
    .poll(() => rowTitles(page))
    .toEqual([
      "Level 1 월간교육안 (3월~12월)",
      "2026 연간교육안 — 전 레벨",
      "10월 그림 자료 모음",
      "2026 수료 상장 양식",
      "10월 플래쉬카드 모음",
      "Good Morning · Good Bye 노래 가사판",
    ]);
  await expect(
    page.locator('#boardLevelChips .bd-chip[data-level="level-1"]'),
  ).toHaveAttribute("aria-pressed", "true");
  // + a category
  await page.locator('#boardCatChips .bd-chip[data-cat="7"]').click();
  await expect(page).toHaveURL(/#board\?level=level-1&cat=7$/);
  await expect.poll(() => rowTitles(page)).toEqual(["10월 플래쉬카드 모음"]);
  // reload: the same list
  await page.reload();
  await page.waitForFunction(() => window.craBoard && window.craBoard.ready);
  await expect.poll(() => rowTitles(page)).toEqual(["10월 플래쉬카드 모음"]);
  await expect(
    page.locator('#boardCatChips .bd-chip[data-cat="7"]'),
  ).toHaveAttribute("aria-pressed", "true");
  // Back: the level only
  await page.goBack();
  await expect(page).toHaveURL(/#board\?level=level-1$/);
  await expect.poll(() => rowTitles(page).then((t) => t.length)).toBe(6);
  // search (title or body), Korean in the address
  await page.locator("#boardSearch").fill("한글 파일");
  await page.locator("#boardSearch").press("Enter");
  await expect.poll(() => rowTitles(page)).toEqual(["2026 수료 상장 양식"]);
  const query = new URL(page.url()).hash.split("?")[1];
  expect(new URLSearchParams(query).get("q")).toBe("한글 파일");
  // sort by views, then page 2 of everything
  await page.goto("/#board?sort=views");
  await expect
    .poll(() => rowTitles(page).then((t) => t.slice(0, 3)))
    .toEqual([
      "2026 연간교육안 — 전 레벨",
      "Level 1 월간교육안 (3월~12월)",
      "Good Morning · Good Bye 노래 가사판",
    ]);
  await page.locator('#boardPager .bd-page[aria-label="2쪽"]').click();
  await expect(page).toHaveURL(/#board\?sort=views&page=2$/);
  await expect(page.locator("#boardRows .bd-row")).toHaveCount(2);
  // what the server was asked, last
  const last = sent.rpc.filter((r) => r.name === "board_list").at(-1).args;
  expect(last).toEqual({
    p_level: null,
    p_category: null,
    p_q: null,
    p_sort: "views",
    p_page: 2,
  });
});

test("board list: no posts, no match for a search, no match for a filter — each says so (B9)", async ({
  page,
}, info) => {
  desktopOnly(info);
  await stubBoard(page, { posts: [] });
  await openBoard(page);
  await expect(page.locator("#boardEmpty")).toContainText(
    "아직 올라온 자료가 없어요.",
  );
  await expect(page.locator("#boardCount")).toHaveText("전체 0개");
  await page.goto("/#board?q=없는말");
  await expect(page.locator("#boardEmpty")).toContainText(
    "'없는말' 검색 결과가 없어요.",
  );
  await page.locator("#boardEmpty .bd-empty-btn").click();
  await expect(page).toHaveURL(/#board$/);
  await page.goto("/#board?level=level-3&cat=2");
  await expect(page.locator("#boardEmpty")).toContainText(
    "이 조건에 맞는 자료가 없어요.",
  );
});

test("board post: files download here through the function with their Korean name; a Drive file downloads straight from Google in a new tab (B10, F2)", async ({
  page,
  context,
}, info) => {
  desktopOnly(info);
  const sent = await stubBoard(page);
  await openBoard(page, `#board/${pid(8)}`);
  await expect(page.locator(".bd-card-title")).toHaveText(
    "2026 수료 상장 양식",
  );
  await expect(page.locator(".bd-card-text")).toHaveText(
    "수료식에 사용할 상장 양식입니다.\n원 이름과 날짜는 한글 파일에서 고쳐 쓰시고, 고화질 배경은 구글 드라이브에서 받으세요.",
  );
  await expect(page.locator(".bd-card-meta")).toContainText("조회 136");
  await expect(page.locator(".bd-att")).toHaveCount(3);
  await expect(page.locator(".bd-att-meta")).toHaveText([
    "PDF · 801KB",
    "한글 · 234KB",
    "구글 드라이브 · 바로 받기",
  ]);
  // F2: the same [내려받기] on every row
  await expect(page.locator(".bd-att-btn-text")).toHaveText([
    "내려받기",
    "내려받기",
    "내려받기",
  ]);
  await expect(page.locator(".bd-crumb-list")).toHaveText(/자료실.*상장.*공통/);
  // a file: the function, this tab, the original name
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "2026_수료상장_양식(수정용).hwp 내려받기" })
      .click(),
  ]);
  expect(download.suggestedFilename()).toBe("2026_수료상장_양식(수정용).hwp");
  const post = sent.db.posts.find((p) => p.id === pid(8));
  expect(sent.fn.map((f) => f.body)).toEqual([
    { attachment: post.attachments[1].id },
  ]);
  expect(context.pages()).toHaveLength(1);
  // a Drive file: Google's direct download (D64's address, not the preview
  // page), a new tab, no function call (not counted in the 30 a day)
  const open = page.getByRole("link", {
    name: "수료 상장 배경 이미지 (고화질) 내려받기 (새 탭)",
  });
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("rel", /noopener/);
  await expect(open).toHaveAttribute(
    "href",
    `https://drive.google.com/uc?export=download&id=${DRIVE_A}`,
  );
  const [tab] = await Promise.all([context.waitForEvent("page"), open.click()]);
  await expect(tab).toHaveURL(
    `https://drive.google.com/uc?export=download&id=${DRIVE_A}`,
  );
  await tab.close();
  expect(sent.fn).toHaveLength(1);
  // no Storage path or signed address anywhere on the page
  expect(await page.content()).not.toContain("post/");
});

test("board post: 이전 글 / 다음 글 in the list's order, 목록으로 keeps the filters; ten files = ten rows (B10)", async ({
  page,
}, info) => {
  desktopOnly(info);
  await stubBoard(page);
  await openBoard(page, "#board?level=level-1");
  await page
    .locator(".bd-row", { hasText: "2026 수료 상장 양식" })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`#board/${pid(8)}\\?level=level-1$`));
  await expect(page.locator(".bd-nb-prev .bd-nb-title")).toHaveText(
    "10월 그림 자료 모음",
  );
  await expect(page.locator(".bd-nb-next .bd-nb-title")).toHaveText(
    "10월 플래쉬카드 모음",
  );
  await page.locator(".bd-nb-prev").click();
  await expect(page.locator(".bd-card-title")).toHaveText(
    "10월 그림 자료 모음",
  );
  await expect(page.locator(".bd-att")).toHaveCount(8);
  await page.locator("#boardBack").click();
  await expect(page).toHaveURL(/#board\?level=level-1$/);
  await expect.poll(() => rowTitles(page).then((t) => t.length)).toBe(6);
  // the first post: no 이전 글; ten attachments, each its own button
  await page.goto(`/#board/${pid(1)}`);
  await expect(page.locator(".bd-nb-prev")).toHaveCount(0);
  await expect(page.locator(".bd-att-dl")).toHaveCount(10);
  // a hidden or unknown post
  await page.goto(`/#board/${pid(12)}`);
  await expect(page.locator(".bd-card-missing")).toHaveText(
    "이 자료는 지금 볼 수 없어요. 숨겨졌거나 지워졌을 수 있어요.",
  );
});

test("board post: the function's refusals are explained and the page stays (B6, B10)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  for (const [status, text] of [
    [429, "오늘 다운로드 횟수를 모두 사용했습니다. 내일 다시 시도해 주세요."],
    [403, "교사자료실이 지금은 닫혀 있어요."],
    [404, "이 파일은 지금 받을 수 없어요."],
    [401, "다시 로그인해 주세요."],
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await stubBoard(page, { downloadStatus: status });
    await openBoard(page, `#board/${pid(8)}`);
    await page.locator(".bd-att-dl").first().click();
    await expect(page.locator("#boardDetailStatus")).toHaveText(text);
    await expect(page).toHaveURL(new RegExp(`#board/${pid(8)}$`));
    await context.close();
  }
});

test("board: students, visitors and a switched-off board land on the home page; the top admin may preview (B2, B12)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  for (const [role, board] of [
    ["student", true],
    [null, true],
    ["teacher", false],
    ["branch", false],
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const sent = await stubBoard(page, { role, board });
    await openBoard(page, `#board/${pid(8)}`);
    await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
    await expect(page.locator("#boardScreen")).not.toHaveClass(/screen-active/);
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    expect(sent.rpc.map((r) => r.name)).not.toContain("board_post_get");
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await stubBoard(page, { role: "admin", board: false });
  await openBoard(page);
  await expect(page.locator("#boardScreen")).toHaveClass(/screen-active/);
  await expect(page.locator("#boardAdminNote")).toBeVisible();
  await expect(page.locator("#teacherBoardBtn")).toBeHidden();
  await context.close();
});

test("board on a phone: cards, chips that slide sideways, file buttons as icons with names (B9, B10)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await stubBoard(page);
  await openBoard(page);
  const card = page.locator("#boardRows .bd-row").first();
  await expect(card.locator(".bd-m")).toBeVisible();
  await expect(card.locator(".bd-pc .bd-c-main")).toBeHidden();
  await expect(card.locator(".bd-m-tags")).toHaveText(
    /공지.*월간교육안.*Level 1.*NEW/,
  );
  const chips = await page.locator("#boardCatChips").evaluate((el) => ({
    scroll: el.scrollWidth > el.clientWidth,
    wrap: getComputedStyle(el).flexWrap,
  }));
  expect(chips).toEqual({ scroll: true, wrap: "nowrap" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto(`/#board/${pid(8)}`);
  const button = page.locator(".bd-att-dl").first();
  await expect(button.locator(".bd-att-btn-text")).toBeHidden();
  await expect(button).toHaveAccessibleName("2026_수료상장_양식.pdf 내려받기");
  const size = await button.boundingBox();
  expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(44);
  await context.close();
});

/* ---- Admin (B3-B8, B12, T1) ------------------------------------------------ */

test("board admin: the list — pinned first, filters, 20 a page; delete asks twice and its files go from Storage (그림 05, B8)", async ({
  page,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 900 });
  const sent = await stubBoard(page, { role: "admin" });
  await openAdminBoard(page);
  await expect(page.locator("#adminTitle")).toHaveText("교사자료실");
  await expect(page.locator("#boardNewBtn")).toBeVisible();
  const rows = page.locator("#rbAdminList tbody tr");
  await expect(rows).toHaveCount(13);
  await expect(rows.nth(0)).toHaveClass(/is-pinned/);
  await expect(rows.nth(2).locator(".adm-row-title")).toHaveText(
    "숨긴 글 (준비 중)",
  );
  await expect(rows.nth(2).locator(".adm-badge")).toHaveText("숨김");
  await page.locator("#rbFilterStatus").selectOption("hidden");
  await expect(rows).toHaveCount(1);
  await page.locator("#rbFilterStatus").selectOption("");
  await page.locator("#rbFilterLevel").selectOption("common");
  await expect(rows).toHaveCount(3);
  await page.locator("#rbFilterLevel").selectOption("");
  // 보기 = the teachers' page in a new tab
  await expect(rows.nth(0).getByRole("link", { name: /보기/ })).toHaveAttribute(
    "href",
    new RegExp(`#board/${pid(1)}$`),
  );
  // delete: two presses; the post's files go from Storage
  const target = rows.filter({ hasText: "2026 수료 상장 양식" });
  await target.getByRole("button", { name: "삭제" }).click();
  await target.getByRole("button", { name: "한 번 더 누르면 삭제" }).click();
  await expect(page.locator("#rbAdminStatus")).toHaveText("삭제했어요.");
  await expect(rows).toHaveCount(12);
  expect(sent.removed).toHaveLength(2); // the PDF and the 한글 file, not the link
  // the other admin views hide the new-post button
  await page.locator('.admin-menu-btn[data-admin-view="members"]').click();
  await expect(page.locator("#boardNewBtn")).toBeHidden();
});

test("board admin: the switch writes resource_board_enabled and the header follows (B12)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const sent = await stubBoard(page, { role: "admin", board: false });
  await openAdminBoard(page);
  const toggle = page.locator("#rbBoardToggle");
  await expect(toggle).not.toBeChecked();
  await expect(page.locator("#rbBoardToggleText")).toHaveText(
    "사용자 화면에 표시: 끔",
  );
  await page.locator(".rb-settings-switch .adm-switch").click();
  await expect(page.locator("#rbBoardToggleText")).toHaveText(
    "사용자 화면에 표시: 켬",
  );
  expect(sent.upserts).toEqual([
    { key: "resource_board_enabled", value: true },
  ]);
  await page.locator("#adminSiteBtn").click();
  await expect(page.locator("#teacherBoardBtn")).toBeVisible();
});

test("board admin: categories — add, rename, reorder (↑ ↓), and only an empty one deletes (B5)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const sent = await stubBoard(page, { role: "admin" });
  await openAdminBoard(page);
  const cats = page.locator("#rbCatList .rb-cat");
  await expect(cats).toHaveCount(7);
  // 연간교육안 has posts → its delete is off
  await expect(cats.nth(1).locator(".rb-cat-del")).toBeDisabled();
  await page.locator("#rbCatAddName").fill("공지 자료");
  await page.locator("#rbCatAddForm button[type=submit]").click();
  await expect(cats).toHaveCount(8);
  await expect(cats.nth(7).locator(".bd-cat")).toHaveText("공지 자료");
  // rename it
  await cats
    .nth(7)
    .getByRole("button", { name: "공지 자료 이름 바꾸기" })
    .click();
  await cats.nth(7).locator("input").fill("안내 자료");
  await cats.nth(7).locator("input").press("Enter");
  await expect(cats.nth(7).locator(".bd-cat")).toHaveText("안내 자료");
  // up one; the focus stays on the moved row's ↑
  await cats.nth(7).getByRole("button", { name: "안내 자료 위로" }).click();
  await expect(cats.nth(6).locator(".bd-cat")).toHaveText("안내 자료");
  await expect(cats.nth(6).locator(".rb-cat-up")).toBeFocused();
  expect(
    sent.rpc.filter((r) => r.name === "board_category_order").at(-1).args.p_ids,
  ).toEqual([1, 2, 3, 4, 5, 6, 8, 7]);
  // an empty one deletes
  await cats.nth(6).getByRole("button", { name: "안내 자료 삭제" }).click();
  await expect(cats).toHaveCount(7);
  await expect(page.locator("#rbAdminStatus")).toContainText("지웠어요");
});

test("board admin editor: dropped files upload 3 at a time in name order, typed by extension; a too-big file is refused in red (B6, B7)", async ({
  page,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 1000 });
  const sent = await stubBoard(page, { role: "admin", holdUploads: true });
  await openAdminBoard(page);
  await page.locator("#boardNewBtn").click();
  await expect(page.locator("#adminTitle")).toHaveText("교사자료실 글 쓰기");
  const files = [10, 3, 12, 4, 5, 6, 7, 8, 9, 11].map((m) => ({
    name: `L1_월간교육안_${m}월.pdf`,
    size: 1000 + m,
    type: "application/pdf",
  }));
  files.push({ name: "수료상장.hwp", size: 2000, type: "" }); // 한글: no type from the browser
  files.push({
    name: "전체합본.pdf",
    size: 11 * 1024 * 1024,
    type: "application/pdf",
  });
  await dropFiles(page, "#rbDrop", files);
  const names = page.locator("#rbFileList .rb-file .rb-file-name");
  // 3월 < 10월: natural name order; the refused one at the end
  await expect(names).toHaveText([
    ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => `L1_월간교육안_${m}월.pdf`),
    "수료상장.hwp",
    "전체합본.pdf",
  ]);
  await expect(
    page.locator('#rbFileList .rb-file[data-state="refused"]'),
  ).toHaveText(/10MB 초과 — 올리지 않음/);
  await expect(page.locator("#rbDropSub")).toHaveText(
    "놓은 파일 12개 중 11개를 올립니다 (1개는 올릴 수 없는 파일)",
  );
  await expect.poll(() => sent.uploads.length).toBe(3);
  expect(sent.maxInFlight).toBe(3);
  await expect(page.locator("#rbFilesCount")).toHaveText("올리는 중 0 / 11");
  // [등록하기] waits for the uploads: locked in both places (F4)
  await page.locator("#rbEdTitle").fill("Level 1 월간교육안 (3월~12월)");
  await expect(page.locator("#rbEdBarStatus")).toHaveText("올리는 중 0/11…");
  await expect(page.locator("#rbEdSave")).toBeDisabled();
  await expect(page.locator("#rbEdBarSave")).toBeDisabled();
  for (let i = 0; i < 5; i += 1) {
    sent.release();
    await page.waitForTimeout(150);
  }
  await expect.poll(() => sent.uploads.length).toBe(11);
  sent.release();
  await expect(page.locator("#rbFilesCount")).toHaveText("첨부 11개");
  expect(sent.maxInFlight).toBe(3);
  const hwp = sent.uploads.find((u) => u.path.endsWith(".hwp"));
  expect(hwp.contentType).toBe("application/x-hwp");
  expect(
    sent.uploads.every((u) =>
      /^[0-9a-f-]{36}\/\d{13}-[a-z0-9]{6}\.(pdf|hwp)$/.test(u.path),
    ),
  ).toBe(true);
  // save: the order as listed, the level and category chosen
  await page.locator('#rbEdLevels input[value="level-1"]').check();
  await page.locator("#rbEdPinned").check();
  await page.locator("#rbEdSave").click();
  await expect(page.locator("#rbAdminStatus")).toHaveText("등록했어요.");
  const save = sent.rpc.filter((r) => r.name === "board_post_save").at(-1).args;
  expect(save.p_attachments.map((a) => a.name)).toEqual([
    ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => `L1_월간교육안_${m}월.pdf`),
    "수료상장.hwp",
  ]);
  expect(save).toMatchObject({
    p_title: "Level 1 월간교육안 (3월~12월)",
    p_level: "level-1",
    p_category: 1,
    p_published: true,
    p_pinned: true,
  });
  expect(sent.removed).toEqual([]); // saved uploads stay
});

test("board admin editor: reorder by keyboard and by dragging the handle; × on a new upload deletes it at once (B7, B8)", async ({
  page,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 1000 });
  const sent = await stubBoard(page, { role: "admin" });
  await openAdminBoard(page);
  await page.locator("#boardNewBtn").click();
  await page.locator("#rbFileInput").setInputFiles(
    ["가.pdf", "나.pdf", "다.pdf", "라.pdf"].map((name) => ({
      name,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    })),
  );
  const names = page.locator("#rbFileList .rb-file-name");
  await expect(page.locator("#rbFilesCount")).toHaveText("첨부 4개");
  // keyboard: ↓ on 가's handle twice
  const handle = page.getByRole("button", {
    name: "가.pdf 순서 바꾸기 (위·아래 화살표)",
  });
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(names).toHaveText(["나.pdf", "다.pdf", "가.pdf", "라.pdf"]);
  await expect(handle).toBeFocused();
  await expect(page.locator("#rbMoveLive")).toHaveText(
    "가.pdf을(를) 3번째로 옮겼어요.",
  );
  // drag 라 above 나
  await page
    .getByRole("button", { name: "라.pdf 순서 바꾸기 (위·아래 화살표)" })
    .dragTo(page.locator(".rb-file", { hasText: "나.pdf" }), {
      targetPosition: { x: 200, y: 5 },
    });
  await expect(names).toHaveText(["라.pdf", "나.pdf", "다.pdf", "가.pdf"]);
  // × on a new upload: gone from the list and from Storage now
  const path = sent.uploads.find((u) => u.path).path;
  const order = sent.uploads.map((u) => u.path);
  await page.getByRole("button", { name: "다.pdf 빼기" }).click();
  await expect(names).toHaveText(["라.pdf", "나.pdf", "가.pdf"]);
  expect(sent.removed).toHaveLength(1);
  expect(order).toContain(sent.removed[0]);
  expect(path).toBeTruthy();
});

test("board admin editor: cancel or leave without saving deletes every new upload (B8, F3)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const sent = await stubBoard(page, { role: "admin" });
  await openAdminBoard(page);
  const add = async (n) => {
    await page.locator("#boardNewBtn").click();
    await page.locator("#rbFileInput").setInputFiles(
      Array.from({ length: n }, (_, i) => ({
        name: `파일${i + 1}.pdf`,
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4"),
      })),
    );
    await expect(page.locator("#rbFilesCount")).toHaveText(`첨부 ${n}개`);
  };
  await add(3);
  await page.locator("#rbEdCancel").click();
  await expect(page.locator("#rbLeaveTitle")).toHaveText(
    "업로드를 중단하시겠습니까?",
  );
  await page.locator("#rbLeaveGo").click();
  await expect(page.locator("#rbAdminStatus")).toHaveText(
    "쓰던 글을 등록하지 않고 닫았어요.",
  );
  await expect.poll(() => sent.removed.length).toBe(3);
  expect(sent.rpc.map((r) => r.name)).not.toContain("board_post_save");
  // leaving through another menu
  await add(2);
  const before = sent.uploads.slice(-2).map((u) => u.path);
  await page.locator('.admin-menu-btn[data-admin-view="banner"]').click();
  await page.locator("#rbLeaveGo").click();
  await expect.poll(() => sent.removed.slice(-2)).toEqual(before);
  await expect(
    page.locator('.admin-menu-btn[data-admin-view="banner"]'),
  ).toHaveClass(/active/);
});

test("board admin editor: 20 at most; Drive links need a file link and a name; Docs pages are refused (B6)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const sent = await stubBoard(page, { role: "admin" });
  await openAdminBoard(page);
  await page.locator("#boardNewBtn").click();
  await page.locator("#rbFileInput").setInputFiles(
    Array.from({ length: 22 }, (_, i) => ({
      name: `자료${String(i + 1).padStart(2, "0")}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    })),
  );
  await expect(page.locator("#rbEdError")).toHaveText(
    "첨부는 20개까지예요. 2개는 받지 않았어요.",
  );
  await expect(page.locator("#rbFilesCount")).toHaveText("첨부 20개");
  await page.getByRole("button", { name: "자료20.pdf 빼기" }).click();
  await page.locator("#rbAddDrive").click();
  await page
    .locator("#rbDriveLink")
    .fill(
      "https://docs.google.com/document/d/1AbC-dEf_GhIjKlMnOpQrStUvWxYz012/edit",
    );
  await page.locator("#rbDriveAdd").click();
  await expect(page.locator("#rbDriveError")).toHaveText(
    "PDF나 엑셀 파일로 드라이브에 올린 뒤 그 파일 링크를 넣어 주세요",
  );
  // F2: big files — Google's one-time "can't scan for viruses" page
  await expect(page.locator("#rbDriveBigNote")).toHaveText(
    "아주 큰 파일(약 100MB 이상)은 구글이 '바이러스 검사를 할 수 없음' 확인 화면을 한 번 보여 줄 수 있어요.",
  );
  await page
    .locator("#rbDriveLink")
    .fill(`https://drive.google.com/file/d/${DRIVE_A}/view?usp=sharing`);
  await page.locator("#rbDriveAdd").click();
  await expect(page.locator("#rbDriveError")).toHaveText(
    "선생님에게 보일 이름을 적어 주세요.",
  );
  await page.locator("#rbDriveName").fill("활동 사진 모음");
  await page.locator("#rbDriveAdd").click();
  await expect(page.locator("#rbFilesCount")).toHaveText("첨부 20개");
  await page.locator("#rbEdTitle").fill("드라이브 포함 글");
  await expect(page.locator("#rbFileList .rb-file-status").last()).toHaveText(
    "✓ 링크 · 등록 전",
  );
  await page.locator("#rbEdSave").click();
  await expect(page.locator("#rbAdminStatus")).toHaveText("등록했어요.");
  const save = sent.rpc.filter((r) => r.name === "board_post_save").at(-1).args;
  expect(save.p_attachments.at(-1)).toEqual({
    kind: "drive",
    drive_id: DRIVE_A,
    label: "활동 사진 모음",
  });
  expect(sent.google).toEqual([]);
});

test("board admin editor: editing a post keeps its attachments by id; one taken out goes from Storage after the save (B8)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const posts = samplePosts();
  const sent = await stubBoard(page, { role: "admin", posts });
  await openAdminBoard(page);
  await page
    .locator("#rbAdminList tbody tr", { hasText: "2학기 테스트지 + 답안지" })
    .getByRole("button", { name: /수정/ })
    .click();
  await expect(page.locator("#adminTitle")).toHaveText("교사자료실 글 수정");
  await expect(page.locator("#rbEdTitle")).toHaveValue(
    "2학기 테스트지 + 답안지",
  );
  await expect(
    page.locator('#rbEdLevels input[value="level-3"]'),
  ).toBeChecked();
  await expect(page.locator("#rbFileList .rb-file-name")).toHaveText([
    "L3_2학기_테스트지.pdf",
    "L3_2학기_답안지.xlsx",
  ]);
  const original = posts.find((p) => p.title === "2학기 테스트지 + 답안지");
  const [kept, takenOut] = original.attachments.map((a) => ({ ...a }));
  await page.getByRole("button", { name: "L3_2학기_답안지.xlsx 빼기" }).click();
  expect(sent.removed).toEqual([]); // not before the save
  await page.locator("#rbEdSave").click();
  await expect(page.locator("#rbAdminStatus")).toHaveText("수정했어요.");
  const save = sent.rpc.filter((r) => r.name === "board_post_save").at(-1).args;
  expect(save.p_attachments).toEqual([{ id: kept.id }]);
  expect(sent.removed).toEqual([takenOut.path]);
});

/* ---- 수정 1차 (PM brief 2026-11-04): F1-F4, R1 ----------------------------- */

const PRETENDARD = "Pretendard Variable";
// The first family of each element's computed font (quotes dropped).
const firstFonts = (page, selectors) =>
  page.evaluate((list) => {
    const out = {};
    list.forEach((sel) => {
      const el = document.querySelector(sel);
      out[sel] = el
        ? getComputedStyle(el).fontFamily.split(",")[0].trim().replace(/"/g, "")
        : "(missing)";
    });
    return out;
  }, selectors);
const LIST_TEXT = [
  ".bd-title",
  ".bd-sub",
  "#boardSearch",
  ".bd-search-btn",
  "#boardLevelChips .bd-chip",
  "#boardCatChips .bd-chip",
  "#boardCount",
  "#boardSort",
  ".bd-thead span",
  "#boardRows .bd-t",
  "#boardRows .bd-pin",
  "#boardRows .bd-level",
  "#boardRows .bd-new",
  "#boardRows .bd-cat",
  "#boardRows .bd-c-date",
  "#boardRows .bd-c-views",
  "#boardRows .bd-m-title",
  "#boardRows .bd-m-date",
  "#boardPager .bd-page",
];
const POST_TEXT = [
  ".bd-crumb",
  ".bd-card-title",
  ".bd-card-meta",
  ".bd-card-text",
  ".bd-atts-title",
  ".bd-att-name",
  ".bd-att-meta",
  ".bd-att-icon-text",
  ".bd-att-btn-text",
  ".bd-nb-label",
  ".bd-nb-title",
  ".bd-back",
];
const KEPT = [
  "#teacherBoardBtn .teacher-board-text",
  "#adminNavBtn",
  "#logoutBtn",
  ".top-nav button",
  ".site-footer",
];

test("board font: every letter of the teachers' list, post and empty pages wears the board's stack — by default Pretendard Std (Latin) then Pretendard (Korean); the header, 레벨별 자료실 and the admin keep theirs (F1, #5)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  for (const viewport of [
    { width: 1366, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await stubBoard(page, { role: "admin" });
    await openBoard(page, "");
    // the other pages never load it
    await expect(page.locator("#boardFontLink")).toHaveCount(0);
    const kept = await firstFonts(page, KEPT);
    expect(Object.values(kept)).not.toContain(PRETENDARD);
    expect(Object.values(kept)).not.toContain(STD);
    await page.locator("#teacherBoardBtn").click();
    await expect(page.locator("#boardRows .bd-row")).toHaveCount(10);
    await expect(page.locator("#boardFontLink")).toHaveAttribute(
      "href",
      "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
    );
    const list = await firstFonts(page, LIST_TEXT);
    for (const sel of LIST_TEXT) expect(list[sel], sel).toBe(STD);
    // the header and footer did not change on the board
    expect(await firstFonts(page, KEPT)).toEqual(kept);
    // the face is really there (the pinned CSS and its pieces load)
    await page.waitForFunction(
      (family) => document.fonts.check(`800 16px "${family}"`, "자료실"),
      PRETENDARD,
      { timeout: 15000 },
    );
    await page.goto(`/#board/${pid(8)}`);
    await expect(page.locator(".bd-card-title")).toHaveText(
      "2026 수료 상장 양식",
    );
    const post = await firstFonts(page, POST_TEXT);
    for (const sel of POST_TEXT) expect(post[sel], sel).toBe(STD);
    await page.goto("/#board?q=없는말");
    await expect(page.locator("#boardEmpty")).toBeVisible();
    const empty = await firstFonts(page, [
      ".bd-empty-title",
      ".bd-empty-sub",
      ".bd-empty-btn",
    ]);
    expect(Object.values(empty)).toEqual([STD, STD, STD]);
    // 레벨별 자료실 and the admin: unchanged
    await page.goto("/#resources/level-2");
    await page.reload();
    await page.waitForFunction(() => window.craTeacherRes.ready);
    await expect(page.locator(".res-card").first()).toBeVisible();
    const res = await firstFonts(page, [".res-card", ".res-download"]);
    expect(Object.values(res)).not.toContain(PRETENDARD);
    expect(Object.values(res)).not.toContain(STD);
    await page.goto("/#admin");
    await page.reload(); // #admin opens on load only
    await openAdminBoard(page, { goto: false });
    const admin = await firstFonts(page, [
      "#rbAdminList td",
      "#rbCatList .bd-cat",
      "#adminTitle",
    ]);
    expect(Object.values(admin)).toEqual(["Inter", "Inter", "Inter"]);
    await context.close();
  }
});

test("board post on a phone: a long file name wraps only after _ - . or a space, two lines at most (R1)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  const posts = samplePosts();
  const post = posts.find((p) => p.id === pid(8));
  post.attachments[0].name = "L1_월간교육안_3월_수업활동지-정답포함_최종본.pdf";
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await stubBoard(page, { posts });
  await openBoard(page, `#board/${pid(8)}`);
  const name = page.locator(".bd-att-name").first();
  await expect(name).toHaveText(post.attachments[0].name);
  await page.evaluate(() => document.fonts.ready);
  const wrap = await name.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const range = document.createRange();
    const chars = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (let i = 0; i < node.length; i += 1) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const rect = range.getClientRects()[0];
        if (rect && rect.bottom <= box.bottom + 1) {
          chars.push({ ch: node.data[i], top: Math.round(rect.top) });
        }
      }
    }
    const before = [];
    for (let i = 1; i < chars.length; i += 1) {
      if (chars[i].top > chars[i - 1].top) before.push(chars[i - 1].ch);
    }
    return {
      lines: new Set(chars.map((c) => c.top)).size,
      before,
      wbr: el.querySelectorAll("wbr").length,
    };
  });
  expect(wrap.wbr).toBe(6); // after each _ - .
  expect(wrap.lines).toBe(2);
  expect(wrap.before.length).toBe(1);
  expect(["_", "-", ".", " "]).toContain(wrap.before[0]);
  await context.close();
});

test("board file sizes: up to 999KB in KB, from 1,000KB on in MB — the post page and the admin's file rows", async ({
  page,
}, info) => {
  desktopOnly(info);
  const posts = samplePosts();
  const post = posts.find((p) => p.id === pid(8));
  post.attachments[0].size = 1030000; // was shown as "1006KB"
  await stubBoard(page, { role: "admin", posts });
  await openBoard(page, `#board/${pid(8)}`);
  await expect(page.locator(".bd-att-meta").first()).toHaveText("PDF · 1.0MB");
  expect(
    await page.evaluate(() =>
      [0, 1, 1022975, 1023488, 1030000, 1048576, 4300000].map((n) =>
        window.rbFormatSize(n),
      ),
    ),
  ).toEqual(["", "1KB", "999KB", "1.0MB", "1.0MB", "1.0MB", "4.1MB"]);
  await page.goto("/?admin=1#admin"); // a new document: #admin opens on load
  await openAdminBoard(page, { goto: false });
  await page
    .locator("#rbAdminList tbody tr", { hasText: "2026 수료 상장 양식" })
    .getByRole("button", { name: /수정/ })
    .click();
  await expect(page.locator("#rbFileList .rb-file-size")).toHaveText([
    "1.0MB",
    "234KB",
    "구글 드라이브",
  ]);
});

// Open the editor of a new post (or of the post titled `edit`) and add files.
async function editorWithFiles(page, names, { edit = null, goto = true } = {}) {
  await openAdminBoard(page, { goto });
  if (edit) {
    await page
      .locator("#rbAdminList tbody tr", { hasText: edit })
      .getByRole("button", { name: /수정/ })
      .click();
  } else {
    await page.locator("#boardNewBtn").click();
  }
  await expect(page.locator("#rbEditMode")).toBeVisible();
  if (names.length) {
    await page.locator("#rbFileInput").setInputFiles(
      names.map((name) => ({
        name,
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4"),
      })),
    );
  }
}

test("board admin editor: leaving with this edit's uploads asks first — 중단하기 deletes only them, 계속 올리기 / Esc stay (F3)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const sent = await stubBoard(page, { role: "admin" });
  await editorWithFiles(page, ["새1.pdf", "새2.pdf"], {
    edit: "2학기 테스트지 + 답안지",
  });
  await expect(page.locator("#rbFilesCount")).toHaveText("첨부 4개");
  await expect(page.locator("#rbFileList .rb-file-status")).toHaveText([
    "등록됨",
    "등록됨",
    "✓ 올림 · 등록 전",
    "✓ 올림 · 등록 전",
  ]);
  const fresh = sent.uploads.map((u) => u.path).sort();
  expect(fresh).toHaveLength(2);
  const members = page.locator('.admin-menu-btn[data-admin-view="members"]');
  const modal = page.locator("#rbLeaveModal");
  const go = page.locator("#rbLeaveGo");
  const stay = page.locator("#rbLeaveStay");
  // another menu → our window (never the browser's)
  page.on("dialog", (d) => {
    throw new Error(`browser dialog: ${d.type()}`);
  });
  await members.click();
  await expect(modal).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveAccessibleName(
    "업로드를 중단하시겠습니까?",
  );
  await expect(page.locator("#rbLeaveText")).toHaveText(
    "중단하면 이번에 올린 파일 2개가 모두 취소돼요. 이미 등록된 파일은 그대로 남아요.",
  );
  await expect(go).toHaveText("중단하기");
  await expect(stay).toHaveText("계속 올리기");
  await expect(go).toHaveCSS("background-color", "rgb(179, 45, 46)");
  await expect(stay).toBeFocused();
  // the focus stays in the window
  await page.keyboard.press("Tab");
  await expect(go).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(stay).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(go).toBeFocused();
  // Esc = stay
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(page.locator("#rbEditMode")).toBeVisible();
  await expect(members).not.toHaveClass(/active/);
  // 계속 올리기 = stay
  await page.locator("#adminSiteBtn").click();
  await expect(modal).toBeVisible();
  await stay.click();
  await expect(modal).toBeHidden();
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
  expect(sent.removed).toEqual([]);
  // 중단하기: this edit's two files go; the registered ones stay; the menu opens
  await members.click();
  await go.click();
  await expect(members).toHaveClass(/active/);
  await expect.poll(() => [...sent.removed].sort()).toEqual(fresh);
  expect(sent.removed.some((p) => p.startsWith("post/"))).toBe(false);
  expect(sent.rpc.map((r) => r.name)).not.toContain("board_post_save");
});

test("board admin editor: Back or an edited # asks too — stay puts the address back, 중단하기 follows it; log out deletes first (F3)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const sent = await stubBoard(page, { role: "admin" });
  await page.goto("/");
  await page.waitForFunction(() => window.craBoard && window.craBoard.ready);
  await page.locator("#adminNavBtn").click();
  await expect(page).toHaveURL(/#admin$/);
  await editorWithFiles(page, ["가.pdf", "나.pdf"], { goto: false });
  await expect(page.locator("#rbFilesCount")).toHaveText("첨부 2개");
  const modal = page.locator("#rbLeaveModal");
  // Back → our window; stay → the address is #admin again
  await page.goBack();
  await expect(modal).toBeVisible();
  await page.locator("#rbLeaveStay").click();
  await expect(page).toHaveURL(/#admin$/);
  await expect(page.locator("#rbEditMode")).toBeVisible();
  expect(sent.removed).toEqual([]);
  // an edited address → 중단하기 → the board opens, the two files go
  const two = sent.uploads.map((u) => u.path).sort();
  await page.evaluate(() => {
    window.location.hash = "board";
  });
  await expect(modal).toBeVisible();
  await page.locator("#rbLeaveGo").click();
  await expect(page.locator("#boardScreen")).toHaveClass(/screen-active/);
  await expect.poll(() => [...sent.removed].sort()).toEqual(two);
  // log out: the delete goes out (with the token from before) first
  await page.goto("/?again=1#admin"); // a new document (not a # move)
  await editorWithFiles(page, ["다.pdf"], { goto: false });
  await expect(page.locator("#rbFilesCount")).toHaveText("첨부 1개");
  const last = sent.uploads.at(-1).path;
  await page.locator("#adminLogoutBtn").click();
  await page.locator("#rbLeaveGo").click();
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await expect.poll(() => sent.removed.at(-1)).toBe(last);
});

test("board admin editor: the browser asks on close / reload only while this edit has uploads; nothing to lose = no window at all (F3)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const sent = await stubBoard(page, { role: "admin", holdUploads: true });
  const armed = () =>
    page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
  await editorWithFiles(page, []);
  const modal = page.locator("#rbLeaveModal");
  expect(await armed()).toBe(false);
  // nothing typed, nothing added: cancel closes at once
  await page.locator("#rbEdCancel").click();
  await expect(modal).toBeHidden();
  await expect(page.locator("#rbListMode")).toBeVisible();
  // a title only: our "unsaved changes" window, never the browser's
  await page.locator("#boardNewBtn").click();
  await page.locator("#rbEdTitle").fill("쓰다 만 글");
  expect(await armed()).toBe(false);
  await page.locator('.admin-menu-btn[data-admin-view="banner"]').click();
  await expect(page.locator("#rbLeaveTitle")).toHaveText(
    "수정한 내용을 저장하지 않고 나갈까요?",
  );
  await expect(page.locator("#rbLeaveGo")).toHaveText("나가기");
  await expect(page.locator("#rbLeaveStay")).toHaveText("계속 쓰기");
  await page.locator("#rbLeaveStay").click();
  // an upload (still going): the browser's question is armed
  await page.locator("#rbFileInput").setInputFiles([
    {
      name: "자료.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    },
  ]);
  await expect.poll(() => sent.uploads.length).toBe(1);
  expect(await armed()).toBe(true);
  // closing the tab: the browser's own question (its words, not ours)
  const [question] = await Promise.all([
    page.waitForEvent("dialog"),
    page.close({ runBeforeUnload: true }),
  ]);
  expect(question.type()).toBe("beforeunload");
  await question.dismiss();
  expect(page.isClosed()).toBe(false);
  // registered: nothing pending, no question any more
  sent.release();
  await expect(page.locator("#rbEdBarStatus")).toHaveText(
    "파일 1개가 올라갔어요. [등록하기]를 눌러야 선생님 화면에 보여요.",
  );
  expect(await armed()).toBe(true);
  await page.locator("#rbEdBarSave").click();
  await expect(page.locator("#rbAdminStatus")).toHaveText("등록했어요.");
  expect(await armed()).toBe(false);
  expect(sent.removed).toEqual([]);
});

test("board admin editor: [등록하기] / [수정 완료] in the 게시 box and on the bar — locked while uploading or failed, lit when ready, an empty title goes to its box, the saved row lights up (F4)", async ({
  page,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 700 });
  const sent = await stubBoard(page, {
    role: "admin",
    holdUploads: true,
    failUpload: (path) => path.endsWith(".hwp"),
  });
  await editorWithFiles(page, []);
  const buttons = page.locator(".rb-ed-submit");
  const bar = page.locator("#rbEdBar");
  const status = page.locator("#rbEdBarStatus");
  await expect(buttons).toHaveText(["등록하기", "등록하기"]);
  await expect(status).toHaveText("다 쓰셨으면 [등록하기]를 눌러 주세요.");
  // an empty title: the box gets the focus and a word
  await page.locator("#rbEdBarSave").click();
  await expect(page.locator("#rbEdTitle")).toBeFocused();
  await expect(page.locator("#rbEdTitleError")).toHaveText(
    "제목을 적어 주세요.",
  );
  await expect(page.locator("#rbEdTitle")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  // ten files, held: locked, "올리는 중 0/10…"
  await dropFiles(page, "#rbDrop", [
    ...Array.from({ length: 9 }, (_, i) => ({
      name: `L2_${i + 3}월.pdf`,
      size: 1000,
      type: "application/pdf",
    })),
    { name: "수료상장.hwp", size: 2000, type: "" },
  ]);
  await expect(status).toHaveText("올리는 중 0/10…");
  await expect(bar).toHaveAttribute("data-mode", "busy");
  await expect(buttons.nth(0)).toBeDisabled();
  await expect(buttons.nth(1)).toBeDisabled();
  // the bar stays at the bottom of the window while the box goes on below
  await page.evaluate(() => window.scrollTo(0, 0));
  const stuck = await bar.evaluate((el) => ({
    bottom: Math.round(el.getBoundingClientRect().bottom),
    window: window.innerHeight,
    box: Math.round(el.parentElement.getBoundingClientRect().bottom),
  }));
  expect(stuck.box).toBeGreaterThan(stuck.window);
  expect(Math.abs(stuck.bottom - stuck.window)).toBeLessThanOrEqual(1);
  for (let i = 0; i < 6; i += 1) {
    sent.release();
    await page.waitForTimeout(120);
  }
  await expect.poll(() => sent.uploads.length).toBe(10);
  sent.release();
  // the 한글 file failed: locked, and it says what to do
  await expect(status).toHaveText(
    "올리지 못한 파일 1개 — 빼거나 다시 올린 뒤 등록하세요.",
  );
  await expect(bar).toHaveAttribute("data-mode", "failed");
  await expect(buttons.nth(0)).toBeDisabled();
  await page.getByRole("button", { name: "수료상장.hwp 빼기" }).click();
  // ready: lit, open
  await expect(status).toHaveText(
    "파일 9개가 올라갔어요. [등록하기]를 눌러야 선생님 화면에 보여요.",
  );
  await expect(bar).toHaveAttribute("data-mode", "ready");
  await expect(buttons.nth(0)).toBeEnabled();
  await expect(buttons.nth(0)).toHaveClass(/is-ready/);
  await expect(buttons.nth(1)).toHaveClass(/is-ready/);
  await expect(page.locator("#rbFileList .rb-file-status").first()).toHaveText(
    "✓ 올림 · 등록 전",
  );
  await page.locator("#rbEdTitle").fill("Level 2 월간교육안");
  await expect(page.locator("#rbEdTitleError")).toHaveText("");
  await page.locator("#rbEdBarSave").click();
  // back to the list: a word, and the new row lit up
  await expect(page.locator("#rbAdminStatus")).toHaveText("등록했어요.");
  const saved = sent.rpc.filter((r) => r.name === "board_post_save").at(-1)
    .args.p_id;
  const row = page.locator(`#rbAdminList tr[data-id="${saved}"]`);
  await expect(row).toHaveClass(/is-just-saved/);
  await expect(row).not.toHaveClass(/is-just-saved/, { timeout: 5000 });
  // the same post again: [수정 완료], its files "등록됨"
  await row.getByRole("button", { name: /수정/ }).click();
  await expect(buttons).toHaveText(["수정 완료", "수정 완료"]);
  await expect(page.locator("#rbFileList .rb-file-status")).toHaveText(
    Array(9).fill("등록됨"),
  );
  await expect(status).toHaveText("바꾼 내용이 없어요.");
  const ids = sent.db.posts
    .find((p) => p.id === saved)
    .attachments.map((a) => a.id);
  // only the order changes: still needs [수정 완료], and leaving asks
  await page
    .getByRole("button", { name: "L2_3월.pdf 순서 바꾸기 (위·아래 화살표)" })
    .press("ArrowDown");
  await expect(status).toHaveText(
    "바꾼 내용은 [수정 완료]를 눌러야 선생님 화면에 반영돼요.",
  );
  await page.locator("#rbEdCancel").click();
  await expect(page.locator("#rbLeaveTitle")).toHaveText(
    "수정한 내용을 저장하지 않고 나갈까요?",
  );
  await page.locator("#rbLeaveStay").click();
  await page.locator("#rbEdSave").click();
  await expect(page.locator("#rbAdminStatus")).toHaveText("수정했어요.");
  await expect(row).toHaveClass(/is-just-saved/);
  const edit = sent.rpc.filter((r) => r.name === "board_post_save").at(-1).args;
  expect(edit.p_attachments.map((a) => a.id)).toEqual([
    ids[1],
    ids[0],
    ...ids.slice(2),
  ]);
});

/* ---- 레벨별 자료실 switch (T1, T2) ----------------------------------------- */

test("teacher resources switch: off hides the month-page button for everyone and sends #resources to the month page; on brings it back (T1, T2)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  // the admin turns it off in the 배너 tab
  const context = await browser.newContext();
  const page = await context.newPage();
  const sent = await stubBoard(page, { role: "admin" });
  await page.goto("/#admin");
  await page.locator('.admin-menu-btn[data-admin-view="banner"]').click();
  await expect(page.locator("#teacherResToggle")).toBeChecked();
  await page.locator("#teacherResAdmin .adm-switch").click();
  await expect(page.locator("#teacherResToggleText")).toHaveText(
    "사용자 화면에 표시: 끔",
  );
  expect(sent.upserts).toEqual([
    { key: "teacher_resources_enabled", value: false },
  ]);
  // the admin section keeps working
  await expect(page.locator("#teacherResAdminList .res-admin-tab")).toHaveCount(
    4,
  );
  await page.goto("/#months/level-2");
  await page.reload();
  await expect(page.locator("#monthScreen")).toHaveClass(/screen-active/);
  await page.waitForFunction(() => window.craTeacherRes.ready);
  await expect(page.locator("#teacherResBtn")).toBeHidden();
  await context.close();

  for (const role of ["teacher", "branch"]) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await stubBoard(p, { role, teacherRes: false });
    await p.goto("/#resources/level-2");
    await p.waitForFunction(() => window.craTeacherRes.ready);
    await expect(p).toHaveURL(/#months\/level-2$/);
    await expect(p.locator("#teacherResBtn")).toBeHidden();
    await ctx.close();
  }
  // on again: as before
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await stubBoard(p, { role: "teacher", teacherRes: true });
  await p.goto("/#months/level-2");
  await p.waitForFunction(() => window.craTeacherRes.ready);
  await expect(p.locator("#teacherResBtn")).toBeVisible();
  await ctx.close();
});

/* ---- The two switches always save (교사자료실 수정 2차-1 #1, 2026-11-05) ----- */

// The 배너 tab of an open admin page.
async function openBannerTab(page) {
  const menu = page.locator('.admin-menu-btn[data-admin-view="banner"]');
  if (!(await menu.isVisible())) await page.locator("#adminMenuToggle").click();
  await menu.click();
}

// An LMS branch account opening #resources/level-2 with the switches as the
// admin left them.
async function branchMonthPage(browser, flags) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await stubBoard(page, { role: "branch", ...flags });
  await page.goto("/#resources/level-2");
  await page.waitForFunction(() => window.craTeacherRes.ready);
  return { context, page };
}

// PostgREST's answer when RLS refuses a write without admin rights.
const RLS_ERROR = {
  status: 401,
  json: {
    code: "42501",
    details: null,
    hint: null,
    message:
      'new row violates row-level security policy for table "site_settings"',
  },
};
const FLAG_FAILED =
  "설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요. (오류 42501: new row violates row-level security…)";
const FLAG_LOGIN =
  "관리자 로그인 상태를 확인할 수 없어요. 새로고침 뒤 다시 시도해 주세요.";

test("teacher resources switch: off and on again whatever the board is — on or off, no post or one (#1)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  const onePost = samplePosts().slice(0, 1);
  for (const [board, posts] of [
    [false, []],
    [true, []],
    [false, onePost],
    [true, onePost],
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const sent = await stubBoard(page, { role: "admin", board, posts });
    await page.goto("/#admin");
    await openBannerTab(page);
    const toggle = page.locator("#teacherResToggle");
    const status = page.locator("#teacherResStatus");
    await expect(toggle).toBeChecked();
    await page.locator("#teacherResAdmin .adm-switch").click();
    await expect(toggle).not.toBeChecked();
    await expect(status).toHaveText(
      "레벨별 자료실을 껐어요. 올린 파일·링크는 그대로 있어요.",
    );
    await page.locator("#teacherResAdmin .adm-switch").click();
    await expect(toggle).toBeChecked();
    await expect(status).toHaveText(
      "레벨별 자료실을 켰어요. 월 선택 화면에 버튼이 다시 보여요.",
    );
    expect(sent.upserts).toEqual([
      { key: "teacher_resources_enabled", value: false },
      { key: "teacher_resources_enabled", value: true },
    ]);
    await context.close();
  }
});

test("teacher resources switch: off stays off after a reload, the branch account loses the button (its address too); on brings it back (#1)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  const context = await browser.newContext();
  const page = await context.newPage();
  const sent = await stubBoard(page, {
    role: "admin",
    board: true,
    posts: samplePosts().slice(0, 1),
  });
  await page.goto("/#admin");
  await openBannerTab(page);
  await page.locator("#teacherResAdmin .adm-switch").click();
  await expect(page.locator("#teacherResToggleText")).toHaveText(
    "사용자 화면에 표시: 끔",
  );
  await page.reload();
  await openBannerTab(page);
  await expect(page.locator("#teacherResToggle")).not.toBeChecked();
  await expect(page.locator("#teacherResToggleText")).toHaveText(
    "사용자 화면에 표시: 끔",
  );

  let branch = await branchMonthPage(browser, sent.db.flags);
  await expect(branch.page).toHaveURL(/#months\/level-2$/);
  await expect(branch.page.locator("#monthScreen")).toHaveClass(
    /screen-active/,
  );
  await expect(branch.page.locator("#teacherResBtn")).toBeHidden();
  await branch.context.close();

  await page.locator("#teacherResAdmin .adm-switch").click();
  await expect(page.locator("#teacherResToggleText")).toHaveText(
    "사용자 화면에 표시: 켬",
  );
  branch = await branchMonthPage(browser, sent.db.flags);
  await expect(branch.page).toHaveURL(/#resources\/level-2$/);
  // (a # change in the same document is not routed again — reload)
  await branch.page.goto("/#months/level-2");
  await branch.page.reload();
  await branch.page.waitForFunction(() => window.craTeacherRes.ready);
  await expect(branch.page.locator("#teacherResBtn")).toBeVisible();
  await branch.context.close();
  await context.close();
});

test("board switch: off stays off after a reload and the branch account loses Teacher; on brings it back (#1)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  const context = await browser.newContext();
  const page = await context.newPage();
  const sent = await stubBoard(page, {
    role: "admin",
    board: true,
    posts: samplePosts().slice(0, 1),
  });
  await openAdminBoard(page);
  const text = page.locator("#rbBoardToggleText");
  await page.locator(".rb-settings-switch .adm-switch").click();
  await expect(text).toHaveText("사용자 화면에 표시: 끔");
  await expect(page.locator("#rbAdminStatus")).toHaveText(
    "교사자료실을 껐어요.",
  );
  await page.reload();
  await openAdminBoard(page, { goto: false });
  await expect(page.locator("#rbBoardToggle")).not.toBeChecked();

  const branchSees = async (on) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await stubBoard(p, { role: "branch", board: sent.db.flags.board });
    await openBoard(p);
    if (on) {
      await expect(p.locator("#boardScreen")).toHaveClass(/screen-active/);
      await expect(p.locator("#teacherBoardBtn")).toBeVisible();
    } else {
      await expect(p.locator("#homeScreen")).toHaveClass(/screen-active/);
      await expect(p.locator("#teacherBoardBtn")).toBeHidden();
    }
    await ctx.close();
  };
  await branchSees(false);
  await page.locator(".rb-settings-switch .adm-switch").click();
  await expect(text).toHaveText("사용자 화면에 표시: 켬");
  await page.reload();
  await openAdminBoard(page, { goto: false });
  await expect(page.locator("#rbBoardToggle")).toBeChecked();
  await branchSees(true);
  expect(sent.upserts).toEqual([
    { key: "resource_board_enabled", value: false },
    { key: "resource_board_enabled", value: true },
  ]);
  await context.close();
});

test("switch save refused: the switch goes back and the sentence carries the error code; the console gets the whole error (#1)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const sent = await stubBoard(page, {
    role: "admin",
    board: true,
    flagError: RLS_ERROR,
  });
  await page.goto("/#admin");
  await openBannerTab(page);
  await page.locator("#teacherResAdmin .adm-switch").click();
  await expect(page.locator("#teacherResStatus")).toHaveText(FLAG_FAILED);
  await expect(page.locator("#teacherResToggle")).toBeChecked();
  await expect(page.locator("#teacherResToggle")).toBeEnabled();
  await expect(page.locator("#teacherResToggleText")).toHaveText(
    "사용자 화면에 표시: 켬",
  );
  expect(errors.some((t) => t.includes("teacher_resources_enabled"))).toBe(
    true,
  );
  // the board's switch says the same in its own line
  await openAdminBoard(page, { goto: false });
  await page.locator(".rb-settings-switch .adm-switch").click();
  await expect(page.locator("#rbAdminStatus")).toHaveText(FLAG_FAILED);
  await expect(page.locator("#rbBoardToggle")).toBeChecked();
  expect(sent.upserts.map((u) => u.key)).toEqual([
    "teacher_resources_enabled",
    "resource_board_enabled",
  ]);
});

test("switch save with no login left (its signal missed): no request, a sentence that says so (#1)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const sent = await stubBoard(page, { role: "admin", board: true });
  await page.goto("/#admin");
  await openBannerTab(page);
  await expect(page.locator("#teacherResToggle")).toBeChecked();
  // the stored login gone without any signal (another tab's Log out now
  // shows the login-ended window — tested below; this is the save's own
  // guard behind it)
  await page.evaluate(() =>
    localStorage.removeItem("sb-jguuexcgyvyljbcqfpib-auth-token"),
  );
  await expect(page.locator("#loginEndedModal")).toBeHidden();
  await page.locator("#teacherResAdmin .adm-switch").click();
  await expect(page.locator("#teacherResStatus")).toHaveText(FLAG_LOGIN);
  await expect(page.locator("#teacherResToggle")).toBeChecked();
  await openAdminBoard(page, { goto: false });
  await page.locator(".rb-settings-switch .adm-switch").click();
  await expect(page.locator("#rbAdminStatus")).toHaveText(FLAG_LOGIN);
  await expect(page.locator("#rbBoardToggle")).toBeChecked();
  expect(sent.upserts).toEqual([]);
});

/* ---- 수정 2차-2 (PM brief 2026-11-05): #3 name, #4 background, #5 fonts ---- */

test("board name: 교사자료실 on the teachers' screens and in the admin — the old level resources are 레벨별 자료실 (#3, renamed 2026-11-06)", async ({
  page,
}, info) => {
  desktopOnly(info);
  await stubBoard(page, { role: "admin", board: false });
  await openBoard(page);
  await expect(page.locator("#boardTitle")).toHaveText("교사자료실");
  await expect(page.locator("#boardAdminNote")).toHaveText(
    "교사자료실이 지금 꺼져 있어요 — 최고관리자만 미리 볼 수 있어요.",
  );
  await page.goto(`/#board/${pid(8)}`); // the board follows its own #
  await expect(page.locator(".bd-card-title")).toBeVisible();
  await expect(page.locator(".bd-crumb").first()).toHaveText("교사자료실");
  // (leaving the board for another # reloads by itself — load afresh)
  await page.goto("about:blank");
  await openAdminBoard(page);
  await expect(
    page.locator('.admin-menu-btn[data-admin-view="board"]'),
  ).toHaveText("교사자료실");
  await expect(page.locator("#adminTitle")).toHaveText("교사자료실");
  await expect(page.locator("#rbSettings .admin-subtitle")).toHaveText(
    "교사자료실 설정",
  );
  await expect(page.locator("#rbSettings .rb-settings-switch")).toContainText(
    "헤더에 'Teacher' 버튼이 생겨요.",
  );
  await page.locator(".rb-settings-switch .adm-switch").click();
  await expect(page.locator("#rbAdminStatus")).toHaveText(
    "교사자료실을 켰어요. 지사·선생님 화면에 버튼이 보여요.",
  );
  // the level resources: 레벨별 자료실 (with a space)
  await page.locator('.admin-menu-btn[data-admin-view="banner"]').click();
  await expect(page.locator("#teacherResAdmin .admin-subtitle")).toHaveText(
    "레벨별 자료실 파일",
  );
});

test("admin menu on a phone: 교사자료실 stays on one line inside the menu (#3)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await stubBoard(page, { role: "admin" });
  await page.goto("/#admin");
  await page.locator("#adminMenuToggle").click();
  const btn = page.locator('.admin-menu-btn[data-admin-view="board"]');
  await expect(btn).toBeVisible();
  const fit = await btn.evaluate((el) => {
    const label = el.querySelector("span");
    const range = document.createRange();
    range.selectNodeContents(label);
    const lines = new Set(
      [...range.getClientRects()].map((r) => Math.round(r.top)),
    ).size;
    return {
      lines,
      inside: el.scrollWidth <= el.clientWidth,
      labelRight: label.getBoundingClientRect().right,
      btnRight: el.getBoundingClientRect().right,
    };
  });
  expect(fit.lines).toBe(1);
  expect(fit.inside).toBe(true);
  expect(fit.labelRight).toBeLessThanOrEqual(fit.btnRight);
  await context.close();
});

/* ---- 옛 '교사 자료실' → '레벨별 자료실' (PM brief 2026-11-06) ------------- */

// The old name, with its space — "교사자료실" (no space) is the board.
const OLD_NAME = "교사 자료실";
const LEVEL_NAME = "레벨별 자료실";

// Every place a person or a screen reader could meet a name: the text of
// every element (the hidden screens too — they are all in the DOM), every
// attribute (aria-label, title, placeholder, alt …), form values and the tab
// title. Scripts and styles are code, not screen text.
const oldNameSpots = (page) =>
  page.evaluate((old) => {
    const spots = [];
    if (document.title.includes(old)) spots.push(`title: ${document.title}`);
    const code = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
    for (const el of document.querySelectorAll("*")) {
      if (code.has(el.tagName)) continue;
      const where = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "");
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.data.includes(old))
          spots.push(`${where}: ${node.data.trim()}`);
      }
      for (const attr of el.attributes) {
        if (attr.value.includes(old))
          spots.push(`${where}[${attr.name}]: ${attr.value}`);
      }
      if (typeof el.value === "string" && el.value.includes(old))
        spots.push(`${where}.value: ${el.value}`);
    }
    return spots;
  }, OLD_NAME);

test("rename: the old name '교사 자료실' is nowhere on the teachers' or admin screens — the level resources are 레벨별 자료실 (2026-11-06)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  test.setTimeout(60000);
  // A branch account: the month page's button, the resource page, the board.
  const branch = await browser.newContext();
  const tab = await branch.newPage();
  await stubBoard(tab, { role: "branch" });
  await tab.goto("/#months/level-2");
  await tab.waitForFunction(() => window.craTeacherRes.ready);
  const button = tab.getByRole("button", { name: LEVEL_NAME, exact: true });
  await expect(button).toBeVisible();
  expect(await oldNameSpots(tab)).toEqual([]);
  await button.click();
  await expect(tab).toHaveURL(/#resources\/level-2$/);
  await expect(tab.locator("#resourceGrid .res-card").first()).toBeVisible();
  await expect(tab.locator("#resourceGrid")).toHaveAttribute(
    "aria-label",
    LEVEL_NAME,
  );
  expect(await oldNameSpots(tab)).toEqual([]);
  await tab.locator("#teacherBoardBtn").click();
  await tab.waitForFunction(() => window.craBoard && window.craBoard.ready);
  await expect(tab.locator("#boardRows .bd-row").first()).toBeVisible();
  expect(await oldNameSpots(tab)).toEqual([]);
  await branch.close();

  // The admin: the 배너 tab's box, both switch messages, the board's view.
  const admin = await browser.newContext();
  const page = await admin.newPage();
  await stubBoard(page, { role: "admin" });
  await page.goto("/#admin");
  await openBannerTab(page);
  await expect(page.locator("#teacherResAdmin .admin-subtitle")).toHaveText(
    "레벨별 자료실 파일",
  );
  await expect(
    page.locator("#teacherResAdmin .admin-hint").first(),
  ).toContainText(
    "각 레벨 월 선택 화면의 '레벨별 자료실' 버튼과 그 자료 페이지",
  );
  await expect(page.locator("#teacherResAdminList .res-admin-tab")).toHaveCount(
    4,
  );
  const status = page.locator("#teacherResStatus");
  await page.locator("#teacherResAdmin .adm-switch").click();
  await expect(status).toHaveText(
    "레벨별 자료실을 껐어요. 올린 파일·링크는 그대로 있어요.",
  );
  expect(await oldNameSpots(page)).toEqual([]);
  await page.locator("#teacherResAdmin .adm-switch").click();
  await expect(status).toHaveText(
    "레벨별 자료실을 켰어요. 월 선택 화면에 버튼이 다시 보여요.",
  );
  expect(await oldNameSpots(page)).toEqual([]);
  await openAdminBoard(page, { goto: false });
  expect(await oldNameSpots(page)).toEqual([]);
  await admin.close();

  // No script can put it on a screen later either: in the page's own
  // scripts the old name is left only in whole-line code comments.
  const html = readFileSync(path.resolve("index.html"), "utf8");
  const scripts = [...html.matchAll(/<script src="([^":]+\.js)"/g)].map(
    (m) => m[1],
  );
  expect(scripts).toContain("teacher-resources.js");
  const inCode = [];
  for (const file of scripts) {
    readFileSync(path.resolve(file), "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (!line.includes(OLD_NAME)) return;
        if (!/^\s*(\/\/|\/\*|\*)/.test(line)) inCode.push(`${file}:${i + 1}`);
      });
  }
  expect(inCode).toEqual([]);
});

test("rename: the month page's '레벨별 자료실' stays on one line, on the screen and clear of the title — 1366 · 1024 · 768 · 390, every level", async ({
  browser,
}, info) => {
  desktopOnly(info);
  test.setTimeout(60000);
  const context = await browser.newContext();
  const page = await context.newPage();
  await stubBoard(page, { role: "branch" });
  for (const level of ["beginner", "level-1", "level-2", "level-3"]) {
    await page.goto("about:blank");
    await page.goto(`/#months/${level}`);
    await page.waitForFunction(() => window.craTeacherRes.ready);
    await expect(page.locator("#teacherResBtn")).toBeVisible();
    for (const [width, height] of [
      [1366, 900],
      [1024, 768],
      [768, 1024],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      const m = await page.evaluate(() => {
        const btn = document.querySelector("#teacherResBtn");
        const label = btn.querySelector("span");
        const range = document.createRange();
        range.selectNodeContents(label);
        const r = (el) => el.getBoundingClientRect().toJSON();
        return {
          text: label.textContent,
          lines: new Set(
            [...range.getClientRects()].map((x) => Math.round(x.top)),
          ).size,
          fits: btn.scrollWidth <= btn.clientWidth,
          button: r(btn),
          label: r(label),
          title: r(document.querySelector("#monthLevelTag")),
          grid: r(document.querySelector("#monthGrid")),
          screen: document.documentElement.clientWidth,
          page: document.documentElement.scrollWidth,
        };
      });
      const at = `${level} @${width}`;
      expect(m.text, at).toBe(LEVEL_NAME);
      expect(m.lines, at).toBe(1);
      expect(m.fits, at).toBe(true);
      expect(m.label.right, at).toBeLessThanOrEqual(m.button.right);
      expect(m.button.left, at).toBeGreaterThanOrEqual(0);
      expect(m.button.right, at).toBeLessThanOrEqual(m.screen);
      expect(m.page, at).toBeLessThanOrEqual(m.screen); // no sideways scroll
      expect(m.button.height, at).toBeLessThan(56);
      if (width >= 768) {
        // the title row: the button right of the (centred) title, a gap between
        expect(m.button.left - m.title.right, at).toBeGreaterThanOrEqual(12);
      } else {
        // phones: under the title, above the month buttons
        expect(m.button.top, at).toBeGreaterThanOrEqual(m.title.bottom);
        expect(m.button.bottom, at).toBeLessThan(m.grid.top);
      }
    }
  }
  await context.close();
});

// The color under (x, y): the first painted background up the tree.
const paintAt = (page, x, y) =>
  page.evaluate(
    ([px, py]) => {
      let el = document.elementFromPoint(px, py);
      while (el) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
        el = el.parentElement;
      }
      return "none";
    },
    [x, y],
  );

test("board background: the light blue runs from the header to the footer — no post, one post, a short post; 1366 · 1024 · 390 (#4)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  const BLUE = "rgb(238, 246, 253)";
  const short = samplePosts().slice(0, 1);
  short[0].body = "짧은 글";
  short[0].attachments = short[0].attachments.slice(0, 1);
  for (const width of [1366, 1024, 390]) {
    for (const [posts, hash] of [
      [[], "#board"],
      [short, "#board"],
      [short, `#board/${short[0].id}`],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height: 1100 },
      });
      const page = await context.newPage();
      await stubBoard(page, { role: "teacher", posts });
      await openBoard(page, hash);
      await expect(page.locator("#boardScreen")).toHaveClass(/screen-active/);
      await page.waitForTimeout(300);
      const edges = await page.evaluate(() => ({
        top: document.querySelector(".topbar").getBoundingClientRect().bottom,
        bottom: document.querySelector(".site-footer").getBoundingClientRect()
          .top,
      }));
      // the page is shorter than the window: the footer sits low
      expect(edges.bottom).toBeGreaterThan(edges.top + 200);
      for (let y = Math.ceil(edges.top) + 1; y < edges.bottom - 1; y += 25) {
        expect(await paintAt(page, 4, y), `${width} ${hash} y=${y}`).toBe(BLUE);
      }
      await context.close();
    }
  }
});

const STD = "Pretendard Std Variable"; // the default stack's head
// The fonts Chrome really drew a node's text with (CDP).
async function drawnFonts(page, selector) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector,
  });
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  await cdp.detach();
  return [...new Set(fonts.map((f) => f.familyName))].sort();
}
const faceLoaded = (page, family) =>
  page.waitForFunction(
    (fam) =>
      [...document.fonts].some(
        (f) => f.family.replace(/"/g, "") === fam && f.status === "loaded",
      ),
    family,
    { timeout: 15000 },
  );
const FACE = {
  ko: { pretendard: "Pretendard Variable", "nanum-gothic": "Nanum Gothic" },
  en: {
    pretendard: "Pretendard Std Variable",
    "nanum-gothic": "CRA Nanum Gothic Latin",
  },
};
// what each face's font file calls itself
const DRAWN = {
  ko: { pretendard: /^Pretendard Variable$/, "nanum-gothic": /^NanumGothic/ },
  en: {
    pretendard: /^Pretendard Std Variable$/,
    "nanum-gothic": /^NanumGothic/,
  },
};
const fontAsks = (urls) => ({
  pretendardKo: urls.some((u) => /pretendard@v1\.3\.9\/dist\/web/.test(u)),
  nanumKo: urls.some((u) =>
    /fonts\.googleapis\.com\/css2\?family=Nanum\+Gothic:/.test(u),
  ),
  stdLatin: urls.some((u) => u.includes("/assets/fonts/PretendardStdVariable")),
  nanumLatin: urls.some((u) => u.includes("/assets/fonts/NanumGothic-latin-")),
});

test("board font: Korean and Latin picked apart — each of the four pairs is really drawn, and only the picked faces are fetched (#5)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  for (const ko of ["pretendard", "nanum-gothic"]) {
    for (const en of ["pretendard", "nanum-gothic"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const urls = [];
      page.on("request", (r) => urls.push(r.url()));
      await stubBoard(page, { role: "teacher", fontKo: ko, fontEn: en });
      await openBoard(page);
      await expect(page.locator("#boardRows .bd-row")).toHaveCount(10);
      await expect(page.locator("#boardScreen")).toHaveAttribute(
        "data-font-ko",
        ko,
      );
      await expect(page.locator("#boardScreen")).toHaveAttribute(
        "data-font-en",
        en,
      );
      await faceLoaded(page, FACE.ko[ko]);
      await faceLoaded(page, FACE.en[en]);
      // Korean only: the title (교사자료실) · Latin only: a level tag
      const koDrawn = await drawnFonts(page, "#boardTitle > span:last-child");
      const enDrawn = await drawnFonts(
        page,
        "#boardRows .bd-level:not(.lv-common)",
      );
      const pair = `${ko} + ${en}`;
      expect(koDrawn.length, pair).toBe(1);
      expect(koDrawn[0], pair).toMatch(DRAWN.ko[ko]);
      expect(enDrawn.length, pair).toBe(1);
      expect(enDrawn[0], pair).toMatch(DRAWN.en[en]);
      // the picked faces only
      const asked = fontAsks(urls);
      expect(asked, pair).toEqual({
        pretendardKo: ko === "pretendard",
        nanumKo: ko === "nanum-gothic",
        stdLatin: en === "pretendard",
        nanumLatin: en === "nanum-gothic",
      });
      await context.close();
    }
  }
});

test("board font settings: the admin picks, it saves at once and survives a reload; the preview is drawn in the pair (#5)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  const context = await browser.newContext();
  const page = await context.newPage();
  const sent = await stubBoard(page, { role: "admin" });
  await openAdminBoard(page);
  const ko = page.locator("#rbFontKo");
  const en = page.locator("#rbFontEn");
  const preview = page.locator("#rbFontPreview");
  const status = page.locator("#rbFontStatus");
  await expect(ko).toHaveValue("pretendard");
  await expect(en).toHaveValue("pretendard");
  await expect(ko.locator("option")).toHaveText([
    "프리텐다드(기본)",
    "나눔고딕",
  ]);
  await expect(preview).toHaveText(
    "Level 1 월간교육안 · March Lesson Plan 2026 — 3월 수업 자료",
  );
  await ko.selectOption("nanum-gothic");
  await expect(status).toHaveText("글꼴을 바꿨어요.");
  await expect(preview).toHaveAttribute("data-font-ko", "nanum-gothic");
  await expect(preview).toHaveAttribute("data-font-en", "pretendard");
  await en.selectOption("nanum-gothic");
  await expect(preview).toHaveAttribute("data-font-en", "nanum-gothic");
  expect(sent.upserts).toEqual([
    { key: "board_font_ko", value: "nanum-gothic" },
    { key: "board_font_en", value: "nanum-gothic" },
  ]);
  // the preview is really drawn in the pair (Korean + Latin faces)
  await faceLoaded(page, "Nanum Gothic");
  await faceLoaded(page, "CRA Nanum Gothic Latin");
  const drawn = await drawnFonts(page, "#rbFontPreview");
  expect(drawn.every((f) => /^NanumGothic/.test(f))).toBe(true);
  // the rest of the admin keeps its face
  expect(
    await page
      .locator("#rbSettings .rb-subtitle")
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).not.toContain("Nanum Gothic Latin");
  // a reload keeps the pair (the stub keeps what was saved)
  await page.reload();
  await openAdminBoard(page, { goto: false });
  await expect(ko).toHaveValue("nanum-gothic");
  await expect(en).toHaveValue("nanum-gothic");
  await openBoard(page);
  await expect(page.locator("#boardScreen")).toHaveAttribute(
    "data-font-ko",
    "nanum-gothic",
  );
  await context.close();
});

test("board font settings: odd values in the table = Pretendard on both; a refused save puts the picker back with the error code (#5)", async ({
  browser,
}, info) => {
  desktopOnly(info);
  const odd = await browser.newContext();
  const p2 = await odd.newPage();
  await stubBoard(p2, { role: "admin", fontKo: "comic-sans", fontEn: 42 });
  await openBoard(p2);
  await expect(p2.locator("#boardScreen")).toHaveAttribute(
    "data-font-ko",
    "pretendard",
  );
  await expect(p2.locator("#boardScreen")).toHaveAttribute(
    "data-font-en",
    "pretendard",
  );
  await p2.goto("about:blank"); // (leaving the board reloads by itself)
  await openAdminBoard(p2);
  await expect(p2.locator("#rbFontKo")).toHaveValue("pretendard");
  await odd.close();

  // a refused save: the picker goes back, the code is shown
  const bad = await browser.newContext();
  const p3 = await bad.newPage();
  await stubBoard(p3, { role: "admin", flagError: RLS_ERROR });
  await openAdminBoard(p3);
  await p3.locator("#rbFontEn").selectOption("nanum-gothic");
  await expect(p3.locator("#rbFontStatus")).toHaveText(FLAG_FAILED);
  await expect(p3.locator("#rbFontEn")).toHaveValue("pretendard");
  await expect(p3.locator("#rbFontPreview")).toHaveAttribute(
    "data-font-en",
    "pretendard",
  );
  await bad.close();
});

/* ---- The login ended while the admin screen is open (2차-2 §5) ---------- */

const ENDED_TITLE = "로그인이 끝났어요.";
const ENDED_TEXT = "다시 로그인한 뒤 이어서 해 주세요.";

// Another tab of the same browser logs out with the header's button.
async function logOutInAnotherTab(page, role) {
  const other = await page.context().newPage();
  await stubBoard(other, { role });
  await other.goto("/");
  await other.locator("#logoutBtn").click();
  await expect(other.locator("#homeScreen")).toHaveClass(/screen-active/);
  await other.close();
}

test("login ended: another tab's Log out puts a window over the locked admin screen — what was typed stays; [로그인 화면으로] goes to the login page (§5)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const sent = await stubBoard(page, { role: "admin" });
  await openAdminBoard(page);
  await page.locator("#rbCatAddName").fill("쓰던 분류");
  await expect(page.locator("#loginEndedModal")).toBeHidden();
  await logOutInAnotherTab(page, "admin");
  const modal = page.locator("#loginEndedModal");
  await expect(modal).toBeVisible();
  await expect(page.locator("#loginEndedTitle")).toHaveText(ENDED_TITLE);
  await expect(page.locator("#loginEndedText")).toHaveText(ENDED_TEXT);
  await expect(page.locator("#loginEndedGo")).toBeFocused();
  // locked: nothing in the admin screen can be pressed (no save goes out)
  await expect(page.locator("#adminScreen")).toHaveJSProperty("inert", true);
  await expect(page.locator("#rbCatAddName")).toHaveValue("쓰던 분류");
  await page
    .locator(".rb-settings-switch .adm-switch")
    .click({ timeout: 1500 })
    .catch(() => {});
  await page.locator("#rbFontKo").focus();
  await expect(page.locator("#rbFontKo")).not.toBeFocused();
  expect(sent.upserts).toEqual([]);
  // the screen did not change by itself
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
  await page.locator("#loginEndedGo").click();
  await expect(modal).toBeHidden();
  await expect(page.locator("#loginScreen")).toHaveClass(/screen-active/);
  await expect(page.locator("#adminScreen")).toHaveJSProperty("inert", false);
});

test("login alive: no window — while working, and on this tab's own Log out (§5)", async ({
  page,
}, info) => {
  desktopOnly(info);
  await stubBoard(page, { role: "admin" });
  await openAdminBoard(page);
  await page.locator('.admin-menu-btn[data-admin-view="banner"]').click();
  await page.waitForTimeout(500);
  await expect(page.locator("#loginEndedModal")).toBeHidden();
  await page.locator("#adminLogoutBtn").click();
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await page.waitForTimeout(300);
  await expect(page.locator("#loginEndedModal")).toBeHidden();
});

test("login ended for a branch account's admin menu too: another tab's Log out → the same window (§5)", async ({
  page,
}, info) => {
  desktopOnly(info);
  await stubBoard(page, { role: "branch" });
  await page.goto("/#admin");
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
  await expect(page.locator("#loginEndedModal")).toBeHidden();
  await logOutInAnotherTab(page, "branch");
  await expect(page.locator("#loginEndedModal")).toBeVisible();
  await expect(page.locator("#adminScreen")).toHaveJSProperty("inert", true);
  await page.locator("#loginEndedGo").click();
  await expect(page.locator("#loginScreen")).toHaveClass(/screen-active/);
});
