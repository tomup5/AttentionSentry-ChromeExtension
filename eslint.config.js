const js = require("@eslint/js");
const globals = require("globals");

// No bundler, the scripts just share globals. Listing them here so a typo'd name
// across files fails lint.
const readonly = (names) => Object.fromEntries(names.map((name) => [name, "readonly"]));

const SHARED = readonly([
  "ACCENTS",
  "BACKGROUND_OPTIONS",
  "BLOCKABLE_SITES",
  "DEFAULT_SETTINGS",
  "FONTS",
  "MESSAGES",
  "MS_PER_MINUTE",
  "STORAGE_KEYS",
  "TEXT_SIZES",
  "THEMES",
  "UNLOCK_MINUTES",
  "allSites",
  "applyAppearance",
  "chosenSites",
  "customSite",
  "el",
  "formatIntention",
  "isBlockingOn",
  "loadSettings",
  "mergeSettings",
  "normalizeDomain",
  "originPattern",
  "persistSettings",
  "resolvePalette",
  "resolveTheme",
  "saveSettings",
  "siteForHost",
  "tabSessionKey"
]);

const UI = readonly([
  "TOAST_DURATION_MS",
  "clearAllUI",
  "closeOverlay",
  "isOverlayOpen",
  "showOverlay",
  "showToast"
]);

const CONTENT = readonly([
  "LONG_COUNTDOWN_S",
  "MUTATION_THROTTLE_MS",
  "SHORT_COUNTDOWN_S",
  "TECHNIQUES",
  "closeTab",
  "createPageObserver",
  "createScrollNudge",
  "explainOnce",
  "goBack",
  "goalReminder",
  "intentionText",
  "removeBadge",
  "renderIntentionBadge",
  "session",
  "settings",
  "showBadge",
  "showCountCheckIn",
  "showIntentionScreen",
  "siteActive",
  "siteSettings",
  "startSite",
  "systemPrefersDark",
  "throttle",
  "waitFor"
]);

const POPUP = {
  ...readonly([
    "SITE_SECTIONS",
    "blockerSection",
    "buildExtra",
    "buildSiteSections",
    "controls",
    "lists",
    "removeButton",
    "renderAppearance",
    "renderOrder",
    "renderSavedTangents",
    "renderSections",
    "renderSession",
    "renderSiteAccess",
    "renderSites",
    "renderStudyChannels",
    "toggleSection",
    "update"
  ]),
  featureInputs: "writable",
  openSections: "writable",
  settings: "writable"
};

module.exports = [
  { ignores: ["node_modules/", "dist/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: { ...globals.browser, ...globals.webextensions, ...SHARED }
    },
    rules: {
      eqeqeq: "error",
      "no-redeclare": ["error", { builtinGlobals: false }],
      "no-shadow": "error",
      "no-unused-vars": ["error", { vars: "local" }],
      "no-var": "error",
      "prefer-const": "error"
    }
  },
  { files: ["background.js"], languageOptions: { globals: globals.serviceworker } },
  { files: ["content/**/*.js"], languageOptions: { globals: { ...UI, ...CONTENT } } },
  { files: ["content/site-runtime.js"], languageOptions: { globals: { settings: "writable" } } },
  { files: ["blocked/**/*.js"], languageOptions: { globals: UI } },
  { files: ["popup/**/*.js"], languageOptions: { globals: POPUP } },
  {
    files: ["tests/**/*.js", "scripts/**/*.js", "eslint.config.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node }
  }
];
