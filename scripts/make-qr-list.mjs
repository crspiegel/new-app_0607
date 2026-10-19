// Builds the list typed into Naver QR: one row per Beginner slot (24 slots x
// 10 months = 240), each with the student-page URL the QR code should open.
// No QR images are made here — Naver QR does that, and its codes can be
// re-pointed later, which is why the printed books survive a domain change.
//
//   npm run qr:list                      -> qr/beginner-qr-list.csv (+ memo)
//   node scripts/make-qr-list.mjs --offline --out <file>   (no REST read)
//   --host https://play.tps-education.com   (default www.cambridgereading.com)
//   --solo                                  (adds ?solo=1 = player-only mode)
//
// Online it makes ONE read of content_pages (Beginner rows, JSON only — no
// Storage) to fill in each slot's current video URL. That column is a
// snapshot for checking; the student page always reads the live value.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";

const LEVEL = "Level 1"; // Beginner — the only level with printed QR codes
const HEADER = [
  "qr_name",
  "level",
  "month",
  "slot",
  "label",
  "student_url",
  "current_video_url",
];
const root = process.cwd();

function parseArgs(argv) {
  const args = {
    offline: false,
    solo: false,
    host: "https://www.cambridgereading.com",
    out: "qr/beginner-qr-list.csv",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--offline") args.offline = true;
    else if (arg === "--solo") args.solo = true;
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
    "({ months, allSlotKeys, levelLabel, monthNumber, qrLevelCode, qrPath, slotTitle })",
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

async function fetchRowsByMonth() {
  const { url, key } = supabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/content_pages?level=eq.${encodeURIComponent(LEVEL)}` +
      "&select=month,videos,labels",
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!response.ok) throw new Error(`content_pages: HTTP ${response.status}`);
  const rows = await response.json();
  return Object.fromEntries(rows.map((row) => [row.month, row]));
}

function csvField(value) {
  const str = String(value == null ? "" : value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const MEMO = `네이버 QR 등록 메모 — Beginner QR (make-qr-list.mjs가 만든 파일)

- 한 줄 = QR 1개. qr_name을 네이버 QR의 코드 이름으로, student_url을 연결 주소로 넣는다.
- 연결 방식은 "링크로 바로 이동"(중간 안내 페이지 없음)인지 확인한다.
- 학생 페이지 호스트가 최종 확정된 뒤 한 번에 등록하는 것이 가장 싸다.
  호스트가 바뀌면 이 스크립트를 --host로 다시 돌려 네이버 QR의 연결 주소만 바꾼다
  (인쇄된 QR 이미지는 그대로).
- 240개가 네이버 계정 하나에 묶이므로 개인 계정이 아닌 TPS 공용 계정을 권장한다.
- 인쇄: 20mm 이상, 단색(검정 코드 + 흰 배경), 여백 유지. 시험 인쇄 후
  아이폰·안드로이드(저가폰 포함) 기본 카메라로 스캔해 확인한다.
- current_video_url은 만든 시점의 스냅샷이다. 빈 칸도 QR은 발행한다
  (학생 페이지가 Coming soon을 보여 주고, 나중에 관리자 화면에서 채우면 바로 반영된다).
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const vs = loadVideoSource();
  const rowsByMonth = args.offline ? {} : await fetchRowsByMonth();
  const prefix = vs.qrLevelCode(LEVEL).toUpperCase();

  const lines = [HEADER.join(",")];
  let filled = 0;
  for (const month of vs.months) {
    const number = vs.monthNumber(month);
    const row = rowsByMonth[month];
    for (const slot of vs.allSlotKeys(LEVEL)) {
      const current = String((row && row.videos && row.videos[slot]) || "");
      if (current.trim()) filled += 1;
      const name = `${prefix}-${String(number).padStart(2, "0")}-${slot.toUpperCase()}`;
      const studentUrl =
        args.host +
        vs.qrPath(LEVEL, month, slot) +
        (args.solo ? "?solo=1" : "");
      lines.push(
        [
          name,
          vs.levelLabel(LEVEL),
          number,
          slot,
          vs.slotTitle(LEVEL, slot, row && row.labels),
          studentUrl,
          current.trim(),
        ]
          .map(csvField)
          .join(","),
      );
    }
  }

  const out = path.resolve(root, args.out);
  mkdirSync(path.dirname(out), { recursive: true });
  // BOM + CRLF so Excel opens it as UTF-8 (the labels contain "·").
  writeFileSync(out, `﻿${lines.join("\r\n")}\r\n`, "utf8");
  writeFileSync(path.join(path.dirname(out), "README-naver-qr.txt"), MEMO);

  const total = lines.length - 1;
  console.log(`Wrote ${total} rows to ${path.relative(root, out)}`);
  if (!args.offline) console.log(`Filled slots: ${filled}/${total}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
