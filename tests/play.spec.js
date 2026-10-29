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
    beginnerSlots: allSlotKeys("beginner").length,
    levelOneSlots: allSlotKeys("level-1").length,
    path: qrPath("beginner", "March", "w1-Mon"),
    slotUpper: slotFromQr("W4-FRI", "beginner"),
    slotOtherLevel: slotFromQr("song1", "beginner"),
    monthPadded: monthFromNumber("03"),
    monthOutOfRange: monthFromNumber(13),
    sameParser: window.craVideo.parseVideoSource === parseVideoSource,
    // board-view.js (shared DOM builders) loads between the two as well.
    builders: [
      typeof buildToolbarButton,
      typeof buildCoverCard,
      typeof buildWeekRow,
    ],
    icons: Object.keys(ICON_SVGS),
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
    builders: ["function", "function", "function"],
    icons: ["video", "game", "music"],
  });
  expect(pageErrors).toEqual([]);
});

test("board-view builders produce the teacher board markup", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#homeTitle")).toBeVisible();
  const html = await page.evaluate(() => {
    const song = buildToolbarButton(
      {
        slot: "song1",
        kind: "video",
        label: "I Sit",
        icon: "music",
        tag: "song",
      },
      "The Tractor",
      { active: true },
    );
    const plain = buildToolbarButton(
      {
        slot: "opening",
        kind: "video",
        label: "Good Morning Song",
        icon: "video",
      },
      "Good Morning Song",
    );
    const cover = buildCoverCard(2, "Title B");
    const row = buildWeekRow(3, "Title B");
    return {
      song: song.outerHTML.replace(/<svg[\s\S]*?<\/svg>/, "<svg/>"),
      plain: plain.outerHTML.replace(/<svg[\s\S]*?<\/svg>/, "<svg/>"),
      songSvg: song.querySelector("svg") !== null,
      cover: cover.outerHTML,
      label: row.label.outerHTML,
      buttons: row.buttons.map((b) => b.outerHTML),
    };
  });
  expect(html.song).toBe(
    '<button type="button" class="content-type active" data-slot="song1" data-kind="video">' +
      '<span class="content-type-icon content-type-icon--music" aria-hidden="true"><svg/></span>' +
      '<span class="content-type-label">The Tractor</span>' +
      '<span class="content-type-tag content-type-tag--song">SONG</span></button>',
  );
  expect(html.plain).toBe(
    '<button type="button" class="content-type" data-slot="opening" data-kind="video">' +
      '<span class="content-type-icon content-type-icon--video" aria-hidden="true"><svg/></span>' +
      '<span class="content-type-label">Good Morning Song</span></button>',
  );
  expect(html.songSvg).toBe(true);
  expect(html.cover).toBe(
    '<div class="book-title-card book-2" role="img" aria-label="Title B cover placeholder"></div>',
  );
  expect(html.label).toBe(
    '<div class="week-label"><span class="wk-text"><span class="wk-num">3</span> <span class="wk-word">week</span></span></div>',
  );
  expect(html.buttons).toHaveLength(5);
  expect(html.buttons[0]).toBe(
    '<button class="lesson-button day-1" type="button" aria-label="Title B, 3 week, Opening Song" data-vp-title="Opening Song · Week 3 · Mon" data-slot="w3-Mon"><strong>Mon</strong></button>',
  );
  expect(html.buttons[4]).toBe(
    '<button class="lesson-button day-5" type="button" aria-label="Title B, 3 week, Ending Song" data-vp-title="Ending Song · Week 3 · Fri" data-slot="w3-Fri"><strong>Fri</strong></button>',
  );
});

test("book layout: fixed book↔week mapping and book-level QR tokens", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#homeTitle")).toBeVisible();

  const result = await page.evaluate(() => ({
    beginnerBooks: bookLayout("beginner").map((b) => b.book),
    levelBooks: bookLayout("level-2").map((b) => b.book),
    beginnerWeeks: bookEntry("beginner", 1).weeks,
    book1Weeks: bookEntry("level-1", 1).weeks,
    book2Weeks: bookEntry("level-1", 2).weeks,
    beginnerBook2: bookEntry("beginner", 2),
    book3: bookEntry("level-1", 3),
    book0: bookEntry("level-1", 0),
    bookString: bookEntry("level-1", "2").book,
    beginnerKeys: bookSlotKeys("beginner", 1),
    book1Keys: bookSlotKeys("level-1", 1),
    book2Keys: bookSlotKeys("level-1", 2),
    book2Toolbar: bookToolbarButtons("level-3", 2).map((b) => b.slot),
    book1ToolbarTags: bookToolbarButtons("level-3", 1).map((b) => b.tag || ""),
    beginnerToolbar: bookToolbarButtons("beginner", 1).map((b) => b.slot),
    covers: bookLayout("level-1").map((b) => b.cover),
    path: bookQrPath("level-2", "March", 2),
    pathBeginner: bookQrPath("beginner", "December", 1),
    name: bookQrName("beginner", "March", 1),
    name2: bookQrName("level-3", "December", 2),
    aliasOne: levelFromQrCode("1"),
    aliasThree: levelFromQrCode("3"),
    aliasB: levelFromQrCode("B"),
    aliasZero: levelFromQrCode("0"),
    aliasFour: levelFromQrCode("4"),
    legacy: levelFromQrCode("l3"),
    // Unchanged for now (removed in Task 2.5 with the route switch).
    legacyPath: qrPath("beginner", "March", "w1-Mon"),
  }));

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const weekKeys = (weeks) =>
    weeks.flatMap((w) => weekdays.map((d) => `w${w}-${d}`));
  expect(result).toEqual({
    beginnerBooks: [1],
    levelBooks: [1, 2],
    beginnerWeeks: [1, 2, 3, 4],
    book1Weeks: [1, 2],
    book2Weeks: [3, 4],
    beginnerBook2: null,
    book3: null,
    book0: null,
    bookString: 2,
    beginnerKeys: [
      "opening",
      "ending",
      "game",
      "unit",
      ...weekKeys([1, 2, 3, 4]),
    ],
    book1Keys: ["opening", "ending", "game", "song1", ...weekKeys([1, 2])],
    book2Keys: ["opening", "ending", "game2", "song2", ...weekKeys([3, 4])],
    book2Toolbar: ["opening", "ending", "game2", "song2"],
    book1ToolbarTags: ["", "", "game", "song"],
    beginnerToolbar: ["opening", "ending", "game", "unit"],
    covers: ["book-1", "book-2"],
    path: "/q/l2/3/2",
    pathBeginner: "/q/b/12/1",
    name: "B-03-1",
    name2: "L3-12-2",
    aliasOne: "level-1",
    aliasThree: "level-3",
    aliasB: "beginner",
    aliasZero: null,
    aliasFour: null,
    legacy: "level-3",
    legacyPath: "/q/b/3/w1-mon",
  });
  expect(result.beginnerKeys).toHaveLength(24);
  expect(result.book2Keys).toHaveLength(14);
});

