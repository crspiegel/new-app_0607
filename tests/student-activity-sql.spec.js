import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { SUPABASE_SHIM, lastRows } from "./sql-shim.mjs";

// Student activity log, step 1 — record only (D90, PM brief 2026-11-13): the
// "Student activity" block of supabase/migration.sql and its two lines in
// lms_login / lms_session, in PGlite — never against the live project.
// Callers are simulated the way PostgREST runs them: a role, request.headers
// (x-lms-token) and request.jwt.claims. Only an LMS STUDENT (role 3) is
// logged: a login row per lms_login, the KST day's first lms_session as a
// visit row, a row per video / game window with the seconds the page sends.

const MIGRATION = readFileSync(path.resolve("supabase/migration.sql"), "utf8");
// A database from before D90 (live 7869dec — the LMS block is the same).
const OLDER = readFileSync(
  path.resolve("tests/fixtures/migration-7869dec.sql"),
  "utf8",
);
const VERIFY = readFileSync(
  path.resolve("supabase/lms/verify-student-activity.sql"),
  "utf8",
);
const ADMIN_UID = "00000000-0000-4000-8000-0000000000ad";

const lit = (v) => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
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

const login = (db, id, pw) =>
  call(db, {}, "lms_login", { p_login_id: id, p_password: pw });

async function fresh(sql = MIGRATION) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_SHIM);
  await db.exec(sql);
  return db;
}

