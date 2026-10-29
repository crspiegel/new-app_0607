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

// A fake Supabase: answers Auth /user, the issue RPC and Storage signing, and
// records every call.
function fakeSupabase({
  user = null,
  issue = { status: "ok", path: PATH, name: NAME },
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
    if (path.startsWith("/storage/v1/object/sign/teacher-resources/")) {
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

test("download fn: an LMS teacher gets a 60-second URL named once-encoded", async () => {
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
  // the FIXED 60 s (the client's expiresIn is ignored).
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
  expect(sign.body).toEqual({ expiresIn: 60 });
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