test("isGameUrl / parseVideoSource: game hosts become kind game", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#homeTitle")).toBeVisible();

  const result = await page.evaluate(() => {
    const game = "https://book-english-games.vercel.app/play/the-tractor";
    const before = {
      game: isGameUrl(game),
      www: isGameUrl("https://www.book-english-games.vercel.app/play/x"),
      query: isGameUrl("https://book-english-games.vercel.app/?game=1"),
      upper: isGameUrl("HTTPS://BOOK-ENGLISH-GAMES.VERCEL.APP/play/x"),
      root: isGameUrl("https://book-english-games.vercel.app"),
      // Only that host and its subdomains — not a look-alike.
      lookAlike: isGameUrl("https://book-english-games.vercel.app.evil.com/"),
      other: isGameUrl("https://example.com/play/the-tractor"),
      publisher: isGameUrl("https://tps-education.com/58?video=173725167"),
      notUrl: isGameUrl("the-tractor"),
      empty: isGameUrl(""),
      extraBefore: isGameUrl("https://games.example.org/x"),
      parsedGame: parseVideoSource(game),
      // Existing kinds are untouched.
      parsedPage: parseVideoSource(
        "https://tps-education.com/58?video=173725167",
      ),
      parsedDirect: parseVideoSource(
        "https://tps-education.com/58?video=173725167",
        { publisher: "direct" },
      ),
      parsedYoutube: parseVideoSource("https://youtu.be/LPl2AR2rm0g"),
      parsedVimeo: parseVideoSource("https://vimeo.com/76979871"),
      parsedId: parseVideoSource("76979871"),
      hosts: GAME_HOSTS.slice(),
    };
    // Extra hosts (site_settings.game_hosts) merge with the constant.
    setExtraGameHosts(["games.example.org", " BAD HOST ", 42, ""]);
    const extra = {
      extraAfter: isGameUrl("https://games.example.org/x"),
      extraParsed: parseVideoSource("https://games.example.org/x").kind,
      stillGame: isGameUrl(game),
      hostsUnchanged: GAME_HOSTS.slice(),
    };
    setExtraGameHosts(null);
    const reset = { extraReset: isGameUrl("https://games.example.org/x") };
    return { ...before, ...extra, ...reset };
  });

  expect(result).toEqual({
    game: true,
    www: true,
    query: true,
    upper: true,
    root: true,
    lookAlike: false,
    other: false,
    publisher: false,
    notUrl: false,
    empty: false,
    extraBefore: false,
    parsedGame: {
      kind: "game",
      url: "https://book-english-games.vercel.app/play/the-tractor",
    },
    parsedPage: {
      kind: "page",
      url: "https://tps-education.com/58?video=173725167",
    },
    parsedDirect: { kind: "vimeo", id: 173725167 },
    parsedYoutube: { kind: "youtube", id: "LPl2AR2rm0g" },
    parsedVimeo: { kind: "vimeo", url: "https://vimeo.com/76979871" },
    parsedId: { kind: "vimeo", id: 76979871 },
    hosts: ["book-english-games.vercel.app"],
    extraAfter: true,
    extraParsed: "game",
    stillGame: true,
    hostsUnchanged: ["book-english-games.vercel.app"],
    extraReset: false,
  });
});

test("parseVideoSource: publisher option turns a TPS page into its Vimeo id", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#homeTitle")).toBeVisible();

  const result = await page.evaluate(() => {
    const direct = { publisher: "direct" };
    return {
      tps58: parseVideoSource(
        "https://tps-education.com/58?video=173725167",
        direct,
      ),
      tps60www: parseVideoSource(
        "https://www.tps-education.com/60?video=173728500",
        direct,
      ),
      tps61: parseVideoSource(
        "https://tps-education.com/61?video=173431191",
        direct,
      ),
      // Not a TPS page with a numeric video id: unchanged by the option.
      otherHost: parseVideoSource("https://example.com/?video=1", direct),
      youtube: parseVideoSource("https://youtu.be/LPl2AR2rm0g", direct),
      // The teacher site calls without the option: still a framed page.
      noOption: parseVideoSource(
        "https://tps-education.com/58?video=173725167",
      ),
    };
  });

  expect(result).toEqual({
    tps58: { kind: "vimeo", id: 173725167 },
    tps60www: { kind: "vimeo", id: 173728500 },
    tps61: { kind: "vimeo", id: 173431191 },
    otherHost: { kind: "page", url: "https://example.com/?video=1" },
    youtube: { kind: "youtube", id: "LPl2AR2rm0g" },
    noOption: {
      kind: "page",
      url: "https://tps-education.com/58?video=173725167",
    },
  });
});

/* ---- QR student page (play.html) ---------------------------------------
   One QR per BOOK (/q/<lv>/<month>/<book>). The page reads exactly one
   content_pages row over REST and renders the teacher 페이지2 board for that
   book; a board tap opens the player overlay. These specs answer the REST
   request from a fixture instead of the live project: zero egress and a
   deterministic row. (smoke.spec.js keeps REST live because its main-site
   specs were tuned against real REST latency; play.html is a separate page
   with no such timing.) Publisher pages, the game host and the static covers
   are stubbed too. */
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
    // A game URL in a weekday slot (R1): behaves like the toolbar game slot.
    "w1-Thu": GAME_URL,
    "w2-Mon": "https://tps-education.com/58?video=173725165",
    "w2-Tue": "  ",
    "w3-Mon": "https://tps-education.com/58?video=173725170",
    "w4-Mon": "https://tps-education.com/58?video=173725171",
  },
  labels: {},
};
// A Level 1 (internal "level-1") month: two books, custom titles, book 2's
// game slot filled, a video in each book's weeks.
const LEVEL2_ROW = {
  videos: {
    opening: "https://youtu.be/tHybl0l9tbQ",
    ending: "https://youtu.be/P23iESqE8lk",
    game: GAME_URL,
    game2: GAME_URL,
    song1: "https://youtu.be/LPl2AR2rm0g",
    song2: "",
    "w1-Mon": PUBLISHER_58,
    "w2-Mon": "https://tps-education.com/58?video=173725165",
    "w3-Mon": "https://tps-education.com/58?video=173725170",
    "w3-Tue": "https://youtu.be/LPl2AR2rm0g",
    "w4-Fri": "https://tps-education.com/58?video=173725171",
  },
  labels: {
    game: "The Tractor",
    game2: "I Can Help",
    song1: "The Tractor",
    song2: "I Can Help",
  },
};
const CONTENT_ROUTE = /\/rest\/v1\/content_pages/;
const COVER_ROUTE = /\/assets\/covers\//;
const BLANK_PNG_FILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

// Answers content_pages with `rows` (or an HTTP status) and counts requests.
// Covers 404 unless `covers` is true (the placeholder then stays).
async function mockContent(page, rows = [MARCH_ROW], status = 200, covers) {
  const calls = [];
  await page.route(CONTENT_ROUTE, (route) => {
    calls.push(route.request().url());
    return status === 200
      ? route.fulfill({ status, json: rows })
      : route.fulfill({ status, json: { message: "restricted" } });
  });
  await page.route(COVER_ROUTE, (route) =>
    covers
      ? route.fulfill({ contentType: "image/png", body: BLANK_PNG_FILE })
      : route.fulfill({ status: 404, body: "" }),
  );
  await page.route(/^https:\/\/(www\.)?tps-education\.com\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>publisher</p>" }),
  );
  await page.route(/^https:\/\/book-english-games\.vercel\.app\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>game</p>" }),
  );
  return calls;
}

// A board tap (toolbar or weekday button) — the user gesture that opens the
// overlay and mounts the player.
async function tapSlot(page, slot) {
  await expect(page.locator("#play")).toHaveAttribute("data-state", "board");
  await page.locator(`#contentScreen [data-slot="${slot}"]`).click();
}

async function closeOverlay(page) {
  await page.locator("#playClose").click();
  await expect(page.locator("#playOverlay")).toBeHidden();
}

