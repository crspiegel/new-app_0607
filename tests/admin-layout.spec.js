import { expect, test } from "@playwright/test";
import { stubLms } from "./lms-admin-stub.mjs";

// Admin layout (Phase 3B-2b): inside #admin the kid-facing header and footer
// give way to an admin-only frame — a dark top bar, a left menu per role and
// a light body — and the Korean admin font is fetched only then. Every
// Supabase call is answered by tests/lms-admin-stub.mjs (no live requests).

const NANUM = 'link[href*="family=Nanum+Gothic:"]';

async function openAdmin(page) {
  await page.goto("/");
  await expect(page.locator("#adminNavBtn")).toBeVisible();
  await page.locator("#adminNavBtn").click();
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "admin screens: desktop run");
});

test("admin layout: user header and footer hidden; bar shows who; site view restores them", async ({
  browser,
}) => {
  const cases = [
    ["admin", "최고관리자"],
    ["branch", "지사A"],
    ["teacher", "선생님1"],
  ];
  for (const [role, who] of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await stubLms(page, { role });
    await openAdmin(page);
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator(".site-footer")).toBeHidden();
    await expect(page.locator(".adm-bar")).toBeVisible();
    await expect(page.locator(".adm-bar")).toContainText(
      "Cambridge Reading 관리자",
    );
    await expect(page.locator("#adminWho")).toHaveText(who);
    await expect(page.locator("#adminSidebar")).toBeVisible();
    // the menu lives in the left bar, current view marked
    await expect(
      page.locator("#adminSidebar .admin-menu-btn.active"),
    ).toHaveAttribute("aria-current", "page");
    expect(
      await page.locator("#adminSidebar .admin-menu-btn:visible svg").count(),
      role,
    ).toBeGreaterThan(0);

    await page.locator("#adminSiteBtn").click();
    await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(page.locator(".site-footer")).toBeVisible();
    await expect(page.locator(".adm-bar")).toBeHidden();
    await context.close();
  }
});

test("admin layout: log out from the admin bar", async ({ page }) => {
  const { sent } = await stubLms(page, { role: "teacher" });
  await openAdmin(page);
  await page.locator("#adminLogoutBtn").click();
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await expect.poll(() => sent.logout.length).toBe(1);
  await expect(page.locator("#adminNavBtn")).toBeHidden();
  await expect(page.locator(".topbar")).toBeVisible();
});

