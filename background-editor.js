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
const bgVideoInput = document.querySelector("#bgVideoUrl");
const bgVideoApply = document.querySelector("#bgVideoApply");
const bgVideoClear = document.querySelector("#bgVideoClear");
const bgElTools = document.querySelector("#bgElTools");
const bgBandToggle = document.querySelector("#bgBandToggle");
const bgBandOpts = document.querySelector("#bgBandOpts");
const bgBandModeInputs = [
  ...document.querySelectorAll('input[name="bgBandMode"]'),
];
const bgBandAnchorInputs = [
  ...document.querySelectorAll('input[name="bgBandAnchor"]'),
];
const bgSaveMonth = document.querySelector("#bgSaveMonth");
const bgSaveDefault = document.querySelector("#bgSaveDefault");
const bgDeleteOverride = document.querySelector("#bgDeleteOverride");
const bgSavePage1 = document.querySelector("#bgSavePage1");
const bgCloseBtn = document.querySelector("#bgEditorClose");
const bgGhostToggle = document.querySelector("#bgGhostToggle");
// The FAB is icon-only (SVG); keep its markup so the connection-failure
// text swap can restore it.
const bgFabIcon = bgFab.innerHTML;

const bgEdit = {
  on: false,
  screen: "", // "months" | "content" — key for applyPageBackground on exit
  page: "", // "page1" | "page2"
  data: { full: null, elements: [], videoUrl: null }, // working copy (saved only on demand)
  dirty: false,
  selected: -1, // index into data.elements
  discardArmed: false, // two-step "discard changes" on close
  saving: false, // guards double-click on save / delete-override
  videoNode: null, // live video preview node — survives canvas rebuilds
  videoNodeUrl: "", // URL the node was built from (rebuild only on change)
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
    : { full: null, elements: [], videoUrl: null };
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
    // A real <img> (object-fit:contain), NOT a CSS background: the panel-wide
    // `.bg-editor-panel button { background:#fafafa }` shorthand outranks
    // .bg-lib-thumb (0,1,1 vs 0,1,0) and resets background-size to auto,
    // which cropped large images to their top-left corner.
    const thumbImg = document.createElement("img");
    thumbImg.src = url;
    thumbImg.alt = item.name;
    thumbImg.loading = "lazy";
    thumb.append(thumbImg);
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

// Elements live in the content-anchored .page-bg-el-frame (same as the
// viewer — see positionBgElFrame in app.js), so what the admin places is
// what every breakpoint shows relative to the content column.
function bgElFrame() {
  return window.craBg.positionBgElFrame(bgEdit.screen);
}

function renderBgEditCanvas() {
  const layer = bgLayer();
  // Wipe everything EXCEPT the live video node — re-inserting an iframe
  // reloads it, which would visibly restart the video on every select/drag.
  [...layer.children].forEach((child) => {
    if (child !== bgEdit.videoNode) child.remove();
  });
  // Same readability scrim as the viewer (WYSIWYG) — video counts too.
  layer.classList.toggle(
    "has-full",
    Boolean(bgEdit.data.full || bgEdit.data.videoUrl),
  );
  if (bgEdit.data.full) {
    const full = document.createElement("div");
    full.className = "page-bg-full";
    full.style.backgroundImage = `url("${bgEdit.data.full}")`;
    // prepend keeps the viewer's DOM order (full → video → el-frame).
    layer.prepend(full);
  }
  syncBgVideoPreview(layer);
  bgFullClear.hidden = !bgEdit.data.full;
  bgFullHint.hidden = Boolean(bgEdit.data.full);
  bgVideoClear.hidden = !bgEdit.data.videoUrl;
  const frame = bgElFrame();
  bgEdit.data.elements.forEach((item, index) => {
    // Full-width bands are page-wide, so they hang off the layer just like
    // in the viewer; only free elements belong to the content frame.
    (item.fw ? layer : frame).append(bgEditShell(item, index));
  });
  bgElTools.hidden = bgEdit.selected < 0;
  syncBandControls();
}

// Shells live in two different parents now, so a NodeList index no longer
// matches the element index — look them up by the index they carry.
function bgShellAt(index) {
  return bgLayer().querySelector(`.bg-edit-el[data-bg-index="${index}"]`);
}

// Keep at most one video preview node alive across canvas rebuilds; rebuild
// only when the URL actually changed.
function syncBgVideoPreview(layer) {
  const url = bgEdit.data.videoUrl || "";
  if (bgEdit.videoNode && bgEdit.videoNodeUrl === url) return;
  if (bgEdit.videoNode) {
    bgEdit.videoNode.remove();
    bgEdit.videoNode = null;
  }
  bgEdit.videoNodeUrl = url;
  if (!url) return;
  const node = window.craBg.buildBgVideoLayer(url);
  if (!node) return;
  bgEdit.videoNode = node;
  layer.append(node);
  window.craBg.sizeBgVideoCover();
}

// One positioned wrapper per element: the img mirrors the viewer geometry
// (center-% left/top, width-%, rotate on the shell, flip on the img), plus
// resize/rotate handles when selected.
function bgEditShell(item, index) {
  const shell = document.createElement("div");
  shell.className = "bg-edit-el";
  if (index === bgEdit.selected) shell.classList.add("selected");
  shell.dataset.bgIndex = String(index);
  // Same explicit stacking as the viewer: bands sit in the layer and free
  // elements in the frame, so DOM order alone can't express the arrangement.
  shell.style.zIndex = String(index + 1);
  if (item.fw) fillBgBandShell(shell, item, index);
  else fillBgFreeShell(shell, item, index);
  shell.addEventListener("pointerdown", (event) => {
    if (event.target.classList.contains("bg-edit-handle")) return;
    selectBgElement(index);
    startBgDrag(event, index, "move");
  });
  return shell;
}

// Free element: center-% geometry inside the content frame, all three handles.
function fillBgFreeShell(shell, item, index) {
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
  if (index !== bgEdit.selected) return;
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

// Full-width band: exactly the viewer geometry (styleBgBand), so the canvas
// stays WYSIWYG. The width is locked to the page, so there is no resize or
// rotate handle; a tile band gets ONE height handle, on the edge opposite its
// anchor, so the edge being dragged is the one that follows the pointer.
function fillBgBandShell(shell, item, index) {
  if (item.fmode === "tile") {
    shell.classList.add("bg-edit-band--tile");
  } else {
    const img = document.createElement("img");
    img.src = item.src;
    img.alt = "";
    img.draggable = false;
    shell.append(img);
  }
  window.craBg.styleBgBand(shell, item);
  if (index !== bgEdit.selected || item.fmode !== "tile") return;
  const size = document.createElement("span");
  size.className = `bg-edit-handle bg-edit-band-size ${
    item.anchor === "top" ? "at-bottom" : "at-top"
  }`;
  size.title = "밴드 높이";
  shell.append(size);
  wireBgHandle(size, index, "band-size");
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
        bgFab.classList.add("bg-fab-wide");
        window.setTimeout(() => {
          bgFab.innerHTML = bgFabIcon;
          bgFab.classList.remove("bg-fab-wide");
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
  if (typeof bgEdit.data.videoUrl !== "string") bgEdit.data.videoUrl = null;
  bgEdit.dirty = false;
  bgEdit.selected = -1;
  bgEdit.discardArmed = false;
  // Any preview node from a previous session is already gone from the DOM
  // (exit repaints from cache) — drop the stale reference too.
  bgEdit.videoNode = null;
  bgEdit.videoNodeUrl = "";
  bgVideoInput.value = bgEdit.data.videoUrl || "";
  // page-bg-active turns on the tint hand-off CSS even before anything is
  // saved, so what the admin sees while editing is exactly what saving gives.
  document.body.classList.add("bg-editing", "page-bg-active");
  document.body.classList.toggle("bg-ghost", bgGhostToggle.checked);
  bgPanel.hidden = false;
  bgClampPanel();
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
// Live value badge, shared by the free-element and band drags.
let bgBadge = null;
function showBgBadge(move, text) {
  if (!bgBadge) {
    bgBadge = document.createElement("div");
    bgBadge.className = "bg-edit-badge";
    document.body.append(bgBadge);
  }
  bgBadge.style.left = `${move.clientX + 14}px`;
  bgBadge.style.top = `${move.clientY + 14}px`;
  bgBadge.textContent = text;
}
function hideBgBadge() {
  if (bgBadge) bgBadge.remove();
  bgBadge = null;
}

function startBgDrag(event, index, mode) {
  event.preventDefault();
  const item = bgEdit.data.elements[index];
  if (item.fw) {
    startBgBandDrag(event, index, mode);
    return;
  }
  // % geometry is relative to the content-anchored frame, not the layer.
  const rect = bgElFrame().getBoundingClientRect();
  const shell = bgShellAt(index);
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
  let moved = false;

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
      showBgBadge(move, `${Math.round(item.w)}%`);
    } else {
      const angle = Math.atan2(
        move.clientY - centerPx.y,
        move.clientX - centerPx.x,
      );
      let deg = start.r + ((angle - startAngle) * 180) / Math.PI;
      // Web-builder convention: Shift snaps rotation to 15° steps.
      if (move.shiftKey) deg = Math.round(deg / 15) * 15;
      item.r = Math.round(deg);
      showBgBadge(move, `${((item.r % 360) + 360) % 360}°`);
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
    hideBgBadge();
    // One clean re-render so handles/outline resync with the final geometry.
    if (moved) renderBgEditCanvas();
  }
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
}

// Bands only move on Y — the width is locked to the page — and only resize by
// band height. Both values are px measured from the anchored edge, which is
// exactly how they're stored, so the drag needs no unit conversion. The sign
// flips with the anchor so the grabbed edge always follows the pointer:
// on a bottom-anchored band, dragging UP increases the distance from the
// bottom (and, on the top handle, the height).
function startBgBandDrag(event, index, mode) {
  const item = bgEdit.data.elements[index];
  const shell = bgShellAt(index);
  const startY = event.clientY;
  const start = {
    off: Number(item.off) || 0,
    th: Number(item.th) || window.craBg.BG_BAND_TILE_HEIGHT,
  };
  const dir = item.anchor === "top" ? 1 : -1;
  let moved = false;

  function onMove(move) {
    if (!moved) {
      moved = true;
      bgMarkDirty();
    }
    const delta = (move.clientY - startY) * dir;
    if (mode === "band-size") {
      item.th = Math.min(2000, Math.max(8, Math.round(start.th + delta)));
      showBgBadge(move, `${item.th}px`);
    } else {
      item.off = Math.min(4000, Math.max(-4000, Math.round(start.off + delta)));
      showBgBadge(move, `${item.off}px`);
    }
    if (shell) window.craBg.styleBgBand(shell, item);
  }
  function onUp() {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    hideBgBadge();
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
    // A band ignores x/y, so nudge the one axis it does use instead.
    const copy = els[index].fw
      ? { ...els[index], off: (Number(els[index].off) || 0) + 12 }
      : { ...els[index], x: els[index].x + 3, y: els[index].y + 3 };
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

/* ---- 가로 100% (full-width band) controls ------------------------------- */

// Mirror the selected element's band settings into the panel.
function syncBandControls() {
  const item = bgEdit.data.elements[bgEdit.selected];
  if (!item) return;
  bgBandToggle.checked = Boolean(item.fw);
  bgBandOpts.hidden = !item.fw;
  const mode = item.fmode === "tile" ? "tile" : "stretch";
  bgBandModeInputs.forEach((input) => {
    input.checked = input.value === mode;
  });
  const anchor = item.anchor === "top" ? "top" : "bottom";
  bgBandAnchorInputs.forEach((input) => {
    input.checked = input.value === anchor;
  });
}

// Turning 가로 100% ON keeps the element roughly where it already is: anchor
// to whichever page edge is nearer and store that distance in px. x/y/w/r are
// left untouched, so unchecking restores the original placement exactly.
bgBandToggle.addEventListener("change", () => {
  const item = bgEdit.data.elements[bgEdit.selected];
  if (!item) return;
  if (!bgBandToggle.checked) {
    item.fw = false;
  } else {
    const shell = bgShellAt(bgEdit.selected);
    const layerRect = bgLayer().getBoundingClientRect();
    const rect = shell ? shell.getBoundingClientRect() : layerRect;
    const fromBottom = layerRect.bottom - rect.bottom;
    const fromTop = rect.top - layerRect.top;
    item.fw = true;
    item.fmode = item.fmode === "tile" ? "tile" : "stretch";
    item.anchor = fromBottom <= fromTop ? "bottom" : "top";
    item.off = Math.max(
      0,
      Math.round(item.anchor === "bottom" ? fromBottom : fromTop),
    );
    item.th =
      Math.max(8, Math.round(rect.height)) || window.craBg.BG_BAND_TILE_HEIGHT;
  }
  bgMarkDirty();
  renderBgEditCanvas();
});

bgBandModeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    const item = bgEdit.data.elements[bgEdit.selected];
    if (!item || !input.checked) return;
    item.fmode = input.value;
    if (item.fmode === "tile" && !item.th)
      item.th = window.craBg.BG_BAND_TILE_HEIGHT;
    bgMarkDirty();
    renderBgEditCanvas();
  });
});

bgBandAnchorInputs.forEach((input) => {
  input.addEventListener("change", () => {
    const item = bgEdit.data.elements[bgEdit.selected];
    if (!item || !input.checked) return;
    // Re-measure first so switching the anchor doesn't teleport the band:
    // the pixels stay put, they're just expressed from the other edge.
    const shell = bgShellAt(bgEdit.selected);
    if (shell) {
      const rect = shell.getBoundingClientRect();
      const layerRect = bgLayer().getBoundingClientRect();
      item.off = Math.round(
        input.value === "top"
          ? rect.top - layerRect.top
          : layerRect.bottom - rect.bottom,
      );
    }
    item.anchor = input.value;
    bgMarkDirty();
    renderBgEditCanvas();
  });
});

bgFullClear.addEventListener("click", () => {
  bgEdit.data.full = null;
  bgMarkDirty();
  renderBgEditCanvas();
});

// 영상 URL: [적용] (or Enter) commits the input. An unsupported shape only
// shows a status message — it never dirties the session.
function bgApplyVideoUrl() {
  const raw = bgVideoInput.value.trim();
  if (!raw) {
    if (!bgEdit.data.videoUrl) return;
    bgEdit.data.videoUrl = null;
    bgMarkDirty();
    renderBgEditCanvas();
    return;
  }
  if (!window.craBg.parseBgVideoUrl(raw)) {
    setBgStatus(
      "지원하지 않는 주소입니다 — YouTube / Vimeo / mp4·webm URL만 가능합니다.",
    );
    return;
  }
  if (bgEdit.data.videoUrl === raw) return;
  bgEdit.data.videoUrl = raw;
  bgMarkDirty();
  renderBgEditCanvas();
}

bgVideoApply.addEventListener("click", bgApplyVideoUrl);

bgVideoInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  bgApplyVideoUrl();
});

