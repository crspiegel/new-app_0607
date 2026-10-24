import { expect, test } from "@playwright/test";

// LMS login (Phase 3A / 3.2). Every Supabase request is answered here — REST,
// RPC, auth and storage — so this file never reaches the live project. The
// RPC answers mirror supabase/migration.sql (lms_login / lms_session /
// lms_logout); tests/lms-sql.spec.js checks the SQL side of the same contract.

const SUPABASE = /^https:\/\/[^/]+\.supabase\.co\//;
const BLANK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const OK_STUDENT = {
  status: "ok",
  token: "tok-student-0000000000000000000000000000000",
  role: 3,
  branch_id: "b-hq",
  branch_name: "TPS 본사",
  display_name: "Kid",
};
const SESSION_STUDENT = {
  role: 3,
  branch_id: "b-hq",
  branch_name: "TPS 본사",
  display_name: "Kid",
};

// Answers every Supabase call; `login` is a queue of lms_login responses,
// `session` the lms_session response; the delays hold those answers back.
// Returns what the page sent (`all` = every Supabase request + its token).
async function stubSupabase(
  page,
  { login = [], session = null, loginDelayMs = 0, sessionDelayMs = 0 } = {},
) {
  const sent = {
    login: [],
    loginDone: 0,
    session: 0,
    sessionDone: 0,
    logout: 0,
    auth: 0,
    rest: [],
    all: [],
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cra:dev-live", "1"); // give the page a client
    } catch {
      /* offline config: the tests below would fail and say so */
    }
  });
  await page.route(SUPABASE, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    sent.all.push({
      path: pathname,
      token: request.headers()["x-lms-token"] ?? null,
    });
    if (pathname.startsWith("/rest/v1/")) {
      sent.rest.push({
        path: pathname,
        token: request.headers()["x-lms-token"] ?? null,
      });
    }
    if (pathname === "/rest/v1/rpc/lms_login") {
      sent.login.push(request.postDataJSON());
      const answer = login.shift() ?? { status: "invalid" };
      if (loginDelayMs) await wait(loginDelayMs);
      await route.fulfill({ json: answer });
      sent.loginDone += 1;
      return;
    }
    if (pathname === "/rest/v1/rpc/lms_session") {
      sent.session += 1;
      if (sessionDelayMs) await wait(sessionDelayMs);
      await route.fulfill({ json: session });
      sent.sessionDone += 1;
      return;
    }
    if (pathname === "/rest/v1/rpc/lms_logout") {
      sent.logout += 1;
      return route.fulfill({ status: 204, body: "" });
    }
    if (pathname.startsWith("/auth/v1/")) {
      sent.auth += 1;
      return route.fulfill({
        status: 400,
        json: {
          error: "invalid_grant",
          error_description: "Invalid login credentials",
        },
      });
    }
    if (pathname.startsWith("/storage/v1/object/list")) {
      return route.fulfill({ json: [] });
    }
    if (pathname.startsWith("/storage/")) {
      return route.fulfill({ contentType: "image/png", body: BLANK_PNG });
    }
    if (pathname.startsWith("/rest/v1/rpc/")) {
      return route.fulfill({ json: null });
    }
    return route.fulfill({ json: [] });
  });
  return sent;
}

async function fillLogin(page, id, pw) {
  await page.locator("#loginId").fill(id);
  await page.locator("#loginPassword").fill(pw);
  await page.locator("#loginForm .login-submit").click();
}

function storedLms(page) {
  return page.evaluate(() => window.localStorage.getItem("cra_lms"));
}

const CHOOSE = {
  status: "choose",
  branches: [
    { branch_id: "b-a", branch_name: "Busan" },
    { branch_id: "b-b", branch_name: "Seoul" },
  ],
};

function seedToken(page, token = OK_STUDENT.token) {
  return page.addInitScript((t) => {
    if (!window.sessionStorage.getItem("seeded")) {
      window.sessionStorage.setItem("seeded", "1");
      window.localStorage.setItem(
        "cra_lms",
        JSON.stringify({ token: t, role: 3 }),
      );
    }
  }, token);
}

