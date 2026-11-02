import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Teacher resources (B, 2026-10-29): the '교사 자료실' button on each level's
// month page, the per-level resource page and the admin upload section in
// the 배너 tab. Every Supabase request is answered here (REST, RPC, auth,
// storage) — the live project is never reached. The RPC answers mirror
// supabase/migration.sql "Teacher resources" (tests/teacher-resources-sql.spec.js
// checks the SQL side of the same contract).

const SUPABASE = /^https:\/\/[^/]+\.supabase\.co\//;
const BUTTON = "교사 자료실";
const NEED_LOGIN = "다시 로그인해 주세요.";
const FAILED = "내려받지 못했어요. 잠시 후 다시 시도해 주세요.";
const LIMIT =
  "오늘 다운로드 횟수를 모두 사용했습니다. 내일 다시 시도해 주세요.";
const NOT_READY = "아직 준비 중이에요.";
const FN_PATH = "/functions/v1/teacher-resource-download";
const PLAN_NAME = "2026 Beginner 연간 교육안.pdf";
const PLAN_PATH = "beginner/plan/1730000000001.pdf";
const BLANK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const ROLE_SESSION = {
  branch: { role: 1, branch_name: "TPS 본사", display_name: "지사" },
  teacher: { role: 2, branch_name: "TPS 본사", display_name: "선생님" },
  student: { role: 3, branch_name: "TPS 본사", display_name: "Kid" },
};
const TOKEN = "tok-test-00000000000000000000000000000000000";

// D64 (2026-11-02): a slot may hold a Google Drive file instead — only its ID
// is stored. Every Google request is answered here too (none leaves the test).
const GOOGLE = /^https:\/\/(drive|docs)\.google\.com\//;
const DRIVE_A = "1AbC-dEf_GhIjKlMnOpQrStUvWxYz012";
const DRIVE_B = "0B9xYzAbCdEfGhIjKlMnOpQrStU";
const driveDownload = (id) =>
  `https://drive.google.com/uc?export=download&id=${id}`;
const driveView = (id) => `https://drive.google.com/file/d/${id}/view`;
const DRIVE_HELP =
  "구글 드라이브 → 공유 → '링크가 있는 모든 사용자' → 링크 복사 후 붙여 넣기";
const DRIVE_DOCS =
  "PDF나 엑셀 파일로 드라이브에 올린 뒤 그 파일 링크를 넣어 주세요";
const DRIVE_BAD = "구글 드라이브 파일 링크만 넣을 수 있어요.";

// The resource list per level as teacher_resources_list returns it. A file
// may say `updated: null` (or a time) to test the date; default 10/29 KST.
// `{ drive: <ID> }` is a Google Drive slot (D64: no file name, no size).
function listFor(level, files = {}) {
  const slots =
    level === "level-2" || level === "level-3"
      ? ["monthly", "plan", "award", "test"]
      : ["monthly", "plan", "award"];
  return slots.map((slot) => {
    const file = files[`${level}/${slot}`];
    const drive = file?.drive ?? null;
    return {
      slot,
      file_name: drive ? null : (file?.name ?? null),
      file_size: drive ? null : (file?.size ?? null),
      updated_at: !file
        ? null
        : file.updated === undefined
          ? "2026-10-29T03:00:00Z"
          : file.updated,
      drive_id: drive,
    };
  });
}

// A slot's card on the resource page (D58: a card, its 내려받기 button only
// when a file is there, else a notice that is not a button).
const card = (page, slot) =>
  page.locator(`#resourceGrid .res-card[data-slot="${slot}"]`);
const EMPTY_TEXT = "아직 올라온 자료가 없어요";

function fakeJwt(sub) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", exp })}.sig`;
}

