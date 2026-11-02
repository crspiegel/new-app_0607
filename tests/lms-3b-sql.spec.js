import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { SUPABASE_SHIM, lastRows } from "./sql-shim.mjs";

// LMS Phase 3B SQL (3.3 role-based management + 3.4 bulk), checked locally in
// PGlite, never against the live project. Two install paths, both run twice:
//   ① upgrade — the live state (frozen 3A copy, commit 8176966) → the current
//     supabase/migration.sql (what the user will run on the live project);
//   ② fresh   — an empty database → the current migration.sql only.
// supabase/lms/verify-3b.sql then checks every allow / deny of decision D45
// (and D41–D47) and leaves no trace.

const read = (file) => readFileSync(path.resolve(file), "utf8");
const MIGRATION_3A = read("tests/fixtures/migration-3a.sql");
const LMS_START_3A = MIGRATION_3A.indexOf(
  "-- ============================================================================\n-- LMS (Phase 3A",
);

const ADMIN_UID = "00000000-0000-4000-8000-0000000000ad";

// The live members before 3A (one per old grade) + the admin.
const OLD_MEMBERS = `
  insert into auth.users (id, email) values ('${ADMIN_UID}', 'admin@example.test');
  insert into public.admins (user_id) values ('${ADMIN_UID}');
  insert into public.members (id, password_hash, grade) values
    ('Student01', extensions.crypt('pw-student', extensions.gen_salt('bf')), 3),
    ('teach1', extensions.crypt('pw-teach1', extensions.gen_salt('bf')), 1),
    ('teach2', extensions.crypt('pw-teach2', extensions.gen_salt('bf')), 2),
    ('old!user', extensions.crypt('pw-old', extensions.gen_salt('bf')), 3);
`;

// Found on the live project (2026-10-30, D28): a hand-made members.profile
// jsonb column. Kept until 3.5; the precheck counts its rows, never prints them.
const LIVE_PROFILE = `
  alter table public.members add column profile jsonb default '{}'::jsonb;
  update public.members set profile = '{"note":"secret-x"}' where id = 'teach1';
`;

// The live database today: 3A + teacher resources (8176966), members, profile.
async function liveState(db) {
  await db.exec(SUPABASE_SHIM);
  await db.exec(MIGRATION_3A.slice(0, LMS_START_3A));
  await db.exec(OLD_MEMBERS);
  await db.exec(MIGRATION_3A);
  await db.exec(LIVE_PROFILE);
}

// Code without comments and string contents (to look at keywords only).
const bare = (sql) =>
  sql
    .replace(/--.*$/gm, "")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\$\$[\s\S]*?\$\$/g, "$$$$");

