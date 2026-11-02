/* LMS admin views (Phase 3.3): 회원 · 반 · 지사 on the admin screen.
   Classic script loaded after app.js (one shared global scope): it reads
   sb, isAdmin, state, adminRole and registers a loader per view in
   adminViewOpeners (app.js setAdminView runs it whenever the view opens).

   What each caller sees and may do follows decision D45 (+ D51, D52); the
   page only hides what a caller cannot do — every change is an lms_* RPC
   (supabase/migration.sql "LMS (Phase 3B)") that checks the caller again and
   answers 42501 otherwise. No password, hash or token is ever shown or kept:
   the password boxes are type=password and are emptied after use. */

/* exported lmsAdmin */

const ROLE_LABELS = { 1: "지사 계정", 2: "선생님", 3: "학생" };
const LMS_MSG = {
  denied: "권한이 없어요.",
  failed: "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
  loadFailed: "목록을 불러오지 못했어요.",
  login_id: "아이디는 2~20자로, 한글·영문 소문자·숫자·. _ - 만 쓸 수 있어요.",
  password: "비밀번호는 4~10자로, 띄어쓰기 없이 영문·숫자·기호로 써 주세요.",
  display_name: "이름은 40자까지 쓸 수 있어요.",
  branch: "지사를 고르세요.",
  name: "이름을 1~40자로 써 주세요.",
  teacher: "그 지사의 선생님만 담당으로 정할 수 있어요.",
  member: "그 반에는 같은 지사의 학생만 넣을 수 있어요.",
  code: "코드는 2~20자로, 영문 소문자·숫자·- 만 쓸 수 있어요.",
  duplicateName: "같은 이름이 이미 있어요.",
  duplicateCode: "같은 코드가 이미 있어요.",
  moveDenied:
    "다른 선생님 반에도 있는 학생이라 지사 계정·최고관리자만 옮길 수 있어요.",
};

// Everything the three views show, loaded together (small lists).
const lmsAdmin = {
  members: [], // lms_member_list (the caller's scope, no password hash)
  classes: [], // classes the caller can read (RLS)
  branches: [], // branches the caller can read (RLS: admin all, else its own)
  managed: new Set(), // class ids the caller manages (all for the admin)
  openPanels: new Set(), // classes whose student panel is open
  load: 0,
};

const $ = (id) => document.getElementById(id);
const lmsMemberList = $("lmsMemberList");
const lmsMemberStatus = $("lmsMemberStatus");
const lmsMemberForm = $("lmsMemberForm");
const lmsNewBranch = $("lmsNewBranch");
const lmsNewRole = $("lmsNewRole");
const lmsNewId = $("lmsNewId");
const lmsNewPw = $("lmsNewPw");
const lmsNewName = $("lmsNewName");
const lmsMemberSuggest = $("lmsMemberSuggest");
const lmsMemberSuggestText = $("lmsMemberSuggestText");
const lmsMemberSuggestBtn = $("lmsMemberSuggestBtn");
const lmsMemberBranchFilterRow = $("lmsMemberBranchFilterRow");
const lmsMemberBranchFilter = $("lmsMemberBranchFilter");
const lmsMemberClassFilter = $("lmsMemberClassFilter");
const lmsMemberRoleFilterRow = $("lmsMemberRoleFilterRow");
const lmsMemberRoleFilter = $("lmsMemberRoleFilter");
const lmsMemberSearch = $("lmsMemberSearch");
const signupBox = $("signupBox");
const memberEditModal = $("memberEditModal");
const memberEditSub = $("memberEditSub");
const memberEditIdRow = $("memberEditIdRow");
const memberEditId = $("memberEditId");
const memberEditName = $("memberEditName");
const memberEditPw = $("memberEditPw");
const memberEditStatus = $("memberEditStatus");
const memberEditSuggest = $("memberEditSuggest");
const memberEditSave = $("memberEditSave");
const lmsClassForm = $("lmsClassForm");
const lmsClassBranch = $("lmsClassBranch");
const lmsClassName = $("lmsClassName");
const lmsClassTeacher = $("lmsClassTeacher");
const lmsClassStatus = $("lmsClassStatus");
const lmsClassFilterRow = $("lmsClassFilterRow");
const lmsClassBranchFilter = $("lmsClassBranchFilter");
const lmsClassList = $("lmsClassList");
const lmsBranchForm = $("lmsBranchForm");
const lmsBranchName = $("lmsBranchName");
const lmsBranchCode = $("lmsBranchCode");
const lmsBranchStatus = $("lmsBranchStatus");
const lmsBranchList = $("lmsBranchList");

function setText(el, text) {
  if (el) el.textContent = text || "";
}

function makeButton(className, text, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  if (onClick) button.addEventListener("click", onClick);
  return button;
}

