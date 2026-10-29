import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

// Level keys (2026-10-29): the internal key now matches the on-screen name
// (beginner · level-1 · level-2 · level-3, defined once in video-source.js
// LEVELS). The old keys "Level 1".."Level 4" (Level 1 = Beginner) survive only
// as legacy input: old bookmarks and DB rows not yet renamed.

function loadVideoSource() {
  const context = vm.createContext({ URL });
  const file = path.resolve("video-source.js");
  vm.runInContext(readFileSync(file, "utf8"), context, { filename: file });
  return vm.runInContext(
    `({ LEVELS, levelLabel, levelFromLegacy, levelFromAny, levelThemeClass,
        levelDbKeys,
        levelFromQrCode, qrLevelCode, months, bookLayout, bookQrPath,
        bookQrName, coverAssetPath })`,
    context,
  );
}

const BLANK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const STORAGE_STUBBED = /https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\//;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cra:dev-live", "1");
    } catch {
      /* offline fallback */
    }
  });
  await page.route(STORAGE_STUBBED, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: BLANK_PNG }),
  );
});

test("levels: one table of keys, labels and QR codes", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  const vs = loadVideoSource();
  expect(vs.LEVELS.map((l) => [l.key, l.label, l.qr, l.legacy])).toEqual([
    ["beginner", "Beginner", "b", "Level 1"],
    ["level-1", "Level 1", "l1", "Level 2"],
    ["level-2", "Level 2", "l2", "Level 3"],
    ["level-3", "Level 3", "l3", "Level 4"],
  ]);
  expect(vs.LEVELS.map((l) => vs.levelLabel(l.key))).toEqual([
    "Beginner",
    "Level 1",
    "Level 2",
    "Level 3",
  ]);

  // Old key → new key (Level 1 was Beginner). Lenient on case and spacing;
  // a new key is NOT legacy.
  expect(
    ["Level 1", "Level 2", "Level 3", "Level 4"].map(vs.levelFromLegacy),
  ).toEqual(["beginner", "level-1", "level-2", "level-3"]);
  expect(vs.levelFromLegacy(" level  4 ")).toBe("level-3");
  expect(vs.levelFromLegacy("level-1")).toBeNull();
  expect(vs.levelFromLegacy("Level 5")).toBeNull();
  expect(vs.levelFromLegacy("")).toBeNull();

  expect(vs.levelFromAny("level-2")).toBe("level-2");
  expect(vs.levelFromAny("Level 2")).toBe("level-1");
  expect(vs.levelFromAny("beginner")).toBe("beginner");
  expect(vs.levelFromAny("foo")).toBeNull();

  // What a DB row of the level may still carry before 01-rename.sql.
  expect(vs.levelDbKeys("level-1")).toEqual(["level-1", "Level 2"]);
  expect(vs.levelDbKeys("beginner")).toEqual(["beginner", "Level 1"]);
  expect(vs.levelDbKeys("Level 1")).toEqual([]);

  // Theme class comes from the key, never from a digit inside it.
  expect(vs.levelThemeClass("beginner")).toBe("level-theme-beginner");
  expect(vs.levelThemeClass("level-1")).toBe("level-theme-level-1");
  expect(vs.levelThemeClass("Level 1")).toBe("");
});

