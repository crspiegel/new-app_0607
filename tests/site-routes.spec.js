import { expect, test } from "@playwright/test";
import { SUPABASE, stubBoard } from "./resource-board-stub.mjs";

// D88 (PM brief 2026-11-09, after the D86 audit's M4 · M5 · M6): the user
// screens follow the address too — Back / Forward between home, the month
// page, a content page, the overview, the login page and a level's resource
// page show that address's screen; every move by a button is a new history
// entry (home included); the video and game windows have their own entry
// (Back closes the window only); the rights checks of a load apply; the
// background editor keeps unsaved changes as its links do. Every Supabase
// request is answered by tests/resource-board-stub.mjs; anything else sent
// to Supabase is refused (the live project is never reached).

const desktopOnly = (info, why = "flow only, run once") =>
  test.skip(info.project.name !== "desktop", why);

const VIDEO_PAGE = "https://tps-education.com/58?video=173725167";
const GAME_URL = "https://book-english-games.vercel.app/play/the-tractor";

const historyLength = (page) => page.evaluate(() => window.history.length);
const hashOf = (page) => new URL(page.url()).hash;
const back = (page) => page.goBack({ waitUntil: "commit" });
const forward = (page) => page.goForward({ waitUntil: "commit" });

test.beforeEach(async ({ context }) => {
  // the live project is never reached; each page's stub answers first
  await context.route(SUPABASE, (route) => route.abort());
  await context.route(/^https:\/\/tps-education\.com\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>video page</p>" }),
  );
  await context.route(/^https:\/\/book-english-games\.vercel\.app\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>game</p>" }),
  );
});

async function home(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.craBoard && window.craBoard.ready);
}
async function expectScreen(page, screen) {
  await expect(page.locator("body")).toHaveAttribute("data-screen", screen);
}
async function expectHome(page) {
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await expect.poll(() => hashOf(page)).toBe("");
}
async function expectMonths(page, level, label) {
  await expectScreen(page, "months");
  await expect(page).toHaveURL(new RegExp(`#months/${level}$`));
  await expect(page.locator("#monthLevelTag")).toHaveText(label);
}
async function expectContent(page, level, month) {
  await expectScreen(page, "content");
  await expect(page).toHaveURL(new RegExp(`#content/${level}/${month}$`));
}
// The content page of Level 1 / March with a video page, a game and an
// empty slot (the stub has no content rows; the cache is the page's).
async function level1March(page) {
  await page.locator("#homeScreen .level-button--level-1").click();
  await expectMonths(page, "level-1", "Level 1");
  await page.locator("#monthGrid .month-button").first().click();
  await expectContent(page, "level-1", "March");
  await page.waitForFunction(
    () => window.craContent && window.craContent.settled,
  );
  await page.evaluate(
    ({ video, game }) => {
      const { contentCache, pageKey } = window.craContent;
      contentCache[pageKey("level-1", "March")] = {
        videos: { "w1-Mon": game, "w1-Tue": video },
        covers: {},
        labels: {},
      };
    },
    { video: VIDEO_PAGE, game: GAME_URL },
  );
}
// Records whether the resource page shows at any moment from now on.
async function watchResources(page) {
  await page.evaluate(() => {
    window.__resourcesSeen = false;
    new MutationObserver(() => {
      if (document.body.dataset.screen === "resources")
        window.__resourcesSeen = true;
    }).observe(document.body, {
      attributes: true,
      attributeFilter: ["data-screen"],
    });
  });
}

test("site routes (D88-1): home → Level 1 → March, Back ×3 (the last leaves the site) and Forward ×2 show each address's screen — PC and 390", async ({
  browser,
}, info) => {
  desktopOnly(info);
  for (const width of [1366, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width < 768 ? 844 : 900 },
      ...(width < 768 ? { isMobile: true, hasTouch: true } : {}),
    });
    await context.route(SUPABASE, (route) => route.abort());
    const page = await context.newPage();
    await stubBoard(page, { role: null });
    await home(page);
    const start = await historyLength(page);
    await page.locator("#homeScreen .level-button--level-1").click();
    await expectMonths(page, "level-1", "Level 1");
    await page.locator("#monthGrid .month-button").first().click();
    await expectContent(page, "level-1", "March");
    expect(await historyLength(page)).toBe(start + 2);

    await back(page);
    await expectMonths(page, "level-1", "Level 1");
    await back(page);
    await expectHome(page);
    await back(page);
    await expect(page).toHaveURL("about:blank"); // the site's first entry

    await forward(page);
    await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
    await forward(page);
    await expectMonths(page, "level-1", "Level 1");
    await context.close();
  }
});