function makeOption(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

// Fill a <select>, keeping the current choice when it is still offered.
function fillSelect(select, options) {
  if (!select) return;
  const keep = select.value;
  select.replaceChildren(...options.map(([v, t]) => makeOption(v, t)));
  if (options.some(([v]) => v === keep)) select.value = keep;
}

// A form field and its label box show and hide together.
function showField(el, show) {
  if (!el) return;
  el.hidden = !show;
  const field = el.closest(".adm-field");
  if (field) field.hidden = !show;
}

/* ---- list tables (3B-2b) ------------------------------------------------ */
// A list screen table: a header row, then the rows (one <tbody> per item when
// an item has more than one row, as a class with its student panel). The
// first column is the primary one — the title, the row actions under it and,
// on phones, a fold-out button; every other cell names its column
// (data-colname) so a folded-out phone row reads "label  value".
function makeTable(columns, bodies, emptyText) {
  const table = document.createElement("table");
  table.className = "adm-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((name, i) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = name;
    if (i === 0) th.className = "adm-col-primary";
    headRow.append(th);
  });
  head.append(headRow);
  table.append(head);
  if (!bodies.length) {
    const body = document.createElement("tbody");
    const row = document.createElement("tr");
    row.className = "adm-empty-row";
    const td = document.createElement("td");
    td.colSpan = columns.length;
    td.className = "admin-member-empty";
    td.textContent = emptyText;
    row.append(td);
    body.append(row);
    bodies.push(body);
  }
  table.append(...bodies);
  return table;
}

function makeCell(colname, ...content) {
  const td = document.createElement("td");
  td.dataset.colname = colname;
  td.append(...content);
  return td;
}

