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
     D64 address) — then 이전 글 / 다음 글 in the same order as the list it
     came from, and 목록으로 back to it.
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
  limit: "오늘 다운로드 횟수를 모두 사용했습니다. 내일 다시 시도해 주세요.",
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

function rbAttachmentRow(att) {
  const li = rbEl("li", "bd-att");
  const drive = att.kind === "drive";
  const info = drive
    ? { kind: "drive", icon: "LINK", text: "" }
    : rbFileKind(att.ext);
  const icon = rbEl("span", `bd-att-icon kind-${info.kind}`);
  icon.setAttribute("aria-hidden", "true");
  icon.append(
    rbSvg("", drive ? "link" : "page"),
    rbEl("span", "bd-att-icon-text", info.icon),
  );
  const text = rbEl("span", "bd-att-text");
  const name = rbEl("span", "bd-att-name");
  name.append(rbBreakable(att.name));
  const meta = rbEl(
    "span",
    "bd-att-meta",
    drive
      ? "구글 드라이브 · 바로 받기"
      : [info.text, rbFormatSize(att.size)].filter(Boolean).join(" · "),
  );
  text.append(name, meta);
  // The same [내려받기] for both (an icon on phones). A Drive file is
  // Google's direct download in a new tab (F2 = D64 teacher resources): no
  // preview page, not counted in the 30 a day.
  let action;
  if (drive) {
    action = rbEl("a", "bd-att-btn bd-att-dl bd-att-drive");
    action.href = driveDownloadUrl(att.drive_id);
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
  if (attachments.length) {
    const box = rbEl("section", "bd-atts");
    box.setAttribute("aria-labelledby", "boardAttsTitle");
    const boxTitle = rbEl("h3", "bd-atts-title");
    boxTitle.id = "boardAttsTitle";
    boxTitle.append(
      rbSvg("bd-atts-icon", "clip"),
      "첨부파일 ",
      rbEl("span", "bd-atts-count", `${attachments.length}개`),
    );
    const list = rbEl("ul", "bd-att-list");
    list.append(...attachments.map(rbAttachmentRow));
    box.append(boxTitle, list);
    body.append(box);
  }
  boardPost.replaceChildren(head, body);

  const prev = rbNeighbor("prev", data.prev, query);
  const next = rbNeighbor("next", data.next, query);
  boardNeighbors.replaceChildren(...[prev, next].filter(Boolean));
  boardNeighbors.hidden = !prev && !next;
}

async function rbOpenPost(id, query) {
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

// Back / Forward out of the board (the app has no other hash listener):
// home, a month page, a resource page; anything else reloads the address.
function rbLeave() {
  const [route, raw] = window.location.hash.slice(1).split("/");
  if (!route) {
    showScreen("home");
    return;
  }
  let level = null;
  try {
    level = raw ? levelFromAny(decodeURIComponent(raw)) : null;
  } catch {
    level = null;
  }
  if (route === "months" && level) {
    showMonthsFor(level);
    return;
  }
  if (route === "resources" && level) {
    openTeacherResources(level);
    return;
  }
  window.location.reload();
}

// Where the address now points: the board, or out of it (the admin editor
// calls this once its unsaved uploads are dealt with — F3).
function rbFollowHash() {
  if (rbParse(window.location.hash)) rbRoute();
  else rbLeave();
}

window.addEventListener("hashchange", () => {
  // The admin's post editor is open: it decides first (F3 — its own
  // window when uploads or changes would be lost, the address put back on
  // "stay"). resource-board-admin.js loads after this file.
  const editor = window.craBoardAdmin;
  if (editor && editor.hashChanged()) return;
  if (rbParse(window.location.hash)) {
    rbRoute();
    return;
  }
  if (document.body.dataset.screen === "board") rbLeave();
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
    if (button) rbDownload(button);
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
