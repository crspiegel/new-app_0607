import { expect, test } from "@playwright/test";

// Specs for the QR student page (play.html) and the shared video-source.js it
// loads alongside app.js. Same cost rules as smoke.spec.js: Storage objects
// are stubbed with a 1x1 PNG, and the live flag is set so supabase-config.js
// does not blank itself on 127.0.0.1.
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
      /* config falls back to offline; the affected specs will say so */
    }
  });

  await page.route(STORAGE_STUBBED, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: BLANK_PNG,
    }),
  );
});

test("video-source.js loads before app.js without redeclaration", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.locator("#homeTitle")).toBeVisible();

  const result = await page.evaluate(() => ({
    isFunction: typeof publisherVimeoId === "function",
    tps58: publisherVimeoId("https://tps-education.com/58?video=173725167"),
    tps60www: publisherVimeoId(
      "https://www.tps-education.com/60?video=173728500",
    ),
    youtube: publisherVimeoId("https://youtu.be/tHybl0l9tbQ"),
    otherHost: publisherVimeoId("https://example.com/?video=1"),
    beginnerSlots: allSlotKeys("Level 1").length,
    levelOneSlots: allSlotKeys("Level 2").length,
    path: qrPath("Level 1", "March", "w1-Mon"),
    slotUpper: slotFromQr("W4-FRI", "Level 1"),
    slotOtherLevel: slotFromQr("song1", "Level 1"),
    monthPadded: monthFromNumber("03"),
    monthOutOfRange: monthFromNumber(13),
    sameParser: window.craVideo.parseVideoSource === parseVideoSource,
  }));

  expect(result).toEqual({
    isFunction: true,
    tps58: 173725167,
    tps60www: 173728500,
    youtube: null,
    otherHost: null,
    beginnerSlots: 24,
    levelOneSlots: 26,
    path: "/q/b/3/w1-mon",
    slotUpper: "w4-Fri",
    slotOtherLevel: null,
    monthPadded: "March",
    monthOutOfRange: null,
    sameParser: true,
  });
  expect(pageErrors).toEqual([]);
});
