// Builds the list typed into Naver QR: one row per BOOK — Beginner 1 book ×
// 10 months + Level 1-3 2 books × 10 months each = 70 — with the student-page
// URL the QR code should open (/q/<lv>/<month>/<book>, video-source.js
// bookQrPath). No QR images are made here — Naver QR does that, and its codes
// can be re-pointed later, which is why the printed books survive a domain
// change.
//
//   npm run qr:list                      -> qr/qr-list.csv (+ memo)
//   node scripts/make-qr-list.mjs --offline --out <file>   (no REST read)
//   --host https://www.cambridgereading.com   (default play.tps-education.com)
//
// Online it makes ONE read of content_pages (every level, JSON only — no
// Storage) to fill in each book's title (the admin's label on its game slot)
// and how many of its slots have a video. Those columns are a snapshot for
// checking; the student page always reads the live row.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";

const LEVELS = ["Level 1", "Level 2", "Level 3", "Level 4"];
const HEADER = [
  "qr_name",
  "level",
  "month",
  "book",
  "title",
  "student_url",
  "cover_file",
  "filled_slots",
];
const root = process.cwd();

function parseArgs(argv) {
  const args = {
    offline: false,
    host: "https://play.tps-education.com",
    out: "qr/qr-list.csv",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--offline") args.offline = true;
    else if (arg === "--host") args.host = argv[(i += 1)];
    else if (arg === "--out") args.out = argv[(i += 1)];
    else throw new Error(`Unknown option: ${arg}`);
  }
  args.host = String(args.host || "").replace(/\/+$/, "");
  return args;
}

// The site's own data and helpers (single source): video-source.js is a
// classic script with no DOM access at the top level, so it evaluates here.
function loadVideoSource() {
  const context = vm.createContext({ URL });
  const file = path.join(root, "video-source.js");
  vm.runInContext(readFileSync(file, "utf8"), context, { filename: file });
  return vm.runInContext(
    "({ months, levelLabel, monthNumber, bookLayout, bookSlotKeys, bookQrPath, bookQrName, bookTitle, coverAssetPath })",
    context,
  );
}

// Public URL + anon key (RLS protects writes; this script only reads).
function supabaseConfig() {
  const source = readFileSync(path.join(root, "supabase-config.js"), "utf8");
  const url = source.match(/window\.SUPABASE_URL\s*=\s*"([^"]+)"/);
  const key = source.match(/window\.SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/);
  if (!url || !key) throw new Error("Could not read supabase-config.js");
  return { url: url[1], key: key[1] };
}

async function fetchRows() {
  const { url, key } = supabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/content_pages?select=level,month,videos,labels`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!response.ok) throw new Error(`content_pages: HTTP ${response.status}`);
  const rows = await response.json();
  return Object.fromEntries(
    rows.map((row) => [`${row.level}||${row.month}`, row]),
  );
}

function csvField(value) {
  const str = String(value == null ? "" : value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const MEMO = `네이버 QR 등록 메모 — 교재별 QR 70개 (make-qr-list.mjs가 만든 파일)

- 한 줄 = QR 1개 = 교재 1권. qr_name을 네이버 QR의 코드 이름으로, student_url을 연결 주소로 넣는다.
  (B-03-1 = Beginner 3월, L1-03-2 = Level 1 3월 교재 2. Beginner는 월 1권, Level 1~3은 월 2권 =
  1·2주 / 3·4주 고정.)
- 연결 방식은 "링크로 바로 이동"(중간 안내 페이지 없음)인지 확인한다.
- 학생 페이지 호스트가 최종 확정된 뒤 한 번에 등록하는 것이 가장 싸다.
  호스트가 바뀌면 이 스크립트를 --host로 다시 돌려 네이버 QR의 연결 주소만 바꾼다
  (인쇄된 QR 이미지는 그대로).
- 70개가 네이버 계정 하나에 묶이므로 개인 계정이 아닌 TPS 공용 계정을 권장한다.
- 인쇄: 20mm 이상, 단색(검정 코드 + 흰 배경), 여백 유지. 시험 인쇄 후
  아이폰·안드로이드(저가폰 포함) 기본 카메라로 스캔해 확인한다.
- title·filled_slots는 만든 시점의 스냅샷이다. 비어 있는 교재도 QR은 발행한다
  (학생 페이지가 교재 보드를 보여 주고, 빈 버튼은 Coming soon — 관리자 화면에서 채우면 바로 반영).
- cover_file은 학생 페이지가 쓰는 정적 표지(npm run covers:sync로 Storage에서 복사).
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const vs = loadVideoSource();
  const rows = args.offline ? {} : await fetchRows();

  const lines = [HEADER.join(",")];
  let filledBooks = 0;
  for (const level of LEVELS) {
    for (const month of vs.months) {
      const row = rows[`${level}||${month}`];
      for (const entry of vs.bookLayout(level)) {
        const keys = vs.bookSlotKeys(level, entry.book);
        const filled = keys.filter((slot) =>
          String((row && row.videos && row.videos[slot]) || "").trim(),
        ).length;
        if (filled) filledBooks += 1;
        lines.push(
          [
            vs.bookQrName(level, month, entry.book),
            vs.levelLabel(level),
            vs.monthNumber(month),
            entry.book,
            vs.bookTitle(level, entry.book, row && row.labels),
            args.host + vs.bookQrPath(level, month, entry.book),
            vs.coverAssetPath(level, month, entry.book),
            `${filled}/${keys.length}`,
          ]
            .map(csvField)
            .join(","),
        );
      }
    }
  }

  const out = path.resolve(root, args.out);
  mkdirSync(path.dirname(out), { recursive: true });
  // BOM + CRLF so Excel opens it as UTF-8 (titles may contain "·").
  writeFileSync(out, `﻿${lines.join("\r\n")}\r\n`, "utf8");
  writeFileSync(path.join(path.dirname(out), "README-naver-qr.txt"), MEMO);

  const total = lines.length - 1;
  console.log(`Wrote ${total} rows to ${path.relative(root, out)}`);
  if (!args.offline)
    console.log(`Books with at least one video: ${filledBooks}/${total}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
