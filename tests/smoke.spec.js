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
  // Clear any real custom labels first so the default name is deterministic.
  await resetContentLabels(page);
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

// Toolbar-label tests follow the same idea: wait for the content hydrate
// attempt to finish, then clear any real custom labels (content_pages.labels)
// so the hardcoded TOOLBAR_BUTTONS defaults are deterministic.
async function resetContentLabels(page) {
  await page.waitForFunction(
    () => window.craContent && window.craContent.settled,
  );
  await page.evaluate(() => {
    const { contentCache, renderContentToolbar } = window.craContent;
    Object.values(contentCache).forEach((entry) => {
      entry.labels = {};
    });
    renderContentToolbar();
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
  // Elements are positioned inside the content-anchored frame (mirrors
  // .section-inner) so placements track the content column across PC/tablet
  // breakpoints instead of drifting with the viewport.
  const frameGeom = await page.evaluate(() => {
    const frame = document.querySelector("#pageBgLayer .page-bg-el-frame");
    const inner = document.querySelector("#contentScreen .section-inner");
    const f = frame.getBoundingClientRect();
    const i = inner.getBoundingClientRect();
    return {
      hasEl: Boolean(frame.querySelector(".page-bg-el")),
      dLeft: Math.abs(f.left - i.left),
      dTop: Math.abs(f.top - i.top),
      dWidth: Math.abs(f.width - i.width),
      dHeight: Math.abs(f.height - i.height),
    };
  });
  expect(frameGeom.hasEl).toBe(true);
  expect(frameGeom.dLeft).toBeLessThan(2);
  expect(frameGeom.dTop).toBeLessThan(2);
  expect(frameGeom.dWidth).toBeLessThan(2);
  expect(frameGeom.dHeight).toBeLessThan(2);
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
  // A FULL image also gets the white top scrim (banner readability).
  await expect(page.locator("#pageBgLayer")).toHaveClass(/has-full/);
  const scrim = await page.evaluate(() =>
    getComputedStyle(
      document.querySelector("#pageBgLayer"),
      "::after",
    ).backgroundImage.includes("linear-gradient"),
  );
  expect(scrim).toBe(true);
  // A month row REPLACES the level default entirely (no merging).
  await page.evaluate(() => {
    const { bgCache, bgKey, applyPageBackground } = window.craBg;
    bgCache[bgKey("Level 1", "page2", "March")] = { full: null, elements: [] };
    applyPageBackground("content");
  });
  await expect(page.locator("body")).not.toHaveClass(/page-bg-active/);
  await expect(page.locator("#pageBgLayer .page-bg-el")).toHaveCount(0);
  await expect(page.locator("#pageBgLayer")).not.toHaveClass(/has-full/);
});

// The hero carousel reads site_settings.hero_banner from the real Supabase
// project, which may hold a real config. Wait for the fetch attempt, then push
// a known config — the database itself is never touched.
async function resetHero(page, config) {
  await page.waitForFunction(() => window.craHero && window.craHero.settled);
  await page.evaluate(
    (cfg) => window.craHero.applyHeroBanner(cfg),
    config ?? null,
  );
}

// Clearance between the app-download buttons and the PAINTED white curve. The
// wave is an SVG whose fill starts at the curve, so its bounding box says
// nothing useful — sample the path instead.
const HERO_CLEARANCE = () => {
  const wave = document.querySelector(".hero-wave");
  const dl = document.querySelector(".app-downloads");
  const w = wave.getBoundingClientRect();
  const d = dl.getBoundingClientRect();
  const path = wave.querySelector("path");
  const total = path.getTotalLength();
  const curveYatX = (svgX) => {
    let lo = 0;
    let hi = total;
    let best = 0;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      const p = path.getPointAtLength(mid);
      if (p.x < svgX) {
        lo = mid;
        best = p.y;
      } else {
        hi = mid;
        best = p.y;
      }
    }
    return best;
  };
  const toSvgX = (px) => ((px - w.left) / (w.right - w.left)) * 2048;
  const toCssY = (svgY) => w.top + (svgY / 220) * (w.bottom - w.top);
  return (
    Math.min(
      toCssY(curveYatX(toSvgX(d.left))),
      toCssY(curveYatX(toSvgX(d.right))),
    ) - d.bottom
  );
};

test("content page fits PC screens without a vertical scrollbar", async ({
  page,
}) => {
  // The page's height barely depends on the viewport (~1086-1099px before this
  // change), so the scrollbar was purely a function of window height. Trimming
  // the bottom whitespace clears it down to ~864px-tall windows.
  for (const [width, height] of [
    [1920, 1080],
    [1899, 992],
    [1600, 900],
    [1536, 864],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/#content/Level%201/March");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const grid = document.querySelector("#lessonGrid");
      const btn = document.querySelector("#contentScreen .lesson-button");
      const footer = document.querySelector(".site-footer");
      return {
        overflow: de.scrollHeight - de.clientHeight,
        gridH: Math.round(grid.getBoundingClientRect().height),
        btnH: Math.round(btn.getBoundingClientRect().height),
        footerH: Math.round(footer.getBoundingClientRect().height),
      };
    });
    const label = `${width}x${height}`;
    expect(m.overflow, label).toBeLessThanOrEqual(0);
    // The weekday board itself must be untouched — only whitespace was cut.
    expect(m.gridH, label).toBe(434);
    expect(m.btnH, label).toBe(86);
    expect(m.footerH, label).toBe(103);
  }
});

test("content page bottom spacing is unchanged on tablet and phone", async ({
  page,
}) => {
  // The trim is scoped to >=1181px on purpose: tablet landscape tunes these
  // separately (68px) and tablet portrait / mobile still want their own values.
  for (const [width, height, innerPb] of [
    [1180, 800, "68px"],
    [1024, 768, "68px"],
    [768, 1024, "183px"],
    [390, 844, "151px"],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/#content/Level%201/March");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const pb = await page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector("#contentScreen .section-inner"),
        ).paddingBottom,
    );
    expect(pb, `${width}x${height}`).toBe(innerPb);
  }
});

test("hero stays inert and unlayered without banners", async ({ page }) => {
  await page.goto("/");
  await resetHero(page, null);
  // No banners → no slides, no carousel class, no timer: byte-identical hero.
  await expect(page.locator(".hero-slide--banner")).toHaveCount(0);
  await expect(page.locator("#heroSlides")).toHaveClass("hero-slides");
  const state = await page.evaluate(() => window.craHero.state());
  expect(state).toMatchObject({ index: 0, count: 1, running: false });
  // The wave is a FIXED layer above the slide layer — that separation is what
  // lets a slide animate without ever covering the curve.
  const z = await page.evaluate(() => ({
    slides: getComputedStyle(document.querySelector("#heroSlides")).zIndex,
    wave: getComputedStyle(document.querySelector(".hero-wave")).zIndex,
  }));
  expect(Number(z.slides)).toBeLessThan(Number(z.wave));
});

