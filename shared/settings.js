// Settings schema and storage helpers, shared by the popup, the content scripts,
// the background worker, and the blocked page.

const DEFAULT_SETTINGS = {
  studyMode: false,
  mode: "hint", // "hint" | "pause" | "block"
  // Each site has an `enabled` switch (the one in its popup header) plus its features.
  youtube: {
    enabled: true,
    intention: true,
    hideMetrics: true,
    blurThumbnails: false,
    scrollNudge: true,
    scrollScreens: 10, // screen-heights scrolled (or Shorts watched) before a nudge
    rabbitHole: true
  },
  reddit: {
    enabled: true,
    intention: true,
    hideMetrics: true,
    scrollNudge: true,
    scrollScreens: 10,
    hideSidebars: true
  },
  wikipedia: {
    enabled: true,
    rabbitHole: true,
    hopLimit: 5, // links followed away from the starting article before a check-in
    topicBadge: true,
    saveTangents: true,
    hideMainPage: true
  },
  discord: {
    enabled: true,
    studyChannels: true,
    hideBadges: true
  },
  nyt: {
    enabled: true,
    intention: true,
    games: true,
    articleCheck: true,
    articleLimit: 3, // articles in one session before a check-in
    hideRecirc: true
  },
  siteBlock: {
    enabled: false,
    // Built-in site IDs (keys of BLOCKABLE_SITES) the user unchecked. Stored as
    // exclusions so sites added in later versions start checked.
    excluded: [],
    custom: [] // domains the user added, e.g. "reddit.com"
  },
  appearance: {
    // Keys of the option maps in appearance.js.
    font: "system",
    background: "auto",
    accent: "theme",
    textSize: "default"
  }
};

// Layer saved settings over the defaults so keys added in later versions
// still get a value for users with older saved settings.
function mergeSettings(saved) {
  saved = saved || {};
  const merged = { ...DEFAULT_SETTINGS, ...saved };
  for (const [key, defaults] of Object.entries(DEFAULT_SETTINGS)) {
    if (typeof defaults === "object") merged[key] = { ...defaults, ...(saved[key] || {}) };
  }
  return merged;
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get("settings");
  return mergeSettings(stored.settings);
}

async function saveSettings(settings) {
  await chrome.storage.sync.set({ settings });
}