test("play board: a Beginner book is the whole month, shaped like 페이지2", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "board");
  await expect(page).toHaveTitle(
    "Beginner 3 · Book 1 · Cambridge Reading Adventures",
  );

  const screen = page.locator("#contentScreen");
  await expect(screen).toHaveClass(/level-theme-beginner/);
  await expect(screen).toHaveAttribute("data-month", "March");
  await expect(page.locator("#contentLevelName")).toHaveText("Beginner");
  await expect(page.locator("#contentBannerMonthNumber")).toHaveText("3");
  await expect(page.locator("#contentMainMonthNumber")).toHaveText("3");
  await expect(page.locator("#contentTitle")).toHaveText("March Reading Plan");
  await expect(page.locator("#contentPathTag")).toHaveText("Beginner");

  const toolbar = page.locator("#contentScreen .content-type");
  await expect(toolbar).toHaveCount(4);
  expect(
    await toolbar.evaluateAll((els) => els.map((e) => e.dataset.slot)),
  ).toEqual(["opening", "ending", "game", "unit"]);
  await expect(toolbar.locator(".content-type-label")).toHaveText([
    "Good Morning Song",
    "Good Bye Song",
    "Game",
    "Unit Song",
  ]);
  await expect(toolbar.first()).toHaveClass(/active/);
  await expect(page.locator(".content-toolbar--wide")).toHaveCount(0);

  await expect(page.locator("#lessonGrid .book-title-card")).toHaveCount(1);
  await expect(
    page.locator("#lessonGrid .book-title-card.book-1"),
  ).toHaveAttribute("aria-label", "Beginner Book 1 cover placeholder");
  await expect(page.locator("#lessonGrid .week-label .wk-num")).toHaveText([
    "1",
    "2",
    "3",
    "4",
  ]);
  const days = page.locator("#lessonGrid .lesson-button");
  await expect(days).toHaveCount(20);
  await expect(days.first()).toHaveAttribute("data-slot", "w1-Mon");
  await expect(days.last()).toHaveAttribute("data-slot", "w4-Fri");

  // No way out: no links, no level/month navigation, no login, no list.
  await expect(page.locator("a[href]")).toHaveCount(0);
  await expect(
    page.locator("button[data-level], button[data-view]"),
  ).toHaveCount(0);
  await expect(
    page.locator(".content-nav-prev, .content-nav-next, .back-button"),
  ).toHaveCount(0);
  await expect(page.locator("#playList, .top-nav, .login-button")).toHaveCount(
    0,
  );
  await expect(page.locator(".play-brand")).toHaveText(/Cambridge\s+Reading/);
  await expect(page.locator(".play-footer")).toContainText("TPS EDUCATION");
  await expect(page.locator("#playOverlay")).toBeHidden();
});

test("play board: a Level 1 book 2 shows only its half of the month", async ({
  page,
}) => {
  await mockContent(page, [LEVEL2_ROW]);
  await page.goto("/play.html?l=l1&m=3&b=2");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "board");
  await expect(page.locator("#contentScreen")).toHaveClass(
    /level-theme-level-1/,
  );
  await expect(page.locator("#contentLevelName")).toHaveText("Level 1");

  const toolbar = page.locator("#contentScreen .content-type");
  expect(
    await toolbar.evaluateAll((els) => els.map((e) => e.dataset.slot)),
  ).toEqual(["opening", "ending", "game2", "song2"]);
  await expect(toolbar.locator(".content-type-label")).toHaveText([
    "Good Morning Song",
    "Good Bye Song",
    "I Can Help",
    "I Can Help",
  ]);
  await expect(toolbar.locator(".content-type-tag")).toHaveText([
    "GAME",
    "SONG",
  ]);

  await expect(page.locator("#lessonGrid .book-title-card")).toHaveCount(1);
  await expect(
    page.locator("#lessonGrid .book-title-card.book-2"),
  ).toHaveAttribute("aria-label", "I Can Help cover placeholder");
  await expect(page.locator("#lessonGrid .book-title-card.book-1")).toHaveCount(
    0,
  );
  await expect(page.locator("#lessonGrid .week-label .wk-num")).toHaveText([
    "3",
    "4",
  ]);
  const days = page.locator("#lessonGrid .lesson-button");
  await expect(days).toHaveCount(10);
  await expect(days.first()).toHaveAttribute("data-slot", "w3-Mon");
  await expect(days.first()).toHaveAttribute(
    "aria-label",
    "I Can Help, 3 week, Opening Song",
  );
  await expect(days.last()).toHaveAttribute("data-slot", "w4-Fri");
  await expect(page.locator('#contentScreen [data-slot="w1-Mon"]')).toHaveCount(
    0,
  );
  await expect(page.locator('#contentScreen [data-slot="game"]')).toHaveCount(
    0,
  );
});

test("play board: the cover paints from the static asset, placeholder on 404", async ({
  page,
}) => {
  const covers = [];
  page.on("request", (request) => {
    if (COVER_ROUTE.test(request.url())) covers.push(request.url());
  });
  await mockContent(page, [LEVEL2_ROW], 200, true);
  await page.goto("/play.html?l=l1&m=3&b=2");
  const card = page.locator("#lessonGrid .book-title-card");
  await expect(card).toHaveClass(/has-cover/);
  await expect(card).toHaveCSS(
    "background-image",
    /\/assets\/covers\/level-1\/march\/book-2.jpg/,
  );
  expect(covers).toEqual([
    "http://127.0.0.1:5173/assets/covers/level-1/march/book-2.jpg",
  ]);

  await page.unroute(COVER_ROUTE);
  await page.route(COVER_ROUTE, (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.goto("/play.html?l=l1&m=3&b=2");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "board");
  await expect(page.locator("#lessonGrid .book-title-card")).not.toHaveClass(
    /has-cover/,
  );
  await expect(page.locator("#lessonGrid .book-title-card")).toHaveCSS(
    "background-image",
    "none",
  );
});

test("play: route variants", async ({ page }) => {
  await mockContent(page, [LEVEL2_ROW]);
  for (const query of [
    "?l=L1&m=03&b=2",
    "?l=1&m=3&b=2",
    "?l=l1&m=3&b=2&host=x",
  ]) {
    await page.goto(`/play.html${query}`);
    await expect(page.locator("#play")).toHaveAttribute("data-state", "board");
    await expect(page.locator("#contentLevelName")).toHaveText("Level 1");
    await expect(page.locator("#lessonGrid .week-label .wk-num")).toHaveText([
      "3",
      "4",
    ]);
  }
  const result = await page.evaluate(() => {
    const parse = window.craPlay.parsePlayRoute;
    return {
      path: parse("/q/l2/3/2", ""),
      pathSlash: parse("/q/B/12/1/", ""),
      alias: parse("/q/3/5/1", ""),
      query: parse("/play.html", "?l=b&m=3&b=1"),
      queryWins: parse(
        "/play.html",
        "?l=b&m=4&b=1&host=play.tps-education.com",
      ),
    };
  });
  expect(result).toEqual({
    path: { level: "level-2", month: "March", book: 2 },
    pathSlash: { level: "beginner", month: "December", book: 1 },
    alias: { level: "level-3", month: "May", book: 1 },
    query: { level: "beginner", month: "March", book: 1 },
    queryWins: { level: "beginner", month: "April", book: 1 },
  });
});

test("play: invalid route shows the notice and no board", async ({ page }) => {
  await mockContent(page);
  for (const query of [
    "?l=b&m=3&b=2", // Beginner has one book
    "?l=b&m=3&b=0",
    "?l=l1&m=3&b=3",
    "?l=b&m=3&b=w1-mon",
    "?l=b&m=3&s=w1-mon", // first-generation weekday token: no book
    "?l=x&m=3&b=1",
    "?l=b&m=13&b=1",
    "?l=4&m=3&b=1",
    "",
  ]) {
    await page.goto(`/play.html${query}`);
    await expect(page.locator("#play")).toHaveAttribute(
      "data-state",
      "invalid",
    );
    await expect(page.getByText("Oops! This code doesn't work.")).toBeVisible();
    await expect(page.locator("#contentScreen")).toBeHidden();
    await expect(page.locator("a[href]")).toHaveCount(0);
  }
  const result = await page.evaluate(() => {
    const parse = window.craPlay.parsePlayRoute;
    return [
      parse("/q/b/3/w1-mon", ""),
      parse("/q/b/3/2", ""),
      parse("/q/b/3", ""),
      parse("/q/b/3/1/extra", ""),
      parse("/q/b/3/%E2", ""),
    ];
  });
  expect(result).toEqual([null, null, null, null, null]);
});

test("play: empty slot and missing row open coming soon, nothing leaves", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "w2-Tue"); // whitespace only
  const overlay = page.locator("#playOverlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-state", "empty");
  await expect(page.getByText("Coming soon!")).toBeVisible();
  await expect(
    page.getByText("This video isn't ready yet. Check back soon!"),
  ).toBeVisible();
  await expect(page.locator("#playTitle")).toHaveText("Week 2 · Tue · Story");
  await expect(page.locator("#playFrame iframe")).toHaveCount(0);
  await closeOverlay(page);
  await expect(page.locator("#play")).toHaveAttribute("data-state", "board");

  await tapSlot(page, "unit"); // not in the row at all
  await expect(overlay).toHaveAttribute("data-state", "empty");
  await closeOverlay(page);

  // A month with no row yet: the board is there, every tap is coming soon.
  await page.unroute(CONTENT_ROUTE);
  await page.route(CONTENT_ROUTE, (route) => route.fulfill({ json: [] }));
  await page.goto("/play.html?l=b&m=5&b=1");
  await expect(page.locator("#lessonGrid .lesson-button")).toHaveCount(20);
  await tapSlot(page, "w1-Mon");
  await expect(overlay).toHaveAttribute("data-state", "empty");
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
  await page.route(COVER_ROUTE, (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.goto("/play.html?l=b&m=3&b=1");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "error");
  await expect(page.getByText("Can't load right now.")).toBeVisible();
  await expect(page.locator("#contentScreen")).toBeHidden();

  status = 200;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("#play")).toHaveAttribute("data-state", "board");
  await expect(page.locator("#playNotice")).toBeHidden();
  expect(calls).toHaveLength(2);
});

