/* 일괄 등록 (Phase 3.4 — spec §4.5, 3B-3): the bulk view of the admin screen.
   Two boxes: ① 회원 일괄 등록 (rpc lms_bulk_create_members) and ② 반 배정
   (rpc lms_bulk_assign). Each: template download · a file (picked or dropped)
   · a preview checked here first (rules, rights, blanks, repeats) and then by
   the server (lms_check_login_ids) · one run · the result table.

   Classic script after lms-admin.js (one shared global scope): it uses that
   file's helpers (lmsAdmin, loadLmsData, lmsRpc, makeTable, makeCell,
   primaryCell, setText, fillSelect, byText, ROLE_LABELS) and adminRole /
   adminViewOpeners / sb from app.js. Every name here starts with bulk / BULK.

   The spreadsheet library (SheetJS Community Edition, a copy in vendor/ —
   D48, no CDN) loads only when this view opens. A password stays in memory
   from reading the file to the one run, is never put on the page (the
   preview shows ●●●●) or in the console, and is dropped after the run. One
   run = one transaction on the server: one bad row → nothing is kept. */

/* exported BULK_MAX_ROWS */

// Rows per member file. Every row costs one bcrypt on the server, and the call
// has to end inside Supabase's statement limit — 3 s for branch accounts and
// teachers (anon), 8 s for the top admin. Measured on PostgreSQL 18 (3B-3,
// M3): ~3.5 ms per row → 100 rows ≈ 0.35 s, room for a slower server. A larger
// file is refused (split it) — never sent in parts.
const BULK_MAX_ROWS = 100;
// Rows per class-assignment file: no bcrypt, so the server's own limit.
const BULK_ASSIGN_MAX_ROWS = 500;
const BULK_MAX_BYTES = 1024 * 1024;
const BULK_SHEETJS_SRC = "vendor/xlsx-0.20.3.full.min.js";
const BULK_ID_RE = /^[0-9a-z가-힣._-]{2,20}$/; // D44 (lms_id_rule_ok)
const BULK_PW_RE = /^[!-~]{4,10}$/; // D44 (lms_pw_rule_ok)
const BULK_PW_MASK = "●●●●";
const BULK_ROLES = { 선생님: 2, 학생: 3 };
const BULK_EXAMPLE = { id: "kim01", password: "0123", name: "김민준(예시)" };
const BULK_ASSIGN_EXAMPLE = { klass: "햇살반(예시)", id: "kim01" };
const BULK_TEXT_FORMAT = "셀 서식을 '텍스트'로 바꿔 다시 입력해 주세요.";

// What the server's row reasons mean (lms_bulk_*).
const BULK_REASONS = {
  role: "그 역할은 만들 수 없어요.",
  branch: "없는 지사예요.",
  class: "그 지사에 없는 반이에요.",
  class_not_allowed: "내 반이 아니에요.",
  not_student: "반에는 학생만 넣을 수 있어요.",
  login_id: "아이디 규칙에 맞지 않아요.",
  password: "비밀번호 규칙에 맞지 않아요.",
  display_name: "이름은 40자까지 쓸 수 있어요.",
  duplicate: "이미 있는 아이디예요.",
  member: "그 지사에 없는 아이디예요.",
  in_other_class:
    "다른 선생님 반 학생이에요 — 지사 계정·최고관리자만 옮길 수 있어요.",
  duplicate_row: "같은 학생이 다른 반으로 또 나와요.",
};

const bulkEl = (id) => document.getElementById(id);
const bulkStatus = bulkEl("bulkStatus");
const bulkAutoRow = bulkEl("bulkAutoRow");
const bulkAutoSuffix = bulkEl("bulkAutoSuffix");
const bulkAssignBranchRow = bulkEl("bulkAssignBranchRow");
const bulkAssignBranch = bulkEl("bulkAssignBranch");

// One box each: its elements and what it holds between preview and run.
function bulkBox(prefix) {
  return {
    hint: bulkEl(`${prefix}Hint`),
    template: bulkEl(`${prefix}Template`),
    drop: bulkEl(`${prefix}Drop`),
    file: bulkEl(`${prefix}File`),
    fileName: bulkEl(`${prefix}FileName`),
    msg: bulkEl(`${prefix}Msg`),
    summary: bulkEl(`${prefix}Summary`),
    preview: bulkEl(`${prefix}Preview`),
    run: bulkEl(`${prefix}Run`),
    result: bulkEl(`${prefix}Result`),
    runLabel: (bulkEl(`${prefix}Run`) || {}).textContent?.trim() || "",
    rows: [], // the checked rows (members: with their passwords)
    busy: false,
    load: 0, // a newer file replaces an older one still being read
  };
}
const bulkMembers = bulkBox("bulkMembers");
const bulkAssign = bulkBox("bulkAssign");

/* ---- the library (lazy) ----------------------------------------------- */

let bulkSheetJsLoad = null;
function bulkLoadSheetJs() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!bulkSheetJsLoad) {
    bulkSheetJsLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = BULK_SHEETJS_SRC;
      script.id = "bulkSheetJs";
      script.onload = () =>
        window.XLSX ? resolve(window.XLSX) : reject(new Error("XLSX"));
      script.onerror = () => {
        bulkSheetJsLoad = null; // try again next time
        script.remove();
        reject(new Error("load"));
      };
      document.head.append(script);
    });
  }
  return bulkSheetJsLoad;
}

