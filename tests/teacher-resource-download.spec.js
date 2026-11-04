import { expect, test } from "@playwright/test";
import { createHandler } from "../supabase/functions/teacher-resource-download/index.ts";

// The Edge Function supabase/functions/teacher-resource-download (B, (나)):
// its whole decision logic, run in Node with a fake fetch — no network. The
// DB side of the same contract (teacher_resource_issue) is checked in
// tests/teacher-resources-sql.spec.js; what only the live project can show
// (deploy, JWT verification setting, real signing) is a user check.

const URL_BASE = "https://proj.supabase.co";
const ENV = {
  SUPABASE_URL: URL_BASE,
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-0000",
  SUPABASE_ANON_KEY: "anon-key-0000",
};
const SITE = "https://www.cambridgereading.com";
const TOKEN = "tok-teacher-00000000000000000000000000000000";
const NAME = "2026 Beginner 연간 교육안.pdf";
const PATH = "beginner/plan/1730000000001.pdf";
// 자료실 (resource board, 2026-11-03): an attachment id → its file
const ATTACHMENT = "0f8e5a2c-1b3d-4e5f-8a9b-0c1d2e3f4a5b";
const BOARD_NAME = "2026_수료상장_양식(수정용).hwp";
const BOARD_PATH =
  "00000000-0000-4000-8000-000000000008/1730000000001-abc123.hwp";

// A fake Supabase: answers Auth /user, the issue RPC and Storage signing, and
// records every call.
function fakeSupabase({
  user = null,
  issue = { status: "ok", path: PATH, name: NAME },
  boardIssue = { status: "ok", path: BOARD_PATH, name: BOARD_NAME },
  rpcStatus = 200,
  signStatus = 200,
} = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    const call = {
      url: String(url),
      method: init.method || "GET",
      headers,
      body: init.body ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    const path = new URL(call.url).pathname;
    if (path === "/auth/v1/user") {
      return user
        ? Response.json({ id: user })
        : Response.json({ msg: "invalid JWT" }, { status: 401 });
    }
    if (path === "/rest/v1/rpc/teacher_resource_issue") {
      return Response.json(issue, { status: rpcStatus });
    }
    if (path === "/rest/v1/rpc/board_attachment_issue") {
      return Response.json(boardIssue, { status: rpcStatus });
    }
    if (
      path.startsWith("/storage/v1/object/sign/teacher-resources/") ||
      path.startsWith("/storage/v1/object/sign/resource-board/")
    ) {
      const object = path.slice("/storage/v1/object/sign/".length);
      return Response.json(
        signStatus === 200
          ? { signedURL: `/object/sign/${object}?token=signed-1` }
          : { error: "x" },
        { status: signStatus },
      );
    }
    return new Response("unexpected", { status: 599 });
  };
  return { calls, handler: createHandler(ENV, fetchImpl) };
}

