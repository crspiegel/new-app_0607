// A fake Supabase for the 자료실 (resource board) screens — not a spec file.
// Every request to *.supabase.co is answered here (REST, RPC, Auth, Storage,
// the download Edge Function, Google) so the live project is never reached.
// The board RPCs follow supabase/migration.sql "Resource board" (the SQL side
// of the same contract is tests/resource-board-sql.spec.js): who may read,
// the switch, level + 공통, category, search, sort, pinned first, 10 a page,
// prev / next, views once per member, admin writes.

export const SUPABASE = /^https:\/\/[^/]+\.supabase\.co\//;
export const GOOGLE = /^https:\/\/(drive|docs)\.google\.com\//;
export const TOKEN = "tok-board-0000000000000000000000000000000000";
export const FN_PATH = "/functions/v1/teacher-resource-download";
export const ROLE_SESSION = {
  branch: { role: 1, branch_name: "TPS 본사", display_name: "지사" },
  teacher: { role: 2, branch_name: "TPS 본사", display_name: "김선생" },
  student: { role: 3, branch_name: "TPS 본사", display_name: "Kid" },
};
const BLANK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export const CATEGORIES = [
  { id: 1, name: "월간교육안", color: "sky" },
  { id: 2, name: "연간교육안", color: "indigo" },
  { id: 3, name: "상장", color: "yellow" },
  { id: 4, name: "테스트", color: "red" },
  { id: 5, name: "핵심문장 스크립트", color: "green" },
  { id: 6, name: "그림 자료실", color: "purple" },
  { id: 7, name: "플래쉬카드", color: "orange" },
];

