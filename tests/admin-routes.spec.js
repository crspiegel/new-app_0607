import { expect, test } from "@playwright/test";
import { pid, stubBoard } from "./resource-board-stub.mjs";

// D87 (PM brief 2026-11-09, after the D86 audit): one address per admin
// view (#admin/<view>), the 교사자료실 editor's own (#admin/board/new,
// #admin/board/edit/<id>), Back / Forward / reload inside the admin, and the
// browser's question for any change in the editor. Every Supabase request
// is answered by tests/resource-board-stub.mjs (the live project is never
// reached).

const desktopOnly = (info, why = "flow only, run once") =>
  test.skip(info.project.name !== "desktop", why);

const VIEWS = [
  ["content", "콘텐츠 관리"],
  ["members", "회원 관리"],
  ["classes", "반 관리"],
  ["branches", "지사 관리"],
  ["bulk", "일괄 등록"],
  ["banner", "배너 관리"],
  ["board", "교사자료실"],
];
const EDIT_8 = `#admin/board/edit/${pid(8)}`; // "2026 수료 상장 양식"
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
// The admin's 교사자료실 list, from the admin's own menu.
async function boardList(page) {
  await menu(page, "board");
  await expect(page.locator("#rbAdminList tbody tr").first()).toBeVisible();
}
async function editPost(page, title) {
  await page
    .locator("#rbAdminList tbody tr", { hasText: title })
    .locator(".rb-edit-btn")
    .click();
  await expect(page.locator("#rbEditMode")).toBeVisible();
}
// Another tab of the same browser logs out (as resource-board.spec.js §5).
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

test("admin routes (D87 ①②): [Admin] enters on #admin/content as a new entry; each menu = #admin/<view> as a new entry, the same menu again none; the phone ☰ menu too", async ({
  page,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 900 });
  await stubBoard(page, { role: "admin" });
  await home(page);
  const start = await historyLength(page);
  await page.locator("#adminNavBtn").click();
  await expectView(page, "content");
  expect(await historyLength(page)).toBe(start + 1);
  let length = start + 1;
  for (const [view, title] of VIEWS.slice(1)) {
    await menu(page, view);
    await expectView(page, view);
    await expect(page.locator("#adminTitle")).toHaveText(title);
    length += 1;
    expect(await historyLength(page)).toBe(length);
  }
  // the same menu again: no new entry
  await menu(page, "board");
  await expectView(page, "board");
  expect(await historyLength(page)).toBe(length);
  // a phone: the ☰ menu leaves its entries too
  await page.setViewportSize({ width: 390, height: 844 });
  // the left menu slides away first (0.2 s) — then it is behind ☰
  await expect(
    page.locator('.admin-menu-btn[data-admin-view="members"]'),
  ).toBeHidden();
  await menu(page, "members");
  await expectView(page, "members");
  expect(await historyLength(page)).toBe(length + 1);
});

