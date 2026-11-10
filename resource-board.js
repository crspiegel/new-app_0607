/* ==== 자료실 (resource board, 2026-11-03) — the teachers' screen ===========
   Loaded AFTER app.js and teacher-resources.js as a classic script, so it
   shares their top-level lexical scope (sb, state, isAdmin, siteFlags,
   canSeeBoard, showScreen, updateAdminUI, followDownload, driveDownloadUrl,
   resourceExt, RES_FUNCTION …) the way teacher-resources.js does.

   - The header's "Teacher / 교사자료실" button (H1-H5; shown by app.js
     updateAdminUI for the top admin and LMS branch / teacher accounts while
     the admin's switch is on) opens #board.
   - #board[?level=&cat=&q=&sort=&page=] = the list (B9): search, level chips
     (a level = that level + 공통), category chips, 전체 N개, 최신순 / 조회순,
     pinned first, 10 a page; a table on PCs, cards on phones.
   - #board/<post id>[?…] = a post (B10): its attachments — a file downloads
     through the Edge Function in this tab (as the teacher resources do), a
     Google Drive file downloads straight from Google in a new tab (F2, the
     D64 address); D81: two or more files also come as one ZIP (모두 받기 ·
     선택 받기, made in the browser) — then 이전 글 / 다음 글 in the same
     order as the list it came from, and 목록으로 back to it.
   - F1 (2026-11-04): this screen alone has its own face; #5 (2026-11-05):
     the top admin picks it — Korean and Latin apart (rbApplyFonts).
   The filters live in the address, so Back / reload keep them. Every answer
   comes from the board_list / board_post_get RPCs (supabase-js rpc = POST;
   the server decides who may see what and counts a view once a KST day).
   Students and visitors never get here: no button, and an address lands on
   the home page (the server answers them nothing anyway). The top admin may
   open it even while it is off (a preview, with a note). */

/* exported rbLevelTag, rbCategoryBadge, rbFormatSize, rbFileKind, rbSvg,
   rbFollowHash, rbApplyFonts */

// F1: Pretendard (SIL OFL 1.1), the variable font's dynamic subset, a pinned
// version from jsDelivr — fetched the first time the board opens (like the
// admin font, app.js ensureAdminFont), never for the other pages. The CSS
// holds 92 unicode-range pieces; the browser fetches only those the
// board's letters need. Scope: .board-screen in styles.css.
const RB_FONT_URL =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";

const RB_LEVEL_KEYS = ["beginner", "level-1", "level-2", "level-3"];
const RB_LEVEL_CHIPS = [
  { key: "", label: "전체" },
  { key: "beginner", label: "Beginner" },
  { key: "level-1", label: "Level 1" },
  { key: "level-2", label: "Level 2" },
  { key: "level-3", label: "Level 3" },
];
const RB_LEVEL_TEXT = {
  common: "공통",
  beginner: "Beginner",
  "level-1": "Level 1",
  "level-2": "Level 2",
  "level-3": "Level 3",
};
const RB_MSG = {
  listFailed: "자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
  postFailed: "자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
  missing: "이 자료는 지금 볼 수 없어요. 숨겨졌거나 지워졌을 수 있어요.",
  needLogin: "다시 로그인해 주세요.",
  off: "교사자료실이 지금은 닫혀 있어요.",
  notReady: "이 파일은 지금 받을 수 없어요.",
  // D82 (2026-11-08): the day's limit is 1,000 now — a safety stop only.
  limit: "오늘 내려받기가 너무 많아 잠시 막혔어요. 관리자에게 문의해 주세요.",
  failed: "내려받지 못했어요. 잠시 후 다시 시도해 주세요.",
};
// The function's refusals → what the teacher reads (anything else: failed).
const RB_STATUS_MSG = {
  401: "needLogin",
  403: "off",
  404: "notReady",
  429: "limit",
};