test("app-download buttons clear the white wave at every width", async ({
  page,
}) => {
  await page.goto("/");
  await resetHero(page, null);
  // .hero-copy sits UNDER the wave now, so the buttons must clear it on their
  // own. Fonts change the copy height, so wait for them before measuring.
  for (const width of [320, 390, 768, 800, 900, 1024, 1180, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    // The character rig reflows the grid a beat after a resize; measure the
    // settled layout, not the intermediate one.
    await page.waitForTimeout(250);
    const clearance = await page.evaluate(HERO_CLEARANCE);
    expect(clearance, `width ${width}`).toBeGreaterThan(8);
  }
});

test("hero banners build a full-width carousel under the wave", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await resetHero(page, {
    mode: "fade",
    interval: 7,
    banners: [
      { src: "assets/l1-march-book-1.jpg", focus: "top" },
      { src: "assets/l1-march-book-2.jpg", focus: "bottom" },
    ],
  });
  // Default hero is slide 1; the two banners follow it.
  await expect(page.locator(".hero-slide--banner")).toHaveCount(2);
  await expect(page.locator("#heroSlides")).toHaveClass(/hero-carousel--fade/);
  expect(await page.evaluate(() => window.craHero.state())).toMatchObject({
    index: 0,
    count: 3,
    mode: "fade",
    interval: 7,
    running: true,
  });
  const geom = await page.evaluate(() => {
    const hero = document
      .querySelector(".hero-section")
      .getBoundingClientRect();
    return [...document.querySelectorAll(".hero-banner-img")].map((img) => {
      const r = img.getBoundingClientRect();
      return {
        widthDelta: Math.abs(r.width - hero.width),
        insideHero: r.bottom <= hero.bottom + 0.5 && r.top >= hero.top - 0.5,
        fit: getComputedStyle(img).objectFit,
        pos: getComputedStyle(img).objectPosition,
      };
    });
  });
  for (const g of geom) {
    expect(g.widthDelta).toBeLessThan(1); // 가로 100%
    expect(g.insideHero).toBe(true);
    expect(g.fit).toBe("cover");
  }
  expect(geom.map((g) => g.pos)).toEqual(["50% 0%", "50% 100%"]);
  // Advancing hands the active class to a banner slide.
  await page.evaluate(() => window.craHero.goTo(1));
  await expect(page.locator(".hero-slide.is-active")).toHaveClass(
    /hero-slide--banner/,
  );
  expect((await page.evaluate(() => window.craHero.state())).index).toBe(1);
  // Clearing the config tears the whole carousel back down.
  await resetHero(page, null);
  await expect(page.locator(".hero-slide--banner")).toHaveCount(0);
  await expect(page.locator("#heroSlides")).toHaveClass("hero-slides");
});

test("hero banner config falls back on unusable values", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.craHero && window.craHero.settled);
  const out = await page.evaluate(() => {
    const n = window.craHero.normalizeHeroConfig;
    return {
      badMode: n({ mode: "spin" }).mode,
      badInterval: n({ interval: 4 }).interval,
      okInterval: n({ interval: 10 }).interval,
      badFocus: n({ banners: [{ src: "x", focus: "left" }] }).banners[0].focus,
      nullCfg: n(null),
      dropsEmptySrc: n({ banners: [{ src: "" }, { src: "ok" }] }).banners
        .length,
      noDuration: n({}).duration,
      zeroDuration: n({ duration: 0 }).duration,
      bigDuration: n({ duration: 6 }).duration,
      okDuration: n({ duration: 4 }).duration,
    };
  });
  expect(out.badMode).toBe("slide");
  expect(out.badInterval).toBe(5);
  expect(out.okInterval).toBe(10);
  expect(out.badFocus).toBe("center");
  expect(out.nullCfg).toEqual({
    mode: "slide",
    interval: 5,
    duration: 2,
    banners: [],
  });
  expect(out.dropsEmptySrc).toBe(1);
  expect(out.noDuration).toBe(2);
  expect(out.zeroDuration).toBe(2);
  expect(out.bigDuration).toBe(2);
  expect(out.okDuration).toBe(4);
});

test("hero 전환 시간 drives the real transition and the cycle length", async ({
  page,
}) => {
  await page.goto("/");
  await resetHero(page, null);
  for (const duration of [1, 3, 5]) {
    const applied = await page.evaluate((d) => {
      window.craHero.applyHeroBanner({
        mode: "fade",
        interval: 3,
        duration: d,
        banners: [{ src: "assets/l1-march-book-1.jpg", focus: "top" }],
      });
      return {
        cssVar: document
          .querySelector("#heroSlides")
          .style.getPropertyValue("--hero-transition"),
        computed: getComputedStyle(document.querySelector(".hero-slide"))
          .transitionDuration,
        duration: window.craHero.state().duration,
      };
    }, duration);
    expect(applied.cssVar).toBe(`${duration * 1000}ms`);
    expect(applied.computed).toContain(`${duration}s`);
    expect(applied.duration).toBe(duration);
  }
  // Cycle = duration + interval, so "유지 시간" is the fully-visible time
  // rather than something a long cross-fade eats into.
  const elapsed = await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.craHero.applyHeroBanner({
          mode: "fade",
          interval: 3,
          duration: 1,
          banners: [{ src: "assets/l1-march-book-1.jpg", focus: "top" }],
        });
        const t0 = performance.now();
        const from = window.craHero.state().index;
        const iv = setInterval(() => {
          if (window.craHero.state().index !== from) {
            clearInterval(iv);
            resolve(performance.now() - t0);
          }
        }, 40);
        setTimeout(() => {
          clearInterval(iv);
          resolve(-1);
        }, 9000);
      }),
  );
  expect(elapsed).toBeGreaterThan(3800); // 1 + 3 = 4s
  expect(elapsed).toBeLessThan(5200);
  await resetHero(page, null);
});

// ⚠ A hard cut and a real cross-fade both END at opacity 1, so asserting the
// declared transition-duration (as the test above does) cannot tell them
// apart — a `transition-duration: 0ms` override sails straight through it.
// Only sampling DURING the transition catches it, which is why these exist.
async function heroFadeTrace(page, opts) {
  return page.evaluate(
    (o) =>
      new Promise((resolve) => {
        window.craHero.applyHeroBanner({
          mode: o.mode,
          interval: 10,
          duration: 1,
          banners: [
            { src: "assets/l1-march-book-1.jpg", focus: "center" },
            { src: "assets/l1-march-book-2.jpg", focus: "center" },
          ],
        });
        // Freshly inserted slides need one resolved style pass before a class
        // change has a previous value to transition FROM.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const slides = [...document.querySelectorAll(".hero-slide")];
            const samples = [];
            const t0 = performance.now();
            window.craHero.goTo(o.to);
            const tick = () => {
              const t = performance.now() - t0;
              samples.push({
                t,
                op: slides.map((s) => Number(getComputedStyle(s).opacity)),
              });
              if (t < o.until) requestAnimationFrame(tick);
              else resolve(samples);
            };
            requestAnimationFrame(tick);
          }),
        );
      }),
    opts,
  );
}

test("hero fade cross-dissolves and holds the outgoing slide opaque", async ({
  page,
}) => {
  await page.goto("/");
  await resetHero(page, null);
  const trace = await heroFadeTrace(page, { mode: "fade", to: 1, until: 700 });
  const mid = trace.filter((s) => s.t > 120 && s.t < 650);
  expect(mid.length).toBeGreaterThan(2);
  // The incoming slide is genuinely part-way through — a hard cut fails here.
  expect(mid.some((s) => s.op[1] > 0.05 && s.op[1] < 0.95)).toBe(true);
  // ...while the outgoing slide is HELD fully opaque underneath it, so the
  // deep-blue backdrop can never show through the middle of the dissolve.
  for (const s of mid) expect(s.op[0]).toBe(1);
  await resetHero(page, null);
});

