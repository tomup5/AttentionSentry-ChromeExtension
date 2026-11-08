// Shared by every site's content script: current settings, page helpers, time
// tracking, and startSite(), which runs a site's hooks at the right moments.

const NAVIGATION_POLL_MS = 1000;
const ACTIVE_TIME_SAVE_MS = 15000;
const WAIT_TIMEOUT_MS = 10000;
const MUTATION_THROTTLE_MS = 250;

let settings = null;
let siteKey = null; // this site's key in settings, e.g. "reddit"

// Attention Sentry is on and this site's switch in the popup is on.
function siteActive() {
  return Boolean(settings?.studyMode && settings[siteKey].enabled);
}

function siteSettings() {
  return settings[siteKey];
}

// --- Helpers ---

function systemPrefersDark() {
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

// Resolve with the first element matching `selector`, or null after `timeout` ms.
// Sites render incrementally, so the element may not exist yet.
function waitFor(selector, timeout = WAIT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
    const observer = new MutationObserver(() => {
      const node = document.querySelector(selector);
      if (node) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// Content scripts can't close their own tab, so the background worker does it.
function closeTab() {
  chrome.runtime.sendMessage({ type: MESSAGES.CLOSE_TAB });
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

/**
 * Create a MutationObserver over the whole page that can be switched on and off.
 *   callback(records): runs on each batch of changes
 *   throttleMs: optional; run at most this often instead of on every batch
 *   observe: options for MutationObserver.observe()
 *   onStart(): optional; runs each time observing starts, e.g. to scan what's already there
 * Returns setEnabled(enabled), which is safe to call repeatedly.
 */
function createPageObserver(
  callback,
  { throttleMs, observe = { childList: true, subtree: true }, onStart } = {}
) {
  const handler = throttleMs ? throttle(callback, throttleMs) : callback;
  let observer = null;

  return function setEnabled(enabled) {
    if (enabled && !observer) {
      onStart?.();
      observer = new MutationObserver(handler);
      observer.observe(document.body, observe);
    } else if (!enabled && observer) {
      observer.disconnect();
      observer = null;
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
 * Load settings and session state, then keep the page in step with them.
 *   site: key in settings, e.g. "reddit"
 *   applyClasses(): required; syncs the CSS-driven features with the current settings
 *   onUrlChange(): resets per-page state. Runs only for a real page change, so
 *     state such as a stopped feed survives a settings change
 *   checkPage(): runs a page's prompts while the site is active, on every page
 *     change and settings change, so it must tolerate running twice on one page
 *   onActive(): redraws what depends on settings while the site is active
 *   onInactive(): cleans up anything beyond the shared UI when the site is off
 *   spa: true if the site changes pages without a full load, so the URL is polled
 *   navigationEvent: optional DOM event the site fires when it navigates
 *   isDark(): whether the host page is dark, for the "auto" background
 */
async function startSite({
  site,
  applyClasses,
  onUrlChange,
  checkPage,
  onActive,
  onInactive,
  spa = false,
  navigationEvent,
  isDark = systemPrefersDark
}) {
  siteKey = site;
  let lastHref = null;

  function applySettings() {
    applyAppearance(document, settings.appearance, isDark(), "sm-");
    applyClasses();

    if (!siteActive()) {
      clearAllUI();
      removeBadge();
      onInactive?.();
      return;
    }
    onActive?.();
    checkPage?.();
  }

  function startPage() {
    lastHref = location.href;
    onUrlChange?.();
    applySettings();
  }

  function followUrl() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    onUrlChange?.();
    applyClasses();
    if (siteActive()) checkPage?.();
  }

  [settings] = await Promise.all([loadSettings(), session.load(site)]);
  startPage();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.settings) {
      recordActiveTime(); // bank time under the old on/off state first
      settings = mergeSettings(changes.settings.newValue);
      applySettings();
    }
  });

  // Pages restored from the back/forward cache don't re-run content scripts,
  // and their in-memory session copy may be stale.
  window.addEventListener("pageshow", async (event) => {
    if (!event.persisted) return;
    [settings] = await Promise.all([loadSettings(), session.load(site)]);
    startPage();
  });

  if (spa) setInterval(followUrl, NAVIGATION_POLL_MS);
  if (navigationEvent) document.addEventListener(navigationEvent, followUrl);

  recordActiveTime();
  document.addEventListener("visibilitychange", recordActiveTime);
  setInterval(recordActiveTime, ACTIVE_TIME_SAVE_MS);
}
