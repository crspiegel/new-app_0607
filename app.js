const state = {
  level: "",
  month: "",
};

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
const contentTypeMeta = [
  {
    key: "openingSong",
    label: "Opening Song",
    shortLabel: "Song",
    icon: "♪",
    day: "Mon",
  },
  { key: "story", label: "Story", shortLabel: "Story", icon: "📖", day: "Tue" },
  {
    key: "wordChant",
    label: "Word Chant",
    shortLabel: "Words",
    icon: "W",
    day: "Wed",
  },
  {
    key: "sentenceChant",
    label: "Sentence Chant",
    shortLabel: "Sentence",
    icon: "S",
    day: "Thu",
  },
  {
    key: "endingSong",
    label: "Ending Song",
    shortLabel: "Ending",
    icon: "★",
    day: "Fri",
  },
];
const monthlyBooks = [
  {
    title: "Title A",
  },
  {
    title: "Title B",
  },
];

/* ---- Content data source (Phase 1: local map) --------------------------
   Single source of truth for per-slot video URLs and per-book cover images,
   keyed by level → month. Phase 2 swaps the backing store to Supabase
   WITHOUT changing the getVideoUrl / getCover callers below.

   Slot keys (22 per page): "opening", "ending", and the 20 weekday buttons
   "w{1..4}-{Mon..Fri}". Cover keys: "book-1", "book-2". */
const contentData = {
  "Level 1": {
    March: {
      videos: {},
      covers: {
        "book-1": "assets/l1-march-book-1.jpg",
        "book-2": "assets/l1-march-book-2.jpg",
      },
    },
  },
};

function getPageData(level, month) {
  return (contentData[level] && contentData[level][month]) || null;
}

// Live content loaded from Supabase (Phase 2), keyed "level||month". Any slot or
// cover not set in the database falls back to the local contentData seed.
const contentCache = {};
function pageKey(level, month) {
  return `${level}||${month}`;
}

function getVideoUrl(level, month, slot) {
  const live = contentCache[pageKey(level, month)];
  if (live && live.videos && live.videos[slot]) return live.videos[slot];
  const page = getPageData(level, month);
  return (page && page.videos && page.videos[slot]) || "";
}

function getCover(level, month, book) {
  const live = contentCache[pageKey(level, month)];
  if (live && live.covers && live.covers[book]) return live.covers[book];
  const page = getPageData(level, month);
  return (page && page.covers && page.covers[book]) || "";
}

const screens = {
  home: document.querySelector("#homeScreen"),
  overview: document.querySelector("#overviewScreen"),
  months: document.querySelector("#monthScreen"),
  content: document.querySelector("#contentScreen"),
  contentV2: document.querySelector("#contentScreenV2"),
  contentV3: document.querySelector("#contentScreenV3"),
  login: document.querySelector("#loginScreen"),
  admin: document.querySelector("#adminScreen"),
};

const levelThemeClasses = [
  "level-theme-1",
  "level-theme-2",
  "level-theme-3",
  "level-theme-4",
];
const monthGrid = document.querySelector("#monthGrid");
const lessonGrid = document.querySelector("#lessonGrid");
const lessonGridV2 = document.querySelector("#lessonGridV2");
const monthLevelTag = document.querySelector("#monthLevelTag");
const contentPathTag = document.querySelector("#contentPathTag");
const contentTitle = document.querySelector("#contentTitle");
const contentLevelName = document.querySelector("#contentLevelName");
const contentBannerMonthNumber = document.querySelector(
  "#contentBannerMonthNumber",
);
const contentMainMonthNumber = document.querySelector(
  "#contentMainMonthNumber",
);
const contentV2MonthNumber = document.querySelector("#contentV2MonthNumber");
const contentV2Title = document.querySelector("#contentV2Title");
const contentV2Level = document.querySelector("#contentV2Level");
const contentV3MonthNumber = document.querySelector("#contentV3MonthNumber");
const contentV3Title = document.querySelector("#contentV3Title");
const contentV3Level = document.querySelector("#contentV3Level");
const calendarGridV3 = document.querySelector("#calendarGridV3");

// Screens that belong to a specific level — used to theme the shared footer
// (and any body-level styling) with that level's color. Home/overview are not
// level pages, so they keep the default (green) footer.
const levelPageScreens = new Set([
  "months",
  "content",
  "contentV2",
  "contentV3",
]);

