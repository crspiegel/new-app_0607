import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { SUPABASE_SHIM } from "./sql-shim.mjs";

// Resource board (자료실, 2026-11-03) — the "Resource board" block of
// supabase/migration.sql in PGlite, never against the live project. Callers
// are simulated the way PostgREST runs them: a role (anon / authenticated /
// service_role), request.headers (x-lms-token) and request.jwt.claims.
// Decisions B1–B12 and T3 of the PM brief; the Storage API itself (signing,
// the bucket's size / MIME limits) is checked live by the user.

const MIGRATION = readFileSync(path.resolve("supabase/migration.sql"), "utf8");
// The live database today (commit a4da52b, 수정 금지).
const LIVE = readFileSync(
  path.resolve("tests/fixtures/migration-a4da52b.sql"),
  "utf8",
);
const ADMIN_UID = "00000000-0000-4000-8000-0000000000ad";
const OTHER_UID = "00000000-0000-4000-8000-0000000000ee";
const BUCKET = "resource-board";
const MB10 = 10485760;
const TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  hwp: "application/x-hwp",
  hwpx: "application/vnd.hancom.hwpx",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  jpg: "image/jpeg",
  png: "image/png",
};
const DRIVE_A = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345"; // 33 chars
const DRIVE_B = "0B7_legacy-Drive_Id_0123456789"; // 30
const CATEGORIES = [
  "월간교육안",
  "연간교육안",
  "상장",
  "테스트",
  "핵심문장 스크립트",
  "그림 자료실",
  "플래쉬카드",
];
const PALETTE = ["sky", "indigo", "yellow", "red", "green", "purple", "orange"];
const KST_TODAY = "(now() at time zone 'Asia/Seoul')::date";

// A post id the way the admin page makes one (crypto.randomUUID).
const pid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// An object path the way the admin page makes one: <post>/<ms>-<6>.<ext>
const fpath = (post, n, ext = "pdf") =>
  `${post}/17300000${String(n).padStart(5, "0")}-a${String(n).padStart(5, "0")}.${ext}`;

const lit = (v) => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && v.sql) return v.sql;
  if (typeof v === "object")
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

// One caller, one transaction: rows of the last statement in `sql`.
async function as(db, { role = "anon", token = null, uid = null }, sql) {
  const headers = JSON.stringify(token ? { "x-lms-token": token } : {});
  const claims = uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : "";
  try {
    const results = await db.exec(`begin; set local role ${role};
      select set_config('request.headers', '${headers}', true),
             set_config('request.jwt.claims', '${claims}', true);
      ${sql};
      commit;`);
    return results[results.length - 2].rows;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

// public.<fn>(p_a => …, …) as `who` → its one value.
async function call(db, who, fn, args = {}) {
  const list = Object.entries(args)
    .map(([k, v]) => `${k} => ${lit(v)}`)
    .join(", ");
  return (await as(db, who, `select public.${fn}(${list}) as r`))[0].r;
}

async function fresh() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_SHIM);
  await db.exec(MIGRATION);
  return db;
}