test("a leaving hero slide snaps back instead of animating in reverse", async ({
  page,
}) => {
  await page.goto("/");
  await resetHero(page, null);
  // duration 1s → hero-banner.js resets the slide at 1020ms; sample past it.
  const trace = await heroFadeTrace(page, { mode: "fade", to: 1, until: 1400 });
  const after = trace.filter((s) => s.t > 1150);
  expect(after.length).toBeGreaterThan(2);
  // Held at 1 for the whole fade, then 0 at once — never a slow ride down.
  for (const s of after) expect(s.op[0]).toBe(0);
  await resetHero(page, null);
});

test("both hero transitions survive prefers-reduced-motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await resetHero(page, null);
  const declared = await page.evaluate(() => {
    window.craHero.applyHeroBanner({
      mode: "fade",
      interval: 10,
      duration: 1,
      banners: [{ src: "assets/l1-march-book-1.jpg", focus: "center" }],
    });
    const cs = getComputedStyle(document.querySelector(".hero-slide"));
    return {
      reduce: matchMedia("(prefers-reduced-motion: reduce)").matches,
      dur: cs.transitionDuration,
      prop: cs.transitionProperty,
    };
  });
  expect(declared.reduce).toBe(true);
  // ⚠ NOT 0s, and transform must NOT be dropped. The carousel is exempt on
  // purpose (see styles.css): 0ms once made every change an instant cut, and
  // dropping transform once made 슬라이드 render as a plain fade.
  expect(declared.dur).toContain("1s");
  expect(declared.prop).toBe("opacity, transform");
  const trace = await heroFadeTrace(page, { mode: "fade", to: 1, until: 700 });
  const mid = trace.filter((s) => s.t > 120 && s.t < 650);
  expect(mid.some((s) => s.op[1] > 0.05 && s.op[1] < 0.95)).toBe(true);
  // ...and 슬라이드 still actually travels sideways.
  expect(await heroSlideTravel(page)).toBeGreaterThan(200);
  await resetHero(page, null);
  await page.emulateMedia({ reducedMotion: null });
});

// How far the outgoing slide moves horizontally during one slide transition.
// A fade-only degradation reports 0 here while every other value still looks
// right, which is exactly how the 슬라이드 regression hid.
async function heroSlideTravel(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        window.craHero.applyHeroBanner({
          mode: "slide",
          interval: 10,
          duration: 1,
          banners: [
            { src: "assets/l1-march-book-1.jpg", focus: "center" },
            { src: "assets/l1-march-book-2.jpg", focus: "center" },
          ],
        });
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const first = document.querySelector(".hero-slide");
            const xs = [];
            const t0 = performance.now();
            window.craHero.goTo(1);
            const tick = () => {
              xs.push(
                new DOMMatrixReadOnly(getComputedStyle(first).transform).m41,
              );
              if (performance.now() - t0 < 700) requestAnimationFrame(tick);
              else resolve(Math.max(...xs) - Math.min(...xs));
            };
            requestAnimationFrame(tick);
          }),
        );
      }),
  );
}

test("슬라이드 mode actually travels sideways", async ({ page }) => {
  await page.goto("/");
  await resetHero(page, null);
  expect(await heroSlideTravel(page)).toBeGreaterThan(200);
  await resetHero(page, null);
});

test("the incoming hero slide always paints above the outgoing one", async ({
  page,
}) => {
  await page.goto("/");
  await resetHero(page, null);
  const z = await page.evaluate(() => {
    window.craHero.applyHeroBanner({
      mode: "fade",
      interval: 10,
      duration: 1,
      banners: [
        { src: "assets/l1-march-book-1.jpg", focus: "center" },
        { src: "assets/l1-march-book-2.jpg", focus: "center" },
      ],
    });
    const slides = [...document.querySelectorAll(".hero-slide")];
    const zOf = (el) => Number(getComputedStyle(el).zIndex) || 0;
    window.craHero.goTo(2); // out to the last banner
    const onLast = { last: zOf(slides[2]), def: zOf(slides[0]) };
    window.craHero.goTo(0); // ...and wrap back to the default slide
    return { onLast, wrapped: { last: zOf(slides[2]), def: zOf(slides[0]) } };
  });
  // DOM order alone puts the default slide UNDER every banner, so the wrap is
  // the case it gets backwards — the incoming slide must still come out on top.
  expect(z.onLast.last).toBeGreaterThan(z.onLast.def);
  expect(z.wrapped.def).toBeGreaterThan(z.wrapped.last);
  await resetHero(page, null);
});

// Picks the 전환 방식 radio the same way a click does.
const HERO_PICK_MODE = (v) => {
  const el = document.querySelector(
    `input[name="heroBannerMode"][value="${v}"]`,
  );
  el.checked = true;
  el.dispatchEvent(new Event("change", { bubbles: true }));
};

test("a late banner-tab load never overwrites an edited option", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.craHero && window.craHero.settled);
  const out = await page.evaluate(async (pick) => {
    const run = new Function("v", `(${pick})(v)`);
    window.craHero.markSaved({ mode: "fade", interval: 5, duration: 2 });
    // Open the 배너 tab and change the mode while its fetch is still in the
    // air. ⚠ Without the load token the resolving fetch re-syncs the panel and
    // silently reverts the pick, so 저장 then writes the OLD mode back.
    document.querySelector('.admin-menu-btn[data-admin-view="banner"]').click();
    run("slide");
    const justPicked = window.craHero.panel().mode;
    await new Promise((r) => setTimeout(r, 2500)); // let the load land
    return { justPicked, afterLoad: window.craHero.panel().mode };
  }, HERO_PICK_MODE.toString());
  expect(out.justPicked).toBe("slide");
  expect(out.afterLoad).toBe("slide");
});

test("저장 is enabled only while the draft differs from what is saved", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.craHero && window.craHero.settled);
  const out = await page.evaluate((pick) => {
    const run = new Function("v", `(${pick})(v)`);
    const snap = () => window.craHero.panel();
    window.craHero.markSaved({ mode: "fade", interval: 5, duration: 2 });
    const atRest = snap();
    run("slide");
    const edited = snap();
    run("fade"); // undo by hand — back to the saved value
    const undone = snap();
    run("slide");
    window.craHero.markSaved({ mode: "slide", interval: 5, duration: 2 });
    return { atRest, edited, undone, afterSave: snap() };
  }, HERO_PICK_MODE.toString());
  expect(out.atRest).toMatchObject({ changed: false, saveDisabled: true });
  expect(out.edited).toMatchObject({ changed: true, saveDisabled: false });
  // Reverting an edit must disable it again — not just "was touched once".
  expect(out.undone).toMatchObject({ changed: false, saveDisabled: true });
  expect(out.afterSave).toMatchObject({ changed: false, saveDisabled: true });
});

