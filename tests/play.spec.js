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

/* ---- QR student page (play.html) ---------------------------------------
   The page reads exactly one content_pages row over REST. These specs answer
   that request from a fixture instead of the live project: zero egress and a
   deterministic row. (smoke.spec.js keeps REST live because its main-site
   specs were tuned against real REST latency; play.html is a separate page
   with no such timing.) Publisher pages and the game host are stubbed too. */
const PUBLISHER_58 = "https://tps-education.com/58?video=173725167";
const GAME_URL = "https://book-english-games.vercel.app/play/the-tractor";
const MARCH_ROW = {
  videos: {
    opening: "https://youtu.be/tHybl0l9tbQ",
    ending: "https://youtu.be/P23iESqE8lk",
    game: GAME_URL,
    "w1-Mon": PUBLISHER_58,
    "w1-Tue": "https://youtu.be/LPl2AR2rm0g",
    "w1-Wed": PUBLISHER_58,
    "w2-Mon": "https://tps-education.com/58?video=173725165",
    "w2-Tue": "  ",
    "w3-Mon": "https://tps-education.com/58?video=173725170",
    "w4-Mon": "https://tps-education.com/58?video=173725171",
  },
  labels: {},
};
const CONTENT_ROUTE = /\/rest\/v1\/content_pages/;

// Answers content_pages with `rows` (or an HTTP status) and counts requests.
async function mockContent(page, rows = [MARCH_ROW], status = 200) {
  const calls = [];
  await page.route(CONTENT_ROUTE, (route) => {
    calls.push(route.request().url());
    return status === 200
      ? route.fulfill({ status, json: rows })
      : route.fulfill({ status, json: { message: "restricted" } });
  });
  await page.route(/^https:\/\/(www\.)?tps-education\.com\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>publisher</p>" }),
  );
  await page.route(/^https:\/\/book-english-games\.vercel\.app\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>game</p>" }),
  );
  return calls;
}

test("play: weekday route shows title and tap-to-play", async ({ page }) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w1-mon");

  const play = page.locator("#play");
  await expect(play).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#playLevel")).toHaveText("Beginner");
  await expect(page.locator("#playMonth")).toHaveText("3");
  await expect(page.locator("#playTitle")).toHaveText(
    "Week 1 · Mon · Opening Song",
  );
  await expect(page.locator("#playStart")).toBeVisible();
  await expect(page.locator("#playFrame iframe")).toHaveCount(0);

  await page.locator("#playStart").click();
  await expect(page.locator("#playFrame iframe")).toHaveCount(1);
  await expect(page.locator("#playFrame iframe")).toHaveAttribute(
    "src",
    PUBLISHER_58,
  );
  await expect(play).toHaveAttribute("data-state", "playing");
});

test("play: page is hidden from search engines", async ({ page }) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w1-mon");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
});

test("play: route variants", async ({ page }) => {
  await mockContent(page);
  await page.goto("/play.html?l=B&m=03&s=W1-MON");
  await expect(page.locator("#playTitle")).toHaveText(
    "Week 1 · Mon · Opening Song",
  );

  const parsed = await page.evaluate(() => ({
    path: window.craPlay.parsePlayRoute("/q/b/3/w1-mon/", ""),
    upper: window.craPlay.parsePlayRoute("/q/B/03/W1-MON", ""),
    solo: window.craPlay.parsePlayRoute("/q/b/12/opening", "?solo=1"),
    toolbarLevel: window.craPlay.parsePlayRoute("/q/l1/4/song1", ""),
  }));
  expect(parsed).toEqual({
    path: { level: "Level 1", month: "March", slot: "w1-Mon", solo: false },
    upper: { level: "Level 1", month: "March", slot: "w1-Mon", solo: false },
    solo: { level: "Level 1", month: "December", slot: "opening", solo: true },
    toolbarLevel: {
      level: "Level 2",
      month: "April",
      slot: "song1",
      solo: false,
    },
  });
});

