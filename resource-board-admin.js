/* ==== 자료실 admin (resource board, 2026-11-03) ===========================
   Classic script after app.js, teacher-resources.js and resource-board.js
   (one shared scope: sb, isAdmin, siteFlags, updateAdminUI, refreshSignupUI,
   adminViewOpeners, adminTitle, SUPABASE_BASE, resourceExt, driveIdFromLink,
   DRIVE_ID_RE, setTeacherResStatus, rbLevelTag, rbFormatSize, rbFileKind,
   rbLinkInfo, rbSvg …; lms-admin.js's table helpers are used at run time).
   The top admin only (ADMIN_VIEWS); every write is an RPC that checks
   is_admin() again (supabase/migration.sql "Resource board").

   - The list (그림 05; D85 2026-11-09 one row a post): pinned first,
     filters (level chips · category · status buttons), title search (Enter),
     20 a page; 수정 (or the title) · 보기 (the teachers' page, new tab) ·
     [⋯] → 삭제… (two presses — its files go from Storage too).
   - 자료실 설정: the board switch (B12, site_settings
     resource_board_enabled) and the categories (B5: rename, ↑ ↓, add, delete
     when empty). The 배너 tab's 레벨별 자료실 switch (T1) lives here too.
   - The editor (B4, B6-B8): title, body, level, category, public, pinned;
     up to 50 attachments (D79) — files dropped (many at once, name order "3월 <
     10월") or picked, uploaded 3 at a time with a bar each straight to the
     private bucket (<post id>/<ms>-<6>.<ext>, the type set from the
     extension), refused ones in red; links — a Google Drive file (D64 rule)
     or a Google Sheets / Docs / Slides file (D80, rbaLinkFromText). Drag a
     row's handle (or ↑ ↓ on it, or the phone buttons) to reorder;
     [등록하기] (a new post) / [수정 완료] (F4 2026-11-04 — in the 게시 box
     and on the 등록 bar that stays at the bottom of the window) sends the
     whole list in order. Files uploaded but never registered are deleted
     when the editor is cancelled or left (B8) — after our own window asks
     first (F3: "업로드를 중단하시겠습니까?"; F4: unsaved changes); closing
     the tab or reloading gets the browser's own question while this edit
     has uploads, and pagehide deletes them. */

const RBA_BUCKET = "resource-board";
const RBA_MAX_BYTES = 10 * 1024 * 1024; // = the bucket's file_size_limit
const RBA_MAX_FILES = 50; // D79 (2026-11-07, was 20) = board_post_save's check
const RBA_PARALLEL = 3;
// The type each upload is sent with — from the extension, never the
// browser's guess (한글 files often come as "" or octet-stream).
const RBA_TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  hwp: "application/x-hwp",
  hwpx: "application/vnd.hancom.hwpx",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};
const RBA_LEVELS = [
  ["common", "공통 (모든 레벨)"],
  ["beginner", "Beginner"],
  ["level-1", "Level 1"],
  ["level-2", "Level 2"],
  ["level-3", "Level 3"],
];
const RBA_LEVEL_SHORT = {
  common: "공통",
  beginner: "Beginner",
  "level-1": "Level 1",
  "level-2": "Level 2",
  "level-3": "Level 3",
};
const RBA_MSG = {
  listFailed: "목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
  added: "등록했어요.",
  edited: "수정했어요.",
  saveFailed: "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
  denied: "최고관리자만 할 수 있어요. 다시 로그인해 주세요.",
  deleted: "삭제했어요.",
  deleteFailed: "삭제하지 못했어요.",
  storageLeft:
    "(저장소의 파일 일부는 지우지 못했어요 — 선생님은 받을 수 없고, 정리는 워커에게 알려 주세요.)",
  uploading: (name) =>
    `파일을 올리는 중이에요. 다 올라간 뒤 [${name}]를 눌러 주세요.`,
  uploadFailed: (name) =>
    `올리지 못한 파일이 있어요. 빼거나 [다시 올리기]를 누른 뒤 [${name}]를 눌러 주세요.`,
  titleEmpty: "제목을 적어 주세요.",
  title: "제목을 1~100자로 적어 주세요.",
  body: "내용은 5,000자까지 적을 수 있어요.",
  category: "분류를 골라 주세요.",
  full: `첨부는 ${RBA_MAX_FILES}개까지예요.`,
  tooMany: (n) => `첨부는 ${RBA_MAX_FILES}개까지예요. ${n}개는 받지 않았어요.`,
  missing: "이 글은 이미 지워졌어요.",
};
// D80 (2026-11-07): the link box takes a Google Drive file and — this board
// only — a Google Sheets / Docs / Slides file. Its help and its refusals (a
// "publish to the web" address, Google Forms, any other Docs page, the rest).
const RBA_LINK_MSG = {
  help: "구글 드라이브 파일·구글 시트·문서·슬라이드 링크를 넣을 수 있어요. 공유 → '링크가 있는 모든 사용자'(뷰어) → 링크 복사",
  bad: "구글 드라이브 파일이나 구글 시트·문서·슬라이드 링크만 넣을 수 있어요.",
  published:
    "'웹에 게시' 주소는 넣을 수 없어요. 공유 → 링크 복사로 받은 주소를 넣어 주세요.",
  forms:
    "구글 설문지는 넣을 수 없어요. 드라이브 파일이나 시트·문서·슬라이드 링크를 넣어 주세요.",
  docs: "구글 시트·문서·슬라이드만 넣을 수 있어요. 공유 → 링크 복사로 받은 주소를 넣어 주세요.",
};
const RBA_DOCS_KINDS = {
  spreadsheets: "gsheet",
  document: "gdoc",
  presentation: "gslides",
};
// Our window when the editor would be left with something unregistered
// (F3: this edit's uploads — uploading, waiting, done or failed; F4: other
// changes). The red button leaves, the blue one stays.
const RBA_LEAVE = {
  uploads: (n) => ({
    title: "업로드를 중단하시겠습니까?",
    text: `중단하면 이번에 올린 파일 ${n}개가 모두 취소돼요. 이미 등록된 파일은 그대로 남아요.`,
    go: "중단하기",
    stay: "계속 올리기",
  }),
  changes: (isNew) => ({
    title: "수정한 내용을 저장하지 않고 나갈까요?",
    text: isNew
      ? "[등록하기]를 누르지 않으면 쓴 내용은 남지 않아요."
      : "[수정 완료]를 누르지 않으면 바꾼 내용은 반영되지 않아요. 이미 등록된 내용은 그대로 남아요.",
    go: "나가기",
    stay: "계속 쓰기",
  }),
};
// Server messages (22023 "board: …") → what the admin reads.
const RBA_SERVER_MSG = [
  [/board: title/, RBA_MSG.title],
  [/board: body/, RBA_MSG.body],
  [/board: category/, RBA_MSG.category],
  [/board: too many/, RBA_MSG.full],
  [/not a Google Drive file id/, RBA_LINK_MSG.bad],
  [
    /is not in storage|already attached/,
    "올린 파일을 찾지 못했어요. 그 파일을 빼고 다시 올려 주세요.",
  ],
  [
    /board: attachment/,
    "첨부 목록을 저장하지 못했어요. 다시 열어 확인해 주세요.",
  ],
];

const rbaStatus = document.querySelector("#rbAdminStatus");
const rbaListMode = document.querySelector("#rbListMode");
const rbaEditMode = document.querySelector("#rbEditMode");
const rbaNewBtn = document.querySelector("#boardNewBtn");
const rbaFilterLevel = document.querySelector("#rbFilterLevel");
const rbaFilterCat = document.querySelector("#rbFilterCat");
const rbaFilterStatus = document.querySelector("#rbFilterStatus");
const rbaSearchForm = document.querySelector("#rbSearchForm");
const rbaSearch = document.querySelector("#rbSearch");
const rbaList = document.querySelector("#rbAdminList");
const rbaPager = document.querySelector("#rbAdminPager");
const rbaBoardToggle = document.querySelector("#rbBoardToggle");
const rbaBoardToggleText = document.querySelector("#rbBoardToggleText");
const rbaTeacherToggle = document.querySelector("#teacherResToggle");
const rbaTeacherToggleText = document.querySelector("#teacherResToggleText");
const rbaFontKo = document.querySelector("#rbFontKo");
const rbaFontEn = document.querySelector("#rbFontEn");
const rbaFontPreview = document.querySelector("#rbFontPreview");
const rbaFontStatus = document.querySelector("#rbFontStatus");
const rbaCatList = document.querySelector("#rbCatList");
const rbaCatAddForm = document.querySelector("#rbCatAddForm");
const rbaCatAddName = document.querySelector("#rbCatAddName");
const rbaEditor = document.querySelector("#rbEditor");
const rbaTitle = document.querySelector("#rbEdTitle");
const rbaBody = document.querySelector("#rbEdBody");
const rbaBodyCount = document.querySelector("#rbEdBodyCount");
const rbaDrop = document.querySelector("#rbDrop");
const rbaDropText = document.querySelector("#rbDropText");
const rbaDropSub = document.querySelector("#rbDropSub");
const rbaPick = document.querySelector("#rbPickFiles");
const rbaFileInput = document.querySelector("#rbFileInput");
const rbaAddDrive = document.querySelector("#rbAddDrive");
const rbaDriveForm = document.querySelector("#rbDriveForm");
const rbaDriveLink = document.querySelector("#rbDriveLink");
const rbaDriveName = document.querySelector("#rbDriveName");
const rbaDriveHelp = document.querySelector("#rbDriveHelp");
const rbaDriveError = document.querySelector("#rbDriveError");
const rbaFiles = document.querySelector("#rbFiles");
const rbaFilesCount = document.querySelector("#rbFilesCount");
const rbaFilesHint = document.querySelector("#rbFilesHint");
const rbaFileList = document.querySelector("#rbFileList");
const rbaMoveLive = document.querySelector("#rbMoveLive");
const rbaPublic = document.querySelector("#rbEdPublic");
const rbaPinned = document.querySelector("#rbEdPinned");
const rbaSaveBtn = document.querySelector("#rbEdSave");
const rbaCancelBtn = document.querySelector("#rbEdCancel");
const rbaEdError = document.querySelector("#rbEdError");
const rbaTitleError = document.querySelector("#rbEdTitleError");
const rbaBar = document.querySelector("#rbEdBar");
const rbaBarStatus = document.querySelector("#rbEdBarStatus");
const rbaBarError = document.querySelector("#rbEdBarError");
const rbaBarSave = document.querySelector("#rbEdBarSave");
const rbaLevels = document.querySelector("#rbEdLevels");
const rbaCats = document.querySelector("#rbEdCats");
const rbaLeaveModal = document.querySelector("#rbLeaveModal");
const rbaLeaveTitle = document.querySelector("#rbLeaveTitle");
const rbaLeaveText = document.querySelector("#rbLeaveText");
const rbaLeaveGo = document.querySelector("#rbLeaveGo");
const rbaLeaveStay = document.querySelector("#rbLeaveStay");

