/* ==== Page-background editor (admin only) ================================
   Loaded AFTER app.js as a classic script, so it shares app.js's top-level
   lexical scope: sb, state, isAdmin, adminState, levelLabel, showScreen,
   setHash, updateContentMonthNumber, applyLevelTheme, monthLevelTag — plus
   the viewer bridge window.craBg. Editing happens directly on the public
   #pageBgLayer (WYSIWYG): the working copy renders with the same geometry
   as the viewer (center-% x/y, width-% w), wrapped in .bg-edit-el shells
   that add drag / resize / rotate handles. Nothing touches Supabase until a
   save button runs. */

const BG_BUCKET = "backgrounds";
const BG_LIB_PREFIX = "library";
const BG_MAX_BYTES = 5 * 1024 * 1024; // spec: 5MB per file
const BG_TYPES = ["image/png", "image/jpeg", "image/webp"];

const bgFab = document.querySelector("#bgEditFab");
const bgPanel = document.querySelector("#bgEditorPanel");
const bgTargetTag = document.querySelector("#bgEditorTarget");
const bgSourceLine = document.querySelector("#bgEditorSource");
const bgStatusTag = document.querySelector("#bgEditorStatus");
const bgLibraryGrid = document.querySelector("#bgLibraryGrid");
const bgUploadBtn = document.querySelector("#bgUploadBtn");
const bgFullClear = document.querySelector("#bgFullClear");
const bgFullHint = document.querySelector("#bgFullHint");
const bgElTools = document.querySelector("#bgElTools");
const bgSaveMonth = document.querySelector("#bgSaveMonth");
const bgSaveDefault = document.querySelector("#bgSaveDefault");
const bgDeleteOverride = document.querySelector("#bgDeleteOverride");
const bgSavePage1 = document.querySelector("#bgSavePage1");
const bgCloseBtn = document.querySelector("#bgEditorClose");

const bgEdit = {
  on: false,
  screen: "", // "months" | "content" — key for applyPageBackground on exit
  page: "", // "page1" | "page2"
  data: { full: null, elements: [] }, // working copy (saved only on demand)
  dirty: false,
  selected: -1, // index into data.elements
  discardArmed: false, // two-step "discard changes" on close
};

function bgLayer() {
  return document.querySelector("#pageBgLayer");
}
function setBgStatus(text) {
  if (bgStatusTag) bgStatusTag.textContent = text || "";
}
function bgDeepCopy(entry) {
  return entry
    ? JSON.parse(JSON.stringify(entry))
    : { full: null, elements: [] };
}
function bgMarkDirty() {
  bgEdit.dirty = true;
  bgEdit.discardArmed = false;
  setBgStatus("변경됨 — 저장 필요");
}

// Which source row is the page currently using? (page2 only — page1 has no
// override concept.)
function refreshBgSourceLine() {
  if (bgEdit.page !== "page2") {
    bgSourceLine.textContent = "";
    return;
  }
  const key = window.craBg.bgKey(state.level, "page2", state.month);
  bgSourceLine.textContent = window.craBg.bgCache[key]
    ? `현재 ${state.month}은 개별 설정을 사용 중입니다.`
    : "현재 이 월은 레벨 기본값을 사용 중입니다.";
}

// Stubs — Task 4 (library) and Task 5 (canvas) fill these in.
async function renderBgLibrary() {}
function renderBgEditCanvas() {}

function enterBgEdit() {
  const name = document.body.dataset.screen;
  const page = name === "months" ? "page1" : name === "content" ? "page2" : "";
  if (!page || !isAdmin || !sb) return;
  bgEdit.on = true;
  bgEdit.screen = name;
  bgEdit.page = page;
  const month = page === "page2" ? state.month : "";
  bgEdit.data = bgDeepCopy(
    window.craBg.getBackgroundEntry(state.level, page, month),
  );
  if (!Array.isArray(bgEdit.data.elements)) bgEdit.data.elements = [];
  bgEdit.dirty = false;
  bgEdit.selected = -1;
  bgEdit.discardArmed = false;
  // page-bg-active turns on the tint hand-off CSS even before anything is
  // saved, so what the admin sees while editing is exactly what saving gives.
  document.body.classList.add("bg-editing", "page-bg-active");
  bgPanel.hidden = false;
  bgTargetTag.textContent =
    page === "page1"
      ? `${levelLabel(state.level)} · 페이지1`
      : `${levelLabel(state.level)} · ${state.month}`;
  const isPage2 = page === "page2";
  bgSaveMonth.hidden = !isPage2;
  bgSaveDefault.hidden = !isPage2;
  bgDeleteOverride.hidden = !isPage2;
  bgSavePage1.hidden = isPage2;
  refreshBgSourceLine();
  setBgStatus("");
  renderBgLibrary();
  renderBgEditCanvas();
}

function exitBgEdit() {
  bgEdit.on = false;
  document.body.classList.remove("bg-editing");
  bgPanel.hidden = true;
  bgElTools.hidden = true;
  // Repaint from the saved cache (also recomputes body.page-bg-active).
  window.craBg.applyPageBackground(bgEdit.screen);
}

bgFab.addEventListener("click", enterBgEdit);

bgCloseBtn.addEventListener("click", () => {
  if (bgEdit.dirty && !bgEdit.discardArmed) {
    bgEdit.discardArmed = true;
    setBgStatus("저장하지 않은 변경이 있습니다 — 한 번 더 누르면 버립니다.");
    return;
  }
  exitBgEdit();
});
