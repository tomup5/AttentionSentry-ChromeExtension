// Shared by every site's content script: settings, per-tab session state, the
// intention check and goal badge, the endless-scroll nudge, and time tracking.
// Depends on globals from settings.js, appearance.js, techniques.js, and ui.js
// (see manifest load order). Each site script calls startSite() once.

let settings = null;
let siteKey = null; // this site's key in settings, e.g. "reddit"

// Attention Sentry is on and this site's switch in the popup is on.
function siteActive() {
  return Boolean(settings?.studyMode && settings[siteKey].enabled);
}

function siteSettings() {
  return settings[siteKey];
}

// --- Session ---
// Per-tab state that survives reloads but ends with the tab: one study session.
// Kept in chrome.storage.session rather than the page's sessionStorage, which
// the site's own scripts could read. Reads are served from an in-memory copy.
// Each site gets its own slot in the tab's entry, so a goal set on YouTube
// doesn't follow you to Reddit. `lastSite` tells the popup which slot to show.
const session = {
  storageKey: null,
  all: {},
  data: {},

  async load(site) {
    const tabId = await chrome.runtime.sendMessage({ type: "getTabId" });
    this.storageKey = `tab-${tabId}`;
    const stored = await chrome.storage.session.get(this.storageKey);
    this.all = stored[this.storageKey] ?? {};
    this.data = this.all[site] ?? {};
    this.all[site] = this.data;
    this.all.lastSite = site;
    this.save();
  },
  get(key, fallback) {
    return key in this.data ? this.data[key] : fallback;
  },
  set(key, value) {
    this.data[key] = value;
    this.save();
  },
  save() {
    // After the extension is reloaded or updated, scripts left in open tabs lose
    // access to chrome.* and the call below would throw instead of rejecting.
    if (!chrome.runtime?.id) return;
    chrome.storage.session.set({ [this.storageKey]: this.all }).catch(() => {
      // Quota or context errors only cost persistence across reloads.
    });
  }
};

// --- Helpers ---