test("play: a REST read that never answers times out to retry", async ({
  page,
}) => {
  await page.clock.install();
  await page.route(CONTENT_ROUTE, () => {
    /* never answered — a hung network */
  });
  await page.goto("/play.html?l=b&m=3&b=1");
  const play = page.locator("#play");
  await expect(play).toHaveAttribute("data-state", "loading");

  await page.clock.runFor(9000);
  await expect(play).toHaveAttribute("data-state", "loading");

  await page.clock.runFor(1500); // past the 10 s limit
  await expect(play).toHaveAttribute("data-state", "error");
  await expect(page.getByText("Can't load right now.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("play: the toolbar game slot offers the game, tap navigates", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "game");
  await expect(page.locator('#contentScreen [data-slot="game"]')).toHaveClass(
    /active/,
  );
  await expect(page.locator("#playOverlay")).toHaveAttribute(
    "data-state",
    "ready",
  );
  await expect(page.locator("#playTitle")).toHaveText("Game");
  await expect(page.locator("#playGame")).toHaveText("Let's play!");
  await expect(page.locator("#playStart")).toBeHidden();
  await expect(page.locator("#playFrame iframe")).toHaveCount(0);
  await page.locator("#playGame").click();
  await page.waitForURL(GAME_URL);
  expect(page.url()).toBe(GAME_URL);
});

test("play: a weekday game URL offers the game like the toolbar slot", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "w1-Thu");
  await expect(page.locator("#playTitle")).toHaveText(
    "Week 1 · Thu · Sentence Chant",
  );
  await expect(page.locator("#playGame")).toHaveText("Let's play!");
  await expect(page.locator("#playStart")).toBeHidden();
  await expect(page.locator("#playFrame iframe")).toHaveCount(0);
  await page.locator("#playGame").click();
  await page.waitForURL(GAME_URL);
  expect(page.url()).toBe(GAME_URL);
});

test("play: resolvePlayback strategies", async ({ page }) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
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
        // A game URL stored in a VIDEO slot (weekday) is still a game.
        weekdayGame: resolve(game, "video", "page"),
        weekdayGameDirect: resolve(game, "video", "direct"),
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
    weekdayGame: { type: "game", url: GAME_URL },
    weekdayGameDirect: { type: "game", url: GAME_URL },
    empty: null,
    blank: null,
  });
});

/* ---- Direct Vimeo on a tps-education.com host (①안) ----------------------
   Vimeo plays the publisher's ids only on tps-education.com hosts, so there
   the page embeds player.vimeo.com directly instead of framing the publisher
   page. On 127.0.0.1 the ?host= override stands in for that host. The Vimeo
   SDK and player page are faked: no Vimeo traffic, and `ended` can be fired. */
