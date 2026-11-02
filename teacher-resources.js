/* ==== Teacher resources (교사 자료실, 2026-10-29) ==========================
   Loaded AFTER app.js as a classic script, so it shares app.js's top-level
   lexical scope (sb, state, isAdmin, showScreen, setHash, applyLevelTheme,
   monthLevelTag, canSeeTeacherResources) the way hero-banner.js does.

   Three parts:
   - the '교사 자료실' button on every level's month page — admins and LMS
     branch (1) / teacher (2) accounts only (body.can-teacher-res, set by
     updateAdminUI on every login / logout / restore);
   - the level's resource page (#resources/<level>): the month page itself in
     another mode — body[data-screen="resources"] swaps its 3~12월 buttons for
     3-4 resource cards, so the header, title, colors and background are the
     month page's by construction;
   - the admin section in the 배너 tab: 4 levels, 14 slots, upload / replace /
     delete (the admin mirror of the resource pages).

   Files live in the PRIVATE Storage bucket "teacher-resources" (10 MB, PDF /
   xlsx / xls); the table is reached only through RPCs (supabase/migration.sql
   "Teacher resources"), which answer nothing to anyone else. A download asks
   the Edge Function teacher-resource-download (supabase/functions/) with just
   {level, slot} — lmsFetch adds the LMS token, supabase-js the admin's JWT.
   The function decides who may, picks the slot's current file, counts the
   daily limit (30 per LMS member per KST day) and returns a URL that expires
   after 15 seconds (fixed on the server) with the original name already in
   it as `download=`. This page follows it in THIS tab: the Storage API
   answers with Content-Disposition: attachment, so the browser saves the file
   and the page stays (no new tab, no navigation, no CORS needed).

   D64 (2026-11-02): a slot may hold a Google Drive file instead (the admin's
   file shared "anyone with the link"; only its ID is stored, drive_id). Its
   card's 내려받기 is a plain link to Google's download address in a new tab —
   no Storage traffic, no Edge Function, no daily limit. */

const RES_BUCKET = "teacher-resources";
const RES_MAX_BYTES = 10 * 1024 * 1024; // = the bucket's file_size_limit
// The slots in card order (D63, 2026-11-02): 월간교육안 is new (monthly);
// plan = 연간교육안 — the old '월간.연간교육안' slot key, kept so the files
// already uploaded (rows and Storage paths <level>/plan/…) stay put.
// Beginner / Level 1: 3 slots, Level 2 / 3: 4 (test) — 14 in all.
const RES_SLOTS = [
  { slot: "monthly", label: "월간교육안" },
  { slot: "plan", label: "연간교육안" },
  { slot: "award", label: "상장" },
  { slot: "test", label: "테스트", levels: ["level-2", "level-3"] },
];
const RES_TYPES = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
};
const RES_FUNCTION = "teacher-resource-download";
const RES_MSG = {
  needLogin: "다시 로그인해 주세요.",
  failed: "내려받지 못했어요. 잠시 후 다시 시도해 주세요.",
  limit: "오늘 다운로드 횟수를 모두 사용했습니다. 내일 다시 시도해 주세요.",
  notReady: "아직 준비 중이에요.",
  listFailed: "자료 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
};
// The function's refusals → what the teacher reads (anything else: failed).
const RES_STATUS_MSG = { 401: "needLogin", 404: "notReady", 429: "limit" };

// D64: a Google Drive file ID (= the SQL check teacher_resources_drive_ok).
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{25,64}$/;
const DRIVE_MSG = {
  help: "구글 드라이브 → 공유 → '링크가 있는 모든 사용자' → 링크 복사 후 붙여 넣기",
  docs: "PDF나 엑셀 파일로 드라이브에 올린 뒤 그 파일 링크를 넣어 주세요",
  bad: "구글 드라이브 파일 링크만 넣을 수 있어요.",
};

const teacherResBtn = document.querySelector("#teacherResBtn");
const resourceBackBtn = document.querySelector("#resourceBackBtn");
const resourceGrid = document.querySelector("#resourceGrid");
const resourceStatus = document.querySelector("#resourceStatus");
const teacherResAdminList = document.querySelector("#teacherResAdminList");
const teacherResStatus = document.querySelector("#teacherResStatus");

// The slots a level has, in button order (test = Level 2 / 3 only).
function resourceSlots(level) {
  return RES_SLOTS.filter(
    (item) => !item.levels || item.levels.includes(level),
  );
}