const rbaState = { level: "", cat: "", status: "", q: "", page: 1, load: 0 };
let rbaCategories = []; // [{id, name, color, posts}] from the last list answer
let rbaEd = null; // the open editor (see rbaOpenEditor)
let rbaToken = null; // the admin's access token, for deletes while leaving
let rbaDragKey = null;
let rbaJustSaved = null; // the post to light up once the list is back (F4)
let rbaUrl = ""; // the address while the editor is open (put back on "stay")
let rbaUnloadOn = false; // the beforeunload question is armed (F3)
let rbaPassing = false; // a leave click sent again after "중단하기"
let rbaAnswer = null; // resolves the open leave window (true = leave)
let rbaReturnFocus = null;

function rbaSay(text) {
  if (rbaStatus) rbaStatus.textContent = text || "";
}

function rbaEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

// A day in Seoul time → { y, m, d } ("2026", "11", "02").
function rbaSeoulDay(date) {
  const day = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .forEach(({ type, value }) => {
      if (type === "year") day.y = value;
      if (type === "month") day.m = value;
      if (type === "day") day.d = value;
    });
  return day;
}

// 등록일 (D85): this year's posts "11.02", older ones "2025.11.02" (Seoul
// time); <time datetime> keeps the whole day.
function rbaDate(iso, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const { y, m, d } = rbaSeoulDay(date);
  const time = rbaEl(
    "time",
    "",
    y === rbaSeoulDay(now).y ? `${m}.${d}` : `${y}.${m}.${d}`,
  );
  time.dateTime = `${y}-${m}-${d}`;
  return time;
}

async function rbaAccessToken() {
  const {
    data: { session },
  } = await sb.auth.getSession();
  rbaToken = session ? session.access_token : null;
  return rbaToken;
}

/* ---- The two switches (B12, T1) ------------------------------------------ */

function rbaSyncToggles() {
  if (rbaBoardToggle) {
    rbaBoardToggle.checked = siteFlags.board;
    rbaBoardToggleText.textContent = `사용자 화면에 표시: ${siteFlags.board ? "켬" : "끔"}`;
  }
  if (rbaTeacherToggle) {
    rbaTeacherToggle.checked = siteFlags.teacherRes;
    rbaTeacherToggleText.textContent = `사용자 화면에 표시: ${siteFlags.teacherRes ? "켬" : "끔"}`;
  }
}

// #5 (2026-11-05): the board's faces — the two pickers show the saved pair
// and the preview wears it (only the 교사자료실 view calls this, so the 배너
// tab never fetches a board font).
function rbaSyncFonts() {
  if (!rbaFontKo || !rbaFontEn) return;
  rbaFontKo.value = siteFlags.fontKo;
  rbaFontEn.value = siteFlags.fontEn;
  rbApplyFonts(rbaFontPreview);
}

const RBA_FLAG_FAILED = "설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.";
const RBA_FLAG_LOGIN =
  "관리자 로그인 상태를 확인할 수 없어요. 새로고침 뒤 다시 시도해 주세요.";

// "(오류 42501: new row violates row-level security…)" — the code (or the
// HTTP status) and the start of the message, for the top admin to pass on.
function rbaErrorTag(error, status) {
  const code = String((error && error.code) || status || "");
  const text = String((error && error.message) || "").trim();
  // about 40 letters, cut after a whole word
  const head =
    text.length > 40 ? `${text.slice(0, 40).replace(/\s+\S*$/, "")}…` : text;
  return `(오류${code ? ` ${code}` : ""}${head ? `: ${head}` : ""})`;
}

// Save one switch → "" when saved, else the sentence to show (#1,
// 2026-11-05). The admin page can outlive its login (Log out in another tab
// of this browser, an expired session): the page still shows the admin
// screen, but a write would go out without admin rights and RLS refuses it
// (42501) — so no login = no request and a sentence that says so.
async function rbaSaveFlag(key, value) {
  if (!sb || !isAdmin) return RBA_FLAG_LOGIN;
  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) {
      window.console.error(
        `[cra] site_settings ${key}: no admin login (session gone)`,
      );
      return RBA_FLAG_LOGIN;
    }
    const { error, status } = await sb
      .from("site_settings")
      .upsert({ key, value });
    if (!error) return "";
    window.console.error(
      `[cra] site_settings ${key} = ${value} failed`,
      status,
      error,
    );
    return `${RBA_FLAG_FAILED} ${rbaErrorTag(error, status)}`;
  } catch (error) {
    // (a thrown error — the switch must not stay locked without a word)
    window.console.error(`[cra] site_settings ${key} = ${value} threw`, error);
    return `${RBA_FLAG_FAILED} ${rbaErrorTag(error)}`;
  }
}

if (rbaBoardToggle) {
  rbaBoardToggle.addEventListener("change", async () => {
    const next = rbaBoardToggle.checked;
    rbaBoardToggle.disabled = true;
    const failed = await rbaSaveFlag("resource_board_enabled", next);
    rbaBoardToggle.disabled = false;
    if (failed) {
      rbaBoardToggle.checked = !next;
      rbaSay(failed);
      return;
    }
    siteFlags.board = next;
    updateAdminUI();
    rbaSyncToggles();
    rbaSay(
      next
        ? "교사자료실을 켰어요. 지사·선생님 화면에 버튼이 보여요."
        : "교사자료실을 껐어요.",
    );
  });
}

if (rbaTeacherToggle) {
  rbaTeacherToggle.addEventListener("change", async () => {
    const next = rbaTeacherToggle.checked;
    rbaTeacherToggle.disabled = true;
    const failed = await rbaSaveFlag("teacher_resources_enabled", next);
    rbaTeacherToggle.disabled = false;
    if (failed) {
      rbaTeacherToggle.checked = !next;
      setTeacherResStatus(failed);
      return;
    }
    siteFlags.teacherRes = next;
    updateAdminUI();
    rbaSyncToggles();
    setTeacherResStatus(
      next
        ? "레벨별 자료실을 켰어요. 월 선택 화면에 버튼이 다시 보여요."
        : "레벨별 자료실을 껐어요. 올린 파일·링크는 그대로 있어요.",
    );
  });
}

// #5: a picked face is saved at once (like the switches); a refused save
// puts the picker back and says why (#1: no login / the error code).
[
  [rbaFontKo, "board_font_ko", "fontKo"],
  [rbaFontEn, "board_font_en", "fontEn"],
].forEach(([select, key, flag]) => {
  if (!select) return;
  select.addEventListener("change", async () => {
    const next = boardFontOf(select.value);
    select.disabled = true;
    const failed = await rbaSaveFlag(key, next);
    select.disabled = false;
    if (failed) {
      select.value = siteFlags[flag];
      if (rbaFontStatus) rbaFontStatus.textContent = failed;
      return;
    }
    siteFlags[flag] = next;
    rbaSyncFonts();
    if (rbaFontStatus) rbaFontStatus.textContent = "글꼴을 바꿨어요.";
  });
});

// Opening the 배너 tab: the switch shows the current value.
document
  .querySelectorAll('.admin-menu-btn[data-admin-view="banner"]')
  .forEach((btn) => {
    btn.addEventListener("click", () => {
      rbaSyncToggles();
      refreshSignupUI().then(rbaSyncToggles);
    });
  });

/* ---- The list ------------------------------------------------------------- */

function rbaShowMode(mode) {
  rbaListMode.hidden = mode !== "list";
  rbaEditMode.hidden = mode !== "edit";
  document.body.dataset.boardMode = mode;
  if (adminTitle) {
    adminTitle.textContent =
      mode === "edit"
        ? rbaEd && !rbaEd.isNew
          ? "교사자료실 글 수정"
          : "교사자료실 글 쓰기"
        : "교사자료실";
  }
}

function rbaCategory(id) {
  return rbaCategories.find((c) => Number(c.id) === Number(id)) || null;
}