bgVideoClear.addEventListener("click", () => {
  bgVideoInput.value = "";
  bgEdit.data.videoUrl = null;
  bgMarkDirty();
  renderBgEditCanvas();
});

// Clicking empty layer space clears the selection. (The el-frame itself is
// pointer-events:none, so empty clicks over it land on the layer.)
document.addEventListener("pointerdown", (event) => {
  if (!bgEdit.on) return;
  const target = event.target;
  if (
    target === bgLayer() ||
    target.classList.contains("page-bg-full") ||
    target.classList.contains("page-bg-el-frame")
  ) {
    bgEdit.selected = -1;
    renderBgEditCanvas();
  }
});

function exitBgEdit() {
  bgEdit.on = false;
  bgEdit.videoNode = null;
  bgEdit.videoNodeUrl = "";
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

// The panel drags by its header like a floating window, so elements placed
// near the right screen edge (previously hidden under the docked panel) can
// be positioned precisely. First drag freezes the auto top/right/bottom
// geometry into explicit left/top + a fixed height, then the pointer moves
// it, clamped to the viewport.
const bgPanelHead = bgPanel.querySelector(".bg-editor-head");
bgPanelHead.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  event.preventDefault();
  const rect = bgPanel.getBoundingClientRect();
  bgPanel.style.height = `${rect.height}px`;
  bgPanel.style.right = "auto";
  bgPanel.style.bottom = "auto";
  const grabX = event.clientX - rect.left;
  const grabY = event.clientY - rect.top;
  function move(ev) {
    const x = Math.min(
      Math.max(ev.clientX - grabX, 0),
      Math.max(0, window.innerWidth - rect.width),
    );
    const y = Math.min(
      Math.max(ev.clientY - grabY, 0),
      Math.max(0, window.innerHeight - rect.height),
    );
    bgPanel.style.left = `${x}px`;
    bgPanel.style.top = `${y}px`;
  }
  function up() {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
  }
  move(event);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
});