function primaryCell(colname, title, actions) {
  const td = document.createElement("td");
  td.className = "adm-col-primary";
  td.dataset.colname = colname;
  const strong = document.createElement("strong");
  strong.className = "adm-row-title";
  strong.textContent = title;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "adm-row-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", `${title} 자세히 보기`);
  toggle.addEventListener("click", () => {
    const row = td.closest("tr");
    const open = !row.classList.contains("is-expanded");
    row.classList.toggle("is-expanded", open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  td.append(strong, toggle);
  if (actions.length) {
    const box = document.createElement("div");
    box.className = "adm-row-actions";
    box.append(...actions);
    td.append(box);
  }
  return { td, title: strong };
}

function statusBadge(active) {
  const badge = document.createElement("span");
  badge.className = active ? "adm-badge" : "adm-badge is-off";
  badge.textContent = active ? "활성" : "비활성";
  return badge;
}

// Two clicks, no dialog (as in the 교사 자료실 delete): the first arms the
// button for a few seconds.
function makeDeleteButton(className, onConfirm) {
  const button = makeButton(className, "삭제");
  let disarm = 0;
  button.addEventListener("click", () => {
    if (button.dataset.armed) {
      window.clearTimeout(disarm);
      onConfirm();
      return;
    }
    button.dataset.armed = "1";
    button.textContent = "한 번 더 누르면 삭제";
    disarm = window.setTimeout(() => {
      delete button.dataset.armed;
      button.textContent = "삭제";
    }, 4000);
  });
  return button;
}

// An RPC answer → { data } or { message } (42501 = not allowed).
async function lmsRpc(name, args) {
  if (!sb) return { message: LMS_MSG.failed };
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    return {
      message: error.code === "42501" ? LMS_MSG.denied : LMS_MSG.failed,
    };
  }
  return { data };
}

// The message for a jsonb answer that is not "ok".
function answerMessage(answer) {
  if (!answer) return LMS_MSG.failed;
  if (answer.status === "invalid") {
    return LMS_MSG[answer.field] || LMS_MSG.failed;
  }
  if (answer.status === "duplicate") {
    if (answer.field === "code") return LMS_MSG.duplicateCode;
    if (answer.field === "name") return LMS_MSG.duplicateName;
    return answer.suggestion
      ? `이미 있는 아이디예요. 추천 아이디: ${answer.suggestion}`
      : "이미 있는 아이디예요.";
  }
  if (answer.status === "not_found") return "이미 없어진 항목이에요.";
  return LMS_MSG.failed;
}

const branchName = (id) =>
  (lmsAdmin.branches.find((b) => b.id === id) || {}).name || "";
const className = (id) =>
  (lmsAdmin.classes.find((k) => k.id === id) || {}).name || "";
const byText = (a, b) => String(a).localeCompare(String(b), "ko");

async function loadLmsData() {
  if (!sb) return false;
  const load = (lmsAdmin.load += 1);
  const role = adminRole();
  const [members, classes, branches, managed] = await Promise.all([
    sb.rpc("lms_member_list"),
    sb.from("classes").select("id,branch_id,name,teacher_id,active"),
    sb.from("branches").select("id,code,name,active"),
    role === "admin"
      ? Promise.resolve({ data: null })
      : sb.rpc("lms_managed_class_ids"),
  ]);
  if (load !== lmsAdmin.load) return false; // a newer load is on its way
  if (members.error || classes.error || branches.error || managed.error) {
    return false;
  }
  lmsAdmin.members = members.data || [];
  lmsAdmin.classes = (classes.data || []).sort((a, b) =>
    byText(a.name, b.name),
  );
  lmsAdmin.branches = (branches.data || []).sort((a, b) =>
    byText(a.name, b.name),
  );
  lmsAdmin.managed = new Set(
    role === "admin"
      ? lmsAdmin.classes.map((k) => k.id)
      : (managed.data || []).map((id) => String(id)),
  );
  return true;
}

/* ---- 회원 ------------------------------------------------------------- */

// The member list and the create form, shaped for the caller.
function prepareMemberForm() {
  const role = adminRole();
  const isTop = role === "admin";
  const creatable =
    role === "admin" ? [1, 2, 3] : role === "branch" ? [2, 3] : [3];
  // A new member is a student (3) unless the caller already picked another
  // offered role. (Filling an empty <select> selects its first option, so
  // the choice is read before the fill, not after it.)
  const pickedRole = lmsNewRole ? lmsNewRole.value : "";
  fillSelect(
    lmsNewRole,
    creatable.map((r) => [String(r), ROLE_LABELS[r]]),
  );
  if (lmsNewRole && !creatable.map(String).includes(pickedRole)) {
    lmsNewRole.value = "3";
  }
  showField(lmsNewRole, creatable.length > 1);
  if (lmsNewBranch) {
    showField(lmsNewBranch, isTop);
    fillSelect(lmsNewBranch, [
      ["", "지사 고르기"],
      ...lmsAdmin.branches.map((b) => [b.id, b.name]),
    ]);
  }
  if (lmsMemberBranchFilterRow) lmsMemberBranchFilterRow.hidden = !isTop;
  fillSelect(lmsMemberBranchFilter, [
    ["", "전체"],
    ...lmsAdmin.branches.map((b) => [b.id, b.name]),
  ]);
  const visibleClasses = lmsAdmin.classes.filter(
    (k) => role !== "teacher" || lmsAdmin.managed.has(k.id),
  );
  fillSelect(lmsMemberClassFilter, [
    ["", "전체"],
    ["none", "반 없음"],
    ...visibleClasses.map((k) => [
      k.id,
      isTop ? `${k.name} (${branchName(k.branch_id)})` : k.name,
    ]),
  ]);
  if (lmsMemberRoleFilterRow)
    lmsMemberRoleFilterRow.hidden = role === "teacher";
  fillSelect(lmsMemberRoleFilter, [
    ["", "전체"],
    ...creatable.map((r) => [String(r), ROLE_LABELS[r]]),
  ]);
  if (signupBox) signupBox.hidden = !isTop;
}

// May the caller change this member? (what the server allows, D45/D52)
function canManageMember(m) {
  const role = adminRole();
  if (role === "admin" || role === "branch") return true;
  // a teacher: students of the classes it teaches (class_ids lists only those)
  return m.role === 3 && (m.class_ids || []).length > 0;
}

function memberClassText(m) {
  if (m.role === 2) {
    const taught = lmsAdmin.classes
      .filter((k) => k.teacher_id === m.member_id)
      .map((k) => k.name);
    return taught.length ? `담당: ${taught.join(", ")}` : "";
  }
  if (m.role !== 3) return "";
  const names = (m.class_ids || []).map(className).filter(Boolean);
  if (names.length) return names.join(", ");
  return m.in_class ? "다른 반" : "반 없음";
}

function filteredMembers() {
  const branch = lmsMemberBranchFilter ? lmsMemberBranchFilter.value : "";
  const klass = lmsMemberClassFilter ? lmsMemberClassFilter.value : "";
  const role = lmsMemberRoleFilter ? lmsMemberRoleFilter.value : "";
  const query = (lmsMemberSearch ? lmsMemberSearch.value : "")
    .trim()
    .toLowerCase();
  return lmsAdmin.members
    .filter((m) => !branch || adminRole() !== "admin" || m.branch_id === branch)
    .filter((m) =>
      !klass
        ? true
        : klass === "none"
          ? !m.in_class
          : (m.class_ids || []).includes(klass),
    )
    .filter((m) => !role || String(m.role) === role)
    .filter(
      (m) =>
        !query ||
        String(m.login_id).toLowerCase().includes(query) ||
        String(m.display_name || "")
          .toLowerCase()
          .includes(query),
    )
    .sort(
      (a, b) =>
        byText(a.branch_name, b.branch_name) ||
        a.role - b.role ||
        byText(a.login_id, b.login_id),
    );
}

// The member table: 아이디 · 이름 · 역할 · (지사, top admin) · 반 · 상태.
// Row actions under the ID: 수정 · 잠금 해제 (locked) · 비활성화/활성화 ·
// 삭제 (top admin, two clicks) — only on members the caller may manage.
function renderMemberList() {
  if (!lmsMemberList) return;
  const isTop = adminRole() === "admin";
  const columns = ["아이디", "이름", "역할"];
  if (isTop) columns.push("지사");
  columns.push("반", "상태");
  const body = document.createElement("tbody");
  filteredMembers().forEach((m) => {
    const row = document.createElement("tr");
    row.className = "lms-member-row";
    row.dataset.memberId = m.member_id;
    if (!m.active) row.classList.add("is-inactive");

    const actions = [];
    if (canManageMember(m)) {
      actions.push(
        makeButton("adm-link lms-member-edit", "수정", () =>
          openMemberEditor(m),
        ),
      );
      if (m.locked) {
        actions.push(
          makeButton("adm-link lms-member-unlock", "잠금 해제", () =>
            memberAction("lms_unlock_member", { p_member_id: m.member_id }),
          ),
        );
      }
      actions.push(
        makeButton(
          "adm-link lms-member-toggle",
          m.active ? "비활성화" : "활성화",
          () =>
            memberAction("lms_member_update", {
              p_member_id: m.member_id,
              p_active: !m.active,
            }),
        ),
      );
      if (isTop) {
        actions.push(
          makeDeleteButton("adm-link adm-link-danger lms-member-delete", () =>
            memberAction("lms_member_delete", { p_member_id: m.member_id }),
          ),
        );
      }
    }

    const status = makeCell("상태", statusBadge(m.active));
    if (m.locked) {
      const lock = document.createElement("span");
      lock.className = "lms-member-lock";
      const minutes = Math.max(1, Math.ceil((m.lock_retry_sec || 0) / 60));
      lock.textContent = `잠김 · ${minutes}분 남음`;
      status.append(lock);
    }
    row.append(
      primaryCell("아이디", m.login_id, actions).td,
      makeCell("이름", m.display_name || "—"),
      makeCell("역할", ROLE_LABELS[m.role] || ""),
    );
    if (isTop) row.append(makeCell("지사", m.branch_name || "—"));
    row.append(makeCell("반", memberClassText(m) || "—"), status);
    body.append(row);
  });
  lmsMemberList.replaceChildren(
    makeTable(
      columns,
      body.rows.length ? [body] : [],
      "해당하는 회원이 없습니다.",
    ),
  );
}

async function memberAction(name, args) {
  setText(lmsMemberStatus, "");
  const { data, message } = await lmsRpc(name, args);
  if (message || !data || data.status !== "ok") {
    setText(lmsMemberStatus, message || answerMessage(data));
  }
  await refreshMembersView();
}

async function refreshMembersView() {
  if (!(await loadLmsData())) {
    setText(lmsMemberStatus, LMS_MSG.loadFailed);
    return;
  }
  prepareMemberForm();
  renderMemberList();
}

function hideSuggestion() {
  if (lmsMemberSuggest) lmsMemberSuggest.hidden = true;
}

async function createMember(loginId) {
  hideSuggestion();
  const args = {
    p_login_id: loginId,
    p_password: lmsNewPw ? lmsNewPw.value : "",
    p_role: Number(lmsNewRole ? lmsNewRole.value : 3) || 3,
  };
  const name = lmsNewName ? lmsNewName.value.trim() : "";
  if (name) args.p_display_name = name;
  if (adminRole() === "admin") {
    if (!lmsNewBranch || !lmsNewBranch.value) {
      setText(lmsMemberStatus, LMS_MSG.branch);
      return;
    }
    args.p_branch_id = lmsNewBranch.value;
  }
  setText(lmsMemberStatus, "만드는 중…");
  const { data, message } = await lmsRpc("lms_member_create", args);
  if (message) {
    setText(lmsMemberStatus, message);
    return;
  }
  if (data && data.status === "duplicate" && data.suggestion) {
    setText(lmsMemberStatus, "");
    setText(lmsMemberSuggestText, "이미 있는 아이디예요.");
    lmsMemberSuggestBtn.textContent = `'${data.suggestion}'(으)로 만들기`;
    lmsMemberSuggestBtn.dataset.suggestion = data.suggestion;
    lmsMemberSuggest.hidden = false;
    return;
  }
  if (!data || data.status !== "ok") {
    setText(lmsMemberStatus, answerMessage(data));
    return;
  }
  setText(lmsMemberStatus, `"${data.login_id}" 회원을 만들었어요.`);
  [lmsNewId, lmsNewPw, lmsNewName].forEach((input) => {
    if (input) input.value = "";
  });
  if (lmsNewRole) lmsNewRole.value = "3"; // the next one starts at 학생 again
  await refreshMembersView();
}

if (lmsMemberForm) {
  lmsMemberForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const loginId = lmsNewId ? lmsNewId.value.trim() : "";
    if (!loginId || !lmsNewPw || !lmsNewPw.value) {
      setText(lmsMemberStatus, "아이디와 비밀번호를 쓰세요.");
      return;
    }
    createMember(loginId);
  });
  [lmsNewId, lmsNewPw, lmsNewName, lmsNewRole, lmsNewBranch].forEach(
    (input) => {
      if (input) input.addEventListener("input", hideSuggestion);
    },
  );
}
if (lmsMemberSuggestBtn) {
  lmsMemberSuggestBtn.addEventListener("click", () => {
    const suggestion = lmsMemberSuggestBtn.dataset.suggestion;
    if (!suggestion) return;
    if (lmsNewId) lmsNewId.value = suggestion;
    createMember(suggestion);
  });
}
[lmsMemberBranchFilter, lmsMemberClassFilter, lmsMemberRoleFilter].forEach(
  (select) => {
    if (select) select.addEventListener("change", renderMemberList);
  },
);
if (lmsMemberSearch)
  lmsMemberSearch.addEventListener("input", renderMemberList);