test("play: invalid route", async ({ page }) => {
  const calls = await mockContent(page);
  for (const query of [
    "?l=x&m=3&s=w1-mon",
    "?l=b&m=2&s=w1-mon",
    "?l=b&m=3&s=w5-mon",
    "",
  ]) {
    await page.goto(`/play.html${query}`);
    await expect(page.locator("#play")).toHaveAttribute(
      "data-state",
      "invalid",
    );
    await expect(page.getByText("Oops! This code doesn't work.")).toBeVisible();
    await expect(page.locator("a[href]")).toHaveCount(0);
  }
  expect(calls).toHaveLength(0);
});

test("play: empty, whitespace and missing row are coming soon", async ({
  page,
}) => {
  await mockContent(page);
  for (const slot of ["unit", "w2-tue"]) {
    await page.goto(`/play.html?l=b&m=3&s=${slot}`);
    await expect(page.locator("#play")).toHaveAttribute("data-state", "empty");
    await expect(page.getByText("Coming soon!")).toBeVisible();
    await expect(
      page.getByText("This video isn't ready yet. Check back soon!"),
    ).toBeVisible();
  }

  await page.unroute(CONTENT_ROUTE);
  await page.route(CONTENT_ROUTE, (route) => route.fulfill({ json: [] }));
  await page.goto("/play.html?l=b&m=3&s=w1-mon");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "empty");
  await expect(page.getByText("Coming soon!")).toBeVisible();
});

test("play: REST failure shows retry", async ({ page }) => {
  let status = 402;
  const calls = [];
  await page.route(CONTENT_ROUTE, (route) => {
    calls.push(route.request().url());
    return status === 200
      ? route.fulfill({ json: [MARCH_ROW] })
      : route.fulfill({ status, json: { message: "restricted" } });
  });
  await page.goto("/play.html?l=b&m=3&s=w1-mon");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "error");
  await expect(page.getByText("Can't load right now.")).toBeVisible();

  status = 200;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("#play")).toHaveAttribute("data-state", "ready");
  expect(calls).toHaveLength(2);
});

test("play: game slot navigates on tap", async ({ page }) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=game");
  await expect(page.locator("#playTitle")).toHaveText("Game");
  await expect(page.locator("#playGame")).toHaveText("Let's play!");
  await expect(page.locator("#playStart")).toBeHidden();
  await page.locator("#playGame").click();
  await page.waitForURL(GAME_URL);
  expect(page.url()).toBe(GAME_URL);
});

test("play: resolvePlayback strategies", async ({ page }) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w1-mon");
  const result = await page.evaluate(
    ({ publisher, game }) => {
      const resolve = window.craPlay.resolvePlayback;
      return {
        page: resolve(publisher, "video", "page"),
        direct: resolve(publisher, "video", "direct"),
        playerPage: resolve(publisher, "video", "player-page"),
        youtube: resolve("https://youtu.be/LPl2AR2rm0g", "video", "page"),
        vimeoId: resolve("12345", "video", "page"),
        game: resolve(game, "game", "page"),
        empty: resolve("", "video", "page"),
        blank: resolve("   ", "video", "page"),
      };
    },
    { publisher: PUBLISHER_58, game: GAME_URL },
  );
  expect(result).toEqual({
    page: { type: "frame", url: PUBLISHER_58 },
    direct: { type: "vimeo", id: 173725167 },
    playerPage: { type: "frame", url: PUBLISHER_58 },
    youtube: { type: "youtube", id: "LPl2AR2rm0g" },
    vimeoId: { type: "vimeo", id: 12345 },
    game: { type: "game", url: GAME_URL },
    empty: null,
    blank: null,
  });
});

test("play: cost guard — no Storage, one content read", async ({ page }) => {
  const storage = [];
  page.on("request", (request) => {
    if (/\.supabase\.co\/storage\//.test(request.url())) {
      storage.push(request.url());
    }
  });
  const calls = await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w1-mon");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "ready");
  await page.locator("#playStart").click();
  await expect(page.locator("#playFrame iframe")).toHaveCount(1);
  expect(storage).toEqual([]);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain("level=eq.Level%201");
  expect(calls[0]).toContain("month=eq.March");
});

