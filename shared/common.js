// Names and small helpers used across the extension's contexts. Message types and
// storage keys are cross-context contracts, so each is defined once here.

const MS_PER_MINUTE = 60000;

const MESSAGES = {
  CLOSE_TAB: "closeTab",
  GET_TAB_ID: "getTabId",
  UNLOCK_SITE: "unlockSite"
};

const STORAGE_KEYS = {
  OPEN_SECTIONS: "openSections",
  SAVED_TANGENTS: "savedTangents",
  STUDY_CHANNELS: "discordStudyChannels",
  UNLOCKS: "unlocks",
  YOUTUBE_METRICS_EXPLAINED: "metricsExplained",
  REDDIT_METRICS_EXPLAINED: "redditMetricsExplained",
  DISCORD_BADGES_EXPLAINED: "discordBadgesExplained"
};

// The chrome.storage.session entry holding one tab's study session.
function tabSessionKey(tabId) {
  return `tab-${tabId}`;
}

// A stated intention as display text, or null if none was given.
function formatIntention(intent) {
  if (!intent || intent.reason === "skipped") return null;
  return intent.note ? `${intent.label}: "${intent.note}"` : intent.label;
}

// el("p", { class: "x", text: "hi", onclick: fn }, child1, child2)
// Text is always set via textContent, so user input is never parsed as HTML.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}