// Answers every Supabase call. `role` seeds a signed-in LMS member (restored
// through lms_session) — or "admin" for an admin JWT session, or null.
async function stubSupabase(
  page,
  {
    role = null,
    files = { [`beginner/plan`]: { name: PLAN_NAME, size: 4404019 } },
    fn = "ok", // the Edge Function's answer: ok | denied | empty | limit | abort
    setAnswer = () => null,
    setDriveAnswer = () => null,
    clearAnswer = () => null,
    adminLogin = false,
  } = {},
) {
  const sent = {
    rpc: [],
    storage: [],
    tokens: [],
    downloads: [],
    fn: [],
    google: [],
  };
  // Google (D64): a new tab opened on a Drive link lands here, never online.
  await page.context().route(GOOGLE, (route) => {
    sent.google.push(route.request().url());
    return route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Google (test)</title>",
    });
  });
  await page.addInitScript(
    ({ role, token, session }) => {
      try {
        localStorage.setItem("cra:dev-live", "1");
        if (role && role !== "admin" && !sessionStorage.getItem("seeded")) {
          sessionStorage.setItem("seeded", "1");
          localStorage.setItem(
            "cra_lms",
            JSON.stringify({ token, role: session.role }),
          );
        }
      } catch {
        /* offline */
      }
    },
    { role, token: TOKEN, session: ROLE_SESSION[role] || {} },
  );
  let adminSignedIn = role === "admin";
  await page.route(SUPABASE, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const lmsToken = request.headers()["x-lms-token"] ?? null;
    sent.tokens.push({ path: pathname, token: lmsToken });
    if (pathname.startsWith("/rest/v1/rpc/")) {
      const name = pathname.slice("/rest/v1/rpc/".length);
      const args = request.postDataJSON() || {};
      sent.rpc.push({ name, args, token: lmsToken });
      if (name === "lms_session") {
        return route.fulfill({ json: ROLE_SESSION[role] ?? null });
      }
      if (name === "lms_login") {
        return route.fulfill({
          json: { status: "ok", token: TOKEN, ...ROLE_SESSION.teacher },
        });
      }
      if (name === "lms_logout")
        return route.fulfill({ status: 204, body: "" });
      if (name === "is_admin") return route.fulfill({ json: adminSignedIn });
      if (name === "teacher_resources_list") {
        return route.fulfill({ json: listFor(args.p_level, files) });
      }
      if (name === "teacher_resource_set") {
        return route.fulfill({ json: setAnswer(args) });
      }
      if (name === "teacher_resource_set_drive") {
        return route.fulfill({ json: setDriveAnswer(args) });
      }
      if (name === "teacher_resource_clear") {
        return route.fulfill({ json: clearAnswer(args) });
      }
      return route.fulfill({ json: null });
    }
    // The Edge Function (supabase/functions/teacher-resource-download):
    // answers like the real one (tests/teacher-resource-download.spec.js).
    if (pathname === FN_PATH) {
      const body = request.postDataJSON() || {};
      sent.fn.push({
        body,
        token: lmsToken,
        authorization: request.headers()["authorization"] ?? null,
      });
      if (fn === "abort") return route.abort();
      const status = { denied: 401, empty: 404, limit: 429 }[fn];
      if (status) return route.fulfill({ status, json: { error: fn } });
      const name = files[`${body.level}/${body.slot}`]?.name ?? "file.pdf";
      return route.fulfill({
        json: {
          url: `${url.origin}/storage/v1/object/sign/teacher-resources/${PLAN_PATH}?token=signed-1&download=${encodeURIComponent(name)}`,
        },
      });
    }
    if (pathname.startsWith("/auth/v1/token") && adminLogin) {
      adminSignedIn = true;
      const now = Math.floor(Date.now() / 1000);
      return route.fulfill({
        json: {
          access_token: fakeJwt("admin-uid"),
          token_type: "bearer",
          expires_in: 3600,
          expires_at: now + 3600,
          refresh_token: "refresh",
          user: {
            id: "admin-uid",
            email: "admin@example.com",
            aud: "authenticated",
          },
        },
      });
    }
    if (pathname.startsWith("/auth/v1/logout")) {
      adminSignedIn = false;
      return route.fulfill({ status: 204, body: "" });
    }
    if (pathname.startsWith("/auth/v1/")) {
      return route.fulfill({ status: 400, json: { error: "invalid_grant" } });
    }
    if (pathname.startsWith("/storage/v1/object/sign/teacher-resources/")) {
      if (request.method() === "POST") {
        // (나): only the Edge Function signs — a browser POST here is a bug.
        sent.storage.push({ op: "sign", path: pathname, token: lmsToken });
        return route.fulfill({ status: 403, json: { error: "no" } });
      }
      // The signed GET: the browser follows the hidden link here.
      sent.downloads.push({
        download: url.searchParams.get("download"),
        token: url.searchParams.get("token"),
      });
      const name = url.searchParams.get("download") || "file.pdf";
      return route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        },
        body: "%PDF-1.4 test",
      });
    }
    if (pathname.startsWith("/storage/v1/object/teacher-resources")) {
      const method = request.method();
      sent.storage.push({
        op: method === "DELETE" ? "remove" : "upload",
        path: pathname,
        body: method === "DELETE" ? request.postDataJSON() : null,
        contentType:
          method === "DELETE" ? null : request.headers()["content-type"],
      });
      return route.fulfill({ json: method === "DELETE" ? [] : { Key: "k" } });
    }
    if (pathname.startsWith("/storage/v1/object/list")) {
      return route.fulfill({ json: [] });
    }
    if (pathname.startsWith("/storage/")) {
      return route.fulfill({ contentType: "image/png", body: BLANK_PNG });
    }
    return route.fulfill({ json: [] });
  });
  if (role === "admin") {
    // An admin session restored on load (the JWT itself is never verified
    // client-side; is_admin answers true).
    await page.addInitScript((jwt) => {
      const key = Object.keys(localStorage).find((k) =>
        k.endsWith("-auth-token"),
      );
      if (!key) {
        const ref = /https:\/\/([^.]+)\./.exec(window.SUPABASE_URL || "") || [];
        const now = Math.floor(Date.now() / 1000);
        localStorage.setItem(
          `sb-${ref[1] || "jguuexcgyvyljbcqfpib"}-auth-token`,
          JSON.stringify({
            access_token: jwt,
            token_type: "bearer",
            expires_in: 3600,
            expires_at: now + 3600,
            refresh_token: "refresh",
            user: { id: "admin-uid", aud: "authenticated" },
          }),
        );
      }
    }, fakeJwt("admin-uid"));
  }
  return sent;
}

async function openMonths(page, level = "beginner") {
  await page.goto(`/#months/${level}`);
  await expect(page.locator("#monthScreen")).toHaveClass(/screen-active/);
}

test("resources: the button shows for admin, branch and teacher only", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000); // five fresh browser sessions in one test
  const visibleFor = async (role) => {
    const context = await browser.newContext({
      viewport: page.viewportSize(),
    });
    const tab = await context.newPage();
    const sent = await stubSupabase(tab, { role });
    await openMonths(tab);
    await tab.waitForFunction(() => window.craTeacherRes?.ready);
    const visible = await tab.getByRole("button", { name: BUTTON }).isVisible();
    await context.close();
    return { visible, sent };
  };
  expect((await visibleFor(null)).visible).toBe(false);
  expect((await visibleFor("student")).visible).toBe(false);
  expect((await visibleFor("teacher")).visible).toBe(true);
  expect((await visibleFor("branch")).visible).toBe(true);
  expect((await visibleFor("admin")).visible).toBe(true);
});

test("resources: logging in and out flips the button without a reload", async ({
  page,
}) => {
  await stubSupabase(page, { adminLogin: true });
  await openMonths(page, "level-1");
  const button = page.getByRole("button", { name: BUTTON });
  await expect(button).toBeHidden();
  // A reload would wipe this marker — it must survive every step below.
  const marker = await page.evaluate(() => (window.__noReload = 1));

  // Teacher (LMS) login → back to the month page: the button is there.
  await page.locator(".login-button").click();
  await page.locator("#loginId").fill("teacher1");
  await page.locator("#loginPassword").fill("pw");
  await page.locator("#loginForm .login-submit").click();
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await page.locator('#levelSection [data-level="level-1"]').click();
  await expect(button).toBeVisible();
  await page.locator("#logoutBtn").click();
  await page.locator('#levelSection [data-level="level-1"]').click();
  await expect(button).toBeHidden();

  // Admin (e-mail) login: same, no reload in between.
  await page.locator(".login-button").click();
  await page.locator("#loginId").fill("admin@example.com");
  await page.locator("#loginPassword").fill("pw");
  await page.locator("#loginForm .login-submit").click();
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
  // the admin screen hides the site header (3B-2b): back via 사이트 보기
  await page.locator("#adminSiteBtn").click();
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await page.locator('#levelSection [data-level="level-1"]').click();
  await expect(button).toBeVisible();
  expect(await page.evaluate(() => window.__noReload)).toBe(marker);
});

test("resources: the button sits on the title row (right) or under it (phone)", async ({
  page,
}) => {
  await stubSupabase(page, { role: "teacher" });
  await openMonths(page);
  const button = page.getByRole("button", { name: BUTTON });
  await expect(button).toBeVisible();
  const box = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect().toJSON();
    // The title exactly where a visitor without the button sees it.
    document.body.classList.remove("can-teacher-res");
    const titleAlone = r("#monthLevelTag");
    document.body.classList.add("can-teacher-res");
    return {
      titleAlone,
      title: r("#monthLevelTag"),
      button: r("#teacherResBtn"),
      grid: r("#monthGrid"),
      width: window.innerWidth,
    };
  });
  expect(box.title.left).toBeCloseTo(box.titleAlone.left, 1);
  expect(box.title.top).toBeCloseTo(box.titleAlone.top, 1);
  if (box.width >= 768) {
    // Same row, right end (the title stays centred).
    const middle = (b) => b.top + b.height / 2;
    expect(Math.abs(middle(box.button) - middle(box.title))).toBeLessThan(4);
    expect(box.button.left).toBeGreaterThan(box.title.right);
    expect(Math.abs(box.button.right - box.grid.right)).toBeLessThan(40);
  } else {
    // Phones: the title is left-aligned there — the button goes under it,
    // on the same left edge, above the month grid.
    expect(box.button.top).toBeGreaterThanOrEqual(box.title.bottom);
    expect(Math.abs(box.button.left - box.title.left)).toBeLessThan(2);
    expect(box.button.bottom).toBeLessThan(box.grid.top);
  }
  expect(box.button.height).toBeGreaterThanOrEqual(44);
});