/* ---- 회원 수정 창 -------------------------------------------------------- */

let editing = null; // the member being edited

function setEditStatus(text) {
  setText(memberEditStatus, text);
  if (memberEditSuggest) memberEditSuggest.hidden = true;
}

function openMemberEditor(m) {
  editing = m;
  const canChangeId = ["admin", "branch"].includes(adminRole()); // D52
  setText(
    memberEditSub,
    [m.login_id, m.display_name, ROLE_LABELS[m.role]]
      .filter(Boolean)
      .join(" · "),
  );
  if (memberEditIdRow) memberEditIdRow.hidden = !canChangeId;
  if (memberEditId) memberEditId.value = m.login_id;
  if (memberEditName) memberEditName.value = m.display_name || "";
  if (memberEditPw) memberEditPw.value = "";
  setEditStatus("");
  if (memberEditModal) memberEditModal.hidden = false;
  document.body.classList.add("admin-modal-open");
  (canChangeId ? memberEditId : memberEditName)?.focus();
}

function closeMemberEditor() {
  editing = null;
  if (memberEditPw) memberEditPw.value = "";
  if (memberEditModal) memberEditModal.hidden = true;
  document.body.classList.remove("admin-modal-open");
}

async function saveMemberEdit() {
  if (!editing) return;
  const m = editing;
  const args = { p_member_id: m.member_id };
  if (memberEditIdRow && !memberEditIdRow.hidden && memberEditId) {
    const id = memberEditId.value.trim();
    if (id && id !== m.login_id) args.p_login_id = id;
  }
  const name = memberEditName ? memberEditName.value.trim() : "";
  if (name !== (m.display_name || "")) args.p_display_name = name;
  const pw = memberEditPw ? memberEditPw.value : "";
  if (pw) args.p_password = pw;
  if (Object.keys(args).length === 1) {
    closeMemberEditor();
    return;
  }
  setEditStatus("저장 중…");
  const { data, message } = await lmsRpc("lms_member_update", args);
  if (message) {
    setEditStatus(message);
    return;
  }
  if (data && data.status === "duplicate" && data.suggestion) {
    setEditStatus("이미 있는 아이디예요.");
    memberEditSuggest.textContent = `'${data.suggestion}'(으)로 바꾸기`;
    memberEditSuggest.dataset.suggestion = data.suggestion;
    memberEditSuggest.hidden = false;
    return;
  }
  if (!data || data.status !== "ok") {
    setEditStatus(answerMessage(data));
    return;
  }
  closeMemberEditor();
  setText(lmsMemberStatus, "저장했어요.");
  await refreshMembersView();
}