test("lms login: ok → home, Log out shown, Admin hidden, token stored", async ({
  page,
}) => {
  const sent = await stubSupabase(page, { login: [OK_STUDENT] });
  await page.goto("/#login");
  await fillLogin(page, "  김민준 ", "4821");

  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await expect(page.locator("#logoutBtn")).toBeVisible();
  await expect(page.locator("#adminNavBtn")).toBeHidden();
  await expect(page.locator("body")).toHaveClass(/signed-in/);
  // Korean ID goes to the server as typed (trimmed); the server normalizes it.
  expect(sent.login).toEqual([{ p_login_id: "김민준", p_password: "4821" }]);
  expect(sent.rest.find((r) => r.path === "/rest/v1/rpc/lms_login").token).toBe(
    null,
  );
  const stored = JSON.parse(await storedLms(page));
  expect(stored.token).toBe(OK_STUDENT.token);
  expect(stored.role).toBe(3);
  expect(JSON.stringify(stored)).not.toContain("4821"); // no password kept
  await expect(page.locator("#loginPassword")).toHaveValue("");
});

test("lms login: choose → branch buttons → second call with p_branch_id", async ({
  page,
}) => {
  const sent = await stubSupabase(page, {
    login: [
      {
        status: "choose",
        branches: [
          { branch_id: "b-a", branch_name: "Busan" },
          { branch_id: "b-b", branch_name: "Seoul" },
        ],
      },
      { ...OK_STUDENT, branch_id: "b-b", branch_name: "Seoul" },
    ],
  });
  await page.goto("/#login");
  await fillLogin(page, "kim", "1234");

  const choice = page.locator("#loginBranchChoice");
  await expect(choice).toBeVisible();
  await expect(choice).toContainText("Choose your branch");
  const buttons = choice.locator("button.login-branch");
  await expect(buttons).toHaveText(["Busan", "Seoul"]);
  await expect(page.locator("#homeScreen")).not.toHaveClass(/screen-active/);
  expect(await storedLms(page)).toBeNull();

  await buttons.nth(1).click();
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  expect(sent.login).toEqual([
    { p_login_id: "kim", p_password: "1234" },
    { p_login_id: "kim", p_password: "1234", p_branch_id: "b-b" },
  ]);
  expect(JSON.parse(await storedLms(page)).branch_name).toBe("Seoul");
  await expect(choice).toBeHidden();
});

test("lms login: editing the form drops a pending branch choice", async ({
  page,
}) => {
  await stubSupabase(page, {
    login: [
      {
        status: "choose",
        branches: [
          { branch_id: "b-a", branch_name: "Busan" },
          { branch_id: "b-b", branch_name: "Seoul" },
        ],
      },
    ],
  });
  await page.goto("/#login");
  await fillLogin(page, "kim", "1234");
  await expect(page.locator("#loginBranchChoice")).toBeVisible();
  await page.locator("#loginPassword").fill("12345");
  await expect(page.locator("#loginBranchChoice")).toBeHidden();
  await expect(page.locator("#loginBranchList button")).toHaveCount(0);
});

test("lms login: invalid → friendly message, nothing stored", async ({
  page,
}) => {
  await stubSupabase(page, { login: [{ status: "invalid" }] });
  await page.goto("/#login");
  await fillLogin(page, "nobody", "9999");
  await expect(page.locator("#loginError")).toHaveText(
    "Please check your ID and password.",
  );
  await expect(page.locator("#loginScreen")).toHaveClass(/screen-active/);
  expect(await storedLms(page)).toBeNull();
});

test("lms login: locked → minutes left", async ({ page }) => {
  await stubSupabase(page, {
    login: [
      { status: "locked", retry_after_sec: 541 },
      { status: "locked", retry_after_sec: 40 },
    ],
  });
  await page.goto("/#login");
  await fillLogin(page, "kim", "1111");
  await expect(page.locator("#loginError")).toHaveText(
    "Too many tries. Please try again in 10 minutes.",
  );
  await page.locator("#loginForm .login-submit").click();
  await expect(page.locator("#loginError")).toHaveText(
    "Too many tries. Please try again in 1 minute.",
  );
});

test("lms login: RPC failure (e.g. SQL not run yet) shows a generic error", async ({
  page,
}) => {
  await stubSupabase(page);
  await page.route("**/rest/v1/rpc/lms_login", (route) =>
    route.fulfill({ status: 404, json: { code: "PGRST202" } }),
  );
  await page.goto("/#login");
  await fillLogin(page, "kim", "1111");
  await expect(page.locator("#loginError")).toHaveText(
    "Login is not available right now.",
  );
});