test("resources: each level's page has its fixed buttons; empty = 준비 중", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "content only, run once");
  const sent = await stubSupabase(page, {
    role: "teacher",
    files: {
      "beginner/plan": { name: PLAN_NAME, size: 4404019 },
      "level-2/test": { name: "Level 2 테스트.xlsx", size: 51200 },
    },
  });
  const expected = {
    // D63: 월간교육안 (monthly) · 연간교육안 (plan, the old 월간.연간교육안)
    beginner: ["월간교육안", "연간교육안", "상장"],
    "level-1": ["월간교육안", "연간교육안", "상장"],
    "level-2": ["월간교육안", "연간교육안", "상장", "테스트"],
    "level-3": ["월간교육안", "연간교육안", "상장", "테스트"],
  };
  const labels = {
    beginner: "Beginner",
    "level-1": "Level 1",
    "level-2": "Level 2",
    "level-3": "Level 3",
  };
  for (const [level, names] of Object.entries(expected)) {
    await page.goto("about:blank");
    await openMonths(page, level);
    await page.getByRole("button", { name: BUTTON }).click();
    await expect(page).toHaveURL(new RegExp(`#resources/${level}$`));
    // The month page itself, its 3~12월 buttons swapped for the downloads.
    await expect(page.locator("body")).toHaveAttribute(
      "data-screen",
      "resources",
    );
    const screen = page.locator("#monthScreen");
    await expect(screen).toHaveClass(/screen-active/);
    await expect(screen).toHaveClass(new RegExp(`level-theme-${level}`));
    await expect(page.locator("#monthLevelTag")).toHaveText(labels[level]);
    await expect(page.locator("#monthGrid")).toBeHidden();
    await expect(page.getByRole("button", { name: BUTTON })).toBeHidden();
    const cards = page.locator("#resourceGrid .res-card");
    await expect(cards).toHaveCount(names.length);
    await expect(cards.locator(".res-name")).toHaveText(names);
  }
  // level-3 has no files: every card a notice (준비 중), no button at all
  const empty = page.locator("#resourceGrid .res-card");
  for (let i = 0; i < 4; i += 1) {
    await expect(empty.nth(i)).toHaveAttribute("data-state", "empty");
    await expect(empty.nth(i).locator(".res-meta")).toHaveText("준비 중");
    await expect(empty.nth(i).locator(".res-empty")).toHaveText(EMPTY_TEXT);
    await expect(empty.nth(i).locator("button")).toHaveCount(0);
  }
  // level-2: the filled test slot is an Excel card with its button, the rest
  // notices
  await page.goto("about:blank");
  await page.goto("/#resources/level-2");
  const test2 = card(page, "test");
  await expect(test2.locator(".res-download")).toBeEnabled();
  await expect(test2.locator(".res-icon")).toHaveAttribute(
    "data-kind",
    "excel",
  );
  await expect(test2.locator(".res-meta")).toHaveText(
    "엑셀 · 50KB · 10/29 업데이트",
  );
  await expect(card(page, "plan").locator(".res-download")).toHaveCount(0);
  await expect(card(page, "plan").locator(".res-empty")).toHaveText(EMPTY_TEXT);
  expect(
    sent.rpc
      .filter((r) => r.name === "teacher_resources_list")
      .map((r) => r.token),
  ).not.toContain(null);
  // ◂ 월 선택 goes back to the month page of the same level
  await page.getByRole("button", { name: "월 선택" }).click();
  await expect(page).toHaveURL(/#months\/level-2$/);
  await expect(page.locator("body")).toHaveAttribute("data-screen", "months");
  await expect(page.locator("#monthGrid .month-button")).toHaveCount(10);
  await expect(page.locator("#resourceGrid")).toBeHidden();
});

test("resources: a download stays in this tab and keeps the Korean name", async ({
  page,
  context,
}) => {
  const sent = await stubSupabase(page, { role: "teacher" });
  await page.goto("/#resources/beginner");
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "resources",
  );
  const plan = card(page, "plan");
  await expect(plan.locator(".res-icon")).toHaveAttribute("data-kind", "pdf");
  await expect(plan.locator(".res-meta")).toHaveText(
    "PDF · 4.2MB · 10/29 업데이트",
  );
  const urlBefore = page.url();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "연간교육안 내려받기", exact: true })
      .click(),
  ]);
  expect(download.suggestedFilename()).toBe(PLAN_NAME);
  expect(context.pages()).toHaveLength(1);
  expect(page.url()).toBe(urlBefore);
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "resources",
  );
  // One Edge Function call (level + slot only, with the LMS token) → its
  // 15 s URL, followed in this tab. The browser itself never signs.
  expect(sent.fn).toEqual([
    {
      body: { level: "beginner", slot: "plan" },
      token: TOKEN,
      authorization: expect.stringMatching(/^Bearer /),
    },
  ]);
  expect(sent.storage).toEqual([]);
  expect(sent.rpc.map((r) => r.name)).not.toContain("teacher_resource_file");
  expect(sent.downloads).toEqual([{ download: PLAN_NAME, token: "signed-1" }]);
  await expect(page.locator("#resourceStatus")).toHaveText("");
});

test("resources: failed downloads say so and never leave the page", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "behaviour only, run once");
  const cases = [
    [{ fn: "denied" }, NEED_LOGIN],
    [{ fn: "limit" }, LIMIT],
    [{ fn: "empty" }, NOT_READY],
    [{ fn: "abort" }, FAILED],
  ];
  for (const [options, message] of cases) {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    const sent = await stubSupabase(page, { role: "teacher", ...options });
    await page.goto("about:blank");
    await page.goto("/#resources/beginner");
    const plan = card(page, "plan").locator(".res-download");
    await expect(plan).toBeEnabled();
    await plan.click();
    await expect(page.locator("#resourceStatus")).toHaveText(message);
    await expect(page).toHaveURL(/#resources\/beginner$/);
    expect(sent.downloads).toEqual([]);
    expect(context.pages()).toHaveLength(1);
  }
});