// The 70 printed/registered student QR URLs are a print contract: whatever
// the internal keys are, each URL must still open the same level, month and
// book (b = Beginner, l1..l3 = Level 1..3, bare digits = Level 1..3).
test("levels: the 70 student QR URLs and names are unchanged", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  const vs = loadVideoSource();
  const expectedPaths = [];
  const expectedNames = [];
  for (const [code, books] of [
    ["b", [1]],
    ["l1", [1, 2]],
    ["l2", [1, 2]],
    ["l3", [1, 2]],
  ]) {
    for (let month = 3; month <= 12; month += 1) {
      for (const book of books) {
        expectedPaths.push(`/q/${code}/${month}/${book}`);
        expectedNames.push(
          `${code.toUpperCase()}-${String(month).padStart(2, "0")}-${book}`,
        );
      }
    }
  }

  const paths = [];
  const names = [];
  for (const level of vs.LEVELS) {
    for (const month of vs.months) {
      for (const entry of vs.bookLayout(level.key)) {
        paths.push(vs.bookQrPath(level.key, month, entry.book));
        names.push(vs.bookQrName(level.key, month, entry.book));
      }
    }
  }
  expect(paths).toEqual(expectedPaths);
  expect(names).toEqual(expectedNames);
  expect(paths).toHaveLength(70);

  // Token → level → on-screen name, as the student page resolves it.
  const labelOf = (code) => vs.levelLabel(vs.levelFromQrCode(code));
  expect(["b", "B", "l1", "L2", "l3", "1", "2", "3"].map(labelOf)).toEqual([
    "Beginner",
    "Beginner",
    "Level 1",
    "Level 2",
    "Level 3",
    "Level 1",
    "Level 2",
    "Level 3",
  ]);
  expect(vs.levelFromQrCode("0")).toBeNull();
  expect(vs.levelFromQrCode("4")).toBeNull();
  expect(vs.levelFromQrCode("l4")).toBeNull();
  expect(vs.LEVELS.map((l) => vs.qrLevelCode(l.key))).toEqual([
    "b",
    "l1",
    "l2",
    "l3",
  ]);
});

// The cover folders moved with their level (git mv level-1 → beginner, 2 → 1,
// 3 → 2, 4 → 3). One file per level is pinned to the bytes it had under its
// old folder, so a swapped rename cannot pass.
test("levels: covers moved with their level", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  const vs = loadVideoSource();
  const sha = (file) =>
    createHash("sha256")
      .update(readFileSync(path.resolve(file)))
      .digest("hex")
      .slice(0, 16);
  expect(sha(vs.coverAssetPath("beginner", "March", 1))).toBe(
    "c90871a36e84cb5f", // was assets/covers/level-1/march/book-1.jpg
  );
  expect(sha(vs.coverAssetPath("level-1", "March", 2))).toBe(
    "84dc5cc1b1a17fd2", // was level-2/march/book-2
  );
  expect(sha(vs.coverAssetPath("level-2", "December", 1))).toBe(
    "f30be0f231a5858b", // was level-3/december/book-1
  );
  expect(sha(vs.coverAssetPath("level-3", "December", 2))).toBe(
    "ca3ac19ac0cbe100", // was level-4/december/book-2
  );
  expect(vs.coverAssetPath("beginner", "March", 1)).toBe(
    "assets/covers/beginner/march/book-1.jpg",
  );
  expect(existsSync(path.resolve("assets/covers/level-4"))).toBe(false);
});

// Old bookmarks keep working: the old key in the hash is swapped for the new
// one (replace — no extra history entry) and the page opens as before.
test("levels: old hash addresses move to the new keys", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "routing only, run once");
  const cases = [
    ["#months/Level%201", "#months/beginner", "#monthLevelTag", "Beginner"],
    ["#months/Level%204", "#months/level-3", "#monthLevelTag", "Level 3"],
    [
      "#content/Level%202/March",
      "#content/level-1/March",
      "#contentLevelName",
      "Level 1",
    ],
    [
      "#content-v2/Level%203/March",
      "#content-v2/level-2/March",
      "#contentV2Level",
      "Level 2",
    ],
    [
      "#content-v3/Level%204/April",
      "#content-v3/level-3/April",
      "#contentV3Level",
      "Level 3",
    ],
  ];
  for (const [from, to, selector, label] of cases) {
    // A hash-only goto would be a same-document navigation, which does not
    // re-route the SPA — leave the page first so each case is a fresh load.
    await page.goto("about:blank");
    await page.goto(`/${from}`);
    await expect(page).toHaveURL(new RegExp(`${to}$`));
    await expect(page.locator(selector)).toHaveText(label);
  }

  // Replace, not push: a fresh tab opened on the old address ends up with as
  // many history entries as one opened on the new address.
  const historyLength = async (hash) => {
    const tab = await context.newPage();
    await tab.goto(`/${hash}`);
    await expect(tab).toHaveURL(/#months\/beginner$/);
    const length = await tab.evaluate(() => window.history.length);
    await tab.close();
    return length;
  };
  expect(await historyLength("#months/Level%201")).toBe(
    await historyLength("#months/beginner"),
  );

  await page.goto("about:blank");
  await page.goto("/#months/Level%202");
  await expect(page.locator("#monthScreen")).toHaveClass(/level-theme-level-1/);
  await expect(page.locator("body")).toHaveClass(/level-theme-level-1/);

  // Unknown level → home (it used to open an empty month page named "foo").
  await page.goto("about:blank");
  await page.goto("/#months/foo");
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await expect(page).not.toHaveURL(/#months/);
});