// The level chips and the status buttons show rbaState (aria-pressed); the
// category list comes with every list answer.
function rbaSyncFilters() {
  rbaFilterLevel.querySelectorAll(".rb-chip").forEach((chip) => {
    chip.setAttribute(
      "aria-pressed",
      String(chip.dataset.rbLevel === rbaState.level),
    );
  });
  rbaFilterStatus.querySelectorAll(".rb-seg-btn").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.rbStatus === rbaState.status),
    );
  });
  rbaFilterCat.value = rbaState.cat;
}

function rbaFillFilters() {
  fillSelect(rbaFilterCat, [
    ["", "전체"],
    ...rbaCategories.map((c) => [String(c.id), c.name]),
  ]);
  rbaSyncFilters();
}

/* -- one row a post (D85): [pin] · title · level · category · files · views ·
   date · 수정 · 보기 · [⋯] → 삭제… -- */

const RBA_COLUMNS = [
  ["rb-col-pin", "고정"],
  ["rb-col-title", "제목"],
  ["rb-col-level", "레벨"],
  ["rb-col-cat", "분류"],
  ["rb-col-num", "첨부"],
  ["rb-col-num", "조회"],
  ["rb-col-date", "등록일"],
  ["rb-col-manage", "관리"],
];
const RBA_SORT_NOTE = "고정 글 먼저 · 최근 등록순"; // = board_admin_list's order
let rbaMenuOpen = null; // { button, menu, row } — one [⋯] menu at a time

function rbaCell(className, ...content) {
  const td = rbaEl("td", className);
  td.append(...content);
  return td;
}

function rbaCloseMenu({ focus = false } = {}) {
  const open = rbaMenuOpen;
  if (!open) return;
  rbaMenuOpen = null;
  open.menu.hidden = true;
  open.menu.classList.remove("is-up");
  open.button.setAttribute("aria-expanded", "false");
  open.row.classList.remove("is-menu-open");
  if (focus && open.button.isConnected) open.button.focus();
}

function rbaToggleMenu(button, menu) {
  const same = rbaMenuOpen && rbaMenuOpen.button === button;
  rbaCloseMenu({ focus: same });
  if (same) return;
  const row = button.closest("tr");
  menu.hidden = false;
  button.setAttribute("aria-expanded", "true");
  row.classList.add("is-menu-open");
  rbaMenuOpen = { button, menu, row };
  // no room under the button (the window's last rows): it opens upward
  const below = window.innerHeight - button.getBoundingClientRect().bottom;
  if (below < menu.offsetHeight + 8) menu.classList.add("is-up");
  const first = [...menu.querySelectorAll(".rb-menu-item")].find(
    (el) => el.getClientRects().length > 0,
  );
  if (first) first.focus();
}

// 삭제… = the list's two presses, as before: the first arms it for a few
// seconds ("한 번 더 누르면 삭제"), the second deletes.
function rbaDeleteItem(item) {
  const button = makeButton("rb-menu-item rb-menu-del", "삭제…");
  let disarm = 0;
  button.addEventListener("click", () => {
    if (button.dataset.armed) {
      window.clearTimeout(disarm);
      rbaCloseMenu();
      rbaDeletePost(item.id);
      return;
    }
    button.dataset.armed = "1";
    button.textContent = "한 번 더 누르면 삭제";
    disarm = window.setTimeout(() => {
      delete button.dataset.armed;
      button.textContent = "삭제…";
    }, 4000);
  });
  return button;
}

function rbaViewLink(item, className, text) {
  const link = rbaEl("a", className, text);
  link.href = `${window.location.pathname}#board/${item.id}`;
  link.target = "_blank";
  link.rel = "noopener";
  return link;
}

function rbaManageCell(item) {
  const edit = makeButton("rb-edit-btn", "수정", () => rbaOpenEditor(item.id));
  edit.setAttribute("aria-label", `${item.title} 수정`);
  const view = rbaViewLink(item, "rb-icon-btn rb-view");
  view.setAttribute("aria-label", `${item.title} 사용자 화면에서 보기 (새 탭)`);
  view.title = "사용자 화면에서 보기 (새 탭)";
  view.append(rbSvg("rb-icon", "link"));
  const more = makeButton("rb-icon-btn rb-more", "");
  more.setAttribute("aria-label", `${item.title} 더 보기`);
  more.setAttribute("aria-expanded", "false");
  more.title = "더 보기";
  more.append(rbSvg("rb-icon rb-icon-more", "more"));
  const menu = rbaEl("div", "rb-menu");
  menu.id = `rbMenu-${item.id}`;
  menu.hidden = true;
  more.setAttribute("aria-controls", menu.id);
  // on a phone 보기 moves in here (the row keeps 수정 and [⋯])
  const menuView = rbaViewLink(
    item,
    "rb-menu-item rb-menu-view",
    "사용자 화면에서 보기",
  );
  menuView.setAttribute(
    "aria-label",
    `${item.title} 사용자 화면에서 보기 (새 탭)`,
  );
  menuView.addEventListener("click", () => rbaCloseMenu({ focus: true }));
  menu.append(menuView, rbaDeleteItem(item));
  more.addEventListener("click", () => rbaToggleMenu(more, menu));
  const box = rbaEl("div", "rb-manage");
  box.append(edit, view, more, menu);
  return rbaCell("rb-col-manage", box);
}

function rbaRow(item) {
  const row = document.createElement("tr");
  row.dataset.id = item.id;
  if (item.pinned) row.classList.add("is-pinned");
  if (!item.published) row.classList.add("is-hidden-post");
  const pin = rbaCell("rb-col-pin");
  if (item.pinned) {
    pin.append(rbSvg("rb-pin-icon", "pin"), rbaEl("span", "bd-sr", "고정 글"));
  }
  // the title: a row head; pressing it = [수정] (the mouse's way — the
  // keyboard has [수정] right after it, so it is not a Tab stop of its own)
  const title = rbaEl("th", "rb-col-title");
  title.scope = "row";
  const line = rbaEl("div", "rb-title-line");
  if (!item.published) line.append(rbaEl("span", "rb-hidden-tag", "숨김"));
  const open = makeButton("rb-title", item.title, () => rbaOpenEditor(item.id));
  open.title = item.title;
  open.tabIndex = -1;
  line.append(open);
  title.append(line);
  const category = rbaCategory(item.category);
  const files = Number(item.files) || 0;
  const filesCell = rbaCell(
    `rb-col-num rb-col-files${files ? "" : " is-zero"}`,
    rbSvg("rb-clip-icon", "clip"),
    String(files),
  );
  // the phone row shows "첨부 3 · 조회 64 · 11.02" as one group in the date
  // cell (the table has its column heads and hides it)
  const dateCell = rbaCell(
    "rb-col-date",
    rbaEl("span", "rb-m-meta", `첨부 ${files} · 조회 ${item.views} · `),
    rbaDate(item.created_at),
  );
  row.append(
    pin,
    title,
    rbaCell(
      "rb-col-level",
      rbaEl("span", `rb-dot lv-${item.level}`),
      rbaEl("span", "rb-level-name", RBA_LEVEL_SHORT[item.level] || item.level),
    ),
    rbaCell(
      "rb-col-cat",
      category
        ? rbaEl("span", `bd-cat cat-${category.color}`, category.name)
        : "-",
    ),
    filesCell,
    rbaCell("rb-col-num rb-col-views", String(item.views)),
    dateCell,
    rbaManageCell(item),
  );
  return row;
}

function rbaRenderList(data) {
  rbaCloseMenu();
  const table = rbaEl("table", "rb-table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  RBA_COLUMNS.forEach(([className, name]) => {
    const th = rbaEl("th", className);
    th.scope = "col";
    // the pin column's head is for screen readers only (its cells: an icon)
    th.append(className === "rb-col-pin" ? rbaEl("span", "bd-sr", name) : name);
    headRow.append(th);
  });
  head.append(headRow);
  const body = document.createElement("tbody");
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length) {
    const rows = items.map(rbaRow);
    // the line under the last pinned row is a little darker (the pinned
    // group vs the rest)
    const pinned = rows.filter((row) => row.classList.contains("is-pinned"));
    if (pinned.length)
      pinned[pinned.length - 1].classList.add("is-last-pinned");
    body.append(...rows);
  } else {
    const row = rbaEl("tr", "adm-empty-row");
    const td = rbaEl(
      "td",
      "admin-member-empty",
      rbaState.q || rbaState.level || rbaState.cat || rbaState.status
        ? "이 조건에 맞는 글이 없어요."
        : "아직 글이 없어요. [+ 새 글 쓰기]로 첫 글을 올려 보세요.",
    );
    td.colSpan = 8;
    row.append(td);
    body.append(row);
  }
  table.append(head, body);
  // 개수 줄: "전체 N개" and, at the right, the order the list comes in
  const count = rbaEl("div", "rb-list-head");
  count.append(
    rbaEl("p", "rb-total", `전체 ${data.total}개`),
    rbaEl("p", "rb-sort-note", RBA_SORT_NOTE),
  );
  rbaList.replaceChildren(count, table);

  rbaPager.replaceChildren();
  if (data.pages > 1) {
    for (let n = 1; n <= data.pages; n += 1) {
      const button = makeButton(
        "adm-btn adm-btn-secondary adm-btn-small rb-page",
        String(n),
        () => {
          rbaState.page = n;
          rbaLoad();
        },
      );
      button.setAttribute("aria-label", `${n}쪽`);
      if (n === data.page) button.setAttribute("aria-current", "page");
      rbaPager.append(button);
    }
  }
}