async function mockVimeo(page) {
  await page.route("https://player.vimeo.com/api/player.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
        window.__vimeo = { players: [], textTrackOff: 0, plays: 0, pauses: 0 };
        window.Vimeo = {
          Player: function (el, options) {
            const handlers = {};
            window.__vimeo.players.push({ tag: el.tagName, src: el.src, options });
            this.on = (name, fn) => { handlers[name] = fn; };
            this.play = () => {
              window.__vimeo.plays += 1;
              return Promise.resolve();
            };
            this.pause = () => {
              window.__vimeo.pauses += 1;
              return Promise.resolve();
            };
            this.destroy = () => Promise.resolve();
            this.disableTextTrack = () => {
              window.__vimeo.textTrackOff += 1;
              return Promise.resolve();
            };
            window.__vimeo.fire = (name) => handlers[name] && handlers[name]();
          },
        };`,
    }),
  );
  await page.route(/^https:\/\/player\.vimeo\.com\/video\//, (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>vimeo</p>" }),
  );
}

test("play: publisher strategy follows the host", async ({ page }) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  const result = await page.evaluate(() => {
    const { publisherStrategy, playHost } = window.craPlay;
    return {
      play: publisherStrategy("play.tps-education.com"),
      apex: publisherStrategy("tps-education.com"),
      qrtest: publisherStrategy("QRTEST.tps-education.com"),
      teacher: publisherStrategy("www.cambridgereading.com"),
      vercel: publisherStrategy("new-app0607.vercel.app"),
      local: publisherStrategy("127.0.0.1"),
      lookalike: publisherStrategy("eviltps-education.com"),
      suffix: publisherStrategy("tps-education.com.example.com"),
      // ?host= is a test hook: honoured on localhost only.
      overrideLocal: playHost("127.0.0.1", "?l=b&host=play.tps-education.com"),
      overrideLocalhost: playHost("localhost", "?host=play.tps-education.com"),
      overrideLive: playHost(
        "www.cambridgereading.com",
        "?host=play.tps-education.com",
      ),
      noOverride: playHost("127.0.0.1", "?l=b"),
    };
  });
  expect(result).toEqual({
    play: "direct",
    apex: "direct",
    qrtest: "direct",
    teacher: "page",
    vercel: "page",
    local: "page",
    lookalike: "page",
    suffix: "page",
    overrideLocal: "play.tps-education.com",
    overrideLocalhost: "play.tps-education.com",
    overrideLive: "www.cambridgereading.com",
    noOverride: "127.0.0.1",
  });
});

test("play direct: a publisher slot embeds player.vimeo.com", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on(
    "console",
    (msg) => msg.type() === "error" && errors.push(msg.text()),
  );
  // Covers served, so the only console errors could be the player's own.
  await mockContent(page, [MARCH_ROW], 200, true);
  await mockVimeo(page);
  const publisher = [];
  page.on("request", (request) => {
    if (/tps-education\.com\//.test(request.url())) {
      publisher.push(request.url());
    }
  });

  await page.goto("/play.html?l=b&m=3&b=1&host=play.tps-education.com");
  await tapSlot(page, "w1-Mon");

  const overlay = page.locator("#playOverlay");
  const frame = page.locator("#playFrame iframe");
  await expect(frame).toHaveCount(1);
  await expect(frame).toHaveAttribute(
    "src",
    /^https:\/\/player\.vimeo\.com\/video\/173725167\?/,
  );
  const src = await frame.getAttribute("src");
  expect(new URL(src).searchParams.get("playsinline")).toBe("1");
  await expect(frame).toHaveAttribute(
    "allow",
    "autoplay; fullscreen; picture-in-picture",
  );
  await expect(overlay).toHaveAttribute("data-state", "playing");
  await expect(overlay).toHaveAttribute("data-player", "vimeo");
  await expect(page.locator("#playTitle")).toHaveText(
    "Week 1 · Mon · Opening Song",
  );
  // The SDK wraps our own iframe (no oEmbed lookup) and captions go off.
  await expect
    .poll(() => page.evaluate(() => window.__vimeo?.players ?? []))
    .toEqual([{ tag: "IFRAME", src }]);
  expect(await page.evaluate(() => window.__vimeo.textTrackOff)).toBe(1);
  // Ends like YouTube: the overlay, not the inline Next of a framed page.
  await expect(page.locator("#playNextInline")).toBeHidden();
  expect(publisher).toEqual([]);
  // The address bar keeps the override, so a refresh stays in direct mode.
  await expect(page).toHaveURL(/[?&]host=play\.tps-education\.com/);
  expect(errors).toEqual([]);
});

test("play direct: Vimeo ended shows Watch again and Next", async ({
  page,
}) => {
  await mockContent(page);
  await mockVimeo(page);
  await page.goto("/play.html?l=b&m=3&b=1&host=play.tps-education.com");
  await tapSlot(page, "w1-Mon");
  await expect
    .poll(() => page.evaluate(() => window.__vimeo?.players.length ?? 0))
    .toBe(1);

  await page.evaluate(() => window.__vimeo.fire("ended"));
  await expect(page.locator("#playOverlay")).toHaveAttribute(
    "data-state",
    "ended",
  );
  await expect(page.locator("#playAgain")).toBeVisible();
  await expect(page.locator("#playNext")).toBeVisible();

  await page.locator("#playAgain").click();
  await expect(page.locator("#playOverlay")).toHaveAttribute(
    "data-state",
    "playing",
  );
  await expect(page.locator("#playFrame iframe")).toHaveAttribute(
    "src",
    /^https:\/\/player\.vimeo\.com\/video\/173725167\?/,
  );
});

/* ---- Vimeo links and iPhone full screen ----------------------------------
   TPS moves its own songs to Vimeo (stored as vimeo.com/<id>). The student
   page turns every Vimeo link it can read into our own player.vimeo.com
   iframe. Where the page has no Fullscreen API at all (iPhone Safari and
   in-app browsers), Vimeo plays with playsinline=0: iOS then shows the video
   in its own full screen, and our ⛶ (pseudo full screen only) is hidden. */
const VIMEO_ID = 76979871;
const VIMEO_ROW = {
  videos: {
    opening: `https://vimeo.com/${VIMEO_ID}`,
    ending: `https://vimeo.com/${VIMEO_ID}/abc123def0`,
    "w1-Mon": `https://player.vimeo.com/video/${VIMEO_ID}?h=abc123def0`,
    "w1-Tue": "https://vimeo.com/showcase/11111",
    "w1-Wed": "https://youtu.be/LPl2AR2rm0g",
    "w1-Thu": PUBLISHER_58,
  },
  labels: {},
};

// The src params of the one Vimeo iframe on the page.
async function vimeoParams(page) {
  const frame = page.locator("#playFrame iframe");
  await expect(frame).toHaveCount(1);
  const url = new URL(await frame.getAttribute("src"));
  return {
    path: `${url.origin}${url.pathname}`,
    params: Object.fromEntries(url.searchParams),
  };
}

test("play: Vimeo links become an id (and private-link hash)", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  const result = await page.evaluate((id) => {
    const resolve = (url, strategy = "page") =>
      window.craPlay.resolvePlayback(url, "video", strategy);
    return {
      plain: resolve(`https://vimeo.com/${id}`),
      plainDirect: resolve(`https://vimeo.com/${id}`, "direct"),
      www: resolve(`https://www.vimeo.com/${id}/`),
      hash: resolve(`https://vimeo.com/${id}/abc123def0`),
      player: resolve(`https://player.vimeo.com/video/${id}`),
      playerHash: resolve(`https://player.vimeo.com/video/${id}?h=abc123def0`),
      showcase: resolve("https://vimeo.com/showcase/11111"),
      notVimeo: resolve(`https://notvimeo.com/${id}`),
    };
  }, VIMEO_ID);
  expect(result).toEqual({
    plain: { type: "vimeo", id: VIMEO_ID },
    plainDirect: { type: "vimeo", id: VIMEO_ID },
    www: { type: "vimeo", id: VIMEO_ID },
    hash: { type: "vimeo", id: VIMEO_ID, hash: "abc123def0" },
    player: { type: "vimeo", id: VIMEO_ID },
    playerHash: { type: "vimeo", id: VIMEO_ID, hash: "abc123def0" },
    // Shapes we can't read stay a URL for the SDK to look up.
    showcase: { type: "vimeo", url: "https://vimeo.com/showcase/11111" },
    notVimeo: { type: "frame", url: `https://notvimeo.com/${VIMEO_ID}` },
  });
});

/* ---- Full screen (⛶) ---------------------------------------------------
   Phones with the element Fullscreen API put #playStage itself into full
   screen; iPhone Safari has none, so the page falls back to a CSS "pseudo
   full screen" (body.play-fullscreen). The pseudo specs switch the API off
   (prefixed too, like iPhone Safari). */
async function withoutFullscreenApi(page) {
  await page.addInitScript(() => {
    for (const name of ["fullscreenEnabled", "webkitFullscreenEnabled"]) {
      Object.defineProperty(Document.prototype, name, {
        configurable: true,
        get: () => false,
      });
    }
  });
}

test("play iPhone: Vimeo plays in iOS full screen, our ⛶ is hidden", async ({
  page,
}) => {
  await withoutFullscreenApi(page);
  await mockContent(page);
  await mockVimeo(page);
  await page.goto("/play.html?l=b&m=3&b=1&host=play.tps-education.com");
  await tapSlot(page, "w1-Mon");

  expect(await vimeoParams(page)).toEqual({
    path: "https://player.vimeo.com/video/173725167",
    params: { title: "0", byline: "0", portrait: "0", playsinline: "0" },
  });
  await expect(page.locator("#playOverlay")).toHaveAttribute(
    "data-state",
    "playing",
  );
  await expect(page.locator("#playFullscreen")).toBeHidden();

  await page.evaluate(() => window.__vimeo.fire("ended"));
  await expect(page.locator("#playOverlay")).toHaveAttribute(
    "data-state",
    "ended",
  );
  await expect(page.locator("#playFullscreen")).toBeHidden();
});