// An admin, a signed-in non-admin, LMS branch (1) / two teachers (2) / a
// student (3); returns how to act as each.
async function people(db) {
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ADMIN_UID}', 'admin@example.test'), ('${OTHER_UID}', 'other@example.test');
    insert into public.admins (user_id) values ('${ADMIN_UID}');
    insert into public.members (id, password_hash, grade, role) values
      ('b-branch', extensions.crypt('pw-1', extensions.gen_salt('bf')), 1, 1),
      ('b-teacher', extensions.crypt('pw-2', extensions.gen_salt('bf')), 2, 2),
      ('b-teacher2', extensions.crypt('pw-4', extensions.gen_salt('bf')), 2, 2),
      ('b-student', extensions.crypt('pw-3', extensions.gen_salt('bf')), 3, 3);`);
  const tokenOf = async (id, pw) =>
    (
      await as(
        db,
        {},
        `select public.lms_login('${id}', '${pw}') ->> 'token' as token`,
      )
    )[0].token;
  return {
    admin: { role: "authenticated", uid: ADMIN_UID },
    other: { role: "authenticated", uid: OTHER_UID },
    branch: { token: await tokenOf("b-branch", "pw-1") },
    teacher: { token: await tokenOf("b-teacher", "pw-2") },
    teacher2: { token: await tokenOf("b-teacher2", "pw-4") },
    student: { token: await tokenOf("b-student", "pw-3") },
    anon: {},
  };
}

const setFlag = (db, key, value) =>
  db.exec(`insert into public.site_settings (key, value) values ('${key}', '${JSON.stringify(value)}'::jsonb)
           on conflict (key) do update set value = excluded.value`);

async function categoryIds(db) {
  const rows = (
    await db.query(
      "select id::int as id, name from public.board_categories order by position",
    )
  ).rows;
  return Object.fromEntries(rows.map((r) => [r.name, r.id]));
}

async function upload(db, who, name) {
  return as(
    db,
    who,
    `insert into storage.objects (bucket_id, name) values ('${BUCKET}', '${name}')`,
  );
}

// Save a post as the admin; files are put in Storage first (as the page does).
// `attachments` may also be raw SQL ({ sql }) to send a non-array.
async function savePost(db, who, post) {
  const list = Array.isArray(post.attachments) ? post.attachments : null;
  for (const a of list ?? []) {
    if (a.kind === "file" && !a.skipUpload) await upload(db, who, a.path);
  }
  return call(db, who, "board_post_save", {
    p_id: post.id,
    p_title: post.title,
    p_body: post.body ?? "",
    p_level: post.level ?? "common",
    p_category: post.category,
    p_published: post.published ?? true,
    p_pinned: post.pinned ?? false,
    p_attachments: list
      ? list.map(({ skipUpload: _skip, ...rest }) => rest)
      : (post.attachments ?? []),
  });
}

const fileItem = (
  post,
  n,
  ext = "pdf",
  name = `파일 ${n}.${ext}`,
  size = 1000 + n,
) => ({
  kind: "file",
  path: fpath(post, n, ext),
  name,
  size,
  type: TYPES[ext],
});
const driveItem = (id = DRIVE_A, label = "구글 드라이브 자료") => ({
  kind: "drive",
  drive_id: id,
  label,
});

// ---------------------------------------------------------------------------

test("resource board sql: install twice — bucket, settings, seeded categories, no direct access", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(180000);
  const db = await fresh();
  try {
    await db.exec(MIGRATION); // re-run safe

    // --- bucket: private, 10 MB, PDF / Excel / 한글 / PowerPoint / JPG / PNG
    const bucket = await db.query(
      `select id, public, file_size_limit::int as max, allowed_mime_types as types
         from storage.buckets where id = '${BUCKET}'`,
    );
    expect(bucket.rows).toEqual([
      { id: BUCKET, public: false, max: MB10, types: Object.values(TYPES) },
    ]);

    // --- the two switches: board off, teacher resources on (B12, T1)
    const flags = async () =>
      Object.fromEntries(
        (
          await db.query(
            "select key, value from public.site_settings where key in ('resource_board_enabled', 'teacher_resources_enabled')",
          )
        ).rows.map((r) => [r.key, r.value]),
      );
    expect(await flags()).toEqual({
      resource_board_enabled: false,
      teacher_resources_enabled: true,
    });
    // a re-run never flips what the admin chose
    await setFlag(db, "resource_board_enabled", true);
    await setFlag(db, "teacher_resources_enabled", false);
    await db.exec(MIGRATION);
    expect(await flags()).toEqual({
      resource_board_enabled: true,
      teacher_resources_enabled: false,
    });

    // --- categories (B5): the seven, in order, seven different colors
    const cats = (
      await db.query(
        "select name, position, color from public.board_categories order by position",
      )
    ).rows;
    expect(cats.map((c) => c.name)).toEqual(CATEGORIES);
    expect(cats.map((c) => c.color)).toEqual(PALETTE);
    expect(cats.map((c) => c.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // seeded only when the table is made: a rename stays, a delete-all stays
    await db.exec(
      "update public.board_categories set name = '월간 교육안' where name = '월간교육안'",
    );
    await db.exec(MIGRATION);
    expect(
      (await db.query("select count(*)::int as n from public.board_categories"))
        .rows[0].n,
    ).toBe(7);
    expect(
      (
        await db.query(
          "select name from public.board_categories where position = 1",
        )
      ).rows[0].name,
    ).toBe("월간 교육안");
    await db.exec("delete from public.board_categories");
    await db.exec(MIGRATION);
    expect(
      (await db.query("select count(*)::int as n from public.board_categories"))
        .rows[0].n,
    ).toBe(0);

    // --- nobody reads or writes the tables directly (RPCs only)
    const who = await people(db);
    for (const table of [
      "board_categories",
      "board_posts",
      "board_attachments",
      "board_post_views",
    ]) {
      for (const caller of [who.anon, who.teacher, who.admin]) {
        await expect(
          as(db, caller, `select * from public.${table}`),
          `${table}`,
        ).rejects.toThrow(/permission denied/);
      }
      const rls = (
        await db.query(
          `select relrowsecurity as on, (select count(*)::int from pg_policies p
             where p.schemaname = 'public' and p.tablename = '${table}') as policies
             from pg_class where oid = 'public.${table}'::regclass`,
        )
      ).rows[0];
      expect(rls, table).toEqual({ on: true, policies: 0 });
    }
  } finally {
    await db.close();
  }
});

test("resource board sql: Storage — only the admin writes well-formed paths; nobody else reads", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  const db = await fresh();
  try {
    const who = await people(db);
    const post = pid(1);
    for (const ext of Object.keys(TYPES).concat("jpeg")) {
      await upload(db, who.admin, fpath(post, ext.length, ext));
    }
    for (const bad of [
      `${post}/1730000000000.pdf`, // no random part
      `${post}/17300000000000-abcdef.pdf`, // 14 digits
      `${post}/1730000000000-ABCDEF.pdf`, // upper case
      `${post}/1730000000000-abcdef.docx`,
      `${post}/1730000000000-abcdef.PDF`,
      `${post}/수료.pdf`,
      `00000000-0000-4000-8000-00000000000G/1730000000000-abcdef.pdf`,
      `${post}/x/1730000000000-abcdef.pdf`,
      `1730000000000-abcdef.pdf`,
    ]) {
      await expect(upload(db, who.admin, bad), bad).rejects.toThrow(
        /row-level security/,
      );
    }
    for (const caller of [who.other, who.teacher, who.branch, who.anon]) {
      await expect(upload(db, caller, fpath(post, 99))).rejects.toThrow(
        /row-level security/,
      );
    }
    const visible = async (caller) =>
      (
        await as(
          db,
          caller,
          `select count(*)::int as n from storage.objects where bucket_id = '${BUCKET}'`,
        )
      )[0].n;
    expect(await visible(who.admin)).toBe(10);
    for (const caller of [
      who.other,
      who.teacher,
      who.branch,
      who.student,
      who.anon,
    ]) {
      expect(await visible(caller)).toBe(0);
    }
    // members cannot delete either
    expect(
      await as(
        db,
        who.teacher,
        `delete from storage.objects where bucket_id = '${BUCKET}' returning name`,
      ),
    ).toEqual([]);
    // the teacher-resources bucket rule is untouched
    await as(
      db,
      who.admin,
      "insert into storage.objects (bucket_id, name) values ('teacher-resources', 'level-1/plan/1730000000000.pdf')",
    );
    await expect(
      as(
        db,
        who.admin,
        `insert into storage.objects (bucket_id, name) values ('teacher-resources', '${fpath(post, 7)}')`,
      ),
    ).rejects.toThrow(/row-level security/);
  } finally {
    await db.close();
  }
});

// Fourteen posts for the reading tests. created_at is set afterwards (days
// back from the KST date), views too.
async function seedPosts(db, who) {
  const c = await categoryIds(db);
  const posts = [
    // id, title, level, category, extra
    [
      1,
      "Level 1 월간교육안 (3월~12월)",
      "level-1",
      "월간교육안",
      { pinned: true, days: 2, views: 64 },
    ],
    [
      2,
      "2026 연간교육안 — 전 레벨",
      "common",
      "연간교육안",
      { pinned: true, days: 5, views: 152 },
    ],
    [
      3,
      "11월 핵심문장 스크립트 (Book 1 · Book 2)",
      "level-2",
      "핵심문장 스크립트",
      { days: 1, views: 18 },
    ],
    [
      4,
      "11월 플래쉬카드 모음",
      "beginner",
      "플래쉬카드",
      { days: 1, views: 22 },
    ],
    [
      5,
      "Level 2 월간교육안 (3월~12월)",
      "level-2",
      "월간교육안",
      { days: 2, views: 47 },
    ],
    [
      6,
      "2학기 테스트지 + 답안지",
      "level-3",
      "테스트",
      { days: 4, views: 88, body: "정답은 마지막 쪽에 있어요. 100% 확인" },
    ],
    [
      7,
      "10월 그림 자료 모음",
      "level-1",
      "그림 자료실",
      { days: 7, views: 73 },
    ],
    [
      8,
      "2026 수료 상장 양식",
      "common",
      "상장",
      {
        days: 8,
        views: 135,
        body: "원 이름과 날짜는 한글 파일에서 고쳐 쓰세요.",
      },
    ],
    [
      9,
      "10월 핵심문장 스크립트",
      "level-3",
      "핵심문장 스크립트",
      { days: 33, views: 96 },
    ],
    [
      10,
      "10월 플래쉬카드 모음",
      "level-1",
      "플래쉬카드",
      { days: 34, views: 81 },
    ],
    [
      11,
      "9월 월간교육안 안내",
      "beginner",
      "월간교육안",
      { days: 60, views: 5 },
    ],
    [
      12,
      "숨긴 글 (준비 중)",
      "level-1",
      "상장",
      { days: 0, views: 0, published: false },
    ],
    [
      13,
      "Good_Morning 노래 가사판",
      "common",
      "그림 자료실",
      { days: 61, views: 210 },
    ],
    [14, "8월 연간 계획 메모", "level-2", "연간교육안", { days: 90, views: 3 }],
  ];
  for (const [n, title, level, cat, extra] of posts) {
    const r = await savePost(db, who.admin, {
      id: pid(n),
      title,
      level,
      category: c[cat],
      body: extra.body ?? "",
      pinned: extra.pinned ?? false,
      published: extra.published ?? true,
    });
    expect(r.status).toBe("ok");
    await db.exec(`update public.board_posts
      set created_at = ((${KST_TODAY} - ${extra.days})::timestamp + time '12:00' - interval '${n} minutes') at time zone 'Asia/Seoul',
          view_count = ${extra.views}
      where id = '${pid(n)}'`);
  }
  return c;
}

const ids = (answer) => answer.items.map((i) => Number(i.id.slice(-12)));

test("resource board sql: reading — who (B2), switch (B12), filters, search, sort, pinned, pages, NEW (B9)", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(180000);
  const db = await fresh();
  try {
    const who = await people(db);
    const c = await seedPosts(db, who);
    const list = (caller, args = {}) => call(db, caller, "board_list", args);

    // --- B12 off (the default): members get "off"; the admin still reads
    for (const caller of [who.teacher, who.branch]) {
      expect(await list(caller)).toEqual({ status: "off" });
    }
    expect((await list(who.admin)).status).toBe("ok");
    // B2: students, visitors and other signed-in users get nothing at all
    for (const caller of [who.student, who.anon, who.other]) {
      expect(await list(caller)).toEqual({ status: "denied" });
    }

    await setFlag(db, "resource_board_enabled", true);
    for (const caller of [who.student, who.anon, who.other]) {
      expect(await list(caller)).toEqual({ status: "denied" });
    }
    const all = await list(who.teacher);
    expect(all.status).toBe("ok");
    expect(await list(who.branch)).toEqual(all);
    // 13 published (the hidden one is never on the list, not even for the
    // admin); pinned first, then newest first; 10 a page
    expect(all.total).toBe(13);
    expect(all.pages).toBe(2);
    expect(all.page).toBe(1);
    expect(all.page_size).toBe(10);
    expect(ids(all)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ids(await list(who.admin))).toEqual(ids(all));
    expect(ids(await list(who.teacher, { p_page: 2 }))).toEqual([11, 13, 14]);
    // a page past the end = the last page; 0 / negative = the first
    expect((await list(who.teacher, { p_page: 9 })).page).toBe(2);
    expect((await list(who.teacher, { p_page: -3 })).page).toBe(1);

    // the row: what the list shows (no body, no storage path)
    expect(all.items[0]).toEqual({
      id: pid(1),
      title: "Level 1 월간교육안 (3월~12월)",
      level: "level-1",
      category: c["월간교육안"],
      pinned: true,
      files: 0,
      views: 64,
      created_at: expect.any(String),
      is_new: true,
    });
    // categories come with the list, in order, with their colors
    expect(all.categories.map((x) => [x.name, x.color])).toEqual(
      CATEGORIES.map((n, i) => [n, PALETTE[i]]),
    );

    // NEW = within 7 KST days: 6 days back yes, 7 days back no
    const byId = Object.fromEntries(all.items.map((i) => [i.id, i]));
    expect(byId[pid(2)].is_new).toBe(true); // 5 days
    expect(byId[pid(6)].is_new).toBe(true); // 4 days
    expect(byId[pid(7)].is_new).toBe(false); // 7 days
    await db.exec(`update public.board_posts
      set created_at = ((${KST_TODAY} - 6)::timestamp + time '00:01') at time zone 'Asia/Seoul'
      where id = '${pid(7)}'`);
    const again = await list(who.teacher);
    expect(again.items.find((i) => i.id === pid(7)).is_new).toBe(true);
    await db.exec(`update public.board_posts
      set created_at = ((${KST_TODAY} - 7)::timestamp + time '23:59') at time zone 'Asia/Seoul'
      where id = '${pid(7)}'`);

    // --- level chip: that level + 공통 (common)
    const l1 = await list(who.teacher, { p_level: "level-1" });
    expect(ids(l1)).toEqual([1, 2, 7, 8, 10, 13]);
    expect(l1.total).toBe(6);
    expect(ids(await list(who.teacher, { p_level: "beginner" }))).toEqual([
      2, 4, 8, 11, 13,
    ]);
    // an unknown level (an edited address) = no level filter
    expect((await list(who.teacher, { p_level: "level-9" })).total).toBe(13);
    expect((await list(who.teacher, { p_level: "" })).total).toBe(13);

    // --- category chip, and both together
    expect(
      ids(await list(who.teacher, { p_category: c["월간교육안"] })),
    ).toEqual([1, 5, 11]);
    expect(
      ids(
        await list(who.teacher, {
          p_category: c["월간교육안"],
          p_level: "level-2",
        }),
      ),
    ).toEqual([5]);
    expect((await list(who.teacher, { p_category: 9999 })).total).toBe(0);

    // --- search: title and body, any case, wildcards are plain letters
    expect(ids(await list(who.teacher, { p_q: "플래쉬카드" }))).toEqual([
      4, 10,
    ]);
    expect(ids(await list(who.teacher, { p_q: "한글 파일" }))).toEqual([8]); // body
    expect(ids(await list(who.teacher, { p_q: "good_morning" }))).toEqual([13]);
    expect(ids(await list(who.teacher, { p_q: "good%" }))).toEqual([]);
    expect(ids(await list(who.teacher, { p_q: "100%" }))).toEqual([6]);
    expect(ids(await list(who.teacher, { p_q: "_" }))).toEqual([13]);
    expect(ids(await list(who.teacher, { p_q: "   " })).length).toBe(10);
    expect((await list(who.teacher, { p_q: "숨긴" })).total).toBe(0);
    expect(
      ids(await list(who.teacher, { p_q: "모음", p_level: "level-1" })),
    ).toEqual([7, 10]);

    // --- sort by views: pinned still first
    expect(ids(await list(who.teacher, { p_sort: "views" }))).toEqual([
      2, 1, 13, 8, 9, 6, 10, 7, 5, 4,
    ]);
    // anything else = newest first
    expect(ids(await list(who.teacher, { p_sort: "x" }))).toEqual(ids(all));

    // --- the switch off again: members "off" at once
    await setFlag(db, "resource_board_enabled", false);
    expect(await list(who.teacher)).toEqual({ status: "off" });
  } finally {
    await db.close();
  }
});

test("resource board sql: detail — attachments without paths, prev / next in list order, views once a KST day (B10, B11)", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(180000);
  const db = await fresh();
  try {
    const who = await people(db);
    const c = await seedPosts(db, who);
    await setFlag(db, "resource_board_enabled", true);
    // post 8 (상장, 공통): 3 attachments — PDF, 한글, a Drive link
    const p8 = pid(8);
    const saved = await savePost(db, who.admin, {
      id: p8,
      title: "2026 수료 상장 양식",
      level: "common",
      category: c["상장"],
      body: "수료식에 사용할 상장 양식입니다.\n원 이름과 날짜는 한글 파일에서 고쳐 쓰세요.",
      attachments: [
        fileItem(p8, 1, "pdf", "2026_수료상장_양식.pdf", 820000),
        fileItem(p8, 2, "hwp", "2026_수료상장_양식(수정용).hwp", 240000),
        driveItem(DRIVE_A, "수료 상장 배경 이미지 (고화질)"),
      ],
    });
    expect(saved).toEqual({ status: "ok", id: p8, removed: [] });

    const get = (caller, id, args = {}) =>
      call(db, caller, "board_post_get", { p_id: id, ...args });
    const d = await get(who.teacher, p8);
    expect(d.status).toBe("ok");
    expect(d.post).toEqual({
      id: p8,
      title: "2026 수료 상장 양식",
      body: "수료식에 사용할 상장 양식입니다.\n원 이름과 날짜는 한글 파일에서 고쳐 쓰세요.",
      level: "common",
      category: c["상장"],
      pinned: false,
      published: true,
      files: 3,
      views: 136, // 135 + this view
      created_at: expect.any(String),
      is_new: false,
    });
    expect(d.category).toEqual({
      id: c["상장"],
      name: "상장",
      color: "yellow",
    });
    expect(d.attachments.map(({ id: _id, ...rest }) => rest)).toEqual([
      {
        kind: "file",
        name: "2026_수료상장_양식.pdf",
        ext: "pdf",
        size: 820000,
        drive_id: null,
      },
      {
        kind: "file",
        name: "2026_수료상장_양식(수정용).hwp",
        ext: "hwp",
        size: 240000,
        drive_id: null,
      },
      {
        kind: "drive",
        name: "수료 상장 배경 이미지 (고화질)",
        ext: null,
        size: null,
        drive_id: DRIVE_A,
      },
    ]);
    expect(d.attachments.every((a) => /^[0-9a-f-]{36}$/.test(a.id))).toBe(true);
    // never a Storage path
    expect(JSON.stringify(d)).not.toContain("173000");
    // prev = the row above in the list, next = the row below
    expect(d.prev).toEqual({
      id: pid(7),
      title: "10월 그림 자료 모음",
      created_at: expect.any(String),
    });
    expect(d.next).toEqual({
      id: pid(9),
      title: "10월 핵심문장 스크립트",
      created_at: expect.any(String),
    });
    // the same filters / sort as the list it came from
    const f = await get(who.teacher, p8, { p_level: "level-1" });
    expect([f.prev?.id, f.next?.id]).toEqual([pid(7), pid(10)]);
    const v = await get(who.teacher, p8, { p_sort: "views" });
    expect([v.prev?.id, v.next?.id]).toEqual([pid(13), pid(9)]);
    const s = await get(who.teacher, p8, { p_q: "상장" });
    expect([s.prev, s.next]).toEqual([null, null]);
    const first = await get(who.teacher, pid(1));
    expect([first.prev, first.next?.id]).toEqual([null, pid(2)]);
    const last = await get(who.teacher, pid(14));
    expect([last.prev?.id, last.next]).toEqual([pid(13), null]);
    // a post outside the filters: no neighbours (not an error)
    const out = await get(who.teacher, pid(3), { p_level: "level-1" });
    expect([out.status, out.prev, out.next]).toEqual(["ok", null, null]);

    // --- B11 views: one per member per KST day; the admin never counts
    const views = async (id) =>
      (
        await db.query(
          `select view_count as n from public.board_posts where id = '${id}'`,
        )
      ).rows[0].n;
    expect(await views(p8)).toBe(136); // the teacher above (filters: same day)
    await get(who.teacher, p8);
    await get(who.admin, p8);
    await get(who.admin, p8);
    expect(await views(p8)).toBe(136);
    await get(who.teacher2, p8);
    await get(who.branch, p8);
    expect(await views(p8)).toBe(138);
    // yesterday's view does not count for today
    await db.exec(
      `update public.board_post_views set view_day = view_day - 1 where post_id = '${p8}'`,
    );
    expect((await get(who.teacher, p8)).post.views).toBe(139);
    expect((await get(who.teacher, p8)).post.views).toBe(139);
    // 30-day-old view rows go when a new one is written
    await db.exec(`insert into public.board_post_views (post_id, member_id, view_day)
      select '${pid(1)}', m.member_id, ${KST_TODAY} - 40 from public.members m where m.id = 'b-branch'`);
    await get(who.branch, pid(3));
    expect(
      (
        await db.query(
          `select count(*)::int as n from public.board_post_views where view_day < ${KST_TODAY} - 30`,
        )
      ).rows[0].n,
    ).toBe(0);

    // --- hidden: members see "missing"; the admin may look (보기)
    expect(await get(who.teacher, pid(12))).toEqual({ status: "missing" });
    expect((await get(who.admin, pid(12))).post.published).toBe(false);
    expect(await get(who.teacher, pid(99))).toEqual({ status: "missing" });
    // students, visitors: nothing; switch off: "off" for members only
    for (const caller of [who.student, who.anon, who.other]) {
      expect(await get(caller, p8)).toEqual({ status: "denied" });
    }
    await setFlag(db, "resource_board_enabled", false);
    expect(await get(who.teacher, p8)).toEqual({ status: "off" });
    expect((await get(who.admin, p8)).status).toBe("ok");
    expect(await views(p8)).toBe(139);
  } finally {
    await db.close();
  }
});

test("resource board sql: admin writes — save, 50 attachments (D79), one kind each, reorder, delete (B3, B4, B6, B7, B8)", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(180000);
  const db = await fresh();
  try {
    const who = await people(db);
    const c = await categoryIds(db);
    const post = pid(50);
    const base = {
      id: post,
      title: "Level 1 월간교육안 (3월~12월)",
      level: "level-1",
      category: c["월간교육안"],
    };

    // --- B3: only the top admin writes
    for (const caller of [who.anon, who.teacher, who.branch, who.student]) {
      await expect(
        savePost(db, caller, { ...base, attachments: [] }),
      ).rejects.toThrow(/permission denied for function/);
      await expect(
        call(db, caller, "board_post_delete", { p_id: post }),
      ).rejects.toThrow(/permission denied for function/);
      await expect(call(db, caller, "board_admin_list", {})).rejects.toThrow(
        /permission denied for function/,
      );
    }
    await expect(savePost(db, who.other, base)).rejects.toThrow(
      /not authorized/,
    );
    await expect(call(db, who.other, "board_admin_list", {})).rejects.toThrow(
      /not authorized/,
    );

    // --- B4: title 1-100 (trimmed), body up to 5,000, a level, a category
    const bad = async (patch, re) =>
      expect(savePost(db, who.admin, { ...base, ...patch })).rejects.toThrow(
        re,
      );
    await bad({ title: "   " }, /board: title/);
    await bad({ title: "가".repeat(101) }, /board: title/);
    await bad({ body: "가".repeat(5001) }, /board: body/);
    await bad({ level: "Level 1" }, /board: level/);
    await bad({ category: 9999 }, /board: category/);
    await bad({ category: null }, /board: category/);
    expect(
      (
        await savePost(db, who.admin, {
          ...base,
          title: `  ${"가".repeat(100)}  `,
          body: "가".repeat(5000),
        })
      ).status,
    ).toBe("ok");
    const row = (
      await db.query(
        `select title, length(body) as body from public.board_posts where id = '${post}'`,
      )
    ).rows[0];
    expect(row).toEqual({ title: "가".repeat(100), body: 5000 });

    // --- B6: up to 50 attachments (D79, 2026-11-07 — was 20), files must be
    // in Storage under this post
    const twenty = Array.from({ length: 19 }, (_, i) =>
      fileItem(
        post,
        i + 1,
        ["pdf", "xlsx", "hwp", "hwpx", "pptx", "ppt", "jpg", "png", "xls"][
          i % 9
        ],
      ),
    ).concat(driveItem(DRIVE_B, "드라이브 묶음"));
    let saved = await savePost(db, who.admin, { ...base, attachments: twenty });
    expect(saved).toEqual({ status: "ok", id: post, removed: [] });
    // the 20 + 31 more = 51 → refused (D79: 50 at most)
    const extra = Array.from({ length: 31 }, (_, i) => fileItem(post, 60 + i));
    await bad(
      {
        attachments: [
          ...twenty.map((a) => ({ ...a, skipUpload: true })),
          ...extra,
        ],
      },
      /board: too many attachments \(50 at most\)/,
    );
    // not in Storage / another post's folder / wrong type / too big / no name
    const other = pid(51);
    await bad(
      { attachments: [{ ...fileItem(post, 30), skipUpload: true }] },
      /not in storage/,
    );
    await upload(db, who.admin, fpath(other, 31));
    await bad(
      { attachments: [{ ...fileItem(other, 31), skipUpload: true }] },
      /board_attachments_path_ok|board: attachment/,
    );
    await bad(
      { attachments: [{ ...fileItem(post, 32), type: "text/html" }] },
      /board_attachments_type_ok|board: attachment/,
    );
    await bad(
      { attachments: [{ ...fileItem(post, 33), size: MB10 + 1 }] },
      /board_attachments_size_ok|board: attachment/,
    );
    await bad(
      { attachments: [{ ...fileItem(post, 34), name: "" }] },
      /board: attachment/,
    );
    // a Drive link: an ID (25-64), a name; never both kinds in one
    await bad(
      { attachments: [driveItem("short")] },
      /not a Google Drive file id/,
    );
    await bad(
      {
        attachments: [
          driveItem(
            "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit",
          ),
        ],
      },
      /not a Google Drive file id/,
    );
    await bad({ attachments: [driveItem(DRIVE_A, "  ")] }, /board: attachment/);
    await bad(
      { attachments: [{ ...fileItem(post, 35), drive_id: DRIVE_A }] },
      /board: attachment|board_attachments_source_ok/,
    );
    await bad(
      { attachments: [{ kind: "link", drive_id: DRIVE_A, label: "x" }] },
      /board: attachment/,
    );
    await bad({ attachments: { sql: `'"nope"'::jsonb` } }, /board: attachment/);
    // the failed saves changed nothing
    const now = await call(db, who.admin, "board_admin_get", { p_id: post });
    expect(now.attachments.length).toBe(20);

    // --- B7 order: a re-save with the same ids in a new order keeps the ids;
    // B8: an attachment left out is deleted and its path comes back
    const ids0 = now.attachments.map((a) => a.id);
    const reordered = [...ids0]
      .reverse()
      .slice(0, 18)
      .map((id) => ({ id }));
    saved = await call(db, who.admin, "board_post_save", {
      p_id: post,
      p_title: base.title,
      p_body: "",
      p_level: "level-1",
      p_category: c["월간교육안"],
      p_published: true,
      p_pinned: true,
      p_attachments: reordered,
    });
    expect(saved.status).toBe("ok");
    expect(saved.removed.sort()).toEqual(
      [fpath(post, 1, "pdf"), fpath(post, 2, "xlsx")].sort(),
    );
    const after = await call(db, who.admin, "board_admin_get", { p_id: post });
    expect(after.attachments.map((a) => a.id)).toEqual(
      reordered.map((r) => r.id),
    );
    expect(after.post.pinned).toBe(true);
    expect(after.attachments[0]).toEqual({
      id: ids0[19],
      kind: "drive",
      name: "드라이브 묶음",
      ext: null,
      size: null,
      type: null,
      drive_id: DRIVE_B,
    });
    // a Drive name may change on an existing link; an unknown id is refused
    saved = await call(db, who.admin, "board_post_save", {
      p_id: post,
      p_title: base.title,
      p_body: "",
      p_level: "level-1",
      p_category: c["월간교육안"],
      p_published: true,
      p_pinned: true,
      p_attachments: [
        { id: ids0[19], label: "드라이브 묶음 (새 이름)" },
        { id: ids0[2] },
      ],
    });
    expect(saved.removed.length).toBe(16);
    expect(
      (
        await call(db, who.admin, "board_admin_get", { p_id: post })
      ).attachments.map((a) => a.name),
    ).toEqual(["드라이브 묶음 (새 이름)", "파일 3.hwp"]);
    await bad({ attachments: [{ id: pid(777) }] }, /board: attachment/);
    await bad(
      { attachments: [{ id: ids0[2] }, { id: ids0[2] }] },
      /board: attachment/,
    );

    // --- delete: the post, its attachments and views go; file paths come back
    const del = await call(db, who.admin, "board_post_delete", { p_id: post });
    expect(del).toEqual({ status: "ok", removed: [fpath(post, 3, "hwp")] });
    expect(
      await call(db, who.admin, "board_post_delete", { p_id: post }),
    ).toEqual({
      status: "missing",
      removed: [],
    });
    expect(
      (
        await db.query(
          "select count(*)::int as n from public.board_attachments",
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await db.close();
  }
});

// D79 / D80 (2026-11-07): a Google Sheets / Docs / Slides file is a link row
// like a Drive file — its ID in drive_id, the admin's name in label, no file
// columns — with its own kind (gsheet / gdoc / gslides); teachers get it as
// .xlsx / .docx / .pptx from Google, never from Storage. 50 attachments in all.
const SHEET_ID = "1sHeEtAbCdEfGhIjKlMnOpQrStUvWxYz0123456789ab"; // 44 chars
const DOC_ID = "1dOcAbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-cd"; // 44
const SLIDES_ID = "1sLiDeSaBcDeFgHiJkLmNoPqRsTuVwXyZ012345678"; // 42
const linkItem = (kind, id, label) => ({ kind, drive_id: id, label });

test("resource board sql: D79 50 attachments · D80 Google Sheets / Docs / Slides links — save, rename, reorder, take out, the teacher's answer; 51 and unknown kinds refused", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(180000);
  const db = await fresh();
  try {
    const who = await people(db);
    const c = await categoryIds(db);
    await setFlag(db, "resource_board_enabled", true);
    const post = pid(60);
    const base = {
      id: post,
      title: "11월 월간교육안 (구글 시트)",
      level: "level-1",
      category: c["월간교육안"],
    };
    const bad = async (patch, re) =>
      expect(savePost(db, who.admin, { ...base, ...patch })).rejects.toThrow(
        re,
      );
    const links = [
      driveItem(DRIVE_A, "활동 사진 모음"),
      linkItem("gsheet", SHEET_ID, "11월 월간교육안"),
      linkItem("gdoc", DOC_ID, "가정통신문"),
      linkItem("gslides", SLIDES_ID, "수업 슬라이드"),
    ];
    const files = Array.from({ length: 46 }, (_, i) => fileItem(post, i + 1));

    // --- 51 (46 files + 4 links + 1) → refused, nothing saved
    await bad(
      { attachments: [...links, ...files, fileItem(post, 47)] },
      /board: too many attachments \(50 at most\)/,
    );
    const posts = () =>
      db
        .query(
          `select count(*)::int as n from public.board_posts where id = '${post}'`,
        )
        .then((r) => r.rows[0].n);
    expect(await posts()).toBe(0);
    // --- 50 → saved, in order (the files are in Storage from the try above)
    let saved = await savePost(db, who.admin, {
      ...base,
      attachments: [
        ...links,
        ...files.map((f) => ({ ...f, skipUpload: true })),
      ],
    });
    expect(saved).toEqual({ status: "ok", id: post, removed: [] });
    let got = await call(db, who.admin, "board_admin_get", { p_id: post });
    expect(got.attachments.length).toBe(50);
    const linkAnswer = (kind, name, driveId) => ({
      id: expect.any(String),
      kind,
      name,
      ext: null,
      size: null,
      type: null,
      drive_id: driveId,
    });
    expect(got.attachments.slice(0, 5)).toEqual([
      linkAnswer("drive", "활동 사진 모음", DRIVE_A),
      linkAnswer("gsheet", "11월 월간교육안", SHEET_ID),
      linkAnswer("gdoc", "가정통신문", DOC_ID),
      linkAnswer("gslides", "수업 슬라이드", SLIDES_ID),
      {
        id: expect.any(String),
        kind: "file",
        name: "파일 1.pdf",
        ext: "pdf",
        size: 1001,
        type: TYPES.pdf,
        drive_id: null,
      },
    ]);
    // a link row: the ID and the name only
    expect(
      (
        await db.query(
          `select kind, drive_id, label, storage_path, file_name, file_type, file_size
             from public.board_attachments
            where post_id = '${post}' and kind <> 'file' order by position`,
        )
      ).rows,
    ).toEqual(
      links.map((l) => ({
        kind: l.kind,
        drive_id: l.drive_id,
        label: l.label,
        storage_path: null,
        file_name: null,
        file_type: null,
        file_size: null,
      })),
    );

    // --- the teacher's post: kind + ID, never a path; 50 files
    const detail = await call(db, who.teacher, "board_post_get", {
      p_id: post,
    });
    expect(detail.status).toBe("ok");
    expect(detail.post.files).toBe(50);
    expect(
      detail.attachments
        .slice(0, 4)
        .map((a) => [a.kind, a.name, a.ext, a.size, a.drive_id]),
    ).toEqual([
      ["drive", "활동 사진 모음", null, null, DRIVE_A],
      ["gsheet", "11월 월간교육안", null, null, SHEET_ID],
      ["gdoc", "가정통신문", null, null, DOC_ID],
      ["gslides", "수업 슬라이드", null, null, SLIDES_ID],
    ]);
    expect(JSON.stringify(detail)).not.toContain(`${post}/`);
    // the download function: a link is not a file — "empty", not counted
    for (const a of detail.attachments.slice(0, 4)) {
      expect(
        await call(
          db,
          { role: "service_role", ...who.teacher },
          "board_attachment_issue",
          { p_attachment_id: a.id, p_admin_uid: null },
        ),
      ).toEqual({ status: "empty" });
    }
    expect(
      (
        await db.query(
          "select count(*)::int as n from public.teacher_resource_downloads",
        )
      ).rows[0].n,
    ).toBe(0);

    // --- kept by id: each link kind takes a new name; a file's stays; new
    // order; the files left out come back as paths (links have none)
    const ids = got.attachments.map((a) => a.id);
    saved = await call(db, who.admin, "board_post_save", {
      p_id: post,
      p_title: base.title,
      p_body: "",
      p_level: "level-1",
      p_category: c["월간교육안"],
      p_published: true,
      p_pinned: false,
      p_attachments: [
        { id: ids[3], label: "수업 슬라이드 (새 이름)" },
        { id: ids[1], label: "  11월 월간교육안 (수정)  " },
        { id: ids[2], label: "가정통신문 2" },
        { id: ids[0] },
        { id: ids[4], label: "파일 이름은 그대로" },
      ],
    });
    expect(saved.status).toBe("ok");
    expect(saved.removed.sort()).toEqual(
      files
        .slice(1)
        .map((f) => f.path)
        .sort(),
    );
    got = await call(db, who.admin, "board_admin_get", { p_id: post });
    expect(got.attachments.map((a) => [a.kind, a.name])).toEqual([
      ["gslides", "수업 슬라이드 (새 이름)"],
      ["gsheet", "11월 월간교육안 (수정)"],
      ["gdoc", "가정통신문 2"],
      ["drive", "활동 사진 모음"],
      ["file", "파일 1.pdf"],
    ]);
    expect(got.attachments.map((a) => a.id)).toEqual([
      ids[3],
      ids[1],
      ids[2],
      ids[0],
      ids[4],
    ]);
    const kept = got.attachments.map((a) => a.id);

    // --- a link needs an ID (25-64) and a name, and no file fields; any
    // other kind is refused
    await bad(
      { attachments: [linkItem("gsheet", "short", "x")] },
      /not a Google Drive file id/,
    );
    await bad(
      {
        attachments: [
          linkItem(
            "gdoc",
            `https://docs.google.com/document/d/${DOC_ID}/edit`,
            "x",
          ),
        ],
      },
      /not a Google Drive file id/,
    );
    await bad(
      { attachments: [linkItem("gdoc", DOC_ID, "  ")] },
      /board: attachment name/,
    );
    await bad(
      {
        attachments: [
          {
            ...linkItem("gslides", SLIDES_ID, "x"),
            path: fpath(post, 99, "pptx"),
            name: "x.pptx",
            size: 10,
            type: TYPES.pptx,
          },
        ],
      },
      /a Drive link has no file/,
    );
    for (const kind of ["gform", "GSHEET", "sheet", "", null]) {
      await bad(
        { attachments: [{ kind, drive_id: SHEET_ID, label: "x" }] },
        /board: attachment kind/,
      );
    }
    // the failed saves changed nothing
    expect(
      (
        await call(db, who.admin, "board_admin_get", { p_id: post })
      ).attachments.map((a) => a.id),
    ).toEqual(kept);
    // the table's own rules, without the function
    for (const [sql, rule] of [
      [
        `insert into public.board_attachments (post_id, position, kind, drive_id, label)
         values ('${post}', 99, 'gform', '${SHEET_ID}', 'x')`,
        /board_attachments_kind_ok/,
      ],
      [
        `insert into public.board_attachments (post_id, position, kind, drive_id, label, file_name)
         values ('${post}', 99, 'gsheet', '${SHEET_ID}', 'x', 'x.xlsx')`,
        /board_attachments_source_ok/,
      ],
      [
        `insert into public.board_attachments (post_id, position, kind, drive_id, label)
         values ('${post}', 99, 'gdoc', 'short', 'x')`,
        /board_attachments_drive_ok/,
      ],
      [
        `insert into public.board_attachments (post_id, position, kind, label)
         values ('${post}', 99, 'gslides', 'x')`,
        /board_attachments_source_ok/,
      ],
    ]) {
      await expect(db.exec(sql)).rejects.toThrow(rule);
    }

    // --- delete: only the file's path comes back
    expect(
      await call(db, who.admin, "board_post_delete", { p_id: post }),
    ).toEqual({ status: "ok", removed: [files[0].path] });
  } finally {
    await db.close();
  }
});

