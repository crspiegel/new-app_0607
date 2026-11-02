import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { stubLms } from "./lms-admin-stub.mjs";
import { readFirstSheet, xlsxFile } from "./xlsx-fixtures.mjs";

// 일괄 등록 (Phase 3.4 / 3B-3): ① 회원 일괄 등록 and ② 반 배정 on the admin
// screen. Every Supabase call is answered by the in-memory LMS of
// lms-admin-stub.mjs (the RPC rules themselves are checked in SQL,
// verify-3b.sql); the .xlsx files are made with the page's own SheetJS file.
// Passwords here are fake and must never show on the page or in the console.

const MEMBER_HEAD = [
  "역할(선생님/학생)",
  "아이디",
  "비밀번호",
  "이름",
  "반(선택)",
];
const ASSIGN_HEAD = ["반", "아이디"];
const NOTE = ["※ 테스트 파일"];
const PASSWORDS = /0987|zqpw22|zqtt11|zqdu11|zqdu22|zqad11|zqad22/;

const rpcCalls = (sent, name) => sent.rpc.filter((r) => r.name === name);
const sheetRequests = (page) => {
  const seen = [];
  page.on("request", (req) => {
    if (/\/vendor\/xlsx-[\d.]+\.full\.min\.js/.test(req.url())) {
      seen.push(req.url());
    }
  });
  return seen;
};
const consoleLines = (page) => {
  const lines = [];
  page.on("console", (msg) => lines.push(msg.text()));
  return lines;
};

async function openAdmin(page) {
  await page.goto("/");
  await expect(page.locator("#adminNavBtn")).toBeVisible();
  await page.locator("#adminNavBtn").click();
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
}

async function openBulk(page) {
  await openAdmin(page);
  await page.locator('.admin-menu-btn[data-admin-view="bulk"]').click();
  await expect(page.locator("#adminViewBulk")).toBeVisible();
  await expect(page.locator("#adminTitle")).toHaveText("일괄 등록");
  await page.waitForFunction(() => Boolean(window.XLSX));
}

const memberRows = (page) => page.locator("#bulkMembersPreview .bulk-row");
const assignRows = (page) => page.locator("#bulkAssignPreview .bulk-row");

async function download(page, button) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.locator(button).click(),
  ]);
  return {
    name: file.suggestedFilename(),
    buffer: readFileSync(await file.path()),
  };
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "admin screens: desktop run");
});

test("bulk: menu for staff; the spreadsheet library loads only on this view", async ({
  page,
}) => {
  const requests = sheetRequests(page);
  await stubLms(page, { role: "branch" });
  await openAdmin(page);
  const menus = await page
    .locator(".admin-menu-btn:visible")
    .evaluateAll((els) => els.map((el) => el.dataset.adminView));
  expect(menus).toEqual(["members", "classes", "bulk"]);
  // home, 회원, 반: no request for the library
  await page.locator('.admin-menu-btn[data-admin-view="classes"]').click();
  await expect(page.locator("#adminViewClasses")).toBeVisible();
  await page.locator('.admin-menu-btn[data-admin-view="members"]').click();
  await expect(page.locator("#lmsMemberList .lms-member-row")).toHaveCount(7);
  expect(requests).toHaveLength(0);
  expect(await page.evaluate(() => typeof window.XLSX)).toBe("undefined");
  // 일괄 등록: once, from this site (no CDN), also after coming back
  await page.locator('.admin-menu-btn[data-admin-view="bulk"]').click();
  await page.waitForFunction(() => Boolean(window.XLSX));
  await page.locator('.admin-menu-btn[data-admin-view="members"]').click();
  await page.locator('.admin-menu-btn[data-admin-view="bulk"]').click();
  await expect(page.locator("#bulkMembersBox")).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).origin).toBe(new URL(page.url()).origin);
  await expect(page.locator("#bulkAssignBox")).toBeVisible();
});

