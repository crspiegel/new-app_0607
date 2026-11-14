import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SUPABASE, TOKEN, stubBoard } from "./resource-board-stub.mjs";

// Student activity log, step 1 (D90, PM brief 2026-11-13) — the teacher
// site's side: a signed-in LMS STUDENT's video / game windows are logged
// (student_activity_start on open, student_activity_save every 30 s, at
// close — every way — and when the page is hidden), nobody else's; logging
// never holds the window up. The SQL side of the same contract is
// tests/student-activity-sql.spec.js. Every Supabase request is answered by
// tests/resource-board-stub.mjs (the activity calls by the route below);
// anything else sent to Supabase is refused — the live project is never
// reached. Vimeo and YouTube are fakes that play along Playwright's clock.

const desktopOnly = (info) =>
  test.skip(info.project.name !== "desktop", "flow only, run once");

const VIMEO = "https://vimeo.com/76979871";
const YOUTUBE = "https://youtu.be/LPl2AR2rm0g";
const PAGE = "https://tps-education.com/58?video=173725167";
const GAME = "https://book-english-games.vercel.app/play/the-tractor";

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

// A Vimeo player that plays along the page's clock: timeupdate every 250 ms
// with the position, play / pause / setCurrentTime like the real one.
const FAKE_VIMEO = `
  window.__vm = { pos: 0, playing: false, duration: 100, players: 0 };
  window.Vimeo = {
    Player: function (el, options) {
      const vm = window.__vm;
      const h = {};
      let last = performance.now();
      vm.players += 1;
      vm.pos = 0; // each window starts its video at 0
      vm.playing = false;
      const emit = () =>
        h.timeupdate && h.timeupdate({ seconds: vm.pos, duration: vm.duration,
                                       percent: vm.pos / vm.duration });
      const sync = () => {
        const now = performance.now();
        if (vm.playing) vm.pos = Math.min(vm.duration, vm.pos + (now - last) / 1000);
        last = now;
      };
      const timer = setInterval(() => { sync(); emit(); }, 250);
      vm.seek = (s) => { sync(); vm.pos = s; emit(); };
      this.on = (name, fn) => { h[name] = fn; };
      this.getDuration = () => Promise.resolve(vm.duration);
      this.setVolume = () => Promise.resolve();
      this.setLoop = () => Promise.resolve();
      this.play = () => { sync(); vm.playing = true; h.play && h.play(); return Promise.resolve(); };
      this.pause = () => { sync(); vm.playing = false; h.pause && h.pause(); return Promise.resolve(); };
      this.setCurrentTime = (s) => { vm.seek(s); return Promise.resolve(s); };
      this.destroy = () => { clearInterval(timer); vm.playing = false; return Promise.resolve(); };
    },
  };`;

// The YouTube IFrame API, same idea (the page polls getCurrentTime).
const FAKE_YT = () => {
  window.__yt = { pos: 0, playing: false, duration: 80 };
  window.YT = {
    PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
    Player: function (host, opts) {
      const yt = window.__yt;
      yt.pos = 0;
      yt.playing = false;
      let last = window.performance.now();
      const sync = () => {
        const now = window.performance.now();
        if (yt.playing)
          yt.pos = Math.min(yt.duration, yt.pos + (now - last) / 1000);
        last = now;
      };
      this.getCurrentTime = () => {
        sync();
        return yt.pos;
      };
      this.getDuration = () => yt.duration;
      this.getVideoLoadedFraction = () => 1;
      this.playVideo = () => {
        sync();
        yt.playing = true;
        opts.events.onStateChange({ data: 1 });
      };
      this.pauseVideo = () => {
        sync();
        yt.playing = false;
        opts.events.onStateChange({ data: 2 });
      };
      this.seekTo = (s) => {
        sync();
        yt.pos = s;
      };
      this.setVolume = () => {};
      this.unloadModule = () => {};
      this.destroy = () => {
        yt.playing = false;
      };
      yt.seek = (s) => this.seekTo(s);
      window.setTimeout(() => opts.events.onReady({ target: this }), 0);
    },
  };
};

/**
 * A student (or `role`) on Level 1 / March with a Vimeo, a YouTube, a framed
 * video page and two games; the clock stopped. Returns `calls` — every RPC
 * the page sent ({ name, args, token }) — and the activity answers' switch.
 */