test("admin routes (D87 ③): Back / Forward between admin views open that view; Back from the first one shows the screen before it — home, a month page, the teachers' board — and a branch account the same", async ({
  page,
  browser,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 900 });
  await stubBoard(page, { role: "admin" });
  await home(page);
  await page.locator("#adminNavBtn").click();
  await menu(page, "members");
  await boardList(page);
  await page.goBack();
  await expectView(page, "members");
  await expect(page.locator("#adminViewMembers")).toBeVisible();
  await expect(page.locator("#adminViewBoard")).toBeHidden();
  await page.goBack();
  await expectView(page, "content");
  await expect(page.locator("#adminViewContent")).toBeVisible();
  // out of the admin: the home page really shows (not only its address)
  await page.goBack();
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await expect(page.locator("#adminScreen")).not.toHaveClass(/screen-active/);
  expect(hashOf(page)).toBe("");
  await page.goForward();
  await expectView(page, "content");
  await page.goForward();
  await expectView(page, "members");

  // from a month page and from the teachers' board
  for (const [start, screen] of [
    ["/#months/level-1", "#monthScreen"],
    ["/#board", "#boardScreen"],
  ]) {
    await page.goto(start);
    await page.waitForFunction(() => window.craBoard && window.craBoard.ready);
    await expect(page.locator(screen)).toHaveClass(/screen-active/);
    await page.locator("#adminNavBtn").click();
    await expectView(page, "content");
    await page.goBack();
    await expect(page.locator(screen)).toHaveClass(/screen-active/);
    await expect(page.locator("#adminScreen")).not.toHaveClass(/screen-active/);
  }
  await expect(page.locator("#boardListView")).toBeVisible();

  // a branch account: [My Branch] → 반 → Back → 회원 → Back → home
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  });
  const branch = await context.newPage();
  await stubBoard(branch, { role: "branch" });
  await home(branch);
  await branch.locator("#adminNavBtn").click();
  await expectView(branch, "members");
  await menu(branch, "classes");
  await expectView(branch, "classes");
  await branch.goBack();
  await expectView(branch, "members");
  await branch.goBack();
  await expect(branch.locator("#homeScreen")).toHaveClass(/screen-active/);
  await context.close();
});

test("admin routes (D87 ④): a reload opens the address's view — every menu; #admin/board/edit/<id> = that post's editor, a missing post = the list and its sentence; #admin/board/new = an empty new post; the old #admin = the default view", async ({
  page,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 900 });
  await stubBoard(page, { role: "admin" });
  for (const [view, title] of VIEWS) {
    await page.goto(`/#admin/${view}`);
    await page.reload();
    await expectView(page, view);
    await expect(page.locator("#adminTitle")).toHaveText(title);
  }
  // the editor's addresses
  await page.goto(`/${EDIT_8}`);
  await page.reload();
  await expect(page.locator("#rbEditMode")).toBeVisible();
  await expect(page.locator("#rbEdTitle")).toHaveValue("2026 수료 상장 양식");
  await expect(page.locator("#adminTitle")).toHaveText("교사자료실 글 수정");
  await expect(page).toHaveURL(new RegExp(`${EDIT_8}$`));
  await page.goto(`/#admin/board/edit/${pid(99)}`);
  await page.reload();
  await expect(page.locator("#rbListMode")).toBeVisible();
  await expect(page.locator("#rbAdminStatus")).toHaveText(
    "이 글은 이미 지워졌어요.",
  );
  await expect(page).toHaveURL(/#admin\/board$/);
  await page.goto("/#admin/board/new");
  await page.reload();
  await expect(page.locator("#rbEditMode")).toBeVisible();
  await expect(page.locator("#rbEdTitle")).toHaveValue("");
  await expect(page.locator("#adminTitle")).toHaveText("교사자료실 글 쓰기");
  // the old #admin (and an unknown view): rewritten to the default view
  for (const old of ["#admin", "#admin/nothing", "#admin/board/edit/x"]) {
    await page.goto(`/?old=1${old}`);
    if (old === "#admin/board/edit/x") {
      await expectView(page, "board");
      continue;
    }
    await expectView(page, "content");
  }
});

