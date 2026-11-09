// Settings defaults and storage helpers.

/** @type {Settings} */
const DEFAULT_SETTINGS = {
  studyMode: false,
  mode: "hint", // "hint" | "pause" | "block"
  // popup section order, set with the arrows in each header
  sectionOrder: ["youtube", "reddit", "wikipedia", "discord", "nyt", "siteBlock"],
  // enabled is the switch in each site's popup header
  youtube: {
    enabled: true,
    intention: true,
    hideMetrics: true,
    blurThumbnails: false,
    scrollNudge: true,
    scrollScreens: 10, // screens scrolled (or Shorts watched) before a nudge
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
    hopLimit: 5, // links away from the starting article before a check-in
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
    articleLimit: 3, // articles per session before a check-in
    hideRecirc: true
  },
  siteBlock: {
    enabled: false,
    // Built-in site IDs the user unchecked. Stored this way so sites added later start checked.
    excluded: [],
    custom: [] // domains the user added, e.g. "reddit.com"
  },
  appearance: {
    // keys from appearance.js
    font: "russoOne",
    background: "burntOrange",
    accent: "theme",
    textSize: "default"
  }
};

// Merge over the defaults so settings added in later versions still have a value
/** @returns {Settings} */
function mergeSettings(saved) {
  saved = saved || {};
  const merged = { ...DEFAULT_SETTINGS, ...saved };
  for (const [key, defaults] of Object.entries(DEFAULT_SETTINGS)) {
    if (typeof defaults === "object" && !Array.isArray(defaults))
      merged[key] = { ...defaults, ...(saved[key] || {}) };
  }
  return merged;
}

/** @returns {Promise<Settings>} */
async function loadSettings() {
  const stored = await chrome.storage.sync.get("settings");
  return mergeSettings(stored.settings);
}

async function saveSettings(settings) {
  await chrome.storage.sync.set({ settings });
}

// On failure, returns what's actually stored along with the error
/**
 * @param {Settings} draft
 * @returns {Promise<{ settings: Settings, error: Error | null }>}
 */
async function persistSettings(draft) {
  try {
    await saveSettings(draft);
    return { settings: draft, error: null };
  } catch (error) {
    return { settings: await loadSettings(), error };
  }
}
