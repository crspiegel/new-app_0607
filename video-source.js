/* ---- Shared level/slot data and video URL parsing ------------------------
   Classic script loaded BEFORE app.js (index.html) and play.js (play.html).
   Classic scripts share one global lexical scope, so these declarations are
   visible to both pages — and must NOT be re-declared in app.js (a duplicate
   top-level const is a SyntaxError that stops the whole script).
   Data and pure functions only: no DOM access at the top level, so
   scripts/make-qr-list.mjs can also evaluate this file in Node. */

/* exported months, lessonTypes, weekdays, levelLabel, toolbarButtons,
   allSlotKeys, qrLevelCode, levelFromQrCode, monthNumber, monthFromNumber,
   slotToQr, slotFromQr, slotTitle, qrPath, BOOK_LAYOUT, bookLayout, bookEntry,
   bookSlotKeys, bookToolbarButtons, bookQrPath, bookQrName, YT_ID_RE,
   GAME_HOSTS, isGameUrl, setExtraGameHosts, parseVideoSource,
   publisherVimeoId, disableYouTubeCaptions */

const months = [
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const lessonTypes = [
  "Opening Song",
  "Story",
  "Word Chant",
  "Sentence Chant",
  "Ending Song",
];
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/* ---- Level display labels ----------------------------------------------
   Internal keys stay "Level 1".."Level 4" (DB rows, URL hash, data-level
   attributes all use them) — only the on-screen label is remapped. */
const LEVEL_LABELS = {
  "Level 1": "Beginner",
  "Level 2": "Level 1",
  "Level 3": "Level 2",
  "Level 4": "Level 3",
};
function levelLabel(level) {
  return LEVEL_LABELS[level] || level;
}

/* ---- Content-page toolbar (per level) ----------------------------------
   Single source of truth for the buttons above the weekday board on the
   content page. The USER toolbar and the ADMIN editor's top row both render
   from this, so they always stay in sync (work rule: admin mirrors the user
   screen). Each slot key is stored in content_pages.videos per level/month.
   kind "video" plays the slot's YouTube/Vimeo URL in the video player;
   kind "game" opens the slot's URL in the game modal. */
const TOOLBAR_BUTTONS = {
  // Beginner (internal key "Level 1") — icons unified, no tags (user decision).
  "Level 1": [
    {
      slot: "opening",
      kind: "video",
      label: "Good Morning Song",
      icon: "video",
    },
    { slot: "ending", kind: "video", label: "Good Bye Song", icon: "video" },
    { slot: "game", kind: "game", label: "Game", icon: "game" },
    { slot: "unit", kind: "video", label: "Unit Song", icon: "music" },
  ],
  // Level 1-3 (internal keys "Level 2".."Level 4"). `tag` renders the GAME/SONG
  // corner pill, so default labels drop the redundant suffix — admins fill in
  // per-month book titles via the label editor.
  default: [
    {
      slot: "opening",
      kind: "video",
      label: "Good Morning Song",
      icon: "video",
    },
    { slot: "ending", kind: "video", label: "Good Bye Song", icon: "video" },
    { slot: "game", kind: "game", label: "I Sit", icon: "game", tag: "game" },
    {
      slot: "game2",
      kind: "game",
      label: "I Like School",
      icon: "game",
      tag: "game",
    },
    {
      slot: "song1",
      kind: "video",
      label: "I Sit",
      icon: "music",
      tag: "song",
    },
    {
      slot: "song2",
      kind: "video",
      label: "I Like School",
      icon: "music",
      tag: "song",
    },
  ],
};
function toolbarButtons(level) {
  return TOOLBAR_BUTTONS[level] || TOOLBAR_BUTTONS.default;
}

/* ---- Slot keys -----------------------------------------------------------
   ⚠ Slot keys are a PRINT CONTRACT: the QR codes in the books resolve to
   /q/<level>/<month>/<slot>, so renaming a key kills printed codes. */

// The 20 weekday slots in board order: "w1-Mon" .. "w4-Fri".
function weekdaySlotKeys() {
  const keys = [];
  for (let week = 1; week <= 4; week += 1) {
    weekdays.forEach((day) => keys.push(`w${week}-${day}`));
  }
  return keys;
}

// Every slot on a level's content page: toolbar slots first, then weekdays
// (24 for Beginner, 26 for Level 1-3).
function allSlotKeys(level) {
  return toolbarButtons(level)
    .map((item) => item.slot)
    .concat(weekdaySlotKeys());
}

/* ---- Books (fixed in code, decision D1 2026-10-22) -------------------------
   A month's content page is one book for Beginner and two books for Level
   1-3; each book owns a fixed set of weeks (continuous numbering, book 2 =
   weeks 3-4) and the toolbar slots shown with it. The student QR page is one
   BOOK (one printed QR per book, 70 in all), never a single slot. Slot keys
   and TOOLBAR_BUTTONS are unchanged — this only groups them. The admin's
   book titles live in content_pages.labels (game/song1 = book 1, game2/song2
   = book 2 by convention), covers in content_pages.covers[cover]. */
const BOOK_LAYOUT = {
  "Level 1": [
    {
      book: 1,
      weeks: [1, 2, 3, 4],
      toolbar: ["opening", "ending", "game", "unit"],
      cover: "book-1",
    },
  ],
  default: [
    {
      book: 1,
      weeks: [1, 2],
      toolbar: ["opening", "ending", "game", "song1"],
      cover: "book-1",
    },
    {
      book: 2,
      weeks: [3, 4],
      toolbar: ["opening", "ending", "game2", "song2"],
      cover: "book-2",
    },
  ],
};

function bookLayout(level) {
  return BOOK_LAYOUT[level] || BOOK_LAYOUT.default;
}

// The layout entry for book `book` (1 or 2; "2" is fine), null when the level
// has no such book (Beginner book 2, book 0, book 3 ...).
function bookEntry(level, book) {
  const n = Number(book);
  return bookLayout(level).find((entry) => entry.book === n) || null;
}

// That book's slot keys in board order: its toolbar slots, then its weeks'
// Mon..Fri (24 for Beginner, 14 for a Level 1-3 book). [] for no such book.
function bookSlotKeys(level, book) {
  const entry = bookEntry(level, book);
  if (!entry) return [];
  const days = [];
  entry.weeks.forEach((week) => {
    weekdays.forEach((day) => days.push(`w${week}-${day}`));
  });
  return entry.toolbar.concat(days);
}

// The TOOLBAR_BUTTONS items shown with that book, in the book's order.
function bookToolbarButtons(level, book) {
  const entry = bookEntry(level, book);
  if (!entry) return [];
  const buttons = toolbarButtons(level);
  return entry.toolbar
    .map((slot) => buttons.find((item) => item.slot === slot))
    .filter(Boolean);
}

/* ---- QR route tokens (/q/<lv>/<month>/<book>) ---------------------------
   Level codes follow the ON-SCREEN names (what the books and teachers see):
   b = Beginner, l1..l3 = Level 1..3. Months are the on-screen numbers 3..12.
   The parser also accepts the bare digits 1..3 for Level 1..3 (PM's example
   form); generated paths always use l1..l3. The last token is the book (1|2).
   ⚠ These tokens are a PRINT CONTRACT once the Naver QR codes are registered. */
const QR_LEVEL_CODES = {
  "Level 1": "b",
  "Level 2": "l1",
  "Level 3": "l2",
  "Level 4": "l3",
};
const QR_LEVEL_ALIASES = { 1: "Level 2", 2: "Level 3", 3: "Level 4" };

function qrLevelCode(level) {
  return QR_LEVEL_CODES[level] || null;
}

function levelFromQrCode(code) {
  const wanted = String(code || "").toLowerCase();
  return (
    Object.keys(QR_LEVEL_CODES).find(
      (level) => QR_LEVEL_CODES[level] === wanted,
    ) ||
    QR_LEVEL_ALIASES[wanted] ||
    null
  );
}

// "/q/l2/3/2" — the student page for Level 2 (internal "Level 3") · March ·
// book 2. null when the level has no such book.
function bookQrPath(level, month, book) {
  const entry = bookEntry(level, book);
  const lv = qrLevelCode(level);
  const n = monthNumber(month);
  return entry && lv && n ? `/q/${lv}/${n}/${entry.book}` : null;
}

// The Naver QR management name: level code · 2-digit month · book, e.g.
// "B-03-1", "L3-12-2" (sorts in book order).
function bookQrName(level, month, book) {
  const entry = bookEntry(level, book);
  const lv = qrLevelCode(level);
  const n = monthNumber(month);
  if (!entry || !lv || !n) return null;
  return `${lv.toUpperCase()}-${String(n).padStart(2, "0")}-${entry.book}`;
}

function monthNumber(month) {
  const index = months.indexOf(month);
  return index < 0 ? null : index + 3;
}

// "3", 3 and "03" all resolve to "March"; anything outside 3..12 is null.
function monthFromNumber(value) {
  const str = String(value == null ? "" : value).trim();
  if (!/^\d{1,2}$/.test(str)) return null;
  const n = Number(str);
  return n >= 3 ? months[n - 3] || null : null;
}

function slotToQr(slot) {
  return String(slot).toLowerCase();
}

// Case-insensitive match against the level's own slot keys, so a Level 1-3
// slot ("song1") is not valid on a Beginner code.
function slotFromQr(token, level) {
  const wanted = String(token || "").toLowerCase();
  return allSlotKeys(level).find((key) => key.toLowerCase() === wanted) || null;
}

// A slot's on-screen title, as on the student page and in the Naver QR list.
// Weekday slots read like the teacher site's slotLabel() ("Week 1 · Mon ·
// Opening Song"); toolbar slots use the admin's custom label for that month
// (`labels`, may be omitted), else the TOOLBAR_BUTTONS default ("<title> ·
// Song" for tagged song slots, as in the teacher player title).
function slotTitle(level, slot, labels) {
  const item = toolbarButtons(level).find((b) => b.slot === slot);
  if (item) {
    const label = (labels && labels[slot]) || item.label;
    return item.tag === "song" ? `${label} · Song` : label;
  }
  const m = slot.match(/^w(\d)-(\w+)$/);
  if (!m) return slot;
  return `Week ${m[1]} · ${m[2]} · ${lessonTypes[weekdays.indexOf(m[2])]}`;
}

function qrPath(level, month, slot) {
  return `/q/${qrLevelCode(level)}/${monthNumber(month)}/${slotToQr(slot)}`;
}

/* ---- Game hosts ------------------------------------------------------------
   A URL on one of these hosts (or a subdomain) is a GAME, whatever slot it
   sits in: a weekday button then behaves like the toolbar Game button (game
   modal on the teacher site, same-tab navigation on the student page) instead
   of framing the page in the video window. Every other non-Vimeo http(s) host
   is still a video page (kind "page", e.g. the TPS publisher pages). The admin
   never picks a type — the host decides — so the stored value stays a plain
   URL string. Add a host here when a new game provider appears; the teacher
   site also merges site_settings.game_hosts (setExtraGameHosts). */
const GAME_HOSTS = ["book-english-games.vercel.app"];
let extraGameHosts = [];

// Replace the merged-in hosts (site_settings.game_hosts). Anything that is
// not a plain hostname string is dropped; null/undefined clears the list.
function setExtraGameHosts(hosts) {
  extraGameHosts = (Array.isArray(hosts) ? hosts : [])
    .filter((host) => typeof host === "string")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => /^[a-z0-9.-]+$/.test(host));
}