test("resources: a direct link without permission lands on the month page", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "routing only, run once");
  for (const role of [null, "student", "teacher"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await stubSupabase(page, { role });
    await page.goto("/#resources/level-1");
    if (role === "teacher") {
      await expect(page.locator("body")).toHaveAttribute(
        "data-screen",
        "resources",
      );
      await expect(page).toHaveURL(/#resources\/level-1$/);
    } else {
      await expect(page).toHaveURL(/#months\/level-1$/);
      await expect(page.locator("#monthScreen")).toHaveClass(/screen-active/);
      await expect(page.locator("body")).toHaveAttribute(
        "data-screen",
        "months",
      );
      await expect(page.locator("#resourceGrid")).toBeHidden();
    }
    await context.close();
  }
});

test("resources: a reload or bookmark reopens the same resource page", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "routing only, run once");
  await stubSupabase(page, { role: "teacher" });
  await page.goto("/#months/level-2");
  await page.getByRole("button", { name: BUTTON }).click();
  await expect(page).toHaveURL(/#resources\/level-2$/);
  await page.reload();
  await expect(page).toHaveURL(/#resources\/level-2$/);
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "resources",
  );
  await expect(page.locator("#monthLevelTag")).toHaveText("Level 2");
  await expect(page.locator("#resourceGrid .res-card")).toHaveCount(4);
  // a bookmark = a fresh browser session opened on that address
  const context = await browser.newContext();
  const tab = await context.newPage();
  await stubSupabase(tab, { role: "teacher" });
  await tab.goto("/#resources/level-3");
  await expect(tab.locator("body")).toHaveAttribute("data-screen", "resources");
  await expect(tab.locator("#monthLevelTag")).toHaveText("Level 3");
  await context.close();
});

test("resources: the LMS token rides on the download function only", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "wrapper only, run once");
  const sent = await stubSupabase(page, { role: "teacher" });
  await page.goto("/");
  await page.waitForFunction(() => window.craTeacherRes?.ready);
  await page.evaluate(async () => {
    const base = window.SUPABASE_URL;
    for (const url of [
      `${base}/functions/v1/teacher-resource-download`,
      `${base}/functions/v1/other-function`,
      `${base}/functions/v1/teacher-resource-download-v2`, // exact name only
      `${base}/storage/v1/object/sign/teacher-resources/beginner/plan/1.pdf`,
      `${base}/storage/v1/object/sign/covers/x.png`,
      `${base}/storage/v1/object/public/covers/x.png`,
      `${base}/storage/v1/object/teacher-resources/beginner/plan/1.pdf`,
    ]) {
      await lmsFetch(url, { method: "POST", body: "{}" }).catch(() => {});
    }
  });
  const tokenOf = (path) => {
    const hit = sent.tokens.find((r) => r.path === path);
    return hit ? hit.token : "missing"; // null = sent without a token
  };
  expect(tokenOf(FN_PATH)).toBe(TOKEN);
  expect(tokenOf("/functions/v1/other-function")).toBeNull();
  expect(tokenOf("/functions/v1/teacher-resource-download-v2")).toBeNull();
  expect(
    tokenOf("/storage/v1/object/sign/teacher-resources/beginner/plan/1.pdf"),
  ).toBeNull(); // (가) is gone: Storage never sees the LMS token
  expect(tokenOf("/storage/v1/object/sign/covers/x.png")).toBeNull();
  expect(tokenOf("/storage/v1/object/public/covers/x.png")).toBeNull();
  expect(
    tokenOf("/storage/v1/object/teacher-resources/beginner/plan/1.pdf"),
  ).toBeNull();
});

// ---- D58 design (2026-11-02): cards, icons, meta line, layout ------------

test("resources: PDF and Excel icons differ; a missing size or date is just left out", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "content only, run once");
  await stubSupabase(page, {
    role: "teacher",
    files: {
      "level-2/plan": { name: "교육안.pdf", size: null, updated: null },
      "level-2/award": {
        name: "상장.xls",
        size: 860160,
        updated: "2026-11-02T03:00:00Z",
      },
      "level-2/test": { name: "테스트.xlsx", size: 1258291, updated: null },
    },
  });
  await page.goto("/#resources/level-2");
  await expect(card(page, "plan").locator(".res-meta")).toHaveText("PDF");
  await expect(card(page, "award").locator(".res-meta")).toHaveText(
    "엑셀 · 840KB · 11/02 업데이트",
  );
  await expect(card(page, "test").locator(".res-meta")).toHaveText(
    "엑셀 · 1.2MB",
  );
  const icon = (slot) => card(page, slot).locator(".res-icon");
  await expect(icon("plan")).toHaveAttribute("data-kind", "pdf");
  await expect(icon("award")).toHaveAttribute("data-kind", "excel");
  await expect(icon("plan").locator(".res-icon-label")).toHaveText("PDF");
  await expect(icon("award").locator(".res-icon-label")).toHaveText("XLS");
  // drawn differently, not only labelled
  const drawn = (slot) => icon(slot).locator("svg").innerHTML();
  expect(await drawn("plan")).not.toBe(await drawn("award"));
  // the title is the slot's fixed label, as the admin section shows it
  // (D63: plan = 연간교육안, monthly = 월간교육안)
  await expect(card(page, "plan").locator(".res-name")).toHaveText(
    "연간교육안",
  );
  await expect(card(page, "monthly").locator(".res-name")).toHaveText(
    "월간교육안",
  );
});

// D63 order safety, live step ② (SQL before the push): the page deployed
// before D63 (commit 4a9b23d — tests/fixtures/teacher-resources-4a9b23d.js,
// 수정 금지) receives the NEW list with monthly rows. It shows its own slots,
// ignores monthly, and its 월간.연간교육안 (plan) file still downloads; the admin
// section still lists its 10 slots.
test("resources: the pre-D63 page ignores the new monthly rows (live step ②)", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "order safety, run once");
  const OLD = readFileSync(
    path.resolve("tests/fixtures/teacher-resources-4a9b23d.js"),
    "utf8",
  );
  expect(OLD).toContain('{ slot: "plan", label: "월간.연간교육안" }');
  await page.route(/\/teacher-resources\.js(\?.*)?$/, (route) =>
    route.fulfill({ contentType: "text/javascript", body: OLD }),
  );
  const sent = await stubSupabase(page, {
    role: "teacher",
    files: {
      "level-2/monthly": { name: "11월 월간교육안.pdf", size: 1000 },
      "level-2/plan": { name: "2026 월간.연간교육안.pdf", size: 2000 },
    },
  });
  await page.goto("/#resources/level-2");
  const cards = page.locator("#resourceGrid .res-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.locator(".res-name")).toHaveText([
    "월간.연간교육안",
    "상장",
    "테스트",
  ]);
  await expect(card(page, "monthly")).toHaveCount(0);
  await expect(page.locator("#resourceStatus")).toHaveText("");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    card(page, "plan").locator(".res-download").click(),
  ]);
  expect(download.suggestedFilename()).toBe("2026 월간.연간교육안.pdf");
  expect(sent.fn.map((f) => f.body)).toEqual([
    { level: "level-2", slot: "plan" },
  ]);
  expect(context.pages()).toHaveLength(1);
});