async function bulkSheetJs() {
  try {
    return await bulkLoadSheetJs();
  } catch {
    setText(
      bulkStatus,
      "엑셀 도구를 불러오지 못했어요. 새로고침한 뒤 다시 해 주세요.",
    );
    return null;
  }
}

/* ---- small helpers ----------------------------------------------------- */

// lms_norm_id: NFC → trim → lower case.
const bulkNormId = (text) => String(text).normalize("NFC").trim().toLowerCase();
const bulkRole = () => adminRole();
const bulkIsTop = () => bulkRole() === "admin";

// The caller's own branch (an LMS caller reads only its own row).
function bulkOwnBranchId() {
  return bulkIsTop() ? "" : (lmsAdmin.branches[0] || {}).id || "";
}

function bulkFindBranch(text) {
  const t = String(text).trim();
  const lower = t.toLowerCase();
  return lmsAdmin.branches.find(
    (b) => b.name === t || String(b.code).toLowerCase() === lower,
  );
}

function bulkFindClass(branchId, name) {
  return lmsAdmin.classes.find(
    (k) => k.branch_id === branchId && k.name === String(name).trim(),
  );
}

function bulkResetBox(box, { keepMessage = false } = {}) {
  box.rows = [];
  box.load += 1;
  if (box.preview) {
    box.preview.replaceChildren();
    box.preview.hidden = true;
  }
  if (box.summary) box.summary.hidden = true;
  if (box.run) {
    box.run.disabled = true;
    box.run.textContent = box.runLabel;
  }
  if (!keepMessage) bulkSay(box, "");
  if (box === bulkMembers && bulkAutoRow) {
    bulkAutoRow.hidden = true;
    if (bulkAutoSuffix) bulkAutoSuffix.checked = false;
  }
}

// A box's message line: what went wrong in the admin error colour (the
// default), progress / success / a choice to make in the usual one.
function bulkSay(box, text, tone = "error") {
  setText(box.msg, text);
  if (box.msg) {
    box.msg.classList.toggle("is-error", Boolean(text) && tone === "error");
  }
}

function bulkClearResult(box) {
  if (!box.result) return;
  box.result.replaceChildren();
  box.result.hidden = true;
}

function bulkBadge(kind, text) {
  const badge = document.createElement("span");
  badge.className = `adm-badge bulk-badge is-${kind}`;
  badge.textContent = text;
  return badge;
}

function bulkNote(text) {
  const note = document.createElement("span");
  note.className = "bulk-note";
  note.textContent = text;
  return note;
}

// The bulk tables (previews and results): 행 first and narrow, then the ID
// with the row's state under it, then the rest; widths in the CSS
// (.bulk-grid, PC only). Rows are built ID-first like the other list tables
// (makeTable marks the first column primary), so the 행 cells move to the
// front here; on phones the ID block still comes first (CSS order).
function bulkTable(columns, body) {
  const order = ["행", ...columns.filter((c) => c !== "행")];
  body.querySelectorAll("tr").forEach((tr) => {
    const line = tr.querySelector('td[data-colname="행"]');
    if (line) tr.prepend(line);
  });
  const table = makeTable(order, [body], "");
  table.classList.add("bulk-grid");
  table.querySelectorAll("thead th").forEach((th, i) => {
    th.classList.toggle("adm-col-primary", order[i] === "아이디");
    th.dataset.col = order[i];
  });
  return table;
}

// A preview row's title: the ID as it will be stored, or — for a row with an
// error — as it was typed, so it is easy to find in the file.
const bulkRowTitle = (r) =>
  r.errors.length ? r.idText || "(빈 칸)" : r.loginId;

// First column: the ID, then the row's state under it (all widths — on a
// phone the other columns fold away, this line stays).
function bulkPrimary(title, kind, badgeText, noteText) {
  const { td } = primaryCell("아이디", title, []);
  const line = document.createElement("div");
  line.className = "bulk-state";
  line.append(bulkBadge(kind, badgeText));
  if (noteText) line.append(bulkNote(noteText));
  td.append(line);
  return td;
}

/* ---- reading a file ---------------------------------------------------- */

// What a cell shows: text cells as they are, anything else as Excel shows
// it (w). numeric = not a text cell (an ID or password typed into a
// "General" cell — 0123 has already become 123).
function bulkCell(ws, XLSX, r, c) {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return { text: "", numeric: false };
  let text = "";
  if (cell.t === "s") text = String(cell.v ?? "");
  else if (cell.w != null) text = String(cell.w);
  else if (cell.v != null) text = String(cell.v);
  return { text, numeric: cell.t !== "s" && cell.t !== "z" && text !== "" };
}