test("bulk: templates — columns per role, ID and password cells formatted as text", async ({
  browser,
}) => {
  const cases = [
    ["branch", ["역할(선생님/학생)", "아이디", "비밀번호", "이름", "반(선택)"]],
    ["teacher", ["역할(학생)", "아이디", "비밀번호", "이름", "반(선택)"]],
    [
      "admin",
      ["지사", "역할(선생님/학생)", "아이디", "비밀번호", "이름", "반(선택)"],
    ],
  ];
  for (const [role, head] of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await stubLms(page, { role });
    await openBulk(page);
    const file = await download(page, "#bulkMembersTemplate");
    expect(file.name).toBe("회원_일괄등록.xlsx");
    const { XLSX, ws } = readFirstSheet(file.buffer);
    const at = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
    expect(String(at(0, 0).v)).toMatch(/^※/); // first line: how to fill it in
    expect(
      head.map((_, c) => at(1, c).v),
      role,
    ).toEqual(head);
    const idCol = head.indexOf("아이디");
    const pwCol = head.indexOf("비밀번호");
    expect(at(2, idCol).v).toBe("kim01"); // the example line
    expect(at(2, pwCol).v).toBe("0123"); // kept as text, not 123
    for (const r of [2, 3, 101]) {
      expect(at(r, idCol).z, `${role} id row ${r + 1}`).toBe("@");
      expect(at(r, pwCol).z, `${role} pw row ${r + 1}`).toBe("@");
    }
    if (role === "branch") {
      const assign = await download(page, "#bulkAssignTemplate");
      expect(assign.name).toBe("반_배정.xlsx");
      const sheet = readFirstSheet(assign.buffer);
      const cell = (r, c) => sheet.ws[sheet.XLSX.utils.encode_cell({ r, c })];
      expect([cell(1, 0).v, cell(1, 1).v]).toEqual(ASSIGN_HEAD);
      expect(cell(2, 1).z).toBe("@");
      expect(cell(501, 1).z).toBe("@");
    }
    await context.close();
  }
});

