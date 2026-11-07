// YouTube content script.
// Depends on globals from settings.js, techniques.js, ui.js, and common.js (see manifest load order).

// --- Selectors ---
// YouTube renames elements often; keep every selector the script relies on here.
// Selectors used only for hiding live in youtube.css.
const SELECTORS = {
  autoplayToggle: ".ytp-autonav-toggle-button",
  sidebar: "#secondary-inner, #secondary",
  mainVideo: "#movie_player video"
};

// --- State ---
// Per-page state, reset on every navigation.
let feedHasBottom = false; // Block mode: feed loading has been stopped
let shortsSeenOnThisVisit = 0;
let lastHref = null;
let lastHandledVideo = null;
let lastCountedShort = null; // so a settings change doesn't count the same Short twice

// --- Helpers ---

function pageType() {
  const path = location.pathname;
  if (path === "/watch") return "watch";
  if (path.startsWith("/shorts/")) return "shorts";
  if (path === "/" || path.startsWith("/results") || path.startsWith("/feed/")) return "feed";
  return "other";
}

function currentVideoId() {
  return new URLSearchParams(location.search).get("v");
}

function resumeMainVideo() {
  document
    .querySelector(SELECTORS.mainVideo)
    ?.play()
    .catch(() => {});
}

// --- Feature: intention check ---

const INTENTION = {
  siteName: "YouTube",
  reasons: [
    { value: "lecture", label: "Watch a lecture / tutorial", studying: true },
    { value: "research", label: "Research for an assignment", studying: true },
    { value: "break", label: "Taking a quick break", studying: false },
    { value: "unsure", label: "Not sure / just opened it", studying: false }
  ],
  placeholder: 'What exactly? (optional, e.g. "Khan Academy, integrals")',
  onAccept: () => {
    if (pageType() === "watch") resumeMainVideo();
  }
};

// --- Feature: hide metrics ---
// Hiding is done in youtube.css, gated by a class on <html>. Most metrics are
// found by their text ("1.2M views") rather than by selector: YouTube has
// several card components (videos, Shorts, sidebar) whose markup and class
// names change often, but the text format is stable. A combined line such as
// "1.2M views • 2 days ago" is hidden whole, since CSS can't hide part of a text node.
//
// Matches are marked with a data attribute, not a class: YouTube's renderer
// overwrites the whole class attribute when it re-renders a component.

const METRIC_PART =
  /^(no|[\d.,]+\s*([KMB]|thousand|million|billion)?)\s+(views?|subscribers?|watching|videos?)$/i;
// Cheap pre-check on a single text node before reading its parent's full text.
const METRIC_WORD = /\b(views?|subscribers?|watching|videos?)\b/i;
// Longer text is a container or a title, never a metadata line.
const METRIC_MAX_LENGTH = 80;

let metricsObserver = null;

function isMetricText(text) {
  if (!text || text.length > METRIC_MAX_LENGTH) return false;
  return text.split(/\s*[•·]\s*/).some((part) => METRIC_PART.test(part));
}

// Compact cards show only "1M" next to a play icon; the unit is only in the
// aria-label ("1 million views").
function evaluateMetric(el) {
  const isMetric =
    isMetricText(el.textContent.trim()) || isMetricText(el.getAttribute("aria-label")?.trim());
  el.toggleAttribute("data-sm-metric", isMetric);
}

// Checks a few ancestors, since a metric can be split across styled spans
// ("<span>1.2M</span><span> views</span>"). Already-tagged ancestors are
// re-checked because YouTube recycles cards with new text.
function tagMetricText(textNode) {
  const hasMetricWord =
    METRIC_WORD.test(textNode.data) ||
    METRIC_WORD.test(textNode.parentElement?.getAttribute("aria-label") ?? "");
  let el = textNode.parentElement;
  for (let depth = 0; el && depth < 3; depth++, el = el.parentElement) {
    if (!hasMetricWord && !el.hasAttribute("data-sm-metric")) continue;
    evaluateMetric(el);
    if (el.hasAttribute("data-sm-metric")) return;
  }
}