// File kinds: the icon's color and label, and the meta line's word.
const RB_KINDS = {
  pdf: { kind: "pdf", icon: "PDF", text: "PDF" },
  xlsx: { kind: "excel", icon: "XLS", text: "엑셀" },
  xls: { kind: "excel", icon: "XLS", text: "엑셀" },
  hwp: { kind: "hwp", icon: "HWP", text: "한글" },
  hwpx: { kind: "hwp", icon: "HWP", text: "한글" },
  pptx: { kind: "ppt", icon: "PPT", text: "파워포인트" },
  ppt: { kind: "ppt", icon: "PPT", text: "파워포인트" },
  jpg: { kind: "image", icon: "JPG", text: "JPG 이미지" },
  jpeg: { kind: "image", icon: "JPG", text: "JPG 이미지" },
  png: { kind: "image", icon: "PNG", text: "PNG 이미지" },
};
// Link kinds (F2 Drive; D80 2026-11-07 Google Sheets / Docs / Slides): the
// icon says what file arrives, `text` is the teacher's line, `admin` the
// editor's (two short lines). A Google file comes as Excel / Word /
// PowerPoint from Google's export address — always the latest version.
const RB_LINKS = {
  drive: {
    kind: "drive",
    icon: "LINK",
    text: "구글 드라이브 · 바로 받기",
    admin: ["구글 드라이브"],
  },
  gsheet: {
    kind: "excel",
    icon: "XLS",
    text: "구글 시트 · 엑셀로 받기",
    admin: ["구글 시트", "엑셀로 받기"],
    path: "spreadsheets",
    format: "xlsx",
  },
  gdoc: {
    kind: "word",
    icon: "DOC",
    text: "구글 문서 · 워드로 받기",
    admin: ["구글 문서", "워드로 받기"],
    path: "document",
    format: "docx",
  },
  gslides: {
    kind: "ppt",
    icon: "PPT",
    text: "구글 슬라이드 · 파워포인트로 받기",
    admin: ["구글 슬라이드", "PPT로 받기"],
    path: "presentation",
    format: "pptx",
  },
};
const RB_SVG_NS = "http://www.w3.org/2000/svg";
const RB_ICONS = {
  page: [
    "M7 3h8l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
    "M15 3v5h5",
  ],
  link: [
    "M14 4h6v6",
    "m20 4-9 9",
    "M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5",
  ],
  download: ["M12 4v11", "m7 10 5 5 5-5", "M5 20h14"],
  clip: [
    "M20.5 11.5 12 20a5 5 0 0 1-7.07-7.07l8.5-8.5a3.3 3.3 0 0 1 4.67 4.67l-8.5 8.5a1.65 1.65 0 0 1-2.33-2.33L15 7.6",
  ],
  eye: [
    "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z",
    "M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z",
  ],
  calendar: [
    "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
    "M4 10h16",
    "M8 3v4",
    "M16 3v4",
  ],
  pin: ["M9 3h6", "M10 3v6l-3 3v2h10v-2l-3-3V3", "M12 14v7"],
  up: ["m6 15 6-6 6 6"],
  down: ["m6 9 6 6 6-6"],
  left: ["m15 6-6 6 6 6"],
  right: ["m9 6 6 6-6 6"],
  folder: [
    "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  ],
  // D81: the ZIP box (모두 받기) and the note's (i)
  archive: [
    "M3 3h18a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
    "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8",
    "M10 12h4",
  ],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 16v-4", "M12 8h.01"],
  // D85: the admin list's [⋯] (three dots, drawn with a wide round line)
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
};

const boardListView = document.querySelector("#boardListView");
const boardDetailView = document.querySelector("#boardDetailView");
const boardAdminNote = document.querySelector("#boardAdminNote");
const boardSearchForm = document.querySelector("#boardSearchForm");
const boardSearch = document.querySelector("#boardSearch");
const boardLevelChips = document.querySelector("#boardLevelChips");
const boardCatChips = document.querySelector("#boardCatChips");
const boardCount = document.querySelector("#boardCount");
const boardSort = document.querySelector("#boardSort");
const boardRows = document.querySelector("#boardRows");
const boardEmpty = document.querySelector("#boardEmpty");
const boardPager = document.querySelector("#boardPager");
const boardStatus = document.querySelector("#boardStatus");
const boardCrumbs = document.querySelector("#boardCrumbs");
const boardPost = document.querySelector("#boardPost");
const boardNeighbors = document.querySelector("#boardNeighbors");
const boardDetailStatus = document.querySelector("#boardDetailStatus");
const boardBack = document.querySelector("#boardBack");
const teacherBoardBtn = document.querySelector("#teacherBoardBtn");

let rbLoad = 0; // bumped per open: a late answer for an older address is dropped
let rbCategories = []; // the last list answer's categories (chips, badges)
let rbQuery = rbDefaultQuery();

function rbDefaultQuery() {
  return { level: "", cat: null, q: "", sort: "new", page: 1 };
}

/* ---- Small builders ------------------------------------------------------ */

function rbSvg(className, name) {
  const svg = document.createElementNS(RB_SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  if (className) svg.setAttribute("class", className);
  (RB_ICONS[name] || []).forEach((d) => {
    const path = document.createElementNS(RB_SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  });
  return svg;
}

function rbEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

// Text a screen reader hears but nobody sees (e.g. "조회" before a number).
function rbHidden(text) {
  return rbEl("span", "bd-sr", text);
}

function rbLevelTag(level) {
  const key = RB_LEVEL_TEXT[level] ? level : "common";
  return rbEl("span", `bd-level lv-${key}`, RB_LEVEL_TEXT[key]);
}

function rbCategory(id) {
  return rbCategories.find((c) => Number(c.id) === Number(id)) || null;
}

function rbCategoryBadge(category, extraClass = "") {
  const color = category && category.color ? category.color : "gray";
  const badge = rbEl(
    "span",
    `bd-cat cat-${color}${extraClass ? ` ${extraClass}` : ""}`,
    category ? category.name : "분류 없음",
  );
  return badge;
}

function rbPinBadge() {
  const pin = rbEl("span", "bd-pin");
  pin.append(rbSvg("bd-pin-icon", "pin"), rbEl("span", "", "공지"));
  return pin;
}

function rbNewBadge() {
  return rbEl("span", "bd-new", "NEW");
}

// The post's date in Korea: { full: "2026-11-02", short: "11/02" }.
function rbDay(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { full: "", short: "" };
  const full = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return { full, short: `${full.slice(5, 7)}/${full.slice(8, 10)}` };
}

// The board's file sizes (the post page and the admin's file rows) = the
// 교사 자료실 rule (teacher-resources.js formatFileSize): up to 999KB in KB,
// from 1,000KB on in MB with one decimal ("1006KB" → "1.0MB").
function rbFormatSize(bytes) {
  return formatFileSize(bytes);
}

function rbFileKind(ext) {
  return (
    RB_KINDS[String(ext || "").toLowerCase()] || {
      kind: "file",
      icon: "FILE",
      text: "파일",
    }
  );
}

// A link attachment's kind → its RB_LINKS entry; a file (or anything
// unknown) → null.
function rbLinkInfo(kind) {
  return Object.prototype.hasOwnProperty.call(RB_LINKS, kind)
    ? RB_LINKS[kind]
    : null;
}

// Where a link's [내려받기] goes: Google's direct download (Drive, the D64
// address) or its export as .xlsx / .docx / .pptx (D80).
function rbLinkUrl(kind, id) {
  const link = rbLinkInfo(kind);
  if (!link) return "";
  if (!link.path) return driveDownloadUrl(id);
  return `https://docs.google.com/${link.path}/d/${encodeURIComponent(id)}/export?format=${link.format}`;
}

// R1: a long file name may wrap only after _ - . (or a space) — never in
// the middle of a word (CSS keep-all) — so a phone shows whole pieces.
// (A loop, not a look-behind regex: older iPhone Safari cannot parse those.)
function rbBreakable(name) {
  const frag = document.createDocumentFragment();
  let part = "";
  for (const ch of String(name || "")) {
    part += ch;
    if (ch === "_" || ch === "-" || ch === ".") {
      frag.append(part, document.createElement("wbr"));
      part = "";
    }
  }
  if (part) frag.append(part);
  return frag;
}

function rbAddStylesheet(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}
function rbEnsureFont() {
  rbAddStylesheet("boardFontLink", RB_FONT_URL);
}
// D77: 나눔스퀘어라운드's @font-face rules (Korean + its Latin alias) — a
// file of this site, added only when it is picked.
function rbEnsureNsrFont() {
  rbAddStylesheet("boardFontNsrLink", "nanum-square-round.css");
}

// #5 (2026-11-05): the picked faces (siteFlags.fontKo / fontEn, app.js) onto
// an element that wears the board's font stack (#boardScreen, the admin's
// preview) — styles.css "#5" turns data-font-ko / data-font-en into the
// stack. Only the picked faces' CSS is added: Pretendard's Korean CSS
// (above) and, D77 (2026-11-06), nanum-square-round.css when 나눔스퀘어라운드
// is picked for either; the Latin Pretendard Std is a file in assets/fonts.
// The browser fetches a face's file only when the stack names it and a
// letter needs it.
function rbApplyFonts(el) {
  if (!el) return;
  el.dataset.fontKo = siteFlags.fontKo;
  el.dataset.fontEn = siteFlags.fontEn;
  if (siteFlags.fontKo === "pretendard") rbEnsureFont();
  if (siteFlags.fontKo === "nanum-square-round") rbEnsureNsrFont();
  if (siteFlags.fontEn === "nanum-square-round") rbEnsureNsrFont();
}

/* ---- The address -------------------------------------------------------- */

// "#board…" → { id, query } or null for any other address.
function rbParse(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  const match =
    /^board(?:\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?(?:\?(.*))?$/.exec(
      raw,
    );
  if (!match) return null;
  const params = new window.URLSearchParams(match[2] || "");
  const level = params.get("level");
  const cat = Number(params.get("cat"));
  const page = Number.parseInt(params.get("page"), 10);
  return {
    id: match[1] || null,
    query: {
      level: RB_LEVEL_KEYS.includes(level) ? level : "",
      cat: Number.isInteger(cat) && cat > 0 ? cat : null,
      q: (params.get("q") || "").trim().slice(0, 100),
      sort: params.get("sort") === "views" ? "views" : "new",
      page: Number.isInteger(page) && page > 1 ? page : 1,
    },
  };
}

function rbQueryString(query) {
  const params = new window.URLSearchParams();
  if (query.level) params.set("level", query.level);
  if (query.cat) params.set("cat", String(query.cat));
  if (query.q) params.set("q", query.q);
  if (query.sort === "views") params.set("sort", "views");
  if (query.page > 1) params.set("page", String(query.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

function rbListHash(query) {
  return `#board${rbQueryString(query)}`;
}

function rbPostHash(id, query) {
  return `#board/${id}${rbQueryString({ ...query, page: query.page })}`;
}

// A new address = a new history entry (Back returns to it); the same
// address = open it again.
function rbGo(hash) {
  if (window.location.hash === hash) {
    rbRoute();
    return;
  }
  window.location.hash = hash.slice(1);
}

function rbReplace(hash) {
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${hash}`,
  );
}

/* ---- Who may ------------------------------------------------------------- */

// The top admin always (a preview while it is off); branch / teacher
// accounts while it is on. Students and visitors: never.
function rbAllowed() {
  return isAdmin || canSeeBoard();
}

function rbHome() {
  rbZipCancel();
  rbReplace("");
  showScreen("home");
}

function rbShowView(view) {
  rbApplyFonts(document.querySelector("#boardScreen"));
  boardListView.hidden = view !== "list";
  boardDetailView.hidden = view !== "post";
  if (boardAdminNote) boardAdminNote.hidden = !(isAdmin && !siteFlags.board);
  if (document.body.dataset.screen !== "board") showScreen("board");
}

// The server says "off" (switched off since) or "denied" (signed out):
// leave, and let the header follow.
function rbClosed(status) {
  if (status === "off") {
    siteFlags.board = false;
    updateAdminUI();
  }
  rbHome();
}

/* ---- The list ------------------------------------------------------------ */

function rbChip(text, pressed, data) {
  const chip = rbEl("button", "bd-chip");
  chip.type = "button";
  chip.setAttribute("aria-pressed", String(pressed));
  Object.entries(data).forEach(([k, v]) => {
    chip.dataset[k] = v;
  });
  chip.append(...text);
  return chip;
}

function rbRenderLevelChips(query) {
  if (!boardLevelChips.childElementCount) {
    boardLevelChips.append(
      ...RB_LEVEL_CHIPS.map(({ key, label }) => {
        const parts = key ? [rbEl("span", `bd-dot lv-${key}`), label] : [label];
        return rbChip(parts, false, { level: key });
      }),
    );
  }
  boardLevelChips.querySelectorAll(".bd-chip").forEach((chip) => {
    chip.setAttribute(
      "aria-pressed",
      String(chip.dataset.level === query.level),
    );
  });
}

function rbRenderCatChips(query) {
  const wanted = ["", ...rbCategories.map((c) => String(c.id))].join(",");
  if (boardCatChips.dataset.ids !== wanted) {
    boardCatChips.dataset.ids = wanted;
    boardCatChips.replaceChildren(
      rbChip(["전체"], false, { cat: "" }),
      ...rbCategories.map((c) =>
        rbChip([c.name], false, { cat: String(c.id) }),
      ),
    );
  }
  boardCatChips.querySelectorAll(".bd-chip").forEach((chip) => {
    chip.setAttribute(
      "aria-pressed",
      String(chip.dataset.cat === (query.cat ? String(query.cat) : "")),
    );
  });
}

function rbRow(item, query) {
  const day = rbDay(item.created_at);
  const category = rbCategory(item.category);
  const li = document.createElement("li");
  const link = rbEl("a", `bd-row${item.pinned ? " is-pinned" : ""}`);
  link.href = rbPostHash(item.id, query);
  link.dataset.id = item.id;

  // PC: one table row — 분류 | [공지][레벨] 제목 📎n NEW | 등록일 | 조회
  const pc = rbEl("span", "bd-pc");
  const catCell = rbEl("span", "bd-c-cat");
  catCell.append(rbCategoryBadge(category));
  const main = rbEl("span", "bd-c-main");
  if (item.pinned) main.append(rbPinBadge());
  main.append(rbLevelTag(item.level), rbEl("span", "bd-t", item.title));
  if (item.files > 0) {
    const files = rbEl("span", "bd-files");
    files.append(
      rbSvg("bd-mini-icon", "clip"),
      rbHidden("첨부 "),
      `${item.files}`,
    );
    main.append(files);
  }
  if (item.is_new) main.append(rbNewBadge());
  const date = rbEl("span", "bd-c-date");
  date.append(rbHidden("등록일 "), day.short);
  const views = rbEl("span", "bd-c-views");
  views.append(rbHidden("조회 "), String(item.views));
  pc.append(catCell, main, date, views);

  // Phone: a card — tags / title / date · views · files
  const m = rbEl("span", "bd-m");
  const tags = rbEl("span", "bd-m-tags");
  if (item.pinned) tags.append(rbPinBadge());
  tags.append(rbCategoryBadge(category), rbLevelTag(item.level));
  if (item.is_new) tags.append(rbNewBadge());
  const meta = rbEl("span", "bd-m-meta");
  const mDate = rbEl("span", "bd-m-date");
  mDate.append(rbHidden("등록일 "), day.short);
  const mViews = rbEl("span", "bd-m-views");
  mViews.append(
    rbSvg("bd-mini-icon", "eye"),
    rbHidden("조회 "),
    String(item.views),
  );
  meta.append(mDate, mViews);
  if (item.files > 0) {
    const mFiles = rbEl("span", "bd-m-files");
    mFiles.append(
      rbSvg("bd-mini-icon", "clip"),
      rbHidden("첨부 "),
      String(item.files),
    );
    meta.append(mFiles);
  }
  m.append(tags, rbEl("span", "bd-m-title", item.title), meta);

  link.append(pc, m);
  li.append(link);
  return li;
}

// 1 2 3 4 5 … 8 — the pages near this one, the first and the last.
function rbPageNumbers(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const from = Math.max(1, Math.min(page - 2, pages - 4));
  const near = Array.from({ length: 5 }, (_, i) => from + i);
  const list = [];
  if (near[0] > 1) list.push(1, ...(near[0] > 2 ? ["…"] : []));
  list.push(...near);
  if (near[4] < pages) list.push(...(near[4] < pages - 1 ? ["…"] : []), pages);
  return list;
}

function rbRenderPager(page, pages, query) {
  boardPager.replaceChildren();
  if (pages <= 1) return;
  const link = (target, content, label, current = false) => {
    const a = rbEl("a", "bd-page");
    a.href = rbListHash({ ...query, page: target });
    if (label) a.setAttribute("aria-label", label);
    if (current) a.setAttribute("aria-current", "page");
    a.append(content);
    return a;
  };
  if (page > 1) {
    boardPager.append(link(page - 1, rbSvg("bd-page-icon", "left"), "이전 쪽"));
  }
  rbPageNumbers(page, pages).forEach((n) => {
    if (n === "…") boardPager.append(rbEl("span", "bd-page-gap", "…"));
    else boardPager.append(link(n, String(n), `${n}쪽`, n === page));
  });
  if (page < pages) {
    boardPager.append(
      link(page + 1, rbSvg("bd-page-icon", "right"), "다음 쪽"),
    );
  }
}

function rbRenderEmpty(query, total) {
  boardEmpty.replaceChildren();
  boardEmpty.hidden = total > 0;
  if (total > 0) return;
  const filtered = query.level || query.cat;
  if (query.q) {
    boardEmpty.append(
      rbEl("p", "bd-empty-title", `'${query.q}' 검색 결과가 없어요.`),
      rbEl("p", "bd-empty-sub", "다른 낱말로 찾아보거나 검색을 지워 보세요."),
    );
    const clear = rbEl("a", "bd-empty-btn", "검색 지우기");
    clear.href = rbListHash({ ...query, q: "", page: 1 });
    boardEmpty.append(clear);
  } else if (filtered) {
    boardEmpty.append(
      rbEl("p", "bd-empty-title", "이 조건에 맞는 자료가 없어요."),
    );
    const all = rbEl("a", "bd-empty-btn", "전체 보기");
    all.href = rbListHash(rbDefaultQuery());
    boardEmpty.append(all);
  } else {
    boardEmpty.append(
      rbEl("p", "bd-empty-title", "아직 올라온 자료가 없어요."),
      rbEl("p", "bd-empty-sub", "자료가 올라오면 여기에 보여요."),
    );
  }
}

async function rbOpenList(query, { scroll = false } = {}) {
  rbZipCancel();
  rbQuery = query;
  rbShowView("list");
  rbRenderLevelChips(query);
  rbRenderCatChips(query);
  if (document.activeElement !== boardSearch) boardSearch.value = query.q;
  boardSort.value = query.sort;
  boardStatus.textContent = "";
  boardListView.classList.add("is-loading");
  boardListView.setAttribute("aria-busy", "true");
  const load = (rbLoad += 1);
  const { data, error } = await sb.rpc("board_list", {
    p_level: query.level || null,
    p_category: query.cat,
    p_q: query.q || null,
    p_sort: query.sort,
    p_page: query.page,
  });
  if (load !== rbLoad) return;
  boardListView.classList.remove("is-loading");
  boardListView.removeAttribute("aria-busy");
  if (error || !data || typeof data !== "object") {
    boardRows.replaceChildren();
    boardEmpty.hidden = true;
    boardPager.replaceChildren();
    boardCount.textContent = "";
    boardStatus.textContent = RB_MSG.listFailed;
    return;
  }
  if (data.status !== "ok") {
    rbClosed(data.status);
    return;
  }
  rbCategories = Array.isArray(data.categories) ? data.categories : [];
  rbRenderCatChips(query);
  const total = Number(data.total) || 0;
  boardCount.replaceChildren("전체 ", rbEl("strong", "", String(total)), "개");
  const items = Array.isArray(data.items) ? data.items : [];
  // A page past the end showed the last page: say so in the address.
  if (data.page !== query.page) {
    rbQuery = { ...query, page: data.page };
    rbReplace(rbListHash(rbQuery));
  }
  boardRows.replaceChildren(...items.map((item) => rbRow(item, rbQuery)));
  rbRenderEmpty(query, total);
  rbRenderPager(data.page, data.pages, rbQuery);
  if (scroll) {
    boardListView.querySelector(".bd-meta").scrollIntoView({ block: "start" });
  }
}

/* ---- A post -------------------------------------------------------------- */

// `zip` (D81): the post offers the ZIP — a file row gets its check, a link
// row a dim "–" in the same place (links never go in the ZIP).
function rbAttachmentRow(att, zip = false) {
  const li = rbEl("li", zip ? "bd-att has-check" : "bd-att");
  const link = rbLinkInfo(att.kind);
  const info = link || rbFileKind(att.ext);
  if (zip && link) {
    const off = rbEl("span", "bd-att-check is-off", "–");
    off.setAttribute("aria-hidden", "true");
    li.append(off);
  } else if (zip) {
    const check = rbEl("label", "bd-att-check");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "bd-check";
    input.dataset.pick = att.id;
    check.append(input, rbHidden(`${att.name} 선택`));
    li.append(check);
  }
  const icon = rbEl("span", `bd-att-icon kind-${info.kind}`);
  icon.setAttribute("aria-hidden", "true");
  icon.append(
    rbSvg("", link ? "link" : "page"),
    rbEl("span", "bd-att-icon-text", info.icon),
  );
  const text = rbEl("span", "bd-att-text");
  const name = rbEl("span", "bd-att-name");
  name.append(rbBreakable(att.name));
  const meta = rbEl(
    "span",
    link && link.path ? "bd-att-meta bd-att-meta-export" : "bd-att-meta",
    link
      ? link.text
      : [info.text, rbFormatSize(att.size)].filter(Boolean).join(" · "),
  );
  text.append(name, meta);
  // The same [내려받기] for all (an icon on phones). A link opens Google in
  // a new tab: a Drive file's direct download (F2 = D64 teacher resources),
  // a Sheets / Docs / Slides file's export (D80) — no preview page, not
  // counted in the day's downloads.
  let action;
  if (link) {
    action = rbEl("a", "bd-att-btn bd-att-dl bd-att-drive");
    action.href = rbLinkUrl(att.kind, att.drive_id);
    action.target = "_blank";
    action.rel = "noopener noreferrer";
    action.setAttribute("aria-label", `${att.name} 내려받기 (새 탭)`);
  } else {
    action = rbEl("button", "bd-att-btn bd-att-dl");
    action.type = "button";
    action.dataset.attachment = att.id;
    action.setAttribute("aria-label", `${att.name} 내려받기`);
  }
  action.append(
    rbSvg("bd-att-btn-icon", "download"),
    rbEl("span", "bd-att-btn-text", "내려받기"),
  );
  li.append(icon, text, action);
  return li;
}

// The post's 첨부파일 box: its head (title; D81: [전체 선택] + [모두 받기]
// when two or more FILES can go in a ZIP), the Google note, the ZIP status,
// the rows — and the 선택 바 as the box's last part (D84: on a PC it sticks
// to the window's bottom and stops where the box ends; null without a ZIP).
function rbAttsBox(attachments, title) {
  const files = attachments.filter((a) => !rbLinkInfo(a.kind));
  const links = attachments.filter((a) => rbLinkInfo(a.kind));
  const zip = files.length >= 2;
  const box = rbEl("section", "bd-atts");
  box.setAttribute("aria-labelledby", "boardAttsTitle");
  const head = rbEl("div", "bd-atts-head");
  const boxTitle = rbEl("h3", "bd-atts-title");
  boxTitle.id = "boardAttsTitle";
  boxTitle.append(
    rbSvg("bd-atts-icon", "clip"),
    "첨부파일 ",
    rbEl("span", "bd-atts-count", `${attachments.length}개`),
  );
  head.append(boxTitle);
  box.append(head);
  const list = rbEl("ul", "bd-att-list");
  list.append(...attachments.map((att) => rbAttachmentRow(att, zip)));
  if (!zip) {
    rbZip = null;
    box.append(list);
    return { box, bar: null };
  }
  const tools = rbEl("div", "bd-atts-tools");
  const all = rbEl("label", "bd-zip-all");
  const allBox = document.createElement("input");
  allBox.type = "checkbox";
  allBox.className = "bd-check";
  allBox.id = "boardZipAll";
  all.append(allBox, rbEl("span", "", "전체 선택"));
  const getAll = rbEl("button", "bd-zip-btn");
  getAll.type = "button";
  getAll.id = "boardZipAllBtn";
  getAll.append(
    rbSvg("bd-zip-btn-icon", "archive"),
    rbEl("span", "", `모두 받기 (ZIP · ${files.length}개)`),
  );
  tools.append(all, getAll);
  head.append(tools);
  if (links.length) {
    const kinds = [
      ...new Set(links.map((a) => rbLinkInfo(a.kind).admin[0])),
    ].join("·");
    const note = rbEl("p", "bd-zip-note");
    note.append(
      rbSvg("bd-zip-note-icon", "info"),
      rbEl("span", "", RB_ZIP_MSG.note(links.length, kinds)),
    );
    box.append(note);
  }
  const status = rbEl("div", "bd-zip-status");
  status.id = "boardZipStatus";
  status.setAttribute("role", "status");
  const bar = rbZipBar();
  box.append(status, list, bar);
  rbZip = { title, files, picked: new Set(), job: null, box, bar, status };
  return { box, bar };
}

/* ---- D81 모두 받기 · 선택 받기 (ZIP, 2026-11-08) ----------------------------
   A post with two or more FILE attachments: [전체 선택] + [모두 받기 (ZIP ·
   N개)] in the box head, a check on each file row, and the 선택 바 at the
   box's end once something is picked (a phone: fixed at the bottom).
   D84 (2026-11-09): on a PC the bar sticks 16px over the window's bottom
   until the box ends; while something is picked the top button is
   [선택한 N개 받기] (= the bar's button); the bar shows a ZIP's progress.
   The ZIP is made HERE: each file's URL comes from the Edge Function
   exactly as for its row's [내려받기] (one URL = one of the day's
   downloads, 15 s), and it is fetched at once — three files at a time. fflate (vendor/, MIT), loaded
   on the first ZIP only, stores the formats that are compressed already as
   they are and deflates the old xls / ppt at level 1 (speed first); it
   marks a non-ASCII (Korean) name as UTF-8 (general purpose bit 11), which
   Windows and macOS read. The ZIP is saved like any download (a blob URL
   and <a download>; iPhone Safari 13+ too). Google links never go in
   (Google refuses another site's fetch). One pick = no ZIP, that row's own
   download. Leaving the post stops a running job. */

const RB_ZIP_LIB = "vendor/fflate-0.8.3.umd.js";
const RB_ZIP_MAX_BYTES = 200 * 1024 * 1024; // 200MB at a time
const RB_ZIP_PARALLEL = 3;
const RB_ZIP_DEFLATE = ["xls", "ppt"]; // the rest: stored (level 0)
const RB_ZIP_MSG = {
  count: (n, total) => `압축하는 중… ${n} / ${total}개`,
  wait: "창을 닫지 말아 주세요",
  working: (n, total) => `${RB_ZIP_MSG.count(n, total)} (${RB_ZIP_MSG.wait})`,
  done: (count, size, name) =>
    `압축 파일을 받았어요 (${count}개 · ${size}). 내려받기 폴더에서 ‘${name}’을 확인해 주세요.`,
  tooBig: "한 번에 200MB까지 받을 수 있어요. 파일을 골라서 나눠 받아 주세요.",
  missed: (names) =>
    `받지 못한 파일이 있어요: ${names} — 잠시 뒤 다시 시도해 주세요.`,
  note: (count, kinds) =>
    `구글 링크 ${count}개(${kinds})는 압축에 들어가지 않아요. 그 줄의 [내려받기]로 따로 받아 주세요.`,
};

// The open post's ZIP state (null = no ZIP on it): its file attachments in
// order, the picked ids, the running job and the elements.
let rbZip = null;
let rbZipLoad = null;

// fflate's browser build (window.fflate), added the first time a ZIP is made.
function rbZipLib() {
  if (window.fflate && window.fflate.zipSync) {
    return Promise.resolve(window.fflate);
  }
  if (!rbZipLoad) {
    rbZipLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = RB_ZIP_LIB;
      script.id = "boardZipLib";
      script.onload = () =>
        window.fflate && window.fflate.zipSync
          ? resolve(window.fflate)
          : reject(new Error("fflate"));
      script.onerror = () => {
        rbZipLoad = null; // try again next time
        script.remove();
        reject(new Error("load"));
      };
      document.head.append(script);
    });
  }
  return rbZipLoad;
}

// A name a file may have on Windows and macOS: \ / : * ? " < > | and control
// characters → _, no dot or space at the end, not a reserved device name.
// Invisible marks go (C1 controls, zero-width and direction marks — review:
// "안내‮fdp.hwp" must not read as another type), and "__proto__" gets a
// "_" (a key the ZIP library's plain object would not keep).
function rbSafeName(text, fallback) {
  let name = String(text || "")
    .replace(/[\u0080-\u009f​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  if (
    /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name) ||
    name === "__proto__"
  ) {
    name = `_${name}`;
  }
  return name || fallback;
}

// 모두 받기 = "<글 제목>.zip", a pick = "<글 제목>_선택 N개.zip".
function rbZipName(title, count = 0) {
  const base = Array.from(rbSafeName(title, "교사자료실"))
    .slice(0, 80)
    .join("");
  const stem = base.replace(/[. ]+$/, "") || "교사자료실";
  return count ? `${stem}_선택 ${count}개.zip` : `${stem}.zip`;
}

// The names inside the ZIP, in the post's order: a name taken already
// (Windows ignores case) becomes "이름 (2).확장자", "이름 (3).확장자" …
function rbZipNames(atts) {
  const taken = new Set();
  return atts.map((att, i) => {
    const name = rbSafeName(att.name, `파일 ${i + 1}`);
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let pick = name;
    for (let n = 2; taken.has(pick.toLowerCase()); n += 1) {
      pick = `${stem} (${n})${ext}`;
    }
    taken.add(pick.toLowerCase());
    return pick;
  });
}

function rbZipBar() {
  const bar = rbEl("div", "bd-zip-bar");
  bar.id = "boardZipBar";
  bar.hidden = true;
  const text = rbEl("div", "bd-zip-bar-text");
  // D84: a thin progress bar while a ZIP is made (only seen — the status
  // above is what is read aloud)
  const track = rbEl("span", "bd-zip-bar-track");
  track.setAttribute("aria-hidden", "true");
  track.append(rbEl("span", "bd-zip-bar-fill"));
  text.append(
    rbEl("strong", "bd-zip-bar-count"),
    rbEl("span", "bd-zip-bar-sub"),
    track,
  );
  const clear = rbEl("button", "bd-zip-clear");
  clear.type = "button";
  clear.append(
    rbEl("span", "bd-zip-pc", "선택 해제"),
    rbEl("span", "bd-zip-m", "해제"),
  );
  const get = rbEl("button", "bd-zip-get");
  get.type = "button";
  get.append(rbEl("span", "bd-zip-pc"), rbEl("span", "bd-zip-m"));
  const actions = rbEl("div", "bd-zip-bar-actions");
  actions.append(clear, get);
  bar.append(text, actions);
  return bar;
}

function rbZipPicked() {
  return rbZip ? rbZip.files.filter((a) => rbZip.picked.has(a.id)) : [];
}

function rbZipBytes(atts) {
  return atts.reduce((sum, a) => sum + (Number(a.size) || 0), 0);
}

// [선택한 1개 받기] / [선택한 N개 받기 (ZIP)] — the bar's button on a PC
// and (D84) the top button, on a phone too.
function rbZipPickLabel(count) {
  return count === 1 ? "선택한 1개 받기" : `선택한 ${count}개 받기 (ZIP)`;
}

// The checks, [전체 선택], the 선택 바 and the buttons (locked while a ZIP
// is being made) follow the picked set.
function rbZipSync() {
  if (!rbZip) return;
  const { box, bar, files, picked, job } = rbZip;
  box.querySelectorAll("input[data-pick]").forEach((input) => {
    const on = picked.has(input.dataset.pick);
    input.checked = on;
    input.closest(".bd-att").classList.toggle("is-picked", on);
  });
  const all = box.querySelector("#boardZipAll");
  all.checked = picked.size === files.length;
  all.indeterminate = picked.size > 0 && picked.size < files.length;
  const count = picked.size;
  bar.hidden = count === 0;
  if (count) {
    const [pc, phone] = bar.querySelectorAll(".bd-zip-get span");
    pc.textContent = rbZipPickLabel(count);
    phone.textContent =
      count === 1 ? "선택한 1개 받기" : `선택한 ${count}개 받기`;
  }
  rbZipBarText();
  // D84: the top button follows the picks — none: [모두 받기 (ZIP · N개)]
  // as in D81; some: what the bar's button says, blue with a row's arrow.
  // The same element all along (only its inside changes), so a keyboard
  // focus on it stays.
  const top = box.querySelector("#boardZipAllBtn");
  top.classList.toggle("is-pick", count > 0);
  top.replaceChildren(
    rbSvg("bd-zip-btn-icon", count ? "download" : "archive"),
    rbEl(
      "span",
      "",
      count ? rbZipPickLabel(count) : `모두 받기 (ZIP · ${files.length}개)`,
    ),
  );
  top.disabled = Boolean(job);
  bar.querySelector(".bd-zip-get").disabled = Boolean(job);
  bar.querySelector(".bd-zip-clear").disabled = Boolean(job);
  rbZipSpace();
}

// The 선택 바's words: "N개 선택" + how it comes; while a ZIP is being made
// (D84) "압축하는 중… n / N개" + "창을 닫지 말아 주세요" over a thin
// progress bar — the numbers of the status above, the one read aloud (the
// bar is no live region, so nothing is heard twice).
function rbZipBarText() {
  const { bar, picked, job } = rbZip;
  const line = bar.querySelector(".bd-zip-bar-count");
  const sub = bar.querySelector(".bd-zip-bar-sub");
  bar.classList.toggle("is-working", Boolean(job));
  if (job) {
    line.textContent = RB_ZIP_MSG.count(job.done, job.total);
    sub.textContent = RB_ZIP_MSG.wait;
    bar.querySelector(".bd-zip-bar-fill").style.width =
      `${Math.round((job.done / job.total) * 100)}%`;
    return;
  }
  const count = picked.size;
  const size = rbFormatSize(rbZipBytes(rbZipPicked()));
  const tail = size ? ` · ${size}` : "";
  line.textContent = `${count}개 선택`;
  sub.textContent =
    count === 1
      ? `1개는 압축하지 않고 바로 받아요${tail}`
      : `압축 파일(ZIP) 1개로 받아요${tail}`;
}

// A phone's 선택 바 is fixed at the bottom: the page gets that much room
// below (styles.css "D81"), so nothing stays hidden under it.
function rbZipSpace() {
  const bar = rbZip && rbZip.bar;
  if (bar && !bar.hidden && bar.isConnected) {
    document.body.dataset.zipBar = "1";
    document.body.style.setProperty(
      "--bd-zip-space",
      `${bar.offsetHeight + 24}px`,
    );
  } else {
    delete document.body.dataset.zipBar;
    document.body.style.removeProperty("--bd-zip-space");
  }
}

// The status in the box: kind "" (none) | working | done | error.
function rbZipSay(kind, lines = [], { progress = null, close = false } = {}) {
  const status = rbZip && rbZip.status;
  if (!status) return;
  status.className = kind ? `bd-zip-status is-${kind}` : "bd-zip-status";
  const parts = lines.map((text) => rbEl("p", "bd-zip-line", text));
  if (progress !== null) {
    const track = rbEl("span", "bd-zip-track");
    track.setAttribute("aria-hidden", "true");
    const fill = rbEl("span", "bd-zip-fill");
    fill.style.width = `${Math.round(progress * 100)}%`;
    track.append(fill);
    parts.push(track);
  }
  if (close) {
    const button = rbEl("button", "bd-zip-close", "닫기");
    button.type = "button";
    parts.push(button);
  }
  status.replaceChildren(...parts);
}

// One file: its URL from the function (as its row's [내려받기]), then the
// bytes at once (the URL lives 15 seconds). → {data} | {status} (failed).
async function rbZipFetch(att, job) {
  try {
    const { data, error } = await sb.functions.invoke(RES_FUNCTION, {
      body: { attachment: att.id },
    });
    if (error || !data || typeof data.url !== "string") {
      return { status: error && error.context && error.context.status };
    }
    const res = await window.fetch(data.url, { signal: job.abort.signal });
    if (!res.ok) return { status: 0 };
    return { data: new Uint8Array(await res.arrayBuffer()) };
  } catch {
    return { status: 0 };
  }
}

function rbSaveBlob(blob, name) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Not at once: a browser (Safari) may still be reading it.
  window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
}

// The status in the box into view if it is not — below the sticky site
// header, not behind it (D84: from the 선택 바 far down, D81's scroll left
// it under the header). A ZIP's start and the 200MB refusal.
function rbZipShowStatus(zip) {
  const header = document.querySelector(".topbar");
  const room = (header ? header.offsetHeight : 0) + 16;
  zip.status.style.scrollMarginTop = `${room}px`;
  zip.status.scrollIntoView({ block: "nearest" });
}

async function rbZipRun(atts, zipName) {
  const zip = rbZip;
  if (!sb || !zip || zip.job || !atts.length) return;
  boardDetailStatus.textContent = "";
  if (rbZipBytes(atts) > RB_ZIP_MAX_BYTES) {
    rbZipSay("error", [RB_ZIP_MSG.tooBig], { close: true });
    rbZipShowStatus(zip);
    return;
  }
  const job = {
    stop: false,
    done: 0,
    total: atts.length,
    abort: new window.AbortController(),
  };
  zip.job = job;
  rbZipSync();
  // the status above and (D84) the 선택 바, with the same numbers
  const show = () => {
    rbZipSay("working", [RB_ZIP_MSG.working(job.done, job.total)], {
      progress: job.done / job.total,
    });
    if (rbZip === zip) rbZipBarText();
  };
  show();
  rbZipShowStatus(zip);
  const names = rbZipNames(atts);
  const got = atts.map(() => null);
  try {
    const lib = await rbZipLib();
    let next = 0;
    const worker = async () => {
      while (!job.stop && next < atts.length) {
        const i = next;
        next += 1;
        got[i] = await rbZipFetch(atts[i], job);
        if (job.stop) return;
        job.done += 1;
        show();
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(RB_ZIP_PARALLEL, atts.length) }, worker),
    );
    if (job.stop) return;
    const entries = {};
    const missed = [];
    let refusal;
    atts.forEach((att, i) => {
      const one = got[i];
      if (one && one.data) {
        const ext = String(att.ext || "").toLowerCase();
        entries[names[i]] = [
          one.data,
          { level: RB_ZIP_DEFLATE.includes(ext) ? 1 : 0 },
        ];
      } else {
        missed.push(att.name);
        if (refusal === undefined) refusal = one && one.status;
      }
    });
    const count = atts.length - missed.length;
    if (!count) {
      // Nothing came: no ZIP, the first refusal said as for one file.
      rbZipSay("error", [RB_MSG[RB_STATUS_MSG[refusal]] || RB_MSG.failed], {
        close: true,
      });
      return;
    }
    const blob = new window.Blob([lib.zipSync(entries)], {
      type: "application/zip",
    });
    rbSaveBlob(blob, zipName);
    const lines = [RB_ZIP_MSG.done(count, rbFormatSize(blob.size), zipName)];
    if (missed.length) lines.push(RB_ZIP_MSG.missed(missed.join(", ")));
    rbZipSay(missed.length ? "error" : "done", lines, { close: true });
  } catch {
    if (!job.stop) rbZipSay("error", [RB_MSG.failed], { close: true });
  } finally {
    if (zip.job === job) zip.job = null;
    if (rbZip === zip) rbZipSync();
  }
}

// The 선택 바's button (and, D84, the top one while something is picked):
// one file = that row's own download (no ZIP).
function rbZipGetPicked() {
  const picked = rbZipPicked();
  if (picked.length === 1) {
    const row = [...rbZip.box.querySelectorAll("button.bd-att-dl")].find(
      (button) => button.dataset.attachment === picked[0].id,
    );
    if (row) rbDownload(row);
    return;
  }
  rbZipRun(picked, rbZipName(rbZip.title, picked.length));
}

// Leaving the post (the list, another post, out of the board): a running
// job stops (its answers are dropped) and the phone's room goes.
function rbZipCancel() {
  if (rbZip && rbZip.job) {
    rbZip.job.stop = true;
    rbZip.job.abort.abort();
  }
  rbZip = null;
  rbZipSpace();
}

function rbNeighbor(kind, post, query) {
  const label = kind === "prev" ? "이전 글" : "다음 글";
  if (!post) return null;
  const link = rbEl("a", `bd-nb bd-nb-${kind}`);
  link.href = rbPostHash(post.id, query);
  const tag = rbEl("span", "bd-nb-label");
  tag.append(rbSvg("bd-nb-icon", kind === "prev" ? "up" : "down"), label);
  link.append(
    tag,
    rbEl("span", "bd-nb-title", post.title),
    rbEl("span", "bd-nb-date", rbDay(post.created_at).short),
  );
  return link;
}

function rbRenderCrumbs(post, category, query) {
  const home = rbEl("a", "bd-crumb");
  home.href = rbListHash(query);
  home.append(rbSvg("bd-crumb-icon", "folder"), "교사자료실");
  const parts = [home];
  if (category) {
    const cat = rbEl("a", "bd-crumb", category.name);
    cat.href = rbListHash({ ...rbDefaultQuery(), cat: Number(category.id) });
    parts.push(cat);
  }
  parts.push(
    rbEl("span", "bd-crumb bd-crumb-here", RB_LEVEL_TEXT[post.level] || "공통"),
  );
  const list = rbEl("ol", "bd-crumb-list");
  parts.forEach((part, i) => {
    const li = rbEl("li", "");
    if (i > 0) li.append(rbSvg("bd-crumb-sep", "right"));
    li.append(part);
    list.append(li);
  });
  boardCrumbs.replaceChildren(list);
}

function rbRenderPost(data, query) {
  const { post, category } = data;
  const attachments = Array.isArray(data.attachments) ? data.attachments : [];
  rbRenderCrumbs(post, category, query);
  const head = rbEl("header", "bd-card-head");
  const tags = rbEl("div", "bd-card-tags");
  if (post.pinned) tags.append(rbPinBadge());
  tags.append(rbCategoryBadge(category), rbLevelTag(post.level));
  if (post.is_new) tags.append(rbNewBadge());
  const title = rbEl("h2", "bd-card-title", post.title);
  title.id = "boardPostTitle";
  title.tabIndex = -1;
  const meta = rbEl("p", "bd-card-meta");
  const day = rbEl("span", "");
  day.append(
    rbSvg("bd-meta-icon", "calendar"),
    rbHidden("등록일 "),
    rbDay(post.created_at).full,
  );
  const views = rbEl("span", "");
  views.append(rbSvg("bd-meta-icon", "eye"), `조회 ${post.views}`);
  meta.append(day, views);
  if (attachments.length) {
    const files = rbEl("span", "");
    files.append(rbSvg("bd-meta-icon", "clip"), `첨부 ${attachments.length}`);
    meta.append(files);
  }
  head.append(tags, title, meta);
  if (!post.published) {
    head.append(
      rbEl(
        "p",
        "bd-card-hidden",
        "숨긴 글이에요 — 선생님에게는 보이지 않아요.",
      ),
    );
  }

  const body = rbEl("div", "bd-card-body");
  if (post.body) body.append(rbEl("div", "bd-card-text", post.body));
  if (attachments.length) body.append(rbAttsBox(attachments, post.title).box);
  boardPost.replaceChildren(head, body);

  const prev = rbNeighbor("prev", data.prev, query);
  const next = rbNeighbor("next", data.next, query);
  boardNeighbors.replaceChildren(...[prev, next].filter(Boolean));
  boardNeighbors.hidden = !prev && !next;
}

async function rbOpenPost(id, query) {
  rbZipCancel();
  rbQuery = query;
  rbShowView("post");
  boardBack.href = rbListHash(query);
  boardDetailStatus.textContent = "";
  boardDetailView.classList.add("is-loading");
  boardDetailView.setAttribute("aria-busy", "true");
  const load = (rbLoad += 1);
  const { data, error } = await sb.rpc("board_post_get", {
    p_id: id,
    p_level: query.level || null,
    p_category: query.cat,
    p_q: query.q || null,
    p_sort: query.sort,
  });
  if (load !== rbLoad) return;
  boardDetailView.classList.remove("is-loading");
  boardDetailView.removeAttribute("aria-busy");
  if (error || !data || typeof data !== "object") {
    boardCrumbs.replaceChildren();
    boardPost.replaceChildren(rbEl("p", "bd-card-missing", RB_MSG.postFailed));
    boardNeighbors.replaceChildren();
    return;
  }
  if (data.status === "off" || data.status === "denied") {
    rbClosed(data.status);
    return;
  }
  if (data.status !== "ok" || !data.post) {
    boardCrumbs.replaceChildren();
    boardPost.replaceChildren(rbEl("p", "bd-card-missing", RB_MSG.missing));
    boardNeighbors.replaceChildren();
    boardNeighbors.hidden = true;
    return;
  }
  if (data.category && !rbCategory(data.category.id)) {
    rbCategories = [...rbCategories, data.category];
  }
  rbRenderPost(data, query);
  const title = document.querySelector("#boardPostTitle");
  if (title) title.focus({ preventScroll: true });
}

async function rbDownload(button) {
  if (!sb || button.dataset.busy) return;
  button.dataset.busy = "1";
  boardDetailStatus.textContent = "";
  try {
    const { data, error } = await sb.functions.invoke(RES_FUNCTION, {
      body: { attachment: button.dataset.attachment },
    });
    if (error || !data || typeof data.url !== "string") {
      const status = error && error.context && error.context.status;
      boardDetailStatus.textContent = RB_MSG[RB_STATUS_MSG[status] || "failed"];
      return;
    }
    followDownload(data.url);
  } catch {
    boardDetailStatus.textContent = RB_MSG.failed;
  } finally {
    delete button.dataset.busy;
  }
}

/* ---- Routing ------------------------------------------------------------- */

function rbRoute() {
  const route = rbParse(window.location.hash);
  if (!route) return false;
  if (!sb || !rbAllowed()) {
    rbHome();
    return true;
  }
  if (route.id) rbOpenPost(route.id, route.query);
  else
    rbOpenList(route.query, {
      scroll:
        route.query.page !== rbQuery.page &&
        document.body.dataset.screen === "board",
    });
  return true;
}

// Where the address now points (also called by the admin editor once its
// unsaved work is dealt with — F3): an admin address → app.js (D87); the
// board; any other address = a user screen, opened the way a load opens it
// (app.js craSite — D88; it closes the video / game window first).
function rbFollowHash() {
  const admin = window.craAdmin;
  if (admin && admin.isRoute(window.location.hash)) {
    rbZipCancel();
    admin.follow();
    return;
  }
  if (rbParse(window.location.hash)) {
    rbRoute();
    return;
  }
  rbZipCancel();
  if (window.craSite) window.craSite.follow();
}

// The page's one hashchange listener (Back / Forward / a typed address — the
// site's own moves use pushState, D87 · D88), in this order: the
// login-ended window (§5) is up: nothing moves. The admin's post editor is
// open: it decides first (F3 — its own window when uploads or changes would
// be lost; "stay" keeps the editor and its address). The background editor
// is open: unsaved changes keep it and its address, as its links do (D88).
// Then rbFollowHash: the admin, the board, a user screen. (A window's own
// entry — same address — is popstate's, app.js.) resource-board-admin.js
// loads after this file.
window.addEventListener("hashchange", () => {
  if (window.craAdmin && window.craAdmin.frozen()) return;
  const editor = window.craBoardAdmin;
  if (editor && editor.hashChanged()) return;
  const bgEditor = window.craBgEdit;
  if (bgEditor && bgEditor.hashChanged()) return;
  rbFollowHash();
});

// Out of the board by a button (the logo, a level, [Admin] … — pushState,
// no hashchange): a running ZIP stops, as on Back (D81).
new window.MutationObserver(() => {
  if (document.body.dataset.screen !== "board") rbZipCancel();
}).observe(document.body, {
  attributes: true,
  attributeFilter: ["data-screen"],
});

if (teacherBoardBtn) {
  teacherBoardBtn.addEventListener("click", () => rbGo("#board"));
}

if (boardSearchForm) {
  boardSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const q = boardSearch.value.trim().slice(0, 100);
    rbGo(rbListHash({ ...rbQuery, q, page: 1 }));
  });
}
if (boardSort) {
  boardSort.addEventListener("change", () => {
    rbGo(
      rbListHash({
        ...rbQuery,
        sort: boardSort.value === "views" ? "views" : "new",
        page: 1,
      }),
    );
  });
}
if (boardLevelChips) {
  boardLevelChips.addEventListener("click", (event) => {
    const chip = event.target.closest(".bd-chip");
    if (!chip) return;
    rbGo(rbListHash({ ...rbQuery, level: chip.dataset.level, page: 1 }));
  });
}
if (boardCatChips) {
  boardCatChips.addEventListener("click", (event) => {
    const chip = event.target.closest(".bd-chip");
    if (!chip) return;
    rbGo(
      rbListHash({
        ...rbQuery,
        cat: chip.dataset.cat ? Number(chip.dataset.cat) : null,
        page: 1,
      }),
    );
  });
}
if (boardPost) {
  boardPost.addEventListener("click", (event) => {
    const button = event.target.closest("button.bd-att-dl");
    if (button) {
      rbDownload(button);
      return;
    }
    if (!rbZip) return;
    if (event.target.closest("#boardZipAllBtn")) {
      // D84: with picks it is [선택한 N개 받기] — the bar's button
      if (rbZip.picked.size) rbZipGetPicked();
      else rbZipRun(rbZip.files, rbZipName(rbZip.title));
    } else if (event.target.closest(".bd-zip-get")) {
      rbZipGetPicked();
    } else if (event.target.closest(".bd-zip-clear")) {
      rbZip.picked.clear();
      rbZipSync();
    } else if (event.target.closest(".bd-zip-close")) {
      rbZipSay("");
    }
  });
  // D81: the checks and [전체 선택]
  boardPost.addEventListener("change", (event) => {
    const input = event.target;
    if (!rbZip || !input || input.type !== "checkbox") return;
    if (input.id === "boardZipAll") {
      rbZip.picked = new Set(input.checked ? rbZip.files.map((a) => a.id) : []);
    } else if (input.dataset.pick) {
      if (input.checked) rbZip.picked.add(input.dataset.pick);
      else rbZip.picked.delete(input.dataset.pick);
    } else {
      return;
    }
    rbZipSync();
  });
}

/* ---- #board deep link ------------------------------------------------------
   app.js opened the home page. Once the sign-in and the switches are known:
   an allowed visitor moves on to the board; anyone else stays home (the
   address is cleared). */
window.craBoard = { ready: false, route: rbRoute };
window.craAuthReady.then(() => {
  if (rbParse(window.location.hash)) rbRoute();
  window.craBoard.ready = true;
});