test("lms session: reload keeps the login through lms_session", async ({
  page,
}) => {
  const sent = await stubSupabase(page, { session: SESSION_STUDENT });
  await page.addInitScript((token) => {
    if (!window.localStorage.getItem("cra_lms")) {
      window.localStorage.setItem(
        "cra_lms",
        JSON.stringify({ token, role: 3 }),
      );
    }
  }, OK_STUDENT.token);
  await page.goto("/");
  await expect(page.locator("#logoutBtn")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/signed-in/);
  expect(sent.session).toBe(1);
  const call = sent.rest.find((r) => r.path === "/rest/v1/rpc/lms_session");
  expect(call.token).toBe(OK_STUDENT.token);

  await page.reload();
  await expect(page.locator("#logoutBtn")).toBeVisible();
  expect(sent.session).toBe(2); // once per page load
});

test("lms session: a dead token (lms_session null) signs out and clears the key", async ({
  page,
}) => {
  const sent = await stubSupabase(page, { session: null });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "cra_lms",
      JSON.stringify({ token: "tok-dead", role: 2 }),
    );
  });
  await page.goto("/");
  await expect.poll(() => sent.session).toBe(1);
  await expect.poll(() => storedLms(page)).toBeNull();
  await expect(page.locator("#logoutBtn")).toBeHidden();
  await expect(page.locator("body")).not.toHaveClass(/signed-in/);
});

test("lms logout: calls lms_logout with the token, clears it, header stops", async ({
  page,
}) => {
  const sent = await stubSupabase(page, { session: SESSION_STUDENT });
  await page.addInitScript((token) => {
    if (!window.sessionStorage.getItem("seeded")) {
      window.sessionStorage.setItem("seeded", "1");
      window.localStorage.setItem(
        "cra_lms",
        JSON.stringify({ token, role: 3 }),
      );
    }
  }, OK_STUDENT.token);
  await page.goto("/");
  await expect(page.locator("#logoutBtn")).toBeVisible();
  await page.locator("#logoutBtn").click();
  await expect(page.locator("#logoutBtn")).toBeHidden();
  expect(sent.logout).toBe(1);
  const logoutCall = sent.rest.find(
    (r) => r.path === "/rest/v1/rpc/lms_logout",
  );
  expect(logoutCall.token).toBe(OK_STUDENT.token);
  expect(await storedLms(page)).toBeNull();

  // later REST requests carry no token
  const before = sent.rest.length;
  await page.reload();
  await expect(page.locator("#homeTitle")).toBeVisible();
  await expect.poll(() => sent.rest.length).toBeGreaterThan(before);
  expect(sent.rest.slice(before).every((r) => r.token === null)).toBe(true);
  expect(sent.session).toBe(1); // no token → no lms_session call
});

test("lms: the old cra_member key is deleted on load (sign in again)", async ({
  page,
}) => {
  const sent = await stubSupabase(page);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "cra_member",
      JSON.stringify({ id: "kid", grade: 3 }),
    );
  });
  await page.goto("/");
  await expect(page.locator("#homeTitle")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("cra_member")))
    .toBeNull();
  await expect(page.locator("#logoutBtn")).toBeHidden();
  expect(sent.session).toBe(0);
});

test("admin path unchanged: an @ ID goes to Supabase Auth, never lms_login", async ({
  page,
}) => {
  const sent = await stubSupabase(page);
  await page.goto("/#login");
  await fillLogin(page, "admin@example.com", "secret-pw");
  await expect(page.locator("#loginError")).toHaveText(
    "Login failed. Check your ID and password.",
  );
  expect(sent.auth).toBeGreaterThan(0);
  expect(sent.login).toHaveLength(0);
});

test("lms: the client's fetch adds the token to Supabase REST only", async ({
  page,
}) => {
  const sent = await stubSupabase(page, { session: SESSION_STUDENT });
  const otherHeaders = [];
  await page.route("https://example.org/**", (route) => {
    otherHeaders.push(route.request().headers()["x-lms-token"] ?? null);
    return route.fulfill({ json: {} });
  });
  await seedToken(page);
  await page.goto("/");
  await expect(page.locator("#logoutBtn")).toBeVisible();
  const check = sent.rest.find((r) => r.path === "/rest/v1/rpc/lms_session");
  expect(check.token).toBe(OK_STUDENT.token);

  // lmsFetch is the fetch the Supabase client was created with.
  await page.evaluate(async () => {
    const base = window.SUPABASE_URL;
    const urls = [
      `${base}/rest/v1/probe`,
      `${base}/auth/v1/health`,
      `${base}/storage/v1/object/public/covers/x.png`,
      "https://example.org/ping",
    ];
    for (const url of urls) await lmsFetch(url).catch(() => {});
    await lmsFetch(
      new Request(`${base}/rest/v1/probe-request`, {
        headers: { "x-keep": "1" },
      }),
    ).catch(() => {});
  });
  const tokenOf = (path) => sent.all.find((r) => r.path === path).token;
  expect(tokenOf("/rest/v1/probe")).toBe(OK_STUDENT.token);
  expect(tokenOf("/rest/v1/probe-request")).toBe(OK_STUDENT.token);
  expect(tokenOf("/auth/v1/health")).toBeNull();
  expect(tokenOf("/storage/v1/object/public/covers/x.png")).toBeNull();
  expect(otherHeaders).toEqual([null]);
});