async function rbaLoad() {
  if (!sb || !isAdmin) return;
  const load = (rbaState.load += 1);
  const { data, error } = await sb.rpc("board_admin_list", {
    p_level: rbaState.level || null,
    p_category: rbaState.cat ? Number(rbaState.cat) : null,
    p_status: rbaState.status || null,
    p_q: rbaState.q || null,
    p_page: rbaState.page,
  });
  if (load !== rbaState.load) return;
  if (error || !data || data.status !== "ok") {
    rbaSay(
      error && error.code === "42501" ? RBA_MSG.denied : RBA_MSG.listFailed,
    );
    return;
  }
  rbaState.page = data.page;
  rbaCategories = Array.isArray(data.categories) ? data.categories : [];
  rbaFillFilters();
  rbaRenderList(data);
  rbaRenderCats();
  // Just registered / edited: its row lights up for a moment (F4).
  if (rbaJustSaved) {
    const row = rbaList.querySelector(`tr[data-id="${rbaJustSaved}"]`);
    rbaJustSaved = null;
    if (row) {
      row.classList.add("is-just-saved");
      row.scrollIntoView({ block: "nearest" });
      window.setTimeout(() => row.classList.remove("is-just-saved"), 2600);
    }
  }
}

async function rbaDeletePaths(paths, { keepalive = false } = {}) {
  const list = paths.filter(Boolean);
  if (!list.length) return true;
  if (keepalive) {
    // Leaving (another menu, the site, log out, closing the tab): a request
    // that outlives this page, with the token from before the leave.
    if (!rbaToken || !SUPABASE_BASE) return false;
    try {
      window.fetch(`${SUPABASE_BASE}/storage/v1/object/${RBA_BUCKET}`, {
        method: "DELETE",
        keepalive: true,
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${rbaToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes: list }),
      });
    } catch {
      return false;
    }
    return true;
  }
  const { error } = await sb.storage.from(RBA_BUCKET).remove(list);
  return !error;
}

async function rbaDeletePost(id) {
  const { data, error } = await sb.rpc("board_post_delete", { p_id: id });
  if (error || !data) {
    rbaSay(
      error && error.code === "42501" ? RBA_MSG.denied : RBA_MSG.deleteFailed,
    );
    return;
  }
  const removed = Array.isArray(data.removed) ? data.removed : [];
  const ok = await rbaDeletePaths(removed);
  rbaSay(
    data.status === "missing"
      ? RBA_MSG.missing
      : `${RBA_MSG.deleted}${ok ? "" : ` ${RBA_MSG.storageLeft}`}`,
  );
  rbaLoad();
}

// A filter changed → page 1 again, the same board_admin_list arguments as
// before D85 (level · category · status · q).
function rbaSetFilter(key, value) {
  if (rbaState[key] === value) return;
  rbaState[key] = value;
  rbaState.page = 1;
  rbaSyncFilters();
  rbaLoad();
}

if (rbaFilterLevel) {
  rbaFilterLevel.addEventListener("click", (event) => {
    const chip = event.target.closest(".rb-chip");
    if (chip) rbaSetFilter("level", chip.dataset.rbLevel);
  });
  rbaFilterStatus.addEventListener("click", (event) => {
    const button = event.target.closest(".rb-seg-btn");
    if (button) rbaSetFilter("status", button.dataset.rbStatus);
  });
  rbaFilterCat.addEventListener("change", () =>
    rbaSetFilter("cat", rbaFilterCat.value),
  );
}

// The [⋯] menu closes on Esc (the focus back on [⋯]), on a press outside it
// (back on [⋯] too unless that press was on something that takes the focus)
// and when Tab leaves it.
if (rbaList) {
  document.addEventListener("keydown", (event) => {
    if (!rbaMenuOpen || event.key !== "Escape") return;
    event.preventDefault();
    rbaCloseMenu({ focus: true });
  });
  document.addEventListener(
    "click",
    (event) => {
      const open = rbaMenuOpen;
      if (!open) return;
      const { target } = event;
      if (open.menu.contains(target) || open.button.contains(target)) return;
      const takesFocus = target.closest(
        "button, a[href], input, select, textarea, [tabindex]",
      );
      rbaCloseMenu({ focus: !takesFocus });
    },
    true,
  );
  rbaList.addEventListener("focusout", (event) => {
    const open = rbaMenuOpen;
    const next = event.relatedTarget;
    if (!open || !next) return; // focus to nowhere: the click above decides
    if (open.menu.contains(next) || open.button === next) return;
    rbaCloseMenu();
  });
}

if (rbaSearchForm) {
  rbaSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    rbaState.q = rbaSearch.value.trim().slice(0, 100);
    rbaState.page = 1;
    rbaLoad();
  });
}

/* ---- Categories (B5) ------------------------------------------------------ */

let rbaCatEditing = null; // the id being renamed
let rbaCatFocus = null; // [id, button class] to focus after a redraw

function rbaCatButton(text, label, onClick, className = "") {
  const button = makeButton(
    `adm-btn adm-btn-secondary adm-btn-small ${className}`,
    text,
    onClick,
  );
  button.setAttribute("aria-label", label);
  return button;
}

function rbaRenderCats() {
  if (!rbaCatList) return;
  rbaCatList.replaceChildren(
    ...rbaCategories.map((c, i) => {
      const li = rbaEl("li", "rb-cat");
      li.dataset.id = String(c.id);
      const badge = rbaEl("span", `bd-cat cat-${c.color}`, c.name);
      if (rbaCatEditing === Number(c.id)) {
        const input = rbaEl("input", "admin-member-input rb-cat-input");
        input.value = c.name;
        input.maxLength = 20;
        input.setAttribute("aria-label", `${c.name} 새 이름`);
        const save = rbaCatButton("저장", `${c.name} 이름 저장`, () =>
          rbaRenameCat(c.id, input.value),
        );
        const cancel = rbaCatButton("취소", "이름 바꾸기 취소", () => {
          rbaCatEditing = null;
          rbaRenderCats();
        });
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            rbaRenameCat(c.id, input.value);
          }
          if (event.key === "Escape") cancel.click();
        });
        li.append(input, save, cancel);
        window.setTimeout(() => input.focus(), 0);
        return li;
      }
      const count = rbaEl("span", "rb-cat-count", `글 ${c.posts}`);
      const rename = rbaCatButton(
        "이름 바꾸기",
        `${c.name} 이름 바꾸기`,
        () => {
          rbaCatEditing = Number(c.id);
          rbaRenderCats();
        },
      );
      const up = rbaCatButton(
        "↑",
        `${c.name} 위로`,
        () => rbaMoveCat(i, -1),
        "rb-cat-up",
      );
      const down = rbaCatButton(
        "↓",
        `${c.name} 아래로`,
        () => rbaMoveCat(i, 1),
        "rb-cat-down",
      );
      up.disabled = i === 0;
      down.disabled = i === rbaCategories.length - 1;
      const del = rbaCatButton(
        "삭제",
        `${c.name} 삭제`,
        () => rbaDeleteCat(c),
        "rb-cat-del",
      );
      if (c.posts > 0) {
        del.disabled = true;
        del.title = "글이 있는 분류는 지울 수 없어요";
      }
      li.append(badge, count, rename, up, down, del);
      return li;
    }),
  );
  if (rbaCatFocus) {
    const [id, cls] = rbaCatFocus;
    rbaCatFocus = null;
    const target = rbaCatList.querySelector(`.rb-cat[data-id="${id}"] .${cls}`);
    if (target && !target.disabled) target.focus();
  }
}

async function rbaRenameCat(id, name) {
  const { data, error } = await sb.rpc("board_category_save", {
    p_id: Number(id),
    p_name: String(name || "").trim(),
  });
  if (error) {
    rbaSay(
      /category name/.test(error.message || "")
        ? "분류 이름은 1~20자예요."
        : RBA_MSG.saveFailed,
    );
    return;
  }
  if (data.status === "duplicate") {
    rbaSay("같은 이름의 분류가 이미 있어요.");
    return;
  }
  rbaCatEditing = null;
  rbaSay("분류 이름을 바꿨어요.");
  rbaLoad();
}

async function rbaMoveCat(index, step) {
  const ids = rbaCategories.map((c) => Number(c.id));
  const to = index + step;
  if (to < 0 || to >= ids.length) return;
  [ids[index], ids[to]] = [ids[to], ids[index]];
  const { error } = await sb.rpc("board_category_order", { p_ids: ids });
  if (error) {
    rbaSay(RBA_MSG.saveFailed);
    return;
  }
  rbaCatFocus = [ids[to], step < 0 ? "rb-cat-up" : "rb-cat-down"];
  rbaSay("분류 순서를 바꿨어요.");
  rbaLoad();
}

async function rbaDeleteCat(category) {
  const { data, error } = await sb.rpc("board_category_delete", {
    p_id: Number(category.id),
  });
  if (error || !data) {
    rbaSay(RBA_MSG.deleteFailed);
    return;
  }
  rbaSay(
    data.status === "in_use"
      ? `글이 ${data.posts}개 있어 지울 수 없어요.`
      : `분류 '${category.name}'을(를) 지웠어요.`,
  );
  rbaLoad();
}

if (rbaCatAddForm) {
  rbaCatAddForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = rbaCatAddName.value.trim();
    if (!name || name.length > 20) {
      rbaSay("분류 이름은 1~20자예요.");
      return;
    }
    const { data, error } = await sb.rpc("board_category_save", {
      p_id: null,
      p_name: name,
    });
    if (error || !data) {
      rbaSay(RBA_MSG.saveFailed);
      return;
    }
    if (data.status === "duplicate") {
      rbaSay("같은 이름의 분류가 이미 있어요.");
      return;
    }
    rbaCatAddName.value = "";
    rbaSay(`분류 '${name}'을(를) 추가했어요.`);
    rbaLoad();
  });
}