if (memberEditModal) {
  memberEditModal.querySelectorAll("[data-member-edit-close]").forEach((el) => {
    el.addEventListener("click", closeMemberEditor);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !memberEditModal.hidden) closeMemberEditor();
  });
}
if (memberEditSave) memberEditSave.addEventListener("click", saveMemberEdit);
if (memberEditSuggest) {
  memberEditSuggest.addEventListener("click", () => {
    const suggestion = memberEditSuggest.dataset.suggestion;
    if (!suggestion || !memberEditId) return;
    memberEditId.value = suggestion;
    saveMemberEdit();
  });
}

/* ---- 반 ---------------------------------------------------------------- */

const teacherName = (memberId) => {
  if (!memberId) return "담당 없음";
  const t = lmsAdmin.members.find((m) => m.member_id === memberId);
  if (t) return t.display_name || t.login_id;
  // a teacher does not list itself — its own classes are the only ones it sees
  return adminRole() === "teacher"
    ? (state.lms && state.lms.display_name) || "나"
    : "담당 선생님";
};

function teacherOptions(branchId) {
  return [
    ["", "담당 없음"],
    ...lmsAdmin.members
      .filter((m) => m.role === 2 && m.branch_id === branchId && m.active)
      .sort((a, b) => byText(a.login_id, b.login_id))
      .map((m) => [
        m.member_id,
        m.display_name ? `${m.display_name} (${m.login_id})` : m.login_id,
      ]),
  ];
}

function prepareClassForm() {
  const role = adminRole();
  const isTop = role === "admin";
  if (lmsClassBranch) {
    showField(lmsClassBranch, isTop);
    fillSelect(lmsClassBranch, [
      ["", "지사 고르기"],
      ...lmsAdmin.branches.map((b) => [b.id, b.name]),
    ]);
  }
  if (lmsClassFilterRow) lmsClassFilterRow.hidden = !isTop;
  fillSelect(lmsClassBranchFilter, [
    ["", "전체"],
    ...lmsAdmin.branches.map((b) => [b.id, b.name]),
  ]);
  if (lmsClassTeacher) {
    showField(lmsClassTeacher, role !== "teacher");
    const branchId = isTop
      ? lmsClassBranch && lmsClassBranch.value
      : state.lms && state.lms.branch_id;
    fillSelect(
      lmsClassTeacher,
      teacherOptions(
        branchId ||
          (lmsAdmin.branches.length === 1 ? lmsAdmin.branches[0].id : ""),
      ),
    );
  }
}

