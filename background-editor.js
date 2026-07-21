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

function renderBgEditCanvas() {
  const layer = bgLayer();
  layer.innerHTML = "";
  if (bgEdit.data.full) {
    const full = document.createElement("div");
    full.className = "page-bg-full";
    full.style.backgroundImage = `url("${bgEdit.data.full}")`;
    layer.append(full);
  }
  bgFullClear.hidden = !bgEdit.data.full;
  bgFullHint.hidden = Boolean(bgEdit.data.full);
  bgEdit.data.elements.forEach((item, index) => {
    layer.append(bgEditShell(item, index));
  });
  bgElTools.hidden = bgEdit.selected < 0;
}

// One positioned wrapper per element: the img mirrors the viewer geometry
// (center-% left/top, width-%, rotate on the shell, flip on the img), plus
// resize/rotate handles when selected.
function bgEditShell(item, index) {
  const shell = document.createElement("div");
  shell.className = "bg-edit-el";
  if (index === bgEdit.selected) shell.classList.add("selected");
  shell.style.left = `${item.x}%`;
  shell.style.top = `${item.y}%`;
  shell.style.width = `${item.w}%`;
  shell.style.transform = `translate(-50%, -50%) rotate(${item.r || 0}deg)`;
  const img = document.createElement("img");
  img.src = item.src;
  img.alt = "";
  img.draggable = false;
  img.style.transform = `scaleX(${item.fx ? -1 : 1})`;
  shell.append(img);
  if (index === bgEdit.selected) {
    const resize = document.createElement("span");
    resize.className = "bg-edit-handle bg-edit-resize";
    resize.title = "크기";
    const rotate = document.createElement("span");
    rotate.className = "bg-edit-handle bg-edit-rotate";
    rotate.title = "회전";
    shell.append(resize, rotate);
    wireBgHandle(resize, index, "resize");
    wireBgHandle(rotate, index, "rotate");
  }
  shell.addEventListener("pointerdown", (event) => {
    if (event.target.classList.contains("bg-edit-handle")) return;
    selectBgElement(index);
    startBgDrag(event, index, "move");
  });
  return shell;
}

function selectBgElement(index) {
  if (bgEdit.selected === index) return;
  bgEdit.selected = index;
  renderBgEditCanvas();
}

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

// One pointer session drives move / resize (ratio-locked width) / rotate.
// The listeners live on document, so re-rendering the shells mid-drag is safe.
function startBgDrag(event, index, mode) {
  event.preventDefault();
  const item = bgEdit.data.elements[index];
  const rect = bgLayer().getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const start = { x: item.x, y: item.y, w: item.w, r: item.r || 0 };
  const centerPx = {
    x: rect.left + (item.x / 100) * rect.width,
    y: rect.top + (item.y / 100) * rect.height,
  };
  const startDist = Math.max(
    8,
    Math.hypot(startX - centerPx.x, startY - centerPx.y),
  );
  const startAngle = Math.atan2(startY - centerPx.y, startX - centerPx.x);

  function onMove(move) {
    if (mode === "move") {
      item.x = start.x + ((move.clientX - startX) / rect.width) * 100;
      item.y = start.y + ((move.clientY - startY) / rect.height) * 100;
      // Decorations may bleed off the edges, but never get lost entirely.
      item.x = Math.min(150, Math.max(-50, item.x));
      item.y = Math.min(150, Math.max(-50, item.y));
    } else if (mode === "resize") {
      const dist = Math.hypot(
        move.clientX - centerPx.x,
        move.clientY - centerPx.y,
      );
      item.w = Math.min(200, Math.max(2, start.w * (dist / startDist)));
    } else {
      const angle = Math.atan2(
        move.clientY - centerPx.y,
        move.clientX - centerPx.x,
      );
      item.r = Math.round(start.r + ((angle - startAngle) * 180) / Math.PI);
    }
    bgMarkDirty();
    renderBgEditCanvas();
  }
  function onUp() {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  }
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

function wireBgHandle(handle, index, mode) {
  handle.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    startBgDrag(event, index, mode);
  });
}