test("admin layout: phone — ☰ opens and closes the left menu; table rows fold", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await stubLms(page, { role: "branch" });
  await openAdmin(page);
  const toggle = page.locator("#adminMenuToggle");
  const side = page.locator("#adminSidebar");
  await expect(toggle).toBeVisible();
  await expect(side).not.toBeInViewport();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(side).toBeInViewport();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(side).not.toBeInViewport();
  // a menu choice closes it again
  await toggle.click();
  await expect(side).toBeInViewport();
  await page
    .locator('#adminSidebar .admin-menu-btn[data-admin-view="classes"]')
    .click();
  await expect(page.locator("#adminViewClasses")).toBeVisible();
  await expect(side).not.toBeInViewport();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // member table on a phone: first column + a fold-out button per row
  await toggle.click();
  await page
    .locator('#adminSidebar .admin-menu-btn[data-admin-view="members"]')
    .click();
  const row = page.locator('.lms-member-row[data-member-id="m-s1"]');
  await expect(row.locator("td.adm-col-primary")).toBeVisible();
  await expect(row.locator('td[data-colname="역할"]')).toBeHidden();
  await row.locator(".adm-row-toggle").click();
  await expect(row.locator('td[data-colname="역할"]')).toBeVisible();
  await expect(row.locator(".adm-row-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  // nothing wider than the phone
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("admin layout: desktop — the left menu is always there, no ☰", async ({
  page,
}) => {
  await stubLms(page, { role: "admin" });
  await openAdmin(page);
  await expect(page.locator("#adminMenuToggle")).toBeHidden();
  await expect(page.locator("#adminSidebar")).toBeInViewport();
  const side = await page.locator("#adminSidebar").boundingBox();
  const bar = await page.locator(".adm-bar").boundingBox();
  expect(Math.round(bar.height)).toBe(46);
  expect(side.width).toBeGreaterThanOrEqual(160);
  expect(side.width).toBeLessThanOrEqual(180);
});

test("admin font: Nanum Gothic is requested only once the admin screen opens", async ({
  page,
}) => {
  const nanumRequests = [];
  page.on("request", (req) => {
    if (/family=Nanum\+Gothic:/.test(req.url())) nanumRequests.push(req.url());
  });
  await stubLms(page, { role: "admin" });
  await page.goto("/");
  await expect(page.locator("#adminNavBtn")).toBeVisible();
  await expect(page.locator(NANUM)).toHaveCount(0);
  // the login page and a level page: still none
  await page.goto("/#months/level-1");
  await page.reload();
  await expect(page.locator("#monthScreen")).toHaveClass(/screen-active/);
  await expect(page.locator(NANUM)).toHaveCount(0);
  expect(nanumRequests).toEqual([]);

  await page.locator("#adminNavBtn").click();
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
  await expect(page.locator(NANUM)).toHaveCount(1);
  expect(await page.locator(NANUM).getAttribute("href")).toContain(
    "wght@400;700;800",
  );
  // leaving and coming back adds no second link
  await page.locator("#adminSiteBtn").click();
  await page.locator("#adminNavBtn").click();
  await expect(page.locator(NANUM)).toHaveCount(1);
  const family = await page
    .locator("#adminTitle")
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(family).toMatch(/^"?Inter"?, "?Nanum Gothic"?/);
});

test("admin banner view: teacher resources box first, hero banner box below", async ({
  page,
}) => {
  await stubLms(page, { role: "admin" });
  await openAdmin(page);
  await page
    .locator('#adminSidebar .admin-menu-btn[data-admin-view="banner"]')
    .click();
  const res = page.locator("#teacherResAdmin");
  const hero = page.locator("#heroBannerBox");
  await expect(res).toBeVisible();
  await expect(hero).toBeVisible();
  const [resBox, heroBox] = [await res.boundingBox(), await hero.boundingBox()];
  expect(resBox.y + resBox.height).toBeLessThanOrEqual(heroBox.y);
  await expect(page.locator("#adminTitle")).toHaveText("배너 관리");
  await expect(page.locator("#adminAddNew")).toBeHidden();
});

/* ---- 3B-2b-2 design fixes (P1-P5) -------------------------------------- */

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1366, height: 900 };
const plainRect = (el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
};
const overlaps = (a, b) =>
  a.left < b.right - 0.5 &&
  a.right > b.left + 0.5 &&
  a.top < b.bottom - 0.5 &&
  a.bottom > b.top + 0.5;

// Every cover card of the board: the card (the picture and the drop/click
// area), its notes, and the shape of the picture it shows.
const coverCells = (page) =>
  page.locator("#adminBoard .admin-cover-cell").evaluateAll((cells) =>
    cells.map((cell) => {
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      const card = cell.querySelector(".admin-cover");
      return {
        hasCover: card.classList.contains("has-cover"),
        card: rect(card),
        notes: [
          ...cell.querySelectorAll(
            ".admin-cover-label, .admin-cover-hint, .admin-cover-sync",
          ),
        ].map((n) => ({ text: n.textContent, ...rect(n) })),
      };
    }),
  );

test("admin board covers: the notes sit under the picture, never on it (P1)", async ({
  page,
}) => {
  await stubLms(page, { role: "admin" });
  for (const size of [DESKTOP, PHONE]) {
    await page.setViewportSize(size);
    await openAdmin(page);
    for (const level of ["beginner", "level-1"]) {
      await page.locator("#adminLevel").selectOption(level);
      const cells = await coverCells(page);
      expect(cells.length, level).toBe(level === "beginner" ? 1 : 2);
      for (const cell of cells) {
        expect(cell.notes.map((n) => n.text.trim()).join(" | ")).toMatch(
          /^표지 [12] \| .*(교체|클릭) \| .*npm run covers:sync/,
        );
        for (const note of cell.notes) {
          expect(note.bottom - note.top, note.text).toBeGreaterThan(0);
          expect(overlaps(note, cell.card), `${size.width} ${note.text}`).toBe(
            false,
          );
          expect(note.top, note.text).toBeGreaterThanOrEqual(
            cell.card.bottom - 0.5,
          );
        }
      }
    }
  }
  // the picture itself stays the click-to-upload area (and the drop target)
  await page.locator("#adminLevel").selectOption("beginner");
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#adminBoard .admin-cover").first().click();
  await chooser;
});

test("admin board covers: a phone shows the whole cover in its own shape (P2)", async ({
  page,
}) => {
  await stubLms(page, { role: "admin" });
  // the seed cover of Beginner · March is 530 × 648
  const natural = 530 / 648;
  await page.setViewportSize(PHONE);
  await openAdmin(page);
  const card = page.locator("#adminBoard .admin-cover.has-cover").first();
  await expect(card).toBeVisible();
  await expect
    .poll(async () => {
      const box = await card.boundingBox();
      return Math.abs(box.width / box.height - natural);
    })
    .toBeLessThan(0.03);
  // a sensible width, centred in the visible part of the board
  const [box, board] = await Promise.all([
    card.boundingBox(),
    page.locator("#adminBoard").evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const left = r.left + parseFloat(cs.paddingLeft);
      const right = r.right - parseFloat(cs.paddingRight);
      return { left, right };
    }),
  ]);
  expect(box.width).toBeGreaterThanOrEqual(120);
  expect(box.width).toBeLessThanOrEqual(220);
  expect(box.x).toBeGreaterThanOrEqual(board.left);
  expect(box.x + box.width).toBeLessThanOrEqual(board.right);
  expect(
    Math.abs(box.x + box.width / 2 - (board.left + board.right) / 2),
  ).toBeLessThan(2);

  // the desktop board keeps its arrangement: the cover column left of the weeks
  await page.setViewportSize(DESKTOP);
  const [pcCard, weeks] = await Promise.all([
    card.boundingBox(),
    page.locator("#adminBoard .admin-weeks").first().boundingBox(),
  ]);
  expect(Math.round(pcCard.width)).toBe(150);
  expect(pcCard.x + pcCard.width).toBeLessThanOrEqual(weeks.x);
});

