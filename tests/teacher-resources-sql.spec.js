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

// D65 (2026-11-02): the slots of each level in card order — 월간교육안 3~12월
// (monthly-03 … monthly-12), plan (연간교육안), award (상장), test (테스트,
// level-2/3 only), script (핵심문장 스크립트), pictures (그림 자료실),
// flashcards (플래쉬카드). D63's single 'monthly' is gone. 15 / 15 / 16 / 16.
const MONTHLY = Array.from(
  { length: 10 },
  (_, i) => `monthly-${String(i + 3).padStart(2, "0")}`,
);
const SLOTS_D65 = {
  beginner: [...MONTHLY, "plan", "award", "script", "pictures", "flashcards"],
  "level-1": [...MONTHLY, "plan", "award", "script", "pictures", "flashcards"],
  "level-2": [
    ...MONTHLY,
    "plan",
    "award",
    "test",
    "script",
    "pictures",
    "flashcards",
  ],
  "level-3": [
    ...MONTHLY,
    "plan",
    "award",
    "test",
    "script",
    "pictures",
    "flashcards",
  ],
};
// A level's list as { slot, file_name, size }, `filled` = { slot: [name, size] }.
const rowsOf = (level, filled = {}) =>
  SLOTS_D65[level].map((slot) => ({
    slot,
    file_name: filled[slot]?.[0] ?? null,
    size: filled[slot]?.[1] ?? null,
  }));

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
    // D65: 월간교육안 3~12월 first, then plan (연간교육안 — the old
    // 월간.연간교육안 slot key), award, test (level-2/3), script, pictures,
    // flashcards
    const beginner = rowsOf("beginner", { plan: ["연간교육안.pdf", 1234] });
    expect(await list({ token: teacher }, "beginner")).toEqual(beginner);
    expect(await list({ token: branch }, "beginner")).toEqual(beginner);
    expect(await list(admin, "beginner")).toEqual(beginner);
    expect(await list({ token: teacher }, "level-2")).toEqual(
      rowsOf("level-2", { test: ["테스트 문제.xlsx", 2048] }),
    );
    expect(
      (await list({ token: teacher }, "level-1")).map((r) => r.slot),
    ).toEqual(SLOTS_D65["level-1"]);
    expect(await list({ token: teacher }, "Level 1")).toEqual([]);

    // --- (나): no browser-side path to a file any more — the old
    // teacher_resource_file RPC is gone, and LMS sessions read no Storage
    // object at all (signing happens in the Edge Function, service role).
    await expect(
      as(
        db,
        { token: teacher },
        "select public.teacher_resource_file('beginner', 'plan')",
      ),
    ).rejects.toThrow(/does not exist/);
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
    expect(await visible({ token: teacher })).toBe(0);
    expect(await visible({ token: branch })).toBe(0);
    expect(await visible({ token: student })).toBe(0);
    expect(await visible({})).toBe(0);
    expect(await visible({ uid: ADMIN_UID }, "authenticated")).toBe(4);
    expect(await visible({ uid: OTHER_UID }, "authenticated")).toBe(0);

    // --- teacher_resource_issue: the Edge Function's one DB call (service
    // role). It forwards the caller's x-lms-token header; an admin arrives as
    // p_admin_uid after the function checked the JWT with Auth. Answers
    // ok {path, name} for the slot's CURRENT file, or denied / empty / limit.
    const issue = async (who, level, slot, adminUid = null) =>
      (
        await as(
          db,
          { role: "service_role", ...who },
          `select public.teacher_resource_issue('${level}', '${slot}', ${
            adminUid ? `'${adminUid}'` : "null"
          }) as r`,
        )
      )[0].r;
    for (const who of [{}, { token: teacher }, admin]) {
      await expect(
        as(
          db,
          who,
          "select public.teacher_resource_issue('beginner', 'plan', null)",
        ),
      ).rejects.toThrow(/permission denied for function/);
    }
    // the current file only — never the replaced …000.pdf
    expect(await issue({ token: teacher }, "beginner", "plan")).toEqual({
      status: "ok",
      path: "beginner/plan/1730000000001.pdf",
      name: "연간교육안.pdf",
    });
    expect(await issue({ token: branch }, "level-2", "test")).toEqual({
      status: "ok",
      path: "level-2/test/1730000000002.xlsx",
      name: "테스트 문제.xlsx",
    });
    expect(
      (await issue({ token: teacher }, "beginner", "plan", ADMIN_UID)).status,
    ).toBe("ok");
    expect((await issue({}, "beginner", "plan", ADMIN_UID)).status).toBe("ok");
    for (const who of [{ token: student }, {}, { token: "not-a-session" }]) {
      expect(await issue(who, "beginner", "plan")).toEqual({
        status: "denied",
      });
    }
    expect(await issue({}, "beginner", "plan", OTHER_UID)).toEqual({
      status: "denied", // signed in, not an admin
    });
    for (const [level, slot] of [
      ["beginner", "award"], // empty slot
      ["beginner", "test"], // no such slot
      ["Level 1", "plan"], // old key
    ]) {
      expect(await issue({ token: teacher }, level, slot)).toEqual({
        status: "empty",
      });
    }
    // the issue log: no direct access for anyone
    for (const who of [{}, { token: teacher }, admin]) {
      await expect(
        as(db, who, "select * from public.teacher_resource_downloads"),
      ).rejects.toThrow(/permission denied/);
    }
    const logged = await db.query(`
      select m.id, d.level, d.slot
        from public.teacher_resource_downloads d
        join public.members m on m.member_id = d.member_id
       order by d.id`);
    expect(logged.rows).toEqual([
      { id: "t-teacher", level: "beginner", slot: "plan" },
      { id: "t-branch", level: "level-2", slot: "test" },
    ]); // ok issues of LMS members only (not admins, not refusals)

    // --- daily limit: 30 per LMS member per KST day; admins unlimited
    for (let i = 2; i <= 30; i += 1) {
      expect((await issue({ token: teacher }, "beginner", "plan")).status).toBe(
        "ok",
      );
    }
    expect(await issue({ token: teacher }, "beginner", "plan")).toEqual({
      status: "limit",
    });
    expect((await issue({ token: branch }, "beginner", "plan")).status).toBe(
      "ok",
    ); // its own count
    for (let i = 0; i < 35; i += 1) {
      expect((await issue({}, "beginner", "plan", ADMIN_UID)).status).toBe(
        "ok",
      );
    }
    // The day is the KST calendar day: a minute before KST midnight is
    // yesterday, a minute after is today.
    const kstMidnight =
      "(date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')";
    await db.exec(`
      delete from public.teacher_resource_downloads d using public.members m
       where m.member_id = d.member_id and m.id = 't-teacher';
      insert into public.teacher_resource_downloads (member_id, level, slot, issued_at)
      select m.member_id, 'beginner', 'plan', ${kstMidnight} - interval '1 minute'
        from public.members m, generate_series(1, 30) where m.id = 't-teacher';`);
    expect((await issue({ token: teacher }, "beginner", "plan")).status).toBe(
      "ok",
    ); // 30 yesterday + 1 today
    await db.exec(`
      insert into public.teacher_resource_downloads (member_id, level, slot, issued_at)
      select m.member_id, 'beginner', 'plan', ${kstMidnight} + interval '1 minute'
        from public.members m, generate_series(1, 29) where m.id = 't-teacher';`);
    expect(await issue({ token: teacher }, "beginner", "plan")).toEqual({
      status: "limit",
    }); // 1 + 29 today
    // Rows older than 30 days are cleared on the next issue.
    await db.exec(`
      insert into public.teacher_resource_downloads (member_id, level, slot, issued_at)
      select m.member_id, 'beginner', 'plan', now() - interval '31 days'
        from public.members m where m.id = 't-branch';`);
    await issue({ token: branch }, "beginner", "plan");
    expect(
      (
        await db.query(
          "select count(*)::int as n from public.teacher_resource_downloads where issued_at < now() - interval '30 days'",
        )
      ).rows[0].n,
    ).toBe(0);
    // A deactivated member and a logged-out session are refused.
    await db.exec(
      "update public.members set active = false where id = 't-branch'",
    );
    expect(await issue({ token: branch }, "beginner", "plan")).toEqual({
      status: "denied",
    });
    await db.exec(
      "update public.members set active = true where id = 't-branch'",
    );
    await as(db, { token: branch }, "select public.lms_logout()");
    expect(await issue({ token: branch }, "beginner", "plan")).toEqual({
      status: "denied",
    });
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
    expect(await list(admin, "beginner")).toEqual(rowsOf("beginner"));
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