function resourceExt(name) {
  const match = String(name || "").match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

// A row's Drive file ID — only when the slot holds no uploaded file.
function resourceDriveId(row) {
  const id = row && !row.file_name ? row.drive_id : "";
  return typeof id === "string" && DRIVE_ID_RE.test(id) ? id : "";
}

// Google's direct download (teachers) and the file's page (admin check).
function driveDownloadUrl(id) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
}

function driveViewUrl(id) {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

// A pasted share link → { id } or { error: "docs" | "bad" }. Accepted, on
// drive.google.com only: /file/d/<ID>/… (also /file/u/<n>/d/<ID>/…),
// /open?id=<ID>, /uc?…id=<ID>. A Google Docs / Sheets / Slides page is not a
// file to download — those get their own message.
function driveIdFromLink(text) {
  let raw = String(text || "").trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new window.URL(raw);
  } catch {
    return { error: "bad" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "bad" };
  }
  if (url.hostname === "docs.google.com") return { error: "docs" };
  if (url.hostname !== "drive.google.com") return { error: "bad" };
  const file = url.pathname.match(/^\/file\/(?:u\/\d+\/)?d\/([^/]+)/);
  let id = file ? file[1] : "";
  if (!file && (url.pathname === "/open" || url.pathname === "/uc")) {
    id = url.searchParams.get("id") || "";
  }
  return DRIVE_ID_RE.test(id) ? { id } : { error: "bad" };
}

// "pdf" | "excel" | "file" — what the card's icon and meta line say.
function resourceKind(name) {
  const ext = resourceExt(name);
  if (ext === "pdf") return "pdf";
  return ext === "xlsx" || ext === "xls" ? "excel" : "file";
}

/* ---- Resource page ------------------------------------------------------ */
/* D58 (2026-11-02): one card per slot, one per row — file icon (PDF / Excel)
   · title + "PDF · 1.2MB · 11/02 업데이트" · [내려받기]. A slot without a
   file says so instead (a notice, not a button). The title is the slot's
   fixed label (RES_SLOTS — the admin section shows the same one). */

const RES_KIND_TEXT = { pdf: "PDF", excel: "엑셀" }; // the meta line
const RES_ICON_TEXT = { pdf: "PDF", excel: "XLS", drive: "LINK" }; // in the icon
const RES_EMPTY_TEXT = "아직 올라온 자료가 없어요";
const RES_SVG_NS = "http://www.w3.org/2000/svg";
// A page with a folded corner, then what is on it: text lines (PDF), a
// table grid (Excel) or an arrow out (a Google Drive link, D64); nothing on
// an empty slot's page.
const RES_ICON_PATHS = {
  page: [
    "M7 3h8l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
    "M15 3v5h5",
  ],
  pdf: ["M8.5 12.5h7", "M8.5 15.5h7", "M8.5 18.5h4"],
  excel: ["M8.5 11.5h7v7h-7Z", "M8.5 15h7", "M12 11.5v7"],
  drive: ["M9 18.5 15.5 12", "M11 12h4.5v4.5"],
};

let resLoad = 0; // bumped per open: a late list for another level is dropped

function setResourceStatus(text) {
  if (resourceStatus) resourceStatus.textContent = text || "";
}