test("resources admin: the pre-D63 admin section still shows its 10 slots (live step ②)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "order safety, run once");
  const OLD = readFileSync(
    path.resolve("tests/fixtures/teacher-resources-4a9b23d.js"),
    "utf8",
  );
  await page.route(/\/teacher-resources\.js(\?.*)?$/, (route) =>
    route.fulfill({ contentType: "text/javascript", body: OLD }),
  );
  await stubSupabase(page, {
    role: "admin",
    files: { "beginner/monthly": { name: "11월 월간교육안.pdf", size: 1000 } },
  });
  await openBannerTab(page);
  await expect(page.locator("#teacherResAdmin .res-admin-row")).toHaveCount(10);
  await expect(
    page.locator(
      '#teacherResAdmin .res-admin-row[data-level="beginner"] .res-admin-slot',
    ),
  ).toHaveText(["월간.연간교육안", "상장"]);
  await expect(page.locator("#teacherResStatus")).toHaveText("");
});

// ---- D64 (2026-11-02): Google Drive slots --------------------------------

test("resources: a Drive slot downloads from Google in a new tab, not the function (D64)", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "flow only, run once");
  const sent = await stubSupabase(page, {
    role: "teacher",
    files: {
      "level-2/monthly": { drive: DRIVE_A, updated: "2026-11-02T03:00:00Z" },
      "level-2/plan": { name: PLAN_NAME, size: 4404019 },
    },
  });
  await page.goto("/#resources/level-2");
  const drive = card(page, "monthly");
  await expect(drive).toHaveAttribute("data-state", "ready");
  await expect(drive.locator(".res-meta")).toHaveText(
    "구글 드라이브 · 11/02 업데이트",
  );
  await expect(drive.locator(".res-icon")).toHaveAttribute(
    "data-kind",
    "drive",
  );
  await expect(drive.locator(".res-icon-label")).toHaveText("LINK");
  // drawn differently from the PDF card next to it
  expect(await drive.locator(".res-icon svg").innerHTML()).not.toBe(
    await card(page, "plan").locator(".res-icon svg").innerHTML(),
  );
  const link = drive.locator(".res-download");
  await expect(link).toHaveText("내려받기");
  await expect(link).toHaveAttribute("href", driveDownload(DRIVE_A));
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /\bnoopener\b/);
  await expect(link).toHaveAccessibleName("월간교육안 내려받기 (새 탭)");
  const [tab] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await expect(tab).toHaveURL(driveDownload(DRIVE_A));
  await tab.close();
  // this page stays where it was; no Edge Function call for a Drive slot
  await expect(page).toHaveURL(/#resources\/level-2$/);
  await expect(page.locator("#resourceStatus")).toHaveText("");
  expect(sent.fn).toEqual([]);
  expect(sent.google).toEqual([driveDownload(DRIVE_A)]);
  // the file slot beside it still goes through the function, in this tab
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    card(page, "plan").locator(".res-download").click(),
  ]);
  expect(download.suggestedFilename()).toBe(PLAN_NAME);
  expect(sent.fn.map((f) => f.body)).toEqual([
    { level: "level-2", slot: "plan" },
  ]);
  expect(context.pages()).toHaveLength(1);
});

test("resources: students and visitors never get a Drive link (D64)", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "routing only, run once");
  for (const role of [null, "student"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const sent = await stubSupabase(page, {
      role,
      files: { "level-2/monthly": { drive: DRIVE_A } },
    });
    await page.goto("/#resources/level-2");
    await expect(page).toHaveURL(/#months\/level-2$/);
    await page.waitForFunction(() => window.craTeacherRes?.ready);
    await expect(page.locator('a[href*="google.com"]')).toHaveCount(0);
    expect(sent.rpc.map((r) => r.name)).not.toContain("teacher_resources_list");
    expect(sent.google).toEqual([]);
    await context.close();
  }
});

// D64 order safety, live step ① → ④ (SQL before the push): the page deployed
// now (commit 6c32cd8 — tests/fixtures/teacher-resources-6c32cd8.js, 수정 금지)
// receives the new list with drive_id. A Drive slot (no file name) is just
// 준비 중 to it; files still download, upload and delete as before.
test("resources: the pre-D64 page shows a Drive slot as 준비 중 (live step ①)", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "order safety, run once");
  const OLD = readFileSync(
    path.resolve("tests/fixtures/teacher-resources-6c32cd8.js"),
    "utf8",
  );
  expect(OLD).toContain('{ slot: "monthly", label: "월간교육안" }');
  expect(OLD).not.toContain("drive");
  await page.route(/\/teacher-resources\.js(\?.*)?$/, (route) =>
    route.fulfill({ contentType: "text/javascript", body: OLD }),
  );
  const sent = await stubSupabase(page, {
    role: "teacher",
    files: {
      "level-2/monthly": { drive: DRIVE_A },
      "level-2/plan": { name: PLAN_NAME, size: 4404019 },
    },
  });
  await page.goto("/#resources/level-2");
  await expect(page.locator("#resourceGrid .res-card")).toHaveCount(4);
  await expect(card(page, "monthly")).toHaveAttribute("data-state", "empty");
  await expect(card(page, "monthly").locator(".res-meta")).toHaveText(
    "준비 중",
  );
  await expect(card(page, "monthly").locator(".res-download")).toHaveCount(0);
  await expect(page.locator("#resourceStatus")).toHaveText("");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    card(page, "plan").locator(".res-download").click(),
  ]);
  expect(download.suggestedFilename()).toBe(PLAN_NAME);
  expect(sent.fn.map((f) => f.body)).toEqual([
    { level: "level-2", slot: "plan" },
  ]);
  expect(sent.google).toEqual([]);
  expect(context.pages()).toHaveLength(1);
});

test("resources admin: the pre-D64 admin section still works beside Drive slots (live step ①)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "order safety, run once");
  const OLD = readFileSync(
    path.resolve("tests/fixtures/teacher-resources-6c32cd8.js"),
    "utf8",
  );
  await page.route(/\/teacher-resources\.js(\?.*)?$/, (route) =>
    route.fulfill({ contentType: "text/javascript", body: OLD }),
  );
  const sent = await stubSupabase(page, {
    role: "admin",
    files: {
      "beginner/monthly": { drive: DRIVE_A },
      "beginner/plan": { name: PLAN_NAME, size: 4404019 },
    },
    clearAnswer: () => PLAN_PATH,
  });
  await openBannerTab(page);
  await expect(page.locator("#teacherResAdmin .res-admin-row")).toHaveCount(14);
  const monthly = page.locator(
    '#teacherResAdmin .res-admin-row[data-level="beginner"][data-slot="monthly"]',
  );
  await expect(monthly.locator(".res-admin-file")).toHaveText("파일 없음");
  await expect(monthly.getByRole("button", { name: "업로드" })).toBeVisible();
  await expect(page.locator("#teacherResStatus")).toHaveText("");
  // uploading over the Drive slot is the old upload (the SQL drops the link)
  await markRows(page);
  await monthly.locator('input[type="file"]').setInputFiles({
    name: "11월 월간교육안.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 new"),
  });
  await expect(page.locator("#teacherResStatus")).toHaveText("올렸어요.");
  await redrawn(page);
  expect(
    sent.rpc.find((r) => r.name === "teacher_resource_set").args.p_slot,
  ).toBe("monthly");
  // and a file slot still deletes (two presses)
  const plan = page.locator(
    '#teacherResAdmin .res-admin-row[data-level="beginner"][data-slot="plan"]',
  );
  await plan.getByRole("button", { name: "삭제" }).click();
  await plan.getByRole("button", { name: "한 번 더 누르면 삭제" }).click();
  await expect(page.locator("#teacherResStatus")).toHaveText("삭제했어요.");
  expect(sent.google).toEqual([]);
});

