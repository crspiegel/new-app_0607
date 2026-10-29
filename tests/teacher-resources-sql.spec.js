import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { SUPABASE_SHIM } from "./sql-shim.mjs";

// Teacher resources (B, 2026-10-29) — the "Teacher resources" block of
// supabase/migration.sql in PGlite, never against the live project. Callers
// are simulated the way PostgREST / the Storage API run them: a role (anon or
// authenticated), request.headers (x-lms-token) and request.jwt.claims.
// What PGlite cannot show (the real Storage API signing a URL, the bucket's
// size/MIME limits, CORS) is checked on the live project by the user.

const MIGRATION = readFileSync(path.resolve("supabase/migration.sql"), "utf8");
const ADMIN_UID = "00000000-0000-4000-8000-0000000000ad";
const OTHER_UID = "00000000-0000-4000-8000-0000000000ee";
const BUCKET = "teacher-resources";
const PDF = "application/pdf";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLS = "application/vnd.ms-excel";

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

test("teacher resources sql: bucket, RPCs, storage policies", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(SUPABASE_SHIM);
    await db.exec(MIGRATION);
    await db.exec(MIGRATION); // re-run safe

    // --- bucket: private, 10 MB, PDF / xlsx / xls — one row after two runs
    const bucket = await db.query(
      `select id, public, file_size_limit::int as max, allowed_mime_types as types
         from storage.buckets where id = '${BUCKET}'`,
    );
    expect(bucket.rows).toEqual([
      {
        id: BUCKET,
        public: false,
        max: 10485760,
        types: [PDF, XLSX, XLS],
      },
    ]);

    // --- people: an admin, a non-admin auth user, LMS roles 1 / 2 / 3
    await db.exec(`
      insert into auth.users (id, email) values
        ('${ADMIN_UID}', 'admin@example.test'), ('${OTHER_UID}', 'other@example.test');
      insert into public.admins (user_id) values ('${ADMIN_UID}');
      insert into public.members (id, password_hash, grade, role) values
        ('t-branch', extensions.crypt('pw-1', extensions.gen_salt('bf')), 1, 1),
        ('t-teacher', extensions.crypt('pw-2', extensions.gen_salt('bf')), 2, 2),
        ('t-student', extensions.crypt('pw-3', extensions.gen_salt('bf')), 3, 3);
    `);
    const tokenOf = async (id, pw) =>
      (
        await as(
          db,
          {},
          `select public.lms_login('${id}', '${pw}') ->> 'token' as token`,
        )
      )[0].token;
    const branch = await tokenOf("t-branch", "pw-1");
    const teacher = await tokenOf("t-teacher", "pw-2");
    const student = await tokenOf("t-student", "pw-3");
    expect([branch, teacher, student].every((t) => t && t.length > 20)).toBe(
      true,
    );
    const admin = { role: "authenticated", uid: ADMIN_UID };
    const other = { role: "authenticated", uid: OTHER_UID };

    // --- the table itself: nobody reads or writes it directly
    for (const who of [{}, { token: teacher }, admin]) {
      await expect(
        as(db, who, "select * from public.teacher_resources"),
      ).rejects.toThrow(/permission denied/);
    }
    await expect(
      as(
        db,
        admin,
        `insert into public.teacher_resources (level, slot, storage_path, file_name, file_size)
           values ('beginner', 'plan', 'beginner/plan/1730000000000.pdf', 'x.pdf', 1)`,
      ),
    ).rejects.toThrow(/permission denied/);

    // --- storage: the admin uploads (only well-formed ASCII paths) ...
    const upload = (who, name) =>
      as(
        db,
        who,
        `insert into storage.objects (bucket_id, name) values ('${BUCKET}', '${name}')`,
      );
    await upload(admin, "beginner/plan/1730000000000.pdf");
    await upload(admin, "beginner/plan/1730000000001.pdf");
    await upload(admin, "level-2/test/1730000000002.xlsx");
    for (const bad of [
      "beginner/plan/연간.pdf",
      "x.pdf",
      "beginner/test/1730000000003.pdf",
      "level-1/plan/1730000000004.docx",
    ]) {
      await expect(upload(admin, bad)).rejects.toThrow(/row-level security/);
    }
    // ... nobody else does
    await expect(
      upload(other, "level-1/plan/1730000000005.pdf"),
    ).rejects.toThrow(/row-level security/);
    await expect(
      upload({ token: teacher }, "level-1/plan/1730000000006.pdf"),
    ).rejects.toThrow(/row-level security/);

    // --- teacher_resource_set: admin only; returns the replaced path
    const set = (who, level, slot, p, name = "연간교육안.pdf", size = 1234) =>
      as(
        db,
        who,
        `select public.teacher_resource_set('${level}', '${slot}', '${p}', '${name}', ${size}) as old`,
      );
    await expect(
      set(
        { token: teacher },
        "beginner",
        "plan",
        "beginner/plan/1730000000000.pdf",
      ),
    ).rejects.toThrow(/permission denied for function/); // anon: no EXECUTE
    await expect(
      set(other, "beginner", "plan", "beginner/plan/1730000000000.pdf"),
    ).rejects.toThrow(/not authorized/); // signed in, not an admin
    expect(
      await set(admin, "beginner", "plan", "beginner/plan/1730000000000.pdf"),
    ).toEqual([{ old: null }]);
    expect(
      await set(admin, "beginner", "plan", "beginner/plan/1730000000001.pdf"),
    ).toEqual([{ old: "beginner/plan/1730000000000.pdf" }]);
    expect(
      await set(
        admin,
        "level-2",
        "test",
        "level-2/test/1730000000002.xlsx",
        "테스트 문제.xlsx",
        2048,
      ),
    ).toEqual([{ old: null }]);
    // 'test' only on level-2 / level-3; the path must match level/slot; the
    // object must be in Storage; 10 MB at most.
    await expect(
      set(admin, "beginner", "test", "beginner/plan/1730000000001.pdf"),
    ).rejects.toThrow(/teacher_resources_slot_ok|teacher_resources_path_ok/);
    await expect(
      set(admin, "beginner", "award", "beginner/plan/1730000000001.pdf"),
    ).rejects.toThrow(/teacher_resources_path_ok/);
    await expect(
      set(admin, "level-1", "plan", "level-1/plan/1739999999999.pdf"),
    ).rejects.toThrow(/not in storage/);
    await upload(admin, "level-3/award/1730000000009.pdf");
    await expect(
      set(
        admin,
        "level-3",
        "award",
        "level-3/award/1730000000009.pdf",
        "big.pdf",
        10485761,
      ),
    ).rejects.toThrow(/check constraint/);

    // --- teacher_resources_list: admin + LMS role 1/2 only, fixed slots
    const list = (who, level) =>
      as(
        db,
        who,
        `select slot, file_name, file_size::int as size from public.teacher_resources_list('${level}')`,
      );
    expect(await list({}, "beginner")).toEqual([]);
    expect(await list({ token: student }, "beginner")).toEqual([]);
    expect(await list(other, "beginner")).toEqual([]);
    const beginner = [
      { slot: "plan", file_name: "연간교육안.pdf", size: 1234 },
      { slot: "award", file_name: null, size: null },
    ];
    expect(await list({ token: teacher }, "beginner")).toEqual(beginner);
    expect(await list({ token: branch }, "beginner")).toEqual(beginner);
    expect(await list(admin, "beginner")).toEqual(beginner);
    expect(await list({ token: teacher }, "level-2")).toEqual([
      { slot: "plan", file_name: null, size: null },
      { slot: "award", file_name: null, size: null },
      { slot: "test", file_name: "테스트 문제.xlsx", size: 2048 },
    ]);
    expect(
      (await list({ token: teacher }, "level-1")).map((r) => r.slot),
    ).toEqual(["plan", "award"]);
    expect(await list({ token: teacher }, "Level 1")).toEqual([]);

    // --- teacher_resource_file: the path + name, or NULL
    const file = (who, level, slot) =>
      as(
        db,
        who,
        `select public.teacher_resource_file('${level}', '${slot}') as f`,
      );
    expect(await file({ token: teacher }, "beginner", "plan")).toEqual([
      {
        f: { path: "beginner/plan/1730000000001.pdf", name: "연간교육안.pdf" },
      },
    ]);
    expect(await file({ token: student }, "beginner", "plan")).toEqual([
      { f: null },
    ]);
    expect(await file({}, "beginner", "plan")).toEqual([{ f: null }]);
    expect(await file({ token: teacher }, "beginner", "award")).toEqual([
      { f: null },
    ]);

    // --- Storage read (= signing a URL): admin and LMS role 1/2 only, from
    // the x-lms-token header the Storage API passes as request.headers.
    await db.exec(
      "insert into storage.objects (bucket_id, name) values ('covers', 'level-1/march/book-1')",
    );
    const visible = async (who, role = "anon") =>
      (
        await as(
          db,
          { role, ...who },
          `select count(*)::int as n from storage.objects where bucket_id = '${BUCKET}'`,
        )
      )[0].n;
    // LMS sessions see only the CURRENT file of each slot (2): never the
    // replaced …000.pdf nor …009.pdf whose set failed — an orphan left by a
    // failed Storage remove stays out of reach. Admins see all 4.
    const names = async (who) =>
      (
        await as(
          db,
          who,
          `select name from storage.objects where bucket_id = '${BUCKET}' order by name`,
        )
      ).map((r) => r.name);
    expect(await names({ token: teacher })).toEqual([
      "beginner/plan/1730000000001.pdf",
      "level-2/test/1730000000002.xlsx",
    ]);
    expect(await visible({ token: branch })).toBe(2);
    expect(await visible({ token: student })).toBe(0);
    expect(await visible({})).toBe(0);
    expect(await visible({ token: "not-a-session" })).toBe(0);
    expect(await visible({ uid: ADMIN_UID }, "authenticated")).toBe(4);
    expect(await visible({ uid: OTHER_UID }, "authenticated")).toBe(0);
    // the public covers bucket is untouched
    expect(
      (
        await as(
          db,
          {},
          "select count(*)::int as n from storage.objects where bucket_id = 'covers'",
        )
      )[0].n,
    ).toBe(1);
    // LMS sessions cannot delete or overwrite objects
    expect(
      await as(
        db,
        { token: teacher },
        `delete from storage.objects where bucket_id = '${BUCKET}' returning name`,
      ),
    ).toEqual([]);

    // --- teacher_resource_clear: admin only; returns the path to delete
    await expect(
      as(
        db,
        { token: teacher },
        "select public.teacher_resource_clear('beginner', 'plan')",
      ),
    ).rejects.toThrow(/permission denied for function/);
    await expect(
      as(db, other, "select public.teacher_resource_clear('beginner', 'plan')"),
    ).rejects.toThrow(/not authorized/);
    expect(
      await as(
        db,
        admin,
        "select public.teacher_resource_clear('beginner', 'plan') as old",
      ),
    ).toEqual([{ old: "beginner/plan/1730000000001.pdf" }]);
    expect(await list(admin, "beginner")).toEqual([
      { slot: "plan", file_name: null, size: null },
      { slot: "award", file_name: null, size: null },
    ]);
    expect(
      await as(
        db,
        admin,
        "select public.teacher_resource_clear('beginner', 'plan') as old",
      ),
    ).toEqual([{ old: null }]);
  } finally {
    await db.close();
  }
});

