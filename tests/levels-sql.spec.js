import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { SUPABASE_SHIM, lastRows } from "./sql-shim.mjs";

// Level-key rename (supabase/levels/), checked locally in PGlite — never
// against the live project: live-like rows with the old keys "Level 1".."4"
// plus one page an admin already re-saved under its new key (the new code is
// live, the SQL not run yet) → 00-precheck → 01-rename → 00-precheck, a second
// 01-rename, the CHECKs, migration.sql re-run on the renamed data; and a run
// that must stop and undo everything.

const read = (file) => readFileSync(path.resolve(file), "utf8");
const MIGRATION = read("supabase/migration.sql");
const PRECHECK = read("supabase/levels/00-precheck.sql");
const RENAME = read("supabase/levels/01-rename.sql");

const byTableLevel = (a, b) =>
  a.table.localeCompare(b.table) || a.level.localeCompare(b.level);
const precheckRows = (rows) =>
  rows
    .map(([table, level, n, note]) => ({ table, level, rows: n, note }))
    .sort(byTableLevel);

async function seededDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_SHIM);
  await db.exec(MIGRATION);
  await db.exec(`
    insert into public.content_pages (level, month, labels) values
      ('Level 1', 'March', '{"game":"b-old"}'),
      ('Level 2', 'March', '{"game":"l1-old"}'),
      ('level-1', 'March', '{"game":"l1-new"}'),
      ('Level 3', 'April', '{}'),
      ('Level 4', 'May', '{}');
    insert into public.page_backgrounds (level, page, month, data) values
      ('Level 1', 'page1', '', '{"full":"b"}'),
      ('Level 2', 'page2', 'March', '{"full":"l1-old"}'),
      ('level-1', 'page2', 'March', '{"full":"l1-new"}'),
      ('Level 4', 'page1', '', '{}');
  `);
  return db;
}

// Every row of both tables, whole, in a fixed order.
const snapshot = async (db) =>
  (
    await db.query(`
      select 'content_pages' as tbl, to_jsonb(c)::text as row
        from public.content_pages c
      union all
      select 'page_backgrounds', to_jsonb(p)::text
        from public.page_backgrounds p
       order by 1, 2`)
  ).rows;

// The two level CHECKs: name, identity (a re-made CHECK gets a new oid) and
// definition.
const levelChecks = async (db) =>
  (
    await db.query(`
      select conname as name, oid::text as id, pg_get_constraintdef(oid) as def
        from pg_constraint
       where conname in ('content_pages_level_key', 'page_backgrounds_level_key')
       order by 1`)
  ).rows;

// Live 2026-10-30: a script whose last select used a temp table an earlier
// statement made failed in the SQL Editor (42P01) — cause not confirmed
// (editor behaviour, or only part of the text selected). One statement is
// safe either way (PM D31): the whole file is a single DO block.
test("levels sql: 01-rename is one statement — a DO block, no temp table, no begin/commit", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  const code = RENAME.replace(/--.*$/gm, "")
    .replace(/'(?:[^']|'')*'/g, "''")
    .trim();
  expect(code).toMatch(/^do\s+\$\$[\s\S]*\$\$\s*;?$/i);
  expect(code.match(/\$\$/g)).toHaveLength(2);
  expect(code).not.toMatch(
    /\btemp(orary)?\b|\bcommit\b|\brollback\b|\bbegin\s*;/i,
  );
});