/* ---- The editor (B4, B6-B8) ----------------------------------------------- */
/* rbaEd = { id, isNew, items: [item], refused: [item], seq, busy }
   item  = { key, kind: "file" | a link kind (drive · gsheet · gdoc ·
             gslides — RB_LINKS), id (a saved attachment) | null,
             name, size, type, ext, path, drive_id, label, file,
             state: "saved" | "waiting" | "uploading" | "done" | "error",
             progress, xhr, sent (a request went out), note, el } */

function rbaRandom6() {
  const bytes = new Uint8Array(6);
  window.crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36],
  ).join("");
}

function rbaNewPath(ext) {
  return `${rbaEd.id}/${Date.now()}-${rbaRandom6()}.${ext}`;
}

// The 게시 box's message (read out) and the same words on the 등록 bar.
function rbaEdSay(text) {
  if (rbaEdError) rbaEdError.textContent = text || "";
  if (rbaBarError) rbaBarError.textContent = text || "";
}

// Under the title box (F4: an empty title on [등록하기] lands here).
function rbaTitleSay(text) {
  if (!rbaTitleError) return;
  rbaTitleError.textContent = text || "";
  if (text) rbaTitle.setAttribute("aria-invalid", "true");
  else rbaTitle.removeAttribute("aria-invalid");
}

// [등록하기] for a new post, [수정 완료] for an existing one (F4).
function rbaSubmitName(ed = rbaEd) {
  return ed && !ed.isNew ? "수정 완료" : "등록하기";
}

// This edit's own uploads, not registered yet (F3): uploading, waiting,
// done or failed. Never a refused file, a Drive link or a saved one.
function rbaPendingUploads() {
  return rbaEd ? rbaEd.items.filter((i) => !i.id && i.kind === "file") : [];
}

// What the form says now, to tell an edit from the post as it was opened.
function rbaSnapshot() {
  return JSON.stringify([
    rbaTitle.value,
    rbaBody.value,
    rbaRadioValue(rbaLevels),
    rbaRadioValue(rbaCats),
    rbaPublic.checked,
    rbaPinned.checked,
    rbaEd.items.map((i) => i.id || `new-${i.key}`),
  ]);
}

function rbaChanged() {
  return Boolean(rbaEd) && rbaSnapshot() !== rbaEd.start;
}

// What leaving now would lose → the window's words, or null (just go).
function rbaLeaveCase() {
  if (!rbaEd) return null;
  const uploads = rbaPendingUploads().length;
  if (uploads) return RBA_LEAVE.uploads(uploads);
  if (rbaChanged()) return RBA_LEAVE.changes(rbaEd.isNew);
  return null;
}

/* -- the leave window (F3): ours, not window.confirm -- */

function rbaAsk({ title, text, go, stay }) {
  if (rbaAnswer || !rbaLeaveModal) return Promise.resolve(false);
  rbaLeaveTitle.textContent = title;
  rbaLeaveText.textContent = text;
  rbaLeaveGo.textContent = go;
  rbaLeaveStay.textContent = stay;
  rbaReturnFocus = document.activeElement;
  rbaLeaveModal.hidden = false;
  document.body.classList.add("admin-modal-open");
  rbaLeaveStay.focus();
  return new Promise((resolve) => {
    rbaAnswer = resolve;
  });
}

function rbaAnswerLeave(go) {
  const resolve = rbaAnswer;
  if (!resolve) return;
  rbaAnswer = null;
  rbaLeaveModal.hidden = true;
  document.body.classList.remove("admin-modal-open");
  if (!go && rbaReturnFocus && rbaReturnFocus.isConnected) {
    rbaReturnFocus.focus();
  }
  rbaReturnFocus = null;
  resolve(go);
}

async function rbaConfirmLeave() {
  const ask = rbaLeaveCase();
  return ask ? rbaAsk(ask) : true;
}

if (rbaLeaveModal) {
  rbaLeaveGo.addEventListener("click", () => rbaAnswerLeave(true));
  rbaLeaveModal
    .querySelectorAll("[data-rb-leave-stay]")
    .forEach((el) => el.addEventListener("click", () => rbaAnswerLeave(false)));
  // Esc = stay; Tab goes round the two buttons only.
  rbaLeaveModal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      rbaAnswerLeave(false);
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    const order = [rbaLeaveGo, rbaLeaveStay];
    const at = order.indexOf(document.activeElement);
    const step = event.shiftKey ? -1 : 1;
    order[at < 0 ? 1 : (at + step + order.length) % order.length].focus();
  });
  // A click on the window's text must not let the focus out behind it.
  document.addEventListener("focusin", (event) => {
    if (rbaAnswer && !rbaLeaveModal.contains(event.target)) {
      rbaLeaveStay.focus();
    }
  });
}

/* -- the browser's own question while this edit has uploads (F3) -- */

function rbaWarnUnload(event) {
  event.preventDefault();
  event.returnValue = ""; // older browsers; the words are the browser's own
}

function rbaSyncUnload() {
  const on = rbaPendingUploads().length > 0;
  if (on === rbaUnloadOn) return;
  rbaUnloadOn = on;
  if (on) window.addEventListener("beforeunload", rbaWarnUnload);
  else window.removeEventListener("beforeunload", rbaWarnUnload);
}

function rbaRadios(container, name, options, value) {
  container.replaceChildren(
    ...options.map(([v, text]) => {
      const label = rbaEl("label", "rb-radio");
      const input = rbaEl("input");
      input.type = "radio";
      input.name = name;
      input.value = String(v);
      input.checked = String(v) === String(value);
      label.append(input, rbaEl("span", "", text));
      return label;
    }),
  );
}

function rbaRadioValue(container) {
  const checked = container.querySelector("input:checked");
  return checked ? checked.value : "";
}

function rbaUpdateBodyCount() {
  if (rbaBodyCount) {
    rbaBodyCount.textContent = `${rbaBody.value.length.toLocaleString("en-US")} / 5,000`;
  }
}

async function rbaOpenEditor(postId) {
  if (!sb || !isAdmin) return;
  if (rbaEd) {
    // another post while this one is open (F3): ask first
    if (!(await rbaConfirmLeave())) return;
    await rbaDiscard();
  }
  rbaSay("");
  rbaEdSay("");
  rbaTitleSay("");
  if (!rbaCategories.length) await rbaLoad();
  const ed = {
    id: postId || window.crypto.randomUUID(),
    isNew: !postId,
    items: [],
    refused: [],
    seq: 0,
    busy: false,
  };
  let post = {
    title: "",
    body: "",
    level: "common",
    category: rbaCategories[0] ? rbaCategories[0].id : "",
    published: true,
    pinned: false,
  };
  if (postId) {
    const { data, error } = await sb.rpc("board_admin_get", { p_id: postId });
    if (error || !data || data.status !== "ok") {
      rbaSay(
        data && data.status === "missing"
          ? RBA_MSG.missing
          : RBA_MSG.listFailed,
      );
      rbaLoad();
      return;
    }
    post = data.post;
    ed.items = (data.attachments || []).map((a) => ({
      key: (ed.seq += 1),
      kind: a.kind,
      id: a.id,
      name: a.name,
      size: a.size,
      type: a.type,
      ext: a.ext,
      drive_id: a.drive_id,
      label: rbLinkInfo(a.kind) ? a.name : null,
      state: "saved",
      progress: 1,
    }));
  }
  rbaEd = ed;
  rbaTitle.value = post.title;
  rbaBody.value = post.body;
  rbaUpdateBodyCount();
  rbaPublic.checked = post.published;
  rbaPinned.checked = post.pinned;
  rbaRadios(rbaLevels, "rbEdLevel", RBA_LEVELS, post.level);
  rbaRadios(
    rbaCats,
    "rbEdCat",
    rbaCategories.map((c) => [c.id, c.name]),
    post.category,
  );
  ed.start = rbaSnapshot();
  rbaUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  rbaCloseDriveForm();
  rbaDropDefault();
  rbaRenderFiles();
  rbaShowMode("edit");
  window.scrollTo({ top: 0 });
  rbaTitle.focus();
}

function rbaBackToList(message) {
  rbaEd = null;
  rbaSyncUnload();
  rbaTitleSay("");
  rbaShowMode("list");
  window.scrollTo({ top: 0 });
  rbaSay(message || "");
  rbaLoad();
}

// Cancel / leave: stop the uploads and delete every file this editor put in
// Storage that no saved post points at (B8).
async function rbaDiscard({ keepalive = false } = {}) {
  const ed = rbaEd;
  if (!ed) return;
  rbaEd = null;
  rbaSyncUnload();
  ed.items.forEach((item) => {
    if (item.xhr) item.xhr.abort();
  });
  const paths = ed.items.filter((i) => !i.id && i.sent).map((i) => i.path);
  await rbaDeletePaths(paths, { keepalive });
}

/* -- adding files and links -- */

function rbaDropDefault() {
  rbaDropText.textContent =
    "파일을 여기에 끌어다 놓으면 아래 목록 끝에 추가돼요";
  rbaDropSub.textContent =
    "PDF · 엑셀 · 한글 · 파워포인트 · JPG · PNG, 한 파일 10MB까지";
}

