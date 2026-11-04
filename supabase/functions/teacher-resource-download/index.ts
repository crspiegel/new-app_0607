// @ts-nocheck — plain JavaScript in a .ts file (the Dashboard's default name).
// ============================================================================
// teacher-resource-download — Supabase Edge Function (교사 자료실, B, (나))
// ----------------------------------------------------------------------------
// The ONLY way to a teacher-resources file: the browser posts {level, slot};
// this function decides who is asking, lets the database pick the slot's
// current file and count the daily limit (teacher_resource_issue, service
// role), then signs a Storage URL that expires after 15 seconds — fixed here,
// never taken from the request — with the original file name as download=.
//
// Who may: an admin (Supabase Auth user in public.admins — the JWT in
// Authorization is checked with Auth here, then its user id is passed on), or
// an LMS branch / teacher (role 1 / 2) — the x-lms-token header is forwarded
// to the database, where lms_member() checks the session, the member and the
// branch. LMS members: 30 URLs per KST day; admins: no limit.
//
// One file, no imports: paste it into the Supabase Dashboard editor as is
// (supabase/functions/README.md). SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// SUPABASE_ANON_KEY are provided to every Edge Function by Supabase. The
// service role key stays in this function: it is never logged, echoed or
// sent anywhere but Supabase itself.
// Tested in Node with a fake fetch: tests/teacher-resource-download.spec.js.
//
// 자료실 (resource board, 2026-11-03): the same function also takes
// {attachment: <attachment id>} for a board file — the database decides who
// may, which file (a FILE of a public post; the admin: any post) and counts
// the same daily limit (board_attachment_issue, one 30-a-day log with the
// teacher resources); the URL is signed from the private "resource-board"
// bucket for the same fixed 15 seconds. The {level, slot} request is
// unchanged.
// ============================================================================

const BUCKET = "teacher-resources";
const BOARD_BUCKET = "resource-board"; // 자료실 attachments (2026-11-03)
const EXPIRES_IN = 15; // seconds — fixed on the server
const ALLOWED_ORIGINS = [
  "https://www.cambridgereading.com",
  "https://cambridgereading.com",
  "https://new-app0607.vercel.app",
  "http://127.0.0.1:5173", // local dev (npm run dev)
  "http://localhost:5173",
];
const LEVEL_RE = /^(beginner|level-[123])$/;
// A slot key's SHAPE only (D65, 2026-11-02): lowercase letters, digits and
// '-', a letter first, 24 at most. Which keys a level has is the database's
// answer — teacher_resource_issue finds no row for anything else ("empty" →
// 404) — so a new slot needs no redeploy. Today: monthly-03 … monthly-12
// (월간교육안 3~12월) · plan (연간교육안) · award · test (level-2/3) · script ·
// pictures · flashcards.
const SLOT_RE = /^[a-z][a-z0-9-]{0,23}$/;
const LMS_TOKEN_RE = /^[A-Za-z0-9_-]{8,256}$/;
// A board attachment id (a lower-case UUID, as the database returns it).
const ATTACHMENT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISSUE_STATUS = { denied: 401, empty: 404, limit: 429 };
// The board's answers: the same, plus "off" (the admin switched it off).
const BOARD_STATUS = { ...ISSUE_STATUS, off: 403 };

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-lms-token",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
  };
}