// Resolve with the first element matching `selector`, or null after `timeout` ms.
// Sites render incrementally, so the element may not exist yet.
function waitFor(selector, timeout = 10000) {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);

    const observer = new MutationObserver(() => {
      const node = document.querySelector(selector);
      if (node) {
        observer.disconnect();
        resolve(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// Content scripts can't close their own tab, so the background worker does it.
function closeTab() {
  chrome.runtime.sendMessage({ type: "closeTab" });
}

// Go back to the previous page, or close the tab if there isn't one.
function goBack() {
  closeOverlay();
  if (history.length > 1) history.back();
  else closeTab();
}

// Run `fn` at most once per `ms`, on the trailing edge. For MutationObserver
// callbacks on sites that change the DOM constantly.
function throttle(fn, ms) {
  let timer = null;
  return () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

// --- Badge ---
// One small fixed button per page: the stated goal, the starting article, or the study channel.

function showBadge({ label, text, title, onClick, right = false }) {
  removeBadge();
  const badge = el(
    "button",
    { id: "sm-badge", class: right ? "sm-badge-right" : "", title, onclick: onClick },
    el("span", { class: "sm-badge-label", text: label }),
    text
  );
  document.body.append(badge);
}

function removeBadge() {
  document.getElementById("sm-badge")?.remove();
}

// --- Intention check ---
// `config` is { siteName, reasons, placeholder, onAccept }:
//   reasons: [{ value, label, studying }]
//   onAccept(): optional, runs after the overlay closes (e.g. resume the video)

function intentionText() {
  const intent = session.get("intention", null);
  if (!intent || intent.reason === "skipped") return null;
  return intent.note ? `${intent.label}: "${intent.note}"` : intent.label;
}

function showIntentionScreen(config) {
  const mode = settings.mode;

  const select = el(
    "select",
    { class: "sm-select" },
    el("option", { value: "", text: "Choose a reason…" }),
    ...config.reasons.map((r) => el("option", { value: r.value, text: r.label }))
  );
  const note = el("input", {
    class: "sm-input",
    type: "text",
    maxlength: "80",
    placeholder: config.placeholder
  });
  const form = el("div", { class: "sm-form" }, select, note);

  const overlay = showOverlay({
    title: `What brings you to ${config.siteName}?`,
    body: "Say why you're here before you go on.",
    technique: TECHNIQUES.intention,
    content: form
  });
  if (!overlay) return;

  function accept(reason) {
    session.set("intention", {
      reason: reason?.value || "skipped",
      label: reason?.label || "No reason given",
      note: note.value.trim()
    });
    session.set("intentionAsked", true);
    overlay.close();
    renderIntentionBadge(config);
    config.onAccept?.();
  }

  // Available buttons depend on the mode and the selected reason.
  function updateButtons() {
    const reason = config.reasons.find((r) => r.value === select.value);

    if (mode === "hint") {
      overlay.setButtons([
        { label: "Skip", onClick: () => accept(null) },
        { label: "Continue", primary: true, onClick: () => accept(reason) }
      ]);
      return;
    }

    // Pause and Block require a reason.
    if (!reason) {
      overlay.setButtons([{ label: "Pick a reason first", onClick: () => select.focus() }]);
      return;
    }

    if (reason.studying) {
      overlay.setButtons([{ label: "Continue", primary: true, onClick: () => accept(reason) }]);
    } else if (mode === "pause") {
      overlay.setButtons([
        { label: "Back to studying", primary: true, onClick: goBack },
        { label: "Continue anyway", countdown: 10, onClick: () => accept(reason) }
      ]);
    } else {
      // Block: no way through except turning Attention Sentry off in the popup.
      overlay.setButtons([{ label: "Back to studying", primary: true, onClick: goBack }]);
    }
  }

  select.addEventListener("change", updateButtons);
  updateButtons();
}

// Bottom-left reminder of the stated intention; click to change it.
function renderIntentionBadge(config) {
  removeBadge();
  const text = intentionText();
  if (!text || !siteActive() || !siteSettings().intention) return;
  showBadge({
    label: "Goal",
    text,
    title: "Click to change your reason",
    onClick: () => showIntentionScreen(config)
  });
}

// --- Endless-scroll nudge ---
// For sites with infinite feeds. Reads scrollNudge and scrollScreens from the site's settings.
//   isFeed(): whether the current page is a feed
//   stopFeed(): Block mode; stop the feed from loading more
// Returns { reset }, to call on every navigation.

function createScrollNudge({ siteName, isFeed, stopFeed }) {
  let nextTrigger = 0; // in screen-heights

  function onScroll() {
    if (!siteActive() || !siteSettings().scrollNudge) return;
    if (!isFeed() || isOverlayOpen()) return;

    const screens = window.scrollY / window.innerHeight;
    if (screens < nextTrigger) return;

    nextTrigger += siteSettings().scrollScreens;
    const depth = Math.round(screens);
    const close = { label: `Close ${siteName}`, primary: true, onClick: closeTab };

    if (settings.mode === "hint") {
      showToast({
        title: `You've scrolled about ${depth} screens down`,
        body: intentionText() ? `You came here for: ${intentionText()}` : null,
        technique: TECHNIQUES.infiniteScroll
      });
    } else if (settings.mode === "pause") {
      showOverlay({
        title: `${depth} screens of scrolling`,
        body: "Is what you need really further down?",
        technique: TECHNIQUES.infiniteScroll,
        buttons: [close, { label: "Keep scrolling", countdown: 10, onClick: (c) => c() }]
      });
    } else {
      stopFeed();
      showOverlay({
        title: "This feed now has a bottom",
        body: `We stopped ${siteName} from loading more. If you need something specific, search for it.`,
        technique: TECHNIQUES.infiniteScroll,
        buttons: [close, { label: "OK", onClick: (c) => c() }]
      });
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  return {
    reset() {
      nextTrigger = siteSettings().scrollScreens;
    }
  };
}

// --- Session time ---
// Only time with the tab visible and the site active counts, so a tab left
// open in the background doesn't inflate the popup's summary.

let visibleSince = null;

function recordActiveTime() {
  const now = Date.now();
  if (visibleSince !== null && siteActive()) {
    session.set("activeMs", session.get("activeMs", 0) + (now - visibleSince));
  }
  visibleSince = document.visibilityState === "visible" ? now : null;
}

// --- Startup ---

/**
 * Load settings and session state, then run `apply` now and on every settings change.
 *   site: key in settings, e.g. "reddit"
 *   apply(): applies the current settings to the page
 *   onNavigate(): optional; polled every second for single-page apps, should
 *     be a no-op when the URL hasn't changed
 *   isDark(): whether the host page is dark, for the "auto" background
 */
async function startSite({ site, apply, onNavigate, isDark }) {
  siteKey = site;
  isDark ??= () => matchMedia("(prefers-color-scheme: dark)").matches;

  function applyAll() {
    applyAppearance(document, settings.appearance, isDark(), "sm-");
    apply();
  }

  [settings] = await Promise.all([loadSettings(), session.load(site)]);
  applyAll();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.settings) {
      recordActiveTime(); // bank time under the old on/off state first
      settings = mergeSettings(changes.settings.newValue);
      applyAll();
    }
  });

  // Pages restored from the back/forward cache don't re-run content scripts,
  // and their in-memory session copy may be stale.
  window.addEventListener("pageshow", async (event) => {
    if (!event.persisted) return;
    [settings] = await Promise.all([loadSettings(), session.load(site)]);
    applyAll();
  });

  if (onNavigate) setInterval(onNavigate, 1000);

  recordActiveTime();
  document.addEventListener("visibilitychange", recordActiveTime);
  setInterval(recordActiveTime, 15000);
}
