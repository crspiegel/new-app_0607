import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TOKENS, stubLms } from "./lms-admin-stub.mjs";

// LMS admin screens (Phase 3.3 / 3B-2): role menus and header button, view
// guards, members / classes / branches, the admin login cleaning up an LMS
// session, and the remembered branch on the login card (D50). Every Supabase
// request is answered by the small in-memory LMS in lms-admin-stub.mjs, which
// follows the RPC contract of supabase/migration.sql "LMS (Phase 3B)" (its
// permission rules are checked in SQL by supabase/lms/verify-3b.sql) — the
// live project is never reached.

const visibleMenus = (page) =>
  page
    .locator(".admin-menu-btn:visible")
    .evaluateAll((els) => els.map((el) => el.dataset.adminView));

async function openAdminByButton(page) {
  await page.goto("/");
  await expect(page.locator("#adminNavBtn")).toBeVisible();
  await page.locator("#adminNavBtn").click();
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
}

const rpcCalls = (sent, name) => sent.rpc.filter((r) => r.name === name);

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "admin screens: desktop run");
});

test("lms admin: header button and menus per role", async ({ browser }) => {
  test.setTimeout(90000);
  const cases = [
    [
      "admin",
      "Admin",
      // + 자료실 (resource board, 2026-11-03): the top admin only (B3)
      ["content", "members", "classes", "branches", "bulk", "banner", "board"],
      "content",
    ],
    ["branch", "My Branch", ["members", "classes", "bulk"], "members"],
    ["teacher", "My Class", ["members", "classes", "bulk"], "members"],
  ];
  for (const [role, label, menus, first] of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await stubLms(page, { role });
    await openAdminByButton(page);
    await expect(page.locator("#adminNavBtn .action-label")).toHaveText(label);
    expect(await visibleMenus(page), role).toEqual(menus);
    await expect(
      page.locator(`.admin-menu-btn[data-admin-view="${first}"]`),
    ).toHaveClass(/active/);
    await context.close();
  }
  // a student: no button; #admin opens the home page
  const context = await browser.newContext();
  const page = await context.newPage();
  await stubLms(page, { role: "student" });
  await page.goto("/");
  await expect(page.locator("#logoutBtn")).toBeVisible();
  await expect(page.locator("#adminNavBtn")).toBeHidden();
  await page.goto("/#admin");
  await page.reload();
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await expect(page.locator("#adminScreen")).not.toHaveClass(/screen-active/);
  // the app clears #admin once it has sent the student home — wait for it
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await context.close();
});

test("lms admin: views outside the role are refused, also after a reload", async ({
  page,
}) => {
  await stubLms(page, { role: "teacher" });
  await openAdminByButton(page);
  await page.evaluate(() => window.setAdminView("content"));
  await expect(page.locator("#adminViewContent")).toBeHidden();
  await page.evaluate(() => window.setAdminView("branches"));
  await expect(page.locator("#adminViewBranches")).toBeHidden();
  await expect(page.locator("#adminViewMembers")).toBeVisible();
  await page.evaluate(() => window.setAdminView("classes"));
  await expect(page.locator("#adminViewClasses")).toBeVisible();
  // reload on #admin: same guard
  await page.reload();
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
  expect(await visibleMenus(page)).toEqual(["members", "classes", "bulk"]);
  await expect(page.locator("#adminViewMembers")).toBeVisible();
  await expect(page.locator("#adminViewContent")).toBeHidden();
  // nobody signed in: #admin → the login page
  await page.evaluate(() => {
    window.localStorage.removeItem("cra_lms");
    window.sessionStorage.setItem("seeded", "1");
  });
  await page.goto("/#admin");
  await page.reload();
  await expect(page.locator("#loginScreen")).toHaveClass(/screen-active/);
});