test("resource board sql: admin list and categories (B5, 그림 05)", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(180000);
  const db = await fresh();
  try {
    const who = await people(db);
    const c = await seedPosts(db, who);
    // 25 more for paging (20 a page)
    for (let n = 20; n < 45; n += 1) {
      await savePost(db, who.admin, {
        id: pid(n),
        title: `채우기 ${n}`,
        level: "level-3",
        category: c["테스트"],
        published: n % 2 === 0,
      });
      await db.exec(
        `update public.board_posts set created_at = now() - interval '${200 + n} days' where id = '${pid(n)}'`,
      );
    }
    const admin = (args = {}) => call(db, who.admin, "board_admin_list", args);
    const all = await admin();
    expect(all.status).toBe("ok");
    expect(all.total).toBe(39); // hidden ones too
    expect(all.page_size).toBe(20);
    expect(all.pages).toBe(2);
    expect(all.items.length).toBe(20);
    expect(all.items[0]).toEqual({
      id: pid(1),
      title: "Level 1 월간교육안 (3월~12월)",
      level: "level-1",
      category: c["월간교육안"],
      pinned: true,
      published: true,
      files: 0,
      views: 64,
      created_at: expect.any(String),
    });
    expect(ids(all).slice(0, 3)).toEqual([1, 2, 12]); // pinned, then newest (hidden 12 = today)
    expect((await admin({ p_page: 2 })).items.length).toBe(19);
    expect((await admin({ p_status: "hidden" })).total).toBe(13);
    expect((await admin({ p_status: "public" })).total).toBe(26);
    // the level filter here is exact (공통 is its own choice)
    expect(ids(await admin({ p_level: "common" }))).toEqual([2, 8, 13]);
    expect((await admin({ p_level: "level-3" })).total).toBe(27);
    expect((await admin({ p_category: c["상장"] })).total).toBe(2);
    // title search only
    expect(ids(await admin({ p_q: "숨긴" }))).toEqual([12]);
    expect((await admin({ p_q: "한글 파일" })).total).toBe(0);
    // categories with their post counts (the settings box)
    expect(all.categories.map((x) => [x.name, x.posts])).toEqual([
      ["월간교육안", 3],
      ["연간교육안", 2],
      ["상장", 2],
      ["테스트", 26],
      ["핵심문장 스크립트", 2],
      ["그림 자료실", 2],
      ["플래쉬카드", 2],
    ]);

    // --- categories: add (next free color), rename, order, delete
    const cat = (fn, args) => call(db, who.admin, fn, args);
    const added = await cat("board_category_save", {
      p_id: null,
      p_name: " 공지 자료 ",
    });
    expect(added.status).toBe("ok");
    let cats = (await admin()).categories;
    expect(cats.at(-1)).toEqual({
      id: added.id,
      name: "공지 자료",
      color: "teal",
      posts: 0,
    });
    expect(
      await cat("board_category_save", { p_id: null, p_name: "상장" }),
    ).toEqual({
      status: "duplicate",
    });
    expect(
      await cat("board_category_save", { p_id: c["상장"], p_name: "테스트" }),
    ).toEqual({
      status: "duplicate",
    });
    await expect(
      cat("board_category_save", { p_id: null, p_name: "가".repeat(21) }),
    ).rejects.toThrow(/board: category name/);
    await expect(
      cat("board_category_save", { p_id: null, p_name: "" }),
    ).rejects.toThrow(/board: category name/);
    expect(
      await cat("board_category_save", {
        p_id: c["상장"],
        p_name: "수료 상장",
      }),
    ).toEqual({
      status: "ok",
      id: c["상장"],
    });
    expect(
      await cat("board_category_save", { p_id: 9999, p_name: "없음" }),
    ).toEqual({
      status: "missing",
    });
    // order = the full list of ids, each once
    const order = [added.id, ...Object.values(c)];
    expect(
      await cat("board_category_order", {
        p_ids: { sql: `array[${order.join(",")}]::bigint[]` },
      }),
    ).toEqual({ status: "ok" });
    cats = (await admin()).categories;
    expect(cats.map((x) => x.id)).toEqual(order);
    expect(cats[3].name).toBe("수료 상장");
    for (const wrong of [
      order.slice(1),
      [...order, order[0]],
      [...order.slice(1), 9999],
    ]) {
      await expect(
        cat("board_category_order", {
          p_ids: { sql: `array[${wrong.join(",")}]::bigint[]` },
        }),
      ).rejects.toThrow(/board: category order/);
    }
    // the user list follows the new order
    await setFlag(db, "resource_board_enabled", true);
    expect(
      (await call(db, who.teacher, "board_list", {})).categories.map(
        (x) => x.id,
      ),
    ).toEqual(order);
    // a category with posts cannot go; an empty one can
    expect(await cat("board_category_delete", { p_id: c["상장"] })).toEqual({
      status: "in_use",
      posts: 2,
    });
    expect(await cat("board_category_delete", { p_id: added.id })).toEqual({
      status: "ok",
      posts: 0,
    });
    expect(await cat("board_category_delete", { p_id: added.id })).toEqual({
      status: "missing",
      posts: 0,
    });
    // members never write categories
    for (const caller of [who.teacher, who.anon]) {
      await expect(
        call(db, caller, "board_category_save", { p_id: null, p_name: "x" }),
      ).rejects.toThrow(/permission denied for function/);
    }
    await expect(
      call(db, who.other, "board_category_delete", { p_id: c["상장"] }),
    ).rejects.toThrow(/not authorized/);
  } finally {
    await db.close();
  }
});