const studentsOf = (classId) =>
  lmsAdmin.members.filter(
    (m) => m.role === 3 && (m.class_ids || []).includes(classId),
  );

// Students the caller may put into this class: a teacher those with no class
// at all (D51) or only in its own other classes (D53, a move in one call —
// class_ids lists only its own classes); the branch account / admin any
// student of the class's branch not in it yet (one in another class is moved).
function candidatesFor(k) {
  const teacher = adminRole() === "teacher";
  return lmsAdmin.members
    .filter(
      (m) =>
        m.role === 3 &&
        m.branch_id === k.branch_id &&
        !(m.class_ids || []).includes(k.id) &&
        (!teacher || !m.in_class || (m.class_ids || []).length > 0),
    )
    .sort((a, b) => byText(a.login_id, b.login_id));
}

// Move a student into class `toId`. A teacher: one add call — the server
// takes the student out of the teacher's other classes (D53); a student also
// in another teacher's class is refused (D51). The branch account / admin:
// out of the other classes first, then in (one student = one class).
async function moveStudent(memberId, fromIds, toId) {
  setText(lmsClassStatus, "");
  if (adminRole() === "teacher") {
    const { data, message } = await lmsRpc("lms_class_add_member", {
      p_class_id: toId,
      p_member_id: memberId,
    });
    if (message === LMS_MSG.denied && fromIds.length) {
      setText(lmsClassStatus, LMS_MSG.moveDenied);
    } else if (message || !data || data.status !== "ok") {
      setText(lmsClassStatus, message || answerMessage(data));
    }
    await refreshClassesView();
    return;
  }
  for (const other of fromIds) {
    const out = await lmsRpc("lms_class_remove_member", {
      p_class_id: other,
      p_member_id: memberId,
    });
    if (out.message) {
      setText(lmsClassStatus, out.message);
      return;
    }
  }
  await classAction("lms_class_add_member", {
    p_class_id: toId,
    p_member_id: memberId,
  });
}

// The student panel of one class: each student with 옮기기 (to another class
// the caller manages in the same branch) and 빼기, then the 넣기 row.
function renderClassPanel(k, panel) {
  const targets = lmsAdmin.classes.filter(
    (x) =>
      x.id !== k.id &&
      x.branch_id === k.branch_id &&
      lmsAdmin.managed.has(x.id),
  );
  const students = studentsOf(k.id).map((m) => {
    const line = document.createElement("div");
    line.className = "lms-class-student";
    line.dataset.memberId = m.member_id;
    const name = document.createElement("span");
    name.className = "lms-class-student-name";
    name.textContent = [m.login_id, m.display_name].filter(Boolean).join(" · ");
    const actions = document.createElement("div");
    actions.className = "lms-class-student-actions";
    if (targets.length) {
      const select = document.createElement("select");
      select.className = "admin-member-select lms-class-move-select";
      select.setAttribute("aria-label", `${m.login_id} 옮길 반`);
      select.append(
        makeOption("", "옮길 반"),
        ...targets.map((x) => makeOption(x.id, x.name)),
      );
      actions.append(
        select,
        makeButton(
          "adm-btn adm-btn-small adm-btn-secondary lms-class-student-move",
          "옮기기",
          () => {
            if (select.value) moveStudent(m.member_id, [k.id], select.value);
          },
        ),
      );
    }
    actions.append(
      makeButton(
        "adm-btn adm-btn-small adm-btn-secondary lms-class-student-remove",
        "빼기",
        () =>
          classAction("lms_class_remove_member", {
            p_class_id: k.id,
            p_member_id: m.member_id,
          }),
      ),
    );
    line.append(name, actions);
    return line;
  });
  if (!students.length) {
    const empty = document.createElement("p");
    empty.className = "admin-member-empty";
    empty.textContent = "아직 학생이 없습니다.";
    students.push(empty);
  }

  const add = document.createElement("div");
  add.className = "lms-class-add";
  const select = document.createElement("select");
  select.className = "admin-member-select lms-class-add-select";
  select.setAttribute("aria-label", "넣을 학생");
  const candidates = candidatesFor(k);
  select.append(
    makeOption("", candidates.length ? "학생 고르기" : "넣을 학생이 없어요"),
    ...candidates.map((m) => {
      const other = (m.class_ids || []).map(className).filter(Boolean);
      const label = [m.login_id, m.display_name].filter(Boolean).join(" · ");
      return makeOption(
        m.member_id,
        other.length ? `${label} (${other.join(", ")})` : label,
      );
    }),
  );
  const button = makeButton(
    "adm-btn adm-btn-small adm-btn-primary lms-class-add-btn",
    "넣기",
  );
  const moving = () => {
    const m = candidates.find((x) => x.member_id === select.value);
    return m ? (m.class_ids || []).filter((id) => id !== k.id) : [];
  };
  select.addEventListener("change", () => {
    button.textContent = moving().length ? "옮겨 넣기" : "넣기";
  });
  button.addEventListener("click", () => {
    if (select.value) moveStudent(select.value, moving(), k.id);
  });
  add.append(select, button);
  const title = document.createElement("p");
  title.className = "lms-class-panel-title";
  title.textContent = `${k.name} 학생`;
  panel.replaceChildren(title, ...students, add);
}

