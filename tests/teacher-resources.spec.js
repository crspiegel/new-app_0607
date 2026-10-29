import { expect, test } from "@playwright/test";

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

// The resource list per level as teacher_resources_list returns it.
function listFor(level, files = {}) {
  const slots =
    level === "level-2" || level === "level-3"
      ? ["plan", "award", "test"]
      : ["plan", "award"];
  return slots.map((slot) => ({
    slot,
    file_name: files[`${level}/${slot}`]?.name ?? null,
    file_size: files[`${level}/${slot}`]?.size ?? null,
    updated_at: files[`${level}/${slot}`] ? "2026-10-29T03:00:00Z" : null,
  }));
}

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
    clearAnswer = () => null,
    adminLogin = false,
  } = {},
) {
  const sent = { rpc: [], storage: [], tokens: [], downloads: [], fn: [] };
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
  await page.locator('.top-nav [data-level="level-1"]').click({ force: true });
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
    beginner: ["월간.연간교육안", "상장"],
    "level-1": ["월간.연간교육안", "상장"],
    "level-2": ["월간.연간교육안", "상장", "테스트"],
    "level-3": ["월간.연간교육안", "상장", "테스트"],
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
    const buttons = page.locator("#resourceGrid .res-button");
    await expect(buttons).toHaveCount(names.length);
    await expect(buttons.locator(".res-name")).toHaveText(names);
  }
  // level-3 has no files: every button disabled, "준비 중"
  const empty = page.locator("#resourceGrid .res-button");
  for (let i = 0; i < 3; i += 1) {
    await expect(empty.nth(i)).toBeDisabled();
    await expect(empty.nth(i).locator(".res-kind")).toHaveText("준비 중");
  }
  // level-2: the filled test slot is an EXCEL button, the rest empty
  await page.goto("about:blank");
  await page.goto("/#resources/level-2");
  const test2 = page.locator('#resourceGrid .res-button[data-slot="test"]');
  await expect(test2).toBeEnabled();
  await expect(test2.locator(".res-kind")).toHaveText("EXCEL");
  await expect(
    page.locator('#resourceGrid .res-button[data-slot="plan"]'),
  ).toBeDisabled();
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
  const plan = page.locator('#resourceGrid .res-button[data-slot="plan"]');
  await expect(plan.locator(".res-kind")).toHaveText("PDF");
  const urlBefore = page.url();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    plan.click(),
  ]);
  expect(download.suggestedFilename()).toBe(PLAN_NAME);
  expect(context.pages()).toHaveLength(1);
  expect(page.url()).toBe(urlBefore);
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "resources",
  );
  // One Edge Function call (level + slot only, with the LMS token) → its
  // 60 s URL, followed in this tab. The browser itself never signs.
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
    const plan = page.locator('#resourceGrid .res-button[data-slot="plan"]');
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
  await expect(page.locator("#resourceGrid .res-button")).toHaveCount(3);
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

// ---- Admin: 배너 tab section ----------------------------------------------

async function openBannerTab(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.craTeacherRes?.ready);
  await page.evaluate(() => openAdmin());
  await expect(page.locator("#adminScreen")).toHaveClass(/screen-active/);
  await page.locator('.admin-menu-btn[data-admin-view="banner"]').click();
  await expect(page.locator("#teacherResAdmin")).toBeVisible();
}

test("resources admin: 4 levels, 10 slots, current file shown", async ({
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
  await expect(rows).toHaveCount(10);
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
