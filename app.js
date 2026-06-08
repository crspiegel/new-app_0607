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

const screens = {
  home: document.querySelector("#homeScreen"),
  overview: document.querySelector("#overviewScreen"),
  months: document.querySelector("#monthScreen"),
  content: document.querySelector("#contentScreen"),
  contentV2: document.querySelector("#contentScreenV2"),
  contentV3: document.querySelector("#contentScreenV3"),
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

function showScreen(name) {
  Object.values(screens).forEach((screen) =>
    screen.classList.remove("screen-active"),
  );
  if (!screens[name]) {
    document.body.classList.remove("subpage-active");
    screens.home.classList.add("screen-active");
    return;
  }
  document.body.classList.toggle("subpage-active", name !== "home");
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
    button.innerHTML = `<span>MONTH ${month}</span><strong>${index + 3}</strong>`;
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

  monthlyBooks.forEach((book) => {
    const titleCard = document.createElement("div");
    titleCard.className = "book-title-card";
    titleCard.setAttribute("role", "img");
    titleCard.setAttribute("aria-label", `${book.title} cover placeholder`);
    lessonGrid.append(titleCard);

    for (let week = 1; week <= 2; week += 1) {
      const weekLabel = document.createElement("div");
      weekLabel.className = "week-label";
      weekLabel.textContent = `${week} week`;
      lessonGrid.append(weekLabel);

      weekdays.forEach((day, dayIndex) => {
        const button = document.createElement("button");
        button.className = `lesson-button day-${dayIndex + 1}`;
        button.type = "button";
        button.setAttribute(
          "aria-label",
          `${book.title}, ${week} week, ${lessonTypes[dayIndex]}`,
        );
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

document.querySelectorAll(".content-type").forEach((button) => {
  button.addEventListener("click", () => {
    document
      .querySelectorAll(".content-type")
      .forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
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
