import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// scripts/make-qr-list.mjs builds the list typed into Naver QR: one QR per
// BOOK (Beginner 1 × 10 months + Level 1-3 2 × 10 months each = 70). Pure
// Node — no page — so it runs on one project only, and always with
// --offline (no REST read).
const HEADER =
  "qr_name,level,month,book,title,student_url,cover_file,filled_slots";

function makeList(outFile, ...args) {
  execFileSync(
    process.execPath,
    ["scripts/make-qr-list.mjs", "--offline", "--out", outFile, ...args],
    { stdio: "pipe" },
  );
  const text = readFileSync(outFile, "utf8");
  return { text, lines: text.replace(/^﻿/, "").trimEnd().split(/\r?\n/) };
}

test("qr list: 70 book rows for Naver QR", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  const { text, lines } = makeList(testInfo.outputPath("list.csv"));

  expect(text.startsWith("﻿")).toBe(true); // Excel reads UTF-8 with BOM
  expect(lines[0]).toBe(HEADER);
  const rows = lines.slice(1);
  expect(rows).toHaveLength(70);

  const names = rows.map((row) => row.split(",")[0]);
  expect(new Set(names).size).toBe(70);
  // Beginner first (10), then Level 1-3 (20 each), month by month, book 1
  // before book 2.
  expect(names.slice(0, 11)).toEqual([
    "B-03-1",
    "B-04-1",
    "B-05-1",
    "B-06-1",
    "B-07-1",
    "B-08-1",
    "B-09-1",
    "B-10-1",
    "B-11-1",
    "B-12-1",
    "L1-03-1",
  ]);
  expect(names[11]).toBe("L1-03-2");

  expect(rows[0]).toBe(
    "B-03-1,Beginner,3,1,Beginner Book 1,https://play.tps-education.com/q/b/3/1,assets/covers/beginner/march/book-1.jpg,0/24",
  );
  expect(rows[11]).toBe(
    "L1-03-2,Level 1,3,2,Level 1 Book 2,https://play.tps-education.com/q/l1/3/2,assets/covers/level-1/march/book-2.jpg,0/14",
  );
  expect(rows[69]).toBe(
    "L3-12-2,Level 3,12,2,Level 3 Book 2,https://play.tps-education.com/q/l3/12/2,assets/covers/level-3/december/book-2.jpg,0/14",
  );
});

test("qr list: --host shapes the student URL", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  const { lines } = makeList(
    testInfo.outputPath("host.csv"),
    "--host",
    "https://www.cambridgereading.com/",
  );
  expect(lines[1]).toContain(",https://www.cambridgereading.com/q/b/3/1,");
  expect(lines[70]).toContain(",https://www.cambridgereading.com/q/l3/12/2,");
});