test("levels sql: precheck → rename → precheck, rename again, CHECKs, migration re-run", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000); // PGlite runs migration.sql 2× + the SQL files
  const db = await seededDb();
  try {
    await test.step("00 before: one table, what moves and what drops", async () => {
      const pre = lastRows(await db.exec(PRECHECK)).sort(byTableLevel);
      expect(pre).toEqual(
        precheckRows([
          ["content_pages", "Level 1", 1, "old → beginner"],
          [
            "content_pages",
            "Level 2",
            1,
            "old → level-1 (1 already saved as level-1: old copy dropped)",
          ],
          ["content_pages", "Level 3", 1, "old → level-2"],
          ["content_pages", "Level 4", 1, "old → level-3"],
          ["content_pages", "level-1", 1, "new"],
          ["page_backgrounds", "Level 1", 1, "old → beginner"],
          [
            "page_backgrounds",
            "Level 2",
            1,
            "old → level-1 (1 already saved as level-1: old copy dropped)",
          ],
          ["page_backgrounds", "Level 4", 1, "old → level-3"],
          ["page_backgrounds", "level-1", 1, "new"],
        ]),
      );
    });

    await test.step("(a) rename: old keys → new keys, both CHECKs made", async () => {
      // A DO block returns no rows: the SQL Editor says "No rows returned".
      expect(lastRows(await db.exec(RENAME))).toEqual([]);
      // Checked with 00 again: every row "new"; 9 rows in, 2 stale copies
      // dropped → 7.
      const after = lastRows(await db.exec(PRECHECK)).sort(byTableLevel);
      expect(after).toEqual(
        precheckRows([
          ["content_pages", "beginner", 1, "new"],
          ["content_pages", "level-1", 1, "new"],
          ["content_pages", "level-2", 1, "new"],
          ["content_pages", "level-3", 1, "new"],
          ["page_backgrounds", "beginner", 1, "new"],
          ["page_backgrounds", "level-1", 1, "new"],
          ["page_backgrounds", "level-3", 1, "new"],
        ]),
      );
      const fourKeys =
        /^CHECK .*'beginner'.*'level-1'.*'level-2'.*'level-3'[^']*$/;
      expect(
        (await levelChecks(db)).map(({ name, def }) => ({ name, def })),
      ).toEqual([
        {
          name: "content_pages_level_key",
          def: expect.stringMatching(fourKeys),
        },
        {
          name: "page_backgrounds_level_key",
          def: expect.stringMatching(fourKeys),
        },
      ]);
    });

    await test.step("(b) old + new key for one page: the new row wins, moved rows keep their data", async () => {
      const data = await db.query(`
        select (select labels ->> 'game' from public.content_pages
                 where level = 'level-1' and month = 'March') as l1,
               (select labels ->> 'game' from public.content_pages
                 where level = 'beginner' and month = 'March') as b,
               (select data ->> 'full' from public.page_backgrounds
                 where level = 'level-1' and page = 'page2' and month = 'March') as bg_l1,
               (select data ->> 'full' from public.page_backgrounds
                 where level = 'beginner' and page = 'page1') as bg_b`);
      expect(data.rows).toEqual([
        { l1: "l1-new", b: "b-old", bg_l1: "l1-new", bg_b: "b" },
      ]);
    });

    await test.step("(d) a second run after success changes nothing, no error", async () => {
      const rowsBefore = await snapshot(db);
      const checksBefore = await levelChecks(db);
      expect(lastRows(await db.exec(RENAME))).toEqual([]);
      expect(await snapshot(db)).toEqual(rowsBefore);
      // Same oid: the CHECKs were left as they are, not dropped and re-made.
      expect(await levelChecks(db)).toEqual(checksBefore);
    });

    await test.step("(e) the CHECKs refuse an old key (or a typo) on both tables", async () => {
      await expect(
        db.exec(
          "insert into public.content_pages (level, month) values ('Level 1', 'June')",
        ),
      ).rejects.toThrow(/content_pages_level_key/);
      await expect(
        db.exec(
          "update public.content_pages set level = 'Level 2' where level = 'level-1'",
        ),
      ).rejects.toThrow(/content_pages_level_key/);
      await expect(
        db.exec(
          "insert into public.page_backgrounds (level, page) values ('Beginner', 'page1')",
        ),
      ).rejects.toThrow(/page_backgrounds_level_key/);
    });

    await test.step("migration.sql re-run on the renamed data: no clash, rows untouched", async () => {
      const rowsBefore = await snapshot(db);
      await db.exec(MIGRATION);
      expect(await snapshot(db)).toEqual(rowsBefore);
      const after = lastRows(await db.exec(PRECHECK));
      expect(after.every((r) => r.note === "new")).toBe(true);
    });
  } finally {
    await db.close();
  }
});

test("levels sql: (c) a key left that is not new → error, NOTHING changed", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  test.setTimeout(120000);
  const db = await seededDb();
  try {
    // Force a row the rename cannot move: this trigger skips the update of
    // the old "Level 3" row, so it is still old after step 2.
    await db.exec(`
      create function public.zz_keep_level_3() returns trigger
        language plpgsql as $$
      begin
        if old.level = 'Level 3' then return null; end if;
        return new;
      end $$;
      create trigger zz_keep_level_3 before update on public.content_pages
        for each row execute function public.zz_keep_level_3();
    `);
    const rowsBefore = await snapshot(db);
    await expect(db.exec(RENAME)).rejects.toThrow(
      /nothing was changed[\s\S]*content_pages "Level 3" \(1\)/i,
    );
    // The stale copies are back, no row renamed, no CHECK made.
    expect(await snapshot(db)).toEqual(rowsBefore);
    expect(await levelChecks(db)).toEqual([]);
  } finally {
    await db.close();
  }
});