test("resource board sql: downloads — Edge Function only, the teacher-resources 30/day counter shared (B6)", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(180000);
  const db = await fresh();
  try {
    const who = await people(db);
    const c = await categoryIds(db);
    const p = pid(60);
    await savePost(db, who.admin, {
      id: p,
      title: "11월 핵심문장 스크립트",
      level: "level-2",
      category: c["핵심문장 스크립트"],
      attachments: [
        fileItem(p, 1, "pdf", "스크립트.pdf"),
        driveItem(DRIVE_A, "사진"),
        fileItem(p, 2, "pptx", "발표.pptx"),
      ],
    });
    const hidden = pid(61);
    await savePost(db, who.admin, {
      id: hidden,
      title: "숨긴 글",
      level: "level-2",
      category: c["핵심문장 스크립트"],
      published: false,
      attachments: [fileItem(hidden, 1)],
    });
    const att = (await call(db, who.admin, "board_admin_get", { p_id: p }))
      .attachments;
    const hid = (await call(db, who.admin, "board_admin_get", { p_id: hidden }))
      .attachments;
    const issue = (caller, id, adminUid = null) =>
      call(db, { role: "service_role", ...caller }, "board_attachment_issue", {
        p_attachment_id: id,
        p_admin_uid: adminUid,
      });

    // only the Edge Function (service role) may call it
    for (const caller of [who.anon, who.teacher, who.admin]) {
      await expect(
        call(db, caller, "board_attachment_issue", {
          p_attachment_id: att[0].id,
        }),
      ).rejects.toThrow(/permission denied for function/);
    }
    // board off: members "off"; the admin (unlimited) still gets the file
    expect(await issue(who.teacher, att[0].id)).toEqual({ status: "off" });
    expect(await issue({}, att[0].id, ADMIN_UID)).toEqual({
      status: "ok",
      path: fpath(p, 1, "pdf"),
      name: "스크립트.pdf",
    });
    await setFlag(db, "resource_board_enabled", true);
    expect(await issue(who.teacher, att[0].id)).toEqual({
      status: "ok",
      path: fpath(p, 1, "pdf"),
      name: "스크립트.pdf",
    });
    expect((await issue(who.branch, att[2].id)).name).toBe("발표.pptx");
    // students, visitors, signed-in non-admins, junk tokens: denied
    for (const caller of [who.student, {}, { token: "not-a-session" }]) {
      expect(await issue(caller, att[0].id)).toEqual({ status: "denied" });
    }
    expect(await issue({}, att[0].id, OTHER_UID)).toEqual({ status: "denied" });
    // a Drive link, a hidden post's file, an unknown id: "empty" (404)
    expect(await issue(who.teacher, att[1].id)).toEqual({ status: "empty" });
    expect(await issue(who.teacher, hid[0].id)).toEqual({ status: "empty" });
    expect(await issue(who.teacher, pid(999))).toEqual({ status: "empty" });
    expect((await issue({}, hid[0].id, ADMIN_UID)).status).toBe("ok");

    // the log: LMS members' ok issues only, in the teacher-resources table
    const logged = await db.query(`
      select m.id, d.level, d.slot from public.teacher_resource_downloads d
        join public.members m on m.member_id = d.member_id order by d.id`);
    expect(logged.rows).toEqual([
      { id: "b-teacher", level: "board", slot: att[0].id },
      { id: "b-branch", level: "board", slot: att[2].id },
    ]);

    // one counter: 19 teacher-resource files + this one = 20 … up to 30 in all
    await as(
      db,
      who.admin,
      "insert into storage.objects (bucket_id, name) values ('teacher-resources', 'level-2/plan/1730000000001.pdf')",
    );
    await call(db, who.admin, "teacher_resource_set", {
      p_level: "level-2",
      p_slot: "plan",
      p_path: "level-2/plan/1730000000001.pdf",
      p_name: "연간.pdf",
      p_size: 100,
    });
    const tr = () =>
      call(
        db,
        { role: "service_role", ...who.teacher },
        "teacher_resource_issue",
        {
          p_level: "level-2",
          p_slot: "plan",
          p_admin_uid: null,
        },
      );
    for (let i = 0; i < 19; i += 1) expect((await tr()).status).toBe("ok");
    for (let i = 0; i < 10; i += 1)
      expect((await issue(who.teacher, att[0].id)).status).toBe("ok");
    // 1 + 19 + 10 = 30 today: both kinds stop
    expect(await issue(who.teacher, att[0].id)).toEqual({ status: "limit" });
    expect(await tr()).toEqual({ status: "limit" });
    // others keep their own count; the admin is never limited or logged
    expect((await issue(who.teacher2, att[0].id)).status).toBe("ok");
    for (let i = 0; i < 35; i += 1) {
      expect((await issue({}, att[0].id, ADMIN_UID)).status).toBe("ok");
    }
    // a drive link never counts: still "empty", not "limit"
    expect(await issue(who.teacher, att[1].id)).toEqual({ status: "empty" });
  } finally {
    await db.close();
  }
});

