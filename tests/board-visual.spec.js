import { expect, test } from "@playwright/test";

// Pixel baseline for the teacher 페이지2 board (+ home, month grid, admin
// board). Task 2.3/2.4 move the board's DOM builders and CSS into shared
// files (board-view.js, board.css) that the student page will load too; these
// snapshots prove the teacher site did not change by a single pixel.
//
// Everything is deterministic: every Supabase request is answered here (one
// content_pages fixture, empty backgrounds/settings, a 1x1 PNG for Storage),
// animations are disabled, and the fonts are awaited. maxDiffPixels is 0 on
// purpose — a difference means a real change, never "close enough".
const BLANK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const STORAGE = "https://stub.supabase.co/storage/v1/object/public/covers";
const PUBLISHER = "https://tps-education.com/58?video=173725167";
const GAME = "https://book-english-games.vercel.app/play/the-tractor";

// March for every level: filled + empty slots, two covers (one for Beginner),
// custom book titles on the 6-button levels. The rows keep the OLD level keys
// ("Level 1" = Beginner) on purpose: they are the bytes these baselines were
// taken from, and the pages must read them through the legacy fallback
// (levelFromAny) until supabase/levels/01-rename.sql has run and that
// fallback is removed (plan backlog, SQL 2 / 3.5) — then switch to new keys.
const ROWS = ["Level 1", "Level 2", "Level 3", "Level 4"].map((level, i) => ({
  level,
  month: "March",
  videos: {
    opening: "https://youtu.be/tHybl0l9tbQ",
    ending: "https://youtu.be/P23iESqE8lk",
    game: GAME,
    ...(i === 0 ? { unit: "" } : { game2: GAME, song1: PUBLISHER, song2: "" }),
    "w1-Mon": PUBLISHER,
    "w1-Tue": "https://youtu.be/LPl2AR2rm0g",
    "w1-Thu": GAME,
    "w2-Mon": PUBLISHER,
    "w3-Fri": PUBLISHER,
  },
  covers:
    i === 0
      ? { "book-1": `${STORAGE}/level-1/march/book-1` }
      : {
          "book-1": `${STORAGE}/level-${i + 1}/march/book-1`,
          "book-2": `${STORAGE}/level-${i + 1}/march/book-2`,
        },
  labels:
    i === 0
      ? {}
      : {
          game: "The Tractor",
          game2: "I Can Help",
          song1: "The Tractor",
          song2: "I Can Help",
        },
}));

// Answer like PostgREST: honour the level / month filters the student page
// sends (eq.<v> or in.(<v>,"<v w/ space>")). The teacher site reads every row.
// (Until 2026-10-29 every request got all four rows and the student page took
// the first — Beginner's — so the Level 1 student shots showed Beginner data.)
function filterRows(url) {
  const params = new URL(url).searchParams;
  const allowed = (filter) => {
    if (!filter) return null;
    const eq = filter.match(/^eq\.(.*)$/);
    if (eq) return [eq[1]];
    const list = filter.match(/^in\.\((.*)\)$/);
    return list ? list[1].split(",").map((v) => v.replace(/^"|"$/g, "")) : [];
  };
  const levels = allowed(params.get("level"));
  const months = allowed(params.get("month"));
  return ROWS.filter(
    (row) =>
      (!levels || levels.includes(row.level)) &&
      (!months || months.includes(row.month)),
  );
}

// Headless Chromium on Windows rasterises glyph edges slightly differently
// from run to run (LCD/subpixel text): a handful of pixels then cross the
// comparison threshold on an otherwise identical page. These flags make text
// rendering deterministic, so the comparison can be exact (threshold 0).
test.use({
  launchOptions: {
    args: [
      "--disable-lcd-text",
      "--disable-font-subpixel-positioning",
      "--font-render-hinting=none",
    ],
  },
});

const VIEWPORTS = [
  [375, 812],
  [812, 375],
  [768, 1024],
  [1366, 900],
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cra:dev-live", "1");
    } catch {
      /* offline config → the fixture is simply never requested */
    }
  });
  await page.route(/supabase\.co/, (route) => {
    const url = route.request().url();
    if (url.includes("/storage/")) {
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: BLANK_PNG,
      });
    }
    if (url.includes("/rest/v1/content_pages")) {
      return route.fulfill({ json: filterRows(url) });
    }
    return route.fulfill({ json: [] });
  });
});