test("lms 3b sql: precheck-3b — one read-only statement, the live (3A) values", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  expect(LMS_START_3A).toBeGreaterThan(0);
  const PRECHECK = read("supabase/lms/00-precheck-3b.sql");

  // one statement, nothing that writes
  const code = bare(PRECHECK);
  expect(code.split(";").filter((s) => s.trim())).toHaveLength(1);
  expect(code).not.toMatch(
    /\b(insert|update|delete|merge|create|alter|drop|grant|revoke|truncate|set_config|copy|call|do|begin|commit)\b/i,
  );

  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await liveState(db);
    const run = async () => lastRows(await db.exec(PRECHECK));
    const rowsNow = await run();
    const v = (list, no) => list.find((r) => r.no === no)?.value;

    expect(rowsNow.map((r) => r.no)).toEqual(
      Array.from({ length: 21 }, (_, i) => i + 1),
    );
    expect(v(rowsNow, 1)).toBe("hq: role1=0 role2=2 role3=2");
    expect(v(rowsNow, 2)).toBe("4 / 0");
    expect(v(rowsNow, 3)).toBe("no");
    expect(v(rowsNow, 4)).toBe("members_pkey PRIMARY KEY (id)");
    expect(v(rowsNow, 5)).toContain("id text NOT NULL");
    expect(v(rowsNow, 5)).toContain("grade smallint NOT NULL");
    expect(v(rowsNow, 6)).toBe(
      "class_members(member_id) → members(member_id), " +
        "classes(teacher_id) → members(member_id), " +
        "lms_sessions(member_id) → members(member_id), " +
        "teacher_resource_downloads(member_id) → members(member_id)",
    );
    expect(v(rowsNow, 7)).toBe("0");
    expect(v(rowsNow, 8)).toBe("(none)");
    expect(v(rowsNow, 9)).toBe("members_lms_compat");
    expect(v(rowsNow, 10)).toBe("members_admin_all");
    expect(v(rowsNow, 11)).toBe("(none)");
    expect(v(rowsNow, 12)).toContain("lms_login(text,text,uuid)");
    expect(v(rowsNow, 12)).toContain("create_member(text,text,smallint,text)");
    expect(v(rowsNow, 13)).toBe("create_member(text,text,smallint,text)");
    expect(v(rowsNow, 14)).toBe(
      "create_member(text,text,smallint,text), set_member_active(text,boolean), update_member(text,smallint,text)",
    );
    expect(v(rowsNow, 15)).toContain("members_login_per_branch_key");
    expect(v(rowsNow, 16)).toBe("yes");
    expect(v(rowsNow, 17)).toBe("1");
    expect(v(rowsNow, 18)).toBe("true");
    expect(v(rowsNow, 19)).toBe("(none)");
    expect(v(rowsNow, 20)).toBe("0");
    expect(v(rowsNow, 21)).toBe("yes"); // the index the new key is made from
    // never a hash, a password or a profile value
    expect(JSON.stringify(rowsNow)).not.toMatch(/\$2[aby]\$|secret-x|pw-/);

    // stop signs: the test account is still there / an FK points at members(id)
    // / a hand-made old-RPC overload / a function upserting on members.id
    await db.exec(`begin;
      insert into public.members (id, password_hash, grade, role, branch_id)
        select 'tps-teacher-test', 'x', 2, 2, b.id from public.branches b where b.code = 'hq';
      create table public.zz_fk (x text references public.members (id));
      create function public.update_member(p_id text) returns void language sql as 'select 1';
      create function public.zz_upsert() returns void language sql as
        'insert into public.members (id, password_hash, grade) values (''a'', ''b'', 3) on conflict (id) do nothing';`);
    const stop = await run();
    await db.exec("rollback");
    expect(v(stop, 3)).toMatch(/^멈춤/);
    expect(v(stop, 7)).toMatch(/^멈춤 — 1: zz_fk\(x\) → members\(id\)/);
    expect(v(stop, 13)).toMatch(/^멈춤 — .*zz_upsert\(\)/);
    expect(v(stop, 14)).toMatch(/^멈춤 — .*update_member\(text\)/);
    // the index the new key is made from must be a plain unique index on member_id
    await db.exec(`begin;
      drop index public.members_member_id_key cascade;
      create unique index members_member_id_key on public.members (member_id) where active;`);
    const badIndex = await run();
    await db.exec("rollback");
    expect(v(badIndex, 21)).toMatch(/^멈춤/);
    expect(await run()).toEqual(rowsNow); // read-only: same answer again
  } finally {
    await db.close();
  }
});

// Everything migration.sql defines, as text — must not change on a re-run.
const CATALOG = `
  select 'fn ' || p.oid::regprocedure::text || ' ' || md5(p.prosrc) || ' '
         || coalesce(array_to_string(p.proacl, ','), '-') || ' '
         || coalesce(array_to_string(p.proconfig, ','), '-') || ' ' || p.prosecdef as x
    from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all
  select 'con ' || conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid)
    from pg_constraint where connamespace = 'public'::regnamespace
  union all
  select 'idx ' || pg_get_indexdef(x.indexrelid)
    from pg_index x join pg_class c on c.oid = x.indrelid
   where c.relnamespace = 'public'::regnamespace
  union all
  select 'trg ' || t.tgrelid::regclass || ' ' || t.tgname
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
  union all
  select 'pol ' || schemaname || '.' || tablename || ' ' || policyname || ' '
         || coalesce(qual, '') || ' ' || coalesce(with_check, '')
    from pg_policies where schemaname in ('public', 'storage')
  union all
  select 'col ' || a.attrelid::regclass || ' ' || a.attname || ' '
         || format_type(a.atttypid, a.atttypmod) || ' ' || a.attnotnull
    from pg_attribute a join pg_class c on c.oid = a.attrelid
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and a.attnum > 0 and not a.attisdropped
  union all
  select 'acl ' || c.relname || ' ' || coalesce(array_to_string(c.relacl, ','), '-')
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  order by 1`;

async function rows(db, sql) {
  return (await db.query(sql)).rows;
}

// migration.sql twice in a row: the second run changes nothing.
async function migrateTwice(db) {
  const MIGRATION = read("supabase/migration.sql");
  await db.exec(MIGRATION);
  const first = await rows(db, CATALOG);
  await db.exec(MIGRATION);
  expect(await rows(db, CATALOG)).toEqual(first);
}

const AREAS = [
  "setup",
  "schema",
  "login",
  "list",
  "check-ids",
  "branch",
  "create",
  "update",
  "class",
  "assign",
  "unlock",
  "bulk",
  "grants",
  "homonym",
  "delete",
  "trace",
];