export const pid = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const aid = (n) =>
  `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const DRIVE_A = "1AbC-dEf_GhIjKlMnOpQrStUvWxYz012";

// "N days ago, at noon KST" as an ISO string.
export function daysAgo(days, minutes = 0) {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const ymd = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
  );
  return new Date(
    ymd - days * 86400000 + (12 - 9) * 3600000 - minutes * 60000,
  ).toISOString();
}

let attachmentSeq = 1000;
export function file(name, size = 820000, extra = {}) {
  attachmentSeq += 1;
  const ext = name.split(".").pop().toLowerCase();
  return {
    id: aid(attachmentSeq),
    kind: "file",
    name,
    ext,
    size,
    drive_id: null,
    path: `post/${attachmentSeq}.${ext}`,
    ...extra,
  };
}
export function drive(name, id = DRIVE_A) {
  attachmentSeq += 1;
  return {
    id: aid(attachmentSeq),
    kind: "drive",
    name,
    ext: null,
    size: null,
    drive_id: id,
  };
}

// The posts of the final previews (F1-F5): 12 public + 1 hidden.
export function samplePosts() {
  return [
    {
      n: 1,
      title: "Level 1 월간교육안 (3월~12월)",
      level: "level-1",
      category: 1,
      pinned: true,
      days: 2,
      views: 64,
      attachments: Array.from({ length: 10 }, (_, i) =>
        file(
          `L1_월간교육안_${String(i + 3).padStart(2, "0")}월.pdf`,
          1100000 + i * 37000,
        ),
      ),
    },
    {
      n: 2,
      title: "2026 연간교육안 — 전 레벨",
      level: "common",
      category: 2,
      pinned: true,
      days: 5,
      views: 152,
      attachments: [
        file("2026_연간교육안_Beginner.pdf"),
        file("2026_연간교육안_Level1.pdf"),
        file("2026_연간교육안_Level2.pdf"),
        file("2026_연간교육안_Level3.pdf"),
      ],
    },
    {
      n: 3,
      title: "11월 핵심문장 스크립트 (Book 1 · Book 2)",
      level: "level-2",
      category: 5,
      days: 1,
      views: 18,
      attachments: [
        file("L2_11월_Book1_스크립트.pdf"),
        file("L2_11월_Book2_스크립트.hwp", 240000),
      ],
    },
    {
      n: 4,
      title: "11월 플래쉬카드 모음",
      level: "beginner",
      category: 7,
      days: 1,
      views: 22,
      attachments: [file("B_11월_플래쉬카드.pptx", 4300000)],
    },
    {
      n: 5,
      title: "Level 2 월간교육안 (3월~12월)",
      level: "level-2",
      category: 1,
      days: 2,
      views: 47,
      attachments: Array.from({ length: 10 }, (_, i) =>
        file(`L2_월간교육안_${String(i + 3).padStart(2, "0")}월.pdf`),
      ),
    },
    {
      n: 6,
      title: "2학기 테스트지 + 답안지",
      level: "level-3",
      category: 4,
      days: 4,
      views: 88,
      attachments: [
        file("L3_2학기_테스트지.pdf"),
        file("L3_2학기_답안지.xlsx", 47000),
      ],
    },
    {
      n: 7,
      title: "10월 그림 자료 모음",
      level: "level-1",
      category: 6,
      days: 7,
      views: 73,
      attachments: Array.from({ length: 8 }, (_, i) =>
        file(`L1_10월_그림_${i + 1}.jpg`, 900000),
      ),
    },
    {
      n: 8,
      title: "2026 수료 상장 양식",
      level: "common",
      category: 3,
      days: 8,
      views: 135,
      body: "수료식에 사용할 상장 양식입니다.\n원 이름과 날짜는 한글 파일에서 고쳐 쓰시고, 고화질 배경은 구글 드라이브에서 받으세요.",
      attachments: [
        file("2026_수료상장_양식.pdf", 820000),
        file("2026_수료상장_양식(수정용).hwp", 240000),
        drive("수료 상장 배경 이미지 (고화질)"),
      ],
    },
    {
      n: 9,
      title: "10월 핵심문장 스크립트",
      level: "level-3",
      category: 5,
      days: 33,
      views: 96,
      attachments: [
        file("L3_10월_스크립트.pdf"),
        file("L3_10월_스크립트.hwpx", 210000),
      ],
    },
    {
      n: 10,
      title: "10월 플래쉬카드 모음",
      level: "level-1",
      category: 7,
      days: 34,
      views: 81,
      attachments: [file("L1_10월_플래쉬카드.pptx", 3900000)],
    },
    {
      n: 11,
      title: "9월 월간교육안 안내",
      level: "beginner",
      category: 1,
      days: 60,
      views: 5,
      attachments: [],
    },
    {
      n: 12,
      title: "숨긴 글 (준비 중)",
      level: "level-1",
      category: 3,
      days: 0,
      views: 0,
      published: false,
      attachments: [],
    },
    {
      n: 13,
      title: "Good Morning · Good Bye 노래 가사판",
      level: "common",
      category: 6,
      days: 61,
      views: 210,
      attachments: [
        file("GoodMorning_가사판.png", 600000),
        file("GoodBye_가사판.png", 610000),
      ],
    },
  ].map((p) => ({
    id: pid(p.n),
    title: p.title,
    body: p.body ?? "",
    level: p.level,
    category: p.category,
    pinned: Boolean(p.pinned),
    published: p.published ?? true,
    views: p.views,
    created_at: daysAgo(p.days, p.n),
    attachments: p.attachments,
  }));
}

function kstDate(iso) {
  return new Date(new Date(iso).getTime() + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
}
function isNew(iso) {
  const today = kstDate(new Date().toISOString());
  return (Date.parse(today) - Date.parse(kstDate(iso))) / 86400000 < 7;
}

// The teachers' order (SQL board_ranked): public, level + common, category,
// title/body words, pinned first, then newest or most viewed.
function ranked(posts, { p_level, p_category, p_q, p_sort }) {
  const level = ["beginner", "level-1", "level-2", "level-3"].includes(p_level)
    ? p_level
    : null;
  const q = (p_q || "").trim().toLowerCase();
  return posts
    .filter((p) => p.published)
    .filter((p) => !level || p.level === level || p.level === "common")
    .filter((p) => !p_category || p.category === p_category)
    .filter(
      (p) =>
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (p_sort === "views" ? b.views - a.views : 0) ||
        Date.parse(b.created_at) - Date.parse(a.created_at),
    );
}

/**
 * stubBoard(page, options) → `sent` (what the page asked for).
 * options: role (null | "student" | "teacher" | "branch" | "admin"),
 * board (the switch, default true), teacherRes (default true), posts,
 * categories, holdUploads (true = uploads wait for sent.release()),
 * failUpload (name predicate), downloadStatus (e.g. 429), flagError (a
 * switch save answered with this failure: { status, json } — e.g. 401 +
 * PostgREST's {code: "42501", message} — and nothing is saved).
 */
export async function stubBoard(page, options = {}) {
  const {
    role = "teacher",
    board = true,
    teacherRes = true,
    posts = samplePosts(),
    categories = CATEGORIES.map((c) => ({ ...c })),
    holdUploads = false,
    failUpload = () => false,
    downloadStatus = 200,
    flagError = null,
  } = options;
  const db = {
    posts,
    categories,
    flags: { board, teacherRes },
    viewed: new Set(),
  };
  const sent = {
    rpc: [],
    uploads: [],
    removed: [],
    fn: [],
    downloads: [],
    google: [],
    upserts: [],
    inFlight: 0,
    maxInFlight: 0,
    db,
    waiting: [],
    release() {
      const list = sent.waiting.splice(0);
      list.forEach((resolve) => resolve());
      return list.length;
    },
  };
  const isAdminRole = role === "admin";
  const reader = isAdminRole || role === "teacher" || role === "branch";
  const category = (id) =>
    db.categories.find((c) => c.id === Number(id)) || null;
  const filesOf = (p) => p.attachments.length;
  const listItem = (p) => ({
    id: p.id,
    title: p.title,
    level: p.level,
    category: p.category,
    pinned: p.pinned,
    files: filesOf(p),
    views: p.views,
    created_at: p.created_at,
    is_new: isNew(p.created_at),
  });

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
  if (isAdminRole) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "admin-uid", role: "authenticated", exp })}.sig`;
    await page.addInitScript((jwt) => {
      const now = Math.floor(Date.now() / 1000);
      localStorage.setItem(
        "sb-jguuexcgyvyljbcqfpib-auth-token",
        JSON.stringify({
          access_token: jwt,
          token_type: "bearer",
          expires_in: 3600,
          expires_at: now + 3600,
          refresh_token: "refresh",
          user: { id: "admin-uid", aud: "authenticated" },
        }),
      );
    }, jwt);
  }

  const rpc = {
    lms_session: () => ROLE_SESSION[role] ?? null,
    is_admin: () => isAdminRole,
    lms_logout: () => null,
    teacher_resources_list: (a) => {
      if (!(isAdminRole || (reader && db.flags.teacherRes))) return [];
      return ["plan", "award"].map((slot) => ({
        slot,
        file_name: slot === "plan" ? "연간교육안.pdf" : null,
        file_size: slot === "plan" ? 1000 : null,
        updated_at: slot === "plan" ? "2026-10-29T03:00:00Z" : null,
        drive_id: null,
        level: a.p_level,
      }));
    },
    board_list: (a) => {
      if (!reader) return { status: "denied" };
      if (!isAdminRole && !db.flags.board) return { status: "off" };
      const rows = ranked(db.posts, a);
      const pages = Math.max(1, Math.ceil(rows.length / 10));
      const pageNo = Math.min(Math.max(a.p_page || 1, 1), pages);
      return {
        status: "ok",
        total: rows.length,
        page: pageNo,
        pages,
        page_size: 10,
        items: rows.slice((pageNo - 1) * 10, pageNo * 10).map(listItem),
        categories: db.categories.map(({ id, name, color }) => ({
          id,
          name,
          color,
        })),
      };
    },
    board_post_get: (a) => {
      if (!reader) return { status: "denied" };
      if (!isAdminRole && !db.flags.board) return { status: "off" };
      const p = db.posts.find(
        (x) => x.id === a.p_id && (x.published || isAdminRole),
      );
      if (!p) return { status: "missing" };
      if (!isAdminRole && !db.viewed.has(p.id)) {
        db.viewed.add(p.id);
        p.views += 1;
      }
      const rows = ranked(db.posts, a);
      const i = rows.findIndex((x) => x.id === p.id);
      const near = (x) =>
        x ? { id: x.id, title: x.title, created_at: x.created_at } : null;
      const c = category(p.category);
      return {
        status: "ok",
        post: { ...listItem(p), body: p.body, published: p.published },
        category: c ? { id: c.id, name: c.name, color: c.color } : null,
        attachments: p.attachments.map(
          ({ id, kind, name, ext, size, drive_id }) => ({
            id,
            kind,
            name,
            ext,
            size,
            drive_id,
          }),
        ),
        prev: i > 0 ? near(rows[i - 1]) : null,
        next: i >= 0 && i < rows.length - 1 ? near(rows[i + 1]) : null,
      };
    },
    board_admin_list: (a) => {
      const q = (a.p_q || "").trim().toLowerCase();
      const rows = db.posts
        .filter((p) => !a.p_level || p.level === a.p_level)
        .filter((p) => !a.p_category || p.category === a.p_category)
        .filter((p) => a.p_status !== "public" || p.published)
        .filter((p) => a.p_status !== "hidden" || !p.published)
        .filter((p) => !q || p.title.toLowerCase().includes(q))
        .sort(
          (x, y) =>
            Number(y.pinned) - Number(x.pinned) ||
            Date.parse(y.created_at) - Date.parse(x.created_at),
        );
      const pages = Math.max(1, Math.ceil(rows.length / 20));
      const pageNo = Math.min(Math.max(a.p_page || 1, 1), pages);
      return {
        status: "ok",
        total: rows.length,
        page: pageNo,
        pages,
        page_size: 20,
        items: rows
          .slice((pageNo - 1) * 20, pageNo * 20)
          .map((p) => ({ ...listItem(p), published: p.published })),
        categories: db.categories.map((c) => ({
          ...c,
          posts: db.posts.filter((p) => p.category === c.id).length,
        })),
      };
    },
    board_admin_get: (a) => {
      const p = db.posts.find((x) => x.id === a.p_id);
      if (!p) return { status: "missing" };
      return {
        status: "ok",
        post: {
          id: p.id,
          title: p.title,
          body: p.body,
          level: p.level,
          category: p.category,
          pinned: p.pinned,
          published: p.published,
          views: p.views,
          created_at: p.created_at,
        },
        attachments: p.attachments.map(
          ({ id, kind, name, ext, size, drive_id, type }) => ({
            id,
            kind,
            name,
            ext,
            size,
            type: type ?? null,
            drive_id,
          }),
        ),
      };
    },
    board_post_save: (a) => {
      let p = db.posts.find((x) => x.id === a.p_id);
      const before = p ? p.attachments : [];
      const keep = new Set(
        a.p_attachments.filter((x) => x.id).map((x) => x.id),
      );
      const removed = before
        .filter((x) => !keep.has(x.id) && x.kind === "file")
        .map((x) => x.path);
      const attachments = a.p_attachments.map((x) => {
        if (x.id) {
          const old = before.find((b) => b.id === x.id);
          return x.label ? { ...old, name: x.label } : old;
        }
        attachmentSeq += 1;
        if (x.kind === "drive")
          return {
            id: aid(attachmentSeq),
            kind: "drive",
            name: x.label,
            ext: null,
            size: null,
            drive_id: x.drive_id,
          };
        return {
          id: aid(attachmentSeq),
          kind: "file",
          name: x.name,
          ext: x.path.split(".").pop(),
          size: x.size,
          type: x.type,
          drive_id: null,
          path: x.path,
        };
      });
      const fields = {
        title: a.p_title.trim(),
        body: a.p_body,
        level: a.p_level,
        category: a.p_category,
        published: a.p_published,
        pinned: a.p_pinned,
        attachments,
      };
      if (p) Object.assign(p, fields);
      else {
        p = {
          id: a.p_id,
          views: 0,
          created_at: new Date().toISOString(),
          ...fields,
        };
        db.posts.push(p);
      }
      return { status: "ok", id: p.id, removed };
    },
    board_post_delete: (a) => {
      const p = db.posts.find((x) => x.id === a.p_id);
      if (!p) return { status: "missing", removed: [] };
      db.posts = db.posts.filter((x) => x !== p);
      return {
        status: "ok",
        removed: p.attachments
          .filter((x) => x.kind === "file")
          .map((x) => x.path),
      };
    },
    board_category_save: (a) => {
      const name = a.p_name.trim();
      if (
        db.categories.some(
          (c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== a.p_id,
        )
      )
        return { status: "duplicate" };
      if (a.p_id == null) {
        const id = Math.max(0, ...db.categories.map((c) => c.id)) + 1;
        db.categories.push({ id, name, color: "teal" });
        return { status: "ok", id };
      }
      const c = category(a.p_id);
      if (!c) return { status: "missing" };
      c.name = name;
      return { status: "ok", id: c.id };
    },
    board_category_order: (a) => {
      db.categories = a.p_ids.map((id) => category(id));
      return { status: "ok" };
    },
    board_category_delete: (a) => {
      const posts = db.posts.filter((p) => p.category === a.p_id).length;
      if (!category(a.p_id)) return { status: "missing", posts: 0 };
      if (posts) return { status: "in_use", posts };
      db.categories = db.categories.filter((c) => c.id !== a.p_id);
      return { status: "ok", posts: 0 };
    },
  };

  await page.route(SUPABASE, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const method = request.method();
    if (pathname.startsWith("/rest/v1/rpc/")) {
      const name = pathname.slice("/rest/v1/rpc/".length);
      const args = request.postDataJSON() || {};
      sent.rpc.push({
        name,
        args,
        token: request.headers()["x-lms-token"] ?? null,
      });
      const answer = rpc[name] ? rpc[name](args) : null;
      if (name === "lms_logout")
        return route.fulfill({ status: 204, body: "" });
      return route.fulfill({ json: answer });
    }
    if (pathname === "/rest/v1/site_settings") {
      if (method === "POST") {
        const body = request.postDataJSON();
        const row = Array.isArray(body) ? body[0] : body;
        sent.upserts.push(row);
        if (flagError)
          return route.fulfill({
            status: flagError.status,
            json: flagError.json,
          });
        if (row.key === "resource_board_enabled")
          db.flags.board = row.value === true;
        if (row.key === "teacher_resources_enabled")
          db.flags.teacherRes = row.value !== false;
        return route.fulfill({ status: 201, json: [row] });
      }
      return route.fulfill({
        json: [
          { key: "signup_visible", value: false },
          { key: "resource_board_enabled", value: db.flags.board },
          { key: "teacher_resources_enabled", value: db.flags.teacherRes },
        ],
      });
    }
    if (pathname === FN_PATH) {
      const body = request.postDataJSON() || {};
      sent.fn.push({ body, token: request.headers()["x-lms-token"] ?? null });
      if (downloadStatus !== 200)
        return route.fulfill({ status: downloadStatus, json: { error: "x" } });
      const att = db.posts
        .flatMap((p) => p.attachments)
        .find((x) => x.id === body.attachment);
      const name = att ? att.name : "file.pdf";
      return route.fulfill({
        json: {
          url: `${url.origin}/storage/v1/object/sign/resource-board/x.pdf?token=signed-1&download=${encodeURIComponent(name)}`,
        },
      });
    }
    if (pathname.startsWith("/storage/v1/object/sign/resource-board/")) {
      const name = url.searchParams.get("download") || "file.pdf";
      sent.downloads.push(name);
      return route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        },
        body: "%PDF-1.4 test",
      });
    }
    if (
      pathname === "/storage/v1/object/resource-board" &&
      method === "DELETE"
    ) {
      const body = request.postDataJSON() || {};
      sent.removed.push(...(body.prefixes || []));
      return route.fulfill({ json: [] });
    }
    if (
      pathname.startsWith("/storage/v1/object/resource-board/") &&
      method === "POST"
    ) {
      const path = pathname.slice("/storage/v1/object/resource-board/".length);
      const headers = request.headers();
      const entry = {
        path,
        contentType: headers["content-type"],
        auth: headers.authorization,
        size: (request.postDataBuffer() || Buffer.alloc(0)).length,
      };
      sent.uploads.push(entry);
      sent.inFlight += 1;
      sent.maxInFlight = Math.max(sent.maxInFlight, sent.inFlight);
      if (holdUploads)
        await new Promise((resolve) => sent.waiting.push(resolve));
      sent.inFlight -= 1;
      if (failUpload(path))
        return route.fulfill({ status: 500, json: { error: "x" } });
      return route
        .fulfill({ json: { Key: `resource-board/${path}` } })
        .catch(() => {});
    }
    if (pathname.startsWith("/auth/v1/logout"))
      return route.fulfill({ status: 204, body: "" });
    if (pathname.startsWith("/auth/v1/"))
      return route.fulfill({ status: 400, json: { error: "invalid_grant" } });
    if (pathname.startsWith("/storage/v1/object/list"))
      return route.fulfill({ json: [] });
    if (pathname.startsWith("/storage/"))
      return route.fulfill({ contentType: "image/png", body: BLANK_PNG });
    return route.fulfill({ json: [] });
  });
  return sent;
}