test("resource board sql: teacher resources switch (T3) — off = no list for members, the admin keeps managing", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  const db = await fresh();
  try {
    const who = await people(db);
    await as(
      db,
      who.admin,
      "insert into storage.objects (bucket_id, name) values ('teacher-resources', 'beginner/plan/1730000000001.pdf')",
    );
    await call(db, who.admin, "teacher_resource_set", {
      p_level: "beginner",
      p_slot: "plan",
      p_path: "beginner/plan/1730000000001.pdf",
      p_name: "연간.pdf",
      p_size: 100,
    });
    const list = (caller) =>
      as(
        db,
        caller,
        "select slot, file_name from public.teacher_resources_list('beginner')",
      );
    const on = await list(who.teacher);
    expect(on.length).toBe(15);
    expect(await list(who.branch)).toEqual(on);
    await setFlag(db, "teacher_resources_enabled", false);
    expect(await list(who.teacher)).toEqual([]);
    expect(await list(who.branch)).toEqual([]);
    expect(await list(who.admin)).toEqual(on); // the admin screen keeps working
    expect(await list(who.student)).toEqual([]);
    // the download path is unchanged (PM: Edge Function behaviour as before)
    expect(
      (
        await call(
          db,
          { role: "service_role", ...who.teacher },
          "teacher_resource_issue",
          {
            p_level: "beginner",
            p_slot: "plan",
            p_admin_uid: null,
          },
        )
      ).status,
    ).toBe("ok");
    // the files stay; back on = as before
    await setFlag(db, "teacher_resources_enabled", true);
    expect(await list(who.teacher)).toEqual(on);
    // a value that is not false (deleted, junk) = on, the safe default
    await db.exec(
      "delete from public.site_settings where key = 'teacher_resources_enabled'",
    );
    expect(await list(who.teacher)).toEqual(on);
    await setFlag(db, "teacher_resources_enabled", "no");
    expect(await list(who.teacher)).toEqual(on);
  } finally {
    await db.close();
  }
});