test("bulk members: a good file → preview (●●●●) → one run → result, no password shown", async ({
  page,
}) => {
  const logs = consoleLines(page);
  const { sent, data } = await stubLms(page, { role: "branch" });
  await openBulk(page);
  await page.locator("#bulkMembersFile").setInputFiles(
    xlsxFile("members.xlsx", [
      NOTE,
      MEMBER_HEAD,
      ["학생", "kim01", "0123", "김민준(예시)", ""], // the template example: skipped
      ["학생", "New1", "0987", "새학생1", "A1반"],
      ["학생", "new2", "zqpw22", "", ""],
      ["선생님", "newt1", "zqtt11", "새선생님", ""],
    ]),
  );
  const rows = memberRows(page);
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute("data-state", "new");
  await expect(rows.nth(0)).toContainText("new1"); // shown as stored (lower case)
  await expect(page.locator("#bulkMembersPreview .bulk-pw")).toHaveText([
    "●●●●",
    "●●●●",
    "●●●●",
  ]);
  await expect(page.locator("#bulkMembersSummary")).toContainText("신규 3");
  await expect(page.locator("#bulkAutoRow")).toBeHidden(); // no duplicate
  // 행 = the line in the Excel file (1 note, 2 column names, 3 the example)
  const lines = page.locator('#bulkMembersPreview td[data-colname="행"]');
  await expect(lines).toHaveText(["4행", "5행", "6행"]);
  // PC table: 행 first and narrow, the ID column well under half the width
  await expect(page.locator("#bulkMembersPreview thead th")).toHaveText([
    "행",
    "아이디",
    "비밀번호",
    "이름",
    "역할",
    "반",
  ]);
  await expect(rows.nth(0).locator("td").first()).toHaveText("4행");
  const widths = await page
    .locator("#bulkMembersPreview table")
    .evaluate((table) => ({
      table: table.getBoundingClientRect().width,
      line: table.querySelector("th").getBoundingClientRect().width,
      id: table.querySelectorAll("th")[1].getBoundingClientRect().width,
    }));
  expect(widths.line).toBeLessThanOrEqual(72);
  expect(widths.id / widths.table).toBeLessThan(0.5);
  expect(rpcCalls(sent, "lms_check_login_ids")).toHaveLength(1);
  expect(rpcCalls(sent, "lms_check_login_ids")[0].args.p_ids).toEqual([
    "new1",
    "new2",
    "newt1",
  ]);
  const run = page.locator("#bulkMembersRun");
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.locator("#bulkMembersResult .bulk-result-row")).toHaveCount(
    3,
  );
  await expect(page.locator("#bulkMembersMsg")).toContainText(
    "3명을 만들었어요",
  );
  await expect(page.locator("#bulkMembersMsg")).not.toHaveClass(/is-error/);
  await expect(
    page.locator('#bulkMembersResult td[data-colname="행"]'),
  ).toHaveText(["4행", "5행", "6행"]); // the same lines as the preview
  const calls = rpcCalls(sent, "lms_bulk_create_members");
  expect(calls).toHaveLength(1);
  expect(calls[0].args.p_auto_suffix).toBe(false);
  expect(calls[0].args.p_rows).toEqual([
    {
      login_id: "new1",
      password: "0987",
      role: 3,
      display_name: "새학생1",
      class: "A1반",
    },
    { login_id: "new2", password: "zqpw22", role: 3 },
    {
      login_id: "newt1",
      password: "zqtt11",
      role: 2,
      display_name: "새선생님",
    },
  ]);
  expect(data.members.filter((m) => /^new/.test(m.login_id))).toHaveLength(3);
  // the preview is gone after the run; nothing on the page or in the console
  // ever showed a password
  await expect(rows).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(PASSWORDS);
  expect(logs.join("\n")).not.toMatch(PASSWORDS);
});

