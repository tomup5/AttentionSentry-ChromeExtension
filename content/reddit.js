// Reddit content script.
// Depends on globals from the scripts listed before it in manifest.json.
//
// Built for the current site (www.reddit.com). It also runs on old.reddit.com,
// where the intention check and scroll nudge work but the hiding rules in
// reddit.css don't match anything.

// --- Selectors ---
// Reddit's current site is built from custom elements (shreddit-*, faceplate-*),
// whose tag names have been more stable than its classes. Keep every selector
// the script relies on here; selectors used only for hiding live in reddit.css.
const SELECTORS = {
  // Elements that render counts inside their own shadow DOM, where reddit.css can't reach.
  shadowHosts:
    "shreddit-post, shreddit-comment, shreddit-comment-action-row, shreddit-subreddit-header",
  // Posts in an infinite feed: Block mode marks the ones already loaded and hides the rest.
  feedItems: "shreddit-feed :is(article, shreddit-post, shreddit-ad-post)"
};

// Injected into each shadow root above when Hide metrics is on.
const SHADOW_STYLE_ID = "sm-shadow-metrics";
const SHADOW_CSS = "faceplate-number { visibility: hidden !important; }";

// --- State ---
// Per-page state, reset on every navigation.
let feedHasBottom = false; // Block mode: feed loading has been stopped

// --- Helpers ---

// "front" pages are the discovery feeds the intention check guards. Opening a
// specific community or a post (say, from a Google result) goes straight through.
function pageType() {
  const path = location.pathname;
  if (path.includes("/comments/")) return "post";
  if (/^\/((best|hot|new|top|rising)\/?)?$|^\/r\/(popular|all)(\/|$)|^\/home\/?$/.test(path)) {
    return "front";
  }
  if (/^\/(r|user|u)\/[^/]+\/?$/.test(path) || /^\/r\/[^/]+\/(hot|new|top|rising)\/?$/.test(path)) {
    return "listing";
  }
  return "other";
}

// --- Feature: intention check ---

const INTENTION = {
  siteName: "Reddit",
  reasons: [
    { value: "question", label: "Find an answer to a question", studying: true },
    { value: "community", label: "Read a class or study community", studying: true },
    { value: "break", label: "Taking a quick break", studying: false },
    { value: "unsure", label: "Not sure / just opened it", studying: false }
  ],
  placeholder: 'What exactly? (optional, e.g. "r/learnmath, eigenvalues")'
};

// --- Feature: hide metrics ---
// Vote, comment, member, and karma counts all render through <faceplate-number>.
// reddit.css hides the ones in the page; this adds the same rule inside shadow
// roots. Shadow roots appear as posts load, so it re-runs on DOM changes.

function styleShadowRoots(root, enabled) {
  for (const host of root.querySelectorAll(SELECTORS.shadowHosts)) {
    const shadow = host.shadowRoot;
    if (!shadow) continue;
    const style = shadow.getElementById(SHADOW_STYLE_ID);
    if (enabled && !style) {
      shadow.append(el("style", { id: SHADOW_STYLE_ID, text: SHADOW_CSS }));
    } else if (!enabled && style) {
      style.remove();
    }
    styleShadowRoots(shadow, enabled); // nested hosts, e.g. an action row inside a comment
  }
}

const setShadowObserving = createPageObserver(() => styleShadowRoots(document, true), {
  throttleMs: MUTATION_THROTTLE_MS
});

function setShadowStyling(enabled) {
  styleShadowRoots(document, enabled);
  setShadowObserving(enabled);
}

function explainMetricsOnce() {
  explainOnce(STORAGE_KEYS.REDDIT_METRICS_EXPLAINED, {
    title: "Vote and comment counts are hidden",
    body: "Pick posts by whether they answer your question.",
    technique: TECHNIQUES.votes
  });
}

// --- Feature: endless-scroll nudge ---

const scrollNudge = createScrollNudge({
  siteName: "Reddit",
  isFeed: () => pageType() === "front" || pageType() === "listing",
  stopFeed: () => {
    for (const item of document.querySelectorAll(SELECTORS.feedItems)) {
      item.setAttribute("data-sm-seen", "");
    }
    feedHasBottom = true;
    applyPageClasses();
  }
});

// --- Applying settings ---

// Toggle the <html> classes that drive the CSS-only features.
function applyPageClasses() {
  const on = siteActive();
  const rd = settings.reddit;
  const html = document.documentElement.classList;
  html.toggle("sm-hide-metrics", on && rd.hideMetrics);
  setShadowStyling(on && rd.hideMetrics);
  html.toggle("sm-hide-sidebars", on && rd.hideSidebars);
  html.toggle("sm-feed-bottom", on && rd.scrollNudge && settings.mode === "block" && feedHasBottom);
}

function resetPage() {
  scrollNudge.reset();
  feedHasBottom = false;
}

function checkPage() {
  if (
    settings.reddit.intention &&
    pageType() === "front" &&
    !session.get("intentionAsked", false)
  ) {
    showIntentionScreen(INTENTION);
  }
}

function onActive() {
  if (settings.reddit.hideMetrics) explainMetricsOnce();
  renderIntentionBadge(INTENTION);
}

// --- Startup ---

// Reddit navigates between feeds and posts without full page loads.
// "auto" follows Reddit's own theme class, falling back to the system setting.
startSite({
  site: "reddit",
  spa: true,
  applyClasses: applyPageClasses,
  onUrlChange: resetPage,
  checkPage,
  onActive,
  isDark: () => {
    const html = document.documentElement.classList;
    if (html.contains("theme-dark")) return true;
    if (html.contains("theme-light")) return false;
    return systemPrefersDark();
  }
});