// Every definition in the public schema, the storage policies and buckets.
const CATALOG = `
  select 'fn ' || p.oid::regprocedure::text || ' ' || md5(p.prosrc) || ' '
         || pg_get_function_result(p.oid) || ' '
         || coalesce(array_to_string(p.proacl, ','), '-') || ' '
         || coalesce(array_to_string(p.proconfig, ','), '-') || ' ' || p.prosecdef || ' ' || p.provolatile::text as x
    from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all
  select 'con ' || conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid)
    from pg_constraint where connamespace = 'public'::regnamespace
  union all
  select 'idx ' || pg_get_indexdef(x.indexrelid)
    from pg_index x join pg_class c on c.oid = x.indrelid
   where c.relnamespace = 'public'::regnamespace
  union all
  select 'pol ' || schemaname || '.' || tablename || ' ' || policyname || ' ' || cmd || ' '
         || roles::text || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, '')
    from pg_policies where schemaname in ('public', 'storage')
  union all
  select 'col ' || a.attrelid::regclass || ' ' || a.attname || ' '
         || format_type(a.atttypid, a.atttypmod) || ' ' || a.attnotnull || ' '
         || coalesce(pg_get_expr(d.adbin, d.adrelid), '-')
    from pg_attribute a join pg_class c on c.oid = a.attrelid
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and a.attnum > 0 and not a.attisdropped
  union all
  select 'acl ' || c.relname || ' ' || c.relrowsecurity || ' ' || coalesce(array_to_string(c.relacl, ','), '-')
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  union all
  select 'bucket ' || id || ' ' || public || ' ' || file_size_limit || ' '
         || array_to_string(allowed_mime_types, ',') from storage.buckets
  union all
  select 'setting ' || key || ' ' || value::text from public.site_settings
  union all
  select 'category ' || name || ' ' || position || ' ' || color from public.board_categories
  order by 1`;

