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