function tagMetricsIn(root) {
  if (root.nodeType === Node.TEXT_NODE) return tagMetricText(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) tagMetricText(walker.currentNode);
}

// Only the changed nodes are scanned. Observer callbacks run before paint, so counts never flash.
function onMetricMutations(records) {
  for (const record of records) {
    if (record.type === "characterData") {
      tagMetricText(record.target);
    } else {
      if (record.target.hasAttribute?.("data-sm-metric")) evaluateMetric(record.target);
      record.addedNodes.forEach(tagMetricsIn);
    }
  }
}

function setMetricTagging(enabled) {
  if (enabled && !metricsObserver) {
    tagMetricsIn(document.body);
    metricsObserver = new MutationObserver(onMetricMutations);
    metricsObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
  } else if (!enabled && metricsObserver) {
    metricsObserver.disconnect();
    metricsObserver = null;
  }
}

async function explainMetricsOnce() {
  const { metricsExplained } = await chrome.storage.local.get("metricsExplained");
  if (metricsExplained) return;
  await chrome.storage.local.set({ metricsExplained: true });
  showToast({
    title: "View counts and likes are hidden",
    body: "Pick videos by whether they'll help you study.",
    technique: TECHNIQUES.socialProof
  });
}

// --- Feature: endless-scroll nudge ---

// Block mode hides the continuation element that triggers loading more (see youtube.css).
const scrollNudge = createScrollNudge({
  siteName: "YouTube",
  isFeed: () => pageType() === "feed",
  stopFeed: () => {
    feedHasBottom = true;
    applyPageClasses();
  }
});

// Shorts don't scroll the page; each swipe is a new URL, so count visits instead.
function onShortsVisit() {
  if (!settings.youtube.scrollNudge || location.href === lastCountedShort) return;
  lastCountedShort = location.href;
  shortsSeenOnThisVisit++;
  if (shortsSeenOnThisVisit < settings.youtube.scrollScreens || isOverlayOpen()) return;
  shortsSeenOnThisVisit = 0;

  const title = `${settings.youtube.scrollScreens} Shorts in a row`;
  if (settings.mode === "hint") {
    showToast({ title, technique: TECHNIQUES.shorts });
  } else {
    showOverlay({
      title,
      body:
        settings.mode === "block"
          ? "Shorts are off-limits in Block mode once you've hit your limit."
          : "Was any of that for your studying?",
      technique: TECHNIQUES.shorts,
      buttons:
        settings.mode === "block"
          ? [{ label: "Close YouTube", primary: true, onClick: closeTab }]
          : [
              { label: "Close YouTube", primary: true, onClick: closeTab },
              { label: "Keep watching", countdown: 10, onClick: (close) => close() }
            ]
    });
  }
}

// --- Feature: rabbit-hole guard ---

async function disableAutoplay() {
  const toggle = await waitFor(SELECTORS.autoplayToggle);
  if (!toggle) return;
  // Clicking the real toggle (rather than hiding it) lets YouTube persist the preference.
  if (toggle.getAttribute("aria-checked") === "true") {
    toggle.click();
    if (!session.get("autoplayExplained", false)) {
      session.set("autoplayExplained", true);
      showToast({ title: "Autoplay turned off", technique: TECHNIQUES.autoplay });
    }
  }
}

// Hint and Pause modes keep the sidebar but label it.
async function labelSidebar() {
  const sidebar = await waitFor(SELECTORS.sidebar);
  if (!sidebar || document.getElementById("sm-sidebar-label")) return;
  sidebar.prepend(
    el(
      "div",
      { id: "sm-sidebar-label" },
      el("strong", { text: `${TECHNIQUES.recommendations.name}. ` }),
      TECHNIQUES.recommendations.why
    )
  );
}