function showScreen(name) {
  Object.values(screens).forEach((screen) =>
    screen.classList.remove("screen-active"),
  );
  // Mirror the current level's theme onto <body> so the shared footer can pick
  // up the level color; cleared on home/overview/unknown for the green default.
  document.body.classList.remove(...levelThemeClasses);
  // The login page recolors the shared footer to white (see styles.css).
  document.body.classList.toggle("login-active", name === "login");
  if (!screens[name]) {
    document.body.classList.remove("subpage-active");
    screens.home.classList.add("screen-active");
    return;
  }
  document.body.classList.toggle("subpage-active", name !== "home");
  if (levelPageScreens.has(name)) {
    const themeClass = levelToThemeClass(state.level);
    if (themeClass) {
      document.body.classList.add(themeClass);
    }
  }
  screens[name].classList.add("screen-active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function levelToThemeClass(level) {
  const match = level.match(/\d+/);
  return match ? `level-theme-${match[0]}` : "";
}

function applyLevelTheme() {
  [
    screens.months,
    screens.content,
    screens.contentV2,
    screens.contentV3,
  ].forEach((screen) => {
    screen.classList.remove(...levelThemeClasses);
    const themeClass = levelToThemeClass(state.level);
    if (themeClass) {
      screen.classList.add(themeClass);
    }
  });
}

function setHash(view) {
  if (view === "home") {
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    return;
  }

  if (view === "months") {
    window.location.hash = `months/${encodeURIComponent(state.level)}`;
    return;
  }

  if (view === "overview") {
    window.location.hash = "overview";
    return;
  }

  if (view === "login") {
    window.location.hash = "login";
    return;
  }

  if (view === "admin") {
    window.location.hash = "admin";
    return;
  }

  window.location.hash = `content/${encodeURIComponent(state.level)}/${encodeURIComponent(state.month)}`;
}

// Paint (or clear) the two book-cover title cards from the content data for
// the current level/month. The cards are static markup (rendered once by
// renderLessons); only their cover art depends on the page, so this runs on
// every content-page show / month change. Pages with no cover keep the empty
// white placeholder.
function refreshCovers() {
  ["book-1", "book-2"].forEach((bookKey) => {
    const card = lessonGrid.querySelector(`.book-title-card.${bookKey}`);
    if (!card) return;
    const url = getCover(state.level, state.month, bookKey);
    if (url) {
      card.classList.add("has-cover");
      card.style.backgroundImage = `url("${url}")`;
    } else {
      card.classList.remove("has-cover");
      card.style.backgroundImage = "";
    }
  });
}

function updateContentMonthNumber() {
  const monthIndex = months.indexOf(state.month);
  contentMainMonthNumber.textContent =
    monthIndex >= 0 ? String(monthIndex + 3) : "";
  contentTitle.textContent = state.month
    ? `${state.month} Reading Plan`
    : "Reading Plan";
  contentPathTag.textContent = state.level || "Level";
  screens.content.dataset.month = state.month;
  contentLevelName.textContent = state.level;
  contentBannerMonthNumber.textContent =
    monthIndex >= 0 ? String(monthIndex + 3) : "";
  refreshCovers();
}

function goToMonth(offset) {
  const index = months.indexOf(state.month);
  if (index < 0) return;
  const next = index + offset;
  if (next < 0 || next >= months.length) return;
  state.month = months[next];
  updateContentMonthNumber();
  setHash("content");
  showScreen("content");
}

function updateContentV2Header() {
  const monthIndex = months.indexOf(state.month);
  contentV2MonthNumber.textContent =
    monthIndex >= 0 ? String(monthIndex + 3) : "";
  contentV2Title.textContent = state.month
    ? `${state.month} Reading Plan`
    : "Reading Plan";
  contentV2Level.textContent = state.level || "Level";
}

function updateContentV3Header() {
  const monthIndex = months.indexOf(state.month);
  contentV3MonthNumber.textContent =
    monthIndex >= 0 ? String(monthIndex + 3) : "";
  contentV3Title.textContent = state.month
    ? `${state.month} Reading Plan`
    : "Reading Plan";
  contentV3Level.textContent = state.level || "Level";
}

function renderMonths() {
  monthGrid.innerHTML = "";
  months.forEach((month, index) => {
    const button = document.createElement("button");
    button.className = "month-button";
    button.type = "button";
    button.innerHTML = `<span>${month}</span><strong><i class="month-num">${index + 3}</i><i class="month-suffix">월</i></strong>`;
    button.addEventListener("click", () => {
      state.month = month;
      updateContentMonthNumber();
      setHash("content");
      showScreen("content");
    });
    monthGrid.append(button);
  });
}

function renderLessons() {
  lessonGrid.innerHTML = "";

  // Number weeks continuously 1–4 across both books (instead of restarting at
  // 1 per book) on every content page.
  let weekNumber = 0;

  monthlyBooks.forEach((book, bookIndex) => {
    const titleCard = document.createElement("div");
    // book-1 / book-2 lets per-book cover art be slotted in via CSS
    // (currently Level 1 / March only — see styles.css).
    titleCard.className = `book-title-card book-${bookIndex + 1}`;
    titleCard.setAttribute("role", "img");
    titleCard.setAttribute("aria-label", `${book.title} cover placeholder`);
    lessonGrid.append(titleCard);

    for (let week = 1; week <= 2; week += 1) {
      weekNumber += 1;
      const weekLabel = document.createElement("div");
      weekLabel.className = "week-label";
      // Number + word, wrapped in a single inline span so the grid-centered
      // label stays on one line ("N week") on desktop; mobile hides .wk-word to
      // show just the number (frees width for bigger day buttons).
      weekLabel.innerHTML = `<span class="wk-text"><span class="wk-num">${weekNumber}</span> <span class="wk-word">week</span></span>`;
      lessonGrid.append(weekLabel);

      weekdays.forEach((day, dayIndex) => {
        const button = document.createElement("button");
        button.className = `lesson-button day-${dayIndex + 1}`;
        button.type = "button";
        button.setAttribute(
          "aria-label",
          `${book.title}, ${weekNumber} week, ${lessonTypes[dayIndex]}`,
        );
        // Context label shown in the video player title, e.g.
        // "Story · Week 1 · Tue".
        button.dataset.vpTitle = `${lessonTypes[dayIndex]} · Week ${weekNumber} · ${day}`;
        // Stable per-page slot key for the content data lookup (w1-Mon .. w4-Fri).
        button.dataset.slot = `w${weekNumber}-${day}`;
        button.innerHTML = `<strong>${day}</strong>`;
        lessonGrid.append(button);
      });
    }
  });
}

function renderLessonsV2() {
  lessonGridV2.innerHTML = "";

  monthlyBooks.forEach((book, bookIndex) => {
    const titleCard = document.createElement("div");
    titleCard.className = "content-v2-book-card";
    titleCard.setAttribute("role", "img");
    titleCard.setAttribute("aria-label", `${book.title} cover placeholder`);
    titleCard.innerHTML = `
      <span class="content-v2-book-icon" aria-hidden="true"></span>
      <strong>Book ${bookIndex + 1}</strong>
    `;
    lessonGridV2.append(titleCard);

    for (let week = 1; week <= 2; week += 1) {
      const weekLabel = document.createElement("div");
      weekLabel.className = "content-v2-week-label";
      weekLabel.innerHTML = `<span>${week}</span><strong>week</strong>`;
      lessonGridV2.append(weekLabel);

      weekdays.forEach((day, dayIndex) => {
        const button = document.createElement("button");
        button.className = `content-v2-day-button day-${dayIndex + 1}`;
        button.type = "button";
        button.setAttribute(
          "aria-label",
          `${book.title}, ${week} week, ${lessonTypes[dayIndex]}`,
        );
        button.innerHTML = `<strong>${day}</strong>`;
        lessonGridV2.append(button);
      });
    }
  });
}

function renderCalendarV3() {
  calendarGridV3.innerHTML = "";

  const monthIndex = months.indexOf(state.month);
  if (monthIndex < 0) {
    return;
  }

  for (let weekIndex = 0; weekIndex < 4; weekIndex += 1) {
    contentTypeMeta.forEach((type) => {
      const button = document.createElement("button");
      button.className = `content-v3-day-cell type-${type.key}`;
      button.type = "button";
      button.dataset.contentType = type.key;
      button.dataset.week = String(weekIndex + 1);
      button.dataset.day = type.day;
      button.setAttribute(
        "aria-label",
        `${state.level || "Level"}, ${state.month}, week ${weekIndex + 1}, ${type.day}, ${type.label} sample video`,
      );
      button.innerHTML = `
        <span class="content-v3-day-name">${type.day}</span>
        <span class="content-v3-chip">
          <span aria-hidden="true">${type.icon}</span>
          <strong>${type.shortLabel}</strong>
        </span>
        <span class="content-v3-play" aria-hidden="true">▶</span>
        <small>Week ${weekIndex + 1}</small>
      `;
      calendarGridV3.append(button);
    });
  }
}

/* ---- Video player modal (Level 1 / March only) -------------------------
   A custom-shelled Vimeo player. Bound to the Opening/Ending Song toolbar
   buttons and the 20 weekday lesson buttons, but it only opens on the
   Level 1 / March content page — the check happens at click time so the
   shared #contentScreen markup stays inert on every other level/month. */

const videoModal = document.querySelector("#videoModal");
const vpFrame = document.querySelector("#vpFrame");
const vpClickLayer = document.querySelector("#vpClickLayer");
const vpToggle = document.querySelector("#vpToggle");
const vpStop = document.querySelector("#vpStop");
const vpLoop = document.querySelector("#vpLoop");
const vpMax = document.querySelector("#vpMax");
const vpProgress = document.querySelector("#vpProgress");
const vpProgressFill = document.querySelector("#vpProgressFill");
const vpProgressBuffer = document.querySelector("#vpProgressBuffer");
const vpProgressThumb = document.querySelector("#vpProgressThumb");
const vpCurrent = document.querySelector("#vpCurrent");
const vpDurationLabel = document.querySelector("#vpDurationLabel");
const vpTitle = document.querySelector("#vpTitle");
const vpMute = document.querySelector("#vpMute");
const vpVolume = document.querySelector("#vpVolume");
const vpVolumeWrap = document.querySelector(".vp-volume");
const vpEndOverlay = document.querySelector("#vpEndOverlay");
const vpReplay = document.querySelector("#vpReplay");
const videoPlayerCard = videoModal
  ? videoModal.querySelector(".video-player-card")
  : null;

// The active player exposes a small uniform interface — play(), pause(),
// setCurrentTime(s), setVolume(0..1), setLoop(bool), destroy() — so the shared
// transport controls below work whether the source is a Vimeo or a YouTube
// video. For Vimeo it's the Vimeo.Player instance directly; for YouTube it's a
// thin adapter over the IFrame API (see makeYouTubeAdapter).
let activePlayer = null;
let ytPoll = null; // YouTube has no timeupdate event → poll current time
let ytApiPromise = null; // resolves once the YouTube IFrame API has loaded
let vpLoopOn = false;
let vpPlaying = false;
let vpVolumeLevel = 1;
let vpLastVolume = 1;
let vpVolHideTimer = null;
let vpDuration = 0;
let vpCurrentSeconds = 0;
let vpDragging = false;
let vpHideTimer = null;

// Matches the 11-char video id in any common YouTube URL shape
// (watch?v=, youtu.be/, embed/, shorts/, live/).
const YT_ID_RE =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

// Classify a stored video value. Returns null for an empty slot (no sample
// fallback — empty means "not ready yet", handled in openSlot). YouTube URLs
// resolve to { kind: "youtube", id }; everything else stays Vimeo (a numeric id
// or a full Vimeo URL).
function parseVideoSource(source) {
  if (!source) return null;
  const str = String(source).trim();
  if (!str) return null;
  const yt = str.match(YT_ID_RE);
  if (yt) return { kind: "youtube", id: yt[1] };
  if (/^\d+$/.test(str)) return { kind: "vimeo", id: Number(str) };
  return { kind: "vimeo", url: str };
}

// Current viewer grade. Phase 3 sets state.grade on login; until then everyone
// has full access (undefined !== 3).
function isBlockedByGrade() {
  return state.grade === 3;
}

// Single entry point for opening a content slot's video. Grade 3 is screen-
// gated with the cute popup; an empty slot shows the "coming soon" popup (no
// sample fallback); otherwise the slot's URL plays. Works on every level/month.
function openSlot(slot, label) {
  if (isBlockedByGrade()) {
    showNoAccessPopup();
    return;
  }
  const url = getVideoUrl(state.level, state.month, slot);
  if (!url) {
    showComingSoon();
    return;
  }
  openVideoPlayer(label, url);
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

function setVpProgress(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  if (vpProgressFill) vpProgressFill.style.width = `${clamped}%`;
  if (vpProgressThumb) vpProgressThumb.style.left = `${clamped}%`;
  if (vpProgress)
    vpProgress.setAttribute("aria-valuenow", String(Math.round(clamped)));
}

function setVpBuffer(percent) {
  if (vpProgressBuffer) {
    vpProgressBuffer.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
}

function setVpTimes(currentSeconds, durationSeconds) {
  if (vpCurrent) vpCurrent.textContent = formatTime(currentSeconds);
  if (vpDurationLabel)
    vpDurationLabel.textContent = formatTime(durationSeconds);
}

// Seek to an absolute time and reflect it in the UI immediately.
function seekTo(seconds) {
  if (!vpDuration) return;
  const clamped = Math.max(0, Math.min(vpDuration, seconds));
  vpCurrentSeconds = clamped;
  setVpProgress((clamped / vpDuration) * 100);
  setVpTimes(clamped, vpDuration);
  if (activePlayer) activePlayer.setCurrentTime(clamped).catch(() => {});
}

function setVpEnded(ended) {
  if (vpEndOverlay) vpEndOverlay.hidden = !ended;
}

// In fullscreen, reveal the auto-hiding title/controls on pointer/tap activity
// and schedule them to hide again after a short pause (YouTube-style). No-op
// outside fullscreen (where the chrome is always shown).
function revealFsControls() {
  if (
    !videoPlayerCard ||
    !videoPlayerCard.classList.contains("vp-fullscreen")
  ) {
    return;
  }
  videoPlayerCard.classList.add("vp-controls-visible");
  if (vpHideTimer) window.clearTimeout(vpHideTimer);
  vpHideTimer = window.setTimeout(() => {
    videoPlayerCard.classList.remove("vp-controls-visible");
  }, 2500);
}

// Reflect the current volume on the slider + the mute button (muted = volume 0).
function reflectVolumeUI() {
  const pct = Math.round(vpVolumeLevel * 100);
  // A single custom property drives both the horizontal desktop slider (CSS maps
  // --vol -> fill width / thumb left) and the vertical mobile popover (--vol ->
  // fill height / thumb bottom), so the JS is orientation-agnostic.
  if (vpVolume) {
    vpVolume.style.setProperty("--vol", `${pct}%`);
    vpVolume.setAttribute("aria-valuenow", String(pct));
  }
  const muted = vpVolumeLevel === 0;
  if (vpMute) {
    vpMute.dataset.muted = String(muted);
    vpMute.setAttribute("aria-label", muted ? "Unmute" : "Mute");
  }
}

// Single entry point for volume changes (slider, keyboard, mute button). Keeps
// the last non-zero level so the mute toggle can restore it.
function applyVolume(volume, { commit = true } = {}) {
  vpVolumeLevel = Math.max(0, Math.min(1, volume));
  if (vpVolumeLevel > 0) vpLastVolume = vpVolumeLevel;
  reflectVolumeUI();
  if (commit && activePlayer)
    activePlayer.setVolume(vpVolumeLevel).catch(() => {});
}

// On mobile portrait the volume slider is a tap-to-reveal VERTICAL popover above
// the speaker (touch has no hover). Keep this query string identical to the CSS
// media query that styles the vertical slider. Desktop/tablet keep hover.
const vpVolVertical = () =>
  window.matchMedia("(max-width: 767px) and (orientation: portrait)").matches;

// Open the vertical volume popover and arm a 3s inactivity auto-close. In
// fullscreen, hold the auto-hiding chrome open so the popover isn't hidden with
// the controls.
function openVolume() {
  if (!vpVolumeWrap) return;
  vpVolumeWrap.classList.add("vp-volume-open");
  resetVolumeAutoClose();
  if (videoPlayerCard && videoPlayerCard.classList.contains("vp-fullscreen")) {
    if (vpHideTimer) window.clearTimeout(vpHideTimer);
    videoPlayerCard.classList.add("vp-controls-visible");
  }
}

function closeVolume() {
  if (!vpVolumeWrap) return;
  vpVolumeWrap.classList.remove("vp-volume-open");
  if (vpVolHideTimer) window.clearTimeout(vpVolHideTimer);
  vpVolHideTimer = null;
  // Resume the normal fullscreen auto-hide countdown once the popover is gone.
  if (videoPlayerCard && videoPlayerCard.classList.contains("vp-fullscreen")) {
    revealFsControls();
  }
}

function resetVolumeAutoClose() {
  if (vpVolHideTimer) window.clearTimeout(vpVolHideTimer);
  vpVolHideTimer = window.setTimeout(closeVolume, 3000);
}

// Reflect play/paused state on the single Play/Pause toggle button. Driven by
// the Vimeo play/pause/ended events so it stays correct no matter what started
// or stopped playback (button, video click, loop end).
function setVpPlaying(playing) {
  vpPlaying = playing;
  if (vpToggle) {
    vpToggle.dataset.playing = String(playing);
    vpToggle.setAttribute("aria-label", playing ? "Pause" : "Play");
  }
}

function togglePlayback() {
  if (!activePlayer) return;
  if (vpPlaying) {
    activePlayer.pause().catch(() => {});
  } else {
    activePlayer.play().catch(() => {});
  }
}

// Tear down whatever player is mounted (Vimeo instance or YouTube adapter) and
// clear the frame, so the next mount starts clean.
function teardownPlayer() {
  if (ytPoll) {
    window.clearInterval(ytPoll);
    ytPoll = null;
  }
  if (activePlayer) {
    try {
      Promise.resolve(activePlayer.destroy()).catch(() => {});
    } catch {
      /* ignore */
    }
    activePlayer = null;
  }
  if (vpFrame) vpFrame.innerHTML = "";
}

function openVideoPlayer(label, source) {
  if (!videoModal) return;
  videoModal.hidden = false;
  document.body.classList.add("video-open");
  if (vpTitle) vpTitle.textContent = label || "";
  setVpProgress(0);
  setVpBuffer(0);
  setVpTimes(0, 0);
  setVpPlaying(false);
  setVpEnded(false);
  vpDuration = 0;
  vpCurrentSeconds = 0;

  teardownPlayer();

  const parsed = parseVideoSource(source);
  if (!parsed) return; // empty is handled by openSlot, but stay safe
  if (parsed.kind === "youtube") {
    mountYouTube(parsed.id);
  } else {
    mountVimeo(parsed);
  }
}

// Mount a Vimeo video and wire its events to the shared transport UI.
function mountVimeo(parsed) {
  if (!(window.Vimeo && window.Vimeo.Player)) return;
  vpFrame.innerHTML = "";
  const player = new window.Vimeo.Player(vpFrame, {
    ...(parsed.id != null ? { id: parsed.id } : { url: parsed.url }),
    controls: false,
    loop: vpLoopOn,
    responsive: false,
  });
  activePlayer = player;
  player
    .getDuration()
    .then((duration) => {
      vpDuration = duration;
      setVpTimes(0, duration);
    })
    .catch(() => {});
  player.on("timeupdate", (data) => {
    vpDuration = data.duration || vpDuration;
    if (!vpDragging) {
      vpCurrentSeconds = data.seconds || 0;
      setVpProgress((data.percent || 0) * 100);
      setVpTimes(data.seconds, vpDuration);
    }
  });
  // Buffered (loaded) amount, for the lighter track indicator.
  player.on("progress", (data) => {
    setVpBuffer((data.percent || 0) * 100);
  });
  // Apply the persisted volume to the fresh player and keep the UI in sync.
  player.setVolume(vpVolumeLevel).catch(() => {});
  player.on("volumechange", (data) => {
    vpVolumeLevel = data.volume;
    if (vpVolumeLevel > 0) vpLastVolume = vpVolumeLevel;
    reflectVolumeUI();
  });
  player.on("play", () => {
    setVpPlaying(true);
    setVpEnded(false);
  });
  player.on("pause", () => setVpPlaying(false));
  // On end, cover Vimeo's related-videos screen with our own end overlay.
  player.on("ended", () => {
    setVpPlaying(false);
    setVpEnded(true);
  });
  player.setLoop(vpLoopOn).catch(() => {});
  player.play().catch(() => {});
}

// Lazy-load the YouTube IFrame API once; resolves when window.YT is ready.
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      resolve();
    };
    if (!document.querySelector("script[data-yt-api]")) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.setAttribute("data-yt-api", "");
      document.head.appendChild(s);
    }
  });
  return ytApiPromise;
}