// A dragged position persists across close/re-open (inline styles). If the
// viewport shrank in between, pull the panel back inside so it stays
// reachable.
function bgClampPanel() {
  if (!bgPanel.style.left) return;
  const rect = bgPanel.getBoundingClientRect();
  const maxH = window.innerHeight - 24;
  if (rect.height > maxH) bgPanel.style.height = `${maxH}px`;
  const w = Math.min(rect.width, window.innerWidth);
  const h = Math.min(rect.height, maxH);
  bgPanel.style.left = `${Math.min(
    Math.max(parseFloat(bgPanel.style.left), 0),
    Math.max(0, window.innerWidth - w),
  )}px`;
  bgPanel.style.top = `${Math.min(
    Math.max(parseFloat(bgPanel.style.top), 0),
    Math.max(0, window.innerHeight - h),
  )}px`;
}

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
  if (item.fw) {
    // Bands move on Y only, in px. `off` grows AWAY from its anchored edge,
    // so "up on screen" adds for a bottom anchor and subtracts for a top one.
    const step = (event.shiftKey ? 10 : 1) * (item.anchor === "top" ? -1 : 1);
    const off = Number(item.off) || 0;
    if (event.key === "ArrowUp") item.off = off + step;
    else if (event.key === "ArrowDown") item.off = off - step;
    else handled = false;
  } else if (event.key === "ArrowLeft") item.x = Math.max(-50, item.x - nudge);
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
    videoUrl: bgEdit.data.videoUrl || null,
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
  // Saving usually means the admin is done — one confirm, then close.
  // (Cancel keeps the session open; the status line above stays visible.)
  const closeAsk = overridden
    ? `기본값 저장 완료 — 단, ${state.month}은 개별 설정이 있어 이 화면에는 보이지 않습니다.\n편집 창을 닫을까요?`
    : "저장 완료. 편집 창을 닫을까요?";
  if (window.confirm(closeAsk)) exitBgEdit();
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