test("bulk members: a taken ID → suggestion; runs only with the auto box", async ({
  page,
}) => {
  const { sent } = await stubLms(page, { role: "branch" });
  await openBulk(page);
  await page
    .locator("#bulkMembersFile")
    .setInputFiles(
      xlsxFile("dup.xlsx", [
        MEMBER_HEAD,
        ["학생", "s1", "zqdu11", "", ""],
        ["학생", "new3", "zqdu22", "", ""],
      ]),
    );
  const rows = memberRows(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("data-state", "dup");
  await expect(rows.nth(0)).toContainText("s12");
  await expect(rows.nth(1)).toHaveAttribute("data-state", "new");
  const run = page.locator("#bulkMembersRun");
  await expect(run).toBeDisabled();
  await expect(page.locator("#bulkAutoRow")).toBeVisible();
  await page.locator("#bulkAutoSuffix").check();
  await expect(run).toBeEnabled();
  await run.click();
  const result = page.locator("#bulkMembersResult .bulk-result-row");
  await expect(result).toHaveCount(2);
  await expect(result.nth(0)).toContainText("s12");
  await expect(result.nth(0).locator(".bulk-changed")).toContainText("s1");
  expect(rpcCalls(sent, "lms_bulk_create_members")[0].args.p_auto_suffix).toBe(
    true,
  );
  await expect(page.locator("body")).not.toContainText(PASSWORDS);
});

test("bulk members: rows with errors are marked, nothing can run", async ({
  page,
}) => {
  const { sent } = await stubLms(page, { role: "branch" });
  await openBulk(page);
  await page.locator("#bulkMembersFile").setInputFiles(
    xlsxFile("errors.xlsx", [
      NOTE,
      MEMBER_HEAD,
      ["학생", "ok1", "zqpw22", "", ""], // fine
      ["학생", "nopw", "", "", ""], // blank password
      ["학생", "Bad ID", "zqpw22", "", ""], // ID rule
      ["학생", "numpw", { n: 123 }, "", ""], // a number cell (0123 → 123)
      ["학생", { n: 4567 }, "zqpw22", "", ""], // a number cell ID
      ["학생", "ok1", "zqpw22", "", ""], // the same ID again in the file
      ["학생", "nocls", "zqpw22", "", "없는반"], // no such class
      ["관리자", "badrole", "zqpw22", "", ""], // not 선생님 / 학생
      ["선생님", "tcls", "zqpw22", "", "A1반"], // a class on a teacher row
    ]),
  );
  const rows = memberRows(page);
  await expect(rows).toHaveCount(9);
  const states = await rows.evaluateAll((els) =>
    els.map((el) => el.dataset.state),
  );
  expect(states).toEqual([
    "new",
    "error",
    "error",
    "error",
    "error",
    "error",
    "error",
    "error",
    "error",
  ]);
  await expect(rows.nth(1)).toContainText("비밀번호를 적어");
  await expect(rows.nth(2)).toContainText("아이디 규칙");
  await expect(rows.nth(3)).toContainText("셀 서식을 '텍스트'로");
  await expect(rows.nth(4)).toContainText("셀 서식을 '텍스트'로");
  await expect(rows.nth(5)).toContainText("파일 안에 같은 아이디");
  await expect(rows.nth(6)).toContainText("없는 반");
  await expect(rows.nth(7)).toContainText("역할");
  await expect(rows.nth(8)).toContainText("반은 학생만");
  await expect(page.locator("#bulkMembersSummary")).toContainText("오류 8");
  await expect(page.locator("#bulkMembersRun")).toBeDisabled();
  // the "fix the rows" line in the admin error colour, not the link blue
  const msg = page.locator("#bulkMembersMsg");
  await expect(msg).toContainText("오류가 있는 행을 고친 뒤");
  await expect(msg).toHaveClass(/is-error/);
  await expect(msg).toHaveCSS("color", "rgb(179, 45, 46)"); // --adm-danger
  // only the good row was checked on the server; nothing was sent to run
  expect(rpcCalls(sent, "lms_check_login_ids")[0].args.p_ids).toEqual(["ok1"]);
  expect(rpcCalls(sent, "lms_bulk_create_members")).toHaveLength(0);
});

test("bulk members: too many rows, too big, not .xlsx → refused before anything is sent", async ({
  page,
}) => {
  const { sent } = await stubLms(page, { role: "branch" });
  await openBulk(page);
  // the page's one client limit (lms-bulk.js, a script-level const)
  // eslint-disable-next-line no-undef
  const max = await page.evaluate(() => BULK_MAX_ROWS);
  expect(max).toBeGreaterThan(0);
  expect(max).toBeLessThanOrEqual(500);
  const many = (n) =>
    xlsxFile(`rows-${n}.xlsx`, [
      MEMBER_HEAD,
      ...Array.from({ length: n }, (_, i) => [
        "학생",
        `m${i + 1}`,
        "zqpw22",
        "",
        "",
      ]),
    ]);
  const message = page.locator("#bulkMembersMsg");
  // one row over the client limit, and over the server's 500
  for (const n of [max + 1, 501]) {
    await page.locator("#bulkMembersFile").setInputFiles(many(n));
    await expect(message).toContainText(`${max}행씩 나눠 올려 주세요`);
    await expect(memberRows(page)).toHaveCount(0);
    await expect(page.locator("#bulkMembersRun")).toBeDisabled();
  }
  // exactly at the limit: a preview
  await page.locator("#bulkMembersFile").setInputFiles(many(max));
  await expect(memberRows(page)).toHaveCount(max);
  await page.locator("#bulkMembersFile").setInputFiles({
    name: "big.xlsx",
    mimeType: "application/octet-stream",
    buffer: Buffer.alloc(1024 * 1024 + 1),
  });
  await expect(message).toContainText("1MB");
  await expect(memberRows(page)).toHaveCount(0);
  await page.locator("#bulkMembersFile").setInputFiles({
    name: "members.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("역할,아이디\n학생,a1\n"),
  });
  await expect(message).toContainText(".xlsx");
  expect(rpcCalls(sent, "lms_bulk_create_members")).toHaveLength(0);
  // only the file at the limit was checked
  expect(rpcCalls(sent, "lms_check_login_ids")).toHaveLength(1);
});

test("bulk members: one bad row on the server → nothing is made, every reason shown", async ({
  page,
}) => {
  const { sent, data } = await stubLms(page, { role: "branch" });
  await openBulk(page);
  await page
    .locator("#bulkMembersFile")
    .setInputFiles(
      xlsxFile("race.xlsx", [
        MEMBER_HEAD,
        ["학생", "race1", "zqpw22", "", ""],
        ["학생", "race2", "zqpw22", "", ""],
      ]),
    );
  await expect(memberRows(page)).toHaveCount(2);
  // someone makes race2 between the preview and the run
  data.members.push({
    member_id: "m-race",
    login_id: "race2",
    role: 3,
    branch_id: "br-a",
    display_name: null,
    active: true,
    locked_until: null,
  });
  const before = data.members.length;
  await page.locator("#bulkMembersRun").click();
  const result = page.locator("#bulkMembersResult .bulk-result-row");
  await expect(result).toHaveCount(2);
  await expect(result.nth(1)).toHaveAttribute("data-result", "error");
  await expect(result.nth(1)).toContainText("이미 있는 아이디");
  await expect(page.locator("#bulkMembersMsg")).toContainText(
    "아무것도 만들지 않았어요",
  );
  expect(data.members.length).toBe(before);
  expect(rpcCalls(sent, "lms_bulk_create_members")).toHaveLength(1);
});

test("bulk members: a file dropped on the box works like a picked one", async ({
  page,
}) => {
  await stubLms(page, { role: "branch" });
  await openBulk(page);
  const file = xlsxFile("drop.xlsx", [
    MEMBER_HEAD,
    ["학생", "drop1", "zqpw22", "", ""],
  ]);
  const dataTransfer = await page.evaluateHandle(
    ({ b64, name, type }) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type }));
      return dt;
    },
    {
      b64: file.buffer.toString("base64"),
      name: file.name,
      type: file.mimeType,
    },
  );
  await page
    .locator("#bulkMembersDrop")
    .dispatchEvent("dragover", { dataTransfer });
  await page
    .locator("#bulkMembersDrop")
    .dispatchEvent("drop", { dataTransfer });
  await expect(memberRows(page)).toHaveCount(1);
  await expect(page.locator("#bulkMembersFileName")).toHaveText("drop.xlsx");
});

