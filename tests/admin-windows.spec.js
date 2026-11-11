import { expect, test } from "@playwright/test";
import { stubBoard } from "./resource-board-stub.mjs";
import { stubLms } from "./lms-admin-stub.mjs";

// D89 (PM brief 2026-11-10): the small windows over the admin screen — the
// content slot editor (#adminSlotModal) and the member editor
// (#memberEditModal) — close when Back / Forward / a typed address moves
// the page, the way Esc closes them (what was typed is dropped), and the
// screen follows the address as before (D87 · D88). Opening one adds no
// history entry. Log out and the login-ended window's button close them
// too; while the login-ended window is up nothing moves. The phone's ☰
// admin menu follows the same rule. Every Supabase request is answered by
// the stubs, and every page of the context is cut off from the live project
// first (D76).

const SUPABASE = /^https:\/\/[^/]+\.supabase\.co\//;
const desktopOnly = (info, why = "flow only, run once") =>
  test.skip(info.project.name !== "desktop", why);
const historyLength = (page) => page.evaluate(() => window.history.length);
const hashOf = (page) => new URL(page.url()).hash;

async function home(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.craBoard && window.craBoard.ready);
}
async function menu(page, view) {
  const button = page.locator(`.admin-menu-btn[data-admin-view="${view}"]`);
  if (!(await button.isVisible()))
    await page.locator("#adminMenuToggle").click();
  await button.click();
}
async function expectView(page, view) {
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
  await expect(page).toHaveURL(new RegExp(`#admin/${view}$`));
  await expect(
    page.locator(`.admin-menu-btn[data-admin-view="${view}"]`),
  ).toHaveClass(/active/);
}
async function expectHome(page) {
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await expect(page.locator("#adminScreen")).not.toHaveClass(/screen-active/);
  expect(hashOf(page)).toBe("");
}
const slotModal = (page) => page.locator("#adminSlotModal");
const memberModal = (page) => page.locator("#memberEditModal");
// No window left: hidden, and the page scrolls again.
async function expectNoWindow(page) {
  await expect(slotModal(page)).toBeHidden();
  await expect(memberModal(page)).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/admin-modal-open/);
}
// The content view's first weekday slot → its editor, a URL typed in.
async function openSlotEditor(page, url = "https://vimeo.com/123456789") {
  await page.locator("#adminBoard .admin-week-row .admin-slot").first().click();
  await expect(slotModal(page)).toBeVisible();
  await page.locator("#adminSlotInput").fill(url);
}
async function openMemberEditor(page, id = "m-s3") {
  await page
    .locator(`.lms-member-row[data-member-id="${id}"] .lms-member-edit`)
    .click();
  await expect(memberModal(page)).toBeVisible();
}
async function adminPage(page) {
  await page.context().route(SUPABASE, (route) => route.abort());
  await stubBoard(page, { role: "admin" });
  await home(page);
}
async function branchPage(page) {
  await page.context().route(SUPABASE, (route) => route.abort());
  await stubLms(page, { role: "branch" });
  await home(page);
  await page.locator("#adminNavBtn").click();
  await expectView(page, "members");
  await expect(
    page.locator('.lms-member-row[data-member-id="m-s3"]'),
  ).toBeVisible();
}
// Another tab of the same browser logs out (as admin-routes.spec.js).
async function logOutInAnotherTab(page, role) {
  const other = await page.context().newPage();
  await stubBoard(other, { role });
  await other.goto("/");
  const logout = other.locator("#logoutBtn");
  await expect(logout).toBeVisible();
  await logout.click();
  await expect(logout).toBeHidden();
  await other.close();
}

test("admin windows (D89 ①): home → [Admin] → the slot editor with a URL typed → Back = the window closes and home shows; Forward = the content view with no window — opening it adds no entry; PC and 390", async ({
  page,
}, info) => {
  desktopOnly(info);
  await adminPage(page);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await home(page);
    await page.locator("#adminNavBtn").click();
    await expectView(page, "content");
    const length = await historyLength(page);
    await openSlotEditor(page);
    expect(await historyLength(page), `${width}`).toBe(length);
    await page.goBack();
    await expectNoWindow(page);
    await expectHome(page);
    await page.goForward();
    await expectView(page, "content");
    await expectNoWindow(page);
    expect(await historyLength(page), `${width}`).toBe(length);
    // Esc's result: the URL typed is gone when it opens again
    await page
      .locator("#adminBoard .admin-week-row .admin-slot")
      .first()
      .click();
    await expect(page.locator("#adminSlotInput")).toHaveValue("");
    await page.keyboard.press("Escape");
    await expectNoWindow(page);
  }
});

test("admin windows (D89 ②): 회원 관리 → 콘텐츠 관리 → the slot editor → Back = the window closes and 회원 관리 shows", async ({
  page,
}, info) => {
  desktopOnly(info);
  await adminPage(page);
  await page.locator("#adminNavBtn").click();
  await menu(page, "members");
  await menu(page, "content");
  await expectView(page, "content");
  await openSlotEditor(page);
  await page.goBack();
  await expectNoWindow(page);
  await expectView(page, "members");
  await expect(page.locator("#adminViewMembers")).toBeVisible();
  await expect(page.locator("#adminViewContent")).toBeHidden();
  await page.goForward();
  await expectView(page, "content");
  await expectNoWindow(page);
});