test("game modal scales a fixed 1280x720 frame into a 16:9 card", async ({
  page,
}) => {
  // about:blank keeps this deterministic — the geometry is what's under test,
  // not the external game. The frame's layout viewport is always 1280x720,
  // which is what makes the game's inner scroll container impossible to
  // overflow (it needs at least 1024x630).
  // Viewports WIDER than 16:9 are the important ones: the first version used
  // aspect-ratio + width + max-height, which flattens the card past 16:9 (the
  // width never shrinks back) and clipped the game's title and speaker icon.
  // Every viewport originally tested happened to be at or below 16:9.
  const measure = () =>
    page.evaluate(() => {
      const card = document.querySelector("#gameModalCard");
      const frame = document.querySelector("#gameFrame");
      const c = card.getBoundingClientRect();
      const cs = getComputedStyle(frame);
      const native = card.classList.contains("game-frame-native");
      // Effective magnification of the game's own pixels, read from the
      // COMPUTED transform rather than our own bookkeeping. Anything above 1
      // means a cross-origin frame's bitmap is being stretched → blurry.
      const m = cs.transform;
      const scale =
        m === "none" ? 1 : Number(m.slice(m.indexOf("(") + 1).split(",")[0]);
      return {
        ratio: c.width / c.height,
        native,
        frameW: parseFloat(cs.width),
        frameH: parseFloat(cs.height),
        transform: m,
        scale,
        // Positive = the frame sticks out of the card and gets clipped.
        clipY: parseFloat(cs.height) * scale - c.height,
        clipX: parseFloat(cs.width) * scale - c.width,
        cardW: c.width,
        cardH: c.height,
        fitsViewport:
          c.width <= window.innerWidth + 1 &&
          c.height <= window.innerHeight + 1,
      };
    });
  const assertFits = (g, label) => {
    expect(Math.abs(g.ratio - 16 / 9), label).toBeLessThan(0.02);
    // The whole point of this round: the game is never magnified.
    expect(g.scale, label).toBeLessThanOrEqual(1.001);
    if (g.native) {
      // Big enough card → frame laid out at the card's size, magnification 1.
      expect(Math.abs(g.scale - 1), label).toBeLessThan(0.005);
      expect(Math.abs(g.frameW - g.cardW), label).toBeLessThan(1);
      expect(Math.abs(g.frameH - g.cardH), label).toBeLessThan(1);
      // Never below the game's minimum box, or its inner list would scroll.
      expect(g.frameW, label).toBeGreaterThanOrEqual(1024);
      expect(g.frameH, label).toBeGreaterThanOrEqual(630);
    } else {
      // Small card → fixed fallback box, scaled DOWN (downsampling stays sharp).
      expect(g.frameW, label).toBe(1280);
      expect(g.frameH, label).toBe(720);
      expect(g.scale, label).toBeLessThan(1);
    }
    expect(g.clipY, label).toBeLessThan(1);
    expect(g.clipX, label).toBeLessThan(1);
    expect(g.fitsViewport, label).toBe(true);
  };

  for (const [width, height] of [
    [1920, 1080], // exactly 16:9
    [1899, 992], // wider than 16:9 — the clipping case
    [1920, 900], // wider still
    [2560, 1080], // ultrawide
    [1440, 900], // taller than 16:9
    [1366, 768],
    [1280, 720],
    [1200, 640], // small enough to take the 1280x720 downscale fallback
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/#content/Level%201/March");
    await page.evaluate(() => {
      /* global openGameModal */
      openGameModal("about:blank");
    });
    assertFits(await measure(), `${width}x${height}`);
    // Maximize must hold the same guarantees. The card and the frame animate
    // together over 0.2s, so measure the settled state — mid-flight the card
    // rect and the already-final --game-scale don't correspond.
    await page.evaluate(() => {
      /* global setGameMaximized */
      setGameMaximized(true);
    });
    // Wait for the transitions to actually settle rather than guessing a
    // duration — under parallel workers a fixed 300ms is not always enough,
    // and the frame's transform interpolates to a matrix while in flight.
    await page.waitForFunction(() => {
      const card = document.querySelector("#gameModalCard");
      const frame = document.querySelector("#gameFrame");
      const r = card.getBoundingClientRect();
      const sample = `${r.width}|${r.height}|${getComputedStyle(frame).transform}`;
      const stable = window.__gameSample === sample;
      window.__gameSample = sample;
      return (
        stable &&
        Math.abs(r.width - parseFloat(card.style.width)) < 0.5 &&
        Math.abs(r.height - parseFloat(card.style.height)) < 0.5
      );
    });
    assertFits(await measure(), `${width}x${height} maximized`);
  }
});

test("game modal keeps a native responsive frame on tablet and phone", async ({
  page,
}) => {
  // Forcing the 1280px logical width onto a phone would scale it to ~0.3 and
  // make the game unreadable, so <=1180px opts out of scale-to-fit.
  for (const [width, height] of [
    [1180, 800],
    [1024, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/#content/Level%201/March");
    await page.evaluate(() => openGameModal("about:blank"));
    const m = await page.evaluate(() => {
      const frame = document.querySelector("#gameFrame");
      const card = document.querySelector("#gameModalCard");
      const f = frame.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      return {
        transform: getComputedStyle(frame).transform,
        dW: Math.abs(f.width - c.width),
        dH: Math.abs(f.height - c.height),
        // Inline sizes beat media queries, so fitGameFrame() must clear them.
        inlineWidth: card.style.width,
        inlineHeight: card.style.height,
      };
    });
    expect(m.transform, `${width}x${height}`).toBe("none");
    expect(m.dW).toBeLessThan(1);
    expect(m.dH).toBeLessThan(1);
    expect(m.inlineWidth, `${width}x${height}`).toBe("");
    expect(m.inlineHeight, `${width}x${height}`).toBe("");
  }
});

test("full-width band elements span the page on every viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/#content/Level%201/March");
  await resetBgCache(page);
  await page.evaluate(() => {
    const { bgCache, bgKey, applyPageBackground } = window.craBg;
    bgCache[bgKey("Level 1", "page2", "")] = {
      full: null,
      elements: [
        // A footer pattern: repeated on X, flush with the page bottom.
        {
          src: "assets/l1-march-book-1.jpg",
          x: 50,
          y: 40,
          w: 20,
          r: 0,
          fx: false,
          z: 0,
          fw: true,
          fmode: "tile",
          anchor: "bottom",
          off: 0,
          th: 90,
        },
        // A stretched strip pinned 24px below the top of the page.
        {
          src: "assets/l1-march-book-2.jpg",
          x: 50,
          y: 40,
          w: 20,
          r: 0,
          fx: false,
          z: 1,
          fw: true,
          fmode: "stretch",
          anchor: "top",
          off: 24,
        },
      ],
    };
    applyPageBackground("content");
  });
  await expect(page.locator("#pageBgLayer .page-bg-band")).toHaveCount(2);
  // The stretch band is a real <img>; wait for it so the aspect check is real.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const img = document.querySelector("#pageBgLayer img.page-bg-band");
        return img ? img.naturalWidth : 0;
      }),
    )
    .toBeGreaterThan(0);

  // The whole point of the feature: the band tracks the PAGE width, so a
  // device change never leaves a gap or forces a re-size by hand.
  for (const width of [320, 768, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const geom = await page.evaluate(() => {
      const layer = document.querySelector("#pageBgLayer");
      const tile = document.querySelector("#pageBgLayer .page-bg-band--tile");
      const img = document.querySelector("#pageBgLayer img.page-bg-band");
      const l = layer.getBoundingClientRect();
      const t = tile.getBoundingClientRect();
      const s = img.getBoundingClientRect();
      return {
        widthDeltaTile: Math.abs(t.width - l.width),
        widthDeltaStretch: Math.abs(s.width - l.width),
        // anchor "bottom" + off 0 → the band's bottom IS the page bottom.
        gapToBottom: Math.abs(l.bottom - t.bottom),
        gapToTop: s.top - l.top,
        tileHeight: t.height,
        repeat: getComputedStyle(tile).backgroundRepeat,
        ratio: s.width / s.height,
        naturalRatio: img.naturalWidth / img.naturalHeight,
        // A band must never rise above the page content it decorates.
        bandZ: Number(getComputedStyle(tile).zIndex),
        layerZ: Number(getComputedStyle(layer).zIndex),
        mainZ: Number(getComputedStyle(document.querySelector("main")).zIndex),
      };
    });
    expect(geom.widthDeltaTile).toBeLessThan(1);
    expect(geom.widthDeltaStretch).toBeLessThan(1);
    expect(geom.gapToBottom).toBeLessThan(1);
    expect(Math.abs(geom.gapToTop - 24)).toBeLessThan(1);
    // A tile band is a fixed px strip — same thickness on phone and desktop.
    expect(Math.abs(geom.tileHeight - 90)).toBeLessThan(1);
    expect(geom.repeat).toBe("repeat-x");
    // A stretch band keeps the source aspect ratio at every width.
    expect(Math.abs(geom.ratio - geom.naturalRatio)).toBeLessThan(0.02);
    // Bands are sealed inside the layer's stacking context (z-index 1), which
    // main/.site-footer (z-index 2) always outrank.
    expect(geom.bandZ).toBeGreaterThan(0);
    expect(geom.layerZ).toBeLessThan(geom.mainZ);
  }
});