// The first sheet: find the header line (top 5 rows) by its column names,
// then every non-empty line under it. columns: [{ key, label, required }].
function bulkReadSheet(XLSX, buffer, columns) {
  const wb = XLSX.read(buffer, {
    type: "array",
    sheets: 0,
    cellFormula: false,
    cellHTML: false,
  });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws["!ref"]) return { error: "빈 파일이에요." };
  const range = XLSX.utils.decode_range(ws["!ref"]);
  let header = -1;
  let found = null;
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 4); r += 1) {
    const cols = {};
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const label = bulkCell(ws, XLSX, r, c).text.replace(/\s+/g, "");
      const col = columns.find((k) => label.startsWith(k.label));
      if (col && !(col.key in cols)) cols[col.key] = c;
    }
    if (columns.filter((k) => k.required).every((k) => k.key in cols)) {
      header = r;
      found = cols;
      break;
    }
  }
  if (header < 0) {
    const names = columns
      .filter((k) => k.required)
      .map((k) => k.label)
      .join("·");
    return {
      error: `열 이름(${names})을 찾지 못했어요. 템플릿을 내려받아 써 주세요.`,
    };
  }
  const rows = [];
  for (let r = header + 1; r <= range.e.r; r += 1) {
    const cells = {};
    let filled = false;
    columns.forEach((k) => {
      cells[k.key] =
        k.key in found
          ? bulkCell(ws, XLSX, r, found[k.key])
          : { text: "", numeric: false };
      if (cells[k.key].text.trim()) filled = true;
    });
    if (filled) rows.push({ line: r + 1, cells });
  }
  return { rows, columns: found };
}

// A file from the picker or a drop → the sheet's rows, or a message.
async function bulkReadFile(box, file, columns) {
  bulkResetBox(box);
  bulkClearResult(box);
  setText(box.fileName, file ? file.name : "");
  if (!file) return null;
  if (!/\.xlsx$/i.test(file.name)) {
    bulkSay(box, "엑셀 파일(.xlsx)만 올릴 수 있어요.");
    return null;
  }
  if (file.size > BULK_MAX_BYTES) {
    bulkSay(box, "파일이 1MB보다 커요. 나눠서 올려 주세요.");
    return null;
  }
  const load = box.load;
  const XLSX = await bulkSheetJs();
  if (!XLSX) return null;
  let sheet;
  try {
    sheet = bulkReadSheet(XLSX, await file.arrayBuffer(), columns);
  } catch {
    sheet = {
      error:
        "파일을 읽지 못했어요. 템플릿으로 만든 엑셀 파일인지 확인해 주세요.",
    };
  }
  if (load !== box.load) return null; // another file came meanwhile
  if (sheet.error) {
    bulkSay(box, sheet.error);
    return null;
  }
  return sheet;
}

function bulkTooMany(box, count, max) {
  if (count <= max) return false;
  bulkSay(
    box,
    `한 번에 ${max}행까지 올릴 수 있어요(이 파일 ${count}행). ${max}행씩 나눠 올려 주세요.`,
  );
  return true;
}

/* ---- templates ---------------------------------------------------------- */

function bulkMemberColumns() {
  const columns = [];
  if (bulkIsTop())
    columns.push({ key: "branch", label: "지사", required: true });
  columns.push(
    { key: "role", label: "역할", required: true },
    { key: "id", label: "아이디", required: true },
    { key: "password", label: "비밀번호", required: true },
    { key: "name", label: "이름", required: false },
    { key: "klass", label: "반", required: false },
  );
  return columns;
}

const BULK_ASSIGN_COLUMNS = [
  { key: "klass", label: "반", required: true },
  { key: "id", label: "아이디", required: true },
];

// A sheet: line 1 = how to fill it in, line 2 = the column names, line 3 =
// an example; the ID / password columns are text cells (format "@") down to
// the row limit, so Excel keeps 0123 as typed.
function bulkTemplateSheet(XLSX, note, head, example, textCols, rows, widths) {
  const ws = {};
  const put = (r, c, value, text) => {
    const cell = { t: "s", v: value };
    if (text) cell.z = "@";
    ws[XLSX.utils.encode_cell({ r, c })] = cell;
  };
  put(0, 0, note);
  head.forEach((label, c) => put(1, c, label));
  example.forEach((value, c) => put(2, c, value, textCols.includes(c)));
  for (let r = 3; r <= 2 + rows; r += 1) {
    textCols.forEach((c) => put(r, c, "", true));
  }
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: 2 + rows, c: head.length - 1 },
  });
  ws["!cols"] = widths.map((wch) => ({ wch }));
  return ws;
}

async function bulkDownloadMembersTemplate() {
  const XLSX = await bulkSheetJs();
  if (!XLSX) return;
  const isTop = bulkIsTop();
  const roleHead =
    bulkRole() === "teacher" ? "역할(학생)" : "역할(선생님/학생)";
  const head = [roleHead, "아이디", "비밀번호", "이름", "반(선택)"];
  const example = [
    "학생",
    BULK_EXAMPLE.id,
    BULK_EXAMPLE.password,
    BULK_EXAMPLE.name,
    "",
  ];
  const widths = [16, 16, 14, 16, 16];
  if (isTop) {
    head.unshift("지사");
    example.unshift((lmsAdmin.branches[0] || {}).name || "지사 이름");
    widths.unshift(16);
  }
  const idCol = head.indexOf("아이디");
  const note =
    `※ 3행은 예시예요(그대로 두면 건너뜁니다). 4행부터 한 줄에 한 명씩, 한 번에 ${BULK_MAX_ROWS}명까지 적어 주세요. ` +
    "아이디·비밀번호 칸은 '텍스트' 서식이라 0으로 시작해도 그대로 저장돼요. " +
    "아이디 2~20자(한글·영문 소문자·숫자·. _ -), 비밀번호 4~10자(띄어쓰기 없이). 반은 학생만, 비워도 돼요.";
  const ws = bulkTemplateSheet(
    XLSX,
    note,
    head,
    example,
    [idCol, idCol + 1],
    BULK_MAX_ROWS,
    widths,
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "회원");
  XLSX.writeFile(wb, "회원_일괄등록.xlsx", { compression: true });
}

