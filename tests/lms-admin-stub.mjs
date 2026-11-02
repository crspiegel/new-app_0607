// The in-memory LMS behind tests/lms-admin.spec.js (and the Phase 3B
// screenshot script): answers every Supabase call of the page — RPCs,
// REST selects, auth, storage — following the RPC contract of
// supabase/migration.sql "LMS (Phase 3B)". Not a spec file itself.
// The permission rules themselves are checked in SQL (verify-3b.sql).

const SUPABASE = /^https:\/\/[^/]+\.supabase\.co\//;
const BLANK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const ADMIN_UID = "admin-uid";

function fakeJwt(sub) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", exp })}.sig`;
}

// Branch A (지사A) with a branch account, two teachers, students; branch B.
export function seedData() {
  const branches = [
    { id: "br-a", code: "a", name: "지사A", active: true },
    { id: "br-b", code: "b", name: "지사B", active: true },
  ];
  const m = (member_id, login_id, role, branch_id, extra = {}) => ({
    member_id,
    login_id,
    role,
    branch_id,
    display_name: null,
    active: true,
    locked_until: null,
    ...extra,
  });
  const members = [
    m("m-ba", "ba", 1, "br-a", { display_name: "지사 A" }),
    m("m-ta1", "ta1", 2, "br-a", { display_name: "선생님1" }),
    m("m-ta2", "ta2", 2, "br-a", { display_name: "선생님2" }),
    m("m-s1", "s1", 3, "br-a", { display_name: "학생1" }),
    m("m-s2", "s2", 3, "br-a", { display_name: "학생2" }),
    m("m-s3", "s3", 3, "br-a", { display_name: "학생3" }),
    m("m-lk", "lk", 3, "br-a", {
      display_name: "잠긴학생",
      locked_until: Date.now() + 7 * 60 * 1000,
    }),
    m("m-kim", "kim", 3, "br-a", { display_name: "김" }),
    m("m-bb", "bb", 1, "br-b"),
    m("m-tb", "tb", 2, "br-b"),
    m("m-sb", "sb", 3, "br-b"),
  ];
  const classes = [
    {
      id: "c-a1",
      branch_id: "br-a",
      name: "A1반",
      teacher_id: "m-ta1",
      active: true,
    },
    {
      id: "c-a2",
      branch_id: "br-a",
      name: "A2반",
      teacher_id: "m-ta2",
      active: true,
    },
    {
      id: "c-b",
      branch_id: "br-b",
      name: "B반",
      teacher_id: "m-tb",
      active: true,
    },
  ];
  // s1, lk in A1; s2 in A2; s3 and kim in no class; sb in B.
  const classMembers = [
    { class_id: "c-a1", member_id: "m-s1" },
    { class_id: "c-a1", member_id: "m-lk" },
    { class_id: "c-a2", member_id: "m-s2" },
    { class_id: "c-b", member_id: "m-sb" },
  ];
  return { branches, members, classes, classMembers };
}

// 43-character tokens, like lms_login's (the page drops anything shorter).
export const TOKENS = {
  branch: "tok-branch-a-000000000000000000000000000000",
  teacher: "tok-teacher-1-00000000000000000000000000000",
  student: "tok-student-1-00000000000000000000000000000",
};
const TOKEN_MEMBER = {
  [TOKENS.branch]: "m-ba",
  [TOKENS.teacher]: "m-ta1",
  [TOKENS.student]: "m-s1",
};
const deny = (route) =>
  route.fulfill({
    status: 403,
    json: { code: "42501", message: "not allowed" },
  });