// 1.2MB / 840KB; nothing for a size the server did not give.
function formatResSizeShort(bytes) {
  const n = Number(bytes);
  if (!bytes || !Number.isFinite(n) || n <= 0) return "";
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(n / 1024))}KB`;
}

// MM/DD in the viewer's time (Korea); nothing without a date.
function formatResDay(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

function resourceIcon(kind) {
  const box = document.createElement("span");
  box.className = "res-icon";
  box.dataset.kind = kind;
  box.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS(RES_SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("focusable", "false");
  [...RES_ICON_PATHS.page, ...(RES_ICON_PATHS[kind] || [])].forEach((d) => {
    const path = document.createElementNS(RES_SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  });
  box.append(svg);
  if (RES_ICON_TEXT[kind]) {
    const label = document.createElement("span");
    label.className = "res-icon-label";
    label.textContent = RES_ICON_TEXT[kind];
    box.append(label);
  }
  return box;
}

// The title, kept whole word by word: it may wrap only at a space — never
// inside a word such as "월간.연간교육안" (no "월간. / 연간교육안").
function resourceTitle(label) {
  const title = document.createElement("strong");
  title.className = "res-name";
  String(label)
    .split(" ")
    .forEach((word, i) => {
      if (i) title.append(" ");
      const part = document.createElement("span");
      part.className = "res-word";
      part.textContent = word;
      title.append(part);
    });
  return title;
}

// The 내려받기 icon + text (a button for a file, a link for a Drive file).
function downloadLabel() {
  const icon = document.createElementNS(RES_SVG_NS, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  icon.classList.add("res-download-icon");
  ["M12 4v11", "m7 10 5 5 5-5", "M5 20h14"].forEach((d) => {
    const path = document.createElementNS(RES_SVG_NS, "path");
    path.setAttribute("d", d);
    icon.append(path);
  });
  const label = document.createElement("span");
  label.textContent = "내려받기";
  return [icon, label];
}

// rows = the teacher_resources_list answer, or null while it loads.
function renderResourceButtons(level, rows) {
  if (!resourceGrid) return;
  resourceGrid.replaceChildren(
    ...resourceSlots(level).map((item) => {
      const row = rows && rows.find((r) => r.slot === item.slot);
      const file = row && row.file_name;
      const drive = resourceDriveId(row);
      const kind = file ? resourceKind(file) : drive ? "drive" : "none";
      const card = document.createElement("div");
      card.className = "res-card";
      card.dataset.slot = item.slot;
      card.dataset.state = file || drive ? "ready" : rows ? "empty" : "loading";

      const text = document.createElement("div");
      text.className = "res-text";
      const meta = document.createElement("span");
      meta.className = "res-meta";
      if (file) {
        const day = formatResDay(row.updated_at);
        meta.textContent = [
          RES_KIND_TEXT[kind],
          formatResSizeShort(row.file_size),
          day && `${day} 업데이트`,
        ]
          .filter(Boolean)
          .join(" · ");
      } else if (drive) {
        const day = formatResDay(row.updated_at);
        meta.textContent = ["구글 드라이브", day && `${day} 업데이트`]
          .filter(Boolean)
          .join(" · ");
      } else if (rows) {
        meta.textContent = "준비 중";
      }
      text.append(resourceTitle(item.label), meta);
      card.append(resourceIcon(kind), text);

      if (file) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "res-download";
        button.dataset.slot = item.slot;
        button.setAttribute("aria-label", `${item.label} 내려받기`);
        button.append(...downloadLabel());
        card.append(button);
      } else if (drive) {
        // Straight from Google, in a new tab (D64) — this page stays.
        const link = document.createElement("a");
        link.className = "res-download";
        link.href = driveDownloadUrl(drive);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", `${item.label} 내려받기 (새 탭)`);
        link.append(...downloadLabel());
        card.append(link);
      } else if (rows) {
        const empty = document.createElement("p");
        empty.className = "res-empty";
        empty.textContent = RES_EMPTY_TEXT;
        card.append(empty);
      }
      return card;
    }),
  );
}

function showMonthsFor(level) {
  state.level = level;
  state.month = "";
  monthLevelTag.textContent = levelLabel(level);
  applyLevelTheme();
  setHash("months");
  showScreen("months");
}

async function openTeacherResources(level) {
  if (!canSeeTeacherResources() || !sb) {
    showMonthsFor(level);
    return;
  }
  state.level = level;
  state.month = "";
  monthLevelTag.textContent = levelLabel(level);
  applyLevelTheme();
  setResourceStatus("");
  renderResourceButtons(level, null);
  setHash("resources");
  showScreen("resources");
  const load = (resLoad += 1);
  const { data, error } = await sb.rpc("teacher_resources_list", {
    p_level: level,
  });
  if (load !== resLoad) return;
  if (error || !Array.isArray(data)) {
    renderResourceButtons(level, []);
    setResourceStatus(RES_MSG.listFailed);
    return;
  }
  // No rows = the server does not see a teacher / admin (session ended).
  if (!data.length) setResourceStatus(RES_MSG.needLogin);
  renderResourceButtons(level, data);
}

// Follow the signed URL in this tab. The response is an attachment, so the
// browser saves it and the page stays where it is.
function followDownload(url) {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
}

async function downloadResource(level, slot, button) {
  if (!sb || button.dataset.busy) return;
  button.dataset.busy = "1";
  setResourceStatus("");
  try {
    const { data, error } = await sb.functions.invoke(RES_FUNCTION, {
      body: { level, slot },
    });
    if (error || !data || typeof data.url !== "string") {
      // An HTTP refusal carries its Response in error.context; a network or
      // relay failure has none.
      const status = error && error.context && error.context.status;
      setResourceStatus(RES_MSG[RES_STATUS_MSG[status] || "failed"]);
      return;
    }
    followDownload(data.url);
  } catch {
    setResourceStatus(RES_MSG.failed);
  } finally {
    delete button.dataset.busy;
  }
}

if (teacherResBtn) {
  teacherResBtn.addEventListener("click", () =>
    openTeacherResources(state.level),
  );
}
if (resourceBackBtn) {
  resourceBackBtn.addEventListener("click", () => showMonthsFor(state.level));
}
if (resourceGrid) {
  resourceGrid.addEventListener("click", (event) => {
    // a Drive slot's link (an <a>) just opens Google — only buttons ask
    const button = event.target.closest("button.res-download");
    if (!button || button.disabled) return;
    downloadResource(state.level, button.dataset.slot, button);
  });
}

/* ---- Admin: 배너 tab section -------------------------------------------- */

let resAdminLoad = 0;
let resAdminBusy = false;

function setTeacherResStatus(text) {
  if (teacherResStatus) teacherResStatus.textContent = text || "";
}

function formatResSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function formatResDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Two presses, no dialog: the first arms the button for a few seconds (its
// text says what the second press does), the second one runs `action`.
function armTwice(button, armedText, action) {
  const idle = button.textContent;
  let disarm = 0;
  button.addEventListener("click", () => {
    if (button.dataset.armed) {
      window.clearTimeout(disarm);
      delete button.dataset.armed;
      button.textContent = idle;
      action();
      return;
    }
    button.dataset.armed = "1";
    button.textContent = armedText;
    disarm = window.setTimeout(() => {
      delete button.dataset.armed;
      button.textContent = idle;
    }, 4000);
  });
}

function adminButton(className, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  return button;
}

function buildResAdminRow(level, item, row) {
  const file = row && row.file_name;
  const drive = resourceDriveId(row);
  const el = document.createElement("div");
  el.className = "res-admin-row";
  el.dataset.level = level;
  el.dataset.slot = item.slot;

  const label = document.createElement("span");
  label.className = "res-admin-slot";
  label.textContent = item.label;

  const info = document.createElement("span");
  info.className = "res-admin-file";
  if (file) {
    info.textContent = `${file} · ${formatResSize(row.file_size)} · ${formatResDate(row.updated_at)}`;
  } else if (drive) {
    info.textContent = ["구글 드라이브", formatResDate(row.updated_at)]
      .filter(Boolean)
      .join(" · ");
  } else {
    info.textContent = "파일 없음";
  }

  const actions = document.createElement("span");
  actions.className = "res-admin-actions";
  if (drive) {
    // Check the linked file the way a teacher reaches it: Google, new tab.
    const open = document.createElement("a");
    open.className = "res-admin-open";
    open.href = driveViewUrl(drive);
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "링크 열기";
    actions.append(open);
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".pdf,.xlsx,.xls";
  input.hidden = true;
  input.addEventListener("change", () => {
    const picked = input.files && input.files[0];
    input.value = "";
    if (picked) uploadResource(level, item.slot, picked);
  });
  const upload = adminButton("res-admin-upload", file ? "교체" : "업로드");
  // A file over a Drive link switches the slot's kind (the link goes): ask
  // twice. The second press is still a click, so the file picker opens.
  if (drive)
    armTwice(upload, "한 번 더 누르면 파일로 바꾸기", () => input.click());
  else upload.addEventListener("click", () => input.click());
  const link = adminButton("res-admin-drive", "드라이브 링크");
  link.setAttribute("aria-expanded", "false");
  link.addEventListener("click", () =>
    toggleDriveEditor(el, level, item.slot, Boolean(file), link),
  );
  actions.append(upload, link);
  if (file || drive) {
    const remove = adminButton("res-admin-delete", "삭제");
    armTwice(remove, "한 번 더 누르면 삭제", () =>
      clearResource(level, item.slot, Boolean(drive)),
    );
    actions.append(remove);
  }
  actions.append(input);
  el.append(label, info, actions);
  return el;
}

/* D64: the Drive link box, inside its row — one open at a time. Saving
   reloads the list, which also closes it. */
let resDriveEditor = null; // { form, opener }

function closeDriveEditor() {
  if (!resDriveEditor) return;
  resDriveEditor.form.remove();
  resDriveEditor.opener.setAttribute("aria-expanded", "false");
  resDriveEditor = null;
}

function toggleDriveEditor(rowEl, level, slot, hasFile, opener) {
  const same = resDriveEditor && resDriveEditor.opener === opener;
  closeDriveEditor();
  if (same) return;

  const form = document.createElement("form");
  form.className = "res-drive-editor";
  form.noValidate = true;
  const line = document.createElement("div");
  line.className = "res-drive-line";
  const input = document.createElement("input");
  input.type = "url";
  input.className = "res-drive-input";
  input.placeholder = "https://drive.google.com/file/d/…";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("aria-label", "구글 드라이브 파일 링크");
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "res-drive-save";
  save.textContent = "저장";
  const cancel = adminButton("res-drive-cancel", "취소");
  line.append(input, save, cancel);
  const help = document.createElement("p");
  help.className = "res-drive-help";
  help.textContent = DRIVE_MSG.help;
  const message = document.createElement("p");
  message.className = "res-drive-msg";
  message.setAttribute("aria-live", "polite");
  form.append(line, help, message);

  let disarm = 0;
  const disarmSave = () => {
    window.clearTimeout(disarm);
    delete save.dataset.armed;
    save.textContent = "저장";
  };
  const close = () => {
    closeDriveEditor();
    opener.focus();
  };
  input.addEventListener("input", () => {
    message.textContent = "";
    disarmSave();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const parsed = driveIdFromLink(input.value);
    if (!parsed.id) {
      disarmSave();
      message.textContent = DRIVE_MSG[parsed.error];
      input.focus();
      return;
    }
    message.textContent = "";
    // A link over an uploaded file switches the slot's kind (the file is
    // deleted): the first 저장 only says so.
    if (hasFile && !save.dataset.armed) {
      save.dataset.armed = "1";
      save.textContent = "한 번 더 누르면 링크로 바꾸기";
      disarm = window.setTimeout(disarmSave, 4000);
      return;
    }
    disarmSave();
    saveDriveLink(level, slot, parsed.id);
  });
  cancel.addEventListener("click", close);
  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
  rowEl.append(form);
  opener.setAttribute("aria-expanded", "true");
  resDriveEditor = { form, opener };
  input.focus();
}

async function saveDriveLink(level, slot, id) {
  if (!sb || !isAdmin || resAdminBusy) return;
  resAdminBusy = true;
  setTeacherResStatus("저장 중…");
  try {
    const { data: old, error } = await sb.rpc("teacher_resource_set_drive", {
      p_level: level,
      p_slot: slot,
      p_drive_id: id,
    });
    if (error) {
      setTeacherResStatus("저장하지 못했어요.");
      return;
    }
    // The row is on the link now; only then the file it replaced goes.
    if (old) {
      const { error: rmError } = await sb.storage
        .from(RES_BUCKET)
        .remove([old]);
      if (rmError) {
        setTeacherResStatus(
          "링크를 저장했어요. (이전 파일은 저장소에서 지우지 못했지만, 선생님은 링크로만 받아요.)",
        );
        return;
      }
    }
    setTeacherResStatus("링크를 저장했어요.");
  } catch {
    setTeacherResStatus("저장하지 못했어요.");
  } finally {
    resAdminBusy = false;
    loadResourceAdmin();
  }
}

async function loadResourceAdmin() {
  if (!sb || !isAdmin || !teacherResAdminList) return;
  const load = (resAdminLoad += 1);
  const answers = await Promise.all(
    LEVELS.map(({ key }) => sb.rpc("teacher_resources_list", { p_level: key })),
  );
  if (load !== resAdminLoad) return;
  if (answers.some((answer) => answer.error)) {
    setTeacherResStatus(RES_MSG.listFailed);
  }
  resDriveEditor = null; // its row is redrawn below
  teacherResAdminList.replaceChildren(
    ...LEVELS.map(({ key, label }, i) => {
      const rows = Array.isArray(answers[i].data) ? answers[i].data : [];
      const group = document.createElement("section");
      group.className = "res-admin-level";
      const title = document.createElement("h3");
      title.textContent = label;
      group.append(
        title,
        ...resourceSlots(key).map((item) =>
          buildResAdminRow(
            key,
            item,
            rows.find((r) => r.slot === item.slot),
          ),
        ),
      );
      return group;
    }),
  );
}

async function uploadResource(level, slot, file) {
  if (!sb || !isAdmin || resAdminBusy) return;
  const ext = resourceExt(file.name);
  const type = RES_TYPES[ext];
  if (!type) {
    setTeacherResStatus("PDF 또는 엑셀(xlsx, xls) 파일만 올릴 수 있어요.");
    return;
  }
  if (file.size > RES_MAX_BYTES) {
    setTeacherResStatus("10MB 이하 파일만 올릴 수 있어요.");
    return;
  }
  if (!file.size) {
    setTeacherResStatus("빈 파일은 올릴 수 없어요.");
    return;
  }
  resAdminBusy = true;
  setTeacherResStatus("업로드 중…");
  // ASCII path; the original (Korean) name goes to the table.
  const path = `${level}/${slot}/${Date.now()}.${ext}`;
  const bucket = sb.storage.from(RES_BUCKET);
  try {
    // Bytes + an explicit type: supabase-js sends a File as multipart, where
    // only the part's own type reaches Storage — and some systems give xlsx
    // an empty type, which the bucket's MIME list would refuse.
    const bytes = await file.arrayBuffer();
    const { error: upError } = await bucket.upload(path, bytes, {
      contentType: type,
      upsert: false,
    });
    if (upError) {
      setTeacherResStatus("업로드하지 못했어요.");
      return;
    }
    const { data: old, error: setError } = await sb.rpc(
      "teacher_resource_set",
      {
        p_level: level,
        p_slot: slot,
        p_path: path,
        p_name: file.name,
        p_size: file.size,
      },
    );
    if (setError) {
      await bucket.remove([path]); // nothing points at it — take it back
      setTeacherResStatus("업로드하지 못했어요.");
      return;
    }
    // Only now, with the row on the new file, the replaced one goes.
    if (old) {
      const { error: rmError } = await bucket.remove([old]);
      if (rmError) {
        // The old object is no longer any slot's file, so the download
        // function never signs it (teacher_resource_issue: current files only).
        setTeacherResStatus(
          "올렸어요. (이전 파일은 저장소에서 지우지 못했지만, 선생님은 새 파일만 받을 수 있어요.)",
        );
        return;
      }
    }
    setTeacherResStatus("올렸어요.");
  } catch {
    setTeacherResStatus("업로드하지 못했어요.");
  } finally {
    resAdminBusy = false;
    loadResourceAdmin();
  }
}

// wasDrive: the slot held a Google Drive link — only the link goes; the file
// and its sharing stay in Google Drive, so the message says so.
async function clearResource(level, slot, wasDrive = false) {
  if (!sb || !isAdmin || resAdminBusy) return;
  resAdminBusy = true;
  setTeacherResStatus("삭제 중…");
  try {
    const { data: old, error } = await sb.rpc("teacher_resource_clear", {
      p_level: level,
      p_slot: slot,
    });
    if (error) {
      setTeacherResStatus("삭제하지 못했어요.");
      return;
    }
    if (old) {
      const { error: rmError } = await sb.storage
        .from(RES_BUCKET)
        .remove([old]);
      if (rmError) {
        setTeacherResStatus(
          "삭제했어요. (저장소의 파일은 지우지 못했지만, 선생님은 더 이상 받을 수 없어요.)",
        );
        return;
      }
    }
    setTeacherResStatus(
      wasDrive
        ? "링크를 지웠어요. (구글 드라이브의 파일과 공유는 그대로예요.)"
        : "삭제했어요.",
    );
  } catch {
    setTeacherResStatus("삭제하지 못했어요.");
  } finally {
    resAdminBusy = false;
    loadResourceAdmin();
  }
}

// Opening the 배너 tab loads the current files.
document
  .querySelectorAll('.admin-menu-btn[data-admin-view="banner"]')
  .forEach((btn) => {
    btn.addEventListener("click", () => {
      setTeacherResStatus("");
      loadResourceAdmin();
    });
  });

/* ---- #resources/<level> deep link ---------------------------------------
   app.js opened the month page (and already swapped an old level key in the
   hash). Once the sign-in is known: an allowed visitor moves on to the
   resource page; anyone else gets #months/<level> in the address. */
window.craTeacherRes = { ready: false, open: openTeacherResources };

window.craAuthReady.then(() => {
  const [route, raw] = window.location.hash.slice(1).split("/");
  let level = null;
  try {
    level =
      route === "resources" ? levelFromAny(decodeURIComponent(raw)) : null;
  } catch {
    level = null;
  }
  if (level) {
    if (canSeeTeacherResources()) {
      openTeacherResources(level);
    } else {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#months/${level}`,
      );
    }
  }
  window.craTeacherRes.ready = true;
});
