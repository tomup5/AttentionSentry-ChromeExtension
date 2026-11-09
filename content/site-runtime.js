// Common content script plumbing. Each site calls startSite() once.

const NAVIGATION_POLL_MS = 1000;
const ACTIVE_TIME_SAVE_MS = 15000;
const WAIT_TIMEOUT_MS = 10000;
const MUTATION_THROTTLE_MS = 250;

/** @type {Settings} */
let settings = null;
let siteKey = null; // e.g. "reddit"

function siteActive() {
  return Boolean(settings?.studyMode && settings[siteKey].enabled);
}

function siteSettings() {
  return settings[siteKey];
}

function systemPrefersDark() {
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

// Resolves to null after the timeout. Sites render incrementally so it may not exist yet.
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

function closeTab() {
  chrome.runtime.sendMessage({ type: MESSAGES.CLOSE_TAB });
}

function goBack() {
  closeOverlay();
  if (history.length > 1) history.back();
  else closeTab();
}

// Trailing throttle for observers on sites that never stop changing the DOM
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

// Whole-page MutationObserver with an on/off switch. Returns setEnabled(bool), which is
// fine to call repeatedly. onStart runs every time observing starts, throttleMs limits
// how often the callback runs, and observe overrides the MutationObserver options.
/**
 * @param {(records: MutationRecord[]) => void} callback
 * @param {PageObserverOptions} [options]
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

// Only counts while the tab is visible, otherwise a background tab inflates the summary

let visibleSince = null;

function recordActiveTime() {
  const now = Date.now();
  if (visibleSince !== null && siteActive()) {
    session.set("activeMs", session.get("activeMs", 0) + (now - visibleSince));
  }
  visibleSince = document.visibilityState === "visible" ? now : null;
}

// Site hooks:
//   applyClasses - required, syncs the CSS-driven features with settings
//   onUrlChange  - resets per-page state. Real page changes only, so a stopped feed
//                  doesn't come back when a setting changes
//   checkPage    - the page's prompts. Runs on page and settings changes, so it has
//                  to be ok with running twice on one page
//   onActive     - redraw whatever depends on settings
//   onInactive   - extra cleanup when the site gets switched off
//   spa          - poll the URL, for sites that change pages without a full load
//   navigationEvent - DOM event the site fires when it navigates, if it has one
//   isDark       - whether the host page is dark, for the "auto" background
/** @param {SiteHooks} hooks */
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
      recordActiveTime(); // count this under the old on/off state
      settings = mergeSettings(changes.settings.newValue);
      applySettings();
    }
  });

  // bfcache restores don't re-run content scripts and the in-memory session may be stale
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
