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

const levelStrands = {
  "Level 1": "Pink A/B, Red, Yellow",
  "Level 2": "Blue, Green, Orange",
  "Level 3": "Turquoise, Purple, Gold",
  "Level 4": "White and Adventure Strands",
};

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

const screens = {
  home: document.querySelector("#homeScreen"),
  overview: document.querySelector("#overviewScreen"),
  months: document.querySelector("#monthScreen"),
  content: document.querySelector("#contentScreen"),
  contentV2: document.querySelector("#contentScreenV2"),
  contentV3: document.querySelector("#contentScreenV3"),
  login: document.querySelector("#loginScreen"),
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
const monthStrandTag = document.querySelector("#monthStrandTag");
const contentPathTag = document.querySelector("#contentPathTag");
const contentTitle = document.querySelector("#contentTitle");
const contentLevelName = document.querySelector("#contentLevelName");
const contentLevelBand = document.querySelector("#contentLevelBand");
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
  monthStrandTag.textContent = levelStrands[state.level] || "";
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

  window.location.hash = `content/${encodeURIComponent(state.level)}/${encodeURIComponent(state.month)}`;
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
  contentLevelBand.textContent = levelStrands[state.level] || "";
  contentBannerMonthNumber.textContent =
    monthIndex >= 0 ? String(monthIndex + 3) : "";
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
    button.innerHTML = `<span>${month}</span><strong>${index + 3}</strong>`;
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

  monthlyBooks.forEach((book) => {
    const titleCard = document.createElement("div");
    titleCard.className = "book-title-card";
    titleCard.setAttribute("role", "img");
    titleCard.setAttribute("aria-label", `${book.title} cover placeholder`);
    lessonGrid.append(titleCard);

    for (let week = 1; week <= 2; week += 1) {
      weekNumber += 1;
      const weekLabel = document.createElement("div");
      weekLabel.className = "week-label";
      weekLabel.textContent = `${weekNumber} week`;
      lessonGrid.append(weekLabel);

      weekdays.forEach((day, dayIndex) => {
        const button = document.createElement("button");
        button.className = `lesson-button day-${dayIndex + 1}`;
        button.type = "button";
        button.setAttribute(
          "aria-label",
          `${book.title}, ${weekNumber} week, ${lessonTypes[dayIndex]}`,
        );
        // Context label shown in the video player title (Level 1 / March),
        // e.g. "Story · Week 1 · Tue".
        button.dataset.vpTitle = `${lessonTypes[dayIndex]} · Week ${weekNumber} · ${day}`;
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

const SAMPLE_VIMEO_ID = 210024645;

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
const vpVolumeFill = document.querySelector("#vpVolumeFill");
const vpVolumeThumb = document.querySelector("#vpVolumeThumb");
const vpEndOverlay = document.querySelector("#vpEndOverlay");
const vpReplay = document.querySelector("#vpReplay");
const videoPlayerCard = videoModal
  ? videoModal.querySelector(".video-player-card")
  : null;

let vimeoPlayer = null;
let vpLoopOn = false;
let vpPlaying = false;
let vpVolumeLevel = 1;
let vpLastVolume = 1;
let vpDuration = 0;
let vpCurrentSeconds = 0;
let vpDragging = false;
let vpHideTimer = null;

function isLevel1March() {
  return state.level === "Level 1" && state.month === "March";
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
  if (vimeoPlayer) vimeoPlayer.setCurrentTime(clamped).catch(() => {});
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
  if (vpVolumeFill) vpVolumeFill.style.width = `${pct}%`;
  if (vpVolumeThumb) vpVolumeThumb.style.left = `${pct}%`;
  if (vpVolume) vpVolume.setAttribute("aria-valuenow", String(pct));
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
  if (commit && vimeoPlayer)
    vimeoPlayer.setVolume(vpVolumeLevel).catch(() => {});
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
  if (!vimeoPlayer) return;
  if (vpPlaying) {
    vimeoPlayer.pause().catch(() => {});
  } else {
    vimeoPlayer.play().catch(() => {});
  }
}

function openVideoPlayer(label) {
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

  if (window.Vimeo && window.Vimeo.Player) {
    if (vimeoPlayer) {
      vimeoPlayer.destroy().catch(() => {});
      vimeoPlayer = null;
    }
    vpFrame.innerHTML = "";
    vimeoPlayer = new window.Vimeo.Player(vpFrame, {
      id: SAMPLE_VIMEO_ID,
      controls: false,
      loop: vpLoopOn,
      responsive: false,
    });
    vimeoPlayer
      .getDuration()
      .then((duration) => {
        vpDuration = duration;
        setVpTimes(0, duration);
      })
      .catch(() => {});
    vimeoPlayer.on("timeupdate", (data) => {
      vpDuration = data.duration || vpDuration;
      if (!vpDragging) {
        vpCurrentSeconds = data.seconds || 0;
        setVpProgress((data.percent || 0) * 100);
        setVpTimes(data.seconds, vpDuration);
      }
    });
    // Buffered (loaded) amount, for the lighter track indicator.
    vimeoPlayer.on("progress", (data) => {
      setVpBuffer((data.percent || 0) * 100);
    });
    // Apply the persisted volume to the fresh player and keep the UI in sync.
    vimeoPlayer.setVolume(vpVolumeLevel).catch(() => {});
    vimeoPlayer.on("volumechange", (data) => {
      vpVolumeLevel = data.volume;
      if (vpVolumeLevel > 0) vpLastVolume = vpVolumeLevel;
      reflectVolumeUI();
    });
    vimeoPlayer.on("play", () => {
      setVpPlaying(true);
      setVpEnded(false);
    });
    vimeoPlayer.on("pause", () => setVpPlaying(false));
    // On end, cover Vimeo's related-videos screen with our own end overlay.
    vimeoPlayer.on("ended", () => {
      setVpPlaying(false);
      setVpEnded(true);
    });
    vimeoPlayer.setLoop(vpLoopOn).catch(() => {});
    vimeoPlayer.play().catch(() => {});
  }
}

function closeVideoPlayer() {
  if (!videoModal) return;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  if (vimeoPlayer) {
    vimeoPlayer.destroy().catch(() => {});
    vimeoPlayer = null;
  }
  if (vpFrame) {
    vpFrame.innerHTML = "";
  }
  videoModal.hidden = true;
  document.body.classList.remove("video-open");
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
    if (!vimeoPlayer) return;
    vimeoPlayer
      .setCurrentTime(0)
      .then(() => vimeoPlayer.play())
      .catch(() => {});
  });

  vpStop.addEventListener("click", () => {
    if (!vimeoPlayer) return;
    vimeoPlayer
      .pause()
      .then(() => vimeoPlayer.setCurrentTime(0))
      .catch(() => {});
    setVpProgress(0);
    setVpTimes(0, vpDuration);
  });

  vpLoop.addEventListener("click", () => {
    vpLoopOn = !vpLoopOn;
    vpLoop.setAttribute("aria-pressed", String(vpLoopOn));
    if (vimeoPlayer) vimeoPlayer.setLoop(vpLoopOn).catch(() => {});
  });

  // Mute / unmute: Vimeo has no separate mute, so toggle volume between 0 and
  // the last non-zero level. (Both persist across opens.)
  vpMute.addEventListener("click", () => {
    applyVolume(vpVolumeLevel > 0 ? 0 : vpLastVolume || 1);
  });

  // Volume slider: drag / click / keyboard (±10%).
  const volRatioFromEvent = (event) => {
    const rect = vpVolume.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  };
  let vpVolDragging = false;
  vpVolume.addEventListener("pointerdown", (event) => {
    vpVolDragging = true;
    vpVolume.classList.add("is-dragging");
    vpVolume.setPointerCapture(event.pointerId);
    applyVolume(volRatioFromEvent(event));
  });
  vpVolume.addEventListener("pointermove", (event) => {
    if (vpVolDragging) applyVolume(volRatioFromEvent(event));
  });
  const endVolDrag = () => {
    if (!vpVolDragging) return;
    vpVolDragging = false;
    vpVolume.classList.remove("is-dragging");
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
    event.preventDefault();
  });

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
    if (!vimeoPlayer || !vpDuration) return;
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
    if (vimeoPlayer && vpDuration) {
      vimeoPlayer.setCurrentTime(ratio * vpDuration).catch(() => {});
    }
  };
  vpProgress.addEventListener("pointerup", endDrag);
  vpProgress.addEventListener("pointercancel", endDrag);

  // Keyboard seeking on the slider: ±5s with arrows, Home/End to jump.
  vpProgress.addEventListener("keydown", (event) => {
    if (!vimeoPlayer || !vpDuration) return;
    if (event.key === "ArrowRight") seekTo(vpCurrentSeconds + 5);
    else if (event.key === "ArrowLeft") seekTo(vpCurrentSeconds - 5);
    else if (event.key === "Home") seekTo(0);
    else if (event.key === "End") seekTo(vpDuration);
    else return;
    event.preventDefault();
  });

  // The 20 weekday lesson buttons live in #lessonGrid (shared by all levels
  // and months); open the player only on Level 1 / March.
  lessonGrid.addEventListener("click", (event) => {
    const button = event.target.closest(".lesson-button");
    if (button && isLevel1March()) {
      openVideoPlayer(button.dataset.vpTitle || "");
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
    // middle three are hidden); open the player on Level 1 / March only.
    if (isLevel1March()) {
      const label = button.querySelector("span:last-child");
      openVideoPlayer(label ? label.textContent.trim() : "");
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