function isGameUrl(str) {
  let url;
  try {
    url = new URL(String(str || "").trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return GAME_HOSTS.concat(extraGameHosts).some(
    (game) => host === game || host.endsWith(`.${game}`),
  );
}

/* ---- Video URL parsing ---------------------------------------------------*/

// Matches the 11-char video id in any common YouTube URL shape
// (watch?v=, youtu.be/, embed/, shorts/, live/).
const YT_ID_RE =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

// Classify a stored video value. Returns null for an empty slot (no sample
// fallback — empty means "not ready yet", handled in openSlot). YouTube URLs
// resolve to { kind: "youtube", id }; a game host (GAME_HOSTS) to
// { kind: "game", url }; a web page on any other host resolves to
// { kind: "page", url }; everything else stays Vimeo (a numeric id or a full
// Vimeo URL).
// `publisher: "direct"` (student page on a tps-education.com host only) turns
// a TPS publisher page into its Vimeo id instead. The teacher site calls
// without options, so publisher pages stay { kind: "page" } there.
function parseVideoSource(source, { publisher } = {}) {
  if (!source) return null;
  const str = String(source).trim();
  if (!str) return null;
  const yt = str.match(YT_ID_RE);
  if (yt) return { kind: "youtube", id: yt[1] };
  if (/^\d+$/.test(str)) return { kind: "vimeo", id: Number(str) };
  if (isGameUrl(str)) return { kind: "game", url: str };
  if (publisher === "direct") {
    const id = publisherVimeoId(str);
    if (id != null) return { kind: "vimeo", id };
  }
  if (isExternalVideoPage(str)) return { kind: "page", url: str };
  return { kind: "vimeo", url: str };
}

// A page on a non-Vimeo host that plays the video itself — e.g. a publisher
// page (tps-education.com/58?video=…) wrapping a Vimeo video whose privacy is
// locked to that publisher's domain. Vimeo refuses the bare id anywhere else
// ("Because of its privacy settings…"), but the publisher's own page still
// plays when framed, since its Vimeo iframe is requested from that domain.
function isExternalVideoPage(str) {
  let url;
  try {
    url = new URL(str);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  return !/(^|\.)vimeo\.com$/i.test(url.hostname);
}

// The Vimeo id inside a TPS publisher page URL (/58, /60, /61 ...?video=<id>
// — all three pages build player.vimeo.com/video/<id> from that parameter).
// null for any other URL. Only useful where Vimeo allows the embed (a
// tps-education.com host); elsewhere the page itself must be framed.
function publisherVimeoId(str) {
  let url;
  try {
    url = new URL(String(str || "").trim());
  } catch {
    return null;
  }
  if (!/(^|\.)tps-education\.com$/i.test(url.hostname)) return null;
  const id = url.searchParams.get("video");
  return id && /^\d+$/.test(id) ? Number(id) : null;
}

// Force YouTube captions (CC, incl. auto-generated) off. Some viewers have
// "always show captions" on in their YouTube account / OS accessibility
// settings, and with controls:0 + disablekb:1 a child has no CC button or "c"
// key to turn them off. There is no official "captions off" parameter
// (cc_load_policy only forces them ON), so this relies on the undocumented
// unloadModule — if YouTube changes it, the call just fails silently and
// captions show as before. "cc" is the module name in older players.
function disableYouTubeCaptions(yt) {
  try {
    yt.unloadModule("captions");
    yt.unloadModule("cc");
  } catch {
    /* player may not be ready yet, or the API changed */
  }
}