test("levels: navigation writes the new keys into the hash", async ({
  page,
}) => {
  await page.goto("/");
  // The home level card (the header icons bob, so they never read "stable").
  await page.locator('#levelSection [data-level="level-2"]').click();
  await expect(page).toHaveURL(/#months\/level-2$/);
  await expect(page.locator("#monthLevelTag")).toHaveText("Level 2");
  await expect(page.locator("#monthScreen")).toHaveClass(/level-theme-level-2/);
  await page.getByRole("button", { name: /April/i }).click();
  await expect(page).toHaveURL(/#content\/level-2\/April$/);
});

// Until supabase/levels/01-rename.sql runs, the live rows still carry the old
// keys. The teacher site reads both; a row saved under the new key wins over
// its old copy, whatever order the rows arrive in.
test("levels: content and backgrounds read old and new keys, new wins", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "data only, run once");
  await page.route(/\/rest\/v1\/content_pages/, (route) =>
    route.fulfill({
      json: [
        {
          level: "level-1",
          month: "March",
          videos: {},
          covers: {},
          labels: { game: "NEW" },
        },
        {
          level: "Level 2",
          month: "March",
          videos: {},
          covers: {},
          labels: { game: "OLD" },
        },
        {
          level: "Level 1",
          month: "March",
          videos: {},
          covers: {},
          labels: { game: "Legacy only" },
        },
      ],
    }),
  );
  await page.route(/\/rest\/v1\/page_backgrounds/, (route) =>
    route.fulfill({
      json: [
        {
          level: "level-3",
          page: "page1",
          month: "",
          data: { full: "new.png" },
        },
        {
          level: "Level 4",
          page: "page1",
          month: "",
          data: { full: "old.png" },
        },
        {
          level: "Level 1",
          page: "page2",
          month: "March",
          data: { full: "legacy.png" },
        },
      ],
    }),
  );
  await page.goto("/");
  await page.waitForFunction(
    () => window.craContent.settled && window.craBg.settled,
  );
  const result = await page.evaluate(() => ({
    level1: getSlotLabel("level-1", "March", "game"),
    beginner: getSlotLabel("beginner", "March", "game"),
    oldKeyCached: Object.keys(window.craContent.contentCache).filter((k) =>
      k.startsWith("Level "),
    ),
    bgLevel3: window.craBg.getBackgroundEntry("level-3", "page1", "").full,
    bgBeginner: window.craBg.getBackgroundEntry("beginner", "page2", "March")
      .full,
  }));
  expect(result).toEqual({
    level1: "NEW",
    beginner: "Legacy only",
    oldKeyCached: [],
    bgLevel3: "new.png",
    bgBeginner: "legacy.png",
  });
});