// The page's Supabase calls, answered from `data`. `role` = who is signed in
// on load: "admin" (JWT session), "branch" | "teacher" | "student" (LMS
// token), or null. `classMembers` = extra memberships on top of the seed.
// Returns the recorded calls.
export async function stubLms(
  page,
  { role = null, login = [], adminLogin = false, classMembers = [] },
) {
  const data = seedData();
  data.classMembers.push(...classMembers);
  const sent = { rpc: [], login: [], logout: [], auth: 0 };
  let adminSignedIn = role === "admin";
  await page.addInitScript(
    ({ role, token }) => {
      try {
        localStorage.setItem("cra:dev-live", "1");
        if (token && !sessionStorage.getItem("seeded")) {
          sessionStorage.setItem("seeded", "1");
          localStorage.setItem(
            "cra_lms",
            JSON.stringify({
              token,
              role: { branch: 1, teacher: 2, student: 3 }[role],
            }),
          );
        }
      } catch {
        /* offline */
      }
    },
    { role, token: TOKENS[role] ?? null },
  );
  if (role === "admin") {
    await page.addInitScript((jwt) => {
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
    }, fakeJwt(ADMIN_UID));
  }

  const member = (id) => data.members.find((x) => x.member_id === id);
  const branchName = (id) => data.branches.find((b) => b.id === id)?.name;
  const classesOf = (memberId) =>
    data.classMembers
      .filter((cm) => cm.member_id === memberId)
      .map((cm) => cm.class_id);
  const caller = (token) => {
    if (adminSignedIn) return { admin: true };
    const me = member(TOKEN_MEMBER[token]);
    return me && me.active ? { admin: false, ...me } : null;
  };
  const managedClassIds = (c) =>
    data.classes
      .filter((k) =>
        c.admin
          ? true
          : c.role === 1
            ? k.branch_id === c.branch_id
            : c.role === 2 && k.teacher_id === c.member_id,
      )
      .map((k) => k.id);
  const listRow = (c, x) => ({
    member_id: x.member_id,
    login_id: x.login_id,
    display_name: x.display_name,
    role: x.role,
    branch_id: x.branch_id,
    branch_name: branchName(x.branch_id),
    active: x.active,
    class_ids: classesOf(x.member_id).filter(
      (id) => c.role !== 2 || managedClassIds(c).includes(id),
    ),
    in_class: classesOf(x.member_id).length > 0,
    locked: Boolean(x.locked_until && x.locked_until > Date.now()),
    lock_retry_sec:
      x.locked_until && x.locked_until > Date.now()
        ? Math.ceil((x.locked_until - Date.now()) / 1000)
        : null,
    last_login_at: null,
    created_at: "2026-11-01T00:00:00Z",
  });
  const taken = (loginId, branchId) =>
    data.members.some(
      (x) => x.login_id === loginId && x.branch_id === branchId,
    );
  const suggest = (loginId, branchId) => {
    for (let n = 2; n < 100; n += 1) {
      if (!taken(`${loginId}${n}`, branchId)) return `${loginId}${n}`;
    }
    return null;
  };
  let seq = 0;

  const rpc = {
    lms_session: (c) =>
      c && !c.admin
        ? {
            role: c.role,
            branch_id: c.branch_id,
            branch_name: branchName(c.branch_id),
            display_name: c.display_name,
          }
        : null,
    is_admin: () => adminSignedIn,
    lms_managed_class_ids: (c) => (c ? managedClassIds(c) : []),
    lms_member_list: (c, a) => {
      if (!c || (!c.admin && ![1, 2].includes(c.role))) return "deny";
      return data.members
        .filter((x) =>
          c.admin
            ? !a.p_branch_id || x.branch_id === a.p_branch_id
            : c.role === 1
              ? x.branch_id === c.branch_id && [2, 3].includes(x.role)
              : x.branch_id === c.branch_id && x.role === 3,
        )
        .map((x) => listRow(c, x));
    },
    lms_member_create: (c, a) => {
      const branchId = c.admin ? a.p_branch_id : c.branch_id;
      if (!branchId) return { status: "invalid", field: "branch" };
      const id = String(a.p_login_id || "").toLowerCase();
      if (taken(id, branchId)) {
        return { status: "duplicate", suggestion: suggest(id, branchId) };
      }
      seq += 1;
      data.members.push({
        member_id: `m-new${seq}`,
        login_id: id,
        role: a.p_role,
        branch_id: branchId,
        display_name: a.p_display_name || null,
        active: true,
        locked_until: null,
      });
      return { status: "ok", member_id: `m-new${seq}`, login_id: id };
    },
    lms_member_update: (c, a) => {
      const x = member(a.p_member_id);
      if (a.p_login_id != null && !(c.admin || c.role === 1)) return "deny";
      if (a.p_login_id != null) {
        if (taken(a.p_login_id, x.branch_id) && a.p_login_id !== x.login_id) {
          return {
            status: "duplicate",
            suggestion: suggest(a.p_login_id, x.branch_id),
          };
        }
        x.login_id = a.p_login_id;
      }
      if (a.p_display_name != null) x.display_name = a.p_display_name || null;
      if (a.p_active != null) x.active = a.p_active;
      return { status: "ok" };
    },
    lms_member_delete: (c, a) => {
      if (!c.admin) return "deny";
      data.members = data.members.filter((x) => x.member_id !== a.p_member_id);
      return { status: "ok" };
    },
    lms_unlock_member: (c, a) => {
      const x = member(a.p_member_id);
      const was = Boolean(x.locked_until);
      x.locked_until = null;
      return { status: "ok", cleared: was };
    },
    lms_class_create: (c, a) => {
      seq += 1;
      data.classes.push({
        id: `c-new${seq}`,
        branch_id: c.admin ? a.p_branch_id : c.branch_id,
        name: a.p_name,
        teacher_id: c.role === 2 ? c.member_id : (a.p_teacher_id ?? null),
        active: true,
      });
      return { status: "ok", class_id: `c-new${seq}` };
    },
    lms_class_update: (c, a) => {
      const k = data.classes.find((x) => x.id === a.p_class_id);
      if (a.p_name != null) k.name = a.p_name;
      if (a.p_active != null) k.active = a.p_active;
      if (a.p_set_teacher) k.teacher_id = a.p_teacher_id ?? null;
      return { status: "ok" };
    },
    lms_class_delete: (c, a) => {
      if (!c.admin) return "deny";
      data.classes = data.classes.filter((x) => x.id !== a.p_class_id);
      return { status: "ok" };
    },
    lms_class_add_member: (c, a) => {
      const others = classesOf(a.p_member_id).filter(
        (id) => id !== a.p_class_id,
      );
      // D51 + D53: a teacher may only take a student out of its own classes
      const own = managedClassIds(c);
      if (c.role === 2 && others.some((id) => !own.includes(id))) {
        return "deny";
      }
      const had = classesOf(a.p_member_id).includes(a.p_class_id);
      if (!had)
        data.classMembers.push({
          class_id: a.p_class_id,
          member_id: a.p_member_id,
        });
      if (c.role === 2) {
        // D53: for a teacher the add is a move (out of its other classes)
        data.classMembers = data.classMembers.filter(
          (cm) =>
            cm.member_id !== a.p_member_id || cm.class_id === a.p_class_id,
        );
      }
      return { status: "ok", added: !had };
    },
    lms_class_remove_member: (c, a) => {
      const before = data.classMembers.length;
      data.classMembers = data.classMembers.filter(
        (cm) =>
          !(cm.class_id === a.p_class_id && cm.member_id === a.p_member_id),
      );
      return { status: "ok", removed: data.classMembers.length < before };
    },
    lms_branch_create: (c, a) => {
      if (!c.admin) return "deny";
      seq += 1;
      data.branches.push({
        id: `br-new${seq}`,
        code: a.p_code || `b-${seq}`,
        name: a.p_name,
        active: true,
      });
      return { status: "ok", branch_id: `br-new${seq}` };
    },
    lms_branch_update: (c, a) => {
      if (!c.admin) return "deny";
      const b = data.branches.find((x) => x.id === a.p_branch_id);
      if (a.p_name != null) b.name = a.p_name;
      if (a.p_active != null) b.active = a.p_active;
      return { status: "ok" };
    },
  };

  await page.route(SUPABASE, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const token = request.headers()["x-lms-token"] ?? null;
    if (pathname === "/rest/v1/rpc/lms_login") {
      sent.login.push(request.postDataJSON());
      return route.fulfill({ json: login.shift() ?? { status: "invalid" } });
    }
    if (pathname === "/rest/v1/rpc/lms_logout") {
      sent.logout.push({ token });
      return route.fulfill({ status: 204, body: "" });
    }
    if (pathname.startsWith("/rest/v1/rpc/")) {
      const name = pathname.slice("/rest/v1/rpc/".length);
      const args = request.postDataJSON() || {};
      sent.rpc.push({ name, args, token });
      const handler = rpc[name];
      if (!handler) return route.fulfill({ json: null });
      const c = caller(token);
      if (!c && !["lms_session", "is_admin"].includes(name)) return deny(route);
      const answer = handler(c, args);
      if (answer === "deny") return deny(route);
      return route.fulfill({ json: answer });
    }
    if (pathname === "/rest/v1/branches") {
      const c = caller(token);
      const rows = !c
        ? []
        : data.branches.filter((b) => c.admin || b.id === c.branch_id);
      return route.fulfill({ json: rows });
    }
    if (pathname === "/rest/v1/classes") {
      const c = caller(token);
      const rows = !c
        ? []
        : data.classes.filter(
            (k) =>
              c.admin ||
              ([1, 2].includes(c.role) && k.branch_id === c.branch_id),
          );
      return route.fulfill({ json: rows });
    }
    if (pathname.startsWith("/auth/v1/token") && adminLogin) {
      sent.auth += 1;
      adminSignedIn = true;
      const now = Math.floor(Date.now() / 1000);
      return route.fulfill({
        json: {
          access_token: fakeJwt(ADMIN_UID),
          token_type: "bearer",
          expires_in: 3600,
          expires_at: now + 3600,
          refresh_token: "refresh",
          user: {
            id: ADMIN_UID,
            email: "admin@example.test",
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
    if (pathname.startsWith("/storage/v1/object/list")) {
      return route.fulfill({ json: [] });
    }
    if (pathname.startsWith("/storage/")) {
      return route.fulfill({ contentType: "image/png", body: BLANK_PNG });
    }
    return route.fulfill({ json: [] });
  });
  return { sent, data };
}