function rbaAddFiles(fileList) {
  if (!rbaEd) return;
  // Name order with numbers as numbers (3월 < 10월), Latin before Hangul as
  // in Windows Explorer's file list.
  const files = [...fileList].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }),
  );
  let room = RBA_MAX_FILES - rbaEd.items.length;
  let over = 0;
  let refused = 0;
  files.forEach((file) => {
    const ext = resourceExt(file.name);
    const type = RBA_TYPES[ext];
    let note = "";
    if (!type) note = "올릴 수 없는 형식 — 올리지 않음";
    else if (file.size > RBA_MAX_BYTES) note = "10MB 초과 — 올리지 않음";
    else if (!file.size) note = "빈 파일 — 올리지 않음";
    const item = {
      key: (rbaEd.seq += 1),
      kind: "file",
      id: null,
      name: file.name,
      size: file.size,
      type,
      ext,
      file,
      state: "waiting",
      progress: 0,
      note,
    };
    if (note) {
      refused += 1;
      item.state = "refused";
      rbaEd.refused.push(item);
      return;
    }
    if (room <= 0) {
      over += 1;
      return;
    }
    room -= 1;
    item.path = rbaNewPath(ext);
    rbaEd.items.push(item);
  });
  const taken = files.length - over - refused;
  rbaDropSub.textContent = `놓은 파일 ${files.length}개 중 ${taken}개를 올립니다${
    refused || over
      ? ` (${[
          refused ? `${refused}개는 올릴 수 없는 파일` : "",
          over ? `${over}개는 ${RBA_MAX_FILES}개 초과` : "",
        ]
          .filter(Boolean)
          .join(", ")})`
      : ""
  }`;
  rbaEdSay(over ? RBA_MSG.tooMany(over) : "");
  rbaRenderFiles();
  rbaPump();
}

function rbaCloseDriveForm() {
  rbaDriveForm.hidden = true;
  rbaAddDrive.setAttribute("aria-expanded", "false");
  rbaDriveLink.value = "";
  rbaDriveName.value = "";
  rbaDriveError.textContent = "";
}

// D80: a pasted link → { kind, id } or { error }. drive.google.com = the
// D64 rule (driveIdFromLink, unchanged — 레벨별 자료실 keeps refusing Docs
// pages); docs.google.com/spreadsheets|document|presentation/d/<ID>/… (also
// with /u/<n>/, ?usp=…&ouid=…, #gid=…) = a Google Sheets / Docs / Slides
// file. Refused with their own words: a "publish to the web" address
// (/d/e/2PACX-…), Google Forms, any other Docs page; anything else = bad.
// `rtpof=true` = an Excel / Word / PowerPoint file uploaded to Drive and
// opened in Google's editor (not converted): it is a Drive file — its
// original downloads straight from Drive (Google's export address is for
// Google's own files).
function rbaLinkFromText(text) {
  const drive = driveIdFromLink(text);
  if (drive.id) return { kind: "drive", id: drive.id };
  if (drive.error !== "docs") return { error: "bad" };
  // a docs.google.com address over http(s) — driveIdFromLink read it so
  let raw = String(text || "").trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  const url = new window.URL(raw);
  const path = url.pathname.replace(/^\/u\/\d+(?=\/)/, "");
  if (/^\/forms(\/|$)/.test(path)) return { error: "forms" };
  const page = path.match(
    /^\/(spreadsheets|document|presentation)\/(?:u\/\d+\/)?d\/([^/]+)/,
  );
  if (!page) return { error: "docs" };
  if (page[2] === "e") return { error: "published" };
  if (!DRIVE_ID_RE.test(page[2])) return { error: "bad" };
  if (url.searchParams.get("rtpof") === "true") {
    return { kind: "drive", id: page[2] };
  }
  return { kind: RBA_DOCS_KINDS[page[1]], id: page[2] };
}

function rbaAddDriveItem() {
  if (!rbaEd) return;
  const parsed = rbaLinkFromText(rbaDriveLink.value);
  if (!parsed.id) {
    rbaDriveError.textContent = RBA_LINK_MSG[parsed.error];
    rbaDriveLink.focus();
    return;
  }
  const label = rbaDriveName.value.trim();
  if (!label) {
    rbaDriveError.textContent = "선생님에게 보일 이름을 적어 주세요.";
    rbaDriveName.focus();
    return;
  }
  if (rbaEd.items.length >= RBA_MAX_FILES) {
    rbaDriveError.textContent = RBA_MSG.full;
    return;
  }
  rbaEd.items.push({
    key: (rbaEd.seq += 1),
    kind: parsed.kind,
    id: null,
    name: label,
    label,
    drive_id: parsed.id,
    state: "done",
    progress: 1,
  });
  rbaCloseDriveForm();
  rbaRenderFiles();
  rbaAddDrive.focus();
}

/* -- uploads: 3 at a time, a bar each -- */

function rbaPump() {
  if (!rbaEd) return;
  let active = rbaEd.items.filter((i) => i.state === "uploading").length;
  rbaEd.items.forEach((item) => {
    if (active < RBA_PARALLEL && item.state === "waiting") {
      active += 1;
      rbaUpload(item);
    }
  });
  rbaRenderHead();
}

async function rbaUpload(item) {
  const ed = rbaEd;
  item.state = "uploading";
  item.progress = 0;
  rbaPaint(item);
  const token = await rbaAccessToken().catch(() => null);
  if (rbaEd !== ed || item.state !== "uploading") return; // left / removed meanwhile
  if (!token || !SUPABASE_BASE) {
    item.state = "error";
    item.note = "다시 로그인한 뒤 올려 주세요";
    rbaPaint(item);
    rbaPump();
    return;
  }
  const xhr = new window.XMLHttpRequest();
  item.xhr = xhr;
  xhr.open(
    "POST",
    `${SUPABASE_BASE}/storage/v1/object/${RBA_BUCKET}/${item.path}`,
  );
  xhr.setRequestHeader("Authorization", `Bearer ${token}`);
  xhr.setRequestHeader("apikey", window.SUPABASE_ANON_KEY);
  xhr.setRequestHeader("Content-Type", item.type);
  xhr.setRequestHeader("x-upsert", "false");
  xhr.upload.addEventListener("progress", (event) => {
    if (!event.lengthComputable) return;
    item.progress = event.loaded / event.total;
    rbaPaint(item);
  });
  const finish = (ok, note) => {
    item.xhr = null;
    if (item.state !== "uploading") return; // removed
    item.state = ok ? "done" : "error";
    item.progress = ok ? 1 : 0;
    item.note = note || "";
    rbaPaint(item);
    rbaPump();
  };
  xhr.addEventListener("load", () => {
    const ok = xhr.status >= 200 && xhr.status < 300;
    finish(ok, ok ? "" : "올리지 못했어요");
  });
  xhr.addEventListener("error", () => finish(false, "올리지 못했어요"));
  item.sent = true;
  xhr.send(item.file);
}

function rbaRetry(item) {
  if (!rbaEd) return;
  if (item.sent) rbaDeletePaths([item.path]); // in case half of it arrived
  item.sent = false;
  item.path = rbaNewPath(item.ext);
  item.state = "waiting";
  item.note = "";
  rbaPaint(item);
  rbaPump();
}

function rbaRemove(item) {
  if (!rbaEd) return;
  const wasIndex = rbaEd.items.indexOf(item);
  if (item.state === "refused") {
    rbaEd.refused = rbaEd.refused.filter((i) => i !== item);
  } else {
    if (item.xhr) item.xhr.abort();
    item.state = "removed";
    rbaEd.items = rbaEd.items.filter((i) => i !== item);
    // Never saved: it goes from Storage now. A saved one goes on [저장].
    if (!item.id && item.sent) rbaDeletePaths([item.path]);
  }
  rbaRenderFiles();
  rbaPump();
  rbaMoveLive.textContent = `${item.name}을(를) 뺐어요.`;
  const rows = [...rbaFileList.querySelectorAll(".rb-file")];
  const next = rows[Math.min(Math.max(wasIndex, 0), rows.length - 1)];
  (next ? next.querySelector(".rb-file-remove") : rbaPick).focus();
}

/* -- the rows -- */

function rbaStatusContent(item) {
  if (item.state === "uploading") {
    const bar = rbaEl("span", "rb-bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", `${item.name} 올리는 중`);
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    const pct = Math.round((item.progress || 0) * 100);
    bar.setAttribute("aria-valuenow", String(pct));
    const fill = rbaEl("span", "rb-bar-fill");
    fill.style.width = `${pct}%`;
    bar.append(fill);
    return [bar];
  }
  if (item.state === "waiting")
    return [rbaEl("span", "rb-st-wait", "기다리는 중")];
  if (item.state === "refused")
    return [rbaEl("span", "rb-st-error", item.note)];
  if (item.state === "error") {
    const retry = makeButton("adm-link rb-retry", "다시 올리기", () =>
      rbaRetry(item),
    );
    retry.setAttribute("aria-label", `${item.name} 다시 올리기`);
    return [
      rbaEl("span", "rb-st-error", item.note || "올리지 못했어요"),
      retry,
    ];
  }
  // F4: a saved one = "등록됨"; one of this edit's = up, but the teachers
  // see it only after [등록하기] / [수정 완료] (grey, not a green "done").
  if (item.id) return [rbaEl("span", "rb-st-saved", "등록됨")];
  return [
    rbaEl(
      "span",
      "rb-st-pending",
      rbLinkInfo(item.kind) ? "✓ 링크 · 등록 전" : "✓ 올림 · 등록 전",
    ),
  ];
}

function rbaPaint(item) {
  if (!item.el) return;
  item.el.dataset.state = item.state;
  item.el
    .querySelector(".rb-file-status")
    .replaceChildren(...rbaStatusContent(item));
  rbaRenderHead();
}