// Writes always use the new key: the admin's level list and the cover upload
// path. Covers go under levels/<key>/ — the old top-level folders (level-1 =
// Beginner) still hold live covers that content_pages.covers points at, so a
// new Level 1 cover must never land on level-1/….
test("levels: admin writes use the new keys and a fresh cover path", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "data only, run once");
  const uploads = [];
  const upserts = [];
  await page.unroute(STORAGE_STUBBED);
  await page.route(STORAGE_STUBBED, (route) => {
    const request = route.request();
    if (request.method() === "POST" || request.method() === "PUT") {
      uploads.push(new URL(request.url()).pathname);
      return route.fulfill({ json: { Key: "x" } });
    }
    return route.fulfill({ contentType: "image/png", body: BLANK_PNG });
  });
  await page.route(/\/rest\/v1\/content_pages/, (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      upserts.push(JSON.parse(request.postData() || "{}"));
      return route.fulfill({ status: 201, body: "" });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/");
  await page.waitForFunction(() => window.craContent.settled);

  const options = await page.evaluate(async () => {
    const defaultLevel = adminState.level;
    populateAdminSelectors();
    const list = [...document.querySelectorAll("#adminLevel option")].map(
      (o) => [o.value, o.textContent],
    );
    adminState.level = "level-1";
    adminState.month = "March";
    const file = new window.File([new Uint8Array([1, 2, 3])], "cover.bin", {
      type: "application/octet-stream",
    });
    await uploadCover("book-1", file);
    return { list, defaultLevel };
  });
  expect(options.defaultLevel).toBe("beginner");
  expect(options.list).toEqual([
    ["beginner", "Beginner"],
    ["level-1", "Level 1"],
    ["level-2", "Level 2"],
    ["level-3", "Level 3"],
  ]);
  expect(uploads).toEqual([
    "/storage/v1/object/covers/levels/level-1/march/book-1",
  ]);
  expect(upserts.map((row) => [row.level, row.month])).toEqual([
    ["level-1", "March"],
  ]);
});

// Deleting a month's background override must remove its old-key twin too —
// before 01-rename.sql has run it would otherwise come back on the next load.
test("levels: deleting a background override removes both keys", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "data only, run once");
  const deletes = [];
  await page.route(/\/rest\/v1\/page_backgrounds/, (route) => {
    const request = route.request();
    if (request.method() === "DELETE") {
      // Query semantics ("+" = space), as PostgREST reads it.
      deletes.push(Object.fromEntries(new URL(request.url()).searchParams));
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/#content/level-1/March");
  await page.waitForFunction(() => window.craBg.settled);
  await page.evaluate(() => {
    isAdmin = true;
    updateAdminUI();
    window.craBg.ready = true;
  });
  await page.locator("#bgEditFab").click();
  await expect(page.locator("#bgDeleteOverride")).toBeVisible();
  await page.locator("#bgDeleteOverride").click();
  await expect.poll(() => deletes.length).toBe(1);
  expect(deletes[0].level).toMatch(/^in\.\(level-1,"?Level 2"?\)$/);
  expect(deletes[0].page).toBe("eq.page2");
  expect(deletes[0].month).toBe("eq.March");
});

// The student page asks for the new key and its old twin in ONE read and
// prefers the new row; the theme comes from the key.
test("levels: student page reads old and new keys, new wins", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "data only, run once");
  const calls = [];
  await page.route(/\/rest\/v1\/content_pages/, (route) => {
    calls.push(decodeURIComponent(route.request().url()));
    return route.fulfill({
      json: [
        { level: "Level 2", videos: {}, labels: { game: "Old title" } },
        { level: "level-1", videos: {}, labels: { game: "New title" } },
      ],
    });
  });
  await page.route(/\/assets\/covers\//, (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.goto("/play.html?l=l1&m=3&b=1");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "board");
  await expect(page.locator("#contentScreen")).toHaveClass(
    /level-theme-level-1/,
  );
  await expect(page.locator("body")).toHaveAttribute("data-level", "level-1");
  await expect(page.locator('#contentScreen [data-slot="game"]')).toContainText(
    "New title",
  );
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain('level=in.(level-1,"Level 2")');
  expect(calls[0]).toContain("select=level,videos,labels");
});