// Returns the new number of distinct videos this session, or null for a rewatch.
function recordVideo(id) {
  const seen = session.get("videosSeen", []);
  if (seen.includes(id)) return null;
  seen.push(id);
  session.set("videosSeen", seen);
  return seen.length;
}

function handleWatchPage() {
  const id = currentVideoId();
  if (!id || id === lastHandledVideo) return;
  lastHandledVideo = id;

  // Counted even with the guard off, for the popup's session summary.
  const count = recordVideo(id);
  if (!settings.youtube.rabbitHole) return;

  disableAutoplay();
  if (settings.mode !== "block") labelSidebar();

  if (count === null || count < 2 || isOverlayOpen()) return;

  const reminder = intentionText()
    ? `You came here for: ${intentionText()}`
    : "Is this still part of what you're studying?";

  if (settings.mode === "hint") {
    showToast({
      title: `Video #${count} this study session`,
      body: reminder,
      technique: TECHNIQUES.recommendations
    });
  } else {
    showOverlay({
      title: `Video #${count}: is this for your studying?`,
      body: reminder,
      technique: TECHNIQUES.recommendations,
      buttons: [
        { label: "Go back", onClick: goBack },
        {
          label: "Yes, it's for studying",
          primary: true,
          countdown: settings.mode === "pause" ? 5 : 0,
          onClick: (close) => {
            close();
            resumeMainVideo();
          }
        }
      ]
    });
  }
}

// --- Applying settings ---

// Toggle the <html> classes that drive the CSS-only features.
function applyPageClasses() {
  const on = siteActive();
  const yt = settings.youtube;
  const html = document.documentElement.classList;
  html.toggle("sm-hide-metrics", on && yt.hideMetrics);
  setMetricTagging(on && yt.hideMetrics);
  html.toggle("sm-blur-thumbs", on && yt.hideMetrics && yt.blurThumbnails);
  html.toggle("sm-rabbit-block", on && yt.rabbitHole && settings.mode === "block");
  html.toggle("sm-feed-bottom", on && yt.scrollNudge && settings.mode === "block" && feedHasBottom);

  if (!(on && yt.rabbitHole && settings.mode !== "block")) {
    document.getElementById("sm-sidebar-label")?.remove();
  }
}

function onNavigate() {
  if (location.href === lastHref) return;
  lastHref = location.href;

  scrollNudge.reset();
  feedHasBottom = false;
  if (pageType() !== "shorts") shortsSeenOnThisVisit = 0;
  document.getElementById("sm-sidebar-label")?.remove();
  applyPageClasses();

  if (!siteActive()) return;
  // Checked on every navigation, not just at startup: "Back to studying" may
  // only go back to another YouTube page, which mustn't skip the question.
  if (settings.youtube.intention && !session.get("intentionAsked", false)) {
    showIntentionScreen(INTENTION);
  }
  if (pageType() === "watch") handleWatchPage();
  if (pageType() === "shorts") onShortsVisit();
}

// Runs at startup and on every settings change.
function applyAll() {
  applyPageClasses();

  if (!siteActive()) {
    clearAllUI();
    removeBadge();
    return;
  }

  if (settings.youtube.hideMetrics) explainMetricsOnce();
  renderIntentionBadge(INTENTION);

  // Force the page logic to re-run in case Attention Sentry was just enabled.
  lastHref = null;
  lastHandledVideo = null;
  onNavigate();
}

// --- Startup ---

// YouTube is a single-page app, so the content script only runs once.
// startSite() polls the URL because Shorts swipes don't always fire YouTube's
// own navigation event. onNavigate() is a no-op if the URL is unchanged.
// "auto" follows YouTube's own dark theme ([dark] on <html>).
startSite({
  site: "youtube",
  apply: applyAll,
  onNavigate,
  isDark: () => document.documentElement.hasAttribute("dark")
}).then(() => document.addEventListener("yt-navigate-finish", onNavigate));