test("explicit element z-index keeps the saved order and the scrim on top", async ({
  page,
}) => {
  await page.goto("/#content/Level%201/March");
  await resetBgCache(page);
  const order = await page.evaluate(() => {
    const { bgCache, bgKey, applyPageBackground } = window.craBg;
    bgCache[bgKey("Level 1", "page2", "")] = {
      full: "assets/l1-march-book-1.jpg",
      elements: [
        {
          src: "assets/l1-march-book-1.jpg",
          x: 30,
          y: 30,
          w: 10,
          r: 0,
          fx: false,
          z: 0,
        },
        {
          src: "assets/l1-march-book-2.jpg",
          x: 60,
          y: 30,
          w: 10,
          r: 0,
          fx: false,
          z: 1,
        },
      ],
    };
    applyPageBackground("content");
    const els = [...document.querySelectorAll("#pageBgLayer .page-bg-el")];
    return {
      zIndexes: els.map((el) => getComputedStyle(el).zIndex),
      srcOrder: els.map((el) => el.getAttribute("src").split("/").pop()),
      inFrame: els.map((el) => Boolean(el.closest(".page-bg-el-frame"))),
      scrimZ: Number(
        getComputedStyle(document.querySelector("#pageBgLayer"), "::after")
          .zIndex,
      ),
    };
  });
  // Ascending z mirrors the saved order, so [앞으로]/[뒤로] still works even
  // though bands and free elements now live in different parents.
  expect(order.zIndexes).toEqual(["1", "2"]);
  expect(order.srcOrder).toEqual([
    "l1-march-book-1.jpg",
    "l1-march-book-2.jpg",
  ]);
  // Free elements stay in the content-anchored frame — unchanged behaviour.
  expect(order.inFrame).toEqual([true, true]);
  // Regression guard: before elements carried a z-index the readability scrim
  // painted above them purely by tree order. It must still win.
  expect(order.scrimZ).toBeGreaterThan(2);
});

test("editor: 가로 100% toggles a band and unchecking restores the placement", async ({
  page,
}) => {
  await page.goto("/#content/Level%201/March");
  await resetBgCache(page);
  await page.evaluate(() => {
    /* global isAdmin, updateAdminUI */
    isAdmin = true;
    updateAdminUI();
    window.craBg.ready = true;
  });
  await page.locator("#bgEditFab").click();
  await expect(page.locator("#bgEditorPanel")).toBeVisible();
  await page.evaluate(() => {
    /* global bgEdit, renderBgEditCanvas */
    bgEdit.data.elements.push({
      src: "assets/l1-march-book-1.jpg",
      x: 40,
      y: 80,
      w: 20,
      r: 12,
      fx: false,
      z: 0,
    });
    bgEdit.selected = 0;
    renderBgEditCanvas();
  });
  await expect(page.locator("#bgElTools")).toBeVisible();
  // The options stay hidden until 가로 100% is on, so a normal element's panel
  // looks exactly as it did before this feature.
  await expect(page.locator("#bgBandOpts")).toBeHidden();

  await page.locator("#bgBandToggle").check();
  await expect(page.locator("#bgBandOpts")).toBeVisible();
  const band = await page.evaluate(() => {
    const item = bgEdit.data.elements[0];
    const shell = document.querySelector("#pageBgLayer .bg-edit-el");
    const layer = document.querySelector("#pageBgLayer");
    return {
      fw: item.fw,
      fmode: item.fmode,
      anchor: item.anchor,
      keptX: item.x,
      keptW: item.w,
      keptR: item.r,
      inLayer: shell.parentElement.id === "pageBgLayer",
      widthDelta: Math.abs(
        shell.getBoundingClientRect().width -
          layer.getBoundingClientRect().width,
      ),
    };
  });
  expect(band.fw).toBe(true);
  expect(band.fmode).toBe("stretch");
  // y:80 sits in the lower half of the page → anchors to the bottom edge.
  expect(band.anchor).toBe("bottom");
  expect(band.inLayer).toBe(true);
  expect(band.widthDelta).toBeLessThan(1);
  // The free-placement values survive untouched — that is what makes the
  // toggle reversible.
  expect(band.keptX).toBe(40);
  expect(band.keptW).toBe(20);
  expect(band.keptR).toBe(12);

  // Arrow keys nudge a band on Y only, in px away from its anchored edge.
  // (Blur first: the keydown handler ignores keys typed inside a control.)
  await page.evaluate(() => document.activeElement.blur());
  const offBefore = await page.evaluate(() => bgEdit.data.elements[0].off);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => bgEdit.data.elements[0].off)).toBe(
    offBefore + 1,
  );

  // Switching the anchor re-expresses the same pixels from the other edge, so
  // the band must not jump.
  const topBefore = await page.evaluate(
    () =>
      document.querySelector("#pageBgLayer .bg-edit-el").getBoundingClientRect()
        .top,
  );
  await page.locator('input[name="bgBandAnchor"][value="top"]').check();
  const afterAnchor = await page.evaluate(() => ({
    anchor: bgEdit.data.elements[0].anchor,
    top: document
      .querySelector("#pageBgLayer .bg-edit-el")
      .getBoundingClientRect().top,
  }));
  expect(afterAnchor.anchor).toBe("top");
  expect(Math.abs(afterAnchor.top - topBefore)).toBeLessThan(1);

  // Tile mode swaps to a repeating strip that gets the height handle.
  await page.locator('input[name="bgBandMode"][value="tile"]').check();
  await expect(page.locator("#pageBgLayer .bg-edit-band--tile")).toHaveCount(1);
  await expect(page.locator("#pageBgLayer .bg-edit-band-size")).toHaveCount(1);

  await page.locator("#bgBandToggle").uncheck();
  const restored = await page.evaluate(() => {
    const shell = document.querySelector("#pageBgLayer .bg-edit-el");
    return {
      fw: bgEdit.data.elements[0].fw,
      inFrame: Boolean(shell.closest(".page-bg-el-frame")),
      left: shell.style.left,
      width: shell.style.width,
    };
  });
  expect(restored.fw).toBe(false);
  expect(restored.inFrame).toBe(true);
  expect(restored.left).toBe("40%");
  expect(restored.width).toBe("20%");
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

