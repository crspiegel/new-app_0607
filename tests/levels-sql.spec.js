import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { SUPABASE_SHIM, lastRows } from "./sql-shim.mjs";

// Level-key rename (supabase/levels/), checked locally in PGlite — never
// against the live project: live-like rows with the old keys "Level 1".."4"
// plus one page an admin already re-saved under its new key (the new code is
// live, the SQL not run yet) → 00-precheck → 01-rename twice → migration.sql
// re-run on the renamed data.

const read = (file) => readFileSync(path.resolve(file), "utf8");
const byTableLevel = (a, b) =>
  a.table.localeCompare(b.table) || a.level.localeCompare(b.level);

test("levels sql: precheck → rename ×2 → migration re-run", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  const MIGRATION = read("supabase/migration.sql");
  const PRECHECK = read("supabase/levels/00-precheck.sql");
  const RENAME = read("supabase/levels/01-rename.sql");

  const db = new PGlite({ extensions: { pgcrypto } });
  try {
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

    // --- precheck: read-only, one table; says what will move and what drops
    const pre = lastRows(await db.exec(PRECHECK)).sort(byTableLevel);
    expect(pre).toEqual(
      [
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
      ]
        .map(([table, level, rows, note]) => ({ table, level, rows, note }))
        .sort(byTableLevel),
    );

    // --- rename: one table of before/after counts per table and level
    const first = lastRows(await db.exec(RENAME)).sort(byTableLevel);
    expect(first).toEqual(
      [
        ["content_pages", "Level 1", 1, 0],
        ["content_pages", "Level 2", 1, 0],
        ["content_pages", "Level 3", 1, 0],
        ["content_pages", "Level 4", 1, 0],
        ["content_pages", "beginner", 0, 1],
        ["content_pages", "level-1", 1, 1],
        ["content_pages", "level-2", 0, 1],
        ["content_pages", "level-3", 0, 1],
        ["page_backgrounds", "Level 1", 1, 0],
        ["page_backgrounds", "Level 2", 1, 0],
        ["page_backgrounds", "Level 4", 1, 0],
        ["page_backgrounds", "beginner", 0, 1],
        ["page_backgrounds", "level-1", 1, 1],
        ["page_backgrounds", "level-3", 0, 1],
      ]
        .map(([table, level, before, after]) => ({
          table,
          level,
          before,
          after,
        }))
        .sort(byTableLevel),
    );

    // The new-key row won; the moved rows kept their data.
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

    // --- second run changes nothing
    const second = lastRows(await db.exec(RENAME));
    expect(second.every((r) => r.before === r.after)).toBe(true);
    expect(second.map((r) => r.level).sort()).not.toContain("Level 1");
    // 9 rows in, 2 stale old copies dropped → 7 (content 4, backgrounds 3)
    expect(second.reduce((sum, r) => sum + r.after, 0)).toBe(7);

    // --- the CHECK now refuses an old key (or a typo) on both tables
    await expect(
      db.exec(
        "insert into public.content_pages (level, month) values ('Level 1', 'June')",
      ),
    ).rejects.toThrow(/content_pages_level_key/);
    await expect(
      db.exec(
        "insert into public.page_backgrounds (level, page) values ('Beginner', 'page1')",
      ),
    ).rejects.toThrow(/page_backgrounds_level_key/);

    // --- migration.sql re-run on the renamed data: no old-key writes, no
    // clash with the CHECK, rows untouched
    await db.exec(MIGRATION);
    const after = lastRows(await db.exec(PRECHECK));
    expect(after.every((r) => r.note === "new")).toBe(true);
    expect(after.reduce((sum, r) => sum + r.rows, 0)).toBe(7);
  } finally {
    await db.close();
  }
});