test("site routes (D88-1): each button move is a new entry — the logo / home too; the same screen again adds none; Back retraces them", async ({
  page,
}, info) => {
  desktopOnly(info);
  await stubBoard(page, { role: null });
  await home(page);
  const start = await historyLength(page);
  await page.locator("#homeScreen .level-button--level-1").click();
  await expectMonths(page, "level-1", "Level 1");
  // the same level again (the header's button): no new entry
  await page.locator('.topbar [data-level="level-1"]').click();
  await expectMonths(page, "level-1", "Level 1");
  expect(await historyLength(page)).toBe(start + 1);
  await page.locator("#monthGrid .month-button").nth(1).click();
  await expectContent(page, "level-1", "April");
  await page.locator(".content-nav-next").first().click();
  await expectContent(page, "level-1", "May");
  await page.locator(".topbar .brand").click();
  await expectHome(page);
  expect(await historyLength(page)).toBe(start + 4);
  // the logo's home was a new entry: Back = May, then April, then the month page
  await back(page);
  await expectContent(page, "level-1", "May");
  await expect(page.locator("#contentTitle")).toHaveText("May Reading Plan");
  await back(page);
  await expectContent(page, "level-1", "April");
  await expect(page.locator("#contentTitle")).toHaveText("April Reading Plan");
  await back(page);
  await expectMonths(page, "level-1", "Level 1");
  await forward(page);
  await expectContent(page, "level-1", "April");
  // the home button of the header: a new entry as well
  await page.locator('.topbar [data-view="home"]').first().click();
  await expectHome(page);
  await back(page);
  await expectContent(page, "level-1", "April");
});