async function bulkDownloadAssignTemplate() {
  const XLSX = await bulkSheetJs();
  if (!XLSX) return;
  const note = `※ 3행은 예시예요(그대로 두면 건너뜁니다). 4행부터 한 줄에 한 학생씩: 반 이름과 아이디. 한 번에 ${BULK_ASSIGN_MAX_ROWS}줄까지.`;
  const ws = bulkTemplateSheet(
    XLSX,
    note,
    ["반", "아이디"],
    [BULK_ASSIGN_EXAMPLE.klass, BULK_ASSIGN_EXAMPLE.id],
    [1],
    BULK_ASSIGN_MAX_ROWS,
    [20, 20],
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "반배정");
  XLSX.writeFile(wb, "반_배정.xlsx", { compression: true });
}

/* ---- ① members: check ----------------------------------------------- */

// Client checks (D44 rules, rights, blanks, repeats in the file). Each row:
// { line, branchId, role, idText, loginId, password, name, klass, errors }.
function bulkCheckMembers(sheetRows) {
  const isTop = bulkIsTop();
  const role = bulkRole();
  const own = bulkOwnBranchId();
  const seen = new Map();
  return sheetRows.map(({ line, cells }) => {
    const errors = [];
    const row = {
      line,
      branchId: own,
      branchText: cells.branch ? cells.branch.text.trim() : "",
      roleText: cells.role.text.trim(),
      role: BULK_ROLES[cells.role.text.trim()] || 0,
      idText: cells.id.numeric ? cells.id.text : cells.id.text.trim(),
      loginId: bulkNormId(cells.id.text),
      password: cells.password.numeric ? "" : cells.password.text,
      name: cells.name.text.trim(),
      klass: cells.klass.text.trim(),
      errors,
    };
    if (isTop) {
      const branch = row.branchText ? bulkFindBranch(row.branchText) : null;
      if (!row.branchText) errors.push("지사를 적어 주세요.");
      else if (!branch) errors.push("없는 지사예요.");
      row.branchId = branch ? branch.id : "";
    }
    if (!row.roleText) errors.push("역할을 적어 주세요.");
    else if (!row.role)
      errors.push("역할은 '선생님' 또는 '학생'으로 적어 주세요.");
    else if (role === "teacher" && row.role !== 3) {
      errors.push("선생님은 학생만 만들 수 있어요.");
    }
    if (cells.id.numeric)
      errors.push(`아이디 칸이 숫자예요. ${BULK_TEXT_FORMAT}`);
    else if (!row.loginId) errors.push("아이디를 적어 주세요.");
    else if (!BULK_ID_RE.test(row.loginId)) {
      errors.push(
        "아이디 규칙(2~20자, 한글·영문 소문자·숫자·. _ -)에 맞지 않아요.",
      );
    }
    if (cells.password.numeric) {
      errors.push(`비밀번호 칸이 숫자예요. ${BULK_TEXT_FORMAT}`);
    } else if (!row.password) errors.push("비밀번호를 적어 주세요.");
    else if (!BULK_PW_RE.test(row.password)) {
      errors.push(
        "비밀번호 규칙(4~10자, 띄어쓰기 없이 영문·숫자·기호)에 맞지 않아요.",
      );
    }
    if (row.name.length > 40) errors.push("이름은 40자까지 쓸 수 있어요.");
    if (row.klass) {
      const k = row.branchId ? bulkFindClass(row.branchId, row.klass) : null;
      if (row.role && row.role !== 3)
        errors.push("반은 학생만 정할 수 있어요.");
      else if (row.branchId && !k) errors.push("그 지사에 없는 반이에요.");
      else if (k && !lmsAdmin.managed.has(k.id))
        errors.push("내 반이 아니에요.");
    }
    if (row.loginId && !cells.id.numeric) {
      const key = `${row.branchId}|${row.loginId}`;
      if (seen.has(key)) {
        errors.push(`파일 안에 같은 아이디가 있어요(${seen.get(key)}행).`);
      } else seen.set(key, line);
    }
    return row;
  });
}

// The server's answer for the rows that passed here: one call per branch
// (one for an LMS caller; the top admin's file may name several branches).
// p_role 3: for students and teachers the server answers the same (D44 —
// only a branch-account ID differs, and the bulk RPC makes none).
async function bulkCheckIds(rows) {
  const byBranch = new Map();
  rows
    .filter((r) => !r.errors.length)
    .forEach((r) => {
      if (!byBranch.has(r.branchId)) byBranch.set(r.branchId, []);
      byBranch.get(r.branchId).push(r);
    });
  const answers = await Promise.all(
    [...byBranch.entries()].map(async ([branchId, list]) => {
      const args = { p_ids: list.map((r) => r.loginId), p_role: 3 };
      if (bulkIsTop()) args.p_branch_id = branchId;
      const { data, message } = await lmsRpc("lms_check_login_ids", args);
      if (message || !Array.isArray(data)) return false;
      list.forEach((r, i) => {
        const a = data[i] || {};
        if (a.status === "duplicate") {
          r.duplicate = true;
          r.suggestion = a.suggestion || "";
          if (!r.suggestion)
            r.errors.push("이미 있는 아이디예요(제안할 아이디 없음).");
        } else if (a.status !== "ok") {
          r.errors.push("아이디 규칙에 맞지 않아요.");
        }
      });
      return true;
    }),
  );
  return answers.every(Boolean);
}

