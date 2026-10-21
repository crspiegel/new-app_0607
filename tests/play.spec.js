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

test("play: a REST read that never answers times out to retry", async ({
  page,
}) => {
  await page.clock.install();
  await page.route(CONTENT_ROUTE, () => {
    /* never answered — a hung network */
  });
  await page.goto("/play.html?l=b&m=3&s=w1-mon");
  const play = page.locator("#play");
  await expect(play).toHaveAttribute("data-state", "loading");

  await page.clock.runFor(9000);
  await expect(play).toHaveAttribute("data-state", "loading");

  await page.clock.runFor(1500); // past the 10 s limit
  await expect(play).toHaveAttribute("data-state", "error");
  await expect(page.getByText("Can't load right now.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
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
  await page.goto("/play.html?l=b&m=3&s=w1-mon");
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
  await mockContent(page);
  await mockVimeo(page);
  const publisher = [];
  page.on("request", (request) => {
    if (/tps-education\.com\//.test(request.url())) {
      publisher.push(request.url());
    }
  });

  await page.goto("/play.html?l=b&m=3&s=w1-mon&host=play.tps-education.com");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "ready");
  await page.locator("#playStart").click();

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
  await expect(page.locator("#play")).toHaveAttribute("data-state", "playing");
  await expect(page.locator("#play")).toHaveAttribute("data-player", "vimeo");
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
  await page.goto("/play.html?l=b&m=3&s=w1-mon&host=play.tps-education.com");
  await page.locator("#playStart").click();
  await expect
    .poll(() => page.evaluate(() => window.__vimeo?.players.length ?? 0))
    .toBe(1);

  await page.evaluate(() => window.__vimeo.fire("ended"));
  await expect(page.locator("#play")).toHaveAttribute("data-state", "ended");
  await expect(page.locator("#playAgain")).toBeVisible();
  await expect(page.locator("#playNext")).toBeVisible();

  await page.locator("#playAgain").click();
  await expect(page.locator("#play")).toHaveAttribute("data-state", "playing");
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
  await page.goto("/play.html?l=b&m=3&s=w1-mon");
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

test("play iPhone: Vimeo plays in iOS full screen, our ⛶ is hidden", async ({
  page,
}) => {
  await withoutFullscreenApi(page);
  await mockContent(page);
  await mockVimeo(page);
  await page.goto("/play.html?l=b&m=3&s=w1-mon&host=play.tps-education.com");
  await expect(page.locator("#playStart")).toBeVisible();
  await page.locator("#playStart").click();

  expect(await vimeoParams(page)).toEqual({
    path: "https://player.vimeo.com/video/173725167",
    params: { title: "0", byline: "0", portrait: "0", playsinline: "0" },
  });
  await expect(page.locator("#play")).toHaveAttribute("data-state", "playing");
  await expect(page.locator("#playFullscreen")).toBeHidden();

  await page.evaluate(() => window.__vimeo.fire("ended"));
  await expect(page.locator("#play")).toHaveAttribute("data-state", "ended");
  await expect(page.locator("#playFullscreen")).toBeHidden();
});

test("play iPhone: leaving iOS full screen pauses, our ▶ resumes", async ({
  page,
}) => {
  await withoutFullscreenApi(page);
  await mockContent(page);
  await mockVimeo(page);
  await page.goto("/play.html?l=b&m=3&s=w1-mon&host=play.tps-education.com");
  await page.locator("#playStart").click();
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
  await page.goto("/play.html?l=b&m=3&s=w1-mon&host=play.tps-education.com");
  await page.locator("#playStart").click();
  await expect
    .poll(() => page.evaluate(() => window.__vimeo?.players.length ?? 0))
    .toBe(1);

  await page.evaluate(() => window.__vimeo.fire("ended"));
  await expect(page.locator("#playAgain")).toBeVisible();
  await expect(page.locator("#playNext")).toBeVisible();
  await page.locator("#playAgain").click();
  await expect(page.locator("#play")).toHaveAttribute("data-state", "playing");
  expect((await vimeoParams(page)).params.playsinline).toBe("0");
});

test("play iPhone: a vimeo.com private link keeps its hash", async ({
  page,
}) => {
  await withoutFullscreenApi(page);
  await mockContent(page, [VIMEO_ROW]);
  await mockVimeo(page);
  // No host override: TPS's own Vimeo plays on every host.
  await page.goto("/play.html?l=b&m=3&s=ending");
  await page.locator("#playStart").click();
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
  await page.goto("/play.html?l=b&m=3&s=w1-tue");
  await page.locator("#playStart").click();
  await expect
    .poll(() => page.evaluate(() => window.__vimeo?.players ?? []))
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
  await page.goto("/play.html?l=b&m=3&s=opening");
  await page.locator("#playStart").click();
  expect(await vimeoParams(page)).toEqual({
    path: `https://player.vimeo.com/video/${VIMEO_ID}`,
    params: { title: "0", byline: "0", portrait: "0", playsinline: "1" },
  });
  await expect(page.locator("#playFullscreen")).toBeVisible();

  await page.goto("/play.html?l=b&m=3&s=w1-mon");
  await page.locator("#playStart").click();
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
  await page.goto("/play.html?l=b&m=3&s=w1-wed");
  await page.locator("#playStart").click();
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
  await page.goto("/play.html?l=b&m=3&s=opening");
  await page.locator("#playStart").click();
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
  await page.goto("/play.html?l=b&m=3&s=w1-tue");
  await page.locator("#playStart").click();
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
  await page.goto("/play.html?l=b&m=3&s=w1-tue", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("#play")).toHaveAttribute("data-state", "ready");
  await page.locator("#playStart").click();
  // The child taps the same video again in the list before the API is in.
  await page.locator('#playList .play-item[data-slot="w1-Tue"]').click();
  await page.waitForFunction(() => window.__ytLive !== undefined);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__ytLive)).toBe(1);
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

test("play fullscreen: button shows only while playing or ended", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w2-mon");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#playFullscreen")).toBeHidden();

  await page.locator("#playStart").click();
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
  await page.goto("/play.html?l=b&m=3&s=w2-tue");
  await expect(page.locator("#play")).toHaveAttribute("data-state", "empty");
  await expect(page.locator("#playFullscreen")).toBeHidden();
});