function rbaBuildRow(item, refused) {
  const li = rbaEl("li", "rb-file");
  li.dataset.key = String(item.key);
  li.dataset.state = item.state;
  if (!refused) {
    const handle = rbaEl("button", "rb-handle");
    handle.type = "button";
    handle.setAttribute(
      "aria-label",
      `${item.name} 순서 바꾸기 (위·아래 화살표)`,
    );
    handle.setAttribute("aria-describedby", "rbFilesHint");
    handle.append(rbaGrip());
    li.append(handle);
  } else {
    li.append(rbaEl("span", "rb-handle rb-handle-none"));
  }
  const no = rbaEl("span", "rb-file-no");
  const link = rbLinkInfo(item.kind);
  const info = link || rbFileKind(item.ext);
  const icon = rbaEl("span", `bd-att-icon rb-file-icon kind-${info.kind}`);
  icon.setAttribute("aria-hidden", "true");
  icon.append(
    rbSvg("", link ? "link" : "page"),
    rbaEl("span", "bd-att-icon-text", info.icon),
  );
  const name = rbaEl("span", "rb-file-name", item.name);
  // a link: where it comes from (+ D80: what the teachers get), one short
  // line each
  const size = rbaEl("span", "rb-file-size");
  if (link) {
    size.append(
      ...link.admin.map((t) => rbaEl("span", "rb-file-size-line", t)),
    );
  } else {
    size.textContent = rbFormatSize(item.size);
  }
  const status = rbaEl("span", "rb-file-status");
  status.setAttribute("aria-live", "polite");
  li.append(no, icon, name, size, status);
  if (!refused) {
    const moves = rbaEl("span", "rb-move-btns");
    const up = makeButton("rb-move", "↑", () =>
      rbaMove(item, -1, "rb-move-up"),
    );
    up.classList.add("rb-move-up");
    up.setAttribute("aria-label", `${item.name} 위로`);
    const down = makeButton("rb-move", "↓", () =>
      rbaMove(item, 1, "rb-move-down"),
    );
    down.classList.add("rb-move-down");
    down.setAttribute("aria-label", `${item.name} 아래로`);
    moves.append(up, down);
    li.append(moves);
  }
  const remove = makeButton("rb-file-remove", "×", () => rbaRemove(item));
  remove.setAttribute("aria-label", `${item.name} 빼기`);
  li.append(remove);
  item.el = li;
  rbaPaint(item);
  return li;
}

function rbaGrip() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  [6, 12, 18].forEach((y) =>
    [9, 15].forEach((x) => {
      const dot = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", "1.6");
      svg.append(dot);
    }),
  );
  return svg;
}

// The list head, the 등록 bar and both submit buttons (F4) — after every
// change in the editor.
function rbaRenderHead() {
  rbaSyncUnload();
  if (!rbaEd) return;
  const name = rbaSubmitName();
  const items = rbaEd.items;
  const uploads = rbaPendingUploads();
  const count = (state) => uploads.filter((i) => i.state === state).length;
  const busy = count("waiting") + count("uploading");
  const failed = count("error");
  const done = count("done");
  if (busy) {
    rbaFilesCount.textContent = `올리는 중 ${done} / ${uploads.length}`;
    rbaFilesHint.textContent =
      "창을 닫지 마세요 · 실패한 파일만 다시 올리면 돼요";
  } else {
    rbaFilesCount.textContent = `첨부 ${items.length}개`;
    rbaFilesHint.textContent = `끌어서 순서를 바꾼 뒤 [${name}] · 키보드: ↑ ↓`;
  }
  let mode = "idle";
  let text;
  if (rbaEd.busy) {
    mode = "saving";
    text = rbaEd.isNew ? "등록하는 중…" : "수정 내용을 반영하는 중…";
  } else if (busy) {
    mode = "busy";
    text = `올리는 중 ${done}/${uploads.length}…`;
  } else if (failed) {
    mode = "failed";
    text = `올리지 못한 파일 ${failed}개 — 빼거나 다시 올린 뒤 ${
      rbaEd.isNew ? "등록하세요" : "[수정 완료]를 누르세요"
    }.`;
  } else if (uploads.length) {
    mode = "ready";
    text = `파일 ${uploads.length}개가 올라갔어요. [${name}]를 눌러야 선생님 화면에 보여요.`;
  } else if (rbaEd.isNew) {
    text = "다 쓰셨으면 [등록하기]를 눌러 주세요.";
  } else {
    text = rbaChanged()
      ? "바꾼 내용은 [수정 완료]를 눌러야 선생님 화면에 반영돼요."
      : "바꾼 내용이 없어요.";
  }
  rbaBar.dataset.mode = mode;
  rbaBarStatus.textContent = text;
  const locked = mode === "busy" || mode === "failed" || mode === "saving";
  [rbaSaveBtn, rbaBarSave].forEach((button) => {
    button.textContent = name;
    button.disabled = locked;
    button.classList.toggle("is-ready", mode === "ready");
  });
}

function rbaRenderFiles() {
  if (!rbaEd) return;
  const rows = rbaEd.items.map((item, i) => {
    const row =
      item.el && item.el.isConnected ? item.el : rbaBuildRow(item, false);
    row.querySelector(".rb-file-no").textContent = String(i + 1);
    row.querySelector(".rb-move-up").disabled = i === 0;
    row.querySelector(".rb-move-down").disabled = i === rbaEd.items.length - 1;
    return row;
  });
  const refused = rbaEd.refused.map((item) => {
    const row = item.el || rbaBuildRow(item, true);
    row.querySelector(".rb-file-no").textContent = "!";
    return row;
  });
  rbaFileList.replaceChildren(...rows, ...refused);
  rbaFiles.hidden = !rows.length && !refused.length;
  rbaRenderHead();
}

function rbaMove(item, step, focusClass = "rb-handle") {
  if (!rbaEd) return;
  const from = rbaEd.items.indexOf(item);
  const to = from + step;
  if (from < 0 || to < 0 || to >= rbaEd.items.length) return;
  rbaEd.items.splice(from, 1);
  rbaEd.items.splice(to, 0, item);
  rbaRenderFiles();
  rbaMoveLive.textContent = `${item.name}을(를) ${to + 1}번째로 옮겼어요.`;
  const target = item.el.querySelector(`.${focusClass}`);
  (target && !target.disabled
    ? target
    : item.el.querySelector(".rb-handle")
  ).focus();
}

function rbaMoveTo(item, index) {
  const from = rbaEd.items.indexOf(item);
  if (from < 0) return;
  rbaEd.items.splice(from, 1);
  const to = Math.max(
    0,
    Math.min(index > from ? index - 1 : index, rbaEd.items.length),
  );
  rbaEd.items.splice(to, 0, item);
  rbaRenderFiles();
  rbaMoveLive.textContent = `${item.name}을(를) ${to + 1}번째로 옮겼어요.`;
}

function rbaItemOf(el) {
  const row = el && el.closest(".rb-file");
  if (!row || !rbaEd) return null;
  return rbaEd.items.find((i) => String(i.key) === row.dataset.key) || null;
}

/* -- drag and drop: files onto the drop box; rows by their handle -- */

function rbaHasFiles(event) {
  return Boolean(
    event.dataTransfer && [...event.dataTransfer.types].includes("Files"),
  );
}

if (rbaDrop) {
  ["dragenter", "dragover"].forEach((type) =>
    rbaDrop.addEventListener(type, (event) => {
      if (!rbaHasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      rbaDrop.classList.add("is-over");
      rbaDropText.textContent = "여기에 놓으세요";
    }),
  );
  rbaDrop.addEventListener("dragleave", (event) => {
    if (rbaDrop.contains(event.relatedTarget)) return;
    rbaDrop.classList.remove("is-over");
    rbaDropDefault();
  });
  rbaDrop.addEventListener("drop", (event) => {
    if (!rbaHasFiles(event)) return;
    event.preventDefault();
    rbaDrop.classList.remove("is-over");
    rbaDropText.textContent =
      "파일을 여기에 끌어다 놓으면 아래 목록 끝에 추가돼요";
    rbaAddFiles(event.dataTransfer.files);
  });
}
// A file dropped beside the box must not replace the page.
["dragover", "drop"].forEach((type) =>
  window.addEventListener(type, (event) => {
    if (rbaEd && rbaHasFiles(event) && !rbaDrop.contains(event.target)) {
      event.preventDefault();
    }
  }),
);

if (rbaFileList) {
  // The row becomes draggable only while its handle is held.
  rbaFileList.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest(".rb-handle");
    const row = handle && handle.closest(".rb-file");
    if (row && !handle.classList.contains("rb-handle-none"))
      row.draggable = true;
  });
  rbaFileList.addEventListener("dragstart", (event) => {
    const item = rbaItemOf(event.target);
    if (!item || !item.el.draggable) return;
    rbaDragKey = String(item.key);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.name);
    item.el.classList.add("is-dragging");
  });
  const clearMarks = () =>
    rbaFileList
      .querySelectorAll(".is-drop-before, .is-drop-after")
      .forEach((row) =>
        row.classList.remove("is-drop-before", "is-drop-after"),
      );
  // The row the pointer is over decides: its upper half = before it.
  const dropIndex = (event) => {
    const rows = [...rbaFileList.querySelectorAll(".rb-file")].filter(
      (row) => row.dataset.state !== "refused",
    );
    for (let i = 0; i < rows.length; i += 1) {
      const box = rows[i].getBoundingClientRect();
      if (event.clientY < box.top + box.height / 2)
        return { index: i, row: rows[i], before: true };
    }
    return { index: rows.length, row: rows[rows.length - 1], before: false };
  };
  rbaFileList.addEventListener("dragover", (event) => {
    if (!rbaDragKey) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    clearMarks();
    const { row, before } = dropIndex(event);
    if (row) row.classList.add(before ? "is-drop-before" : "is-drop-after");
  });
  rbaFileList.addEventListener("drop", (event) => {
    if (!rbaDragKey || !rbaEd) return;
    event.preventDefault();
    clearMarks();
    const item = rbaEd.items.find((i) => String(i.key) === rbaDragKey);
    if (item) rbaMoveTo(item, dropIndex(event).index);
  });
  rbaFileList.addEventListener("dragend", () => {
    clearMarks();
    rbaFileList.querySelectorAll(".rb-file").forEach((row) => {
      row.draggable = false;
      row.classList.remove("is-dragging");
    });
    rbaDragKey = null;
  });
  // Keyboard: ↑ / ↓ on a handle moves its row.
  rbaFileList.addEventListener("keydown", (event) => {
    if (!event.target.classList.contains("rb-handle")) return;
    const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const item = rbaItemOf(event.target);
    if (item) rbaMove(item, step);
  });
}