// Wrap a YT.Player in the same small interface the transport controls expect.
// Each call is fire-and-forget but returns a thenable so the .then()/.catch()
// chains in the handlers keep working. Loop is driven by vpLoopOn in the ENDED
// state change (the IFrame API's native loop needs a playlist).
function makeYouTubeAdapter(yt) {
  const safe = (fn) => {
    try {
      fn();
    } catch {
      /* player may not be ready yet */
    }
    return Promise.resolve();
  };
  return {
    play: () => safe(() => yt.playVideo()),
    pause: () => safe(() => yt.pauseVideo()),
    setCurrentTime: (s) => safe(() => yt.seekTo(s, true)),
    setVolume: (v) => safe(() => yt.setVolume(Math.round(v * 100))),
    setLoop: () => Promise.resolve(),
    destroy: () => safe(() => yt.destroy()),
  };
}

// Mount a YouTube video. The native chrome is hidden (controls:0) and the
// #vpClickLayer sits over the iframe, so our own controls drive playback.
function mountYouTube(videoId) {
  loadYouTubeApi().then(() => {
    if (!vpFrame || videoModal.hidden) return;
    vpFrame.innerHTML = "";
    const host = document.createElement("div");
    vpFrame.appendChild(host);
    const yt = new window.YT.Player(host, {
      videoId,
      width: "100%",
      height: "100%",
      playerVars: {
        autoplay: 1,
        controls: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        fs: 0,
        disablekb: 1,
        iv_load_policy: 3,
      },
      events: {
        onReady: () => {
          try {
            yt.setVolume(Math.round(vpVolumeLevel * 100));
            const d = yt.getDuration();
            if (d) {
              vpDuration = d;
              setVpTimes(0, d);
            }
            yt.playVideo();
          } catch {
            /* ignore */
          }
        },
        onStateChange: (event) => {
          const S = window.YT.PlayerState;
          if (event.data === S.PLAYING) {
            setVpPlaying(true);
            setVpEnded(false);
          } else if (event.data === S.PAUSED) {
            setVpPlaying(false);
          } else if (event.data === S.ENDED) {
            if (vpLoopOn) {
              try {
                yt.seekTo(0, true);
                yt.playVideo();
              } catch {
                /* ignore */
              }
            } else {
              setVpPlaying(false);
              setVpEnded(true);
            }
          }
        },
      },
    });
    activePlayer = makeYouTubeAdapter(yt);
    // YouTube has no timeupdate event — poll position/buffer for the progress UI.
    ytPoll = window.setInterval(() => {
      if (!yt || typeof yt.getCurrentTime !== "function" || vpDragging) return;
      const dur = yt.getDuration() || vpDuration;
      vpDuration = dur;
      const cur = yt.getCurrentTime() || 0;
      vpCurrentSeconds = cur;
      if (dur > 0) setVpProgress((cur / dur) * 100);
      setVpTimes(cur, dur);
      if (typeof yt.getVideoLoadedFraction === "function") {
        setVpBuffer(yt.getVideoLoadedFraction() * 100);
      }
    }, 250);
  });
}