test("editor: element tools stay hidden until a selection exists, ghost preview overlays content", async ({
  page,
}) => {
  await page.goto("/#content/Level%201/March");
  await resetBgCache(page);
  // Stub the admin flag client-side (UI gate only; no Supabase writes here).
  await page.evaluate(() => {
    /* global isAdmin, updateAdminUI */
    isAdmin = true;
    updateAdminUI();
    window.craBg.ready = true;
  });
  await page.locator("#bgEditFab").click();
  await expect(page.locator("#bgEditorPanel")).toBeVisible();
  // The panel is a floating window: dragging its header moves it (so it can
  // be pulled off the right edge while placing elements there).
  const panelBefore = await page.locator("#bgEditorPanel").boundingBox();
  await page
    .locator("#bgEditorPanel .bg-editor-head")
    .hover({ position: { x: 12, y: 12 } });
  await page.mouse.down();
  await page.mouse.move(panelBefore.x - 220, panelBefore.y + 60, { steps: 4 });
  await page.mouse.up();
  const panelAfter = await page.locator("#bgEditorPanel").boundingBox();
  // Moved left (mobile clamps at the viewport edge, so just "less than"),
  // stayed inside the viewport, and followed the pointer down.
  expect(panelAfter.x).toBeLessThan(panelBefore.x);
  expect(panelAfter.x).toBeGreaterThanOrEqual(0);
  expect(panelAfter.y).toBeGreaterThan(panelBefore.y);
  // [hidden] must actually hide the element-tools section (regressed once:
  // a display:grid rule on the same element beat the UA's [hidden] rule).
  await expect(page.locator("#bgElTools")).toBeHidden();
  // Ghost preview (default ON): the page content sits above the edit layer,
  // semi-transparent and click-through, so placement is done against the
  // real layout instead of a blank tint.
  const ghost = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector("main"));
    return {
      bodyGhost: document.body.classList.contains("bg-ghost"),
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
    };
  });
  expect(ghost.bodyGhost).toBe(true);
  expect(Number(ghost.opacity)).toBeLessThan(1);
  expect(ghost.pointerEvents).toBe("none");
  expect(Number(ghost.zIndex)).toBeGreaterThan(10);
  // Selecting an element reveals the tools; Delete removes it via keyboard.
  // bgEdit / renderBgEditCanvas live in background-editor.js's top-level
  // scope, which classic scripts (and evaluate) share.
  await page.evaluate(() => {
    /* global bgEdit, renderBgEditCanvas */
    bgEdit.data.elements.push({
      src: "assets/l1-march-book-1.jpg",
      x: 50,
      y: 40,
      w: 20,
      r: 0,
      fx: false,
      z: 0,
    });
    bgEdit.selected = 0;
    renderBgEditCanvas();
  });
  await expect(page.locator("#bgElTools")).toBeVisible();
  await page.keyboard.press("Delete");
  await expect(page.locator("#pageBgLayer .bg-edit-el")).toHaveCount(0);
  await expect(page.locator("#bgElTools")).toBeHidden();
  // Esc with no selection closes the (clean) session.
  await page.evaluate(() => {
    bgEdit.dirty = false;
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("#bgEditorPanel")).toBeHidden();
});

test("background video URL classifier accepts only renderable shapes", async ({
  page,
}) => {
  await page.goto("/");
  const kinds = await page.evaluate(() =>
    [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://vimeo.com/76979871",
      "https://vimeo.com/video/76979871",
      "https://cdn.example.com/clip.webm?x=1",
      "not a url",
      "  ",
      "",
    ].map((value) => {
      const parsed = window.craBg.parseBgVideoUrl(value);
      return parsed ? parsed.kind : null;
    }),
  );
  expect(kinds).toEqual([
    "youtube",
    "youtube",
    "vimeo",
    "vimeo",
    "file",
    null,
    null,
    null,
  ]);
});

test("video background renders above the full-image fallback", async ({
  page,
}) => {
  await page.goto("/#content/Level%201/March");
  await resetBgCache(page);
  await page.evaluate(() => {
    const { bgCache, bgKey, applyPageBackground } = window.craBg;
    bgCache[bgKey("Level 1", "page2", "")] = {
      full: "assets/l1-march-book-1.jpg",
      elements: [],
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    };
    applyPageBackground("content");
  });
  await expect(page.locator("body")).toHaveClass(/page-bg-active/);
  // The still image stays underneath as the loading/failure fallback.
  await expect(page.locator("#pageBgLayer .page-bg-full")).toHaveCount(1);
  const iframe = page.locator("#pageBgLayer .page-bg-video iframe");
  await expect(iframe).toHaveCount(1);
  const src = await iframe.getAttribute("src");
  expect(src).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  expect(src).toContain("mute=1");
  expect(src).toContain("playlist=dQw4w9WgXcQ");
  // A video counts as a full background for the readability scrim.
  await expect(page.locator("#pageBgLayer")).toHaveClass(/has-full/);
  const geom = await page.evaluate(() => {
    const wrap = document.querySelector("#pageBgLayer .page-bg-video");
    const embed = wrap.querySelector("iframe");
    const wrapRect = wrap.getBoundingClientRect();
    const embedRect = embed.getBoundingClientRect();
    return {
      pointerEvents: getComputedStyle(wrap).pointerEvents,
      afterFull: Boolean(
        wrap.previousElementSibling &&
        wrap.previousElementSibling.classList.contains("page-bg-full"),
      ),
      // sizeBgVideoCover: the 16:9 box must cover the wrapper on both axes.
      covers:
        embedRect.width >= wrapRect.width - 1 &&
        embedRect.height >= wrapRect.height - 1,
    };
  });
  expect(geom.pointerEvents).toBe("none");
  expect(geom.afterFull).toBe(true);
  expect(geom.covers).toBe(true);
  // A direct file URL renders a muted looping <video> that covers via CSS.
  // (Inspected inside the same evaluate — the URL never resolves here, and
  // the resulting error event removes the wrapper again moments later.)
  const fileVideo = await page.evaluate(() => {
    const { bgCache, bgKey, applyPageBackground } = window.craBg;
    bgCache[bgKey("Level 1", "page2", "")].videoUrl =
      "https://example.com/bg.mp4";
    applyPageBackground("content");
    const video = document.querySelector("#pageBgLayer .page-bg-video video");
    return video
      ? {
          muted: video.muted,
          loop: video.loop,
          objectFit: getComputedStyle(video).objectFit,
        }
      : null;
  });
  expect(fileVideo).toEqual({ muted: true, loop: true, objectFit: "cover" });
  // Clearing the URL removes the video layer; the image stays.
  await page.evaluate(() => {
    const { bgCache, bgKey, applyPageBackground } = window.craBg;
    bgCache[bgKey("Level 1", "page2", "")].videoUrl = null;
    applyPageBackground("content");
  });
  await expect(page.locator("#pageBgLayer .page-bg-video")).toHaveCount(0);
  await expect(page.locator("#pageBgLayer .page-bg-full")).toHaveCount(1);
});

