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
const bgGhostToggle = document.querySelector("#bgGhostToggle");

const bgEdit = {
  on: false,
  screen: "", // "months" | "content" — key for applyPageBackground on exit
  page: "", // "page1" | "page2"
  data: { full: null, elements: [] }, // working copy (saved only on demand)
  dirty: false,
  selected: -1, // index into data.elements
  discardArmed: false, // two-step "discard changes" on close
  saving: false, // guards double-click on save / delete-override
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
  const { data, error } = await sb.storage.from(BG_BUCKET).list(BG_LIB_PREFIX, {
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
    // inline patterns and keeps automation-safe). The armed state auto-resets
    // after 4s so a stale first click can never turn a later click into an
    // instant permanent delete.
    del.addEventListener("click", async () => {
      if (del.dataset.armed !== "1") {
        del.dataset.armed = "1";
        del.textContent = "정말 삭제?";
        del.classList.add("bg-armed");
        setBgStatus("이 이미지를 쓰는 페이지에서는 요소가 사라집니다.");
        window.setTimeout(() => {
          del.dataset.armed = "";
          del.textContent = "삭제";
          del.classList.remove("bg-armed");
        }, 4000);
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
    const files = [...input.files];
    let ok = 0;
    for (let i = 0; i < files.length; i += 1) {
      if (files.length > 1)
        setBgStatus(`업로드 중… (${i + 1}/${files.length})`);
      if (await bgUploadFile(files[i], files.length > 1)) ok += 1;
    }
    if (files.length > 1)
      setBgStatus(
        `업로드 완료 (${ok}/${files.length}) — 썸네일을 클릭해 추가하세요.`,
      );
  });
  input.click();
});

// Returns true on success so multi-file uploads can report a total.
async function bgUploadFile(file, quiet) {
  if (!BG_TYPES.includes(file.type)) {
    setBgStatus(`"${file.name}"은 PNG / JPG / WebP가 아니라 건너뜁니다.`);
    return false;
  }
  if (file.size > BG_MAX_BYTES) {
    setBgStatus(`"${file.name}"은 5MB를 넘어 건너뜁니다.`);
    return false;
  }
  if (!quiet) setBgStatus("업로드 중…");
  const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const { error } = await sb.storage
    .from(BG_BUCKET)
    .upload(`${BG_LIB_PREFIX}/${Date.now()}-${safe}`, file, {
      contentType: file.type,
    });
  if (error) {
    setBgStatus("업로드 실패.");
    return false;
  }
  if (!quiet) setBgStatus("업로드 완료 — 썸네일을 클릭해 화면에 추가하세요.");
  await renderBgLibrary();
  return true;
}

function renderBgEditCanvas() {
  const layer = bgLayer();
  layer.innerHTML = "";
  // Same readability scrim as the viewer (WYSIWYG).
  layer.classList.toggle("has-full", Boolean(bgEdit.data.full));
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
  // Don't open on a cold cache — saving an empty working copy could overwrite
  // a real row that simply hasn't arrived yet. Instead of asking the admin to
  // retry by hand, re-run the hydrate and auto-open when it lands.
  if (!window.craBg.ready) {
    bgFab.textContent = "불러오는 중…";
    hydrateBackgrounds().then(() => {
      bgFab.textContent = "배경 편집";
      if (window.craBg.ready) enterBgEdit();
      else {
        bgFab.textContent = "연결 실패 — 다시 시도";
        window.setTimeout(() => {
          bgFab.textContent = "배경 편집";
        }, 2500);
      }
    });
    return;
  }
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
  document.body.classList.toggle("bg-ghost", bgGhostToggle.checked);
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
// The listeners live on document, so the selection re-render that may happen
// on pointerdown is safe: the live shell is re-queried AFTER it. During the
// drag only that shell's inline styles (and a value badge) are updated —
// rebuilding the whole layer per pointermove caused visible churn.
function startBgDrag(event, index, mode) {
  event.preventDefault();
  const item = bgEdit.data.elements[index];
  const rect = bgLayer().getBoundingClientRect();
  const shell = bgLayer().querySelectorAll(".bg-edit-el")[index];
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
  let badge = null;
  let moved = false;

  function showBadge(move, text) {
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "bg-edit-badge";
      document.body.append(badge);
    }
    badge.style.left = `${move.clientX + 14}px`;
    badge.style.top = `${move.clientY + 14}px`;
    badge.textContent = text;
  }

  function onMove(move) {
    if (!moved) {
      moved = true;
      bgMarkDirty();
    }
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
      showBadge(move, `${Math.round(item.w)}%`);
    } else {
      const angle = Math.atan2(
        move.clientY - centerPx.y,
        move.clientX - centerPx.x,
      );
      let deg = start.r + ((angle - startAngle) * 180) / Math.PI;
      // Web-builder convention: Shift snaps rotation to 15° steps.
      if (move.shiftKey) deg = Math.round(deg / 15) * 15;
      item.r = Math.round(deg);
      showBadge(move, `${((item.r % 360) + 360) % 360}°`);
    }
    if (shell) {
      shell.style.left = `${item.x}%`;
      shell.style.top = `${item.y}%`;
      shell.style.width = `${item.w}%`;
      shell.style.transform = `translate(-50%, -50%) rotate(${item.r || 0}deg)`;
    }
  }
  function onUp() {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    if (badge) badge.remove();
    // One clean re-render so handles/outline resync with the final geometry.
    if (moved) renderBgEditCanvas();
  }
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
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
  if (act === "dup") {
    // Slight offset so the copy is visibly a new element, then select it.
    const copy = { ...els[index], x: els[index].x + 3, y: els[index].y + 3 };
    els.splice(index + 1, 0, copy);
    bgEdit.selected = index + 1;
  }
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
  document.body.classList.remove("bg-editing", "bg-ghost");
  bgPanel.hidden = true;
  bgElTools.hidden = true;
  // Repaint from the saved cache (also recomputes body.page-bg-active).
  window.craBg.applyPageBackground(bgEdit.screen);
}

// Shared close-with-guard: dirty sessions need a second request to discard.
function requestBgClose() {
  if (bgEdit.dirty && !bgEdit.discardArmed) {
    bgEdit.discardArmed = true;
    setBgStatus("저장하지 않은 변경이 있습니다 — 한 번 더 누르면 버립니다.");
    return;
  }
  exitBgEdit();
}

bgFab.addEventListener("click", enterBgEdit);

bgCloseBtn.addEventListener("click", requestBgClose);

// Ghost preview toggle: overlay the real page content semi-transparent.
bgGhostToggle.addEventListener("change", () => {
  document.body.classList.toggle("bg-ghost", bgGhostToggle.checked);
});

// Keyboard: Delete removes the selected element, arrows nudge it
// (Shift = bigger steps), Esc deselects first and then closes (with the
// same unsaved-changes guard as ✕).
document.addEventListener("keydown", (event) => {
  if (!bgEdit.on) return;
  if (event.target.closest("input, textarea, select")) return;
  const els = bgEdit.data.elements;
  const index = bgEdit.selected;
  if (event.key === "Escape") {
    if (index >= 0) {
      bgEdit.selected = -1;
      renderBgEditCanvas();
    } else {
      requestBgClose();
    }
    return;
  }
  if (index < 0) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    els.splice(index, 1);
    bgEdit.selected = -1;
    bgMarkDirty();
    renderBgEditCanvas();
    return;
  }
  const nudge = event.shiftKey ? 2 : 0.5;
  const item = els[index];
  let handled = true;
  if (event.key === "ArrowLeft") item.x = Math.max(-50, item.x - nudge);
  else if (event.key === "ArrowRight") item.x = Math.min(150, item.x + nudge);
  else if (event.key === "ArrowUp") item.y = Math.max(-50, item.y - nudge);
  else if (event.key === "ArrowDown") item.y = Math.min(150, item.y + nudge);
  else handled = false;
  if (handled) {
    event.preventDefault();
    bgMarkDirty();
    renderBgEditCanvas();
  }
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
  if (bgEdit.saving) return;
  bgEdit.saving = true;
  setBgStatus("저장 중…");
  const data = bgNormalized();
  const { error } = await sb
    .from("page_backgrounds")
    .upsert(
      { level: state.level, page: bgEdit.page, month: month || "", data },
      { onConflict: "level,page,month" },
    );
  bgEdit.saving = false;
  if (error) {
    setBgStatus("저장 실패.");
    return;
  }
  window.craBg.bgCache[window.craBg.bgKey(state.level, bgEdit.page, month)] =
    data;
  bgEdit.dirty = false;
  bgEdit.discardArmed = false;
  // Saving the LEVEL DEFAULT while this month has its own override is legal
  // but invisible here — say so, or the admin thinks the save didn't work.
  const overridden =
    !month &&
    bgEdit.page === "page2" &&
    window.craBg.bgCache[window.craBg.bgKey(state.level, "page2", state.month)];
  setBgStatus(
    overridden
      ? `기본값 저장 완료 — 단, ${state.month}은 개별 설정이 있어 이 화면에는 보이지 않습니다.`
      : "저장 완료.",
  );
  refreshBgSourceLine();
}

bgSavePage1.addEventListener("click", () => bgSave(""));
bgSaveMonth.addEventListener("click", () => bgSave(state.month));
bgSaveDefault.addEventListener("click", () => bgSave(""));

bgDeleteOverride.addEventListener("click", async () => {
  if (bgEdit.saving) return;
  bgEdit.saving = true;
  setBgStatus("삭제 중…");
  const { error } = await sb
    .from("page_backgrounds")
    .delete()
    .match({ level: state.level, page: bgEdit.page, month: state.month });
  bgEdit.saving = false;
  if (error) {
    setBgStatus("삭제 실패.");
    return;
  }
  delete window.craBg.bgCache[
    window.craBg.bgKey(state.level, bgEdit.page, state.month)
  ];
  // The editor falls back to the level default, same as the public page will.
  bgEdit.data = bgDeepCopy(
    window.craBg.getBackgroundEntry(state.level, bgEdit.page, state.month),
  );
  if (!Array.isArray(bgEdit.data.elements)) bgEdit.data.elements = [];
  bgEdit.dirty = false;
  bgEdit.discardArmed = false;
  bgEdit.selected = -1;
  setBgStatus("개별설정 삭제 — 이 월은 레벨 기본값을 사용합니다.");
  refreshBgSourceLine();
  renderBgEditCanvas();
});

// While editing, intercept in-app navigation clicks (month Back/Next, month
// grid, top nav, brand, admin button) in the capture phase — before app.js's
// own handlers run. Dirty sessions block the nav; clean sessions auto-exit.
document.addEventListener(
  "click",
  (event) => {
    if (!bgEdit.on) return;
    const nav = event.target.closest(
      ".content-nav-prev, .content-nav-next, .month-button, .top-nav-link, .brand, [data-view], .admin-nav-button",
    );
    if (!nav || bgPanel.contains(nav)) return;
    if (bgEdit.dirty) {
      event.preventDefault();
      event.stopPropagation();
      setBgStatus(
        "저장하지 않은 변경이 있습니다 — 저장하거나 ✕로 닫아 주세요.",
      );
      return;
    }
    // Clean session: close the editor first, then let the navigation proceed.
    exitBgEdit();
  },
  true,
);

// Refresh / tab close with unsaved edits — standard browser confirm.
window.addEventListener("beforeunload", (event) => {
  if (bgEdit.on && bgEdit.dirty) event.preventDefault();
});

// Admin-screen shortcut: jump to the selected level/month's 페이지2 and start
// editing right away (work rule: the admin screen mirrors the user screen).
const adminBgBtn = document.querySelector("#adminBgBtn");
if (adminBgBtn) {
  adminBgBtn.addEventListener("click", () => {
    state.level = adminState.level;
    state.month = adminState.month;
    monthLevelTag.textContent = levelLabel(state.level);
    updateContentMonthNumber();
    applyLevelTheme();
    setHash("content");
    showScreen("content");
    enterBgEdit();
  });
}