test("play iPhone: leaving iOS full screen pauses, our ▶ resumes", async ({
  page,
}) => {
  await withoutFullscreenApi(page);
  await mockContent(page);
  await mockVimeo(page);
  await page.goto("/play.html?l=b&m=3&b=1&host=play.tps-education.com");
  await tapSlot(page, "w1-Mon");
  await expect
    .poll(() => page.evaluate(() => window.__vimeo?.plays ?? 0))
    .toBe(1);

  await page.evaluate(() => window.__vimeo.fire("play"));
  await expect(page.locator("#playStart")).toBeHidden();
  // iOS pauses the video when the child taps Done in its full screen.
  await page.evaluate(() => window.__vimeo.fire("pause"));
  await expect(page.locator("#playStart")).toBeVisible();
  await page.locator("#playStart").click();
  await expect.poll(() => page.evaluate(() => window.__vimeo.plays)).toBe(2);
  // Same player, not a new one.
  expect(await page.evaluate(() => window.__vimeo.players.length)).toBe(1);
});

test("play iPhone: Vimeo ended in iOS full screen offers Watch again", async ({
  page,
}) => {
  await withoutFullscreenApi(page);
  await mockContent(page);
  await mockVimeo(page);
  await page.goto("/play.html?l=b&m=3&b=1&host=play.tps-education.com");
  await tapSlot(page, "w1-Mon");
  await expect
    .poll(() => page.evaluate(() => window.__vimeo?.players.length ?? 0))
    .toBe(1);

  await page.evaluate(() => window.__vimeo.fire("ended"));
  await expect(page.locator("#playAgain")).toBeVisible();
  await expect(page.locator("#playNext")).toBeVisible();
  await page.locator("#playAgain").click();
  await expect(page.locator("#playOverlay")).toHaveAttribute(
    "data-state",
    "playing",
  );
  expect((await vimeoParams(page)).params.playsinline).toBe("0");
});

test("play iPhone: a vimeo.com private link keeps its hash", async ({
  page,
}) => {
  await withoutFullscreenApi(page);
  await mockContent(page, [VIMEO_ROW]);
  await mockVimeo(page);
  // No host override: TPS's own Vimeo plays on every host.
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "ending");
  expect(await vimeoParams(page)).toEqual({
    path: `https://player.vimeo.com/video/${VIMEO_ID}`,
    params: {
      h: "abc123def0",
      title: "0",
      byline: "0",
      portrait: "0",
      playsinline: "0",
    },
  });
  await expect(page.locator("#playFullscreen")).toBeHidden();

  // A Vimeo URL we can't read: the SDK builds the player, still not inline.
  // (The fake SDK keeps every player it built; the last one is this tap's.)
  await closeOverlay(page);
  await tapSlot(page, "w1-Tue");
  await expect
    .poll(() => page.evaluate(() => (window.__vimeo?.players ?? []).slice(-1)))
    .toEqual([
      {
        tag: "DIV",
        options: {
          url: "https://vimeo.com/showcase/11111",
          title: false,
          byline: false,
          portrait: false,
          playsinline: false,
          responsive: false,
        },
      },
    ]);
});

test("play: with a Fullscreen API, Vimeo stays inline with our ⛶", async ({
  page,
}) => {
  await mockContent(page, [VIMEO_ROW]);
  await mockVimeo(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "opening");
  expect(await vimeoParams(page)).toEqual({
    path: `https://player.vimeo.com/video/${VIMEO_ID}`,
    params: { title: "0", byline: "0", portrait: "0", playsinline: "1" },
  });
  await expect(page.locator("#playFullscreen")).toBeVisible();

  await closeOverlay(page);
  await tapSlot(page, "w1-Mon");
  expect(await vimeoParams(page)).toEqual({
    path: `https://player.vimeo.com/video/${VIMEO_ID}`,
    params: {
      h: "abc123def0",
      title: "0",
      byline: "0",
      portrait: "0",
      playsinline: "1",
    },
  });
});

test("play iPhone: YouTube is unchanged (inline, our ⛶)", async ({ page }) => {
  await withoutFullscreenApi(page);
  await mockContent(page, [VIMEO_ROW]);
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
        window.YT = {
          PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
          Player: function (el, options) {
            window.__ytVars = options.playerVars;
            this.destroy = () => {};
            this.playVideo = () => {};
            this.pauseVideo = () => {};
            this.unloadModule = () => {};
          },
        };
        window.onYouTubeIframeAPIReady();`,
    }),
  );
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "w1-Wed");
  await expect
    .poll(() => page.evaluate(() => window.__ytVars ?? null))
    .toEqual({
      autoplay: 1,
      controls: 0,
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      fs: 0,
      disablekb: 1,
      iv_load_policy: 3,
      cc_load_policy: 0,
    });
  await expect(page.locator("#playFullscreen")).toBeVisible();
});

/* ---- Tap layer while paused ---------------------------------------------
   A paused Vimeo/YouTube player shows links out (Vimeo logo; YouTube title,
   logo, more videos). Once a video has played, our tap layer stays over the
   whole player — paused too — and a tap there resumes. Before the first play
   (autoplay blocked) it stays off, so the player's own ▶ can be tapped. */
async function expectLayerCoversStage(page) {
  const layer = page.locator("#playClickLayer");
  await expect(layer).toBeVisible();
  const [l, s] = await Promise.all([
    layer.boundingBox(),
    page.locator("#playStage").boundingBox(),
  ]);
  expect(l).toEqual(s);
}

test("play layer: a paused Vimeo stays covered, a tap resumes", async ({
  page,
}) => {
  await mockContent(page, [VIMEO_ROW]);
  await mockVimeo(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "opening");
  await expect
    .poll(() => page.evaluate(() => window.__vimeo?.players.length ?? 0))
    .toBe(1);
  // Not played yet (autoplay may be blocked): the player's own ▶ is open.
  await expect(page.locator("#playClickLayer")).toBeHidden();

  await page.evaluate(() => window.__vimeo.fire("play"));
  await expectLayerCoversStage(page);
  await page.locator("#playClickLayer").click();
  expect(await page.evaluate(() => window.__vimeo.pauses)).toBe(1);

  await page.evaluate(() => window.__vimeo.fire("pause"));
  await expectLayerCoversStage(page);
  await expect(page.locator("#playStart")).toBeVisible();
  const plays = await page.evaluate(() => window.__vimeo.plays);
  // A tap off our ▶ (top-left corner, where the title sits) resumes too.
  await page.locator("#playClickLayer").click({ position: { x: 8, y: 8 } });
  expect(await page.evaluate(() => window.__vimeo.plays)).toBe(plays + 1);
  expect(await page.evaluate(() => window.__vimeo.pauses)).toBe(1);

  await page.evaluate(() => window.__vimeo.fire("play"));
  await expect(page.locator("#playStart")).toBeHidden();
  await expectLayerCoversStage(page);
});

test("play layer: a paused YouTube stays covered, a tap resumes", async ({
  page,
}) => {
  await mockContent(page);
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
        window.__yt = { plays: 0, pauses: 0 };
        window.YT = {
          PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
          Player: function (el, options) {
            window.__yt.state = (data) => options.events.onStateChange({ data });
            this.destroy = () => {};
            this.playVideo = () => { window.__yt.plays += 1; };
            this.pauseVideo = () => { window.__yt.pauses += 1; };
            this.unloadModule = () => {};
          },
        };
        window.onYouTubeIframeAPIReady();`,
    }),
  );
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "w1-Tue");
  await page.waitForFunction(() => window.__yt?.state);
  await expect(page.locator("#playClickLayer")).toBeHidden();

  await page.evaluate(() => window.__yt.state(1)); // PLAYING
  await expectLayerCoversStage(page);
  await page.locator("#playClickLayer").click();
  expect(await page.evaluate(() => window.__yt.pauses)).toBe(1);

  await page.evaluate(() => window.__yt.state(2)); // PAUSED
  await expectLayerCoversStage(page);
  await expect(page.locator("#playStart")).toBeVisible();
  await page.locator("#playClickLayer").click({ position: { x: 8, y: 8 } });
  expect(await page.evaluate(() => window.__yt.plays)).toBe(1);
  expect(await page.evaluate(() => window.__yt.pauses)).toBe(1);
});

