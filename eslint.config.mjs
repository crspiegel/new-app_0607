// Top-level names declared by video-source.js (classic script, loaded before
// app.js and play.js — one shared global lexical scope). Tests use them inside
// page.evaluate callbacks.
const videoSourceGlobals = {
  months: "readonly",
  lessonTypes: "readonly",
  weekdays: "readonly",
  LEVELS: "readonly",
  levelInfo: "readonly",
  levelLabel: "readonly",
  levelFromLegacy: "readonly",
  levelFromAny: "readonly",
  levelDbKeys: "readonly",
  levelThemeClass: "readonly",
  TOOLBAR_BUTTONS: "readonly",
  toolbarButtons: "readonly",
  weekdaySlotKeys: "readonly",
  allSlotKeys: "readonly",
  qrLevelCode: "readonly",
  levelFromQrCode: "readonly",
  monthNumber: "readonly",
  monthFromNumber: "readonly",
  slotToQr: "readonly",
  slotFromQr: "readonly",
  slotTitle: "readonly",
  qrPath: "readonly",
  BOOK_LAYOUT: "readonly",
  bookLayout: "readonly",
  bookEntry: "readonly",
  bookSlotKeys: "readonly",
  bookToolbarButtons: "readonly",
  bookQrPath: "readonly",
  bookQrName: "readonly",
  bookTitle: "readonly",
  COVER_EXT: "readonly",
  coverAssetPath: "readonly",
  YT_ID_RE: "readonly",
  GAME_HOSTS: "readonly",
  isGameUrl: "readonly",
  setExtraGameHosts: "readonly",
  parseVideoSource: "readonly",
  isExternalVideoPage: "readonly",
  publisherVimeoId: "readonly",
  disableYouTubeCaptions: "readonly",
};

// Top-level names declared by board-view.js (shared DOM builders, loaded
// after video-source.js and before app.js / play.js).
const boardViewGlobals = {
  ICON_SVGS: "readonly",
  buildToolbarButton: "readonly",
  buildCoverCard: "readonly",
  buildWeekRow: "readonly",
};

export default [
  // video-source.js is the shared data/parser file; its declarations are
  // consumed by other scripts (listed in its /* exported */ comment).
  {
    files: ["video-source.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        URL: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
    },
  },
  // board-view.js builds the board markup for both pages; it reads the
  // video-source.js data (weekdays, lessonTypes) and touches the DOM only
  // inside its functions.
  {
    files: ["board-view.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        document: "readonly",
        ...videoSourceGlobals,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
    },
  },
  // play.js is the QR student page (play.html) — a classic script loaded after
  // video-source.js and supabase-config.js. Browser-only; reads, never writes.
  {
    files: ["play.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        document: "readonly",
        window: "readonly",
        URLSearchParams: "readonly",
        ...videoSourceGlobals,
        ...boardViewGlobals,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
    },
  },
  // background-editor.js and hero-banner.js are classic scripts loaded after
  // app.js, sharing its top-level lexical scope — those cross-file identifiers
  // are globals here.
  {
    files: ["background-editor.js", "hero-banner.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        document: "readonly",
        window: "readonly",
        console: "readonly",
        sb: "readonly",
        state: "readonly",
        isAdmin: "readonly",
        adminState: "readonly",
        levelLabel: "readonly",
        levelDbKeys: "readonly",
        showScreen: "readonly",
        setHash: "readonly",
        updateContentMonthNumber: "readonly",
        applyLevelTheme: "readonly",
        monthLevelTag: "readonly",
        hydrateBackgrounds: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
    },
  },
  // teacher-resources.js: classic script after app.js (same shared scope).
  {
    files: ["teacher-resources.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        document: "readonly",
        window: "readonly",
        sb: "readonly",
        state: "readonly",
        isAdmin: "readonly",
        showScreen: "readonly",
        setHash: "readonly",
        applyLevelTheme: "readonly",
        monthLevelTag: "readonly",
        canSeeTeacherResources: "readonly",
        LEVELS: "readonly",
        levelLabel: "readonly",
        levelFromAny: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
    },
  },
  {
    files: ["app.js", "scripts/**/*.mjs", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        document: "readonly",
        window: "readonly",
        history: "readonly",
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        ...videoSourceGlobals,
        ...boardViewGlobals,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
    },
  },
];