async function setup(page, { role = "student", start = "ok" } = {}) {
  await page.clock.install();
  const sent = await stubBoard(page, { role });
  const calls = [];
  let nextId = 41;
  const held = [];
  await page.route(/\/rest\/v1\/rpc\//, async (route) => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split("/").pop();
    calls.push({
      name,
      args: request.postDataJSON(),
      token: request.headers()["x-lms-token"] ?? null,
    });
    if (!name.startsWith("student_activity_")) return route.fallback();
    if (name === "student_activity_save")
      return route.fulfill({ status: 204, body: "" });
    if (start === "fail") return route.fulfill({ status: 500, json: {} });
    if (start === "hold") await new Promise((resolve) => held.push(resolve));
    nextId += 1;
    return route.fulfill({ json: nextId }).catch(() => {});
  });
  await page.route("https://player.vimeo.com/api/player.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: FAKE_VIMEO }),
  );
  await page.addInitScript(FAKE_YT);
  await page.goto("/");
  await page.waitForFunction(() => window.craBoard && window.craBoard.ready);
  await page.locator("#homeScreen .level-button--level-1").click();
  await page.locator("#monthGrid .month-button").first().click();
  await expect(page).toHaveURL(/#content\/level-1\/March$/);
  await page.waitForFunction(
    () => window.craContent && window.craContent.settled,
  );
  await fill(page);
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
  const activity = () => calls.filter((c) => c.name.startsWith("student_"));
  const saves = () =>
    activity()
      .filter((c) => c.name === "student_activity_save")
      .map((c) => c.args);
  return {
    sent,
    calls,
    activity,
    saves,
    release: () => held.splice(0).forEach((resolve) => resolve()),
  };
}

// Level 1 / March's slots (the stub has no content rows; the cache is the page's).
function fill(page) {
  return page.evaluate(
    (videos) => {
      const { contentCache, pageKey } = window.craContent;
      contentCache[pageKey("level-1", "March")] = {
        videos,
        covers: {},
        labels: {},
      };
    },
    {
      "w3-Tue": VIMEO,
      song1: YOUTUBE,
      opening: PAGE,
      game2: GAME,
      "w1-Mon": GAME,
    },
  );
}

const lesson = (page, slot) =>
  page.locator(`#lessonGrid .lesson-button[data-slot="${slot}"]`).click();
const toolbar = (page, slot) =>
  page
    .locator(
      `#contentScreen .content-toolbar .content-type[data-slot="${slot}"]`,
    )
    .click();
const starts = (log) =>
  log.activity().filter((c) => c.name === "student_activity_start").length;
// The open window's row id, once the start answer is in (app.js `activity`).
const rowId = (page) => page.evaluate("activity && activity.id");
// the n-th start was sent and its answer has arrived (the row id is known)
async function started(page, log, n) {
  await expect.poll(() => starts(log)).toBe(n);
  await expect.poll(() => rowId(page)).toBeTruthy();
}

test("student activity (D90): Vimeo — played seconds leave out pauses and skips, count replays; saved every 30 s and at [닫기]", async ({
  page,
}, info) => {
  desktopOnly(info);
  const log = await setup(page);
  await lesson(page, "w3-Tue");
  await expect(page.locator("#videoModal")).toBeVisible();
  await started(page, log, 1);
  const [start] = log.activity();
  expect(start).toEqual({
    name: "student_activity_start",
    args: {
      p_kind: "video",
      p_level: "level-1",
      p_month: "March",
      p_book: 2,
      p_slot: "w3-Tue",
      p_label: "Story · Week 3 · Tue",
      p_video_kind: "vimeo",
    },
    token: TOKEN,
  });

  await page.clock.runFor(20000); // plays 0 → 20
  await page.locator("#vpToggle").click(); // pause
  await page.clock.runFor(5000); // 5 s paused: not counted
  await page.evaluate(() => window.__vm.seek(60)); // skip 20 → 60: not counted
  await page.locator("#vpToggle").click(); // play 60 → 65 …
  await page.clock.runFor(5000);
  // … the 30-s save: 25 s played, the furthest point 65 (the player's own
  // report due at the same moment may come just after it: 24.75 / 64.75)
  await expect.poll(() => log.saves().length).toBe(1);
  const [first] = log.saves();
  expect(first).toMatchObject({ p_id: 42, p_duration_sec: 100 });
  expect([24, 25]).toContain(first.p_played_sec);
  expect([64, 65]).toContain(first.p_max_pos_sec);
  await page.clock.runFor(5000); // … → 70
  await page.evaluate(() => window.__vm.seek(50)); // back to 50: a replay
  await page.clock.runFor(10000); // 50 → 60 counted again
  expect(log.saves()).toHaveLength(1); // the next 30-s save is still ahead
  await page.locator("#videoModal .vp-close").click();
  await expect(page.locator("#videoModal")).toBeHidden();
  await expect.poll(() => log.saves().length).toBe(2);
  expect(log.saves()[1]).toEqual({
    p_id: 42,
    p_played_sec: 40,
    p_duration_sec: 100,
    p_max_pos_sec: 70,
  });
  // closed: no more saves
  await page.clock.runFor(65000);
  expect(log.saves()).toHaveLength(2);
});