test("lms admin: member list — filters, lock shown, unlock", async ({
  page,
}) => {
  const { sent } = await stubLms(page, { role: "branch" });
  await openAdminByButton(page);
  const rows = page.locator("#lmsMemberList .lms-member-row");
  await expect(rows).toHaveCount(7); // branch A: 2 teachers + 5 students
  await expect(page.locator("#lmsMemberBranchFilter")).toBeHidden();
  // role filter → teachers only
  await page.locator("#lmsMemberRoleFilter").selectOption("2");
  await expect(rows).toHaveCount(2);
  await page.locator("#lmsMemberRoleFilter").selectOption("");
  // class filter → no class
  await page.locator("#lmsMemberClassFilter").selectOption("none");
  await expect(rows).toHaveCount(4); // ta1, ta2, s3, kim
  await page.locator("#lmsMemberClassFilter").selectOption("");
  // search
  await page.locator("#lmsMemberSearch").fill("잠긴");
  await expect(rows).toHaveCount(1);
  const locked = rows.first();
  await expect(locked.locator(".lms-member-lock")).toContainText("잠김");
  await expect(locked.locator(".lms-member-lock")).toContainText("7분");
  await locked.locator(".lms-member-unlock").click();
  await expect.poll(() => rpcCalls(sent, "lms_unlock_member").length).toBe(1);
  expect(rpcCalls(sent, "lms_unlock_member")[0].args).toEqual({
    p_member_id: "m-lk",
  });
  await expect(
    page.locator(
      '#lmsMemberList .lms-member-row[data-member-id="m-lk"] .lms-member-lock',
    ),
  ).toBeHidden();
});

test("lms admin: create — a taken ID offers the suggestion in one click", async ({
  page,
}) => {
  const { sent } = await stubLms(page, { role: "branch" });
  await openAdminByButton(page);
  // the form opens from the title row's 새로 추가 (3B-2b)
  await expect(page.locator("#lmsMemberAddBox")).toBeHidden();
  await page.locator("#adminAddNew").click();
  await expect(page.locator("#lmsMemberAddBox")).toBeVisible();
  await expect(page.locator("#lmsNewPw")).toHaveAttribute("type", "password");
  await expect(page.locator("#lmsNewBranch")).toBeHidden();
  await page.locator("#lmsNewId").fill("kim");
  await page.locator("#lmsNewPw").fill("0000");
  await page.locator("#lmsNewName").fill("김민준");
  await page.locator("#lmsNewRole").selectOption("3");
  await page.locator("#lmsMemberForm button[type=submit]").click();
  await expect(page.locator("#lmsMemberSuggestBtn")).toBeVisible();
  await expect(page.locator("#lmsMemberSuggestBtn")).toContainText("kim2");
  await page.locator("#lmsMemberSuggestBtn").click();
  await expect.poll(() => rpcCalls(sent, "lms_member_create").length).toBe(2);
  const [first, second] = rpcCalls(sent, "lms_member_create");
  expect(first.args).toMatchObject({ p_login_id: "kim", p_role: 3 });
  expect(second.args).toMatchObject({
    p_login_id: "kim2",
    p_password: "0000",
    p_role: 3,
    p_display_name: "김민준",
  });
  expect(second.args.p_branch_id).toBeUndefined(); // the branch is the server's
  await expect(
    page.locator("#lmsMemberList .lms-member-row", { hasText: "kim2" }),
  ).toHaveCount(1);
  await expect(page.locator("#lmsNewPw")).toHaveValue("");
});