function closeVideoPlayer() {
  if (!videoModal) return;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  teardownPlayer();
  videoModal.hidden = true;
  document.body.classList.remove("video-open");
  closeVolume();
  if (vpHideTimer) window.clearTimeout(vpHideTimer);
  videoPlayerCard.classList.remove("vp-fullscreen", "vp-controls-visible");
  setVpProgress(0);
  setVpBuffer(0);
  setVpTimes(0, 0);
  setVpPlaying(false);
  setVpEnded(false);
}

if (videoModal) {
  videoModal.querySelectorAll("[data-vp-close]").forEach((el) => {
    el.addEventListener("click", closeVideoPlayer);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !videoModal.hidden) {
      closeVideoPlayer();
    }
  });

  // Single Play/Pause toggle, and clicking the video does the same.
  vpToggle.addEventListener("click", togglePlayback);
  vpClickLayer.addEventListener("click", togglePlayback);

  // Replay from the end overlay: restart from 0 and hide the overlay.
  vpReplay.addEventListener("click", () => {
    setVpEnded(false);
    if (!activePlayer) return;
    activePlayer
      .setCurrentTime(0)
      .then(() => activePlayer.play())
      .catch(() => {});
  });

  vpStop.addEventListener("click", () => {
    if (!activePlayer) return;
    activePlayer
      .pause()
      .then(() => activePlayer.setCurrentTime(0))
      .catch(() => {});
    setVpProgress(0);
    setVpTimes(0, vpDuration);
  });

  vpLoop.addEventListener("click", () => {
    vpLoopOn = !vpLoopOn;
    vpLoop.setAttribute("aria-pressed", String(vpLoopOn));
    if (activePlayer) activePlayer.setLoop(vpLoopOn).catch(() => {});
  });

  // Speaker button. Mobile portrait: tap toggles the vertical volume popover
  // (mute is done by dragging the slider to 0). Desktop/tablet: mute toggle
  // between 0 and the last non-zero level (the slider reveals on hover).
  vpMute.addEventListener("click", () => {
    if (vpVolVertical()) {
      if (vpVolumeWrap && vpVolumeWrap.classList.contains("vp-volume-open"))
        closeVolume();
      else openVolume();
      return;
    }
    applyVolume(vpVolumeLevel > 0 ? 0 : vpLastVolume || 1);
  });

  // Volume slider: drag / click / keyboard (±10%). Vertical (mobile popover)
  // reads clientY from the bottom up; horizontal (desktop) reads clientX.
  const volRatioFromEvent = (event) => {
    const rect = vpVolume.getBoundingClientRect();
    if (vpVolVertical())
      return Math.max(
        0,
        Math.min(1, (rect.bottom - event.clientY) / rect.height),
      );
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  };
  let vpVolDragging = false;
  vpVolume.addEventListener("pointerdown", (event) => {
    vpVolDragging = true;
    vpVolume.classList.add("is-dragging");
    vpVolume.setPointerCapture(event.pointerId);
    applyVolume(volRatioFromEvent(event));
    resetVolumeAutoClose();
  });
  vpVolume.addEventListener("pointermove", (event) => {
    if (vpVolDragging) {
      applyVolume(volRatioFromEvent(event));
      resetVolumeAutoClose();
    }
  });
  const endVolDrag = () => {
    if (!vpVolDragging) return;
    vpVolDragging = false;
    vpVolume.classList.remove("is-dragging");
    resetVolumeAutoClose();
  };
  vpVolume.addEventListener("pointerup", endVolDrag);
  vpVolume.addEventListener("pointercancel", endVolDrag);
  vpVolume.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowUp")
      applyVolume(vpVolumeLevel + 0.1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      applyVolume(vpVolumeLevel - 0.1);
    else if (event.key === "Home") applyVolume(0);
    else if (event.key === "End") applyVolume(1);
    else return;
    resetVolumeAutoClose();
    event.preventDefault();
  });

  // Tap outside the volume control closes the popover (capture phase so it runs
  // before the speaker's own toggle, which is excluded by the contains check).
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        vpVolumeWrap &&
        vpVolumeWrap.classList.contains("vp-volume-open") &&
        !vpVolumeWrap.contains(event.target)
      ) {
        closeVolume();
      }
    },
    true,
  );

  // Initialise the volume UI (slider fill + mute icon) to the default level.
  reflectVolumeUI();

  vpMax.addEventListener("click", () => {
    if (!videoPlayerCard) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (videoPlayerCard.requestFullscreen) {
      videoPlayerCard.requestFullscreen().catch(() => {});
    }
  });

  // Entering/leaving fullscreen toggles the .vp-fullscreen class (drives the
  // auto-hiding overlay chrome); show the chrome briefly on entry.
  document.addEventListener("fullscreenchange", () => {
    const isFs = document.fullscreenElement === videoPlayerCard;
    videoPlayerCard.classList.toggle("vp-fullscreen", isFs);
    if (isFs) {
      revealFsControls();
    } else {
      closeVolume();
      if (vpHideTimer) window.clearTimeout(vpHideTimer);
      videoPlayerCard.classList.remove("vp-controls-visible");
    }
  });
  videoPlayerCard.addEventListener("pointermove", revealFsControls);
  videoPlayerCard.addEventListener("pointerdown", revealFsControls);

  // Drag-to-seek (also handles a plain click). While dragging, the progress UI
  // is driven locally and timeupdate is ignored (vpDragging) so it doesn't
  // fight the user; the final position is committed on release.
  const ratioFromEvent = (event) => {
    const rect = vpProgress.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  };
  const previewSeek = (event) => {
    const ratio = ratioFromEvent(event);
    vpCurrentSeconds = ratio * vpDuration;
    setVpProgress(ratio * 100);
    setVpTimes(ratio * vpDuration, vpDuration);
  };
  vpProgress.addEventListener("pointerdown", (event) => {
    if (!activePlayer || !vpDuration) return;
    vpDragging = true;
    vpProgress.classList.add("is-dragging");
    vpProgress.setPointerCapture(event.pointerId);
    previewSeek(event);
  });
  vpProgress.addEventListener("pointermove", (event) => {
    if (vpDragging) previewSeek(event);
  });
  const endDrag = (event) => {
    if (!vpDragging) return;
    vpDragging = false;
    vpProgress.classList.remove("is-dragging");
    const ratio = ratioFromEvent(event);
    if (activePlayer && vpDuration) {
      activePlayer.setCurrentTime(ratio * vpDuration).catch(() => {});
    }
  };
  vpProgress.addEventListener("pointerup", endDrag);
  vpProgress.addEventListener("pointercancel", endDrag);

  // Keyboard seeking on the slider: ±5s with arrows, Home/End to jump.
  vpProgress.addEventListener("keydown", (event) => {
    if (!activePlayer || !vpDuration) return;
    if (event.key === "ArrowRight") seekTo(vpCurrentSeconds + 5);
    else if (event.key === "ArrowLeft") seekTo(vpCurrentSeconds - 5);
    else if (event.key === "Home") seekTo(0);
    else if (event.key === "End") seekTo(vpDuration);
    else return;
    event.preventDefault();
  });

  // The 20 weekday lesson buttons live in #lessonGrid (shared by all levels
  // and months); each carries its own slot key, so the player opens with that
  // slot's URL on every page.
  lessonGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".lesson-button");
    if (button && button.dataset.slot) {
      openSlot(button.dataset.slot, button.dataset.vpTitle || "");
    }
  });
}