async function verify3b(db) {
  const result = lastRows(await db.exec(read("supabase/lms/verify-3b.sql")));
  const failed = result.filter((r) => r.pass !== true);
  expect(failed, JSON.stringify(failed, null, 1)).toEqual([]);
  expect(result[0]).toMatchObject({ no: 0, area: "SUMMARY", pass: true });
  expect(result.length).toBeGreaterThan(150);
  const areas = new Set(result.map((r) => r.area));
  for (const area of AREAS) expect(areas.has(area), area).toBe(true);
  // D53 (a teacher moves a student between its own classes) stays covered
  expect(
    result.filter((r) => String(r.check_case).includes("D53")).length,
  ).toBeGreaterThanOrEqual(8);
  // lms_class_update reads the caller first (security review of D53, M1)
  expect(
    result.filter((r) =>
      String(r.check_case).includes("update: the caller is read"),
    ),
  ).toHaveLength(1);
  expect(result[result.length - 1]).toMatchObject({
    area: "trace",
    actual: "branches=0 members=0 classes=0 attempts=0",
  });
  // no hash, no password, no token
  const text = JSON.stringify(result);
  expect(text).not.toMatch(/\$2[aby]\$/);
  expect(text).not.toMatch(/zz9pw|"new1"|kim1|bk11/);
  expect(text).not.toMatch(/[A-Za-z0-9_-]{43}/);
  return result;
}

test("lms 3b sql: upgrade — live 3A state → migration ×2 → verify-3b, no trace", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(240000);
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await liveState(db);
    // a database that ran the first 3B draft (ccb7dce) has lms_member_list
    // without in_class — the migration must replace it, not fail
    await db.exec(`create function public.lms_member_list(p_branch_id uuid default null)
      returns table (member_id uuid, login_id text) language sql
      as 'select null::uuid, null::text';`);
    const ids = `select id, member_id from public.members order by id`;
    const before = await rows(db, ids);
    await migrateTwice(db);
    expect(
      (
        await rows(
          db,
          `select pg_get_function_result('public.lms_member_list(uuid)'::regprocedure) ~ 'in_class' as ok`,
        )
      )[0].ok,
    ).toBe(true);
    expect(await rows(db, ids)).toEqual(before); // member_id never churns

    // precheck after: the new key, the old RPCs gone, profile left alone
    const after = lastRows(
      await db.exec(read("supabase/lms/00-precheck-3b.sql")),
    );
    const v = (no) => after.find((r) => r.no === no)?.value;
    expect(v(4)).toBe("members_member_id_key PRIMARY KEY (member_id)");
    expect(v(7)).toBe("0");
    expect(v(9)).toBe("members_lms_compat, members_lms_end_sessions");
    expect(v(13)).toBe("(none)");
    expect(v(14)).toBe("(none)");
    expect(v(16)).toBe("yes");
    expect(v(17)).toBe("1");
    expect(v(18)).toBe("false");
    expect(v(19)?.split(", ")).toHaveLength(17);
    expect(v(21)).toBe("yes");

    await verify3b(db);

    // nothing left behind; the migrated members still log in (as anon)
    expect(
      await rows(
        db,
        `select (select count(*) from public.branches)::int as branches,
                (select count(*) from public.members)::int as members,
                (select count(*) from public.classes)::int as classes,
                (select count(*) from public.lms_sessions)::int as sessions,
                (select count(*) from public.login_attempts)::int as attempts`,
      ),
    ).toEqual([
      { branches: 1, members: 4, classes: 0, sessions: 0, attempts: 0 },
    ]);
    const asAnon = lastRows(
      await db.exec(`begin; set local role anon;
        select set_config('request.headers', '{}', true);
        select public.lms_login('student01', 'pw-student') ->> 'status' as status,
               public.lms_login('TEACH1', 'pw-teach1') ->> 'role' as role;
        rollback;`),
    );
    expect(asAnon).toEqual([{ status: "ok", role: "2" }]);
  } finally {
    await db.close();
  }
});

test("lms 3b sql: fresh install — empty DB → migration ×2 → verify-3b", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(240000);
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(SUPABASE_SHIM);
    await migrateTwice(db);
    const pk = await rows(
      db,
      `select pg_get_constraintdef(c.oid) as def from pg_constraint c
        where c.conrelid = 'public.members'::regclass and c.contype = 'p'`,
    );
    expect(pk).toEqual([{ def: "PRIMARY KEY (member_id)" }]);
    await db.exec(`
      insert into auth.users (id, email) values ('${ADMIN_UID}', 'admin@example.test');
      insert into public.admins (user_id) values ('${ADMIN_UID}');`);
    await verify3b(db);
  } finally {
    await db.close();
  }
});