test("resources: one card per row, title on one line, 44px buttons, keyboard focus", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "layout by viewport, once");
  await stubSupabase(page, {
    role: "teacher",
    files: {
      "level-2/plan": { name: PLAN_NAME, size: 4404019 },
      "level-2/award": { drive: DRIVE_A }, // D64: a link, sized like a button
      "level-2/test": { name: "Level 2 테스트.xlsx", size: 51200 },
    },
  });
  for (const [w, h] of [
    [1366, 900],
    [390, 844],
    [320, 700],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("about:blank");
    await page.goto("/#resources/level-2");
    await expect(page.locator("#resourceGrid .res-card")).toHaveCount(4);
    await expect(card(page, "plan").locator(".res-download")).toBeVisible();
    const geo = await page.evaluate(() =>
      [...document.querySelectorAll("#resourceGrid .res-card")].map((el) => {
        const box = el.getBoundingClientRect();
        const name = el.querySelector(".res-name");
        const button = el.querySelector(".res-download");
        const b = button && button.getBoundingClientRect();
        return {
          left: box.left,
          top: box.top,
          bottom: box.bottom,
          nameHeight: name.getBoundingClientRect().height,
          lineHeight: parseFloat(getComputedStyle(name).lineHeight),
          button: b && { width: b.width, height: b.height },
        };
      }),
    );
    // one card per row: each below the last, same left edge
    for (let i = 1; i < geo.length; i += 1) {
      expect(geo[i].top, `${w}: card ${i}`).toBeGreaterThan(geo[i - 1].bottom);
      expect(Math.abs(geo[i].left - geo[0].left)).toBeLessThan(1);
    }
    // every title on one line (D58: never "월간. / 연간교육안"; D63 titles are short)
    for (const g of geo) {
      expect(g.nameHeight, `${w}: title lines`).toBeLessThan(
        g.lineHeight * 1.5,
      );
    }
    // press areas 44px or more
    for (const g of geo.filter((x) => x.button)) {
      expect(g.button.height).toBeGreaterThanOrEqual(44);
      expect(g.button.width).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(w);
  }
  // keyboard: Tab reaches the download button, and its focus ring shows
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("about:blank");
  await page.goto("/#resources/level-2");
  await expect(card(page, "plan").locator(".res-download")).toBeVisible();
  let onDownload = false;
  for (let i = 0; i < 40 && !onDownload; i += 1) {
    await page.keyboard.press("Tab");
    onDownload = await page.evaluate(() =>
      document.activeElement?.classList.contains("res-download"),
    );
  }
  expect(onDownload).toBe(true);
  const ring = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(ring.style).not.toBe("none");
  expect(ring.width).toBeGreaterThanOrEqual(2);
});

test("resources: the month page button is filled with the level color, folder icon kept", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "style only, run once");
  await stubSupabase(page, { role: "teacher" });
  for (const [level, color] of [
    ["beginner", "rgb(255, 200, 0)"], // --sunny-yellow
    ["level-2", "rgb(28, 176, 246)"], // --macaw-blue
  ]) {
    await page.goto("about:blank");
    await openMonths(page, level);
    const button = page.locator("#teacherResBtn");
    await expect(button).toBeVisible();
    await expect(button).toHaveCSS("background-color", color);
    await expect(button.locator("svg.teacher-res-icon")).toHaveCount(1);
    await expect(button).toHaveText(BUTTON);
  }
});

// ---- Admin: 배너 tab section ----------------------------------------------

async function openBannerTab(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.craTeacherRes?.ready);
  await page.evaluate(() => openAdmin());
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
  // under 782px the admin menu opens from ☰ first (3B-2b)
  const menuToggle = page.locator("#adminMenuToggle");
  if (await menuToggle.isVisible()) await menuToggle.click();
  await page.locator('.admin-menu-btn[data-admin-view="banner"]').click();
  await expect(page.locator("#teacherResAdmin")).toBeVisible();
}

test("resources admin: 4 levels, 14 slots (D63), current file shown", async ({
  page,
}) => {
  await stubSupabase(page, { role: "admin" });
  await openBannerTab(page);
  const groups = page.locator("#teacherResAdmin .res-admin-level");
  await expect(groups.locator("h3")).toHaveText([
    "Beginner",
    "Level 1",
    "Level 2",
    "Level 3",
  ]);
  const rows = page.locator("#teacherResAdmin .res-admin-row");
  await expect(rows).toHaveCount(14);
  await expect(
    page.locator(
      '#teacherResAdmin .res-admin-row[data-level="beginner"] .res-admin-slot',
    ),
  ).toHaveText(["월간교육안", "연간교육안", "상장"]);
  await expect(
    page.locator(
      '#teacherResAdmin .res-admin-row[data-level="level-3"] .res-admin-slot',
    ),
  ).toHaveText(["월간교육안", "연간교육안", "상장", "테스트"]);
  await expect(
    page.locator(
      '#teacherResAdmin .res-admin-row[data-level="beginner"][data-slot="monthly"] .res-admin-file',
    ),
  ).toHaveText("파일 없음");
  const plan = page.locator(
    '#teacherResAdmin .res-admin-row[data-level="beginner"][data-slot="plan"]',
  );
  await expect(plan.locator(".res-admin-file")).toHaveText(
    `${PLAN_NAME} · 4.2 MB · 2026-10-29`,
  );
  await expect(plan.getByRole("button", { name: "교체" })).toBeVisible();
  await expect(plan.getByRole("button", { name: "삭제" })).toBeVisible();
  const award = page.locator(
    '#teacherResAdmin .res-admin-row[data-level="beginner"][data-slot="award"]',
  );
  await expect(award.locator(".res-admin-file")).toHaveText("파일 없음");
  await expect(award.getByRole("button", { name: "업로드" })).toBeVisible();
  await expect(award.getByRole("button", { name: "삭제" })).toHaveCount(0);
  await expect(
    page.locator(
      '#teacherResAdmin .res-admin-row[data-level="level-1"][data-slot="test"]',
    ),
  ).toHaveCount(0);
});

