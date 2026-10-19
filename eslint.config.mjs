// Top-level names declared by video-source.js (classic script, loaded before
// app.js and play.js — one shared global lexical scope). Tests use them inside
// page.evaluate callbacks.
const videoSourceGlobals = {
  months: "readonly",
  lessonTypes: "readonly",
  weekdays: "readonly",
  LEVEL_LABELS: "readonly",
  levelLabel: "readonly",
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
  qrPath: "readonly",
  YT_ID_RE: "readonly",
  parseVideoSource: "readonly",
  isExternalVideoPage: "readonly",
  publisherVimeoId: "readonly",
  disableYouTubeCaptions: "readonly",
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
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
    },
  },
];