test("play: cost guard — no Storage, one content read, covers are static", async ({
  page,
}) => {
  const supabase = [];
  page.on("request", (request) => {
    if (/\.supabase\.co\//.test(request.url())) supabase.push(request.url());
  });
  const calls = await mockContent(page, [LEVEL2_ROW], 200, true);
  await page.goto("/play.html?l=l1&m=3&b=1");
  await tapSlot(page, "w1-Mon");
  await expect(page.locator("#playFrame iframe")).toHaveCount(1);
  await closeOverlay(page);
  await tapSlot(page, "w2-Mon");
  await expect(page.locator("#playFrame iframe")).toHaveCount(1);
  expect(supabase.filter((url) => /\/storage\//.test(url))).toEqual([]);
  expect(calls).toHaveLength(1);
  // The new key and its old twin in one read (until 01-rename.sql has run).
  expect(decodeURIComponent(calls[0])).toContain(
    'level=in.(level-1,"Level 2")',
  );
  expect(calls[0]).toContain("month=eq.March");
  expect(calls[0]).toContain("select=level,videos,labels");
  expect(supabase).toEqual(calls);
});

test("play: offline by default on localhost", async ({ page }) => {
  // Registered after beforeEach's opt-in, so this init script wins.
  await page.addInitScript(() => localStorage.removeItem("cra:dev-live"));
  const supabase = [];
  page.on("request", (request) => {
    if (/\.supabase\.co\//.test(request.url())) supabase.push(request.url());
  });
  await page.route(COVER_ROUTE, (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.goto("/play.html?l=b&m=3&b=1");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "error");
  expect(supabase).toEqual([]);
});

/* ---- Overlay: open / switch / close ------------------------------------- */

test("play overlay: a board tap plays at once, another tap switches, row reused", async ({
  page,
}) => {
  const calls = await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "w2-Mon");
  const overlay = page.locator("#playOverlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveAttribute("data-state", "playing");
  await expect(page.locator("#playTitle")).toHaveText(
    "Week 2 · Mon · Opening Song",
  );
  await expect(page.locator("#playFrame iframe")).toHaveAttribute(
    "src",
    "https://tps-education.com/58?video=173725165",
  );
  await expect(page.locator("body")).toHaveClass(/play-overlay-open/);
  // The address does not change: the QR code is the book, not the slot.
  await expect(page).toHaveURL(/\/play\.html\?l=b&m=3&b=1$/);

  await closeOverlay(page);
  await expect(page.locator("#playFrame iframe")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/play-overlay-open/);
  await tapSlot(page, "w1-Mon");
  await expect(page.locator("#playTitle")).toHaveText(
    "Week 1 · Mon · Opening Song",
  );
  await expect(page.locator("#playFrame iframe")).toHaveAttribute(
    "src",
    PUBLISHER_58,
  );
  expect(calls).toHaveLength(1);
});

test("play overlay: closes by ✕, Esc and the phone's back button", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  const overlay = page.locator("#playOverlay");

  await tapSlot(page, "w2-Mon");
  await expect(overlay).toBeVisible();
  await page.locator("#playClose").click();
  await expect(overlay).toBeHidden();
  await expect(page.locator("#playFrame iframe")).toHaveCount(0);
  await expect(page.locator("#playTitle")).toHaveText("");

  await tapSlot(page, "w2-Mon");
  await expect(overlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();

  await tapSlot(page, "w2-Mon");
  await expect(overlay).toBeVisible();
  await page.goBack();
  await expect(overlay).toBeHidden();
  await expect(page).toHaveURL(/\/play\.html\?l=b&m=3&b=1$/);
  await expect(page.locator("#play")).toHaveAttribute("data-state", "board");
  // Opening again after a back-close pushes a fresh entry (back still works).
  await tapSlot(page, "w2-Mon");
  await expect(overlay).toBeVisible();
  await page.goBack();
  await expect(overlay).toBeHidden();
});

test("play: a second tap while YouTube loads mounts one player", async ({
  page,
}) => {
  await mockContent(page);
  // A fake IFrame API that arrives late and counts live players.
  await page.route("https://www.youtube.com/iframe_api", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({
      contentType: "text/javascript",
      body: `
        window.__ytLive = 0;
        window.YT = {
          PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
          Player: function () {
            window.__ytLive += 1;
            this.destroy = () => { window.__ytLive -= 1; };
            this.playVideo = () => {};
            this.pauseVideo = () => {};
            this.unloadModule = () => {};
          },
        };
        window.onYouTubeIframeAPIReady();`,
    });
  });
  await page.goto("/play.html?l=b&m=3&b=1", { waitUntil: "domcontentloaded" });
  await tapSlot(page, "w1-Tue");
  // The child taps the same video again (✕, then the board) before the API
  // is in.
  await closeOverlay(page);
  await tapSlot(page, "w1-Tue");
  await page.waitForFunction(() => window.__ytLive !== undefined);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__ytLive)).toBe(1);
});

test("play end overlay: next only when a filled slot follows in this book", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  const next = await page.evaluate(
    ({ march, level2 }) => {
      const find = window.craPlay.nextFilledSlot;
      return {
        afterW1Mon: find(march, "beginner", 1, "w1-Mon"),
        // "game" is skipped, empty "unit" is skipped.
        afterEnding: find(march, "beginner", 1, "ending"),
        // w2-Tue is whitespace only.
        afterW2Mon: find(march, "beginner", 1, "w2-Mon"),
        afterLast: find(march, "beginner", 1, "w4-Mon"),
        noRow: find(null, "beginner", 1, "w1-Mon"),
        // Book 1 ends at w2-Fri: w3-Mon belongs to book 2, never offered.
        book1AfterW2Mon: find(level2, "level-1", 1, "w2-Mon"),
        book1AfterSong1: find(level2, "level-1", 1, "song1"),
        // Book 2 starts at its toolbar: game2 (game, skipped) → song2 (empty) → w3-Mon.
        book2AfterEnding: find(level2, "level-1", 2, "ending"),
        book2AfterW3Tue: find(level2, "level-1", 2, "w3-Tue"),
        book2AfterLast: find(level2, "level-1", 2, "w4-Fri"),
      };
    },
    { march: MARCH_ROW, level2: LEVEL2_ROW },
  );
  expect(next).toEqual({
    afterW1Mon: "w1-Tue",
    afterEnding: "w1-Mon",
    afterW2Mon: "w3-Mon",
    afterLast: null,
    noRow: null,
    book1AfterW2Mon: null,
    book1AfterSong1: "w1-Mon",
    book2AfterEnding: "w3-Mon",
    book2AfterW3Tue: "w4-Fri",
    book2AfterLast: null,
  });

  await tapSlot(page, "w1-Mon");
  await page.evaluate(() => window.craPlay.showEnded());
  await expect(page.locator("#playOverlay")).toHaveAttribute(
    "data-state",
    "ended",
  );
  await expect(page.locator("#playAgain")).toHaveText("Watch again");
  await expect(page.locator("#playNext")).toBeVisible();

  await closeOverlay(page);
  await tapSlot(page, "w4-Mon");
  await page.evaluate(() => window.craPlay.showEnded());
  await expect(page.locator("#playAgain")).toBeVisible();
  await expect(page.locator("#playNext")).toBeHidden();
});

test("play end overlay: watch again and next restart playback", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "w2-Mon");
  await page.evaluate(() => window.craPlay.showEnded());
  await page.locator("#playAgain").click();
  await expect(page.locator("#playOverlay")).toHaveAttribute(
    "data-state",
    "playing",
  );
  await expect(page.locator("#playEnd")).toBeHidden();

  await page.evaluate(() => window.craPlay.showEnded());
  await page.locator("#playNext").click();
  await expect(page.locator("#playTitle")).toHaveText(
    "Week 3 · Mon · Opening Song",
  );
  await expect(page.locator("#playOverlay")).toHaveAttribute(
    "data-state",
    "playing",
  );
  await expect(page.locator("#playFrame iframe")).toHaveCount(1);
});