function reply(origin, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(origin ? corsHeaders(origin) : { Vary: "Origin" }),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export function createHandler(env, fetchImpl = fetch) {
  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = env.SUPABASE_ANON_KEY;
  const asService = {
    apikey: service,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json",
  };

  // The admin's user id when Authorization carries a user JWT that Auth
  // accepts; null for the anon key, anything Auth refuses, or no header.
  async function adminUserId(request) {
    const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
    const jwt = match ? match[1].trim() : "";
    if (!jwt || jwt === anon) return null;
    const res = await fetchImpl(`${base}/auth/v1/user`, {
      headers: { apikey: anon || service, Authorization: `Bearer ${jwt}` },
    });
    if (!res.ok) return null;
    const user = await res.json().catch(() => null);
    return user && typeof user.id === "string" ? user.id : null;
  }

  return async function handle(request) {
    const origin = request.headers.get("origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : null;
    if (!allowed) return reply(null, 403, { error: "origin" });
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(allowed) });
    }
    if (request.method !== "POST") return reply(allowed, 405, { error: "method" });

    let body = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    // Exactly one of the two requests: {attachment} (a board file) or
    // {level, slot} (a teacher-resources slot, as before).
    const isObject = body !== null && typeof body === "object";
    const board = isObject && "attachment" in body;
    const attachment = board ? body.attachment : null;
    const level = isObject ? body.level : undefined;
    const slot = isObject ? body.slot : undefined;
    if (board) {
      if (
        typeof attachment !== "string" ||
        !ATTACHMENT_RE.test(attachment) ||
        level !== undefined ||
        slot !== undefined
      ) {
        return reply(allowed, 400, { error: "bad request" });
      }
    } else if (
      typeof level !== "string" ||
      typeof slot !== "string" ||
      !LEVEL_RE.test(level) ||
      !SLOT_RE.test(slot)
    ) {
      return reply(allowed, 400, { error: "bad request" });
    }

    try {
      const adminUid = await adminUserId(request);
      const rawToken = request.headers.get("x-lms-token") || "";
      const lmsToken = LMS_TOKEN_RE.test(rawToken) ? rawToken : null;
      if (!adminUid && !lmsToken) return reply(allowed, 401, { error: "denied" });

      // Who may, which file, the daily limit: all decided in the database.
      const rpc = await fetchImpl(
        `${base}/rest/v1/rpc/${board ? "board_attachment_issue" : "teacher_resource_issue"}`,
        {
          method: "POST",
          headers: lmsToken ? { ...asService, "x-lms-token": lmsToken } : asService,
          body: JSON.stringify(
            board
              ? { p_attachment_id: attachment, p_admin_uid: adminUid }
              : { p_level: level, p_slot: slot, p_admin_uid: adminUid },
          ),
        },
      );
      if (!rpc.ok) return reply(allowed, 502, { error: "failed" });
      const issue = await rpc.json();
      if (!issue || issue.status !== "ok") {
        const statuses = board ? BOARD_STATUS : ISSUE_STATUS;
        const status =
          (issue && Object.hasOwn(statuses, issue.status) && statuses[issue.status]) || 502;
        return reply(allowed, status, {
          error: status === 502 ? "failed" : issue.status,
        });
      }

      const objectPath = String(issue.path).split("/").map(encodeURIComponent).join("/");
      const sign = await fetchImpl(
        `${base}/storage/v1/object/sign/${board ? BOARD_BUCKET : BUCKET}/${objectPath}`,
        {
          method: "POST",
          headers: asService,
          body: JSON.stringify({ expiresIn: EXPIRES_IN }),
        },
      );
      const signed = sign.ok ? await sign.json().catch(() => null) : null;
      if (!signed || typeof signed.signedURL !== "string") {
        return reply(allowed, 502, { error: "failed" });
      }
      // The original (Korean) name, encoded ONCE: the Storage API answers
      // with Content-Disposition: attachment; filename*=UTF-8''<name>.
      const url = `${base}/storage/v1${signed.signedURL}&download=${encodeURIComponent(issue.name)}`;
      return reply(allowed, 200, { url });
    } catch {
      return reply(allowed, 502, { error: "failed" });
    }
  };
}

// Supabase Edge Runtime (Deno): serve. In Node (the tests) there is no Deno.
const deno = (globalThis as any).Deno;
if (deno && typeof deno.serve === "function") {
  deno.serve(
    createHandler({
      SUPABASE_URL: deno.env.get("SUPABASE_URL"),
      SUPABASE_SERVICE_ROLE_KEY: deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      SUPABASE_ANON_KEY: deno.env.get("SUPABASE_ANON_KEY"),
    }),
  );
}