/* ---- "No access" popup (grade 3) ---------------------------------------
   A small child-friendly modal shown when a grade-3 viewer clicks a video
   button. Built now; activated by the grade gate in Phase 3. */
const noAccessModal = document.querySelector("#noAccessModal");

function showNoAccessPopup() {
  if (!noAccessModal) return;
  noAccessModal.hidden = false;
  document.body.classList.add("noaccess-open");
}

function hideNoAccessPopup() {
  if (!noAccessModal) return;
  noAccessModal.hidden = true;
  document.body.classList.remove("noaccess-open");
}

if (noAccessModal) {
  noAccessModal.querySelectorAll("[data-noaccess-close]").forEach((el) => {
    el.addEventListener("click", hideNoAccessPopup);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !noAccessModal.hidden) {
      hideNoAccessPopup();
    }
  });
}

/* ---- "Coming soon" popup (empty slot) ----------------------------------
   Shown when a lesson/song button has no video URL yet — replaces the old
   sample-video fallback so an empty slot reads as "not ready" instead of
   silently playing a placeholder. Reuses the no-access modal styling. */
const comingSoonModal = document.querySelector("#comingSoonModal");

function showComingSoon() {
  if (!comingSoonModal) return;
  comingSoonModal.hidden = false;
  document.body.classList.add("noaccess-open");
}

function hideComingSoon() {
  if (!comingSoonModal) return;
  comingSoonModal.hidden = true;
  document.body.classList.remove("noaccess-open");
}

if (comingSoonModal) {
  comingSoonModal.querySelectorAll("[data-comingsoon-close]").forEach((el) => {
    el.addEventListener("click", hideComingSoon);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !comingSoonModal.hidden) {
      hideComingSoon();
    }
  });
}

document.querySelectorAll("[data-level]").forEach((button) => {
  button.addEventListener("click", () => {
    state.level = button.dataset.level;
    state.month = "";
    monthLevelTag.textContent = state.level;
    applyLevelTheme();
    setHash("months");
    showScreen("months");
  });
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.view;
    if (target === "home") {
      state.level = "";
      state.month = "";
    }
    if (target === "months") {
      state.month = "";
    }
    setHash(target);
    showScreen(target);
  });
});

document.querySelectorAll(".content-nav-prev").forEach((button) => {
  button.addEventListener("click", () => goToMonth(-1));
});

document.querySelectorAll(".content-nav-next").forEach((button) => {
  button.addEventListener("click", () => goToMonth(1));
});

document.querySelectorAll(".content-type").forEach((button) => {
  button.addEventListener("click", () => {
    document
      .querySelectorAll(".content-type")
      .forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    // Only Opening Song / Ending Song are clickable on #contentScreen (the
    // middle three are hidden); they carry data-slot ("opening" / "ending").
    const slot = button.dataset.slot;
    if (slot) {
      const label = button.querySelector("span:last-child");
      openSlot(slot, label ? label.textContent.trim() : "");
    }
  });
});