test("play inline next: shown under a publisher page only", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  // Publisher page (framed): no end event, so Next sits under the player.
  await tapSlot(page, "w2-Mon");
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
  await closeOverlay(page);
  await tapSlot(page, "w1-Tue");
  await expect(page.locator("#playNextInline")).toBeHidden();

  // Last filled slot: nothing to go to.
  await closeOverlay(page);
  await tapSlot(page, "w4-Mon");
  await expect(page.locator("#playNextInline")).toBeHidden();
});

test("play fullscreen: button shows only while playing or ended", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "w2-Mon");
  await expect(page.locator("#playFullscreen")).toBeVisible();
  const box = await page.locator("#playFullscreen").boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(56);
  expect(box.height).toBeGreaterThanOrEqual(56);
  // Bottom-right corner of the player.
  const stage = await page.locator("#playStage").boundingBox();
  expect(stage.x + stage.width - (box.x + box.width)).toBeLessThan(24);
  expect(stage.y + stage.height - (box.y + box.height)).toBeLessThan(24);
  await expect(page.locator("#playFullscreenExit")).toBeHidden();

  await page.evaluate(() => window.craPlay.showEnded());
  await expect(page.locator("#playFullscreen")).toBeVisible();

  // Coming soon card: nothing to blow up.
  await closeOverlay(page);
  await tapSlot(page, "w2-Tue");
  await expect(page.locator("#playOverlay")).toHaveAttribute(
    "data-state",
    "empty",
  );
  await expect(page.locator("#playFullscreen")).toBeHidden();
});

test("play fullscreen: Fullscreen API puts the stage in full screen", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "w2-Mon");
  await page.locator("#playFullscreen").click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.id || ""))
    .toBe("playStage");
  await expect(page.locator("body")).not.toHaveClass(/play-fullscreen/);
  await expect(page.locator("#playFullscreenExit")).toBeVisible();
  await expect(page.locator("#playFullscreen")).toBeHidden();
  await expect(page.locator("#playClose")).toBeHidden();

  await page.locator("#playFullscreenExit").click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.id || ""))
    .toBe("");
  await expect(page.locator("#playFullscreenExit")).toBeHidden();
  await expect(page.locator("#playFullscreen")).toBeVisible();
  await expect(page.locator("#playClose")).toBeVisible();
});

test("play fullscreen: pseudo full screen without the API, exit by ✕ or Esc", async ({
  page,
}) => {
  await withoutFullscreenApi(page);
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "w2-Mon");
  await page.locator("#playFullscreen").click();

  await expect(page.locator("body")).toHaveClass(/play-fullscreen/);
  await expect(page.locator("#contentScreen")).toBeHidden();
  await expect(page.locator(".play-brand")).toBeHidden();
  await expect(page.locator("#playTitle")).toBeHidden();
  await expect(page.locator("#playClose")).toBeHidden();
  await expect(page.locator("#playFullscreen")).toBeHidden();
  const layout = await page.evaluate(() => {
    const stage = document.querySelector("#playStage");
    const exit = document.querySelector("#playFullscreenExit");
    const s = stage.getBoundingClientRect();
    const x = exit.getBoundingClientRect();
    return {
      stage: [s.left, s.top, s.width, s.height],
      viewport: [0, 0, window.innerWidth, window.innerHeight],
      position: getComputedStyle(stage).position,
      background: getComputedStyle(stage).backgroundColor,
      overflow: getComputedStyle(document.body).overflow,
      exit: { right: window.innerWidth - x.right, top: x.top, w: x.width },
    };
  });
  expect(layout.stage).toEqual(layout.viewport);
  expect(layout.position).toBe("fixed");
  expect(layout.background).toBe("rgb(0, 0, 0)");
  expect(layout.overflow).toBe("hidden");
  expect(layout.exit.w).toBeGreaterThanOrEqual(56);
  expect(layout.exit.right).toBeLessThan(24);
  expect(layout.exit.top).toBeLessThan(24);

  // Portrait: the 16:9 picture sits in the vertical middle.
  const frame = await page.locator("#playFrame").boundingBox();
  const viewport = page.viewportSize();
  expect(
    Math.abs(frame.y + frame.height / 2 - viewport.height / 2),
  ).toBeLessThan(2);

  await page.locator("#playFullscreenExit").click();
  await expect(page.locator("body")).not.toHaveClass(/play-fullscreen/);
  await expect(page.locator("#playOverlay")).toBeVisible();
  await expect(page.locator("#playFullscreen")).toBeVisible();
  await expect(page.locator("#playClose")).toBeVisible();

  // Esc leaves full screen first and only a second Esc closes the overlay.
  await page.locator("#playFullscreen").click();
  await expect(page.locator("body")).toHaveClass(/play-fullscreen/);
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveClass(/play-fullscreen/);
  await expect(page.locator("#playFullscreenExit")).toBeHidden();
  await expect(page.locator("#playOverlay")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#playOverlay")).toBeHidden();
});

test("play fullscreen: sideways phone, the 16:9 picture fills the screen", async ({
  page,
}) => {
  await withoutFullscreenApi(page);
  await mockContent(page);
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "w2-Mon");
  await page.locator("#playFullscreen").click();
  await expect(page.locator("body")).toHaveClass(/play-fullscreen/);
  const { stage, frame } = await page.evaluate(() => {
    const r = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    };
    return {
      stage: r(document.querySelector("#playStage")),
      frame: r(document.querySelector("#playFrame")),
    };
  });
  expect(stage).toEqual({ x: 0, y: 0, w: 812, h: 375 });
  // Full height, 16:9 wide, centered left-right.
  expect(frame.y).toBeCloseTo(0, 0);
  expect(frame.h).toBeCloseTo(375, 0);
  expect(frame.w).toBeCloseTo((375 * 16) / 9, 0);
  expect(frame.x + frame.w / 2).toBeCloseTo(406, 0);
});

test("play fullscreen: framed page keeps fullscreen permissions", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&b=1");
  await tapSlot(page, "w2-Mon");
  const frame = page.locator("#playFrame iframe");
  await expect(frame).toHaveAttribute(
    "allow",
    "autoplay; fullscreen; picture-in-picture",
  );
  await expect(frame).toHaveAttribute("allowfullscreen", "");
});