// The class table: 반 이름 · 담당 선생님 · 학생 수 · (지사, top admin) · 상태,
// one <tbody> per class so its student panel opens right under it. Row
// actions: 이름 변경 · 학생 관리 · 비활성화/활성화 · 삭제 (top admin, D47).
function renderClassList() {
  if (!lmsClassList) return;
  const role = adminRole();
  const isTop = role === "admin";
  const branchFilter = lmsClassBranchFilter ? lmsClassBranchFilter.value : "";
  const columns = ["반 이름", "담당 선생님", "학생 수"];
  if (isTop) columns.push("지사");
  columns.push("상태");
  const bodies = lmsAdmin.classes
    .filter((k) => lmsAdmin.managed.has(k.id))
    .filter((k) => !isTop || !branchFilter || k.branch_id === branchFilter)
    .map((k) => {
      const body = document.createElement("tbody");
      body.className = "lms-class-row";
      body.dataset.classId = k.id;
      const open = lmsAdmin.openPanels.has(k.id);

      const row = document.createElement("tr");
      row.className = "lms-class-head";
      if (!k.active) row.classList.add("is-inactive");
      const actions = [
        makeButton("adm-link lms-class-rename", "이름 변경", () =>
          startRename(primary.title, k.name, (name) =>
            classAction("lms_class_update", { p_class_id: k.id, p_name: name }),
          ),
        ),
        makeButton(
          "adm-link lms-class-students",
          open ? "학생 닫기" : "학생 관리",
          () => {
            if (lmsAdmin.openPanels.has(k.id)) lmsAdmin.openPanels.delete(k.id);
            else lmsAdmin.openPanels.add(k.id);
            renderClassList();
          },
        ),
        makeButton(
          "adm-link lms-class-toggle",
          k.active ? "비활성화" : "활성화",
          () =>
            classAction("lms_class_update", {
              p_class_id: k.id,
              p_active: !k.active,
            }),
        ),
      ];
      if (isTop) {
        actions.push(
          makeDeleteButton("adm-link adm-link-danger lms-class-delete", () =>
            classAction("lms_class_delete", { p_class_id: k.id }),
          ),
        );
      }
      const primary = primaryCell("반 이름", k.name, actions);

      let teacherCell;
      if (role !== "teacher") {
        const teacher = document.createElement("select");
        teacher.className = "admin-member-select lms-class-teacher";
        teacher.setAttribute("aria-label", `${k.name} 담당 선생님`);
        teacherOptions(k.branch_id).forEach(([v, t]) =>
          teacher.append(makeOption(v, t)),
        );
        teacher.value = k.teacher_id || "";
        teacher.addEventListener("change", () =>
          classAction("lms_class_update", {
            p_class_id: k.id,
            p_set_teacher: true,
            p_teacher_id: teacher.value || null,
          }),
        );
        teacherCell = makeCell("담당 선생님", teacher);
      } else {
        teacherCell = makeCell("담당 선생님", teacherName(k.teacher_id));
      }
      row.append(
        primary.td,
        teacherCell,
        makeCell("학생 수", `${studentsOf(k.id).length}명`),
      );
      if (isTop) row.append(makeCell("지사", branchName(k.branch_id) || "—"));
      row.append(makeCell("상태", statusBadge(k.active)));
      body.append(row);

      if (open) {
        const panelRow = document.createElement("tr");
        panelRow.className = "lms-class-panel-row";
        const td = document.createElement("td");
        td.colSpan = columns.length;
        const panel = document.createElement("div");
        panel.className = "lms-class-panel";
        panel.dataset.classId = k.id;
        renderClassPanel(k, panel);
        td.append(panel);
        panelRow.append(td);
        body.append(panelRow);
      }
      return body;
    });
  lmsClassList.replaceChildren(makeTable(columns, bodies, "반이 없습니다."));
}

// Inline rename: the row's title becomes a box + 저장 / 취소.
function startRename(info, current, onSave) {
  const box = document.createElement("span");
  box.className = "lms-rename";
  const input = document.createElement("input");
  input.className = "admin-member-input lms-rename-input";
  input.type = "text";
  input.value = current;
  input.setAttribute("aria-label", "새 이름");
  const save = makeButton(
    "adm-btn adm-btn-small adm-btn-primary lms-rename-save",
    "저장",
    () => {
      const name = input.value.trim();
      if (name && name !== current) onSave(name);
      else box.replaceWith(info);
    },
  );
  const cancel = makeButton(
    "adm-btn adm-btn-small adm-btn-secondary",
    "취소",
    () => box.replaceWith(info),
  );
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") save.click();
    if (event.key === "Escape") cancel.click();
  });
  box.append(input, save, cancel);
  info.replaceWith(box);
  input.focus();
}

