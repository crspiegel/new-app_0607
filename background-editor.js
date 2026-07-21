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
  if (!bgSourceLine) return;
  if (bgEdit.page !== "page2") {
    bgSourceLine.textContent = "";
    return;
  }
  const key = window.craBg.bgKey(state.level, "page2", state.month);
  bgSourceLine.textContent = window.craBg.bgCache[key]
    ? `현재 ${state.month}은 개별 설정을 사용 중입니다.`
    : "현재 이 월은 레벨 기본값을 사용 중입니다.";
}

function bgPublicUrl(path) {
  return sb.storage.from(BG_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function renderBgLibrary() {
  bgLibraryGrid.innerHTML = "";
  const { data, error } = await sb.storage
    .from(BG_BUCKET)
    .list(BG_LIB_PREFIX, {
      limit: 200,
      sortBy: { column: "created_at", order: "desc" },
    });
  if (error) {
    setBgStatus("라이브러리를 불러올 수 없습니다.");
    return;
  }
  if (!data.length) {
    bgLibraryGrid.innerHTML =
      '<p class="bg-lib-empty">아직 이미지가 없습니다 — 업로드로 시작하세요.</p>';
    return;
  }
  data.forEach((item) => {
    const path = `${BG_LIB_PREFIX}/${item.name}`;
    const url = bgPublicUrl(path);
    const card = document.createElement("div");
    card.className = "bg-lib-item";
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "bg-lib-thumb";
    thumb.title = "클릭하면 화면 중앙에 요소로 추가";
    thumb.style.backgroundImage = `url("${url}")`;
    thumb.addEventListener("click", () => {
      bgEdit.data.elements.push({
        src: url,
        x: 50,
        y: 40,
        w: 20,
        r: 0,
        fx: false,
        z: bgEdit.data.elements.length,
      });
      bgEdit.selected = bgEdit.data.elements.length - 1;
      bgMarkDirty();
      renderBgEditCanvas();
    });
    const actions = document.createElement("div");
    actions.className = "bg-lib-actions";
    const asFull = document.createElement("button");
    asFull.type = "button";
    asFull.textContent = "전체 배경";
    asFull.addEventListener("click", () => {
      bgEdit.data.full = url;
      bgMarkDirty();
      renderBgEditCanvas();
    });
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "삭제";
    // Two-step confirm (no window.confirm — matches the codebase's modal-free
    // inline patterns and keeps automation-safe).
    del.addEventListener("click", async () => {
      if (del.dataset.armed !== "1") {
        del.dataset.armed = "1";
        del.textContent = "정말 삭제?";
        setBgStatus("이 이미지를 쓰는 페이지에서는 요소가 사라집니다.");
        return;
      }
      const { error: rmErr } = await sb.storage.from(BG_BUCKET).remove([path]);
      if (rmErr) setBgStatus("삭제 실패.");
      else {
        setBgStatus("라이브러리에서 삭제했습니다.");
        await renderBgLibrary();
      }
    });
    actions.append(asFull, del);
    card.append(thumb, actions);
    bgLibraryGrid.append(card);
  });
}

bgUploadBtn.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = BG_TYPES.join(",");
  input.multiple = true;
  input.addEventListener("change", async () => {
    for (const file of input.files) await bgUploadFile(file);
  });
  input.click();
});

async function bgUploadFile(file) {
  if (!BG_TYPES.includes(file.type)) {
    setBgStatus("PNG / JPG / WebP 파일만 올릴 수 있습니다.");
    return;
  }
  if (file.size > BG_MAX_BYTES) {
    setBgStatus("파일당 5MB 이하만 올릴 수 있습니다.");
    return;
  }
  setBgStatus("업로드 중…");
  const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const { error } = await sb.storage
    .from(BG_BUCKET)
    .upload(`${BG_LIB_PREFIX}/${Date.now()}-${safe}`, file, {
      contentType: file.type,
    });
  if (error) {
    setBgStatus("업로드 실패.");
    return;
  }
  setBgStatus("업로드 완료.");
  await renderBgLibrary();
}

// Stubs — Task 4 (library) and Task 5 (canvas) fill these in.
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