function post(body, headers = {}) {
  return new Request(`${URL_BASE}/functions/v1/teacher-resource-download`, {
    method: "POST",
    headers: {
      origin: SITE,
      "content-type": "application/json",
      authorization: `Bearer ${ENV.SUPABASE_ANON_KEY}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
});

test("download fn: CORS — site origins only, preflight allows x-lms-token", async () => {
  const { handler, calls } = fakeSupabase();
  for (const origin of [
    "https://www.cambridgereading.com",
    "https://cambridgereading.com",
    "https://new-app0607.vercel.app",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ]) {
    const res = await handler(
      new Request(`${URL_BASE}/functions/v1/teacher-resource-download`, {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "POST" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(res.headers.get("access-control-allow-headers")).toContain(
      "x-lms-token",
    );
    expect(res.headers.get("vary")).toContain("Origin");
  }
  for (const origin of ["https://evil.example", "null", ""]) {
    const pre = await handler(
      new Request(`${URL_BASE}/functions/v1/teacher-resource-download`, {
        method: "OPTIONS",
        headers: origin ? { origin } : {},
      }),
    );
    expect(pre.status).toBe(403);
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
    const res = await handler(
      post(
        { level: "beginner", slot: "plan" },
        { origin, "x-lms-token": TOKEN },
      ),
    );
    expect(res.status).toBe(403);
  }
  expect(calls).toEqual([]); // refused before any Supabase call
});

test("download fn: bad method / body / nobody signed in → refused, no DB call", async () => {
  const { handler, calls } = fakeSupabase();
  const get = await handler(
    new Request(`${URL_BASE}/functions/v1/teacher-resource-download`, {
      headers: { origin: SITE },
    }),
  );
  expect(get.status).toBe(405);
  for (const body of [
    { level: "Level 1", slot: "plan" },
    { level: "beginner", slot: "../x" },
    { level: ["beginner"], slot: "plan" }, // String(["beginner"]) would pass a regex
    { level: "beginner", slot: ["plan"] },
    {},
  ]) {
    expect((await handler(post(body, { "x-lms-token": TOKEN }))).status).toBe(
      400,
    );
  }
  const broken = await handler(
    new Request(`${URL_BASE}/functions/v1/teacher-resource-download`, {
      method: "POST",
      headers: { origin: SITE, "x-lms-token": TOKEN },
      body: "{not json",
    }),
  );
  expect(broken.status).toBe(400);
  // anon key only, no LMS token (a visitor) → 401 without touching the DB
  const visitor = await handler(post({ level: "beginner", slot: "plan" }));
  expect(visitor.status).toBe(401);
  expect(visitor.headers.get("access-control-allow-origin")).toBe(SITE);
  expect(calls).toEqual([]);
});

// D65 (2026-11-02): the function checks only the SHAPE of a slot key (lower-
// case letters, digits and '-', 24 at most, a letter first); which keys a
// level has is the database's answer (teacher_resource_issue: no row =
// "empty" = 404) — so a new slot needs no redeploy. Today: monthly-03 …
// monthly-12 (월간교육안 3~12월) · plan · award · test · script · pictures ·
// flashcards.
test("download fn: D65 — any well-formed slot key goes to the DB; anything else is refused first", async () => {
  const { handler, calls } = fakeSupabase();
  const keys = [
    "monthly-03",
    "monthly-12",
    "plan",
    "award",
    "test",
    "script",
    "pictures",
    "flashcards",
  ];
  for (const slot of keys) {
    const res = await handler(
      post({ level: "level-2", slot }, { "x-lms-token": TOKEN }),
    );
    expect(res.status, slot).toBe(200);
  }
  const asked = calls
    .filter((c) => c.url.endsWith("/rest/v1/rpc/teacher_resource_issue"))
    .map((c) => c.body.p_slot);
  expect(asked).toEqual(keys);
  const before = calls.length;
  for (const slot of [
    "",
    "Monthly-03",
    "3-monthly",
    "-plan",
    "monthly_03",
    "monthly 03",
    "월간",
    "plan|award",
    "../plan",
    "a".repeat(25),
  ]) {
    const res = await handler(
      post({ level: "level-2", slot }, { "x-lms-token": TOKEN }),
    );
    expect(res.status, slot).toBe(400);
  }
  expect(calls.length).toBe(before); // refused before any Supabase call
});

test("download fn: an LMS teacher gets a 15-second URL named once-encoded", async () => {
  const { handler, calls } = fakeSupabase();
  const res = await handler(
    post(
      { level: "beginner", slot: "plan", expiresIn: 315360000 },
      { "x-lms-token": TOKEN },
    ),
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("access-control-allow-origin")).toBe(SITE);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const text = await res.text();
  expect(text).not.toContain(ENV.SUPABASE_SERVICE_ROLE_KEY);
  const { url } = JSON.parse(text);
  const signed = new URL(url);
  expect(`${signed.origin}${signed.pathname}`).toBe(
    `${URL_BASE}/storage/v1/object/sign/teacher-resources/${PATH}`,
  );
  expect(signed.searchParams.get("token")).toBe("signed-1");
  expect(signed.searchParams.get("download")).toBe(NAME); // decoded once = the name

  // anon key in Authorization → no Auth lookup; the RPC runs as the service
  // role with the caller's token forwarded; signing as the service role with
  // the FIXED 15 s (the client's expiresIn is ignored).
  expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
    "/rest/v1/rpc/teacher_resource_issue",
    `/storage/v1/object/sign/teacher-resources/${PATH}`,
  ]);
  const [rpc, sign] = calls;
  expect(rpc.method).toBe("POST");
  expect(rpc.headers.get("authorization")).toBe(
    `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`,
  );
  expect(rpc.headers.get("apikey")).toBe(ENV.SUPABASE_SERVICE_ROLE_KEY);
  expect(rpc.headers.get("x-lms-token")).toBe(TOKEN);
  expect(rpc.body).toEqual({
    p_level: "beginner",
    p_slot: "plan",
    p_admin_uid: null,
  });
  expect(sign.headers.get("authorization")).toBe(
    `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`,
  );
  expect(sign.body).toEqual({ expiresIn: 15 });
});

test("download fn: an admin is checked with Auth and passed as p_admin_uid", async () => {
  const { handler, calls } = fakeSupabase({ user: "admin-uid-1" });
  const res = await handler(
    post(
      { level: "level-3", slot: "test" },
      { authorization: "Bearer user.jwt.value" },
    ),
  );
  expect(res.status).toBe(200);
  const auth = calls.find((c) => new URL(c.url).pathname === "/auth/v1/user");
  expect(auth.headers.get("authorization")).toBe("Bearer user.jwt.value");
  const rpc = calls.find((c) => c.url.endsWith("/rpc/teacher_resource_issue"));
  expect(rpc.body).toEqual({
    p_level: "level-3",
    p_slot: "test",
    p_admin_uid: "admin-uid-1",
  });
  expect(rpc.headers.get("x-lms-token")).toBeNull();

  // a JWT Auth rejects, and no LMS token → 401, no RPC
  const bad = fakeSupabase({ user: null });
  const denied = await bad.handler(
    post(
      { level: "beginner", slot: "plan" },
      { authorization: "Bearer forged.jwt.x" },
    ),
  );
  expect(denied.status).toBe(401);
  expect(bad.calls.map((c) => new URL(c.url).pathname)).toEqual([
    "/auth/v1/user",
  ]);
});

test("download fn: denied / empty / limit / failures map to their statuses", async () => {
  const cases = [
    [{ issue: { status: "denied" } }, 401, "denied"],
    [{ issue: { status: "empty" } }, 404, "empty"],
    [{ issue: { status: "limit" } }, 429, "limit"],
    [{ rpcStatus: 500 }, 502, "failed"],
    [{ signStatus: 400 }, 502, "failed"],
  ];
  for (const [options, status, error] of cases) {
    const { handler, calls } = fakeSupabase(options);
    const res = await handler(
      post({ level: "beginner", slot: "plan" }, { "x-lms-token": TOKEN }),
    );
    expect(res.status, JSON.stringify(options)).toBe(status);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error });
    expect(text).not.toContain(ENV.SUPABASE_SERVICE_ROLE_KEY);
    expect(res.headers.get("access-control-allow-origin")).toBe(SITE);
    // a refused issue never reaches signing
    if (status !== 502 || options.rpcStatus) {
      expect(calls.some((c) => c.url.includes("/storage/"))).toBe(false);
    }
  }
});

// ---- 자료실 (resource board, 2026-11-03) -------------------------------------
// The same function takes {attachment: <id>} for a board file: the database
// decides who / which file / the shared 30-a-day count
// (board_attachment_issue), the function signs from the private
// "resource-board" bucket for the same fixed 15 seconds. The old
// {level, slot} request is untouched (the tests above).

test("download fn: a board attachment → board_attachment_issue → a 15-second URL from resource-board", async () => {
  const { handler, calls } = fakeSupabase();
  const res = await handler(
    post({ attachment: ATTACHMENT, expiresIn: 9999 }, { "x-lms-token": TOKEN }),
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("access-control-allow-origin")).toBe(SITE);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const text = await res.text();
  expect(text).not.toContain(ENV.SUPABASE_SERVICE_ROLE_KEY);
  const signed = new URL(JSON.parse(text).url);
  expect(`${signed.origin}${signed.pathname}`).toBe(
    `${URL_BASE}/storage/v1/object/sign/resource-board/${BOARD_PATH}`,
  );
  expect(signed.searchParams.get("download")).toBe(BOARD_NAME);
  expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
    "/rest/v1/rpc/board_attachment_issue",
    `/storage/v1/object/sign/resource-board/${BOARD_PATH}`,
  ]);
  const [rpc, sign] = calls;
  expect(rpc.headers.get("authorization")).toBe(
    `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`,
  );
  expect(rpc.headers.get("x-lms-token")).toBe(TOKEN);
  expect(rpc.body).toEqual({
    p_attachment_id: ATTACHMENT,
    p_admin_uid: null,
  });
  expect(sign.body).toEqual({ expiresIn: 15 });

  // an admin: checked with Auth, passed as p_admin_uid
  const admin = fakeSupabase({ user: "admin-uid-1" });
  const ok = await admin.handler(
    post(
      { attachment: ATTACHMENT },
      { authorization: "Bearer user.jwt.value" },
    ),
  );
  expect(ok.status).toBe(200);
  expect(
    admin.calls.find((c) => c.url.endsWith("/rpc/board_attachment_issue")).body,
  ).toEqual({ p_attachment_id: ATTACHMENT, p_admin_uid: "admin-uid-1" });

  // the old request still asks teacher_resource_issue only, from its bucket
  const old = fakeSupabase();
  await old.handler(
    post({ level: "beginner", slot: "plan" }, { "x-lms-token": TOKEN }),
  );
  expect(old.calls.map((c) => new URL(c.url).pathname)).toEqual([
    "/rest/v1/rpc/teacher_resource_issue",
    `/storage/v1/object/sign/teacher-resources/${PATH}`,
  ]);
});

test("download fn: a board request that is not exactly {attachment: <id>} is refused first", async () => {
  const { handler, calls } = fakeSupabase();
  for (const body of [
    { attachment: "" },
    { attachment: ATTACHMENT.toUpperCase() },
    { attachment: `${ATTACHMENT}x` },
    { attachment: "../resource-board/x" },
    { attachment: [ATTACHMENT] },
    { attachment: 12 },
    { attachment: ATTACHMENT, level: "beginner", slot: "plan" },
    { attachment: ATTACHMENT, slot: "plan" },
  ]) {
    const res = await handler(post(body, { "x-lms-token": TOKEN }));
    expect(res.status, JSON.stringify(body)).toBe(400);
  }
  // nobody signed in → 401 before the DB
  expect((await handler(post({ attachment: ATTACHMENT }))).status).toBe(401);
  expect(calls).toEqual([]);
});

test("download fn: board denied / off / empty / limit / failures map to their statuses", async () => {
  const cases = [
    [{ boardIssue: { status: "denied" } }, 401, "denied"],
    [{ boardIssue: { status: "off" } }, 403, "off"],
    [{ boardIssue: { status: "empty" } }, 404, "empty"],
    [{ boardIssue: { status: "limit" } }, 429, "limit"],
    [{ boardIssue: { status: "?" } }, 502, "failed"],
    [{ rpcStatus: 500 }, 502, "failed"],
    [{ signStatus: 400 }, 502, "failed"],
  ];
  for (const [options, status, error] of cases) {
    const { handler, calls } = fakeSupabase(options);
    const res = await handler(
      post({ attachment: ATTACHMENT }, { "x-lms-token": TOKEN }),
    );
    expect(res.status, JSON.stringify(options)).toBe(status);
    expect(await res.json()).toEqual({ error });
    if (!options.signStatus) {
      expect(calls.some((c) => c.url.includes("/storage/"))).toBe(false);
    }
  }
  // "off" is a board answer only: the old request maps it as before (502)
  const old = fakeSupabase({ issue: { status: "off" } });
  const res = await old.handler(
    post({ level: "beginner", slot: "plan" }, { "x-lms-token": TOKEN }),
  );
  expect(res.status).toBe(502);
});
