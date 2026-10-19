import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// scripts/make-qr-list.mjs builds the list typed into Naver QR (one QR per
// slot, 240 for Beginner). Pure Node — no page — so it runs on one project
// only, and always with --offline (no REST read).
const HEADER = "qr_name,level,month,slot,label,student_url,current_video_url";

function makeList(outFile, ...args) {
  execFileSync(
    process.execPath,
    ["scripts/make-qr-list.mjs", "--offline", "--out", outFile, ...args],
    { stdio: "pipe" },
  );
  const text = readFileSync(outFile, "utf8");
  return { text, lines: text.replace(/^﻿/, "").trimEnd().split(/\r?\n/) };
}

test("qr list: 240 Beginner rows for Naver QR", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  const { text, lines } = makeList(testInfo.outputPath("list.csv"));

  expect(text.startsWith("﻿")).toBe(true); // Excel reads UTF-8 with BOM
  expect(lines[0]).toBe(HEADER);
  const rows = lines.slice(1);
  expect(rows).toHaveLength(240);

  const names = rows.map((row) => row.split(",")[0]);
  expect(new Set(names).size).toBe(240);

  expect(rows[0]).toBe(
    "B-03-OPENING,Beginner,3,opening,Good Morning Song,https://www.cambridgereading.com/q/b/3/opening,",
  );
  expect(rows[3]).toBe(
    "B-03-UNIT,Beginner,3,unit,Unit Song,https://www.cambridgereading.com/q/b/3/unit,",
  );
  expect(rows[4]).toBe(
    "B-03-W1-MON,Beginner,3,w1-Mon,Week 1 · Mon · Opening Song,https://www.cambridgereading.com/q/b/3/w1-mon,",
  );
  expect(rows[239]).toBe(
    "B-12-W4-FRI,Beginner,12,w4-Fri,Week 4 · Fri · Ending Song,https://www.cambridgereading.com/q/b/12/w4-fri,",
  );
});

test("qr list: --host and --solo shape the student URL", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Node-only, run once");
  const { lines } = makeList(
    testInfo.outputPath("solo.csv"),
    "--host",
    "https://play.tps-education.com/",
    "--solo",
  );
  expect(lines[1]).toContain(
    ",https://play.tps-education.com/q/b/3/opening?solo=1,",
  );
});