// supabase/lms/teacher-test-account.sql — the live teacher (role 2, hq)
// account for the download check. Nobody types a password: the server makes
// a random one and shows it ONCE in the result row, so it is never part of
// the statement text (SQL Editor history, error logs, pg_stat_statements).
// Re-running resets it (the old one stops working).
test("teacher resources sql: teacher test account script", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  const SCRIPT = readFileSync(
    path.resolve("supabase/lms/teacher-test-account.sql"),
    "utf8",
  );
  expect(SCRIPT).not.toMatch(/CHANGE-ME|v_pw text := '/);
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(SUPABASE_SHIM);
    await db.exec(MIGRATION);

    const run = async () => {
      const results = await db.exec(SCRIPT);
      const rows = results[results.length - 1].rows;
      expect(rows).toHaveLength(1);
      const { password, ...rest } = rows[0];
      expect(rest).toEqual({
        id: "tps-teacher-test",
        role: 2,
        branch: "hq",
        active: true,
        sessions: 0,
      });
      expect(password).toMatch(/^[A-Za-z0-9_-]{12}$/);
      return password;
    };
    const login = async (pw) =>
      (
        await as(
          db,
          {},
          `select public.lms_login('tps-teacher-test', '${pw}') as r`,
        )
      )[0].r;
    const first = await run();
    const second = await run(); // re-run = new password, still one account
    expect(second).not.toBe(first);
    expect((await login(first)).status).toBe("invalid");
    const answer = await login(second);
    expect(answer.status).toBe("ok");
    expect(answer.role).toBe(2);
    expect(
      (
        await db.query(
          "select count(*)::int as n from public.members where id = 'tps-teacher-test'",
        )
      ).rows[0].n,
    ).toBe(1);
    const token = answer.token;
    expect(
      (
        await as(
          db,
          { token },
          "select slot from public.teacher_resources_list('level-3')",
        )
      ).map((r) => r.slot),
    ).toEqual(["plan", "award", "test"]);
  } finally {
    await db.close();
  }
});