test("bulk: a teacher — student rows only, its own classes only", async ({
  page,
}) => {
  const { sent } = await stubLms(page, { role: "teacher" });
  await openBulk(page);
  await expect(page.locator("#bulkMembersBox")).toContainText("학생만");
  await page.locator("#bulkMembersFile").setInputFiles(
    xlsxFile("teacher.xlsx", [
      ["역할(학생)", "아이디", "비밀번호", "이름", "반(선택)"],
      ["선생님", "tnew", "zqpw22", "", ""],
      ["학생", "snew1", "zqpw22", "", "A2반"],
      ["학생", "snew2", "zqpw22", "", "A1반"],
    ]),
  );
  const rows = memberRows(page);
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute("data-state", "error");
  await expect(rows.nth(0)).toContainText("학생만 만들 수 있어요");
  await expect(rows.nth(1)).toHaveAttribute("data-state", "error");
  await expect(rows.nth(1)).toContainText("내 반이 아니에요");
  await expect(rows.nth(2)).toHaveAttribute("data-state", "new");
  await expect(page.locator("#bulkMembersRun")).toBeDisabled();
  expect(rpcCalls(sent, "lms_check_login_ids")[0].args).toEqual({
    p_ids: ["snew2"],
    p_role: 3,
  });
});

test("bulk assign: a teacher moves its own students (D56), another teacher's student is refused", async ({
  page,
}) => {
  const { sent, data } = await stubLms(page, {
    role: "teacher",
    classes: [
      {
        id: "c-a3",
        branch_id: "br-a",
        name: "A3반",
        teacher_id: "m-ta1",
        active: true,
      },
    ],
    // kim: in A1 (its own) and A2 (teacher 2's) — the page cannot see A2
    classMembers: [
      { class_id: "c-a1", member_id: "m-kim" },
      { class_id: "c-a2", member_id: "m-kim" },
    ],
  });
  await openBulk(page);
  await expect(page.locator("#bulkAssignBranchRow")).toBeHidden();
  const classesOf = (memberId) =>
    data.classMembers
      .filter((cm) => cm.member_id === memberId)
      .map((cm) => cm.class_id)
      .sort();
  const upload = (rows) =>
    page
      .locator("#bulkAssignFile")
      .setInputFiles(xlsxFile("assign.xlsx", [NOTE, ASSIGN_HEAD, ...rows]));

  // s2 is in A2 (another teacher's): refused in the preview already
  await upload([
    ["A3반", "s1"],
    ["A1반", "s3"],
    ["A3반", "s2"],
    ["A2반", "s3"],
  ]);
  const rows = assignRows(page);
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toHaveAttribute("data-state", "move");
  await expect(rows.nth(0)).toContainText("A1반");
  await expect(rows.nth(1)).toHaveAttribute("data-state", "add");
  await expect(rows.nth(2)).toHaveAttribute("data-state", "error");
  await expect(rows.nth(2)).toContainText("다른 선생님 반");
  await expect(rows.nth(3)).toHaveAttribute("data-state", "error");
  await expect(rows.nth(3)).toContainText("내 반이 아니에요");
  await expect(page.locator("#bulkAssignRun")).toBeDisabled();
  await expect(page.locator("#bulkAssignMsg")).toHaveCSS(
    "color",
    "rgb(179, 45, 46)",
  );
  await expect(page.locator("#bulkAssignPreview thead th")).toHaveText([
    "행",
    "아이디",
    "반",
  ]);
  await expect(
    page.locator('#bulkAssignPreview td[data-colname="행"]'),
  ).toHaveText(["3행", "4행", "5행", "6행"]);

  // kim looks movable here, but the server finds A2 → nothing changes
  await upload([
    ["A3반", "s1"],
    ["A3반", "kim"],
  ]);
  await expect(rows).toHaveCount(2);
  await page.locator("#bulkAssignRun").click();
  const result = page.locator("#bulkAssignResult .bulk-result-row");
  await expect(result).toHaveCount(2);
  await expect(result.nth(1)).toHaveAttribute("data-result", "error");
  await expect(result.nth(1)).toContainText("다른 선생님 반");
  await expect(page.locator("#bulkAssignMsg")).toContainText(
    "아무것도 바꾸지 않았어요",
  );
  expect(classesOf("m-s1")).toEqual(["c-a1"]);

  // only its own students: s1 moves A1 → A3, s3 goes into A1
  await upload([
    ["A3반", "s1"],
    ["A1반", "s3"],
  ]);
  await expect(rows).toHaveCount(2);
  await page.locator("#bulkAssignRun").click();
  await expect(page.locator("#bulkAssignMsg")).toContainText("2명");
  expect(classesOf("m-s1")).toEqual(["c-a3"]);
  expect(classesOf("m-s3")).toEqual(["c-a1"]);
  const calls = rpcCalls(sent, "lms_bulk_assign");
  expect(calls).toHaveLength(2);
  expect(calls[1].args).toEqual({
    p_rows: [
      { class: "A3반", login_id: "s1" },
      { class: "A1반", login_id: "s3" },
    ],
  });
});

