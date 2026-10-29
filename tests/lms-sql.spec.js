import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { SUPABASE_SHIM, lastRows } from "./sql-shim.mjs";

// LMS SQL 1 (Phase 3A) checked locally, never against the live project:
// PGlite (embedded Postgres + pgcrypto) gets a small Supabase look-alike
// (anon/authenticated roles, extensions/auth/storage schemas, Supabase's
// default grants), then: old schema + old members → 00-precheck.sql →
// migration.sql twice (idempotent) → verify-3a.sql (every row must pass)
// → nothing left behind. Pure Node — one project only.

const read = (file) => readFileSync(path.resolve(file), "utf8");
const MIGRATION = read("supabase/migration.sql");
const PRECHECK = read("supabase/lms/00-precheck.sql");
const VERIFY = read("supabase/lms/verify-3a.sql");
const LMS_START = MIGRATION.indexOf(
  "-- ============================================================================\n-- LMS (Phase 3A",
);

const ADMIN_UID = "00000000-0000-4000-8000-0000000000ad";

// Live members before the LMS block (one per old grade).
const OLD_MEMBERS = `
  insert into auth.users (id, email) values ('${ADMIN_UID}', 'admin@example.test');
  insert into public.admins (user_id) values ('${ADMIN_UID}');
  insert into public.members (id, password_hash, grade) values
    ('Student01', extensions.crypt('pw-student', extensions.gen_salt('bf')), 3),
    ('teach1', extensions.crypt('pw-teach1', extensions.gen_salt('bf')), 1),
    ('teach2', extensions.crypt('pw-teach2', extensions.gen_salt('bf')), 2),
    ('old!user', extensions.crypt('pw-old', extensions.gen_salt('bf')), 3);
`;

async function rows(db, sql) {
  return (await db.query(sql)).rows;
}

test("lms sql: precheck → migration ×2 → verify-3a, no trace", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  expect(LMS_START).toBeGreaterThan(0);

  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(SUPABASE_SHIM);
    await db.exec(MIGRATION.slice(0, LMS_START)); // the schema that is live today
    await db.exec(OLD_MEMBERS);

    // --- precheck: read-only, one table
    const before = lastRows(await db.exec(PRECHECK));
    const check = (list, no) => list.find((r) => r.no === no)?.value;
    expect(check(before, 3)).toBe("extensions");
    expect(check(before, 4)).toBe("true");
    expect(check(before, 5)).toBe("4");
    expect(check(before, 11)).toBe("0"); // no normalize collisions
    expect(check(before, 10)).toBe("1: old!user"); // '!' is outside the new-ID rule
    expect(check(before, 14)).toBe(""); // no LMS objects yet

    // --- migration: full file, twice (idempotent); member_id must not churn
    await db.exec(MIGRATION);
    const ids1 = await rows(
      db,
      "select id, member_id from public.members order by id",
    );
    await db.exec(MIGRATION);
    const ids2 = await rows(
      db,
      "select id, member_id from public.members order by id",
    );
    expect(ids2).toEqual(ids1);

    // D13: everyone → hq, least privilege (grade 1/2 → 2, grade 3 → 3)
    const mapped = await rows(
      db,
      `select m.id, m.role, b.code from public.members m
         join public.branches b on b.id = m.branch_id`,
    );
    expect(mapped.sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: "old!user", role: 3, code: "hq" },
      { id: "Student01", role: 3, code: "hq" },
      { id: "teach1", role: 2, code: "hq" },
      { id: "teach2", role: 2, code: "hq" },
    ]);
    const after = lastRows(await db.exec(PRECHECK));
    expect(check(after, 14)).toContain("lms_sessions");

    // --- verify-3a: every row passes, the summary says so
    const result = lastRows(await db.exec(VERIFY));
    const failed = result.filter((r) => r.pass !== true);
    expect(failed, JSON.stringify(failed, null, 1)).toEqual([]);
    expect(result[0].area).toBe("SUMMARY");
    expect(result.length).toBeGreaterThan(70);
    const areas = new Set(result.map((r) => r.area));
    for (const area of [
      "login",
      "session",
      "throttle",
      "logout",
      "compat",
      "grants",
      "trace",
    ]) {
      expect(areas.has(area), area).toBe(true);
    }
    expect(JSON.stringify(result)).not.toMatch(/\$2[aby]\$/); // no bcrypt hash printed

    // --- no trace: only the migrated state is left
    const trace = await rows(
      db,
      `select (select count(*) from public.branches)::int as branches,
              (select count(*) from public.members)::int as members,
              (select count(*) from public.classes)::int as classes,
              (select count(*) from public.lms_sessions)::int as sessions,
              (select count(*) from public.login_attempts)::int as attempts`,
    );
    expect(trace).toEqual([
      { branches: 1, members: 4, classes: 0, sessions: 0, attempts: 0 },
    ]);

    // --- old member login + new login for a migrated account, as anon
    const asAnon = lastRows(
      await db.exec(`begin; set local role anon;
        select set_config('request.headers', '{}', true);
        select public.verify_member_login('Student01', 'pw-student') as old_grade,
               public.lms_login('student01', 'pw-student') ->> 'status' as status,
               public.lms_login('student01', 'pw-student') ->> 'role' as role;
        rollback;`),
    );
    expect(asAnon).toEqual([{ old_grade: 3, status: "ok", role: "3" }]);

    // --- admin (authenticated + admins row): writes members directly through
    // RLS (index expression + compat trigger fire for a non-owner) and may
    // audit the sessions table; anon may not.
    const asAdmin = lastRows(
      await db.exec(`begin; set local role authenticated;
        select set_config('request.jwt.claims', '{"sub":"${ADMIN_UID}"}', true);
        insert into public.members (id, password_hash, grade) values ('direct1', 'x', 1);
        select m.role, (select count(*) from public.lms_sessions)::int as sessions
          from public.members m where m.id = 'direct1';
        rollback;`),
    );
    expect(asAdmin).toEqual([{ role: 2, sessions: 0 }]);
  } finally {
    await db.close();
  }
});