document.querySelectorAll(".content-v2-tab").forEach((button) => {
  button.addEventListener("click", () => {
    document
      .querySelectorAll(".content-v2-tab")
      .forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});

document.querySelectorAll(".content-v3-type").forEach((button) => {
  button.addEventListener("click", () => {
    document
      .querySelectorAll(".content-v3-type")
      .forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});

/* ---- Supabase: content hydration, admin editor, auth -------------------
   The site reads content URLs/covers from Supabase (public, anon key). Only
   authenticated admins can write. Admins are real Supabase Auth users; member
   (grade 1-3) login arrives in Phase 3. */

const sb =
  window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY
    ? window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY,
      )
    : null;

let isAdmin = false;
const adminState = { level: "Level 1", month: "March" };
const levels = ["Level 1", "Level 2", "Level 3", "Level 4"];

// Account-format rule (mirrors the server's `^[!-~]{4,}$`): >= 4 printable-ASCII
// chars, no spaces, no Korean. Used for member login + admin member creation.
const ACCOUNT_RE = /^[\x21-\x7E]{4,}$/;

// Member (grade 1-3) session. Members are NOT Supabase Auth users, so the grade
// is held client-side (localStorage) — a UI-level gate, intentionally simple
// (write-protection is enforced by RLS; see NOTES). `state.grade` drives the
// no-access popup in openSlot().
const MEMBER_KEY = "cra_member";
function saveMemberSession(id, grade) {
  state.grade = grade;
  try {
    window.localStorage.setItem(MEMBER_KEY, JSON.stringify({ id, grade }));
  } catch {
    /* localStorage may be unavailable (private mode) — gate still works in-session */
  }
}
function clearMemberSession() {
  state.grade = undefined;
  try {
    window.localStorage.removeItem(MEMBER_KEY);
  } catch {
    /* ignore */
  }
}
function restoreMemberSession() {
  try {
    const raw = window.localStorage.getItem(MEMBER_KEY);
    if (!raw) return;
    const m = JSON.parse(raw);
    if (m && [1, 2, 3].includes(m.grade)) state.grade = m.grade;
  } catch {
    /* ignore malformed/blocked storage */
  }
}

const adminBoard = document.querySelector("#adminBoard");
const adminLevelSelect = document.querySelector("#adminLevel");
const adminMonthSelect = document.querySelector("#adminMonth");
const adminStatus = document.querySelector("#adminStatus");
const adminNavBtn = document.querySelector("#adminNavBtn");
const logoutBtn = document.querySelector("#logoutBtn");
const adminSlotModal = document.querySelector("#adminSlotModal");
const adminSlotTitle = document.querySelector("#adminSlotTitle");
const adminSlotSub = document.querySelector("#adminSlotSub");
const adminSlotInput = document.querySelector("#adminSlotInput");
const adminSlotSave = document.querySelector("#adminSlotSave");
const adminSlotClear = document.querySelector("#adminSlotClear");
const loginForm = document.querySelector("#loginForm");
const loginId = document.querySelector("#loginId");
const loginPassword = document.querySelector("#loginPassword");
const loginError = document.querySelector("#loginError");
const memberForm = document.querySelector("#memberForm");
const memberId = document.querySelector("#memberId");
const memberPw = document.querySelector("#memberPw");
const memberGrade = document.querySelector("#memberGrade");
const memberName = document.querySelector("#memberName");
const memberStatus = document.querySelector("#memberStatus");
const memberList = document.querySelector("#memberList");
const memberEditModal = document.querySelector("#memberEditModal");
const memberEditSub = document.querySelector("#memberEditSub");
const memberEditGrade = document.querySelector("#memberEditGrade");
const memberEditPw = document.querySelector("#memberEditPw");
const memberEditStatus = document.querySelector("#memberEditStatus");
const memberEditSave = document.querySelector("#memberEditSave");
const signupToggle = document.querySelector("#signupToggle");
const loginSignup = document.querySelector("#loginSignup");
const signupForm = document.querySelector("#signupForm");
const signupNote = document.querySelector("#signupNote");

function setAdminStatus(text) {
  if (adminStatus) adminStatus.textContent = text || "";
}

// Human label for a slot key, e.g. "Week 1 · Mon · Story".
function slotLabel(slot) {
  if (slot === "opening") return "Opening Song";
  if (slot === "ending") return "Ending Song";
  const m = slot.match(/^w(\d)-(\w+)$/);
  if (m) {
    const dayIndex = weekdays.indexOf(m[2]);
    return `Week ${m[1]} · ${m[2]} · ${lessonTypes[dayIndex] || ""}`;
  }
  return slot;
}

// Load every content_pages row into the cache so user pages reflect saved data.
async function hydrateContent() {
  if (!sb) return;
  const { data, error } = await sb.from("content_pages").select("*");
  if (error || !data) return;
  data.forEach((row) => {
    contentCache[pageKey(row.level, row.month)] = {
      videos: row.videos || {},
      covers: row.covers || {},
    };
  });
  if (screens.content.classList.contains("screen-active")) refreshCovers();
}

// Mutable working copy of a page's data (for editing/saving).
function pageEntry(level, month) {
  const key = pageKey(level, month);
  if (!contentCache[key]) contentCache[key] = { videos: {}, covers: {} };
  if (!contentCache[key].videos) contentCache[key].videos = {};
  if (!contentCache[key].covers) contentCache[key].covers = {};
  return contentCache[key];
}

// Upsert the whole row so videos and covers never clobber each other.
async function savePage(level, month) {
  if (!sb) return { error: new Error("no client") };
  const entry = pageEntry(level, month);
  return sb
    .from("content_pages")
    .upsert({ level, month, videos: entry.videos, covers: entry.covers });
}

function updateAdminUI() {
  // signed-in = admin OR a logged-in member (grade set). Admin button is
  // admin-only; Log out shows for anyone signed in; Login hides when signed in
  // (CSS keys off body.signed-in).
  const signedIn = isAdmin || state.grade != null;
  document.body.classList.toggle("is-admin", isAdmin);
  document.body.classList.toggle("signed-in", signedIn);
  if (adminNavBtn) adminNavBtn.hidden = !isAdmin;
  if (logoutBtn) logoutBtn.hidden = !signedIn;
}

async function refreshAdminStatus() {
  if (!sb) {
    isAdmin = false;
    updateAdminUI();
    return;
  }
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) {
    isAdmin = false;
  } else {
    const { data, error } = await sb.rpc("is_admin");
    isAdmin = !error && data === true;
  }
  updateAdminUI();
}

function setLoginError(text) {
  if (!loginError) return;
  loginError.textContent = text || "";
  loginError.hidden = !text;
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginError("");
    const id = loginId ? loginId.value.trim() : "";
    const pw = loginPassword ? loginPassword.value : "";
    if (!id || !pw) {
      setLoginError("Enter your ID and password.");
      return;
    }
    if (!sb) {
      setLoginError("Login is not available right now.");
      return;
    }

    // Admins log in with an email; members with a plain ID. Branch on "@".
    if (id.includes("@")) {
      const { error } = await sb.auth.signInWithPassword({
        email: id,
        password: pw,
      });
      if (error) {
        setLoginError("Login failed. Check your ID and password.");
        return;
      }
      clearMemberSession(); // an admin session supersedes any member grade
      await refreshAdminStatus();
      if (loginPassword) loginPassword.value = "";
      if (isAdmin) {
        openAdmin();
      } else {
        setHash("home");
        showScreen("home");
      }
      return;
    }

    // Member (grade 1-3): validate format, then verify server-side via the RPC
    // (the hash never leaves the DB). Returns the grade or null.
    if (!ACCOUNT_RE.test(id) || !ACCOUNT_RE.test(pw)) {
      setLoginError(
        "ID and password must be at least 4 characters — letters, numbers or symbols, no spaces.",
      );
      return;
    }
    const { data: grade, error } = await sb.rpc("verify_member_login", {
      p_id: id,
      p_password: pw,
    });
    if (error || grade == null) {
      setLoginError("Login failed. Check your ID and password.");
      return;
    }
    saveMemberSession(id, grade);
    updateAdminUI();
    if (loginPassword) loginPassword.value = "";
    setHash("home");
    showScreen("home");
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    if (sb) await sb.auth.signOut();
    isAdmin = false;
    clearMemberSession();
    updateAdminUI();
    setHash("home");
    showScreen("home");
  });
}

function populateAdminSelectors() {
  if (adminLevelSelect && !adminLevelSelect.options.length) {
    levels.forEach((lvl) => {
      const opt = document.createElement("option");
      opt.value = lvl;
      opt.textContent = lvl;
      adminLevelSelect.append(opt);
    });
  }
  if (adminMonthSelect && !adminMonthSelect.options.length) {
    months.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      adminMonthSelect.append(opt);
    });
  }
  if (adminLevelSelect) adminLevelSelect.value = adminState.level;
  if (adminMonthSelect) adminMonthSelect.value = adminState.month;
}

function openAdmin() {
  if (!isAdmin) {
    setHash("login");
    showScreen("login");
    return;
  }
  populateAdminSelectors();
  setAdminView("content");
  renderAdminBoard();
  renderMembers();
  refreshSignupUI();
  setHash("admin");
  showScreen("admin");
}

if (adminNavBtn) adminNavBtn.addEventListener("click", openAdmin);

/* ---- Admin section tabs (Content / Members) --------------------------- */
// In-page tabs (no separate hash route): the top menu toggles which admin
// panel is visible. Both panels stay populated; only their visibility flips.
const adminTitle = document.querySelector("#adminTitle");
const adminMenuButtons = document.querySelectorAll(".admin-menu-btn");
const adminViews = {
  content: document.querySelector("#adminViewContent"),
  members: document.querySelector("#adminViewMembers"),
};
const adminViewTitles = { content: "콘텐츠 관리", members: "회원 관리" };

function setAdminView(view) {
  Object.entries(adminViews).forEach(([name, el]) => {
    if (el) el.hidden = name !== view;
  });
  adminMenuButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.adminView === view);
  });
  if (adminTitle && adminViewTitles[view]) {
    adminTitle.textContent = adminViewTitles[view];
  }
}