// D65 (2026-11-02): 월간교육안 = 3월~12월, one slot per month (monthly-03 …
// monthly-12), and three new kinds on every level — script (핵심문장
// 스크립트), pictures (그림 자료실), flashcards (플래쉬카드). plan (연간교육안)
// · award · test (level-2/3) as before; D63's single 'monthly' is gone.
const LEVEL_KEYS = ["beginner", "level-1", "level-2", "level-3"];

async function people(db) {
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN_UID}', 'admin@example.test');
    insert into public.admins (user_id) values ('${ADMIN_UID}');
    insert into public.members (id, password_hash, grade, role) values
      ('t-teacher', extensions.crypt('pw-2', extensions.gen_salt('bf')), 2, 2);`);
  const teacher = (
    await as(
      db,
      {},
      `select public.lms_login('t-teacher', 'pw-2') ->> 'token' as token`,
    )
  )[0].token;
  return { admin: { role: "authenticated", uid: ADMIN_UID }, teacher };
}

test("teacher resources sql: D65 — 월간교육안 3~12월 and the three new kinds on every level", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(SUPABASE_SHIM);
    await db.exec(MIGRATION);
    const { admin, teacher } = await people(db);
    const upload = (name) =>
      as(
        db,
        admin,
        `insert into storage.objects (bucket_id, name) values ('${BUCKET}', '${name}')`,
      );
    const set = (level, slot, p, name) =>
      as(
        db,
        admin,
        `select public.teacher_resource_set('${level}', '${slot}', '${p}', '${name}', 4321) as old`,
      );
    const setDrive = (level, slot, id) =>
      as(
        db,
        admin,
        `select public.teacher_resource_set_drive('${level}', '${slot}', '${id}') as old`,
      );

    // Storage + table: every month 3~12 and the three new kinds on all four
    // levels, as a file …
    let n = 100;
    for (const level of LEVEL_KEYS) {
      for (const slot of ["monthly-03", "monthly-12", "script", "pictures"]) {
        const p = `${level}/${slot}/1730000000${(n += 1)}.pdf`;
        await upload(p);
        expect(await set(level, slot, p, `${level} ${slot}.pdf`)).toEqual([
          { old: null },
        ]);
      }
      // … or as a Google Drive file (D64 rule, unchanged)
      expect(await setDrive(level, "flashcards", DRIVE_A)).toEqual([
        { old: null },
      ]);
      expect(await setDrive(level, "monthly-07", DRIVE_B)).toEqual([
        { old: null },
      ]);
    }
    // Storage refuses the old single 'monthly', months outside 3~12, other
    // spellings, test below level-2 and unknown kinds
    for (const bad of [
      "beginner/monthly/1730000000201.pdf",
      "beginner/monthly-02/1730000000202.pdf",
      "beginner/monthly-13/1730000000203.pdf",
      "beginner/monthly-3/1730000000204.pdf",
      "beginner/Monthly-03/1730000000205.pdf",
      "beginner/script-1/1730000000206.pdf",
      "beginner/annual/1730000000207.pdf",
      "level-1/test/1730000000208.pdf",
    ]) {
      await expect(upload(bad), bad).rejects.toThrow(/row-level security/);
    }
    // … and so does the table, even for an object that exists or a link
    await db.exec(
      `insert into storage.objects (bucket_id, name) values ('${BUCKET}', 'beginner/monthly/1730000000209.pdf')`,
    );
    await expect(
      set("beginner", "monthly", "beginner/monthly/1730000000209.pdf", "x.pdf"),
    ).rejects.toThrow(/teacher_resources_slot_ok/);
    for (const [level, slot] of [
      ["beginner", "monthly"],
      ["beginner", "monthly-02"],
      ["level-2", "monthly-1"],
      ["level-1", "test"],
      ["level-3", "scripts"],
    ]) {
      await expect(
        setDrive(level, slot, DRIVE_A),
        `${level}/${slot}`,
      ).rejects.toThrow(/teacher_resources_slot_ok/);
    }

    // list: fixed order, 15 / 15 / 16 / 16 = 62 slots; each filled slot in
    // its place, files and links alike
    let total = 0;
    for (const level of LEVEL_KEYS) {
      const rows = await as(
        db,
        { token: teacher },
        `select slot, file_name, drive_id from public.teacher_resources_list('${level}')`,
      );
      expect(
        rows.map((r) => r.slot),
        level,
      ).toEqual(SLOTS_D65[level]);
      const by = Object.fromEntries(rows.map((r) => [r.slot, r]));
      expect(by["monthly-03"].file_name).toBe(`${level} monthly-03.pdf`);
      expect(by["monthly-07"]).toEqual({
        slot: "monthly-07",
        file_name: null,
        drive_id: DRIVE_B,
      });
      expect(by["monthly-12"].file_name).toBe(`${level} monthly-12.pdf`);
      expect(by.script.file_name).toBe(`${level} script.pdf`);
      expect(by.pictures.file_name).toBe(`${level} pictures.pdf`);
      expect(by.flashcards.drive_id).toBe(DRIVE_A);
      expect(by.plan.file_name).toBeNull();
      total += rows.length;
    }
    expect(total).toBe(62);

    // download: each month is its own file; a link month is "empty" to the
    // function (no error, nothing counted)
    const issue = async (slot) =>
      (
        await as(
          db,
          { role: "service_role", token: teacher },
          `select public.teacher_resource_issue('level-1', '${slot}', null) as r`,
        )
      )[0].r;
    expect(await issue("monthly-03")).toEqual({
      status: "ok",
      path: "level-1/monthly-03/1730000000105.pdf",
      name: "level-1 monthly-03.pdf",
    });
    expect((await issue("monthly-12")).path).toBe(
      "level-1/monthly-12/1730000000106.pdf",
    );
    expect((await issue("script")).status).toBe("ok");
    expect(await issue("monthly-07")).toEqual({ status: "empty" });
    expect(await issue("monthly-04")).toEqual({ status: "empty" });
    expect(await issue("monthly")).toEqual({ status: "empty" });
    expect(
      (
        await db.query(
          "select count(*)::int as n from public.teacher_resource_downloads",
        )
      ).rows[0].n,
    ).toBe(3);

    // clearing one month leaves the others
    expect(
      await as(
        db,
        admin,
        "select public.teacher_resource_clear('level-1', 'monthly-03') as old",
      ),
    ).toEqual([{ old: "level-1/monthly-03/1730000000105.pdf" }]);
    expect((await issue("monthly-03")).status).toBe("empty");
    expect((await issue("monthly-12")).status).toBe("ok");
  } finally {
    await db.close();
  }
});

// D64 (2026-11-02): a slot holds an uploaded file OR a Google Drive file —
// only its ID is stored; teachers download it from Google directly (no
// Storage egress, no Edge Function, no daily limit). One kind per slot.
const DRIVE_A = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345"; // 33 chars, as Drive makes them
const DRIVE_B = "0B7_legacy-Drive_Id_0123456789"; // 30, older style

test("teacher resources sql: D64 — a slot holds a file OR a Google Drive file", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(SUPABASE_SHIM);
    await db.exec(MIGRATION);
    const { admin, teacher } = await people(db);
    await db.exec(`
      insert into auth.users (id, email) values ('${OTHER_UID}', 'other@example.test');
      insert into public.members (id, password_hash, grade, role) values
        ('t-branch', extensions.crypt('pw-1', extensions.gen_salt('bf')), 1, 1),
        ('t-student', extensions.crypt('pw-3', extensions.gen_salt('bf')), 3, 3);`);
    const tokenOf = async (id, pw) =>
      (
        await as(
          db,
          {},
          `select public.lms_login('${id}', '${pw}') ->> 'token' as token`,
        )
      )[0].token;
    const branch = await tokenOf("t-branch", "pw-1");
    const student = await tokenOf("t-student", "pw-3");
    const other = { role: "authenticated", uid: OTHER_UID };
    const setDrive = (who, level, slot, id) =>
      as(
        db,
        who,
        `select public.teacher_resource_set_drive('${level}', '${slot}', '${id}') as old`,
      );

    // who may register a link: the top admin only
    for (const who of [
      { token: teacher },
      { token: branch },
      { token: student },
      {},
    ]) {
      await expect(
        setDrive(who, "beginner", "monthly-03", DRIVE_A),
      ).rejects.toThrow(/permission denied for function/); // anon: no EXECUTE
    }
    await expect(
      setDrive(other, "beginner", "monthly-03", DRIVE_A),
    ).rejects.toThrow(/not authorized/);
    // only a Drive file ID (letters, digits, _ and -, 25-64 long)
    for (const bad of [
      "short-id",
      "has space 1234567890123456789012",
      "../beginner/plan/1730000000000",
      "a".repeat(65),
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view",
    ]) {
      await expect(
        setDrive(admin, "beginner", "monthly-03", bad.replace(/'/g, "''")),
      ).rejects.toThrow(/not a Google Drive file id/);
    }
    // not a slot of that level (D63 rule unchanged)
    await expect(setDrive(admin, "beginner", "test", DRIVE_A)).rejects.toThrow(
      /teacher_resources_slot_ok/,
    );

    // empty slot → link: nothing to delete
    expect(await setDrive(admin, "beginner", "monthly-03", DRIVE_A)).toEqual([
      { old: null },
    ]);
    // file slot → link: the file's Storage path comes back (the page deletes it)
    await as(
      db,
      admin,
      `insert into storage.objects (bucket_id, name) values ('${BUCKET}', 'beginner/plan/1730000000040.pdf')`,
    );
    await as(
      db,
      admin,
      `select public.teacher_resource_set('beginner', 'plan', 'beginner/plan/1730000000040.pdf', '연간교육안.pdf', 2000)`,
    );
    expect(await setDrive(admin, "beginner", "plan", DRIVE_B)).toEqual([
      { old: "beginner/plan/1730000000040.pdf" },
    ]);
    // link → link: nothing to delete
    expect(await setDrive(admin, "beginner", "plan", DRIVE_A)).toEqual([
      { old: null },
    ]);

    // the list: admin, branch account and teacher see the ID (and the date);
    // students, visitors and other signed-in users see nothing
    const list = (who) =>
      as(
        db,
        who,
        `select slot, file_name, file_size::int as size, drive_id, updated_at is not null as dated
           from public.teacher_resources_list('beginner')
          where slot in ('monthly-03', 'plan', 'award')`,
      );
    const expected = [
      {
        slot: "monthly-03",
        file_name: null,
        size: null,
        drive_id: DRIVE_A,
        dated: true,
      },
      {
        slot: "plan",
        file_name: null,
        size: null,
        drive_id: DRIVE_A,
        dated: true,
      },
      {
        slot: "award",
        file_name: null,
        size: null,
        drive_id: null,
        dated: false,
      },
    ];
    for (const who of [admin, { token: branch }, { token: teacher }]) {
      expect(await list(who)).toEqual(expected);
    }
    for (const who of [{ token: student }, {}, other])
      expect(await list(who)).toEqual([]);

    // the Edge Function path never signs a Drive slot: a plain "empty"
    // (no error on the missing path) and no download counted
    const issued = async () =>
      (
        await as(
          db,
          { role: "service_role", token: teacher },
          "select public.teacher_resource_issue('beginner', 'monthly-03', null) as r",
        )
      )[0].r;
    expect(await issued()).toEqual({ status: "empty" });
    expect(
      (
        await db.query(
          "select count(*)::int as n from public.teacher_resource_downloads",
        )
      ).rows[0].n,
    ).toBe(0);

    // link → file: the link goes, nothing to delete
    await as(
      db,
      admin,
      `insert into storage.objects (bucket_id, name) values ('${BUCKET}', 'beginner/monthly-03/1730000000041.pdf')`,
    );
    expect(
      await as(
        db,
        admin,
        `select public.teacher_resource_set('beginner', 'monthly-03', 'beginner/monthly-03/1730000000041.pdf', '월간교육안.pdf', 3000) as old`,
      ),
    ).toEqual([{ old: null }]);
    expect((await list(admin))[0]).toEqual({
      slot: "monthly-03",
      file_name: "월간교육안.pdf",
      size: 3000,
      drive_id: null,
      dated: true,
    });
    // clearing a link: the row goes, nothing to delete
    expect(
      await as(
        db,
        admin,
        "select public.teacher_resource_clear('beginner', 'plan') as old",
      ),
    ).toEqual([{ old: null }]);
    expect((await list(admin))[1]).toEqual({
      slot: "plan",
      file_name: null,
      size: null,
      drive_id: null,
      dated: false,
    });

    // the table itself: exactly one kind per row, a well-formed ID
    for (const values of [
      `'level-1', 'award', 'level-1/award/1730000000042.pdf', 'x.pdf', 1, '${DRIVE_A}'`, // both
      `'level-1', 'award', null, null, null, null`, // neither
      `'level-1', 'award', null, 'x.pdf', null, '${DRIVE_A}'`, // a link with a name
      `'level-1', 'award', null, null, null, 'bad id'`, // not an ID
    ]) {
      await expect(
        db.exec(
          `insert into public.teacher_resources (level, slot, storage_path, file_name, file_size, drive_id) values (${values})`,
        ),
      ).rejects.toThrow(
        /teacher_resources_source_ok|teacher_resources_drive_ok/,
      );
    }
  } finally {
    await db.close();
  }
});

// D64 + D65 on the live database today (commit 6c32cd8 = tests/fixtures/
// migration-4b.sql, 수정 금지). A file still in the D63 'monthly' slot stops
// the new file before it changes anything (빅웨이브 deletes those first in
// the admin screen — its Storage object goes with the old delete flow); once
// gone, the other file rows stay as they are and every teacher-resources
// definition equals a fresh install of the new file.
const MIGRATION_4B = readFileSync(
  path.resolve("tests/fixtures/migration-4b.sql"),
  "utf8",
);

test("teacher resources sql: D64 + D65 upgrade — live (6c32cd8) + migration.sql = fresh install", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(180000);
  const live = new PGlite({ extensions: { pgcrypto } });
  const fresh = new PGlite({ extensions: { pgcrypto } });
  try {
    await live.exec(SUPABASE_SHIM);
    await live.exec(MIGRATION_4B);
    const { admin, teacher } = await people(live);
    for (const [level, slot, n] of [
      ["beginner", "monthly", 50],
      ["level-2", "plan", 51],
      ["level-3", "award", 52],
    ]) {
      const p = `${level}/${slot}/17300000000${n}.pdf`;
      await as(
        live,
        admin,
        `insert into storage.objects (bucket_id, name) values ('${BUCKET}', '${p}')`,
      );
      await as(
        live,
        admin,
        `select public.teacher_resource_set('${level}', '${slot}', '${p}', '${slot}.pdf', 1000)`,
      );
    }
    const rows =
      "select level, slot, storage_path, file_name, file_size from public.teacher_resources order by 1, 2";
    const before = (await live.query(rows)).rows;
    const catalog = (await live.query(TR_DEFINITIONS)).rows;

    // a 'monthly' row left: the whole file stops with a plain message and
    // nothing changes (one transaction)
    await expect(live.exec(MIGRATION)).rejects.toThrow(
      /월간교육안\(monthly\) 1개.*먼저 지우세요/,
    );
    expect((await live.query(rows)).rows).toEqual(before);
    expect((await live.query(TR_DEFINITIONS)).rows).toEqual(catalog);

    // 빅웨이브 deletes it in the (old) admin screen → the file runs, twice
    expect(
      await as(
        live,
        admin,
        "select public.teacher_resource_clear('beginner', 'monthly') as old",
      ),
    ).toEqual([{ old: "beginner/monthly/1730000000050.pdf" }]);
    await live.exec(MIGRATION);
    await live.exec(MIGRATION); // re-run safe
    expect((await live.query(rows)).rows).toEqual(
      before.filter((r) => r.slot !== "monthly"),
    );
    const level2 = await as(
      live,
      { token: teacher },
      "select slot, file_name, drive_id from public.teacher_resources_list('level-2')",
    );
    expect(level2).toEqual(
      SLOTS_D65["level-2"].map((slot) => ({
        slot,
        file_name: slot === "plan" ? "plan.pdf" : null,
        drive_id: null,
      })),
    );

    await fresh.exec(SUPABASE_SHIM);
    await fresh.exec(MIGRATION);
    expect((await live.query(TR_DEFINITIONS)).rows).toEqual(
      (await fresh.query(TR_DEFINITIONS)).rows,
    );
  } finally {
    await live.close();
    await fresh.close();
  }
});

// The live database today (commit 4a9b23d = tests/fixtures/migration-3b.sql,
// 수정 금지) with a file in the old 월간.연간교육안 slot → migration.sql again:
// the file is the 연간교육안 (plan) file, monthly is empty, and every teacher-
// resources definition equals a fresh install of the new migration.sql.
const MIGRATION_3B = readFileSync(
  path.resolve("tests/fixtures/migration-3b.sql"),
  "utf8",
);
const TR_DEFINITIONS = `
  select 'con ' || conname || ' ' || pg_get_constraintdef(oid) as x
    from pg_constraint where conrelid = 'public.teacher_resources'::regclass
  union all
  select 'fn ' || p.oid::regprocedure::text || ' ' || md5(p.prosrc) || ' '
         || coalesce(array_to_string(p.proacl, ','), '-') || ' '
         || coalesce(array_to_string(p.proconfig, ','), '-') || ' ' || p.prosecdef
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname like 'teacher_resource%'
  union all
  select 'pol ' || policyname || ' ' || cmd || ' ' || roles::text || ' '
         || coalesce(qual, '') || ' ' || coalesce(with_check, '')
    from pg_policies where schemaname = 'storage' and policyname like 'teacher_resources%'
  union all
  select 'bucket ' || id || ' ' || public || ' ' || file_size_limit || ' '
         || array_to_string(allowed_mime_types, ',')
    from storage.buckets where id = 'teacher-resources'
  order by 1`;

test("teacher resources sql: D63 upgrade — live (4a9b23d) + migration.sql = fresh install", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(180000);
  const live = new PGlite({ extensions: { pgcrypto } });
  const fresh = new PGlite({ extensions: { pgcrypto } });
  try {
    await live.exec(SUPABASE_SHIM);
    await live.exec(MIGRATION_3B);
    const { admin, teacher } = await people(live);
    // a file TPS put in the old 월간.연간교육안 slot
    await as(
      live,
      admin,
      `insert into storage.objects (bucket_id, name) values ('${BUCKET}', 'level-2/plan/1730000000030.pdf')`,
    );
    await as(
      live,
      admin,
      `select public.teacher_resource_set('level-2', 'plan', 'level-2/plan/1730000000030.pdf', '2026 월간.연간교육안.pdf', 5000)`,
    );
    const before = await live.query(
      "select level, slot, storage_path, file_name from public.teacher_resources",
    );
    // the live state still has the old three slots
    expect(
      (
        await as(
          live,
          { token: teacher },
          "select slot from public.teacher_resources_list('level-2')",
        )
      ).map((r) => r.slot),
    ).toEqual(["plan", "award", "test"]);

    await live.exec(MIGRATION);
    await live.exec(MIGRATION); // re-run safe
    expect(
      (
        await live.query(
          "select level, slot, storage_path, file_name from public.teacher_resources",
        )
      ).rows,
    ).toEqual(before.rows); // nothing moved
    expect(
      await as(
        live,
        { token: teacher },
        "select slot, file_name from public.teacher_resources_list('level-2')",
      ),
    ).toEqual(
      // now the 연간교육안 (plan) card, among the D65 slots
      SLOTS_D65["level-2"].map((slot) => ({
        slot,
        file_name: slot === "plan" ? "2026 월간.연간교육안.pdf" : null,
      })),
    );

    await fresh.exec(SUPABASE_SHIM);
    await fresh.exec(MIGRATION);
    expect((await live.query(TR_DEFINITIONS)).rows).toEqual(
      (await fresh.query(TR_DEFINITIONS)).rows,
    );
  } finally {
    await live.close();
    await fresh.close();
  }
});

// supabase/lms/teacher-test-account.sql — the live teacher (role 2, hq)
// account for the download check. Nobody types a password: the server makes
// a random one and shows it ONCE in the result row, so it is never part of
// the statement text (SQL Editor history, error logs, pg_stat_statements).
// Re-running resets it (the old one stops working) and ends its sessions.
const TEST_ACCOUNT_SCRIPT = readFileSync(
  path.resolve("supabase/lms/teacher-test-account.sql"),
  "utf8",
);
// The script relies on the 3A-era primary key (`on conflict (id)`), which
// Phase 3B moves to member_id — so its test runs on the frozen 3A-era copy
// (commit 8176966 = the live state). 3A 시점 전용 스크립트.
const MIGRATION_3A = readFileSync(
  path.resolve("tests/fixtures/migration-3a.sql"),
  "utf8",
);
const TEST_ACCOUNT_SESSIONS =
  "select count(*)::int as n from public.lms_sessions s join public.members m on m.member_id = s.member_id where m.id = 'tps-teacher-test'";

// Live 2026-10-30: the temp-table version failed at its last select (42P01).
// Cause not confirmed (editor behaviour, or only part of the text selected),
// and PGlite does not reproduce it. Keep the script ONE statement with no temp
// table — safe either way.
test("teacher resources sql: teacher test account script is one statement", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  const code = TEST_ACCOUNT_SCRIPT.replace(/--.*$/gm, "").replace(
    /'(?:[^']|'')*'/g,
    "''",
  );
  expect(code).not.toMatch(/\btemp(orary)?\b|\$\$/i);
  expect(code.split(";").filter((s) => s.trim())).toHaveLength(1);
});

test("teacher resources sql: teacher test account script", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000); // PGlite: migration.sql + the script three times
  const SCRIPT = TEST_ACCOUNT_SCRIPT;
  expect(SCRIPT).not.toMatch(/CHANGE-ME/);
  expect(SCRIPT).toMatch(/extensions\.gen_random_bytes\(9\)/);
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(SUPABASE_SHIM);
    await db.exec(MIGRATION_3A);

    // no branch hq → 0 rows and nothing written
    const noHq = await db.exec(`begin;
      update public.branches set code = 'zz-no-hq' where code = 'hq';
      ${SCRIPT};
      rollback;`);
    expect(noHq[2].rows).toEqual([]);
    expect(
      (
        await db.query(
          "select count(*)::int as n from public.members where id = 'tps-teacher-test'",
        )
      ).rows[0].n,
    ).toBe(0);

    const run = async (ended = 0) => {
      const results = await db.exec(SCRIPT);
      const rows = [...results].reverse().find((r) => r.rows.length).rows;
      expect(rows).toHaveLength(1);
      const { password, ...rest } = rows[0];
      expect(rest).toEqual({
        id: "tps-teacher-test",
        role: 2,
        branch: "hq",
        active: true,
        sessions_ended: ended,
      });
      expect(password).toMatch(/^[A-Za-z0-9_-]{12}$/);
      // the new password ended every session of the account
      expect((await db.query(TEST_ACCOUNT_SESSIONS)).rows[0].n).toBe(0);
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
    // re-run while logged in: the row counts the 1 session it ended, 0 left
    expect((await db.query(TEST_ACCOUNT_SESSIONS)).rows[0].n).toBe(1);
    await run(1);
  } finally {
    await db.close();
  }
});

// supabase/lms/verify-teacher-resources.sql — the read-only catalog check the
// user runs on the live project after migration.sql (verify-3a.sql does not
// look at this block). Every row must pass on a fresh migration, and each
// kind of drift must turn exactly its own row false.
test("teacher resources sql: read-only verify script", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  const SCRIPT = readFileSync(
    path.resolve("supabase/lms/verify-teacher-resources.sql"),
    "utf8",
  );
  // read-only: no writing keyword outside comments and string literals
  const code = SCRIPT.replace(/--.*$/gm, "").replace(/'(?:[^']|'')*'/g, "''");
  expect(code).not.toMatch(
    /\b(insert|update|delete|merge|create|drop|alter|grant|revoke|truncate|set_config|begin|commit|into|copy|call|do|set|lock|notify|nextval|setval|pg_advisory\w*)\b/i,
  );
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(SUPABASE_SHIM);
    await db.exec(MIGRATION);
    const rowsOf = (results) =>
      [...results].reverse().find((r) => r.rows.length).rows;

    const fresh = rowsOf(await db.exec(SCRIPT));
    expect(fresh[0]).toMatchObject({ no: 0, area: "SUMMARY", pass: true });
    expect(fresh.filter((r) => r.pass === false)).toEqual([]);
    expect(fresh.filter((r) => r.pass === null).map((r) => r.area)).toEqual([
      "info",
    ]);

    // One drift at a time, rolled back: the rows that turn false.
    const failing = async (drift) => {
      const rows = rowsOf(
        await db.exec(`begin; ${drift}; ${SCRIPT}; rollback;`),
      );
      expect(rows[0]).toMatchObject({ no: 0, area: "SUMMARY", pass: false });
      return rows
        .filter((r) => r.no > 0 && r.pass === false)
        .map((r) => r.check);
    };
    const DIRECT =
      "teacher_resources: no direct access for anon / authenticated";
    const ONE_BUCKET = "storage.objects policies not tied to one bucket";
    const OTHER_FN = "no other public function touches teacher resources";
    const cases = [
      [
        `update storage.buckets set public = true where id = '${BUCKET}'`,
        ["teacher-resources bucket is private"],
      ],
      ["grant select on public.teacher_resources to anon", [DIRECT]],
      [
        "grant select (file_name) on public.teacher_resources to anon",
        [DIRECT],
      ],
      [
        "grant execute on function public.teacher_resource_issue(text, text, uuid) to anon",
        ["teacher_resource_issue: Edge Function (service role) only"],
      ],
      // 2026-11-03: the 자료실 download call shares the daily log
      [
        "grant execute on function public.board_attachment_issue(uuid, uuid) to authenticated",
        [
          "board_attachment_issue (자료실 download, same log): Edge Function (service role) only",
        ],
      ],
      // D64: the Drive link RPC and the one-kind-per-row rule
      [
        "grant execute on function public.teacher_resource_set_drive(text, text, text) to anon",
        ["teacher_resource_set_drive: signed-in only (checks is_admin inside)"],
      ],
      [
        "alter table public.teacher_resources drop constraint teacher_resources_source_ok",
        [
          "teacher_resources checks: slot rule, path rule, size <= 10 MB, file or Drive, Drive ID",
        ],
      ],
      [
        `alter policy teacher_resources_admin_all on storage.objects
           using (bucket_id = '${BUCKET}')`,
        ["teacher_resources_admin_all: for all, to authenticated, admins only"],
      ],
      [
        "create policy zz_any on storage.objects for select to anon using (true)",
        [ONE_BUCKET],
      ],
      [
        `create policy zz_not_covers on storage.objects for select to anon
           using (bucket_id <> 'covers')`,
        [ONE_BUCKET],
      ],
      [
        `create policy zz_or on storage.objects for select to anon
           using (bucket_id = 'covers' or true)`,
        [ONE_BUCKET],
      ],
      [
        "alter table storage.objects disable row level security",
        [
          "RLS is on for storage.objects and storage.buckets (tables with it off)",
        ],
      ],
      [
        `create policy zz_bucket on storage.buckets for update to authenticated
           using (true)`,
        ["no browser policy can change a bucket (storage.buckets)"],
      ],
      [
        `create function public.teacher_resource_file(text, text) returns jsonb
           language sql as $$ select null::jsonb $$`,
        ["(가) leftovers are gone", OTHER_FN],
      ],
      [
        `create function public.zz_peek() returns setof text language sql
           as $$ select file_name from public.teacher_resources $$`,
        [OTHER_FN],
      ],
      [
        `create view public.zz_resources_v as
           select * from public.teacher_resources`,
        ["no view reads the two tables"],
      ],
    ];
    for (const [drift, expected] of cases) {
      expect(await failing(drift), drift).toEqual(expected);
    }
    // and nothing stayed behind
    expect(rowsOf(await db.exec(SCRIPT))[0].pass).toBe(true);
  } finally {
    await db.close();
  }
});