test("admin bar title: 관리자 on a phone, the full name on a desktop (P3)", async ({
  page,
}) => {
  await stubLms(page, { role: "admin" });
  await page.setViewportSize(PHONE);
  await openAdmin(page);
  const brand = page.locator(".adm-brand");
  const shown = () =>
    brand.evaluate((el) => ({
      text: el.innerText.trim(),
      cut: el.scrollWidth > el.clientWidth,
    }));
  expect(await shown()).toEqual({ text: "관리자", cut: false });
  await page.setViewportSize(DESKTOP);
  expect(await shown()).toEqual({
    text: "Cambridge Reading 관리자",
    cut: false,
  });
});

// Row action text buttons and the fold-out button: a 44 × 44 px press area
// or more, none overlapping another, the visible text as before (13 px).
async function pressAreas(page) {
  return page.locator(".adm-table tr").evaluateAll((rows) =>
    rows
      .map((row) =>
        [...row.querySelectorAll(".adm-row-actions button, .adm-row-toggle")]
          .filter((b) => b.getClientRects().length > 0)
          .map((b) => {
            const r = b.getBoundingClientRect();
            return {
              text: b.textContent || b.getAttribute("aria-label"),
              font: b.classList.contains("adm-row-toggle")
                ? null
                : getComputedStyle(b).fontSize,
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
            };
          }),
      )
      .filter((buttons) => buttons.length),
  );
}