test("admin windows (D89 ③): the member editor with a new password typed → Back = the window closes (password field emptied) and home shows; Forward = 회원 관리 with no window; opened again the password field is empty", async ({
  page,
}, info) => {
  desktopOnly(info);
  await branchPage(page);
  const length = await historyLength(page);
  await openMemberEditor(page);
  await page.locator("#memberEditName").fill("바꾸는 중");
  await page.locator("#memberEditPw").fill("9999");
  expect(await historyLength(page)).toBe(length);
  await page.goBack();
  await expectNoWindow(page);
  await expect(page.locator("#memberEditPw")).toHaveValue("");
  await expectHome(page);
  await page.goForward();
  await expectView(page, "members");
  await expectNoWindow(page);
  expect(await historyLength(page)).toBe(length);
  await openMemberEditor(page);
  await expect(page.locator("#memberEditPw")).toHaveValue("");
  await expect(page.locator("#memberEditName")).toHaveValue("학생3");
});

test("admin windows (D89 ④): a typed address with a window open closes it — a user screen (#overview), the same view's old address (#admin), another admin view (#admin/classes)", async ({
  page,
  browser,
}, info) => {
  desktopOnly(info);
  await adminPage(page);
  await page.locator("#adminNavBtn").click();
  await openSlotEditor(page);
  await page.evaluate(() => {
    window.location.hash = "#overview";
  });
  await expect(page.locator("#overviewScreen")).toHaveClass(/screen-active/);
  await expectNoWindow(page);
  await page.goBack();
  await expectView(page, "content");
  await expectNoWindow(page);
  // the old #admin is rewritten to this same view: the window still closes
  await openSlotEditor(page);
  await page.evaluate(() => {
    window.location.hash = "#admin";
  });
  await expectView(page, "content");
  await expectNoWindow(page);

  // a branch account's member editor → another admin view
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  });
  const branch = await context.newPage();
  await branchPage(branch);
  await openMemberEditor(branch);
  await branch.locator("#memberEditPw").fill("9999");
  await branch.evaluate(() => {
    window.location.hash = "#admin/classes";
  });
  await expectView(branch, "classes");
  await expectNoWindow(branch);
  await expect(branch.locator("#memberEditPw")).toHaveValue("");
  await context.close();
});

test("admin windows (D89 ⑤): opened and closed by [닫기] or Esc, one Back = the screen before, as before (no entry added)", async ({
  page,
}, info) => {
  desktopOnly(info);
  await adminPage(page);
  for (const close of ["button", "Escape"]) {
    await home(page);
    await page.locator("#adminNavBtn").click();
    await expectView(page, "content");
    const length = await historyLength(page);
    await openSlotEditor(page);
    if (close === "button")
      await slotModal(page).locator("[data-admin-close]").last().click();
    else await page.keyboard.press("Escape");
    await expectNoWindow(page);
    expect(await historyLength(page), close).toBe(length);
    await page.goBack();
    await expectHome(page);
  }
});

test("admin windows (D89 ⑥): with the login-ended window up, Back moves nothing and the slot editor stays under it; [로그인 화면으로] closes it too", async ({
  page,
}, info) => {
  desktopOnly(info);
  await adminPage(page);
  await page.locator("#adminNavBtn").click();
  await menu(page, "members");
  await menu(page, "content");
  await openSlotEditor(page);
  await logOutInAnotherTab(page, "admin");
  await expect(page.locator("#loginEndedModal")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#admin\/members$/);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
  await expect(page.locator("#adminViewContent")).toBeVisible();
  await expect(slotModal(page)).toBeVisible();
  await expect(page.locator("#adminSlotInput")).toHaveValue(
    "https://vimeo.com/123456789",
  );
  await page.locator("#loginEndedGo").click();
  await expect(page.locator("#loginScreen")).toHaveClass(/screen-active/);
  await expectNoWindow(page);
});

test("admin windows (D89): Log out reached by the keyboard with a window open → home with no window left", async ({
  page,
}, info) => {
  desktopOnly(info);
  await adminPage(page);
  await page.locator("#adminNavBtn").click();
  await openSlotEditor(page);
  await page.locator("#adminLogoutBtn").focus();
  await page.keyboard.press("Enter");
  await expectHome(page);
  await expectNoWindow(page);
});

test("admin windows (D89): a phone's ☰ admin menu closes on Back too — the view follows the address", async ({
  page,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 390, height: 844 });
  await adminPage(page);
  await page.locator("#adminNavBtn").click();
  const root = page.locator("#admRoot");
  for (const view of ["members", "content"]) {
    await menu(page, view);
    await expectView(page, view);
    // the left menu slides away (0.2 s) before the next ☰
    await expect(root).not.toHaveClass(/is-menu-open/);
    await expect(
      page.locator(`.admin-menu-btn[data-admin-view="${view}"]`),
    ).toBeHidden();
  }
  await page.locator("#adminMenuToggle").click();
  await expect(page.locator("#admRoot")).toHaveClass(/is-menu-open/);
  await page.goBack();
  await expectView(page, "members");
  await expect(page.locator("#admRoot")).not.toHaveClass(/is-menu-open/);
  await expect(page.locator("#adminBackdrop")).toBeHidden();
  await expect(page.locator("#adminMenuToggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