test("editor: 영상 URL input validates, dirties, previews, and clears", async ({
  page,
}) => {
  await page.goto("/#content/Level%201/March");
  await resetBgCache(page);
  await page.evaluate(() => {
    /* global isAdmin, updateAdminUI */
    isAdmin = true;
    updateAdminUI();
    window.craBg.ready = true;
  });
  await page.locator("#bgEditFab").click();
  await expect(page.locator("#bgEditorPanel")).toBeVisible();
  // An unsupported URL only warns — the session must stay clean.
  await page.locator("#bgVideoUrl").fill("not a video url");
  await page.locator("#bgVideoApply").click();
  await expect(page.locator("#bgEditorStatus")).toContainText(
    "지원하지 않는 주소",
  );
  expect(await page.evaluate(() => bgEdit.dirty)).toBe(false);
  await expect(page.locator("#bgVideoClear")).toBeHidden();
  // A valid URL dirties the session, shows the live preview + clear button,
  // and lands in the normalized save payload.
  await page.locator("#bgVideoUrl").fill("https://vimeo.com/76979871");
  await page.locator("#bgVideoApply").click();
  await expect(page.locator("#bgEditorStatus")).toContainText("변경됨");
  await expect(page.locator("#bgVideoClear")).toBeVisible();
  await expect(page.locator("#pageBgLayer .page-bg-video iframe")).toHaveCount(
    1,
  );
  await expect(page.locator("#pageBgLayer")).toHaveClass(/has-full/);
  const saved = await page.evaluate(() => {
    /* global bgEdit, bgNormalized */
    return {
      working: bgEdit.data.videoUrl,
      normalized: bgNormalized().videoUrl,
    };
  });
  expect(saved.working).toBe("https://vimeo.com/76979871");
  expect(saved.normalized).toBe("https://vimeo.com/76979871");
  // 영상 제거 empties the value and drops the preview.
  await page.locator("#bgVideoClear").click();
  await expect(page.locator("#pageBgLayer .page-bg-video")).toHaveCount(0);
  expect(await page.evaluate(() => bgEdit.data.videoUrl)).toBe(null);
  // Close the (deliberately un-dirtied) session.
  await page.evaluate(() => {
    bgEdit.dirty = false;
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("#bgEditorPanel")).toBeHidden();
});

// --- Admin-editable toolbar button names (content_pages.labels) -----------

test("toolbar renders a seeded custom button name and falls back when cleared", async ({
  page,
}) => {
  await page.goto("/#content/Level%201/March");
  await expect(page.locator("#contentScreen")).toHaveClass(/screen-active/);
  await resetContentLabels(page);
  // A custom label seeded per level+month replaces the default name.
  await page.evaluate(() => {
    const { contentCache, pageKey, renderContentToolbar } = window.craContent;
    contentCache[pageKey("Level 1", "March")] = {
      videos: {},
      covers: {},
      labels: { opening: "우리 아침 노래" },
    };
    renderContentToolbar();
  });
  await expect(
    page.getByRole("button", { name: "우리 아침 노래" }),
  ).toBeVisible();
  await expect(
    page.locator(".content-toolbar").getByRole("button", {
      name: /Good Morning Song/i,
    }),
  ).toHaveCount(0);
  // Clearing the custom label falls back to the TOOLBAR_BUTTONS default.
  await resetContentLabels(page);
  await expect(
    page.getByRole("button", { name: /Good Morning Song/i }).first(),
  ).toBeVisible();
});

test("admin board top row mirrors the custom toolbar name", async ({
  page,
}) => {
  await page.goto("/#content/Level%201/March");
  await resetContentLabels(page);
  await page.evaluate(() => {
    /* global isAdmin, updateAdminUI, openAdmin */
    const { contentCache, pageKey } = window.craContent;
    contentCache[pageKey("Level 1", "March")] = {
      videos: {},
      covers: {},
      labels: { opening: "우리 아침 노래" },
    };
    // Stub the admin flag client-side (UI gate only; no Supabase writes).
    isAdmin = true;
    updateAdminUI();
    openAdmin();
  });
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
  // First top-row slot is "opening" — it must show the custom name.
  await expect(
    page.locator(".admin-songs .admin-slot-name").first(),
  ).toHaveText("우리 아침 노래");
});

test("slot modal: name field + apply-all boxes for toolbar slots only", async ({
  page,
}) => {
  await page.goto("/#content/Level%201/March");
  await resetContentLabels(page);
  await page.evaluate(() => {
    /* global isAdmin, updateAdminUI, openAdmin */
    isAdmin = true;
    updateAdminUI();
    openAdmin();
  });
  // Toolbar slot → name input + both apply-to-level checkboxes; no 지우기.
  await page.locator(".admin-songs .admin-slot").first().click();
  await expect(page.locator("#adminSlotModal")).toBeVisible();
  await expect(page.locator("#adminSlotNameInput")).toBeVisible();
  await expect(page.locator("#adminSlotNameAllRow")).toBeVisible();
  await expect(page.locator("#adminSlotUrlAllRow")).toBeVisible();
  await expect(page.locator("#adminSlotClear")).toHaveCount(0);
  // The name input holds only the CUSTOM label; the default is the
  // placeholder (empty input = fall back to the default name).
  await expect(page.locator("#adminSlotNameInput")).toHaveValue("");
  expect(
    await page.locator("#adminSlotNameInput").getAttribute("placeholder"),
  ).toContain("기본:");
  await page.locator("#adminSlotModal [data-admin-close]").last().click();
  await expect(page.locator("#adminSlotModal")).toBeHidden();
  // Weekday slot → URL-only modal, exactly as before.
  await page.locator(".admin-week-row .admin-slot").first().click();
  await expect(page.locator("#adminSlotModal")).toBeVisible();
  await expect(page.locator("#adminSlotNameInput")).toBeHidden();
  await expect(page.locator("#adminSlotNameAllRow")).toBeHidden();
  await expect(page.locator("#adminSlotUrlAllRow")).toBeHidden();
});

// --- Toolbar redesign: SVG icons, GAME/SONG tags, fixed-size buttons ------

test("GAME/SONG corner tags render on 6-button levels only", async ({
  page,
}) => {
  await page.goto("/#content/Level%202/March");
  await expect(page.locator("#contentScreen")).toHaveClass(/screen-active/);
  await resetContentLabels(page);
  // Line SVG icons replaced the glyph circles on every button.
  await expect(
    page.locator(".content-toolbar .content-type-icon svg"),
  ).toHaveCount(6);
  const tags = page.locator(".content-toolbar .content-type-tag");
  await expect(tags).toHaveCount(4);
  await expect(
    page.locator(".content-toolbar .content-type-tag--game"),
  ).toHaveCount(2);
  await expect(
    page.locator(".content-toolbar .content-type-tag--song"),
  ).toHaveCount(2);
  await expect(tags.first()).toHaveText("GAME");
  // Trimmed defaults stay distinguishable through the tag in the name.
  await expect(
    page.getByRole("button", { name: /^I Sit\s+GAME$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^I Sit\s+SONG$/ }),
  ).toBeVisible();
  // Beginner: icons unified but no tags, original names kept. (Same-document
  // hash navigation doesn't re-route the SPA — reload to boot into Level 1.)
  await page.goto("/#content/Level%201/March");
  await page.reload();
  await expect(page.locator("#contentScreen")).toHaveClass(/screen-active/);
  await resetContentLabels(page);
  await expect(page.locator(".content-toolbar .content-type-tag")).toHaveCount(
    0,
  );
  await expect(
    page.locator(".content-toolbar .content-type-icon svg"),
  ).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: /Unit Song/i }).first(),
  ).toBeVisible();
});