// An admin, LMS branch (1) / teacher (2) / two students (3).
async function people(db) {
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN_UID}', 'admin@example.test');
    insert into public.admins (user_id) values ('${ADMIN_UID}');
    insert into public.members (id, password_hash, grade, role, display_name) values
      ('a-branch', extensions.crypt('pw-1', extensions.gen_salt('bf', 4)), 1, 1, '지사'),
      ('a-teacher', extensions.crypt('pw-2', extensions.gen_salt('bf', 4)), 2, 2, '김선생'),
      ('a-kid', extensions.crypt('pw-3', extensions.gen_salt('bf', 4)), 3, 3, 'Kid'),
      ('a-kid2', extensions.crypt('pw-4', extensions.gen_salt('bf', 4)), 3, 3, 'Kid2');`);
}

async function tokens(db) {
  return {
    branch: { token: (await login(db, "a-branch", "pw-1")).token },
    teacher: { token: (await login(db, "a-teacher", "pw-2")).token },
    kid: { token: (await login(db, "a-kid", "pw-3")).token },
    kid2: { token: (await login(db, "a-kid2", "pw-4")).token },
    admin: { role: "authenticated", uid: ADMIN_UID },
    anon: {},
  };
}

const rowsOf = async (db, id) =>
  (
    await db.query(
      `select a.kind, a.level, a.month, a.book, a.slot, a.label, a.video_kind,
              a.played_sec, a.duration_sec, a.max_pos_sec, a.completed, a.visible_sec
         from public.student_activity a
         join public.members m on m.member_id = a.member_id
        where m.id = '${id}' order by a.id`,
    )
  ).rows;
const countOf = async (db, id, kind) =>
  (
    await db.query(
      `select count(*)::int as n from public.student_activity a
         join public.members m on m.member_id = a.member_id
        where m.id = '${id}' ${kind ? `and a.kind = '${kind}'` : ""}`,
    )
  ).rows[0].n;
// Move one student's rows `days` back (a past day for the KST checks).
const backdate = (db, id, sql) =>
  db.exec(`update public.student_activity a set started_at = started_at - ${sql}
             from public.members m where m.member_id = a.member_id and m.id = '${id}'`);

const VIDEO = {
  p_kind: "video",
  p_level: "level-1",
  p_month: "March",
  p_book: 2,
  p_slot: "w3-Tue",
  p_label: "Story · Week 3 · Tue",
  p_video_kind: "vimeo",
};
const GAME = {
  p_kind: "game",
  p_level: "beginner",
  p_month: "April",
  p_book: 1,
  p_slot: "game",
  p_label: "Game",
  p_video_kind: null,
};

test("student activity sql: migration ×2, read-only verify all pass; a drift turns its row false", async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  const db = await fresh();
  try {
    await db.exec(MIGRATION); // re-run safe
    const result = lastRows(await db.exec(VERIFY));
    const failed = result.filter((r) => r.pass === false);
    expect(failed, JSON.stringify(failed, null, 1)).toEqual([]);
    expect(result[0]).toMatchObject({ area: "SUMMARY", pass: true });
    expect(result.length).toBeGreaterThanOrEqual(14);

    // drifts: a browser grant on the table, a policy, the internal helper
    // opened to anon, lms_session without its visit line
    await db.exec(`grant select on public.student_activity to anon;
      create policy x on public.student_activity for select using (true);
      grant execute on function public.student_activity_note(uuid, text) to anon;
      create or replace function public.lms_session() returns jsonb
        language sql security definer set search_path = public, extensions
        as $$ select null::jsonb $$;`);
    const drifted = lastRows(await db.exec(VERIFY));
    const bad = drifted.filter((r) => r.pass === false).map((r) => r.no);
    expect(drifted[0].pass).toBe(false);
    expect(bad).toEqual(expect.arrayContaining([1, 2, 9, 12]));
  } finally {
    await db.close();
  }
});

test("student activity sql: login row per student login, the KST day's first visit, nobody else; answers unchanged", async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  // upgrade path: an older live database with members → migration.sql
  const db = await fresh(OLDER);
  try {
    await people(db);
    const oldLogin = await login(db, "a-kid", "pw-3");
    const oldSession = await call(db, { token: oldLogin.token }, "lms_session");
    await db.exec(MIGRATION);

    const who = await tokens(db);
    // same answers as before D90 (only the new token differs)
    const kidLogin = await login(db, "a-kid", "pw-3");
    expect(Object.keys(kidLogin).sort()).toEqual(Object.keys(oldLogin).sort());
    expect({ ...kidLogin, token: "x" }).toEqual({ ...oldLogin, token: "x" });
    expect(kidLogin.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const kidSession = await call(db, who.kid, "lms_session");
    expect(kidSession).toEqual(oldSession);
    expect(Object.keys(kidSession).sort()).toEqual([
      "branch_id",
      "branch_name",
      "display_name",
      "role",
    ]);

    // students: a row per login (tokens() + kidLogin = 2 logins for a-kid)
    expect(await countOf(db, "a-kid", "login")).toBe(2);
    expect(await countOf(db, "a-kid2", "login")).toBe(1);
    // staff: never
    for (const id of ["a-branch", "a-teacher"]) {
      await call(
        db,
        who[id === "a-branch" ? "branch" : "teacher"],
        "lms_session",
      );
      expect(await countOf(db, id)).toBe(0);
    }
    // a login today → reloads add no visit
    await call(db, who.kid, "lms_session");
    await call(db, who.kid, "lms_session");
    expect(await countOf(db, "a-kid", "visit")).toBe(0);

    // a past day's rows only → today's first reload = one visit, then none
    await backdate(db, "a-kid", "interval '1 day'");
    await call(db, who.kid, "lms_session");
    await call(db, who.kid, "lms_session");
    expect(await countOf(db, "a-kid", "visit")).toBe(1);
    // next day → one more
    await backdate(db, "a-kid", "interval '1 day'");
    await call(db, who.kid, "lms_session");
    expect(await countOf(db, "a-kid", "visit")).toBe(2);
    expect(await countOf(db, "a-kid")).toBe(4); // 2 logins + 2 visits

    // the KST day: a row at 23:30 KST yesterday is not today
    await db.exec(`delete from public.student_activity a using public.members m
                    where m.member_id = a.member_id and m.id = 'a-kid2';
                   insert into public.student_activity (member_id, kind, started_at)
                   select m.member_id, 'login',
                          (date_trunc('day', now() at time zone 'Asia/Seoul') - interval '30 minutes')
                            at time zone 'Asia/Seoul'
                     from public.members m where m.id = 'a-kid2'`);
    await call(db, who.kid2, "lms_session");
    expect(await countOf(db, "a-kid2", "visit")).toBe(1);

    // no token / a dead token / a wrong password → nothing, answers as before
    expect(await call(db, who.anon, "lms_session")).toBeNull();
    expect(await call(db, { token: "x".repeat(43) }, "lms_session")).toBeNull();
    expect((await login(db, "a-kid", "wrong")).status).toBe("invalid");
    expect(await countOf(db, "a-kid")).toBe(4);
    // an inactive student: no session, no row
    await db.exec(
      "update public.members set active = false where id = 'a-kid2'",
    );
    expect(await call(db, who.kid2, "lms_session")).toBeNull();
    expect(await countOf(db, "a-kid2")).toBe(2);

    // a failure inside the log never changes the answer (D90-9)
    // (a rule that refuses login / visit rows; the day moved so a visit is due)
    await backdate(db, "a-kid", "interval '1 day'");
    await db.exec(`alter table public.student_activity
                     add constraint zz_refuse check (kind not in ('login', 'visit')) not valid`);
    const still = await login(db, "a-kid", "pw-3");
    expect(still.status).toBe("ok");
    expect(await call(db, { token: still.token }, "lms_session")).toEqual(
      oldSession,
    );
    await db.exec(
      "alter table public.student_activity drop constraint zz_refuse",
    );
    expect(await countOf(db, "a-kid")).toBe(4);
  } finally {
    await db.close();
  }
});

test("student activity sql: video / game windows — who, what, caps, only grows, own rows only, 90%", async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  const db = await fresh();
  try {
    await people(db);
    const who = await tokens(db);
    await db.exec("delete from public.student_activity");

    // not a student → NULL, nothing written
    for (const caller of ["branch", "teacher", "admin", "anon"]) {
      expect(
        await call(db, who[caller], "student_activity_start", VIDEO),
      ).toBeNull();
    }
    expect(
      (await db.query("select count(*)::int as n from public.student_activity"))
        .rows[0].n,
    ).toBe(0);

    // bad values → NULL
    const bad = [
      { p_kind: "login" },
      { p_kind: "visit" },
      { p_level: "level-9" },
      { p_level: "Level 1" },
      { p_month: "Mars" },
      { p_book: 3 },
      { p_slot: "w1-Mon; drop" },
      { p_slot: "x".repeat(21) },
      { p_video_kind: null },
      { p_video_kind: "dailymotion" },
    ];
    for (const change of bad) {
      expect(
        await call(db, who.kid, "student_activity_start", {
          ...VIDEO,
          ...change,
        }),
        JSON.stringify(change),
      ).toBeNull();
    }
    expect(
      await call(db, who.kid, "student_activity_start", {
        ...GAME,
        p_video_kind: "vimeo",
      }),
    ).toBeNull();
    expect(await countOf(db, "a-kid")).toBe(0);

    // a student's video row
    const id = await call(db, who.kid, "student_activity_start", {
      ...VIDEO,
      p_label: `  ${"L".repeat(130)}  `,
    });
    expect(Number(id)).toBeGreaterThan(0);
    const [row] = await rowsOf(db, "a-kid");
    expect(row).toEqual({
      kind: "video",
      level: "level-1",
      month: "March",
      book: 2,
      slot: "w3-Tue",
      label: "L".repeat(120),
      video_kind: "vimeo",
      played_sec: 0,
      duration_sec: null,
      max_pos_sec: null,
      completed: null,
      visible_sec: null,
    });
    // started 120 s ago (the played cap = seconds since start + 10)
    await backdate(db, "a-kid", "interval '120 seconds'");
    const save = (caller, args) =>
      call(db, caller, "student_activity_save", { p_id: Number(id), ...args });
    await save(who.kid, {
      p_played_sec: 80.9,
      p_duration_sec: 100.4,
      p_max_pos_sec: 81.7,
    });
    expect((await rowsOf(db, "a-kid"))[0]).toMatchObject({
      played_sec: 80,
      duration_sec: 100,
      max_pos_sec: 81,
      completed: false,
    });
    // smaller / negative / missing values change nothing
    await save(who.kid, {
      p_played_sec: 10,
      p_duration_sec: 50,
      p_max_pos_sec: -5,
    });
    await save(who.kid, {});
    expect((await rowsOf(db, "a-kid"))[0]).toMatchObject({
      played_sec: 80,
      duration_sec: 100,
      max_pos_sec: 81,
    });
    // 90 % of the length = done
    await save(who.kid, { p_played_sec: 89 });
    expect((await rowsOf(db, "a-kid"))[0].completed).toBe(false);
    await save(who.kid, { p_played_sec: 90 });
    expect((await rowsOf(db, "a-kid"))[0].completed).toBe(true);
    // played is capped at the seconds since the start + 10; length and
    // position at 6 hours; a game value on a video row is not used
    await save(who.kid, {
      p_played_sec: 5000,
      p_duration_sec: 99999,
      p_max_pos_sec: 99999,
      p_visible_sec: 30,
    });
    const capped = (await rowsOf(db, "a-kid"))[0];
    expect(capped.played_sec).toBeGreaterThanOrEqual(130);
    expect(capped.played_sec).toBeLessThanOrEqual(132);
    expect(capped).toMatchObject({
      duration_sec: 21600,
      max_pos_sec: 21600,
      visible_sec: null,
      completed: false, // 130 s of a 6-hour length
    });

    // another student, staff, no token: the row does not move
    const before = await rowsOf(db, "a-kid");
    for (const caller of ["kid2", "teacher", "branch", "admin", "anon"]) {
      await save(who[caller], { p_played_sec: 999, p_duration_sec: 9999 });
    }
    expect(await rowsOf(db, "a-kid")).toEqual(before);

    // a game row: seconds on screen only, ≤ seconds since start + 10, ≤ 2 h
    const gid = Number(await call(db, who.kid, "student_activity_start", GAME));
    expect(gid).toBeGreaterThan(Number(id));
    await backdate(db, "a-kid", "interval '3 hours'");
    const saveGame = (args) =>
      call(db, who.kid, "student_activity_save", { p_id: gid, ...args });
    await saveGame({ p_visible_sec: 42.8, p_played_sec: 500 });
    let game = (await rowsOf(db, "a-kid"))[1];
    expect(game).toMatchObject({
      kind: "game",
      video_kind: null,
      visible_sec: 42,
      played_sec: null,
      completed: null,
    });
    await saveGame({ p_visible_sec: 9000 });
    game = (await rowsOf(db, "a-kid"))[1];
    expect(game.visible_sec).toBe(7200);
    // a framed video page (no player to ask): seconds on screen like a game
    const pid = Number(
      await call(db, who.kid, "student_activity_start", {
        ...VIDEO,
        p_video_kind: "page",
        p_book: null,
        p_slot: "opening",
      }),
    );
    await db.exec(
      `update public.student_activity set started_at = now() - interval '60 seconds' where id = ${pid}`,
    );
    await call(db, who.kid, "student_activity_save", {
      p_id: pid,
      p_visible_sec: 5000,
      p_played_sec: 50,
      p_duration_sec: 50,
    });
    const framed = (await rowsOf(db, "a-kid"))[2];
    expect(framed).toMatchObject({
      video_kind: "page",
      book: null,
      played_sec: null,
      duration_sec: null,
      completed: null,
    });
    expect(framed.visible_sec).toBeGreaterThanOrEqual(70); // 60 s + 10
    expect(framed.visible_sec).toBeLessThanOrEqual(71);

    // a login / visit row cannot be changed through save
    const lid = (
      await db.query(
        "select a.id::int as id from public.student_activity a join public.members m on m.member_id = a.member_id where m.id = 'a-kid2' and a.kind = 'login'",
      )
    ).rows;
    await login(db, "a-kid2", "pw-4");
    const loginRow = (
      await db.query(
        "select a.id::int as id from public.student_activity a join public.members m on m.member_id = a.member_id where m.id = 'a-kid2' and a.kind = 'login'",
      )
    ).rows;
    expect(lid).toEqual([]);
    expect(loginRow).toHaveLength(1);
    await call(db, who.kid2, "student_activity_save", {
      p_id: loginRow[0].id,
      p_visible_sec: 30,
      p_played_sec: 30,
    });
    expect((await rowsOf(db, "a-kid2"))[0]).toMatchObject({
      kind: "login",
      played_sec: null,
      visible_sec: null,
    });

    // browsers never touch the table or the internal helpers directly
    for (const role of ["anon", "authenticated"]) {
      for (const sql of [
        "select count(*) from public.student_activity",
        "insert into public.student_activity (member_id, kind) select member_id, 'login' from public.members limit 1",
        "select public.student_activity_note(null, 'login')",
        "select public.student_activity_room(null)",
      ]) {
        await expect(as(db, { role }, sql), `${role}: ${sql}`).rejects.toThrow(
          /permission denied/,
        );
      }
    }
  } finally {
    await db.close();
  }
});

test("student activity sql: 200 rows a KST day per student, then quiet; deleting the member deletes the log", async ({}, info) => {
  test.skip(info.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  const db = await fresh();
  try {
    await people(db);
    const who = await tokens(db); // a-kid: 1 login row today
    await db.exec(`insert into public.student_activity (member_id, kind, level, month, video_kind)
      select m.member_id, 'video', 'beginner', 'March', 'vimeo'
        from public.members m, generate_series(1, 198) where m.id = 'a-kid'`);
    expect(await countOf(db, "a-kid")).toBe(199);
    expect(
      await call(db, who.kid, "student_activity_start", VIDEO),
    ).not.toBeNull();
    expect(await call(db, who.kid, "student_activity_start", VIDEO)).toBeNull();
    const at = await login(db, "a-kid", "pw-3"); // still signs in, no row
    expect(at.status).toBe("ok");
    expect(await countOf(db, "a-kid")).toBe(200);
    // yesterday's rows do not count
    await backdate(db, "a-kid", "interval '1 day'");
    expect(
      await call(db, who.kid, "student_activity_start", GAME),
    ).not.toBeNull();
    // the other student is not limited by this one
    expect(
      await call(db, who.kid2, "student_activity_start", GAME),
    ).not.toBeNull();

    // the top admin deletes the student → its log goes too (on delete cascade)
    const kidId = (
      await db.query("select member_id from public.members where id = 'a-kid'")
    ).rows[0].member_id;
    expect(
      await call(db, who.admin, "lms_member_delete", { p_member_id: kidId }),
    ).toEqual({ status: "ok" });
    expect(
      (
        await db.query(
          `select count(*)::int as n from public.student_activity where member_id = '${kidId}'`,
        )
      ).rows[0].n,
    ).toBe(0);
    expect(await countOf(db, "a-kid2")).toBe(2); // login + game
  } finally {
    await db.close();
  }
});