test("play fullscreen: Fullscreen API puts the stage in full screen", async ({
  page,
}) => {
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w2-mon");
  await page.locator("#playStart").click();
  await page.locator("#playFullscreen").click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.id || ""))
    .toBe("playStage");
  await expect(page.locator("body")).not.toHaveClass(/play-fullscreen/);
  await expect(page.locator("#playFullscreenExit")).toBeVisible();
  await expect(page.locator("#playFullscreen")).toBeHidden();

  await page.locator("#playFullscreenExit").click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.id || ""))
    .toBe("");
  await expect(page.locator("#playFullscreenExit")).toBeHidden();
  await expect(page.locator("#playFullscreen")).toBeVisible();
});

test("play fullscreen: pseudo full screen without the API, exit by ✕ or Esc", async ({
  page,
}) => {
  await withoutFullscreenApi(page);
  await mockContent(page);
  await page.goto("/play.html?l=b&m=3&s=w2-mon");
  await page.locator("#playStart").click();
  await page.locator("#playFullscreen").click();

  await expect(page.locator("body")).toHaveClass(/play-fullscreen/);
  await expect(page.locator("#playList")).toBeHidden();
  await expect(page.locator(".play-header")).toBeHidden();
  await expect(page.locator("#playTitle")).toBeHidden();
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
  await expect(page.locator("#playList")).toBeVisible();
  await expect(page.locator("#playFullscreen")).toBeVisible();

  await page.locator("#playFullscreen").click();
  await expect(page.locator("body")).toHaveClass(/play-fullscreen/);
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveClass(/play-fullscreen/);
  await expect(page.locator("#playFullscreenExit")).toBeHidden();
});

test("play fullscreen: sideways phone, the 16:9 picture fills the screen", async ({
  page,
}) => {
  await withoutFullscreenApi(page);
  await mockContent(page);
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto("/play.html?l=b&m=3&s=w2-mon");
  await page.locator("#playStart").click();
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
  await page.goto("/play.html?l=b&m=3&s=w2-mon");
  await page.locator("#playStart").click();
  const frame = page.locator("#playFrame iframe");
  await expect(frame).toHaveAttribute(
    "allow",
    "autoplay; fullscreen; picture-in-picture",
  );
  await expect(frame).toHaveAttribute("allowfullscreen", "");
});
