/* ---- Shared level/slot data and video URL parsing ------------------------
   Classic script loaded BEFORE app.js (index.html) and play.js (play.html).
   Classic scripts share one global lexical scope, so these declarations are
   visible to both pages — and must NOT be re-declared in app.js (a duplicate
   top-level const is a SyntaxError that stops the whole script).
   Data and pure functions only: no DOM access at the top level, so
   scripts/make-qr-list.mjs can also evaluate this file in Node. */

/* exported months, lessonTypes, weekdays, levelLabel, toolbarButtons,
   allSlotKeys, qrLevelCode, levelFromQrCode, monthNumber, monthFromNumber,
   slotToQr, slotFromQr, qrPath, YT_ID_RE, parseVideoSource,
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

/* ---- QR route tokens (/q/<lv>/<month>/<slot>) ---------------------------
   Level codes follow the ON-SCREEN names (what the books and teachers see):
   b = Beginner, l1..l3 = Level 1..3. Months are the on-screen numbers 3..12.
   Slot tokens are the slot keys lowercased. */
const QR_LEVEL_CODES = {
  "Level 1": "b",
  "Level 2": "l1",
  "Level 3": "l2",
  "Level 4": "l3",
};

function qrLevelCode(level) {
  return QR_LEVEL_CODES[level] || null;
}

function levelFromQrCode(code) {
  const wanted = String(code || "").toLowerCase();
  return (
    Object.keys(QR_LEVEL_CODES).find(
      (level) => QR_LEVEL_CODES[level] === wanted,
    ) || null
  );
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

function qrPath(level, month, slot) {
  return `/q/${qrLevelCode(level)}/${monthNumber(month)}/${slotToQr(slot)}`;
}

/* ---- Video URL parsing ---------------------------------------------------*/

// Matches the 11-char video id in any common YouTube URL shape
// (watch?v=, youtu.be/, embed/, shorts/, live/).
const YT_ID_RE =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

// Classify a stored video value. Returns null for an empty slot (no sample
// fallback — empty means "not ready yet", handled in openSlot). YouTube URLs
// resolve to { kind: "youtube", id }; a web page on any other host resolves to
// { kind: "page", url }; everything else stays Vimeo (a numeric id or a full
// Vimeo URL).
function parseVideoSource(source) {
  if (!source) return null;
  const str = String(source).trim();
  if (!str) return null;
  const yt = str.match(YT_ID_RE);
  if (yt) return { kind: "youtube", id: yt[1] };
  if (/^\d+$/.test(str)) return { kind: "vimeo", id: Number(str) };
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