// Fonts (Google Fonts) must be in before the first paint we keep.
async function settle(page) {
  await page.waitForFunction(
    () => window.craContent && window.craContent.settled,
  );
  await page.waitForFunction(
    () =>
      window.craBg &&
      window.craBg.settled &&
      (!window.craHero || window.craHero.settled),
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.fonts.status === "loaded");
  // A web font that failed or is still pending would paint a fallback face
  // and show up as a pixel diff with no explanation — fail loudly instead.
  const fonts = await page.evaluate(() =>
    [...document.fonts]
      .filter((face) => face.status !== "unloaded")
      .map((face) => `${face.family} ${face.weight} ${face.status}`),
  );
  expect(fonts.filter((line) => !line.endsWith(" loaded"))).toEqual([]);
  expect(fonts.length).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, 0));
}

const SHOT = {
  fullPage: true,
  animations: "disabled",
  caret: "hide",
  threshold: 0, // exact colour match per pixel (default 0.2 hides AA noise)
};

// Snapshot names keep the old position number (page2-level-1 = Beginner) so
// the baseline files themselves never had to change.
for (const [w, h] of VIEWPORTS) {
  for (const [level, key] of [
    [1, "beginner"],
    [2, "level-1"],
    [3, "level-2"],
    [4, "level-3"],
  ]) {
    test(`페이지2 ${key} March @${w}x${h}`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "one project, by viewport");
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/#content/${key}/March`);
      await expect(page.locator("#contentScreen")).toHaveClass(/screen-active/);
      await settle(page);
      await expect(page.locator("#lessonGrid .lesson-button")).toHaveCount(20);
      await expect(page).toHaveScreenshot(
        `page2-level-${level}-${w}x${h}.png`,
        { ...SHOT, maxDiffPixels: 0 },
      );
    });
  }
}

test("홈 @1366x900", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one project, by viewport");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await expect(page.locator("#homeTitle")).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot("home-1366x900.png", {
    ...SHOT,
    maxDiffPixels: 0,
  });
});

test("월그리드 level-1 @1366x900", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one project, by viewport");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/#months/level-1");
  await expect(page.locator("#monthGrid .month-button")).toHaveCount(10);
  await settle(page);
  await expect(page).toHaveScreenshot("months-level-2-1366x900.png", {
    ...SHOT,
    maxDiffPixels: 0,
  });
});

// The admin board mirrors the user board with the same slot/label helpers.
// No login: the classic-script globals render it straight into #adminScreen.
test("관리자 보드 level-1 @1366x900", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one project, by viewport");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await expect(page.locator("#homeTitle")).toBeVisible();
  await settle(page);
  await page.evaluate(() => {
    adminState.level = "level-1";
    adminState.month = "March";
    populateAdminSelectors();
    setAdminView("content");
    renderAdminBoard();
    showScreen("admin");
  });
  await expect(page.locator("#adminBoard .admin-slot")).toHaveCount(26);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot("admin-board-level-2-1366x900.png", {
    ...SHOT,
    maxDiffPixels: 0,
  });
});

/* ---- Student page (play.html): the same board for one book ---------------
   Same fixture rows, same stubs; covers served as the 1x1 PNG. These are the
   student page's own baseline (not compared against the teacher shots — the
   page has a different frame), kept exact like the rest. */
const STUDENT_SHOTS = [
  ["beginner-3-book-1", "?l=b&m=3&b=1"],
  ["level-1-3-book-2", "?l=l1&m=3&b=2"],
];
for (const [w, h] of [
  [375, 812],
  [1366, 900],
]) {
  for (const [name, query] of STUDENT_SHOTS) {
    test(`학생 페이지 ${name} @${w}x${h}`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "one project, by viewport");
      await page.route(/\/assets\/covers\//, (route) =>
        route.fulfill({ contentType: "image/png", body: BLANK_PNG }),
      );
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/play.html${query}`);
      await expect(page.locator("#play")).toHaveAttribute(
        "data-state",
        "board",
      );
      await expect(page.locator("#lessonGrid .book-title-card")).toHaveClass(
        /has-cover/,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.fonts.status === "loaded");
      await expect(page).toHaveScreenshot(`student-${name}-${w}x${h}.png`, {
        ...SHOT,
        maxDiffPixels: 0,
      });
    });
  }
}