function bulkMemberState(r) {
  if (r.errors.length) return ["error", "오류", r.errors.join(" ")];
  if (r.duplicate) {
    return bulkAutoSuffix && bulkAutoSuffix.checked
      ? ["dup", "중복", `'${r.suggestion}'(으)로 만들어요`]
      : ["dup", "중복", `제안 아이디: ${r.suggestion}`];
  }
  return ["new", "신규", ""];
}

function bulkRenderMembersPreview() {
  const box = bulkMembers;
  const isTop = bulkIsTop();
  const columns = ["아이디", "행", "비밀번호", "이름", "역할"];
  if (isTop) columns.push("지사");
  columns.push("반");
  const body = document.createElement("tbody");
  box.rows.forEach((r) => {
    const [kind, badge, note] = bulkMemberState(r);
    const tr = document.createElement("tr");
    tr.className = "bulk-row";
    tr.dataset.state = kind;
    const pw = document.createElement("span");
    pw.className = "bulk-pw";
    pw.textContent = r.password ? BULK_PW_MASK : "—";
    tr.append(
      bulkPrimary(bulkRowTitle(r), kind, badge, note),
      makeCell("행", `${r.line}행`),
      makeCell("비밀번호", pw),
      makeCell("이름", r.name || "—"),
      makeCell("역할", r.roleText || "—"),
    );
    if (isTop) tr.append(makeCell("지사", r.branchText || "—"));
    tr.append(makeCell("반", r.klass || "—"));
    body.append(tr);
  });
  box.preview.replaceChildren(bulkTable(columns, body));
  box.preview.hidden = false;
  bulkUpdateMembersRun();
}

function bulkUpdateMembersRun() {
  const box = bulkMembers;
  const errors = box.rows.filter((r) => r.errors.length).length;
  const dups = box.rows.filter((r) => !r.errors.length && r.duplicate).length;
  const fresh = box.rows.length - errors - dups;
  const auto = Boolean(bulkAutoSuffix && bulkAutoSuffix.checked);
  setText(
    box.summary,
    `전체 ${box.rows.length}행 — 신규 ${fresh} · 중복 ${dups} · 오류 ${errors}`,
  );
  box.summary.hidden = !box.rows.length;
  if (bulkAutoRow) bulkAutoRow.hidden = !dups;
  const ready = box.rows.length > 0 && !errors && (!dups || auto) && !box.busy;
  box.run.disabled = !ready;
  box.run.textContent = ready ? `${box.rows.length}명 등록 실행` : "등록 실행";
  if (errors) {
    bulkSay(
      box,
      "오류가 있는 행을 고친 뒤 파일을 다시 올려 주세요. (한 행이라도 오류면 실행할 수 없어요)",
    );
  } else if (dups && !auto) {
    bulkSay(
      box,
      "이미 있는 아이디가 있어요. 아래 '자동으로 바꿔 만들기'를 켜거나 파일을 고쳐 주세요.",
      "info",
    );
  } else bulkSay(box, "");
}

async function bulkOpenMembersFile(file) {
  const box = bulkMembers;
  const sheet = await bulkReadFile(box, file, bulkMemberColumns());
  if (!sheet) return;
  const load = box.load;
  const rows = sheet.rows.filter(
    ({ cells }) =>
      !(
        cells.id.text.trim() === BULK_EXAMPLE.id &&
        cells.password.text === BULK_EXAMPLE.password &&
        cells.name.text.trim() === BULK_EXAMPLE.name
      ),
  );
  if (!rows.length) {
    bulkSay(box, "적힌 회원이 없어요. 4행부터 한 줄에 한 명씩 적어 주세요.");
    return;
  }
  if (bulkTooMany(box, rows.length, BULK_MAX_ROWS)) return;
  bulkSay(box, "확인하는 중…", "info");
  if (!(await loadLmsData())) {
    bulkSay(box, LMS_MSG.loadFailed);
    return;
  }
  const checked = bulkCheckMembers(rows);
  const ok = await bulkCheckIds(checked);
  if (load !== box.load) return;
  if (!ok) {
    bulkSay(box, "아이디 중복 확인을 하지 못했어요. 잠시 후 다시 해 주세요.");
    return;
  }
  box.rows = checked;
  bulkRenderMembersPreview();
}

/* ---- ① members: run ----------------------------------------------------- */

function bulkRpcFailure(error) {
  if (!error) return LMS_MSG.failed;
  if (error.code === "42501") return LMS_MSG.denied;
  if (error.code === "57014") {
    return "시간이 너무 걸려 멈췄어요(아무것도 바뀌지 않았어요). 행 수를 줄여 나눠 올려 주세요.";
  }
  if (error.code === "40P01") {
    return "다른 작업과 겹쳐 멈췄어요(아무것도 바뀌지 않았어요). 다시 실행해 주세요.";
  }
  return LMS_MSG.failed;
}

