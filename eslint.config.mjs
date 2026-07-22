export default [
  // background-editor.js is a classic script loaded after app.js, sharing its
  // top-level lexical scope — those cross-file identifiers are globals here.
  {
    files: ["background-editor.js"],
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
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
    },
  },
];