test("student activity (D90): Back closes the video (D88) and saves; another screen (D89 address) and Log out save too", async ({
  page,
}, info) => {
  desktopOnly(info);
  const log = await setup(page);
  // Back
  await lesson(page, "w3-Tue");
  await started(page, log, 1);
  await page.clock.runFor(7000);
  await page.goBack({ waitUntil: "commit" });
  await expect(page.locator("#videoModal")).toBeHidden();
  await expect
    .poll(() => log.saves())
    .toEqual([
      { p_id: 42, p_played_sec: 7, p_duration_sec: 100, p_max_pos_sec: 7 },
    ]);
  // a typed address while the window is open (the hashchange path)
  await lesson(page, "w3-Tue");
  await started(page, log, 2);
  await page.clock.runFor(4000);
  await page.evaluate(() => {
    window.location.hash = "#months/level-2";
  });
  await expect(page.locator("#videoModal")).toBeHidden();
  await expect.poll(() => log.saves().length).toBe(2);
  expect(log.saves()[1]).toMatchObject({ p_id: 43, p_played_sec: 4 });

  // Log out with a window open (the keyboard reaches the header): the save
  // goes out before lms_logout ends the token
  await page.evaluate(() => {
    window.location.hash = "#content/level-1/March";
  });
  await expect(page).toHaveURL(/#content\/level-1\/March$/);
  await expect(page.locator("body")).toHaveAttribute("data-screen", "content");
  await fill(page);
  await toolbar(page, "game2");
  await started(page, log, 3);
  await page.clock.runFor(3000);
  await page.evaluate(() => document.querySelector("#logoutBtn").click());
  await expect.poll(() => log.saves().length).toBe(3);
  expect(log.saves()[2]).toEqual({ p_id: 44, p_visible_sec: 3 });
  await expect
    .poll(() => log.calls.map((c) => c.name).indexOf("lms_logout"))
    .toBeGreaterThan(
      log.calls.map((c) => c.name).lastIndexOf("student_activity_save"),
    );
});

test("student activity (D90): YouTube is measured the same way (the page polls the player)", async ({
  page,
}, info) => {
  desktopOnly(info);
  const log = await setup(page);
  await toolbar(page, "song1");
  await started(page, log, 1);
  expect(log.activity()[0].args).toEqual({
    p_kind: "video",
    p_level: "level-1",
    p_month: "March",
    p_book: 1,
    p_slot: "song1",
    p_label: "I Sit · Song",
    p_video_kind: "youtube",
  });
  await page.clock.runFor(10000); // 0 → 10
  await page.evaluate(() => window.__yt.seek(70)); // skip: not counted
  await page.clock.runFor(15000); // 70 → 80 (its end), then nothing
  await page.keyboard.press("Escape");
  await expect(page.locator("#videoModal")).toBeHidden();
  await expect.poll(() => log.saves().length).toBe(1);
  const [save] = log.saves();
  expect(save).toMatchObject({
    p_id: 42,
    p_duration_sec: 80,
    p_max_pos_sec: 80,
  });
  // 10 s + 10 s (one poll step may fall either side of the skip)
  expect(save.p_played_sec).toBeGreaterThanOrEqual(19);
  expect(save.p_played_sec).toBeLessThanOrEqual(20);
});

test("student activity (D90): games and a framed video page — seconds on screen, a hidden tab not counted; the toolbar and a weekday game slot", async ({
  page,
}, info) => {
  desktopOnly(info);
  const log = await setup(page);
  const setVisible = (visible) =>
    page.evaluate((v) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => (v ? "visible" : "hidden"),
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, visible);

  // the toolbar game of book 2
  await toolbar(page, "game2");
  await expect(page.locator("#gameModal")).toBeVisible();
  await started(page, log, 1);
  expect(log.activity()[0].args).toEqual({
    p_kind: "game",
    p_level: "level-1",
    p_month: "March",
    p_book: 2,
    p_slot: "game2",
    p_label: "I Like School",
    p_video_kind: null,
  });
  await page.clock.runFor(31000);
  await expect.poll(log.saves).toEqual([{ p_id: 42, p_visible_sec: 30 }]);
  await setVisible(false); // the tab goes away: saved at once
  await expect
    .poll(() => log.saves()[1])
    .toEqual({
      p_id: 42,
      p_visible_sec: 31,
    });
  await page.clock.runFor(60000); // hidden: not counted, nothing new to save
  expect(log.saves()).toHaveLength(2);
  await setVisible(true);
  await page.clock.runFor(4000);
  await page.keyboard.press("Escape");
  await expect(page.locator("#gameModal")).toBeHidden();
  await expect.poll(() => log.saves().length).toBe(3);
  expect(log.saves()[2]).toEqual({ p_id: 42, p_visible_sec: 35 });

  // a weekday slot holding a game
  await lesson(page, "w1-Mon");
  await expect(page.locator("#gameModal")).toBeVisible();
  await started(page, log, 2);
  expect(log.activity().at(-1).args).toMatchObject({
    p_kind: "game",
    p_book: 1,
    p_slot: "w1-Mon",
    p_label: "Opening Song · Week 1 · Mon",
    p_video_kind: null,
  });
  await page.clock.runFor(2000);
  await page.locator("#gameModal .game-bar-close").click(); // [X]
  await expect
    .poll(() => log.saves().at(-1))
    .toEqual({
      p_id: 43,
      p_visible_sec: 2,
    });

  // a framed publisher page (no player to ask): on-screen seconds, no book
  // (Good Morning Song is shown with both books)
  await toolbar(page, "opening");
  await expect(page.locator("#videoModal")).toBeVisible();
  await started(page, log, 3);
  expect(log.activity().at(-1).args).toMatchObject({
    p_kind: "video",
    p_book: null,
    p_slot: "opening",
    p_label: "Good Morning Song",
    p_video_kind: "page",
  });
  await page.clock.runFor(8000);
  await page.keyboard.press("Escape");
  await expect
    .poll(() => log.saves().at(-1))
    .toEqual({
      p_id: 44,
      p_visible_sec: 8,
    });
});

test("student activity (D90): the page being left saves (keepalive); a failing or slow log never holds the window", async ({
  page,
}, info) => {
  desktopOnly(info);
  // slow: the start answer is held — the video plays at once all the same
  const slow = await setup(page, { start: "hold" });
  await lesson(page, "w3-Tue");
  await expect(page.locator("#videoModal")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__vm.playing)).toBe(true);
  await page.clock.runFor(3000);
  await page.locator("#videoModal .vp-close").click(); // closed before the id
  await expect(page.locator("#videoModal")).toBeHidden();
  expect(slow.saves()).toHaveLength(0);
  slow.release(); // the id arrives → the last save follows
  await expect
    .poll(() => slow.saves())
    .toEqual([
      { p_id: 42, p_played_sec: 3, p_duration_sec: 100, p_max_pos_sec: 3 },
    ]);
  // pagehide with a window open → one more save
  await lesson(page, "w3-Tue");
  await expect.poll(() => starts(slow)).toBe(2);
  slow.release();
  await expect.poll(() => rowId(page)).toBe(43);
  await page.clock.runFor(2000);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect
    .poll(() => slow.saves().at(-1))
    .toMatchObject({
      p_id: 43,
      p_played_sec: 2,
    });
});