adminMenuButtons.forEach((btn) => {
  btn.addEventListener("click", () => setAdminView(btn.dataset.adminView));
});

/* ---- Member management (admin only) ----------------------------------- */

function setMemberStatus(text) {
  if (memberStatus) memberStatus.textContent = text || "";
}

// List all members (admin RLS allows the select). Each row: id · grade · name ·
// an Activate/Deactivate toggle (set_member_active RPC).
async function renderMembers() {
  if (!memberList) return;
  memberList.innerHTML = "";
  if (!sb || !isAdmin) return;
  const { data, error } = await sb
    .from("members")
    .select("id,grade,display_name,active")
    .order("created_at");
  if (error) {
    setMemberStatus("회원을 불러올 수 없습니다.");
    return;
  }
  if (!data.length) {
    memberList.innerHTML =
      '<p class="admin-member-empty">등록된 회원이 없습니다.</p>';
    return;
  }
  data.forEach((m) => {
    const row = document.createElement("div");
    row.className = "admin-member-row";
    if (!m.active) row.classList.add("is-inactive");
    const info = document.createElement("span");
    info.className = "admin-member-info";
    info.textContent = `${m.id} · 등급 ${m.grade}${
      m.display_name ? ` · ${m.display_name}` : ""
    }${m.active ? "" : " · (비활성)"}`;
    const actions = document.createElement("div");
    actions.className = "admin-member-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "admin-member-edit";
    edit.textContent = "수정";
    edit.addEventListener("click", () => openMemberEditor(m));

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "admin-member-toggle";
    toggle.textContent = m.active ? "비활성화" : "활성화";
    toggle.addEventListener("click", async () => {
      toggle.disabled = true;
      const { error: tErr } = await sb.rpc("set_member_active", {
        p_id: m.id,
        p_active: !m.active,
      });
      if (tErr) setMemberStatus("회원 정보를 수정할 수 없습니다.");
      else await renderMembers();
    });
    actions.append(edit, toggle);
    row.append(info, actions);
    memberList.append(row);
  });
}

if (memberForm) {
  memberForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMemberStatus("");
    if (!sb || !isAdmin) {
      setMemberStatus("관리자 전용입니다.");
      return;
    }
    const id = memberId ? memberId.value.trim() : "";
    const pw = memberPw ? memberPw.value : "";
    const grade = memberGrade ? Number(memberGrade.value) : 0;
    const name = memberName ? memberName.value.trim() : "";
    if (!ACCOUNT_RE.test(id) || !ACCOUNT_RE.test(pw)) {
      setMemberStatus(
        "아이디와 비밀번호는 공백 없이 4자 이상이어야 합니다(영문·숫자·기호).",
      );
      return;
    }
    if (![1, 2, 3].includes(grade)) {
      setMemberStatus("등급을 선택하세요 (1-3).");
      return;
    }
    const { error } = await sb.rpc("create_member", {
      p_id: id,
      p_password: pw,
      p_grade: grade,
      p_display_name: name || null,
    });
    if (error) {
      setMemberStatus("저장할 수 없습니다: " + (error.message || "error"));
      return;
    }
    setMemberStatus(`"${id}" 저장 완료 (등급 ${grade}).`);
    if (memberPw) memberPw.value = "";
    if (memberId) memberId.value = "";
    if (memberName) memberName.value = "";
    await renderMembers();
  });
}

/* ---- Member edit modal (grade + password) ----------------------------- */
// Per-member editor: change the grade (permission) and optionally reset the
// password. Backed by the update_member RPC (password is re-hashed server-side;
// a blank password keeps the current one). The id itself is not editable.
let editingMemberId = null;

function setMemberEditStatus(text) {
  if (memberEditStatus) memberEditStatus.textContent = text || "";
}

function openMemberEditor(m) {
  editingMemberId = m.id;
  if (memberEditSub)
    memberEditSub.textContent = `${m.id}${m.display_name ? ` · ${m.display_name}` : ""}`;
  if (memberEditGrade) memberEditGrade.value = String(m.grade);
  if (memberEditPw) memberEditPw.value = "";
  setMemberEditStatus("");
  if (memberEditModal) memberEditModal.hidden = false;
  document.body.classList.add("admin-modal-open");
  if (memberEditGrade) memberEditGrade.focus();
}

function closeMemberEditor() {
  editingMemberId = null;
  if (memberEditModal) memberEditModal.hidden = true;
  document.body.classList.remove("admin-modal-open");
}

async function commitMemberEdit() {
  if (!editingMemberId) return;
  if (!sb || !isAdmin) {
    setMemberEditStatus("관리자 전용입니다.");
    return;
  }
  const grade = memberEditGrade ? Number(memberEditGrade.value) : 0;
  const pw = memberEditPw ? memberEditPw.value : "";
  if (![1, 2, 3].includes(grade)) {
    setMemberEditStatus("등급을 선택하세요 (1-3).");
    return;
  }
  if (pw && !ACCOUNT_RE.test(pw)) {
    setMemberEditStatus(
      "비밀번호는 공백 없이 4자 이상이어야 합니다(영문·숫자·기호).",
    );
    return;
  }
  setMemberEditStatus("저장 중…");
  const { error } = await sb.rpc("update_member", {
    p_id: editingMemberId,
    p_grade: grade,
    p_password: pw ? pw : null,
  });
  if (error) {
    setMemberEditStatus("저장할 수 없습니다: " + (error.message || "error"));
    return;
  }
  const savedId = editingMemberId;
  closeMemberEditor();
  setMemberStatus(
    `"${savedId}" 수정 완료 (등급 ${grade})${pw ? " · 비밀번호 변경됨" : ""}.`,
  );
  await renderMembers();
}

if (memberEditModal) {
  memberEditModal.querySelectorAll("[data-member-edit-close]").forEach((el) => {
    el.addEventListener("click", closeMemberEditor);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !memberEditModal.hidden) closeMemberEditor();
  });
}
if (memberEditSave) {
  memberEditSave.addEventListener("click", commitMemberEdit);
}

/* ---- Signup visibility (placeholder) ---------------------------------- */

// Read the public site_settings flag.
async function getSignupVisible() {
  if (!sb) return false;
  const { data, error } = await sb
    .from("site_settings")
    .select("value")
    .eq("key", "signup_visible")
    .maybeSingle();
  if (error || !data) return false;
  return data.value === true;
}

// Sync both the login-page entry point and the admin toggle to the flag.
async function refreshSignupUI() {
  const visible = await getSignupVisible();
  if (loginSignup) loginSignup.hidden = !visible;
  if (signupToggle) signupToggle.checked = visible;
}

if (signupToggle) {
  signupToggle.addEventListener("change", async () => {
    if (!sb || !isAdmin) return;
    const next = signupToggle.checked;
    const { error } = await sb
      .from("site_settings")
      .upsert({ key: "signup_visible", value: next });
    if (error) {
      signupToggle.checked = !next;
      setMemberStatus("회원가입 표시 설정을 변경할 수 없습니다.");
      return;
    }
    if (loginSignup) loginSignup.hidden = !next;
    setMemberStatus(`회원가입 폼이 ${next ? "표시" : "숨김"} 상태입니다.`);
  });
}

// Placeholder: accounts are created by admins, so signup just guides the
// student to ask their teacher (no account is created here).
if (signupForm) {
  signupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (signupNote) {
      signupNote.textContent =
        "Please ask your teacher to create your account.";
      signupNote.hidden = false;
    }
  });
}

if (adminLevelSelect) {
  adminLevelSelect.addEventListener("change", () => {
    adminState.level = adminLevelSelect.value;
    renderAdminBoard();
  });
}
if (adminMonthSelect) {
  adminMonthSelect.addEventListener("change", () => {
    adminState.month = adminMonthSelect.value;
    renderAdminBoard();
  });
}

// One editable slot button reflecting its current URL.
function adminSlotButton(slot) {
  const url = getVideoUrl(adminState.level, adminState.month, slot);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-slot";
  button.dataset.slot = slot;
  button.dataset.filled = String(Boolean(url));
  const name = document.createElement("span");
  name.className = "admin-slot-name";
  name.textContent = slotLabel(slot);
  const value = document.createElement("span");
  value.className = "admin-slot-url";
  value.textContent = url || "미설정";
  button.append(name, value);
  button.addEventListener("click", () => openSlotEditor(slot));
  return button;
}