test("resource board sql: upgrade — live (a4da52b) + migration.sql twice = fresh install; the old calls answer as before", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(240000);
  const live = new PGlite({ extensions: { pgcrypto } });
  const fresh2 = new PGlite({ extensions: { pgcrypto } });
  try {
    await live.exec(SUPABASE_SHIM);
    await live.exec(LIVE);
    expect(LIVE).not.toContain("board_posts");
    const who = await people(live);
    // live data: a teacher-resources file and a Drive link
    await as(
      live,
      who.admin,
      "insert into storage.objects (bucket_id, name) values ('teacher-resources', 'level-2/plan/1730000000030.pdf')",
    );
    await call(live, who.admin, "teacher_resource_set", {
      p_level: "level-2",
      p_slot: "plan",
      p_path: "level-2/plan/1730000000030.pdf",
      p_name: "2026 연간교육안.pdf",
      p_size: 5000,
    });
    await call(live, who.admin, "teacher_resource_set_drive", {
      p_level: "level-2",
      p_slot: "monthly-03",
      p_drive_id: DRIVE_A,
    });
    // what the live page (a4da52b) asks, and what it gets
    const oldCalls = async () => ({
      teacher: await as(
        live,
        who.teacher,
        "select slot, file_name, file_size, drive_id from public.teacher_resources_list('level-2')",
      ),
      branch: await as(
        live,
        who.branch,
        "select slot, file_name, drive_id from public.teacher_resources_list('beginner')",
      ),
      admin: await as(
        live,
        who.admin,
        "select slot, file_name, drive_id from public.teacher_resources_list('level-3')",
      ),
      student: await as(
        live,
        who.student,
        "select slot from public.teacher_resources_list('level-2')",
      ),
      signup: await as(
        live,
        {},
        "select key, value from public.site_settings where key in ('signup_visible', 'game_hosts') order by key",
      ),
      issue: await call(
        live,
        { role: "service_role", ...who.teacher },
        "teacher_resource_issue",
        {
          p_level: "level-2",
          p_slot: "plan",
          p_admin_uid: null,
        },
      ),
      issueDrive: await call(
        live,
        { role: "service_role", ...who.teacher },
        "teacher_resource_issue",
        {
          p_level: "level-2",
          p_slot: "monthly-03",
          p_admin_uid: null,
        },
      ),
    });
    const before = await oldCalls();
    const rows =
      "select level, slot, storage_path, file_name, file_size, drive_id from public.teacher_resources order by 1, 2";
    const rowsBefore = (await live.query(rows)).rows;

    await live.exec(MIGRATION);
    const once = (await live.query(CATALOG)).rows;
    await live.exec(MIGRATION); // re-run safe
    expect((await live.query(CATALOG)).rows).toEqual(once);
    expect((await live.query(rows)).rows).toEqual(rowsBefore);
    expect(await oldCalls()).toEqual(before);

    await fresh2.exec(SUPABASE_SHIM);
    await fresh2.exec(MIGRATION);
    expect(once.map((r) => r.x)).toEqual(
      (await fresh2.query(CATALOG)).rows.map((r) => r.x),
    );
  } finally {
    await live.close();
    await fresh2.close();
  }
});

// D79 / D80 upgrade: the live database before them (commit 7869dec = the
// board as it runs since 2026-11-04, 수정 금지) with file and Drive rows.
const LIVE_BOARD = readFileSync(
  path.resolve("tests/fixtures/migration-7869dec.sql"),
  "utf8",
);