test("resources admin: upload replaces the old file and deletes it from storage", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "flow only, run once");
  const sent = await stubSupabase(page, {
    role: "admin",
    setAnswer: (args) =>
      args.p_level === "beginner" && args.p_slot === "plan" ? PLAN_PATH : null,
  });
  await openBannerTab(page);
  const row = page.locator(
    '#teacherResAdmin .res-admin-row[data-level="beginner"][data-slot="plan"]',
  );
  await row.locator('input[type="file"]').setInputFiles({
    name: "새 연간교육안.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 new"),
  });
  await expect(page.locator("#teacherResStatus")).toHaveText("올렸어요.");
  const upload = sent.storage.find((s) => s.op === "upload");
  expect(upload.path).toMatch(
    /^\/storage\/v1\/object\/teacher-resources\/beginner\/plan\/\d{13}\.pdf$/,
  );
  expect(upload.contentType).toBe("application/pdf");
  const set = sent.rpc.find((r) => r.name === "teacher_resource_set");
  expect(set.args).toEqual({
    p_level: "beginner",
    p_slot: "plan",
    p_path: upload.path.replace("/storage/v1/object/teacher-resources/", ""),
    p_name: "새 연간교육안.pdf",
    p_size: 12,
  });
  // the replaced object is removed — after the row points at the new one
  const remove = sent.storage.find((s) => s.op === "remove");
  expect(remove.body).toEqual({ prefixes: [PLAN_PATH] });
  expect(sent.storage.map((s) => s.op)).toEqual(["upload", "remove"]);
});

test("resources admin: too big or wrong type is refused before uploading", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "flow only, run once");
  const sent = await stubSupabase(page, { role: "admin" });
  await openBannerTab(page);
  const input = page.locator(
    '#teacherResAdmin .res-admin-row[data-level="level-3"][data-slot="test"] input[type="file"]',
  );
  await input.setInputFiles({
    name: "큰 파일.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.locator("#teacherResStatus")).toHaveText(
    "10MB 이하 파일만 올릴 수 있어요.",
  );
  await input.setInputFiles({
    name: "문서.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: Buffer.from("x"),
  });
  await expect(page.locator("#teacherResStatus")).toHaveText(
    "PDF 또는 엑셀(xlsx, xls) 파일만 올릴 수 있어요.",
  );
  expect(sent.storage).toEqual([]);
  expect(sent.rpc.filter((r) => r.name === "teacher_resource_set")).toEqual([]);
});

test("resources admin: delete asks twice, then clears the row and the object", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "flow only, run once");
  const sent = await stubSupabase(page, {
    role: "admin",
    clearAnswer: () => PLAN_PATH,
  });
  await openBannerTab(page);
  const row = page.locator(
    '#teacherResAdmin .res-admin-row[data-level="beginner"][data-slot="plan"]',
  );
  await row.getByRole("button", { name: "삭제" }).click();
  await expect(
    row.getByRole("button", { name: "한 번 더 누르면 삭제" }),
  ).toBeVisible();
  expect(sent.rpc.filter((r) => r.name === "teacher_resource_clear")).toEqual(
    [],
  );
  await row.getByRole("button", { name: "한 번 더 누르면 삭제" }).click();
  await expect(page.locator("#teacherResStatus")).toHaveText("삭제했어요.");
  expect(
    sent.rpc.find((r) => r.name === "teacher_resource_clear").args,
  ).toEqual({ p_level: "beginner", p_slot: "plan" });
  expect(sent.storage).toEqual([
    {
      op: "remove",
      path: "/storage/v1/object/teacher-resources",
      body: { prefixes: [PLAN_PATH] },
      contentType: null,
    },
  ]);
});

// ---- Admin, D64: Google Drive links ---------------------------------------

// Each save reloads the admin list: mark the rows, then wait for new ones, so
// the next click lands on a redrawn row (not on one about to be replaced).
const markRows = (page) =>
  page.locator("#teacherResAdminList").evaluate((list) => {
    list.querySelectorAll(".res-admin-row").forEach((row) => {
      row.dataset.stale = "1";
    });
  });
const redrawn = (page) =>
  expect(
    page.locator("#teacherResAdmin .res-admin-row[data-stale]"),
  ).toHaveCount(0);

const resRow = (page, level, slot) =>
  page.locator(
    `#teacherResAdmin .res-admin-row[data-level="${level}"][data-slot="${slot}"]`,
  );

test("resources admin: a Drive slot says 구글 드라이브 · date and opens in a new tab (D64)", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "flow only, run once");
  const sent = await stubSupabase(page, {
    role: "admin",
    files: {
      "beginner/plan": { name: PLAN_NAME, size: 4404019 },
      "beginner/award": { drive: DRIVE_A, updated: "2026-11-02T03:00:00Z" },
    },
  });
  await openBannerTab(page);
  const row = resRow(page, "beginner", "award");
  await expect(row.locator(".res-admin-file")).toHaveText(
    "구글 드라이브 · 2026-11-02",
  );
  const open = row.getByRole("link", { name: "링크 열기" });
  await expect(open).toHaveAttribute("href", driveView(DRIVE_A));
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("rel", /\bnoopener\b/);
  await expect(row.getByRole("button")).toHaveText([
    "업로드",
    "드라이브 링크",
    "삭제",
  ]);
  const [tab] = await Promise.all([context.waitForEvent("page"), open.click()]);
  await expect(tab).toHaveURL(driveView(DRIVE_A));
  await tab.close();
  expect(sent.google).toEqual([driveView(DRIVE_A)]);
  // every row offers the link; a file row and an empty one keep their buttons
  await expect(
    page.locator("#teacherResAdmin .res-admin-row .res-admin-drive"),
  ).toHaveCount(14);
  const plan = resRow(page, "beginner", "plan");
  await expect(plan.getByRole("link")).toHaveCount(0);
  await expect(plan.getByRole("button")).toHaveText([
    "교체",
    "드라이브 링크",
    "삭제",
  ]);
  await expect(
    resRow(page, "beginner", "monthly").getByRole("button"),
  ).toHaveText(["업로드", "드라이브 링크"]);
  // deleting a Drive slot only unlinks it (nothing in Storage to remove) —
  // and says the file and its sharing stay in Google Drive
  await row.getByRole("button", { name: "삭제" }).click();
  await row.getByRole("button", { name: "한 번 더 누르면 삭제" }).click();
  await expect(page.locator("#teacherResStatus")).toHaveText(
    "링크를 지웠어요. (구글 드라이브의 파일과 공유는 그대로예요.)",
  );
  expect(
    sent.rpc.find((r) => r.name === "teacher_resource_clear").args,
  ).toEqual({ p_level: "beginner", p_slot: "award" });
  expect(sent.storage).toEqual([]);
});