test("content banner keeps the level name and month circle on one row", async ({
  page,
}) => {
  // December = a two-digit month number, the tightest fit for the circle.
  await page.goto("/#content/Level%202/December");
  await expect(page.locator("#contentScreen")).toHaveClass(/screen-active/);
  const banner = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const name = q("#contentLevelName").getBoundingClientRect();
    const pill = q("#contentScreen .content-banner-month");
    const circle = q("#contentScreen .content-banner-month strong");
    const cr = circle.getBoundingClientRect();
    return {
      // Same row = vertical centers align AND the circle sits to the right.
      centerGap: Math.abs(
        (name.top + name.bottom) / 2 - (cr.top + cr.bottom) / 2,
      ),
      circleIsRightOfName: cr.left >= name.right,
      circleH: Math.round(cr.height),
      circleW: Math.round(cr.width),
      bannerH: Math.round(
        q("#contentScreen .content-level-banner").getBoundingClientRect()
          .height,
      ),
      // The literal "Month " text node is suppressed by font-size:0 on the
      // pill; the number restores its own size on the inner <strong>.
      pillFontSize: getComputedStyle(pill).fontSize,
      digitsFitCircle: circle.scrollWidth <= circle.clientWidth + 1,
      month: q("#contentBannerMonthNumber").textContent,
    };
  });
  expect(banner.month).toBe("12");
  expect(banner.circleIsRightOfName).toBe(true);
  expect(banner.centerGap).toBeLessThan(1.5);
  expect(banner.circleH).toBe(46);
  expect(banner.circleW).toBe(46);
  // One row only — the stacked banner was 112.8px tall.
  expect(banner.bannerH).toBe(46);
  expect(banner.pillFontSize).toBe("0px");
  expect(banner.digitsFitCircle).toBe(true);
});

test("toolbar icons sit on a tinted circle keyed to the icon family", async ({
  page,
}) => {
  await page.goto("/#content/Level%202/March");
  await expect(page.locator("#contentScreen")).toHaveClass(/screen-active/);
  await resetContentLabels(page);
  const icons = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        "#contentScreen .content-toolbar .content-type-icon",
      ),
    ].map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        family: [...el.classList]
          .find((c) => c.startsWith("content-type-icon--"))
          ?.replace("content-type-icon--", ""),
        bg: cs.backgroundColor,
        radius: cs.borderTopLeftRadius,
        // content-box + padding: the circle is wider than the declared glyph.
        square: Math.abs(r.width - r.height) < 0.5,
        grewOverGlyph: r.width > parseFloat(cs.width),
      };
    }),
  );
  expect(icons).toHaveLength(6);
  expect(icons.map((i) => i.family)).toEqual([
    "video",
    "video",
    "game",
    "game",
    "music",
    "music",
  ]);
  for (const icon of icons) {
    expect(icon.radius).toBe("50%");
    expect(icon.square).toBe(true);
    expect(icon.grewOverGlyph).toBe(true);
    expect(icon.bg).not.toBe("rgba(0, 0, 0, 0)");
  }
  // One tint per family, and the three families differ.
  expect(new Set(icons.map((i) => i.bg)).size).toBe(3);
});

test("video player title composes '<label> · Song' for tagged song slots", async ({
  page,
}) => {
  await page.goto("/#content/Level%202/March");
  await expect(page.locator("#contentScreen")).toHaveClass(/screen-active/);
  await resetContentLabels(page);
  // Seed URLs — openSlot only opens the player when the slot has a video.
  await page.evaluate(() => {
    const { contentCache, pageKey, renderContentToolbar } = window.craContent;
    contentCache[pageKey("Level 2", "March")] = {
      videos: {
        song1: "https://vimeo.com/76979871",
        opening: "https://vimeo.com/76979871",
      },
      covers: {},
      labels: {},
    };
    renderContentToolbar();
  });
  await page.locator('.content-type[data-slot="song1"]').click();
  await expect(page.locator("#vpTitle")).toHaveText("I Sit · Song");
  await page.keyboard.press("Escape");
  // Untagged slots keep the bare label (no suffix).
  await page.locator('.content-type[data-slot="opening"]').click();
  await expect(page.locator("#vpTitle")).toHaveText("Good Morning Song");
});

test("wide toolbar keeps fixed button geometry for long labels", async ({
  page,
}) => {
  await page.goto("/#content/Level%202/March");
  await expect(page.locator("#contentScreen")).toHaveClass(/screen-active/);
  await resetContentLabels(page);
  const song1 = page.locator('.content-type[data-slot="song1"]');
  const before = await song1.boundingBox();
  await page.evaluate(() => {
    const { contentCache, pageKey, renderContentToolbar } = window.craContent;
    contentCache[pageKey("Level 2", "March")] = {
      videos: {},
      covers: {},
      labels: { song1: "The Extraordinary Show and Tell Day Adventure" },
    };
    renderContentToolbar();
  });
  // fitText also runs via rAF inside render; call it directly to avoid racing.
  await page.evaluate(() => window.craContent.fitToolbarText());
  const after = await song1.boundingBox();
  // Equal-width flex/grid cells: a long label must not change the button box.
  expect(Math.abs(after.width - before.width)).toBeLessThan(1.5);
  // All buttons share one row/cell height (stretch).
  const opening = await page
    .locator('.content-type[data-slot="opening"]')
    .boundingBox();
  expect(Math.abs(after.height - opening.height)).toBeLessThan(1.5);
  // The label font may only shrink (never grow) relative to a short label.
  const sizes = await page.evaluate(() => {
    const get = (slot) =>
      parseFloat(
        getComputedStyle(
          document.querySelector(
            `.content-type[data-slot="${slot}"] .content-type-label`,
          ),
        ).fontSize,
      );
    return { long: get("song1"), short: get("opening") };
  });
  expect(sizes.long).toBeLessThanOrEqual(sizes.short);
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