test("bulk: the top admin — a 지사 column, one ID check per branch, assign needs a branch", async ({
  page,
}) => {
  const { sent } = await stubLms(page, { role: "admin" });
  await openBulk(page);
  await page.locator("#bulkMembersFile").setInputFiles(
    xlsxFile("admin.xlsx", [
      ["지사", ...MEMBER_HEAD],
      ["지사A", "학생", "adm1", "zqad11", "", "A1반"],
      ["지사B", "선생님", "adm2", "zqad22", "", ""],
      ["없는지사", "학생", "adm3", "zqad22", "", ""],
    ]),
  );
  const rows = memberRows(page);
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toHaveAttribute("data-state", "error");
  await expect(rows.nth(2)).toContainText("없는 지사");
  const checks = rpcCalls(sent, "lms_check_login_ids").map((c) => c.args);
  expect(checks).toEqual(
    expect.arrayContaining([
      { p_ids: ["adm1"], p_role: 3, p_branch_id: "br-a" },
      { p_ids: ["adm2"], p_role: 3, p_branch_id: "br-b" },
    ]),
  );
  expect(checks).toHaveLength(2);

  // 반 배정: the admin picks the branch first
  await expect(page.locator("#bulkAssignBranchRow")).toBeVisible();
  const upload = () =>
    page
      .locator("#bulkAssignFile")
      .setInputFiles(xlsxFile("assign.xlsx", [ASSIGN_HEAD, ["B반", "sb"]]));
  await upload();
  await expect(page.locator("#bulkAssignMsg")).toContainText(
    "지사를 먼저 고르세요",
  );
  await expect(assignRows(page)).toHaveCount(0);
  await page.locator("#bulkAssignBranch").selectOption("br-b");
  await upload();
  await expect(assignRows(page)).toHaveCount(1);
  await expect(assignRows(page).nth(0)).toHaveAttribute("data-state", "same");
  await page.locator("#bulkAssignRun").click();
  await expect(page.locator("#bulkAssignResult .bulk-result-row")).toHaveCount(
    1,
  );
  expect(rpcCalls(sent, "lms_bulk_assign")[0].args.p_branch_id).toBe("br-b");
});