if (rbaPick) rbaPick.addEventListener("click", () => rbaFileInput.click());
if (rbaFileInput) {
  rbaFileInput.addEventListener("change", () => {
    if (rbaFileInput.files && rbaFileInput.files.length)
      rbaAddFiles(rbaFileInput.files);
    rbaFileInput.value = "";
  });
}
if (rbaAddDrive) {
  rbaAddDrive.addEventListener("click", () => {
    const open = rbaDriveForm.hidden;
    if (!open) {
      rbaCloseDriveForm();
      return;
    }
    rbaDriveForm.hidden = false;
    rbaAddDrive.setAttribute("aria-expanded", "true");
    rbaDriveHelp.textContent = RBA_LINK_MSG.help;
    rbaDriveLink.focus();
  });
}
if (rbaDriveForm) {
  document
    .querySelector("#rbDriveAdd")
    .addEventListener("click", rbaAddDriveItem);
  document.querySelector("#rbDriveCancel").addEventListener("click", () => {
    rbaCloseDriveForm();
    rbaAddDrive.focus();
  });
  rbaDriveForm.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.tagName === "INPUT") {
      event.preventDefault();
      rbaAddDriveItem();
    }
    if (event.key === "Escape") {
      rbaCloseDriveForm();
      rbaAddDrive.focus();
    }
  });
}
if (rbaBody) rbaBody.addEventListener("input", rbaUpdateBodyCount);

/* -- save / cancel -- */

function rbaServerMessage(error) {
  if (error && error.code === "42501") return RBA_MSG.denied;
  const text = (error && error.message) || "";
  const hit = RBA_SERVER_MSG.find(([re]) => re.test(text));
  return hit ? hit[1] : RBA_MSG.saveFailed;
}

async function rbaSave(event) {
  event.preventDefault();
  const ed = rbaEd;
  if (!ed || ed.busy) return;
  const name = rbaSubmitName(ed);
  const items = ed.items;
  if (items.some((i) => i.state === "waiting" || i.state === "uploading")) {
    rbaEdSay(RBA_MSG.uploading(name));
    return;
  }
  if (items.some((i) => i.state === "error")) {
    rbaEdSay(RBA_MSG.uploadFailed(name));
    return;
  }
  const title = rbaTitle.value.trim();
  if (!title || title.length > 100) {
    // F4: the [등록하기] at the bottom may be far from it — go to the box
    rbaEdSay("");
    rbaTitleSay(title ? RBA_MSG.title : RBA_MSG.titleEmpty);
    rbaTitle.scrollIntoView({ block: "center" });
    rbaTitle.focus({ preventScroll: true });
    return;
  }
  rbaTitleSay("");
  if (rbaBody.value.length > 5000) {
    rbaEdSay(RBA_MSG.body);
    rbaBody.focus();
    return;
  }
  const category = rbaRadioValue(rbaCats);
  if (!category) {
    rbaEdSay(RBA_MSG.category);
    return;
  }
  const attachments = items.map((i) => {
    const link = rbLinkInfo(i.kind);
    if (i.id) return link ? { id: i.id, label: i.label } : { id: i.id };
    if (link) return { kind: i.kind, drive_id: i.drive_id, label: i.label };
    return {
      kind: "file",
      path: i.path,
      name: i.name,
      size: i.size,
      type: i.type,
    };
  });
  ed.busy = true;
  rbaEdSay("");
  rbaRenderHead(); // "등록하는 중…", both buttons locked
  const { data, error } = await sb.rpc("board_post_save", {
    p_id: ed.id,
    p_title: title,
    p_body: rbaBody.value,
    p_level: rbaRadioValue(rbaLevels) || "common",
    p_category: Number(category),
    p_published: rbaPublic.checked,
    p_pinned: rbaPinned.checked,
    p_attachments: attachments,
  });
  ed.busy = false;
  if (rbaEd !== ed) return;
  rbaRenderHead();
  if (error || !data || data.status !== "ok") {
    rbaEdSay(rbaServerMessage(error));
    return;
  }
  // Registered: what it no longer points at goes from Storage; the new
  // uploads now belong to the post (no clean-up of those). Back to the list
  // with a word and its row lit up (F4).
  const removed = Array.isArray(data.removed) ? data.removed : [];
  rbaEd = null; // nothing of this edit is "pending" any more
  rbaSyncUnload();
  const ok = await rbaDeletePaths(removed);
  rbaEdSay("");
  rbaJustSaved = ed.id;
  if (ed.isNew) rbaState.page = 1;
  rbaBackToList(
    `${ed.isNew ? RBA_MSG.added : RBA_MSG.edited}${ok ? "" : ` ${RBA_MSG.storageLeft}`}`,
  );
}

if (rbaEditor) {
  rbaEditor.addEventListener("submit", rbaSave);
  // typing, choosing, ticking: the 등록 bar follows (F4)
  ["input", "change"].forEach((type) =>
    rbaEditor.addEventListener(type, () => rbaRenderHead()),
  );
}
if (rbaTitle) rbaTitle.addEventListener("input", () => rbaTitleSay(""));
if (rbaCancelBtn) {
  rbaCancelBtn.addEventListener("click", async () => {
    if (!rbaEd) return;
    const isNew = rbaEd.isNew;
    if (!(await rbaConfirmLeave())) return;
    await rbaDiscard();
    rbaBackToList(
      isNew
        ? "쓰던 글을 등록하지 않고 닫았어요."
        : "수정한 내용을 반영하지 않고 닫았어요.",
    );
  });
}
if (rbaNewBtn) rbaNewBtn.addEventListener("click", () => rbaOpenEditor(null));

// "중단하기" / "나가기": stop this edit's uploads and delete them with a
// request that outlives the page (a log out ends the session right after),
// using a fresh token.
async function rbaLeaveNow() {
  await rbaAccessToken().catch(() => null);
  await rbaDiscard({ keepalive: true });
}

// Leaving the editor another way inside the site (another menu, the site,
// log out — F3): with nothing unregistered it just closes; otherwise the
// click waits for our window, and "중단하기" sends it again.
document.addEventListener(
  "click",
  (event) => {
    if (!rbaEd || rbaPassing) return;
    const target = event.target.closest(
      ".admin-menu-btn, #adminSiteBtn, #adminLogoutBtn",
    );
    if (!target) return;
    const ask = rbaLeaveCase();
    if (!ask) {
      rbaDiscard({ keepalive: true });
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    rbaAsk(ask).then(async (go) => {
      if (!go) return;
      await rbaLeaveNow();
      rbaPassing = true;
      try {
        target.click();
      } finally {
        rbaPassing = false;
      }
    });
  },
  true,
);
// Closing the tab / reloading / another address: the browser asked first
// (rbaSyncUnload, uploads only); if it goes, its uploads go too.
window.addEventListener("pagehide", () => {
  if (rbaEd) rbaDiscard({ keepalive: true });
});

// Back / Forward / an edited # while the editor is open (F3; called first
// by resource-board.js's hashchange). "Stay" puts the address back; leaving
// closes the editor and follows the address.
function rbaHashChanged() {
  if (!rbaEd) return false;
  const leave = async () => {
    await rbaLeaveNow();
    rbaShowMode("list");
    rbFollowHash();
  };
  const ask = rbaLeaveCase();
  if (!ask) {
    leave();
    return true;
  }
  rbaAsk(ask).then((go) => {
    if (go) leave();
    else window.history.replaceState(null, "", rbaUrl);
  });
  return true;
}

/* ---- Opening the view ------------------------------------------------------ */

adminViewOpeners.board = () => {
  rbaSay("");
  if (rbaFontStatus) rbaFontStatus.textContent = "";
  rbaShowMode("list");
  rbaSyncToggles();
  rbaSyncFonts();
  refreshSignupUI().then(() => {
    rbaSyncToggles();
    rbaSyncFonts();
  });
  rbaLoad();
};

window.craBoardAdmin = {
  get editor() {
    return rbaEd;
  },
  hashChanged: rbaHashChanged,
  // The login ended (app.js, [로그인 화면으로]): close the editor without
  // asking. Its unregistered uploads are deleted only if the last token
  // still works — otherwise they stay (the monthly orphan check finds them).
  drop() {
    if (!rbaEd) return;
    rbaDiscard({ keepalive: true });
    rbaShowMode("list");
  },
};