// The buttons of one class's student panel (옮기기 · 빼기 · 넣기).
async function panelButtons(page, classId) {
  return page
    .locator(`.lms-class-panel[data-class-id="${classId}"]`)
    .evaluate((panel) =>
      [
        ...panel.querySelectorAll(
          ".lms-class-student-actions button, .lms-class-add button",
        ),
      ].map((b) => {
        const r = b.getBoundingClientRect();
        return {
          text: b.textContent,
          font: getComputedStyle(b).fontSize,
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
        };
      }),
    );
}

test("admin tables: row buttons have 44 px press areas that never overlap (P4)", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const cases = [
    ["branch", "members"],
    ["branch", "classes"],
    ["admin", "branches"],
  ];
  for (const size of [PHONE, DESKTOP]) {
    for (const [role, view] of cases) {
      const context = await browser.newContext({ viewport: size });
      const page = await context.newPage();
      await stubLms(page, { role });
      await openAdmin(page);
      await page.evaluate((v) => window.setAdminView(v), view);
      await expect(
        page.locator(".adm-table:visible tbody tr").first(),
      ).toBeVisible();
      const label = `${size.width} ${role} ${view}`;
      if (view === "classes") {
        // the student panel of a class: 옮기기 · 빼기 per student, 넣기 —
        // 44 px press areas on a phone, 13 px text, never overlapping
        await page
          .locator('.lms-class-row[data-class-id="c-a1"] .lms-class-students')
          .click();
        const panel = await panelButtons(page, "c-a1");
        expect([...new Set(panel.map((b) => b.text))].sort(), label).toEqual([
          "넣기",
          "빼기",
          "옮기기",
        ]);
        for (const b of panel) {
          if (size === PHONE) {
            expect(
              b.right - b.left,
              `${label} ${b.text}`,
            ).toBeGreaterThanOrEqual(44);
            expect(
              b.bottom - b.top,
              `${label} ${b.text}`,
            ).toBeGreaterThanOrEqual(44);
          }
          expect(b.font, `${label} ${b.text}`).toBe("13px");
        }
        for (let i = 0; i < panel.length; i += 1) {
          for (let j = i + 1; j < panel.length; j += 1) {
            expect(
              overlaps(panel[i], panel[j]),
              `${label} ${panel[i].text} / ${panel[j].text}`,
            ).toBe(false);
          }
        }
      }
      const rows = await pressAreas(page);
      expect(rows.length, label).toBeGreaterThan(0);
      for (const buttons of rows) {
        for (const b of buttons) {
          expect(b.right - b.left, `${label} ${b.text}`).toBeGreaterThanOrEqual(
            44,
          );
          expect(b.bottom - b.top, `${label} ${b.text}`).toBeGreaterThanOrEqual(
            44,
          );
          if (b.font) expect(b.font, `${label} ${b.text}`).toBe("13px");
        }
        for (let i = 0; i < buttons.length; i += 1) {
          for (let j = i + 1; j < buttons.length; j += 1) {
            expect(
              overlaps(buttons[i], buttons[j]),
              `${label} ${buttons[i].text} / ${buttons[j].text}`,
            ).toBe(false);
          }
        }
      }
      await context.close();
    }
  }
});