bgElTools.addEventListener("click", (event) => {
  const act = event.target.dataset.elAct;
  if (!act || bgEdit.selected < 0) return;
  const els = bgEdit.data.elements;
  const index = bgEdit.selected;
  if (act === "flip") els[index].fx = !els[index].fx;
  if (act === "delete") {
    els.splice(index, 1);
    bgEdit.selected = -1;
  }
  // Array order IS the stacking order (normalized to z on save).
  if (act === "forward" && index < els.length - 1) {
    [els[index], els[index + 1]] = [els[index + 1], els[index]];
    bgEdit.selected = index + 1;
  }
  if (act === "backward" && index > 0) {
    [els[index], els[index - 1]] = [els[index - 1], els[index]];
    bgEdit.selected = index - 1;
  }
  bgMarkDirty();
  renderBgEditCanvas();
});

bgFullClear.addEventListener("click", () => {
  bgEdit.data.full = null;
  bgMarkDirty();
  renderBgEditCanvas();
});

// Clicking empty layer space clears the selection.
document.addEventListener("pointerdown", (event) => {
  if (!bgEdit.on) return;
  const target = event.target;
  if (target === bgLayer() || target.classList.contains("page-bg-full")) {
    bgEdit.selected = -1;
    renderBgEditCanvas();
  }
});

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

/* ---- persistence -------------------------------------------------------- */

function bgNormalized() {
  return {
    full: bgEdit.data.full || null,
    elements: bgEdit.data.elements.map((item, index) => ({
      ...item,
      z: index,
    })),
  };
}

async function bgSave(month) {
  setBgStatus("저장 중…");
  const data = bgNormalized();
  const { error } = await sb.from("page_backgrounds").upsert(
    { level: state.level, page: bgEdit.page, month: month || "", data },
    { onConflict: "level,page,month" },
  );
  if (error) {
    setBgStatus("저장 실패.");
    return;
  }
  window.craBg.bgCache[window.craBg.bgKey(state.level, bgEdit.page, month)] =
    data;
  bgEdit.dirty = false;
  bgEdit.discardArmed = false;
  setBgStatus("저장 완료.");
  refreshBgSourceLine();
}

bgSavePage1.addEventListener("click", () => bgSave(""));
bgSaveMonth.addEventListener("click", () => bgSave(state.month));
bgSaveDefault.addEventListener("click", () => bgSave(""));

bgDeleteOverride.addEventListener("click", async () => {
  setBgStatus("삭제 중…");
  const { error } = await sb
    .from("page_backgrounds")
    .delete()
    .match({ level: state.level, page: "page2", month: state.month });
  if (error) {
    setBgStatus("삭제 실패.");
    return;
  }
  delete window.craBg.bgCache[
    window.craBg.bgKey(state.level, "page2", state.month)
  ];
  // The editor falls back to the level default, same as the public page will.
  bgEdit.data = bgDeepCopy(
    window.craBg.getBackgroundEntry(state.level, "page2", state.month),
  );
  if (!Array.isArray(bgEdit.data.elements)) bgEdit.data.elements = [];
  bgEdit.dirty = false;
  bgEdit.selected = -1;
  setBgStatus("개별설정 삭제 — 이 월은 레벨 기본값을 사용합니다.");
  refreshBgSourceLine();
  renderBgEditCanvas();
});

// While editing with unsaved changes, swallow in-app navigation clicks
// (month Back/Next, month grid, top nav, brand, admin button) in the capture
// phase — before app.js's own handlers run.
document.addEventListener(
  "click",
  (event) => {
    if (!bgEdit.on || !bgEdit.dirty) return;
    const nav = event.target.closest(
      ".content-nav-prev, .content-nav-next, .month-button, .top-nav-link, .brand, [data-view], .admin-nav-button",
    );
    if (!nav || bgPanel.contains(nav)) return;
    event.preventDefault();
    event.stopPropagation();
    setBgStatus("저장하지 않은 변경이 있습니다 — 저장하거나 ✕로 닫아 주세요.");
  },
  true,
);
