/* ---- Shared board markup (board-view.js) ----------------------------------
   Classic script loaded AFTER video-source.js and BEFORE app.js (index.html)
   and play.js (play.html). It builds the 페이지2 board's DOM — the toolbar
   buttons, the book cover cards and the weekday rows — so the teacher site and
   the student QR page render the same markup from one place. Pure DOM
   builders only: no top-level DOM access, no state, no event handlers (the
   pages wire their own delegated click handlers). Same rule as
   video-source.js: never re-declare these names in app.js / play.js (a
   duplicate top-level const in a classic script is a SyntaxError that stops
   the whole page). */

/* exported ICON_SVGS, buildToolbarButton, buildCoverCard, buildWeekRow */

// Full-color toolbar icons: colored body + a darker copy offset ~1.3px down as
// a 3D bottom lip (matches the app's beveled buttons) + a small white glint.
// Colors are baked into each SVG — the .content-type-icon CSS only sizes it and
// paints the tinted circle behind it — so the icons stay stable across level
// themes and the active state. Solid fills only (no <defs> gradients:
// duplicate url(#id) refs across repeated toolbar buttons are fragile).
const GAMEPAD_BODY =
  "M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5Z";
const NOTE_STEMS = "M9 17.3V4.9l12-2v12.4";
const ICON_SVGS = {
  video: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.4 6.5 17.9 12 8.4 17.5Z" fill="#db4b4b" stroke="#db4b4b" stroke-width="2.6" stroke-linejoin="round" transform="translate(0 1.4)"/><path d="M8.4 6.5 17.9 12 8.4 17.5Z" fill="#ff6b6b" stroke="#ff6b6b" stroke-width="2.6" stroke-linejoin="round"/><path d="M9.3 9v2.1" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.65"/></svg>`,
  game: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${GAMEPAD_BODY}" fill="#6440cf" transform="translate(0 1.3)"/><path d="${GAMEPAD_BODY}" fill="#845ef7"/><path d="M6.9 7.3h2.4" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/><path d="M6.2 11h3.6M8 9.2v3.6" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="13" r="1.35" fill="#ffd43b"/><circle cx="18" cy="10" r="1.35" fill="#8ce99a"/></svg>`,
  music: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g transform="translate(0 1.3)"><path d="${NOTE_STEMS}" fill="none" stroke="#0ca678" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.3" cy="17.3" r="2.9" fill="#0ca678"/><circle cx="18.3" cy="15.3" r="2.9" fill="#0ca678"/></g><path d="${NOTE_STEMS}" fill="none" stroke="#20c997" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.3" cy="17.3" r="2.9" fill="#20c997"/><circle cx="18.3" cy="15.3" r="2.9" fill="#20c997"/><circle cx="5.4" cy="16.4" r="0.8" fill="#ffffff" opacity="0.6"/><circle cx="17.4" cy="14.4" r="0.8" fill="#ffffff" opacity="0.6"/></svg>`,
};

// One toolbar button: icon circle + label (+ GAME/SONG ribbon). `item` is a
// TOOLBAR_BUTTONS entry; `label` is the on-screen name (the admin's custom
// label or the default). `active` marks the highlighted button.
function buildToolbarButton(item, label, { active = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = active ? "content-type active" : "content-type";
  button.dataset.slot = item.slot;
  button.dataset.kind = item.kind;
  const icon = document.createElement("span");
  // The modifier drives the tinted circular backdrop (one soft tint per
  // icon family — see .content-type-icon--* in board.css).
  icon.className = item.icon
    ? `content-type-icon content-type-icon--${item.icon}`
    : "content-type-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = ICON_SVGS[item.icon] || "";
  const text = document.createElement("span");
  text.className = "content-type-label";
  text.textContent = label;
  button.append(icon, text);
  // GAME/SONG corner pill (levels with tagged slots only). NOT aria-hidden:
  // it keeps duplicate book titles distinguishable ("I Sit GAME" vs
  // "I Sit SONG") for screen readers and role-name queries.
  if (item.tag) {
    const tag = document.createElement("span");
    tag.className = `content-type-tag content-type-tag--${item.tag}`;
    tag.textContent = item.tag.toUpperCase();
    button.append(tag);
  }
  return button;
}

// The book cover card (book 1 or 2). It starts as the white placeholder; the
// page paints the cover itself (background-image + .has-cover).
function buildCoverCard(bookIndex, title) {
  const card = document.createElement("div");
  // book-1 / book-2 lets per-book cover art be slotted in via CSS.
  card.className = `book-title-card book-${bookIndex}`;
  card.setAttribute("role", "img");
  card.setAttribute("aria-label", `${title} cover placeholder`);
  return card;
}

// One week of the board: the week label and the five weekday buttons
// (Mon..Fri), each carrying its slot key ("w3-Mon") and the player title
// ("Opening Song · Week 3 · Mon"). Returns them unattached so the page can
// place them in its own grid.
function buildWeekRow(weekNumber, bookTitle) {
  const label = document.createElement("div");
  label.className = "week-label";
  // Number + word, wrapped in a single inline span so the grid-centered
  // label stays on one line ("N week") on desktop; mobile hides .wk-word to
  // show just the number (frees width for bigger day buttons).
  label.innerHTML = `<span class="wk-text"><span class="wk-num">${weekNumber}</span> <span class="wk-word">week</span></span>`;
  const buttons = weekdays.map((day, dayIndex) => {
    const button = document.createElement("button");
    button.className = `lesson-button day-${dayIndex + 1}`;
    button.type = "button";
    button.setAttribute(
      "aria-label",
      `${bookTitle}, ${weekNumber} week, ${lessonTypes[dayIndex]}`,
    );
    // Context label shown in the video player title, e.g.
    // "Story · Week 1 · Tue".
    button.dataset.vpTitle = `${lessonTypes[dayIndex]} · Week ${weekNumber} · ${day}`;
    // Stable per-page slot key for the content data lookup (w1-Mon .. w4-Fri).
    button.dataset.slot = `w${weekNumber}-${day}`;
    button.innerHTML = `<strong>${day}</strong>`;
    return button;
  });
  return { label, buttons };
}