// One editable cover dropzone card reflecting the current cover.
function adminCoverCard(book) {
  const url = getCover(adminState.level, adminState.month, book);
  const card = document.createElement("div");
  card.className = "admin-cover";
  card.dataset.book = book;
  if (url) {
    card.classList.add("has-cover");
    card.style.backgroundImage = `url("${url}")`;
  }
  const label = document.createElement("span");
  label.className = "admin-cover-label";
  label.textContent = book === "book-1" ? "표지 1" : "표지 2";
  const hint = document.createElement("span");
  hint.className = "admin-cover-hint";
  hint.textContent = url
    ? "끌어다 놓거나 클릭해 교체"
    : "이미지를 끌어다 놓거나 클릭";
  card.append(label, hint);
  wireCoverCard(card, book);
  return card;
}

function renderAdminBoard() {
  if (!adminBoard) return;
  setAdminStatus("");
  if (adminLevelSelect) adminLevelSelect.value = adminState.level;
  if (adminMonthSelect) adminMonthSelect.value = adminState.month;
  adminBoard.innerHTML = "";

  const songs = document.createElement("div");
  songs.className = "admin-songs";
  songs.append(adminSlotButton("opening"), adminSlotButton("ending"));
  adminBoard.append(songs);

  const grid = document.createElement("div");
  grid.className = "admin-grid";

  // Level 1 mirrors the public page: a single cover (book-1) centered next to
  // all four weeks, instead of one cover per two-week book block. Slot keys are
  // w1..w4 (independent of the cover), so the four weeks of editors are kept.
  const singleCover = adminState.level === "Level 1";
  const books = singleCover ? [1] : [1, 2];
  let weekNumber = 0;
  books.forEach((book) => {
    const bookBlock = document.createElement("div");
    bookBlock.className = singleCover
      ? "admin-book admin-book--single"
      : "admin-book";
    bookBlock.append(adminCoverCard(`book-${book}`));

    const weeks = document.createElement("div");
    weeks.className = "admin-weeks";
    const weekCount = singleCover ? 4 : 2;
    for (let w = 0; w < weekCount; w += 1) {
      weekNumber += 1;
      const row = document.createElement("div");
      row.className = "admin-week-row";
      const label = document.createElement("span");
      label.className = "admin-week-label";
      label.textContent = `${weekNumber} week`;
      row.append(label);
      weekdays.forEach((day) => {
        row.append(adminSlotButton(`w${weekNumber}-${day}`));
      });
      weeks.append(row);
    }
    bookBlock.append(weeks);
    grid.append(bookBlock);
  });
  adminBoard.append(grid);
}

// --- Slot URL editor modal ---
let editingSlot = null;

function openSlotEditor(slot) {
  editingSlot = slot;
  const url = getVideoUrl(adminState.level, adminState.month, slot);
  if (adminSlotTitle) adminSlotTitle.textContent = slotLabel(slot);
  if (adminSlotSub)
    adminSlotSub.textContent = `${adminState.level} · ${adminState.month}`;
  if (adminSlotInput) adminSlotInput.value = url || "";
  if (adminSlotModal) adminSlotModal.hidden = false;
  document.body.classList.add("admin-modal-open");
  if (adminSlotInput) adminSlotInput.focus();
}

function closeSlotEditor() {
  editingSlot = null;
  if (adminSlotModal) adminSlotModal.hidden = true;
  document.body.classList.remove("admin-modal-open");
}

async function commitSlot(value) {
  if (!editingSlot) return;
  const slot = editingSlot;
  const entry = pageEntry(adminState.level, adminState.month);
  if (value) entry.videos[slot] = value;
  else delete entry.videos[slot];
  setAdminStatus("저장 중…");
  const { error } = await savePage(adminState.level, adminState.month);
  if (error) {
    setAdminStatus("저장 실패.");
    return;
  }
  setAdminStatus("저장 완료.");
  closeSlotEditor();
  renderAdminBoard();
}

if (adminSlotModal) {
  adminSlotModal.querySelectorAll("[data-admin-close]").forEach((el) => {
    el.addEventListener("click", closeSlotEditor);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !adminSlotModal.hidden) closeSlotEditor();
  });
}
if (adminSlotSave) {
  adminSlotSave.addEventListener("click", () => {
    commitSlot(adminSlotInput ? adminSlotInput.value.trim() : "");
  });
}
if (adminSlotClear) {
  adminSlotClear.addEventListener("click", () => commitSlot(""));
}

// --- Cover upload (drag-drop / click) ---
function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

async function uploadCover(book, file) {
  if (!sb || !file) return;
  setAdminStatus("업로드 중…");
  const path = `${slugify(adminState.level)}/${slugify(adminState.month)}/${book}`;
  const { error: upErr } = await sb.storage
    .from("covers")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) {
    setAdminStatus("업로드 실패.");
    return;
  }
  const { data } = sb.storage.from("covers").getPublicUrl(path);
  // Cache-bust so a replaced cover shows immediately everywhere.
  const url = `${data.publicUrl}?t=${Date.now()}`;
  const entry = pageEntry(adminState.level, adminState.month);
  entry.covers[book] = url;
  const { error: saveErr } = await savePage(adminState.level, adminState.month);
  if (saveErr) {
    setAdminStatus("저장 실패.");
    return;
  }
  setAdminStatus("표지 업데이트 완료.");
  renderAdminBoard();
}

function wireCoverCard(card, book) {
  card.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      if (input.files && input.files[0]) uploadCover(book, input.files[0]);
    });
    input.click();
  });
  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    card.classList.add("is-dragover");
  });
  card.addEventListener("dragleave", () =>
    card.classList.remove("is-dragover"),
  );
  card.addEventListener("drop", (event) => {
    event.preventDefault();
    card.classList.remove("is-dragover");
    const file =
      event.dataTransfer &&
      event.dataTransfer.files &&
      event.dataTransfer.files[0];
    if (file) uploadCover(book, file);
  });
}

renderMonths();
renderLessons();
renderLessonsV2();
renderCalendarV3();

const [view, hashLevel, hashMonth] = window.location.hash.slice(1).split("/");
if (view === "months" && hashLevel) {
  state.level = decodeURIComponent(hashLevel);
  monthLevelTag.textContent = state.level;
  applyLevelTheme();
  showScreen("months");
}

if (view === "overview") {
  showScreen("overview");
}

if (view === "login") {
  showScreen("login");
}

if (view === "content" && hashLevel && hashMonth) {
  state.level = decodeURIComponent(hashLevel);
  state.month = decodeURIComponent(hashMonth);
  monthLevelTag.textContent = state.level;
  updateContentMonthNumber();
  applyLevelTheme();
  showScreen("content");
}

if (view === "content-v2" && hashLevel && hashMonth) {
  state.level = decodeURIComponent(hashLevel);
  state.month = decodeURIComponent(hashMonth);
  monthLevelTag.textContent = state.level;
  updateContentV2Header();
  applyLevelTheme();
  showScreen("contentV2");
}

if (view === "content-v3" && hashLevel && hashMonth) {
  state.level = decodeURIComponent(hashLevel);
  state.month = decodeURIComponent(hashMonth);
  monthLevelTag.textContent = state.level;
  updateContentV3Header();
  renderCalendarV3();
  applyLevelTheme();
  showScreen("contentV3");
}

// Restore any admin session, load saved content from Supabase, then honor an
// #admin deep link (admins only — others are bounced to login).
(async () => {
  await refreshAdminStatus();
  if (!isAdmin) restoreMemberSession(); // admin session supersedes member grade
  updateAdminUI();
  refreshSignupUI();
  await hydrateContent();
  if (view === "admin") {
    // Mirror openAdmin() so a REFRESH on #admin restores the FULL admin view —
    // board AND member list (+ default tab). Previously this path rendered only
    // the board, so the member list stayed blank until openAdmin ran again
    // (e.g. re-clicking the Admin button), which looked like a slow/late load.
    // openAdmin() bounces non-admins to the login screen.
    openAdmin();
  }
})();