async function classAction(name, args) {
  setText(lmsClassStatus, "");
  const { data, message } = await lmsRpc(name, args);
  if (message || !data || data.status !== "ok") {
    setText(lmsClassStatus, message || answerMessage(data));
  }
  await refreshClassesView();
}

async function refreshClassesView() {
  if (!(await loadLmsData())) {
    setText(lmsClassStatus, LMS_MSG.loadFailed);
    return;
  }
  prepareClassForm();
  renderClassList();
}

if (lmsClassForm) {
  lmsClassForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = lmsClassName ? lmsClassName.value.trim() : "";
    if (!name) {
      setText(lmsClassStatus, LMS_MSG.name);
      return;
    }
    const role = adminRole();
    const args = { p_name: name };
    if (role !== "teacher" && lmsClassTeacher && lmsClassTeacher.value) {
      args.p_teacher_id = lmsClassTeacher.value;
    }
    if (role === "admin") {
      if (!lmsClassBranch || !lmsClassBranch.value) {
        setText(lmsClassStatus, LMS_MSG.branch);
        return;
      }
      args.p_branch_id = lmsClassBranch.value;
    }
    const { data, message } = await lmsRpc("lms_class_create", args);
    if (message || !data || data.status !== "ok") {
      setText(lmsClassStatus, message || answerMessage(data));
      return;
    }
    if (lmsClassName) lmsClassName.value = "";
    setText(lmsClassStatus, `"${name}" 반을 만들었어요.`);
    await refreshClassesView();
  });
}
if (lmsClassBranch) lmsClassBranch.addEventListener("change", prepareClassForm);
if (lmsClassBranchFilter) {
  lmsClassBranchFilter.addEventListener("change", renderClassList);
}

/* ---- 지사 (top admin only) --------------------------------------------- */

// The branch table (top admin): 코드 · 이름 · 회원 수 · 상태. Row actions
// under the code: 이름 변경 · 비활성화/활성화 (no delete).
function renderBranchList() {
  if (!lmsBranchList) return;
  const body = document.createElement("tbody");
  lmsAdmin.branches.forEach((b) => {
    const row = document.createElement("tr");
    row.className = "lms-branch-row";
    row.dataset.branchId = b.id;
    if (!b.active) row.classList.add("is-inactive");
    const name = document.createElement("span");
    name.className = "lms-branch-name";
    name.textContent = b.name;
    const members = lmsAdmin.members.filter((m) => m.branch_id === b.id);
    const actions = [
      makeButton("adm-link lms-branch-rename", "이름 변경", () =>
        startRename(name, b.name, (value) =>
          branchAction({ p_branch_id: b.id, p_name: value }),
        ),
      ),
      makeButton(
        "adm-link lms-branch-toggle",
        b.active ? "비활성화" : "활성화",
        () => branchAction({ p_branch_id: b.id, p_active: !b.active }),
      ),
    ];
    row.append(
      primaryCell("코드", b.code, actions).td,
      makeCell("이름", name),
      makeCell("회원 수", `${members.length}명`),
      makeCell("상태", statusBadge(b.active)),
    );
    body.append(row);
  });
  lmsBranchList.replaceChildren(
    makeTable(
      ["코드", "이름", "회원 수", "상태"],
      body.rows.length ? [body] : [],
      "지사가 없습니다.",
    ),
  );
}

async function branchAction(args) {
  setText(lmsBranchStatus, "");
  const { data, message } = await lmsRpc("lms_branch_update", args);
  if (message || !data || data.status !== "ok") {
    setText(lmsBranchStatus, message || answerMessage(data));
  }
  await refreshBranchesView();
}

async function refreshBranchesView() {
  if (!(await loadLmsData())) {
    setText(lmsBranchStatus, LMS_MSG.loadFailed);
    return;
  }
  renderBranchList();
}

if (lmsBranchForm) {
  lmsBranchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = lmsBranchName ? lmsBranchName.value.trim() : "";
    const code = lmsBranchCode ? lmsBranchCode.value.trim() : "";
    if (!name) {
      setText(lmsBranchStatus, LMS_MSG.name);
      return;
    }
    const args = { p_name: name };
    if (code) args.p_code = code;
    const { data, message } = await lmsRpc("lms_branch_create", args);
    if (message || !data || data.status !== "ok") {
      setText(lmsBranchStatus, message || answerMessage(data));
      return;
    }
    [lmsBranchName, lmsBranchCode].forEach((input) => {
      if (input) input.value = "";
    });
    setText(lmsBranchStatus, `"${name}" 지사를 만들었어요.`);
    await refreshBranchesView();
  });
}

/* ---- hooks ------------------------------------------------------------- */

adminViewOpeners.members = () => {
  hideSuggestion();
  refreshMembersView();
};
adminViewOpeners.classes = refreshClassesView;
adminViewOpeners.branches = refreshBranchesView;