test("admin routes (D87 ⑤): the editor has its own entry — Back = the admin list; a change → our window → [계속 쓰기] keeps the editor and its address and the next Back asks again; after [수정 완료] / [취소] / [등록하기] one Back = the screen before the list", async ({
  page,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 900 });
  const sent = await stubBoard(page, { role: "admin" });
  // 빅웨이브's path: the admin opened from the teachers' board
  await page.goto("/#board");
  await page.waitForFunction(() => window.craBoard && window.craBoard.ready);
  await page.locator("#adminNavBtn").click();
  await boardList(page);
  const list = await historyLength(page);
  await editPost(page, "2026 수료 상장 양식");
  await expect(page).toHaveURL(new RegExp(`${EDIT_8}$`));
  expect(await historyLength(page)).toBe(list + 1);
  // nothing changed: Back = the admin list (not the teachers' board)
  await page.goBack();
  await expect(page).toHaveURL(/#admin\/board$/);
  await expect(page.locator("#rbListMode")).toBeVisible();
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
  await expect(page.locator("#boardScreen")).not.toHaveClass(/screen-active/);

  // a change: Back asks; stay keeps it all; Back asks again (twice)
  const modal = page.locator("#rbLeaveModal");
  await editPost(page, "2026 수료 상장 양식");
  await page.locator("#rbEdTitle").fill("고치는 중인 제목");
  for (let i = 0; i < 2; i += 1) {
    await page.goBack();
    await expect(modal).toBeVisible();
    await expect(page.locator("#rbLeaveTitle")).toHaveText(
      "수정한 내용을 저장하지 않고 나갈까요?",
    );
    await page.locator("#rbLeaveStay").click();
    await expect(modal).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${EDIT_8}$`));
    await expect(page.locator("#rbEdTitle")).toHaveValue("고치는 중인 제목");
  }
  // Back while the window is up (a quick second press): still one window,
  // still on the site; [계속 쓰기] keeps the editor
  await page.goBack();
  await expect(modal).toBeVisible();
  await page.goBack();
  await expect(modal).toBeVisible();
  await expect(page).toHaveURL(/#admin\/content$/);
  await page.locator("#rbLeaveStay").click();
  await expect(page).toHaveURL(new RegExp(`${EDIT_8}$`));
  await expect(page.locator("#rbEdTitle")).toHaveValue("고치는 중인 제목");

  // [수정 완료] → the list; one Back = the screen before the list (the edit
  // above closed first: with a change, a new page gets the browser's
  // question — D87-3)
  await page.locator("#rbEdCancel").click();
  await page.locator("#rbLeaveGo").click();
  await expect(page.locator("#rbListMode")).toBeVisible();
  await page.goto("/?fresh=1#admin/content");
  await expectView(page, "content");
  await boardList(page);
  await editPost(page, "2026 수료 상장 양식");
  await page.locator("#rbEdTitle").fill("2026 수료 상장 양식 (수정)");
  await page.locator("#rbEdSave").click();
  await expect(page.locator("#rbAdminStatus")).toHaveText("수정했어요.");
  await expect(page).toHaveURL(/#admin\/board$/);
  await expect(page.locator("#rbListMode")).toBeVisible();
  await page.goBack();
  await expectView(page, "content");
  await page.goForward();
  await expectView(page, "board");
  await expect(page.locator("#rbListMode")).toBeVisible();
  // [취소] (a change: our window → 나가기) → the list; Back = before it
  await page.locator("#boardNewBtn").click();
  await expect(page).toHaveURL(/#admin\/board\/new$/);
  await page.locator("#rbEdTitle").fill("쓰다 만 글");
  await page.locator("#rbEdCancel").click();
  await page.locator("#rbLeaveGo").click();
  await expect(page.locator("#rbListMode")).toBeVisible();
  await expect(page).toHaveURL(/#admin\/board$/);
  await page.goBack();
  await expectView(page, "content");
  // [등록하기] (a new post) → the list; Back = before it
  await page.goForward();
  await expectView(page, "board");
  await page.locator("#boardNewBtn").click();
  await page.locator("#rbEdTitle").fill("새 자료");
  await page.locator("#rbEdSave").click();
  await expect(page.locator("#rbAdminStatus")).toHaveText("등록했어요.");
  await expect(page).toHaveURL(/#admin\/board$/);
  await page.goBack();
  await expectView(page, "content");
  expect(sent.rpc.filter((r) => r.name === "board_post_save")).toHaveLength(2);

  // opened from its address (no list under it): [취소] = the list's
  // address in its place, Back = the screen before (the teachers' board)
  await page.goto("/?typed=1#board");
  await page.waitForFunction(() => window.craBoard && window.craBoard.ready);
  await page.evaluate((hash) => {
    window.location.hash = hash.slice(1);
  }, EDIT_8);
  await expect(page.locator("#rbEditMode")).toBeVisible();
  await page.locator("#rbEdCancel").click();
  await expect(page).toHaveURL(/#admin\/board$/);
  await expect(page.locator("#rbListMode")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#boardScreen")).toHaveClass(/screen-active/);
});

test("admin routes on a phone (D87 ⑤): editor → Back = the admin list; a change asks, [계속 쓰기] stays", async ({
  page,
}, info) => {
  desktopOnly(info, "phone size set here");
  await page.setViewportSize({ width: 390, height: 844 });
  await stubBoard(page, { role: "admin" });
  await home(page);
  await page.locator("#adminNavBtn").click();
  await boardList(page);
  await editPost(page, "2026 수료 상장 양식");
  await page.goBack();
  await expect(page).toHaveURL(/#admin\/board$/);
  await expect(page.locator("#rbListMode")).toBeVisible();
  await editPost(page, "2026 수료 상장 양식");
  await page.locator("#rbEdTitle").fill("휴대폰에서 고침");
  await page.goBack();
  await expect(page.locator("#rbLeaveModal")).toBeVisible();
  await page.locator("#rbLeaveStay").click();
  await expect(page).toHaveURL(new RegExp(`${EDIT_8}$`));
  await expect(page.locator("#rbEdTitle")).toHaveValue("휴대폰에서 고침");
});

test("admin routes (D87 ⑥): editing, the address moves to another admin view or a user screen (typed, Back, Forward) — our window first; 나가기 follows the address", async ({
  page,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 900 });
  await stubBoard(page, { role: "admin" });
  await home(page);
  await page.locator("#adminNavBtn").click();
  await boardList(page);
  const modal = page.locator("#rbLeaveModal");
  for (const [hash, check] of [
    ["admin/members", () => expectView(page, "members")],
    [
      "months/level-1",
      () => expect(page.locator("#monthScreen")).toHaveClass(/screen-active/),
    ],
  ]) {
    await page.goto("/?again=1#admin/board");
    await expect(page.locator("#rbAdminList tbody tr").first()).toBeVisible();
    await editPost(page, "2026 수료 상장 양식");
    await page.locator("#rbEdTitle").fill("고치는 중");
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
    await expect(modal).toBeVisible();
    await page.locator("#rbLeaveGo").click();
    await check();
    await expect(page.locator("#rbEditMode")).toBeHidden();
  }
  // Forward into an editor's entry opens it; a change there, Back asks
  await page.goto("/?fwd=1#admin/board");
  await expect(page.locator("#rbAdminList tbody tr").first()).toBeVisible();
  await editPost(page, "2026 수료 상장 양식");
  await page.goBack();
  await expect(page.locator("#rbListMode")).toBeVisible();
  await page.goForward();
  await expect(page.locator("#rbEditMode")).toBeVisible();
  await expect(page.locator("#rbEdTitle")).toHaveValue("2026 수료 상장 양식");
  await page.locator("#rbEdTitle").fill("앞으로 와서 고침");
  await page.goBack();
  await expect(modal).toBeVisible();
  await page.locator("#rbLeaveGo").click();
  await expect(page.locator("#rbListMode")).toBeVisible();
  await expect(page).toHaveURL(/#admin\/board$/);
});

test("admin routes (D87 ⑦): rights — a branch account's address for a view it may not open becomes its default (#admin/members); nobody signed in = the login page, a student = home, and the admin screen is never drawn — nor before the sign-in is known", async ({
  page,
  browser,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 900 });
  // record the first time the admin screen shows, and whether the sign-in
  // was known then
  const watch = (target) =>
    target.addInitScript(() => {
      window.adminSeen = null;
      new MutationObserver(() => {
        const screen = document.querySelector("#adminScreen");
        if (
          window.adminSeen === null &&
          screen &&
          screen.classList.contains("screen-active")
        ) {
          window.adminSeen = {
            ready: typeof adminRoutesReady !== "undefined" && adminRoutesReady,
            role: typeof adminRole === "function" ? adminRole() : null,
          };
        }
      }).observe(document, {
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    });
  await watch(page);
  await stubBoard(page, { role: "branch" });
  await home(page);
  await page.locator("#adminNavBtn").click();
  await expectView(page, "members");
  for (const hash of ["admin/board", "admin/content", EDIT_8.slice(1)]) {
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
    await expectView(page, "members");
    await expect(page.locator("#adminViewBoard")).toBeHidden();
    await expect(page.locator("#adminViewContent")).toBeHidden();
  }
  await page.goto("/?r=1#admin/board");
  await page.reload();
  await expectView(page, "members");
  expect(await page.evaluate(() => window.adminSeen)).toEqual({
    ready: true,
    role: "branch",
  });

  for (const [role, screen, hash] of [
    [null, "#loginScreen", "#login"],
    ["student", "#homeScreen", ""],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
    });
    const other = await context.newPage();
    await watch(other);
    await stubBoard(other, { role });
    await other.goto("/#admin/members");
    await other.reload();
    await expect(other.locator(screen)).toHaveClass(/screen-active/);
    await expect.poll(() => hashOf(other)).toBe(hash);
    await other.waitForFunction(() => window.craBoard && window.craBoard.ready);
    expect(await other.evaluate(() => window.adminSeen)).toBeNull();
    await context.close();
  }
});

test("admin routes (D87 ⑧): with the login-ended window up, Back moves nothing (no leave window, the editor stays under it); [로그인 화면으로] also closes an open leave window and lets the focus go", async ({
  page,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 900 });
  await stubBoard(page, { role: "admin" });
  await home(page);
  await page.locator("#adminNavBtn").click();
  await boardList(page);
  await editPost(page, "2026 수료 상장 양식");
  await page.locator("#rbEdTitle").fill("고치는 중");
  const ended = page.locator("#loginEndedModal");
  const leave = page.locator("#rbLeaveModal");
  await logOutInAnotherTab(page, "admin");
  await expect(ended).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#admin\/board$/);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  await expect(leave).toBeHidden();
  await expect(page.locator("#rbEditMode")).toBeVisible();
  await page.locator("#loginEndedGo").click();
  await expect(page.locator("#loginScreen")).toHaveClass(/screen-active/);

  // the leave window was already open when the login ended
  await stubBoard(page, { role: "admin" });
  await page.goto("/?again=1#admin/board");
  await expect(page.locator("#rbAdminList tbody tr").first()).toBeVisible();
  await editPost(page, "2026 수료 상장 양식");
  await page.locator("#rbEdTitle").fill("고치는 중");
  await page.goBack();
  await expect(leave).toBeVisible();
  await logOutInAnotherTab(page, "admin");
  await expect(ended).toBeVisible();
  await page.locator("#loginEndedGo").click();
  await expect(page.locator("#loginScreen")).toHaveClass(/screen-active/);
  await expect(leave).toBeHidden();
  await page.locator("#loginId").click();
  await expect(page.locator("#loginId")).toBeFocused();
});

test("admin routes (D87 ⑨): the teachers' board keeps its own addresses — list ↔ post with Back, out of it = home; #board → [Admin] → Back = that board", async ({
  page,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 900 });
  await stubBoard(page, { role: "teacher" });
  await home(page);
  await page.locator("#teacherBoardBtn").click();
  await expect(page).toHaveURL(/#board$/);
  await page.locator("#boardRows .bd-row").first().click();
  await expect(page.locator("#boardDetailView")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#boardListView")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  // My Class from the board, then Back
  await page.goForward();
  await expect(page.locator("#boardListView")).toBeVisible();
  await page.locator("#adminNavBtn").click();
  await expectView(page, "members");
  await page.goBack();
  await expect(page.locator("#boardScreen")).toHaveClass(/screen-active/);
  await expect(page.locator("#boardListView")).toBeVisible();
});

test("admin editor (D87-3): any change — title, body, level, category, 공개, 고정, the file order — arms the browser's question; undone = off; saved or cancelled = off; a reload or a closing tab with a change gets it", async ({
  page,
}, info) => {
  desktopOnly(info);
  await page.setViewportSize({ width: 1366, height: 900 });
  await stubBoard(page, { role: "admin" });
  const armed = () =>
    page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
  await home(page);
  await page.locator("#adminNavBtn").click();
  await boardList(page);
  await editPost(page, "2026 수료 상장 양식");
  expect(await armed()).toBe(false);
  const checks = [
    [
      "제목",
      () => page.locator("#rbEdTitle").fill("다른 제목"),
      () => page.locator("#rbEdTitle").fill("2026 수료 상장 양식"),
    ],
    [
      "내용",
      () => page.locator("#rbEdBody").fill("다른 내용"),
      () =>
        page
          .locator("#rbEdBody")
          .fill(
            "수료식에 사용할 상장 양식입니다.\n원 이름과 날짜는 한글 파일에서 고쳐 쓰시고, 고화질 배경은 구글 드라이브에서 받으세요.",
          ),
    ],
    [
      "레벨",
      () => page.locator('#rbEdLevels input[value="level-2"]').check(),
      () => page.locator('#rbEdLevels input[value="common"]').check(),
    ],
    [
      "분류",
      () => page.locator('#rbEdCats input[value="1"]').check(),
      () => page.locator('#rbEdCats input[value="3"]').check(),
    ],
    [
      "공개",
      () => page.locator("#rbEdPublic").uncheck(),
      () => page.locator("#rbEdPublic").check(),
    ],
    [
      "고정",
      () => page.locator("#rbEdPinned").check(),
      () => page.locator("#rbEdPinned").uncheck(),
    ],
    [
      "첨부 순서",
      () =>
        page
          .getByRole("button", {
            name: "2026_수료상장_양식.pdf 순서 바꾸기 (위·아래 화살표)",
          })
          .press("ArrowDown"),
      () =>
        page
          .getByRole("button", {
            name: "2026_수료상장_양식.pdf 순서 바꾸기 (위·아래 화살표)",
          })
          .press("ArrowUp"),
    ],
  ];
  for (const [what, change, undo] of checks) {
    await change();
    expect(await armed(), `${what} 바뀜`).toBe(true);
    await undo();
    expect(await armed(), `${what} 되돌림`).toBe(false);
  }
  // a change, then a reload: the browser's own question (stay = all kept)
  await page.locator("#rbEdTitle").fill("새로고침 전에 고친 제목");
  const dialogs = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.type());
    dialog.dismiss().catch(() => {});
  });
  await page
    .reload({ timeout: 2000 })
    .catch(() => {}); /* stays: the reload never completes */
  expect(dialogs).toEqual(["beforeunload"]);
  await expect(page.locator("#rbEdTitle")).toHaveValue(
    "새로고침 전에 고친 제목",
  );
  // saved: off
  await page.locator("#rbEdSave").click();
  await expect(page.locator("#rbAdminStatus")).toHaveText("수정했어요.");
  expect(await armed()).toBe(false);
  // cancelled after a change: off
  await page.locator("#boardNewBtn").click();
  await page.locator("#rbEdTitle").fill("쓰다 만 글");
  expect(await armed()).toBe(true);
  await page.locator("#rbEdCancel").click();
  await page.locator("#rbLeaveGo").click();
  await expect(page.locator("#rbListMode")).toBeVisible();
  expect(await armed()).toBe(false);
  // closing the tab with a change: the browser's question
  await page.locator("#boardNewBtn").click();
  await page.locator("#rbEdTitle").fill("닫기 전에 쓴 글");
  const [question] = await Promise.all([
    page.waitForEvent("dialog"),
    page.close({ runBeforeUnload: true }),
  ]);
  expect(question.type()).toBe("beforeunload");
});