test("bulk: phone width — tables fold, run stays reachable, no sideways page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await stubLms(page, { role: "branch" });
  await openAdmin(page);
  await page.evaluate(() => window.setAdminView("bulk"));
  await page.waitForFunction(() => Boolean(window.XLSX));
  await page
    .locator("#bulkMembersFile")
    .setInputFiles(
      xlsxFile("phone.xlsx", [
        MEMBER_HEAD,
        ["학생", "ph1", "zqpw22", "폰학생", "A1반"],
        ["학생", "s1", "zqpw22", "", ""],
      ]),
    );
  const row = memberRows(page).first();
  await expect(row).toBeVisible();
  // folded: the other columns show after the row's fold-out button
  await expect(row.locator('td[data-colname="반"]')).toBeHidden();
  await row.locator(".adm-row-toggle").click();
  await expect(row.locator('td[data-colname="반"]')).toBeVisible();
  // the card still starts with the ID block; 행 opens first under it
  const top = async (sel) => (await row.locator(sel).boundingBox()).y;
  const idTop = await top("td.adm-col-primary");
  const lineTop = await top('td[data-colname="행"]');
  const classTop = await top('td[data-colname="반"]');
  expect(idTop).toBeLessThan(lineTop);
  expect(lineTop).toBeLessThan(classTop);
  await page.locator("#bulkAutoSuffix").check();
  const run = page.locator("#bulkMembersRun");
  await run.scrollIntoViewIfNeeded();
  await expect(run).toBeEnabled();
  const box = await run.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
});