async function bulkRunMembers() {
  const box = bulkMembers;
  if (box.busy || !box.rows.length) return;
  const isTop = bulkIsTop();
  const sentRows = box.rows;
  const payload = sentRows.map((r) => {
    const row = { login_id: r.loginId, password: r.password, role: r.role };
    if (r.name) row.display_name = r.name;
    if (r.klass) row.class = r.klass;
    if (isTop) row.branch_id = r.branchId;
    return row;
  });
  const auto = Boolean(bulkAutoSuffix && bulkAutoSuffix.checked);
  box.busy = true;
  box.run.disabled = true;
  bulkSay(box, "등록하는 중…", "info");
  const { data, error } = sb
    ? await sb.rpc("lms_bulk_create_members", {
        p_rows: payload,
        p_auto_suffix: auto,
      })
    : { error: {} };
  box.busy = false;
  // The passwords leave memory now: the preview is replaced by the result.
  bulkResetBox(box, { keepMessage: true });
  if (box.file) box.file.value = "";
  setText(box.fileName, "");
  if (error || !data) {
    bulkSay(box, bulkRpcFailure(error));
    return;
  }
  if (data.status === "too_many") {
    bulkSay(box, `한 번에 ${data.limit}행까지예요. 나눠 올려 주세요.`);
    return;
  }
  if (data.status !== "ok" && data.status !== "error") {
    bulkSay(box, LMS_MSG.failed);
    return;
  }
  bulkRenderMembersResult(data, sentRows);
  if (data.status === "ok") {
    const changed = (data.rows || []).filter(
      (a) => a.login_id !== (sentRows[a.row - 1] || {}).loginId,
    ).length;
    bulkSay(
      box,
      `${data.created}명을 만들었어요.` +
        (changed ? ` 아이디가 바뀐 ${changed}명은 표에 표시했어요.` : ""),
      "info",
    );
    await loadLmsData();
  } else {
    bulkSay(
      box,
      `오류가 있는 행(${data.errors}행)이 있어 아무것도 만들지 않았어요. 표를 보고 파일을 고쳐 다시 올려 주세요.`,
    );
  }
}

function bulkReasonText(a) {
  const text = BULK_REASONS[a.reason] || "만들 수 없어요.";
  return a.suggestion ? `${text} (제안: ${a.suggestion})` : text;
}

function bulkRenderMembersResult(data, sentRows) {
  const box = bulkMembers;
  const body = document.createElement("tbody");
  (data.rows || []).forEach((a) => {
    const sent = sentRows[a.row - 1] || {};
    const ok = a.result === "ok";
    const done = data.status === "ok";
    const tr = document.createElement("tr");
    tr.className = "bulk-result-row";
    tr.dataset.result = ok ? "ok" : "error";
    const td = bulkPrimary(
      a.login_id || sent.loginId || "—",
      ok ? (done ? "new" : "skip") : "error",
      ok ? (done ? "만들었어요" : "문제 없음") : "오류",
      ok ? (done ? "" : "(다른 행 오류로 만들지 않음)") : bulkReasonText(a),
    );
    if (ok && done && sent.loginId && a.login_id !== sent.loginId) {
      const changed = document.createElement("span");
      changed.className = "bulk-changed";
      changed.textContent = `아이디 바뀜: ${sent.loginId} → ${a.login_id}`;
      td.querySelector(".bulk-state").append(changed);
    }
    tr.append(
      td,
      makeCell("행", sent.line ? `${sent.line}행` : "—"),
      makeCell("역할", ROLE_LABELS[sent.role] || "—"),
      makeCell("반", sent.klass || "—"),
    );
    body.append(tr);
  });
  box.result.replaceChildren(bulkTable(["아이디", "행", "역할", "반"], body));
  box.result.hidden = false;
}

/* ---- ② class assignment ------------------------------------------------ */

function bulkAssignBranchId() {
  return bulkIsTop()
    ? bulkAssignBranch
      ? bulkAssignBranch.value
      : ""
    : bulkOwnBranchId();
}

// Client checks + what will happen to each student (the server decides again):
// add (no class yet / a second class for branch accounts and the admin) ·
// move (a teacher: out of its other classes, D56) · same (already there).
function bulkCheckAssign(sheetRows, branchId) {
  const role = bulkRole();
  const seen = new Map();
  return sheetRows.map(({ line, cells }) => {
    const errors = [];
    const row = {
      line,
      klass: cells.klass.text.trim(),
      idText: cells.id.numeric ? cells.id.text : cells.id.text.trim(),
      loginId: bulkNormId(cells.id.text),
      errors,
      kind: "add",
      note: "",
    };
    const k = row.klass ? bulkFindClass(branchId, row.klass) : null;
    if (!row.klass) errors.push("반을 적어 주세요.");
    else if (!k) errors.push("그 지사에 없는 반이에요.");
    else if (!lmsAdmin.managed.has(k.id)) errors.push("내 반이 아니에요.");
    let m = null;
    if (cells.id.numeric)
      errors.push(`아이디 칸이 숫자예요. ${BULK_TEXT_FORMAT}`);
    else if (!row.loginId) errors.push("아이디를 적어 주세요.");
    else {
      m = lmsAdmin.members.find(
        (x) => x.branch_id === branchId && String(x.login_id) === row.loginId,
      );
      if (!m) errors.push("그 지사에 없는 아이디예요.");
      else if (m.role !== 3) errors.push("반에는 학생만 넣을 수 있어요.");
      else if (seen.has(row.loginId)) {
        errors.push(
          `파일 안에 같은 아이디가 있어요(${seen.get(row.loginId)}행).`,
        );
      } else seen.set(row.loginId, line);
    }
    if (!errors.length && k && m) {
      const now = (m.class_ids || []).map(String);
      const others = now.filter((id) => id !== k.id);
      const names = others.map(className).filter(Boolean).join(", ");
      if (role === "teacher") {
        // the teacher sees only its own classes in class_ids (D45/D51)
        if (m.in_class && !now.length) errors.push(BULK_REASONS.in_other_class);
        else if (others.length) {
          row.kind = "move";
          row.note = `지금 ${names} → ${k.name}`;
        } else if (now.includes(k.id)) row.kind = "same";
      } else if (now.includes(k.id)) row.kind = "same";
      else if (others.length) row.note = `지금 반(${names})에도 그대로 남아요`;
    }
    return row;
  });
}