test("resource board sql: D79/D80 upgrade — live (7869dec) with file and Drive rows + migration.sql twice = fresh install; rows kept; the live page's saves answer as before", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(240000);
  const live = new PGlite({ extensions: { pgcrypto } });
  const fresh2 = new PGlite({ extensions: { pgcrypto } });
  try {
    await live.exec(SUPABASE_SHIM);
    await live.exec(LIVE_BOARD);
    expect(LIVE_BOARD).toContain("check (kind in ('file', 'drive'))");
    const who = await people(live);
    await setFlag(live, "resource_board_enabled", true);
    const c = await categoryIds(live);
    const post = pid(70);
    const base = {
      id: post,
      title: "운영 글",
      level: "common",
      category: c["상장"],
    };
    // the live page's save today: a file + a Drive link
    const first = await savePost(live, who.admin, {
      ...base,
      attachments: [fileItem(post, 1), driveItem(DRIVE_A, "상장 배경")],
    });
    expect(first.status).toBe("ok");
    // before: 21 and a Google Sheets link are refused
    const many = Array.from({ length: 21 }, (_, i) => fileItem(post, 10 + i));
    await expect(
      savePost(live, who.admin, { ...base, attachments: many }),
    ).rejects.toThrow(/too many attachments \(20 at most\)/);
    await expect(
      savePost(live, who.admin, {
        ...base,
        attachments: [linkItem("gsheet", SHEET_ID, "시트")],
      }),
    ).rejects.toThrow(/board: attachment kind/);

    const rows =
      "select post_id, position, kind, storage_path, file_name, file_type, file_size, drive_id, label from public.board_attachments order by post_id, position";
    const rowsBefore = (await live.query(rows)).rows;
    expect(rowsBefore.map((r) => r.kind)).toEqual(["file", "drive"]);
    const ids = (
      await call(live, who.admin, "board_admin_get", { p_id: post })
    ).attachments.map((a) => a.id);
    // (the first open counts today's view; the second is the steady answer)
    await call(live, who.teacher, "board_post_get", { p_id: post });
    const teacherBefore = await call(live, who.teacher, "board_post_get", {
      p_id: post,
    });

    await live.exec(MIGRATION);
    const once = (await live.query(CATALOG)).rows;
    await live.exec(MIGRATION); // re-run safe
    expect((await live.query(CATALOG)).rows).toEqual(once);
    expect((await live.query(rows)).rows).toEqual(rowsBefore);
    await fresh2.exec(SUPABASE_SHIM);
    await fresh2.exec(MIGRATION);
    await setFlag(fresh2, "resource_board_enabled", true); // as on `live`
    expect(once.map((r) => r.x)).toEqual(
      (await fresh2.query(CATALOG)).rows.map((r) => r.x),
    );

    // after: the teacher's answer is the same (the same KST day — no new
    // view); the live page's save (file + Drive, by id with a Drive label)
    // answers as before
    const teacherAfter = await call(live, who.teacher, "board_post_get", {
      p_id: post,
    });
    expect(teacherAfter).toEqual(teacherBefore);
    const again = await call(live, who.admin, "board_post_save", {
      p_id: post,
      p_title: base.title,
      p_body: "",
      p_level: "common",
      p_category: c["상장"],
      p_published: true,
      p_pinned: false,
      p_attachments: [
        { id: ids[1], label: "상장 배경 (고화질)" },
        { id: ids[0] },
      ],
    });
    expect(again).toEqual({ status: "ok", id: post, removed: [] });
    // and the new ones: 21 attachments, a Sheets / Docs / Slides link
    expect(
      (
        await savePost(live, who.admin, {
          ...base,
          attachments: [
            ...many.map((f) => ({ ...f, skipUpload: true })),
            linkItem("gsheet", SHEET_ID, "시트"),
            linkItem("gdoc", DOC_ID, "문서"),
            linkItem("gslides", SLIDES_ID, "슬라이드"),
          ],
        })
      ).status,
    ).toBe("ok");
  } finally {
    await live.close();
    await fresh2.close();
  }
});

// Security review (2026-11-03) L1 · L2 · L3: a file already attached cannot
// come back as a "new" file (its object would be deleted under it); a file
// whose Storage object is gone is "empty" and costs no download; a save that
// leaves "public" out keeps the post hidden.
test("resource board sql: review fixes — re-sent path refused, missing object not counted, NULL public = hidden", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  const db = await fresh();
  try {
    const who = await people(db);
    const c = await categoryIds(db);
    const p = pid(70);
    await savePost(db, who.admin, {
      id: p,
      title: "검토 글",
      level: "level-1",
      category: c["상장"],
      attachments: [fileItem(p, 1), fileItem(p, 2)],
    });
    const att = (await call(db, who.admin, "board_admin_get", { p_id: p }))
      .attachments;
    // L1: the same path as a "new" file → refused, nothing changes
    await expect(
      savePost(db, who.admin, {
        id: p,
        title: "검토 글",
        level: "level-1",
        category: c["상장"],
        attachments: [
          { id: att[1].id },
          { ...fileItem(p, 1), skipUpload: true },
        ],
      }),
    ).rejects.toThrow(/board: attachment .*already/);
    expect(
      (
        await call(db, who.admin, "board_admin_get", { p_id: p })
      ).attachments.map((a) => a.id),
    ).toEqual(att.map((a) => a.id));

    // L2: the object is gone from Storage → "empty", nothing counted
    await setFlag(db, "resource_board_enabled", true);
    await db.exec(
      `delete from storage.objects where bucket_id = '${BUCKET}' and name = '${fpath(p, 2)}'`,
    );
    const issue = (id) =>
      call(
        db,
        { role: "service_role", ...who.teacher },
        "board_attachment_issue",
        {
          p_attachment_id: id,
          p_admin_uid: null,
        },
      );
    expect(await issue(att[1].id)).toEqual({ status: "empty" });
    expect((await issue(att[0].id)).status).toBe("ok");
    expect(
      (
        await db.query(
          "select count(*)::int as n from public.teacher_resource_downloads",
        )
      ).rows[0].n,
    ).toBe(1);

    // L3: public left out (NULL) = hidden; pinned left out = not pinned
    const q = pid(71);
    await call(db, who.admin, "board_post_save", {
      p_id: q,
      p_title: "공개 값 없음",
      p_body: "",
      p_level: "common",
      p_category: c["상장"],
      p_published: null,
      p_pinned: null,
      p_attachments: [],
    });
    expect(
      (await call(db, who.admin, "board_admin_get", { p_id: q })).post,
    ).toMatchObject({ published: false, pinned: false });
  } finally {
    await db.close();
  }
});

// supabase/lms/verify-resource-board.sql — the read-only catalog check the
// user can run on the live project (security review M1). Every row passes on
// a fresh migration, and each kind of drift turns exactly its own row false.
test("resource board sql: read-only verify script", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  const SCRIPT = readFileSync(
    path.resolve("supabase/lms/verify-resource-board.sql"),
    "utf8",
  );
  const code = SCRIPT.replace(/--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''");
  expect(code).not.toMatch(
    /\b(insert|update|delete|merge|create|drop|alter|grant|revoke|truncate|set_config|begin|commit|into|copy|call|do|set|lock|notify|nextval|setval|pg_advisory\w*)\b/i,
  );
  expect(code.split(";").filter((s) => s.trim())).toHaveLength(1);
  const db = await fresh();
  try {
    const rowsOf = (results) =>
      [...results].reverse().find((r) => r.rows.length).rows;
    const clean = rowsOf(await db.exec(SCRIPT));
    expect(clean[0]).toMatchObject({ no: 0, area: "SUMMARY", pass: true });
    expect(clean.filter((r) => r.pass === false)).toEqual([]);
    expect(clean.find((r) => r.area === "info").actual).toBe(
      "resource_board_enabled=false, teacher_resources_enabled=true",
    );
    const failing = async (drift) => {
      const rows = rowsOf(
        await db.exec(`begin; ${drift}; ${SCRIPT}; rollback;`),
      );
      expect(rows[0]).toMatchObject({ no: 0, area: "SUMMARY", pass: false });
      return rows.filter((r) => r.no > 0 && r.pass === false).map((r) => r.no);
    };
    const cases = [
      [`update storage.buckets set public = true where id = '${BUCKET}'`, [1]],
      [
        `update storage.buckets set file_size_limit = 52428800 where id = '${BUCKET}'`,
        [2],
      ],
      [
        `update storage.buckets set allowed_mime_types = array['application/pdf'] where id = '${BUCKET}'`,
        [3],
      ],
      ["grant select on public.board_posts to anon", [5]],
      [
        "grant select (label) on public.board_attachments to authenticated",
        [6],
      ],
      [
        "create policy zz on public.board_post_views for select using (true)",
        [7],
      ],
      ["alter table public.board_categories disable row level security", [4]],
      ["grant usage on sequence public.board_categories_id_seq to anon", [8]],
      ["create view public.zz_posts as select * from public.board_posts", [9]],
      [
        "revoke execute on function public.board_list(text, bigint, text, text, integer) from anon",
        [10],
      ],
      [
        "grant execute on function public.board_post_save(uuid, text, text, text, bigint, boolean, boolean, jsonb) to anon",
        [14],
      ],
      [
        "grant execute on function public.board_attachment_issue(uuid, uuid) to authenticated",
        [19],
      ],
      [
        "grant execute on function public.board_ranked(text, bigint, text, text) to anon",
        [22],
      ],
      [
        "grant execute on function public.site_flag(text, boolean) to authenticated",
        [24],
      ],
      ["alter function public.board_admin_get(uuid) reset search_path", [25]],
      [
        `create function public.zz_peek() returns setof text language sql
           as $$ select title from public.board_posts $$`,
        [26],
      ],
      [
        `alter policy resource_board_admin_all on storage.objects
           using (bucket_id = '${BUCKET}')`,
        [27],
      ],
      [
        `create policy zz_read on storage.objects for select to authenticated
           using (bucket_id = '${BUCKET}')`,
        [28],
      ],
      [
        `alter policy resource_board_admin_all on storage.objects
           with check (bucket_id = '${BUCKET}' and public.is_admin() and name ~ '.*hwpx|.*')`,
        [27],
      ],
      [
        "create policy zz_any on storage.objects for select to authenticated using (true)",
        [32],
      ],
      [
        "alter table public.board_attachments drop constraint board_attachments_source_ok",
        [29],
      ],
      [
        "delete from public.site_settings where key = 'resource_board_enabled'",
        [30],
      ],
    ];
    for (const [drift, expected] of cases) {
      expect(await failing(drift), drift).toEqual(expected);
    }
    expect(rowsOf(await db.exec(SCRIPT))[0].pass).toBe(true);
  } finally {
    await db.close();
  }
});