test("resources admin: the three Drive link forms all save the file ID (D64)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "flow only, run once");
  const sent = await stubSupabase(page, { role: "admin" });
  await openBannerTab(page);
  const row = resRow(page, "level-1", "award"); // an empty slot
  const box = () =>
    row.getByRole("textbox", { name: "구글 드라이브 파일 링크" });
  const saved = () =>
    sent.rpc.filter((r) => r.name === "teacher_resource_set_drive");
  const forms = [
    [`https://drive.google.com/file/d/${DRIVE_A}/view?usp=sharing`, DRIVE_A],
    [`https://drive.google.com/file/u/1/d/${DRIVE_B}/view`, DRIVE_B],
    [`https://drive.google.com/open?id=${DRIVE_A}`, DRIVE_A],
    [`https://drive.google.com/uc?export=download&id=${DRIVE_B}`, DRIVE_B],
    [`  drive.google.com/file/d/${DRIVE_A}/edit  `, DRIVE_A],
  ];
  for (const [text, id] of forms) {
    await row.getByRole("button", { name: "드라이브 링크" }).click();
    const editor = row.locator(".res-drive-editor");
    await expect(editor).toBeVisible();
    await expect(editor.locator(".res-drive-help")).toHaveText(DRIVE_HELP);
    await expect(box()).toBeFocused();
    await box().fill(text);
    await editor.getByRole("button", { name: "저장" }).click();
    await expect(page.locator("#teacherResStatus")).toHaveText(
      "링크를 저장했어요.",
    );
    expect(saved().at(-1).args, text).toEqual({
      p_level: "level-1",
      p_slot: "award",
      p_drive_id: id,
    });
    await expect(row.locator(".res-drive-editor")).toHaveCount(0);
  }
  // Enter in the box saves too
  await row.getByRole("button", { name: "드라이브 링크" }).click();
  await box().fill(driveView(DRIVE_B));
  await box().press("Enter");
  await expect(row.locator(".res-drive-editor")).toHaveCount(0);
  expect(saved()).toHaveLength(forms.length + 1);
  expect(sent.storage).toEqual([]);
  expect(sent.google).toEqual([]);
});

test("resources admin: Docs links and anything else are refused before saving (D64)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "flow only, run once");
  const sent = await stubSupabase(page, { role: "admin" });
  await openBannerTab(page);
  const row = resRow(page, "level-3", "test");
  await row.getByRole("button", { name: "드라이브 링크" }).click();
  const editor = row.locator(".res-drive-editor");
  const input = editor.getByRole("textbox", {
    name: "구글 드라이브 파일 링크",
  });
  const save = editor.getByRole("button", { name: "저장" });
  const message = editor.locator(".res-drive-msg");
  for (const text of [
    `https://docs.google.com/document/d/${DRIVE_A}/edit`,
    `https://docs.google.com/spreadsheets/d/${DRIVE_A}/edit#gid=0`,
  ]) {
    await input.fill(text);
    await save.click();
    await expect(message).toHaveText(DRIVE_DOCS);
  }
  for (const text of [
    "",
    "구글 드라이브",
    `https://drive.google.com/drive/folders/${DRIVE_A}`,
    `https://example.com/file/d/${DRIVE_A}/view`,
    `https://drive.google.com.evil.example/file/d/${DRIVE_A}/view`,
    "https://drive.google.com/file/d/short/view",
    `https://drive.google.com/file/d/${DRIVE_A}"onmouseover="x/view`,
    `javascript:alert(1)//drive.google.com/file/d/${DRIVE_A}`,
  ]) {
    await input.fill(text);
    await save.click();
    await expect(message, text).toHaveText(DRIVE_BAD);
  }
  expect(
    sent.rpc.filter((r) => r.name === "teacher_resource_set_drive"),
  ).toEqual([]);
  // 취소 closes the box without saving
  await editor.getByRole("button", { name: "취소" }).click();
  await expect(row.locator(".res-drive-editor")).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: "드라이브 링크" }),
  ).toBeFocused();
  expect(sent.google).toEqual([]);
});

test("resources admin: file ⇄ Drive asks twice before switching (D64)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "flow only, run once");
  const sent = await stubSupabase(page, {
    role: "admin",
    files: {
      "beginner/plan": { name: PLAN_NAME, size: 4404019 },
      "beginner/award": { drive: DRIVE_B },
    },
    setDriveAnswer: (args) => (args.p_slot === "plan" ? PLAN_PATH : null),
  });
  await openBannerTab(page);
  const saved = () =>
    sent.rpc.filter((r) => r.name === "teacher_resource_set_drive");
  // file → Drive: the first 저장 only warns; the second saves, then the old
  // file leaves Storage
  const plan = resRow(page, "beginner", "plan");
  await plan.getByRole("button", { name: "드라이브 링크" }).click();
  await plan
    .getByRole("textbox", { name: "구글 드라이브 파일 링크" })
    .fill(driveView(DRIVE_A));
  await plan.getByRole("button", { name: "저장" }).click();
  const confirmSave = plan.getByRole("button", {
    name: "한 번 더 누르면 링크로 바꾸기",
  });
  await expect(confirmSave).toBeVisible();
  expect(saved()).toEqual([]);
  await markRows(page);
  await confirmSave.click();
  await expect(page.locator("#teacherResStatus")).toHaveText(
    "링크를 저장했어요.",
  );
  await redrawn(page);
  expect(saved()[0].args).toEqual({
    p_level: "beginner",
    p_slot: "plan",
    p_drive_id: DRIVE_A,
  });
  expect(sent.storage).toEqual([
    {
      op: "remove",
      path: "/storage/v1/object/teacher-resources",
      body: { prefixes: [PLAN_PATH] },
      contentType: null,
    },
  ]);
  // Drive → file: the first 업로드 only warns (no file picker); the second
  // opens it
  const award = resRow(page, "beginner", "award");
  let chooser = false;
  page.on("filechooser", () => (chooser = true));
  await award.getByRole("button", { name: "업로드" }).click();
  const confirmUpload = award.getByRole("button", {
    name: "한 번 더 누르면 파일로 바꾸기",
  });
  await expect(confirmUpload).toBeVisible();
  await page.waitForTimeout(300);
  expect(chooser).toBe(false);
  await markRows(page);
  const [picker] = await Promise.all([
    page.waitForEvent("filechooser"),
    confirmUpload.click(),
  ]);
  await picker.setFiles({
    name: "상장.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 award"),
  });
  await expect(page.locator("#teacherResStatus")).toHaveText("올렸어요.");
  await redrawn(page);
  expect(
    sent.rpc.find((r) => r.name === "teacher_resource_set").args.p_slot,
  ).toBe("award");
  // an empty slot switches nothing, so it never asks
  const monthly = resRow(page, "beginner", "monthly");
  await monthly.getByRole("button", { name: "드라이브 링크" }).click();
  await monthly
    .getByRole("textbox", { name: "구글 드라이브 파일 링크" })
    .fill(driveView(DRIVE_B));
  await monthly.getByRole("button", { name: "저장" }).click();
  await expect(monthly.locator(".res-drive-editor")).toHaveCount(0);
  expect(saved()).toHaveLength(2);
  expect(sent.google).toEqual([]);
});