const BULK_ASSIGN_LABELS = { add: "배정", move: "옮기기", same: "이미 이 반" };

function bulkRenderAssignPreview() {
  const box = bulkAssign;
  const body = document.createElement("tbody");
  box.rows.forEach((r) => {
    const kind = r.errors.length ? "error" : r.kind;
    const tr = document.createElement("tr");
    tr.className = "bulk-row";
    tr.dataset.state = kind;
    tr.append(
      bulkPrimary(
        bulkRowTitle(r),
        kind === "error" ? "error" : kind === "same" ? "skip" : "new",
        kind === "error" ? "오류" : BULK_ASSIGN_LABELS[kind],
        kind === "error" ? r.errors.join(" ") : r.note,
      ),
      makeCell("행", `${r.line}행`),
      makeCell("반", r.klass || "—"),
    );
    body.append(tr);
  });
  box.preview.replaceChildren(bulkTable(["아이디", "행", "반"], body));
  box.preview.hidden = false;
  const errors = box.rows.filter((r) => r.errors.length).length;
  setText(
    box.summary,
    `전체 ${box.rows.length}행 — ` +
      Object.entries(BULK_ASSIGN_LABELS)
        .map(
          ([k, label]) =>
            `${label} ${box.rows.filter((r) => !r.errors.length && r.kind === k).length}`,
        )
        .join(" · ") +
      ` · 오류 ${errors}`,
  );
  box.summary.hidden = false;
  box.run.disabled = Boolean(errors) || box.busy;
  box.run.textContent = errors ? "배정 실행" : `${box.rows.length}줄 배정 실행`;
  bulkSay(
    box,
    errors
      ? "오류가 있는 행을 고친 뒤 파일을 다시 올려 주세요. (한 행이라도 오류면 실행할 수 없어요)"
      : "",
  );
}

async function bulkOpenAssignFile(file) {
  const box = bulkAssign;
  if (bulkIsTop() && !bulkAssignBranchId()) {
    bulkResetBox(box);
    bulkClearResult(box);
    if (box.file) box.file.value = "";
    bulkSay(box, "지사를 먼저 고르세요.");
    return;
  }
  const sheet = await bulkReadFile(box, file, BULK_ASSIGN_COLUMNS);
  if (!sheet) return;
  const load = box.load;
  const rows = sheet.rows.filter(
    ({ cells }) => cells.klass.text.trim() !== BULK_ASSIGN_EXAMPLE.klass,
  );
  if (!rows.length) {
    bulkSay(box, "적힌 줄이 없어요. 4행부터 한 줄에 한 학생씩 적어 주세요.");
    return;
  }
  if (bulkTooMany(box, rows.length, BULK_ASSIGN_MAX_ROWS)) return;
  bulkSay(box, "확인하는 중…", "info");
  if (!(await loadLmsData())) {
    bulkSay(box, LMS_MSG.loadFailed);
    return;
  }
  if (load !== box.load) return;
  box.rows = bulkCheckAssign(rows, bulkAssignBranchId());
  bulkRenderAssignPreview();
}