test("site routes (D88-1): the overview ↔ a month page and the login page follow Back / Forward", async ({
  page,
}, info) => {
  desktopOnly(info);
  await stubBoard(page, { role: null });
  await page.goto("/#overview");
  await expect(page.locator("#overviewScreen")).toHaveClass(/screen-active/);
  // a typed address (the same page): the month page of Level 2
  await page.evaluate(() => {
    window.location.hash = "months/level-2";
  });
  await expectMonths(page, "level-2", "Level 2");
  await back(page);
  await expectScreen(page, "overview");
  await expect(page).toHaveURL(/#overview$/);
  await forward(page);
  await expectMonths(page, "level-2", "Level 2");

  // home → the login page → Back = home, Forward = the login page
  await home(page);
  await page.locator('.topbar [data-view="login"]').click();
  await expectScreen(page, "login");
  await expect(page).toHaveURL(/#login$/);
  await back(page);
  await expectHome(page);
  await expect(page.locator("#loginScreen")).not.toHaveClass(/screen-active/);
  await forward(page);
  await expectScreen(page, "login");
});

test("site routes (D88-1 · 3): a teacher's resource page — Back = the month page, Forward = the resource page again (its list read again)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const sent = await stubBoard(page, { role: "teacher" });
  await home(page);
  await page.locator("#homeScreen .level-button--level-1").click();
  await expectMonths(page, "level-1", "Level 1");
  await page.locator("#teacherResBtn").click();
  await expectScreen(page, "resources");
  await expect(page).toHaveURL(/#resources\/level-1$/);
  await expect(page.locator("#resourceGrid")).toContainText("연간교육안");
  const reads = () =>
    sent.rpc.filter((r) => r.name === "teacher_resources_list").length;
  const first = reads();
  await back(page);
  await expectMonths(page, "level-1", "Level 1");
  await forward(page);
  await expectScreen(page, "resources");
  await expect(page).toHaveURL(/#resources\/level-1$/);
  await expect.poll(reads).toBe(first + 1);
  await expect(page.locator("#resourceGrid")).toContainText("연간교육안");
});

test("site routes (D88-3): after Log out, Back to a resource page's address opens the month page (address rewritten, no new entry) — the resource page never shows; a visitor's typed address the same", async ({
  page,
}, info) => {
  desktopOnly(info);
  await stubBoard(page, { role: "teacher" });
  await home(page);
  await page.locator("#homeScreen .level-button--level-1").click();
  await page.locator("#teacherResBtn").click();
  await expectScreen(page, "resources");
  await page.locator("#logoutBtn").click();
  await expectHome(page);
  await expect(page.locator("#logoutBtn")).toBeHidden();
  await watchResources(page);
  const length = await historyLength(page);
  // Log out moved home as a new entry: Back reaches #resources/level-1
  await back(page);
  await expectMonths(page, "level-1", "Level 1");
  expect(await historyLength(page)).toBe(length);
  expect(await page.evaluate(() => window.__resourcesSeen)).toBe(false);
  // Forward = home, Back again = the month page (the rewritten address)
  await forward(page);
  await expectHome(page);
  await back(page);
  await expectMonths(page, "level-1", "Level 1");

  // a visitor typing the address on the same page
  await page.evaluate(() => {
    window.location.hash = "resources/level-2";
  });
  await expectMonths(page, "level-2", "Level 2");
  expect(await page.evaluate(() => window.__resourcesSeen)).toBe(false);
});

test("site routes (D88-2): the video window — Back closes it only (the address stays, the video stops); after [닫기] one Back = the screen before; Forward never reopens it", async ({
  page,
}, info) => {
  desktopOnly(info);
  await stubBoard(page, { role: null });
  await home(page);
  await level1March(page);
  const length = await historyLength(page);
  const lesson = page.locator('#lessonGrid .lesson-button[data-slot="w1-Tue"]');

  await lesson.click();
  await expect(page.locator("#videoModal")).toBeVisible();
  await expect(page.locator("#vpFrame iframe")).toHaveCount(1);
  expect(await historyLength(page)).toBe(length + 1);
  await back(page);
  await expect(page.locator("#videoModal")).toBeHidden();
  await expect(page.locator("#vpFrame iframe")).toHaveCount(0); // stopped
  await expectContent(page, "level-1", "March");
  // Forward onto the closed window's entry: it steps back over it
  await forward(page);
  await expect.poll(() => page.evaluate(() => window.history.state)).toBe(null);
  await expect(page.locator("#videoModal")).toBeHidden();
  await expectContent(page, "level-1", "March");
  await back(page);
  await expectMonths(page, "level-1", "Level 1");

  // [닫기], Esc and the backdrop go back through the entry: one Back after
  for (const how of ["button", "escape", "backdrop"]) {
    await forward(page);
    await expectContent(page, "level-1", "March");
    await lesson.click();
    await expect(page.locator("#videoModal")).toBeVisible();
    if (how === "button") await page.locator("#videoModal .vp-close").click();
    else if (how === "escape") await page.keyboard.press("Escape");
    else
      await page
        .locator("#videoModal .video-modal-overlay")
        .click({ position: { x: 5, y: 5 } });
    await expect(page.locator("#videoModal")).toBeHidden();
    await expectContent(page, "level-1", "March");
    await expect
      .poll(() => page.evaluate(() => window.history.state))
      .toBe(null);
    await back(page);
    await expectMonths(page, "level-1", "Level 1");
  }
});

test("site routes (D88-2): the game window — Back closes it only and unloads the game; after [닫기] one Back = the screen before; opening again adds no extra entry", async ({
  page,
}, info) => {
  desktopOnly(info);
  await stubBoard(page, { role: null });
  await home(page);
  await level1March(page);
  const length = await historyLength(page);
  const lesson = page.locator('#lessonGrid .lesson-button[data-slot="w1-Mon"]');

  await lesson.click();
  await expect(page.locator("#gameModal")).toBeVisible();
  await expect(page.locator("#gameFrame")).toHaveAttribute("src", GAME_URL);
  await back(page);
  await expect(page.locator("#gameModal")).toBeHidden();
  await expect(page.locator("#gameFrame")).not.toHaveAttribute("src", /./);
  await expectContent(page, "level-1", "March");

  // [닫기] then open again, twice: the game frame adds no entries of its own
  for (let round = 0; round < 2; round += 1) {
    await lesson.click();
    await expect(page.locator("#gameModal")).toBeVisible();
    await page.locator("#gameModal button[data-game-close]").click();
    await expect(page.locator("#gameModal")).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => window.history.state))
      .toBe(null);
  }
  expect(await historyLength(page)).toBe(length + 1);
  await back(page);
  await expectMonths(page, "level-1", "Level 1");
});

test("site routes (D88-1): a typed month address with an old level key is still rewritten in place; an unknown level opens home", async ({
  page,
}, info) => {
  desktopOnly(info);
  await stubBoard(page, { role: null });
  await home(page);
  const start = await historyLength(page);
  await page.evaluate(() => {
    window.location.hash = "months/Level%201";
  });
  await expectMonths(page, "beginner", "Beginner");
  expect(await historyLength(page)).toBe(start + 1);
  await page.evaluate(() => {
    window.location.hash = "months/foo";
  });
  await expectHome(page);
  expect(await historyLength(page)).toBe(start + 2);
  await back(page);
  await expectMonths(page, "beginner", "Beginner");
});

test("site routes (D88-4): the background editor — Back with unsaved changes keeps it, its page and its address (its line says why); without changes Back closes it and moves", async ({
  page,
}, info) => {
  desktopOnly(info);
  await stubBoard(page, { role: "admin" });
  await home(page);
  await level1March(page);
  await page.waitForFunction(() => window.craBg && window.craBg.ready);
  await page.locator("#bgEditFab").click();
  await expect(page.locator("#bgEditorPanel")).toBeVisible();
  await page.evaluate(() => {
    /* global bgMarkDirty */
    bgMarkDirty();
  });
  await back(page);
  await expect(page.locator("#bgEditorStatus")).toHaveText(
    "저장하지 않은 변경이 있습니다 — 저장하거나 ✕로 닫아 주세요.",
  );
  await expect(page.locator("#bgEditorPanel")).toBeVisible();
  await expectContent(page, "level-1", "March");
  expect(await page.evaluate(() => bgEdit.dirty)).toBe(true);
  // again: still kept
  await back(page);
  await expect(page.locator("#bgEditorPanel")).toBeVisible();
  await expectContent(page, "level-1", "March");
  // nothing to lose: Back closes the editor and opens the month page
  await page.evaluate(() => {
    /* global bgEdit */
    bgEdit.dirty = false;
  });
  await back(page);
  await expect(page.locator("#bgEditorPanel")).toBeHidden();
  await expectMonths(page, "level-1", "Level 1");
});
