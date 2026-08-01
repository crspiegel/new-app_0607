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