async function bulkRunAssign() {
  const box = bulkAssign;
  if (box.busy || !box.rows.length) return;
  const sentRows = box.rows;
  const args = {
    p_rows: sentRows.map((r) => ({ class: r.klass, login_id: r.loginId })),
  };
  if (bulkIsTop()) args.p_branch_id = bulkAssignBranchId();
  box.busy = true;
  box.run.disabled = true;
  bulkSay(box, "배정하는 중…", "info");
  const { data, error } = sb
    ? await sb.rpc("lms_bulk_assign", args)
    : { error: {} };
  box.busy = false;
  bulkResetBox(box, { keepMessage: true });
  if (box.file) box.file.value = "";
  setText(box.fileName, "");
  if (error || !data) {
    bulkSay(box, bulkRpcFailure(error));
    return;
  }
  if (data.status !== "ok" && data.status !== "error") {
    bulkSay(
      box,
      data.status === "too_many"
        ? `한 번에 ${data.limit}줄까지예요. 나눠 올려 주세요.`
        : LMS_MSG.failed,
    );
    return;
  }
  const body = document.createElement("tbody");
  (data.rows || []).forEach((a) => {
    const sent = sentRows[a.row - 1] || {};
    const ok = a.result === "ok";
    const done = data.status === "ok";
    const tr = document.createElement("tr");
    tr.className = "bulk-result-row";
    tr.dataset.result = ok ? "ok" : "error";
    tr.append(
      bulkPrimary(
        a.login_id || sent.loginId || "—",
        ok ? (done ? "new" : "skip") : "error",
        ok ? (done ? "반영했어요" : "문제 없음") : "오류",
        ok ? (done ? "" : "(다른 행 오류로 바꾸지 않음)") : bulkReasonText(a),
      ),
      makeCell("행", sent.line ? `${sent.line}행` : "—"),
      makeCell("반", a.class || sent.klass || "—"),
    );
    body.append(tr);
  });
  box.result.replaceChildren(bulkTable(["아이디", "행", "반"], body));
  box.result.hidden = false;
  if (data.status === "ok") {
    bulkSay(box, `${data.assigned}명의 반을 정했어요.`, "info");
    await loadLmsData();
  } else {
    bulkSay(
      box,
      `오류가 있는 행(${data.errors}행)이 있어 아무것도 바꾸지 않았어요. 표를 보고 파일을 고쳐 다시 올려 주세요.`,
    );
  }
}

/* ---- the view ------------------------------------------------------------ */

function bulkPrepareView() {
  const role = bulkRole();
  setText(
    bulkMembers.hint,
    (role === "teacher"
      ? "선생님은 학생만 만들 수 있고, 반은 내 반만 적을 수 있어요. "
      : role === "branch"
        ? "우리 지사의 선생님·학생을 만들어요. "
        : "지사 열에 지사 이름을 적어요. 선생님·학생을 만들 수 있어요. ") +
      `템플릿에 적어 올리면 미리 확인한 뒤 한 번에 만들어요. 한 번에 ${BULK_MAX_ROWS}명까지, 한 행이라도 틀리면 아무것도 만들지 않아요.`,
  );
  setText(
    bulkAssign.hint,
    (role === "teacher"
      ? "내 반에만 넣을 수 있어요. 내 다른 반 학생은 옮겨지고, 다른 선생님 반 학생은 지사 계정·최고관리자만 옮길 수 있어요. "
      : "학생을 반에 넣어요. 이미 다른 반에 있는 학생은 그 반에도 그대로 남아요(옮기려면 반 화면에서). ") +
      `한 번에 ${BULK_ASSIGN_MAX_ROWS}줄까지, 한 줄이라도 틀리면 아무것도 바꾸지 않아요.`,
  );
  if (bulkAssignBranchRow) bulkAssignBranchRow.hidden = role !== "admin";
  if (role === "admin") {
    fillSelect(bulkAssignBranch, [
      ["", "지사 고르기"],
      ...lmsAdmin.branches.map((b) => [b.id, b.name]),
    ]);
  }
}

async function bulkOpenView() {
  // a fresh start each time: nothing (no password) is kept from before
  [bulkMembers, bulkAssign].forEach((box) => {
    bulkResetBox(box);
    bulkClearResult(box);
    if (box.file) box.file.value = "";
    setText(box.fileName, "");
  });
  setText(bulkStatus, "");
  bulkPrepareView();
  bulkSheetJs(); // load it now, so the template and the first file are quick
  if (!(await loadLmsData())) {
    setText(bulkStatus, LMS_MSG.loadFailed);
    return;
  }
  bulkPrepareView();
}

// A file box: pick (the input inside the label) or drop.
function bulkWireDrop(box, open) {
  if (box.file) {
    box.file.addEventListener("change", () => open(box.file.files[0]));
  }
  if (!box.drop) return;
  box.drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    box.drop.classList.add("is-over");
  });
  box.drop.addEventListener("dragleave", () =>
    box.drop.classList.remove("is-over"),
  );
  box.drop.addEventListener("drop", (event) => {
    event.preventDefault();
    box.drop.classList.remove("is-over");
    const file = event.dataTransfer && event.dataTransfer.files[0];
    if (file) open(file);
  });
}

bulkWireDrop(bulkMembers, bulkOpenMembersFile);
bulkWireDrop(bulkAssign, bulkOpenAssignFile);
if (bulkMembers.template) {
  bulkMembers.template.addEventListener("click", bulkDownloadMembersTemplate);
}
if (bulkAssign.template) {
  bulkAssign.template.addEventListener("click", bulkDownloadAssignTemplate);
}
if (bulkMembers.run) bulkMembers.run.addEventListener("click", bulkRunMembers);
if (bulkAssign.run) bulkAssign.run.addEventListener("click", bulkRunAssign);
if (bulkAutoSuffix) {
  bulkAutoSuffix.addEventListener("change", () => {
    if (bulkMembers.rows.length) bulkRenderMembersPreview();
  });
}
if (bulkAssignBranch) {
  bulkAssignBranch.addEventListener("change", () => {
    bulkResetBox(bulkAssign);
    bulkClearResult(bulkAssign);
    if (bulkAssign.file) bulkAssign.file.value = "";
    setText(bulkAssign.fileName, "");
  });
}

adminViewOpeners.bulk = bulkOpenView;