test("student activity (D90): a refused log (500) changes nothing on screen — the video and game open and close as before", async ({
  page,
}, info) => {
  desktopOnly(info);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const log = await setup(page, { start: "fail" });
  await lesson(page, "w3-Tue");
  await expect(page.locator("#videoModal")).toBeVisible();
  await expect(page.locator("#vpFrame")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__vm.players)).toBe(1);
  await page.clock.runFor(35000);
  await page.locator("#videoModal .vp-close").click();
  await expect(page.locator("#videoModal")).toBeHidden();
  await toolbar(page, "game2");
  await expect(page.locator("#gameModal")).toBeVisible();
  await expect(page.locator("#gameFrame")).toHaveAttribute("src", GAME);
  await page.keyboard.press("Escape");
  await expect(page.locator("#gameModal")).toBeHidden();
  expect(log.activity().map((c) => c.name)).toEqual([
    "student_activity_start",
    "student_activity_start",
  ]); // no row id → nothing to save
  expect(errors).toEqual([]);
});

for (const role of ["teacher", "branch", "admin", null]) {
  test(`student activity (D90): ${role ?? "a visitor"} — videos and games log nothing`, async ({
    page,
  }, info) => {
    desktopOnly(info);
    const log = await setup(page, { role });
    await lesson(page, "w3-Tue");
    await expect(page.locator("#videoModal")).toBeVisible();
    await page.clock.runFor(31000);
    await page.locator("#videoModal .vp-close").click();
    await toolbar(page, "game2");
    await expect(page.locator("#gameModal")).toBeVisible();
    await page.clock.runFor(2000);
    await page.keyboard.press("Escape");
    await expect(page.locator("#gameModal")).toBeHidden();
    expect(log.activity()).toEqual([]);
  });
}

test("student activity (D90): the student QR page logs nothing (no app.js, no activity call)", async ({}, info) => {
  desktopOnly(info);
  const html = readFileSync(path.resolve("play.html"), "utf8");
  const js = readFileSync(path.resolve("play.js"), "utf8");
  expect(html).not.toMatch(/src="app\.js"/);
  expect(js).not.toMatch(/student_activity/);
});
