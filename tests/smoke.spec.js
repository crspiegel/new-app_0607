import { expect, test } from "@playwright/test";

test("main level-to-month-to-content flow renders", async ({ page }) => {
  const failedRequests = [];
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  await page.goto("/");
  await expect(page.locator("#homeTitle")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Beginner" }).first(),
  ).toBeVisible();

  // Internal key stays "Level 1" (URL hash / data-level); the label shows
  // "Beginner".
  await page.getByRole("button", { name: "Beginner" }).first().click();
  await expect(page).toHaveURL(/#months\/Level%201$/);
  await expect(page.locator("#monthLevelTag")).toHaveText("Beginner");

  await page.getByRole("button", { name: /March/i }).click();
  await expect(page).toHaveURL(/#content\/Level%201\/March$/);
  await expect(page.locator("#contentLevelName")).toBeVisible();
  await expect(page.locator("#contentLevelName")).toHaveText("Beginner");
  // Beginner renames the song buttons (other levels keep "Opening Song").
  await expect(
    page.getByRole("button", { name: /Good Morning Song/i }).first(),
  ).toBeVisible();

  expect(failedRequests.filter((url) => url.includes("/assets/"))).toEqual([]);
});

test("calendar version 2 remains available", async ({ page }) => {
  await page.goto("/#content-v2/Level%201/March");

  await expect(page.locator("#contentScreenV2")).toHaveClass(/screen-active/);
  await expect(
    page.getByRole("heading", { name: "March Reading Plan" }),
  ).toBeVisible();
  await expect(page.locator("#lessonGridV2")).toBeVisible();
});

test("calendar version 3 renders Mon-Fri learning calendar", async ({
  page,
}) => {
  await page.goto("/#content-v3/Level%201/March");

  await expect(page.locator("#contentScreenV3")).toHaveClass(/screen-active/);
  await expect(
    page.getByRole("heading", { name: "March Reading Plan" }),
  ).toBeVisible();
  await expect(page.locator(".content-v3-weekdays span")).toHaveText([
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
  ]);
  await expect(page.locator(".content-v3-date")).toHaveCount(0);
  await expect(page.locator(".content-v3-day-name").first()).toHaveText("Mon");
  await expect(
    page.locator(".content-v3-day-cell[data-content-type]").first(),
  ).toBeVisible();
});

// The dev server talks to the real Supabase project, which may hold real
// background rows. Each background test therefore waits for the hydrate
// attempt to finish, then clears the client cache to get a known state —
// the database itself is never touched.
async function resetBgCache(page) {
  await page.waitForFunction(() => window.craBg && window.craBg.settled);
  await page.evaluate(() => {
    const { bgCache, applyPageBackground } = window.craBg;
    Object.keys(bgCache).forEach((key) => delete bgCache[key]);
    applyPageBackground("content");
  });
}

test("page background layer stays inert without a config", async ({ page }) => {
  await page.goto("/#content/Level%201/March");
  await expect(page.locator("#contentScreen")).toHaveClass(/screen-active/);
  await resetBgCache(page);
  // No background config → body class off, layer empty, page unchanged.
  await expect(page.locator("body")).not.toHaveClass(/page-bg-active/);
  await expect(page.locator("#pageBgLayer")).toHaveCount(1);
  await expect(page.locator("#pageBgLayer .page-bg-el")).toHaveCount(0);
});

test("seeded background renders full image and elements, month row wins", async ({
  page,
}) => {
  await page.goto("/#content/Level%201/March");
  await resetBgCache(page);
  await page.evaluate(() => {
    const { bgCache, bgKey, applyPageBackground } = window.craBg;
    bgCache[bgKey("Level 1", "page2", "")] = {
      full: "assets/l1-march-book-1.jpg",
      elements: [
        {
          src: "assets/l1-march-book-2.jpg",
          x: 20,
          y: 30,
          w: 10,
          r: 15,
          fx: true,
          z: 0,
        },
      ],
    };
    applyPageBackground("content");
  });
  await expect(page.locator("body")).toHaveClass(/page-bg-active/);
  await expect(page.locator("#pageBgLayer .page-bg-full")).toHaveCount(1);
  await expect(page.locator("#pageBgLayer .page-bg-el")).toHaveCount(1);
  // Every tint painter above the layer must actually go transparent, or the
  // full image is hidden behind the body area (regressed once: the
  // #contentScreen.screen-active tint at styles.css was missed).
  const tints = await page.evaluate(() =>
    [
      "main",
      "#contentScreen",
      "#contentScreen .section-blue",
      ".site-footer",
    ].map(
      (sel) => getComputedStyle(document.querySelector(sel)).backgroundColor,
    ),
  );
  for (const color of tints) expect(color).toBe("rgba(0, 0, 0, 0)");
  // A month row REPLACES the level default entirely (no merging).
  await page.evaluate(() => {
    const { bgCache, bgKey, applyPageBackground } = window.craBg;
    bgCache[bgKey("Level 1", "page2", "March")] = { full: null, elements: [] };
    applyPageBackground("content");
  });
  await expect(page.locator("body")).not.toHaveClass(/page-bg-active/);
  await expect(page.locator("#pageBgLayer .page-bg-el")).toHaveCount(0);
});

test("background edit button hidden for non-admin visitors", async ({
  page,
}) => {
  await page.goto("/#content/Level%201/March");
  await expect(page.locator("#contentScreen")).toHaveClass(/screen-active/);
  // FAB exists in the DOM but CSS keeps it display:none without body.is-admin.
  await expect(page.locator("#bgEditFab")).toHaveCount(1);
  await expect(page.locator("#bgEditorPanel")).toHaveCount(1);
  await expect(page.locator("#bgEditFab")).toBeHidden();
  await expect(page.locator("#bgEditorPanel")).toBeHidden();
});

test("page background clears when leaving a level page", async ({ page }) => {
  await page.goto("/#content/Level%201/March");
  await resetBgCache(page);
  await page.evaluate(() => {
    const { bgCache, bgKey, applyPageBackground } = window.craBg;
    bgCache[bgKey("Level 1", "page2", "")] = {
      full: "assets/l1-march-book-1.jpg",
      elements: [],
    };
    applyPageBackground("content");
  });
  await expect(page.locator("body")).toHaveClass(/page-bg-active/);
  // Navigating to a non-background screen must clear the layer and the flag.
  await page.locator(".brand").click();
  await expect(page.locator("body")).not.toHaveClass(/page-bg-active/);
  await expect(page.locator("#pageBgLayer .page-bg-full")).toHaveCount(0);
});
