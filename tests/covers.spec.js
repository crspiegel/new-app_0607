import { expect, test } from "@playwright/test";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// The student QR page reads its book covers from committed files under
// assets/covers (never from Storage). scripts/sync-covers.mjs copies them;
// this pins that every book has its file, in the name coverAssetPath()
// builds, lower-case (Vercel serves from Linux) and at a sensible size.
// Pure Node — one project only.
function loadVideoSource() {
  const context = vm.createContext({ URL });
  const file = path.resolve("video-source.js");
  vm.runInContext(readFileSync(file, "utf8"), context, { filename: file });
  return vm.runInContext(
    "({ months, bookLayout, coverAssetPath, COVER_EXT })",
    context,
  );
}

test("covers: one static file per book, 70 in all", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  const vs = loadVideoSource();
  expect(vs.COVER_EXT).toBe("jpg"); // what the uploads actually are (sync dry-run)
  const expected = [];
  for (const level of ["Level 1", "Level 2", "Level 3", "Level 4"]) {
    for (const month of vs.months) {
      for (const entry of vs.bookLayout(level)) {
        expected.push(vs.coverAssetPath(level, month, entry.book));
      }
    }
  }
  expect(expected).toHaveLength(70);
  expect(expected[0]).toBe("assets/covers/level-1/march/book-1.jpg");
  expect(expected[69]).toBe("assets/covers/level-4/december/book-2.jpg");

  const missing = expected.filter((file) => {
    try {
      return !statSync(path.resolve(file)).isFile();
    } catch {
      return true;
    }
  });
  expect(missing).toEqual([]);

  // Sizes: shrunk on upload (800 px edge), so nothing should be huge or empty.
  const sizes = expected.map((file) => statSync(path.resolve(file)).size);
  expect(Math.max(...sizes)).toBeLessThan(512 * 1024);
  expect(Math.min(...sizes)).toBeGreaterThan(1024);

  // Nothing else lives there, and every name is lower-case.
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory()
        ? walk(path.join(dir, d.name))
        : [path.join(dir, d.name).replaceAll("\\", "/")],
    );
  const actual = walk("assets/covers").map((f) =>
    f.replace(/^.*?assets\//, "assets/"),
  );
  expect(actual.sort()).toEqual([...expected].sort());
  for (const file of actual) expect(file).toBe(file.toLowerCase());
});