test("play: offline by default on localhost", async ({ page }) => {
  // Registered after beforeEach's opt-in, so this init script wins.
  await page.addInitScript(() => localStorage.removeItem("cra:dev-live"));
  const supabase = [];
  page.on("request", (request) => {
    if (/\.supabase\.co\//.test(request.url())) supabase.push(request.url());
  });
  await page.goto("/play.html?l=b&m=3&s=w1-mon");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "error");
  expect(supabase).toEqual([]);
});

/* ---- (B) month list, (A) solo mode, end-of-video ------------------------ */

test("play list: 24 items for Beginner, current highlighted", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w1-tue");
  const items = page.locator("#playList .play-item");
  await expect(items).toHaveCount(24);
  await expect(page.locator('#playList [aria-current="true"]')).toHaveCount(1);
  await expect(
    page.locator('#playList .play-item[data-slot="w1-Tue"]'),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    page.locator('#playList .play-item[data-slot="unit"]'),
  ).toHaveClass(/is-empty/);
  await expect(
    page.locator('#playList .play-item[data-slot="w2-Tue"]'),
  ).toHaveClass(/is-empty/);
  await expect(
    page.locator('#playList .play-item[data-slot="w1-Mon"]'),
  ).not.toHaveClass(/is-empty/);
  // No way out of the month: the list has buttons, never links.
  await expect(page.locator("a[href]")).toHaveCount(0);
});

test("play list: 26 items for Level 1-3 code", async ({ page }) => {
  await mockContent(page);
  await page.goto("/play.html?l=l1&m=3&s=w1-mon");
  await expect(page.locator("#playLevel")).toHaveText("Level 1");
  await expect(page.locator("#playList .play-item")).toHaveCount(26);
});

test("play list: a month with no row lists every slot as Soon", async ({
  page,
}) => {
  await page.route(CONTENT_ROUTE, (route) => route.fulfill({ json: [] }));
  await page.goto("/play.html?l=b&m=5&s=w1-mon");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "empty");
  await expect(page.locator("#playList .play-item.is-empty")).toHaveCount(24);
});

test("play list: switching reuses the row", async ({ page }) => {
  const calls = await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w1-mon");
  await page.locator('#playList .play-item[data-slot="w2-Mon"]').click();
  await expect(page.locator("#playTitle")).toHaveText(
    "Week 2 · Mon · Opening Song",
  );
  await expect(page).toHaveURL(/[?&]s=w2-mon(&|$)/);
  // The tap is the user gesture, so the video mounts right away.
  await expect(page.locator("#playFrame iframe")).toHaveCount(1);
  await expect(
    page.locator('#playList .play-item[data-slot="w2-Mon"]'),
  ).toHaveAttribute("aria-current", "true");
  expect(calls).toHaveLength(1);
});

test("play list: empty item shows coming soon without leaving", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w1-mon");
  await page.locator('#playList .play-item[data-slot="w3-Fri"]').click();
  await expect(page.locator("#play")).toHaveAttribute("data-state", "empty");
  await expect(page.getByText("Coming soon!")).toBeVisible();
  await expect(page.locator("#playList")).toBeVisible();
  await expect(page.locator("#playFrame iframe")).toHaveCount(0);
});

test("play solo mode hides the list", async ({ page }) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w1-mon&solo=1");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "ready");
  // Rendered (24 items) but hidden — not merely absent.
  await expect(page.locator("#playList .play-item")).toHaveCount(24);
  await expect(page.locator("#playList")).toBeHidden();
  await expect(page.locator("#playNextInline")).toHaveCount(1);
  await expect(page.locator("#playNextInline")).toBeHidden();
});

test("play solo mode centers the player block vertically", async ({ page }) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w1-mon&solo=1");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "ready");
  const { blockMid, viewportMid } = await page.evaluate(() => {
    const box = document.querySelector(".play-player").getBoundingClientRect();
    return {
      blockMid: box.top + box.height / 2,
      viewportMid: window.innerHeight / 2,
    };
  });
  expect(Math.abs(blockMid - viewportMid)).toBeLessThan(12);
});