// 3B-2b-2 (#3): a new member is a student unless the caller picks otherwise —
// when the form first opens and again after a create.
test("lms admin: create — the role starts at 학생, also after a create", async ({
  browser,
}) => {
  for (const role of ["branch", "admin"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const { sent } = await stubLms(page, { role });
    await openAdminByButton(page);
    if (role === "admin") {
      await page
        .locator('#adminSidebar .admin-menu-btn[data-admin-view="members"]')
        .click();
    }
    await page.locator("#adminAddNew").click();
    const select = page.locator("#lmsNewRole");
    await expect(select, role).toBeVisible();
    await expect(select, role).toHaveValue("3");
    await expect(select.locator("option:checked"), role).toHaveText("학생");
    // a teacher this time
    await select.selectOption("2");
    await page.locator("#lmsNewId").fill("newt");
    await page.locator("#lmsNewPw").fill("0000");
    if (role === "admin") {
      await page.locator("#lmsNewBranch").selectOption("br-a");
    }
    await page.locator("#lmsMemberForm button[type=submit]").click();
    await expect(page.locator("#lmsMemberStatus"), role).toContainText(
      "만들었어요",
    );
    expect(rpcCalls(sent, "lms_member_create")[0].args.p_role, role).toBe(2);
    // the form, opened again, starts at 학생
    await page.locator("#adminAddNew").click(); // close
    await expect(page.locator("#lmsMemberAddBox")).toBeHidden();
    await page.locator("#adminAddNew").click(); // open
    await expect(select, role).toHaveValue("3");
    await context.close();
  }
});

test("lms admin: edit — a teacher cannot change login IDs, a branch account can", async ({
  browser,
}) => {
  // teacher: its class student s1
  let context = await browser.newContext();
  let page = await context.newPage();
  let { sent } = await stubLms(page, { role: "teacher" });
  await openAdminByButton(page);
  const teacherRows = page.locator("#lmsMemberList .lms-member-row");
  await expect(teacherRows).toHaveCount(5); // branch A students
  await page
    .locator('.lms-member-row[data-member-id="m-s1"] .lms-member-edit')
    .click();
  await expect(page.locator("#memberEditModal")).toBeVisible();
  await expect(page.locator("#memberEditIdRow")).toBeHidden();
  await expect(page.locator("#memberEditPw")).toHaveAttribute(
    "type",
    "password",
  );
  await page.locator("#memberEditName").fill("새이름");
  await page.locator("#memberEditSave").click();
  await expect.poll(() => rpcCalls(sent, "lms_member_update").length).toBe(1);
  expect(rpcCalls(sent, "lms_member_update")[0].args).toEqual({
    p_member_id: "m-s1",
    p_display_name: "새이름",
  });
  await expect(page.locator("#memberEditModal")).toBeHidden();
  // a student outside its classes has no edit button
  await expect(
    page.locator('.lms-member-row[data-member-id="m-s3"] .lms-member-edit'),
  ).toHaveCount(0);
  await context.close();

  // branch account: changes s3's login ID
  context = await browser.newContext();
  page = await context.newPage();
  ({ sent } = await stubLms(page, { role: "branch" }));
  await openAdminByButton(page);
  await page
    .locator('.lms-member-row[data-member-id="m-s3"] .lms-member-edit')
    .click();
  await expect(page.locator("#memberEditIdRow")).toBeVisible();
  await page.locator("#memberEditId").fill("s3new");
  await page.locator("#memberEditPw").fill("1234");
  await page.locator("#memberEditSave").click();
  await expect.poll(() => rpcCalls(sent, "lms_member_update").length).toBe(1);
  expect(rpcCalls(sent, "lms_member_update")[0].args).toEqual({
    p_member_id: "m-s3",
    p_login_id: "s3new",
    p_password: "1234",
  });
  await expect(
    page.locator('.lms-member-row[data-member-id="m-s3"]'),
  ).toContainText("s3new");
  await context.close();
});

test("lms admin: deactivate; delete is admin-only and takes two clicks", async ({
  browser,
}) => {
  let context = await browser.newContext();
  let page = await context.newPage();
  let { sent } = await stubLms(page, { role: "branch" });
  await openAdminByButton(page);
  const s3 = page.locator('.lms-member-row[data-member-id="m-s3"]');
  await expect(s3.locator(".lms-member-delete")).toHaveCount(0);
  await s3.locator(".lms-member-toggle").click();
  await expect.poll(() => rpcCalls(sent, "lms_member_update").length).toBe(1);
  expect(rpcCalls(sent, "lms_member_update")[0].args).toEqual({
    p_member_id: "m-s3",
    p_active: false,
  });
  await expect(s3).toHaveClass(/is-inactive/);
  await context.close();

  context = await browser.newContext();
  page = await context.newPage();
  ({ sent } = await stubLms(page, { role: "admin" }));
  await openAdminByButton(page);
  await page.locator('.admin-menu-btn[data-admin-view="members"]').click();
  await expect(page.locator("#lmsMemberBranchFilter")).toBeVisible();
  const row = page.locator('.lms-member-row[data-member-id="m-sb"]');
  const del = row.locator(".lms-member-delete");
  await del.click();
  await expect(del).toHaveText("한 번 더 누르면 삭제");
  expect(rpcCalls(sent, "lms_member_delete")).toHaveLength(0);
  await del.click();
  await expect.poll(() => rpcCalls(sent, "lms_member_delete").length).toBe(1);
  expect(rpcCalls(sent, "lms_member_delete")[0].args).toEqual({
    p_member_id: "m-sb",
  });
  await expect(row).toHaveCount(0);
  await context.close();
});

test("lms admin: classes — a teacher adds only students without a class (D51)", async ({
  browser,
}) => {
  let context = await browser.newContext();
  let page = await context.newPage();
  let { sent } = await stubLms(page, { role: "teacher" });
  await openAdminByButton(page);
  await page.locator('.admin-menu-btn[data-admin-view="classes"]').click();
  const rows = page.locator("#lmsClassList .lms-class-row");
  await expect(rows).toHaveCount(1); // only its own class
  await page.locator("#adminAddNew").click();
  await expect(page.locator("#lmsClassAddBox")).toBeVisible();
  await expect(page.locator("#lmsClassTeacher")).toBeHidden();
  const a1 = page.locator('.lms-class-row[data-class-id="c-a1"]');
  await expect(a1.locator(".lms-class-delete")).toHaveCount(0);
  await a1.locator(".lms-class-students").click();
  await expect(a1.locator(".lms-class-student")).toHaveCount(2); // s1, lk
  const options = await a1
    .locator(".lms-class-add-select option")
    .evaluateAll((els) => els.map((el) => el.value).filter(Boolean));
  expect(options.sort()).toEqual(["m-kim", "m-s3"]); // s2 is in A2
  await a1.locator(".lms-class-add-select").selectOption("m-s3");
  await a1.locator(".lms-class-add-btn").click();
  await expect
    .poll(() => rpcCalls(sent, "lms_class_add_member").length)
    .toBe(1);
  expect(rpcCalls(sent, "lms_class_add_member")[0].args).toEqual({
    p_class_id: "c-a1",
    p_member_id: "m-s3",
  });
  await expect(a1.locator(".lms-class-student")).toHaveCount(3);
  await a1
    .locator(
      '.lms-class-student[data-member-id="m-s1"] .lms-class-student-remove',
    )
    .click();
  await expect
    .poll(() => rpcCalls(sent, "lms_class_remove_member").length)
    .toBe(1);
  await context.close();

  // branch account: moving s2 (in A2) into A1 = out of A2, then into A1
  context = await browser.newContext();
  page = await context.newPage();
  ({ sent } = await stubLms(page, { role: "branch" }));
  await openAdminByButton(page);
  await page.locator('.admin-menu-btn[data-admin-view="classes"]').click();
  await expect(page.locator("#lmsClassList .lms-class-row")).toHaveCount(2);
  await page.locator("#adminAddNew").click();
  await expect(page.locator("#lmsClassTeacher")).toBeVisible();
  const b1 = page.locator('.lms-class-row[data-class-id="c-a1"]');
  await b1.locator(".lms-class-students").click();
  await b1.locator(".lms-class-add-select").selectOption("m-s2");
  await expect(b1.locator(".lms-class-add-btn")).toHaveText("옮겨 넣기");
  await b1.locator(".lms-class-add-btn").click();
  await expect
    .poll(() => rpcCalls(sent, "lms_class_add_member").length)
    .toBe(1);
  expect(rpcCalls(sent, "lms_class_remove_member")[0].args).toEqual({
    p_class_id: "c-a2",
    p_member_id: "m-s2",
  });
  expect(rpcCalls(sent, "lms_class_add_member")[0].args).toEqual({
    p_class_id: "c-a1",
    p_member_id: "m-s2",
  });
  await context.close();
});

test("lms admin: D53 — a teacher moves a student between its own classes in one call", async ({
  browser,
}) => {
  // ta1 makes a second class, then moves s1 out of A1 into it
  let context = await browser.newContext();
  let page = await context.newPage();
  let { sent } = await stubLms(page, { role: "teacher" });
  await openAdminByButton(page);
  await page.locator('.admin-menu-btn[data-admin-view="classes"]').click();
  await page.locator("#adminAddNew").click();
  await page.locator("#lmsClassName").fill("A3반");
  await page.locator("#lmsClassForm button[type=submit]").click();
  await expect(page.locator("#lmsClassList .lms-class-row")).toHaveCount(2);
  const a1 = page.locator('.lms-class-row[data-class-id="c-a1"]');
  await a1.locator(".lms-class-students").click();
  const s1 = page.locator(
    '.lms-class-panel[data-class-id="c-a1"] .lms-class-student[data-member-id="m-s1"]',
  );
  await s1.locator(".lms-class-move-select").selectOption("c-new1");
  await s1.locator(".lms-class-student-move").click();
  await expect
    .poll(() => rpcCalls(sent, "lms_class_add_member").length)
    .toBe(1);
  expect(rpcCalls(sent, "lms_class_add_member")[0].args).toEqual({
    p_class_id: "c-new1",
    p_member_id: "m-s1",
  });
  expect(rpcCalls(sent, "lms_class_remove_member")).toHaveLength(0); // one call
  await expect(
    page.locator('.lms-class-panel[data-class-id="c-a1"] .lms-class-student'),
  ).toHaveCount(1); // lk is left
  // A3's add list: lk (in its A1) is offered as a move; s2 (A2, another
  // teacher's) is not (D51 stays)
  const a3 = page.locator('.lms-class-row[data-class-id="c-new1"]');
  await a3.locator(".lms-class-students").click();
  const offered = await page
    .locator(
      '.lms-class-panel[data-class-id="c-new1"] .lms-class-add-select option',
    )
    .evaluateAll((els) => els.map((el) => el.value).filter(Boolean));
  expect(offered.sort()).toEqual(["m-kim", "m-lk", "m-s3"]);
  await page
    .locator('.lms-class-panel[data-class-id="c-new1"] .lms-class-add-select')
    .selectOption("m-lk");
  await expect(
    page.locator('.lms-class-panel[data-class-id="c-new1"] .lms-class-add-btn'),
  ).toHaveText("옮겨 넣기");
  await context.close();

  // lk is also in A2 (another teacher's class): the move is refused
  context = await browser.newContext();
  page = await context.newPage();
  ({ sent } = await stubLms(page, {
    role: "teacher",
    classMembers: [{ class_id: "c-a2", member_id: "m-lk" }],
  }));
  await openAdminByButton(page);
  await page.locator('.admin-menu-btn[data-admin-view="classes"]').click();
  await page.locator("#adminAddNew").click();
  await page.locator("#lmsClassName").fill("A3반");
  await page.locator("#lmsClassForm button[type=submit]").click();
  await expect(page.locator("#lmsClassList .lms-class-row")).toHaveCount(2);
  await page
    .locator('.lms-class-row[data-class-id="c-a1"] .lms-class-students')
    .click();
  const lk = page.locator(
    '.lms-class-panel[data-class-id="c-a1"] .lms-class-student[data-member-id="m-lk"]',
  );
  await lk.locator(".lms-class-move-select").selectOption("c-new1");
  await lk.locator(".lms-class-student-move").click();
  await expect(page.locator("#lmsClassStatus")).toHaveText(
    "다른 선생님 반에도 있는 학생이라 지사 계정·최고관리자만 옮길 수 있어요.",
  );
  await expect(
    page.locator('.lms-class-panel[data-class-id="c-a1"] .lms-class-student'),
  ).toHaveCount(2);
  await context.close();

  // the branch account: a move from the student's line = out, then in
  context = await browser.newContext();
  page = await context.newPage();
  ({ sent } = await stubLms(page, { role: "branch" }));
  await openAdminByButton(page);
  await page.locator('.admin-menu-btn[data-admin-view="classes"]').click();
  await page
    .locator('.lms-class-row[data-class-id="c-a2"] .lms-class-students')
    .click();
  const s2 = page.locator(
    '.lms-class-panel[data-class-id="c-a2"] .lms-class-student[data-member-id="m-s2"]',
  );
  await s2.locator(".lms-class-move-select").selectOption("c-a1");
  await s2.locator(".lms-class-student-move").click();
  await expect
    .poll(() => rpcCalls(sent, "lms_class_add_member").length)
    .toBe(1);
  expect(rpcCalls(sent, "lms_class_remove_member")[0].args).toEqual({
    p_class_id: "c-a2",
    p_member_id: "m-s2",
  });
  expect(rpcCalls(sent, "lms_class_add_member")[0].args).toEqual({
    p_class_id: "c-a1",
    p_member_id: "m-s2",
  });
  await context.close();
});

test("lms admin: branches (admin only) — create with a code", async ({
  page,
}) => {
  const { sent } = await stubLms(page, { role: "admin" });
  await openAdminByButton(page);
  await page.locator('.admin-menu-btn[data-admin-view="branches"]').click();
  await expect(page.locator("#lmsBranchList .lms-branch-row")).toHaveCount(2);
  await page.locator("#adminAddNew").click();
  await page.locator("#lmsBranchCode").fill("busan");
  await page.locator("#lmsBranchName").fill("부산지사");
  await page.locator("#lmsBranchForm button[type=submit]").click();
  await expect.poll(() => rpcCalls(sent, "lms_branch_create").length).toBe(1);
  expect(rpcCalls(sent, "lms_branch_create")[0].args).toEqual({
    p_name: "부산지사",
    p_code: "busan",
  });
  await expect(page.locator("#lmsBranchList .lms-branch-row")).toHaveCount(3);
});

test("lms admin: an admin (@) login ends a left-over LMS session", async ({
  page,
}) => {
  const { sent } = await stubLms(page, { role: "teacher", adminLogin: true });
  await page.goto("/#login");
  await page.reload();
  await page.locator("#loginId").fill("admin@example.test");
  await page.locator("#loginPassword").fill("secret-pw");
  await page.locator("#loginForm .login-submit").click();
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
  expect(sent.logout).toEqual([{ token: TOKENS.teacher }]);
  expect(
    await page.evaluate(() => window.localStorage.getItem("cra_lms")),
  ).toBeNull();
  await expect(page.locator("#adminNavBtn .action-label")).toHaveText("Admin");
});

test("lms login (D50): the branch is remembered and sent; no retry; Not …? forgets", async ({
  page,
}) => {
  const ok = {
    status: "ok",
    token: "tok-kid-000000000000000000000000000000000000",
    role: 3,
    branch_id: "br-a",
    branch_name: "지사A",
    display_name: "Kid",
  };
  const { sent } = await stubLms(page, {
    login: [ok, { status: "invalid" }],
  });
  await page.goto("/#login");
  await page.reload();
  await expect(page.locator("#loginBranchRemembered")).toBeHidden();
  await page.locator("#loginId").fill("kid");
  await page.locator("#loginPassword").fill("0000");
  await page.locator("#loginForm .login-submit").click();
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  expect(sent.login[0]).toEqual({ p_login_id: "kid", p_password: "0000" });
  expect(
    JSON.parse(
      await page.evaluate(() => window.localStorage.getItem("cra_lms_branch")),
    ),
  ).toEqual({ branch_id: "br-a", branch_name: "지사A" });

  // log out: the branch stays; the next login sends it
  await page.locator("#logoutBtn").click();
  await expect(page.locator("#logoutBtn")).toBeHidden(); // log out finished
  await page.goto("/#login");
  await page.reload();
  await expect(page.locator("#loginBranchRemembered")).toBeVisible();
  await expect(page.locator("#loginBranchRemembered")).toContainText("지사A");
  await expect(page.locator("#loginBranchForget")).toHaveText("Not 지사A?");
  await page.locator("#loginId").fill("kid");
  await page.locator("#loginPassword").fill("wrong");
  await page.locator("#loginForm .login-submit").click();
  await expect(page.locator("#loginError")).toHaveText(
    "Please check your ID and password.",
  );
  expect(sent.login).toHaveLength(2); // no retry without the branch
  expect(sent.login[1]).toEqual({
    p_login_id: "kid",
    p_password: "wrong",
    p_branch_id: "br-a",
  });

  await page.locator("#loginBranchForget").click();
  await expect(page.locator("#loginBranchRemembered")).toBeHidden();
  expect(
    await page.evaluate(() => window.localStorage.getItem("cra_lms_branch")),
  ).toBeNull();
});

test("lms admin: no page code calls the old member RPCs", async () => {
  for (const file of ["app.js", "lms-admin.js", "index.html"]) {
    const text = readFileSync(path.resolve(file), "utf8");
    expect(text, file).not.toMatch(
      /create_member|update_member|set_member_active|verify_member_login/,
    );
  }
});
