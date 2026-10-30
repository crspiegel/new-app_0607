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

// Found on the live project (2026-10-30), in no file or commit of this repo:
// a members.profile jsonb column and a 5-argument create_member overload
// (extra p_profile with a default), added by hand before 3A. A 4-argument
// call then has two candidates → 42725 "is not unique" (verify-3a row 114;
// PGRST203 for the admin tab's named-argument rpc). Copied as reported,
// grants included (PUBLIC + authenticated + service_role, no anon).
const LIVE_ONLY = `
  alter table public.members add column profile jsonb default '{}'::jsonb;
  CREATE OR REPLACE FUNCTION public.create_member(p_id text, p_password text, p_grade smallint,
    p_display_name text DEFAULT NULL::text, p_profile jsonb DEFAULT '{}'::jsonb)
   RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
  AS $function$
    begin
      if not public.is_admin() then raise exception 'not authorized'; end if;
      if p_grade not in (1,2,3) then raise exception 'grade must be 1, 2 or 3'; end if;
      if p_id !~ '^[!-~]{4,}$' or p_password !~ '^[!-~]{4,}$' then
        raise exception 'id/password must be >= 4 printable-ASCII chars (no spaces, no Korean)';
      end if;
      insert into public.members (id, password_hash, grade, display_name, profile)
      values (p_id, crypt(p_password, gen_salt('bf')), p_grade, p_display_name,
              coalesce(p_profile, '{}'::jsonb))
      on conflict (id) do update
        set password_hash = excluded.password_hash, grade = excluded.grade,
            display_name = excluded.display_name, profile = excluded.profile,
            active = true;
    end; $function$;
  revoke all on function public.create_member(text, text, smallint, text, jsonb) from anon;
`;
const LIVE_ONLY_FN = "create_member(text,text,smallint,text,jsonb)";

test("lms sql: live-only create_member overload → 42725 → fix SQL → verify-3a passes", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(180000); // PGlite: migration.sql + verify-3a twice
  const db = new PGlite({ extensions: { pgcrypto } });
  const verify = async () => lastRows(await db.exec(VERIFY));
  // the admin tab's call: four named arguments (app.js "회원 저장")
  const adminTabSave = `begin; set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${ADMIN_UID}"}', true);
    select public.create_member(p_id => 'zz-v-tab', p_password => 'tabpw1',
      p_grade => 3::smallint, p_display_name => null);
    select count(*)::int as n from public.members where id = 'zz-v-tab';`;
  const catalog = `
    select p.oid::regprocedure::text as fn, p.proacl::text as acl, md5(p.prosrc) as src
      from pg_proc p where p.pronamespace = 'public'::regnamespace
    union all
    select 'column ' || attname, format_type(atttypid, atttypmod), null
      from pg_attribute where attrelid = 'public.members'::regclass and attnum > 0
       and not attisdropped
    order by 1`;
  try {
    await db.exec(SUPABASE_SHIM);
    await db.exec(MIGRATION.slice(0, LMS_START));
    await db.exec(OLD_MEMBERS);
    await db.exec(LIVE_ONLY);
    await db.exec(MIGRATION); // what the user ran on 2026-10-29 ("Success")

    // the live grants, entry for entry
    const acl = await rows(
      db,
      `select p.oid::regprocedure::text as fn,
              array(select unnest(p.proacl)::text order by 1) as acl
         from pg_proc p where p.proname = 'create_member' order by 1`,
    );
    const LIVE_ACL = [
      "=X/postgres",
      "authenticated=X/postgres",
      "postgres=X/postgres",
      "service_role=X/postgres",
    ];
    expect(acl).toEqual([
      { fn: "create_member(text,text,smallint,text)", acl: LIVE_ACL },
      { fn: LIVE_ONLY_FN, acl: LIVE_ACL },
    ]);

    // --- RED: the live result, row for row
    const red = await verify();
    expect(red).toHaveLength(116);
    expect(red[0]).toMatchObject({
      no: 0,
      area: "SUMMARY",
      actual: "114 / 115",
      pass: false,
    });
    const broken = red.filter((r) => r.no > 0 && r.pass !== true);
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ no: 114, area: "ERROR", pass: false });
    expect(broken[0].actual).toBe(
      "42725 function public.create_member(unknown, unknown, smallint, unknown) is not unique",
    );
    expect(red[115]).toMatchObject({
      no: 115,
      area: "trace",
      actual: "branches=0 members=0 classes=0 attempts=0",
      pass: true,
    });
    await expect(db.exec(`${adminTabSave} rollback;`)).rejects.toThrow(
      /is not unique/,
    );
    await db.exec("rollback");

    // --- the fix: one DROP, nothing else written
    const FIX = read("supabase/lms/fix-create-member-overload.sql");
    const code = FIX.replace(/--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''");
    expect(code.match(/\bdrop\b/gi)).toHaveLength(1);
    expect(code).toMatch(
      /drop function if exists public\.create_member\(text, text, smallint, text, jsonb\);/i,
    );
    expect(code).not.toMatch(
      /\b(cascade|insert|update|delete|merge|create|alter|grant|revoke|truncate|set_config|copy|call|do)\b/i,
    );

    // its result table, read before the DROP: both overloads → both false
    const report = FIX.slice(FIX.indexOf("with left_over"));
    expect(lastRows(await db.exec(report))).toEqual([
      {
        no: 1,
        create_member: "create_member(text, text, smallint, text)",
        pass: false,
      },
      {
        no: 2,
        create_member: "create_member(text, text, smallint, text, jsonb)",
        pass: false,
      },
    ]);

    const before = await rows(db, catalog);
    const RESULT = [
      {
        no: 1,
        create_member: "create_member(text, text, smallint, text)",
        pass: true,
      },
    ];
    expect(lastRows(await db.exec(FIX))).toEqual(RESULT);
    expect(lastRows(await db.exec(FIX))).toEqual(RESULT); // re-run safe
    // only that overload is gone: the repo function (grants, body),
    // members.profile and every other function are as they were
    expect(await rows(db, catalog)).toEqual(
      before.filter((r) => r.fn !== LIVE_ONLY_FN),
    );
    expect(before.some((r) => r.fn === LIVE_ONLY_FN)).toBe(true);
    expect(before).toContainEqual({
      fn: "column profile",
      acl: "jsonb",
      src: null,
    });

    // --- GREEN
    const green = await verify();
    const failed = green.filter((r) => r.pass !== true);
    expect(failed, JSON.stringify(failed, null, 1)).toEqual([]);
    expect(green).toHaveLength(116);
    expect(green[0]).toMatchObject({ area: "SUMMARY", actual: "115 / 115" });
    expect(green[115]).toMatchObject({
      area: "trace",
      actual: "branches=0 members=0 classes=0 attempts=0",
    });
    expect(lastRows(await db.exec(`${adminTabSave} rollback;`))).toEqual([
      { n: 1 },
    ]);
  } finally {
    await db.close();
  }
});