test("play list: current mark is a corner badge, label stays one line", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w1-mon");
  const result = await page.evaluate(() => {
    const current = document.querySelector('.play-item[aria-current="true"]');
    const other = document.querySelector('.play-item[data-slot="w1-Tue"]');
    const label = (el) => el.querySelector(".play-item-label");
    const badge = getComputedStyle(current, "::after");
    return {
      labelBefore: getComputedStyle(label(current), "::before").content,
      badge: badge.content,
      badgePosition: badge.position,
      currentLabelHeight: label(current).getBoundingClientRect().height,
      otherLabelHeight: label(other).getBoundingClientRect().height,
    };
  });
  expect(result.labelBefore).toBe("none");
  expect(result.badge).toContain("▶");
  expect(result.badgePosition).toBe("absolute");
  expect(result.currentLabelHeight).toBe(result.otherLabelHeight);
});

test("play end overlay: next only when a filled slot follows", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w1-mon");
  const next = await page.evaluate((row) => {
    const find = window.craPlay.nextFilledSlot;
    return {
      afterW1Mon: find(row, "Level 1", "w1-Mon"),
      // "game" is skipped, empty "unit" is skipped.
      afterEnding: find(row, "Level 1", "ending"),
      // w2-Tue is whitespace only.
      afterW2Mon: find(row, "Level 1", "w2-Mon"),
      afterLast: find(row, "Level 1", "w4-Mon"),
      noRow: find(null, "Level 1", "w1-Mon"),
    };
  }, MARCH_ROW);
  expect(next).toEqual({
    afterW1Mon: "w1-Tue",
    afterEnding: "w1-Mon",
    afterW2Mon: "w3-Mon",
    afterLast: null,
    noRow: null,
  });

  await page.locator("#playStart").click();
  await page.evaluate(() => window.craPlay.showEnded());
  await expect(page.locator("#play")).toHaveAttribute("data-state", "ended");
  await expect(page.locator("#playAgain")).toHaveText("Watch again");
  await expect(page.locator("#playNext")).toBeVisible();

  await page.goto("/play.html?l=b&m=3&s=w4-mon");
  await page.locator("#playStart").click();
  await page.evaluate(() => window.craPlay.showEnded());
  await expect(page.locator("#playAgain")).toBeVisible();
  await expect(page.locator("#playNext")).toBeHidden();

  await page.goto("/play.html?l=b&m=3&s=w1-mon&solo=1");
  await page.locator("#playStart").click();
  await page.evaluate(() => window.craPlay.showEnded());
  await expect(page.locator("#playAgain")).toBeVisible();
  await expect(page.locator("#playNext")).toBeHidden();
});

test("play end overlay: watch again and next restart playback", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w2-mon");
  await page.locator("#playStart").click();
  await page.evaluate(() => window.craPlay.showEnded());
  await page.locator("#playAgain").click();
  await expect(page.locator("#play")).toHaveAttribute("data-state", "playing");
  await expect(page.locator("#playEnd")).toBeHidden();

  await page.evaluate(() => window.craPlay.showEnded());
  await page.locator("#playNext").click();
  await expect(page.locator("#playTitle")).toHaveText(
    "Week 3 · Mon · Opening Song",
  );
  await expect(page.locator("#play")).toHaveAttribute("data-state", "playing");
  await expect(page.locator("#playFrame iframe")).toHaveCount(1);
});

test("play inline next: shown under a publisher page only", async ({
  page,
}) => {
  await mockContent(page);
  // Publisher page (framed): no end event, so Next sits under the player.
  await page.goto("/play.html?l=b&m=3&s=w2-mon");
  await expect(page.locator("#playNextInline")).toBeVisible();
  await page.locator("#playNextInline").click();
  await expect(page.locator("#playTitle")).toHaveText(
    "Week 3 · Mon · Opening Song",
  );
  await expect(page.locator("#playFrame iframe")).toHaveAttribute(
    "src",
    "https://tps-education.com/58?video=173725170",
  );

  // YouTube slot: Next only arrives with the end overlay.
  await page.goto("/play.html?l=b&m=3&s=w1-tue");
  await expect(page.locator("#playNextInline")).toBeHidden();

  // Last filled slot: nothing to go to.
  await page.goto("/play.html?l=b&m=3&s=w4-mon");
  await expect(page.locator("#playNextInline")).toBeHidden();
});