test("lms session: a login made while the load-time check is in flight wins", async ({
  page,
}) => {
  const tokenB = "tok-teacher-b-000000000000000000000000000000";
  const sent = await stubSupabase(page, {
    login: [{ ...OK_STUDENT, token: tokenB, role: 2, display_name: "B" }],
    session: SESSION_STUDENT, // student A's token is still valid
    sessionDelayMs: 2000,
  });
  await seedToken(page); // student A was signed in on this tablet
  await page.goto("/#login");
  await fillLogin(page, "teacher-b", "5678");
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await expect.poll(() => sent.sessionDone, { timeout: 8000 }).toBe(1);
  await page.waitForTimeout(300); // let the late answer reach the page
  const stored = JSON.parse(await storedLms(page));
  expect(stored.token).toBe(tokenB);
  expect(stored.role).toBe(2);
});

test("lms login: an answer that lands after the form changed is dropped", async ({
  page,
}) => {
  const sent = await stubSupabase(page, {
    login: [CHOOSE],
    loginDelayMs: 1200,
  });
  await page.goto("/#login");
  await fillLogin(page, "kim", "1234");
  await page.locator("#loginPassword").fill("99999"); // edited while in flight
  await expect.poll(() => sent.loginDone, { timeout: 8000 }).toBe(1);
  await page.waitForTimeout(300);
  await expect(page.locator("#loginBranchChoice")).toBeHidden();
  await expect(page.locator("#loginBranchList button")).toHaveCount(0);
});

test("lms login: a double click sends one request", async ({ page }) => {
  const sent = await stubSupabase(page, {
    login: [{ status: "invalid" }, { status: "invalid" }],
    loginDelayMs: 800,
  });
  await page.goto("/#login");
  await page.locator("#loginId").fill("kim");
  await page.locator("#loginPassword").fill("1111");
  await page.locator("#loginForm .login-submit").dblclick();
  await expect(page.locator("#loginError")).toHaveText(
    "Please check your ID and password.",
  );
  await page.waitForTimeout(1200);
  expect(sent.login).toHaveLength(1);
});

test("lms login: a second branch tap while the first is in flight does nothing", async ({
  page,
}) => {
  const sent = await stubSupabase(page, {
    login: [CHOOSE, { ...OK_STUDENT, branch_id: "b-a", branch_name: "Busan" }],
    loginDelayMs: 800,
  });
  await page.goto("/#login");
  await fillLogin(page, "kim", "1234");
  const buttons = page.locator("#loginBranchList button.login-branch");
  await expect(buttons).toHaveCount(2);
  await buttons.nth(0).click();
  await buttons.nth(1).click();
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await page.waitForTimeout(1200);
  expect(sent.login).toHaveLength(2);
  expect(sent.login[1].p_branch_id).toBe("b-a");
});

test("lms login: leaving the login screen clears the password and the choice", async ({
  page,
}) => {
  await stubSupabase(page, { login: [CHOOSE] });
  await page.goto("/#login");
  await fillLogin(page, "kim", "1234");
  await expect(page.locator("#loginBranchChoice")).toBeVisible();
  await page.evaluate(() => {
    setHash("home");
    showScreen("home");
  });
  await expect(page.locator("#homeScreen")).toHaveClass(/screen-active/);
  await page.evaluate(() => {
    setHash("login");
    showScreen("login");
  });
  await expect(page.locator("#loginPassword")).toHaveValue("");
  await expect(page.locator("#loginBranchChoice")).toBeHidden();
});

test("lms session: a malformed stored token is dropped without a call", async ({
  page,
}) => {
  const sent = await stubSupabase(page, { session: SESSION_STUDENT });
  await seedToken(page, "bad token\nvalue");
  await page.goto("/");
  await expect(page.locator("#homeTitle")).toBeVisible();
  await expect.poll(() => storedLms(page)).toBeNull();
  expect(sent.session).toBe(0);
  await expect(page.locator("#logoutBtn")).toBeHidden();
});