test("admin bar: who is signed in — plain bar text with the role (P5)", async ({
  browser,
}) => {
  const cases = [
    ["admin", "최고관리자"],
    ["branch", "지사A · 지사"],
    ["teacher", "선생님1 · 선생님"],
  ];
  for (const [role, text] of cases) {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();
    await stubLms(page, { role });
    await openAdmin(page);
    const who = page.locator(".adm-who");
    await expect(who, role).toHaveText(text);
    const look = await who.evaluate((el) => {
      const bar = getComputedStyle(el.closest(".adm-bar")).color;
      return {
        tag: el.tagName,
        inLink: Boolean(el.closest("a, button")),
        cursor: getComputedStyle(el).cursor,
        colors: [el, ...el.querySelectorAll("*")].map(
          (n) => getComputedStyle(n).color,
        ),
        bar,
      };
    });
    expect(look.tag, role).toBe("SPAN");
    expect(look.inLink, role).toBe(false);
    expect(look.cursor, role).not.toBe("pointer");
    for (const color of look.colors) expect(color, role).toBe(look.bar);
    await context.close();
  }

  // a long name on a phone: cut with "…", the role and the icons stay
  const context = await browser.newContext({ viewport: PHONE });
  const page = await context.newPage();
  await stubLms(page, { role: "teacher" });
  await openAdmin(page);
  await page.evaluate(() => {
    state.lms.display_name = "아주아주아주긴이름의담임선생님입니다";
    updateAdminUI();
  });
  const geo = await page.evaluate(() => {
    const rect = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const name = document.querySelector("#adminWho");
    return {
      who: rect(".adm-who"),
      role: rect(".adm-who-role"),
      roleText: document.querySelector(".adm-who-role").textContent,
      nameCut: name.scrollWidth > name.clientWidth,
      ellipsis: getComputedStyle(name).textOverflow,
      icons: ["#adminMenuToggle", "#adminSiteBtn", "#adminLogoutBtn"].map(rect),
      width: window.innerWidth,
    };
  });
  expect(geo.nameCut).toBe(true);
  expect(geo.ellipsis).toBe("ellipsis");
  expect(geo.roleText).toBe(" · 선생님");
  expect(geo.role.right).toBeLessThanOrEqual(geo.who.right + 0.5);
  for (const icon of geo.icons) {
    expect(icon.left).toBeGreaterThanOrEqual(0);
    expect(icon.right).toBeLessThanOrEqual(geo.width);
    expect(overlaps(icon, geo.who)).toBe(false);
  }
  await context.close();
});

// The admin must mirror the user screen: after the menu moved into the left
// bar, every kind of user-visible content still has its editor.
test("admin editors: every user-visible content keeps its editor", async ({
  page,
}) => {
  await stubLms(page, { role: "admin" });
  await openAdmin(page);
  const menus = page.locator("#adminSidebar .admin-menu-btn:visible");
  await expect(menus).toHaveCount(6); // + 일괄 등록 (3.4)

  // 콘텐츠: per level — toolbar slots, 4 weeks × 5 days, one cover per book
  for (const level of ["beginner", "level-1", "level-2", "level-3"]) {
    await page.locator("#adminLevel").selectOption(level);
    const expected = await page.evaluate(
      (lv) => ({
        toolbar: toolbarButtons(lv).length,
        covers: bookLayout(lv).length,
      }),
      level,
    );
    await expect(
      page.locator("#adminBoard .admin-songs .admin-slot"),
      level,
    ).toHaveCount(expected.toolbar);
    await expect(
      page.locator("#adminBoard .admin-week-row .admin-slot"),
      level,
    ).toHaveCount(20);
    await expect(page.locator("#adminBoard .admin-cover"), level).toHaveCount(
      expected.covers,
    );
  }
  await expect(page.locator("#adminBgBtn")).toBeVisible();
  await expect(page.locator("#adminMonth option")).toHaveCount(10);

  // 배너: teacher resources (10 slots) + hero banner editor
  await page
    .locator('#adminSidebar .admin-menu-btn[data-admin-view="banner"]')
    .click();
  // 14 teacher-resource slots (D63: 월간교육안 + 연간교육안 instead of
  // 월간.연간교육안) — one editor row per card the teachers see
  await expect(page.locator("#teacherResAdmin .res-admin-row")).toHaveCount(14);
  await expect(page.locator("#heroBannerUpload")).toBeVisible();
  await expect(page.locator("#heroBannerSave")).toBeVisible();
  await expect(page.locator('input[name="heroBannerMode"]')).toHaveCount(2);

  // 회원: the sign-up visibility toggle (mirrors the login page)
  await page
    .locator('#adminSidebar .admin-menu-btn[data-admin-view="members"]')
    .click();
  await expect(page.locator("#signupBox")).toBeVisible();
  await expect(page.locator("#signupToggle")).toBeVisible();
});
