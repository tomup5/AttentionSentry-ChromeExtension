// YouTube content script.
// Depends on globals from the scripts listed before it in manifest.json.

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

function isMetricText(text) {
  if (!text || text.length > METRIC_MAX_LENGTH) return false;
  return text.split(/\s*[•·]\s*/).some((part) => METRIC_PART.test(part));
}

// Compact cards show only "1M" next to a play icon; the unit is only in the
// aria-label ("1 million views").
function evaluateMetric(element) {
  const isMetric =
    isMetricText(element.textContent.trim()) ||
    isMetricText(element.getAttribute("aria-label")?.trim());
  element.toggleAttribute("data-sm-metric", isMetric);
}

// Checks a few ancestors, since a metric can be split across styled spans
// ("<span>1.2M</span><span> views</span>"). Already-tagged ancestors are
// re-checked because YouTube recycles cards with new text.
function tagMetricText(textNode) {
  const hasMetricWord =
    METRIC_WORD.test(textNode.data) ||
    METRIC_WORD.test(textNode.parentElement?.getAttribute("aria-label") ?? "");
  let element = textNode.parentElement;
  for (let depth = 0; element && depth < 3; depth++, element = element.parentElement) {
    if (!hasMetricWord && !element.hasAttribute("data-sm-metric")) continue;
    evaluateMetric(element);
    if (element.hasAttribute("data-sm-metric")) return;
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

// Unthrottled, so counts are tagged before the browser paints them.
const setMetricTagging = createPageObserver(onMetricMutations, {
  observe: { childList: true, characterData: true, subtree: true },
  onStart: () => tagMetricsIn(document.body)
});

function explainMetricsOnce() {
  explainOnce(STORAGE_KEYS.YOUTUBE_METRICS_EXPLAINED, {
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
              { label: "Keep watching", countdown: LONG_COUNTDOWN_S, onClick: (close) => close() }
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

function handleWatchPage() {
  const id = currentVideoId();
  if (!id) return;

  // Counted even with the guard off, for the popup's session summary.
  const count = session.addToSet("videosSeen", id);
  if (!settings.youtube.rabbitHole) return;

  disableAutoplay();
  if (settings.mode !== "block") labelSidebar();

  if (count === null || count < 2 || isOverlayOpen()) return;
  showCountCheckIn({
    noun: "Video",
    count,
    technique: TECHNIQUES.recommendations,
    onContinue: resumeMainVideo
  });
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

function resetPage() {
  scrollNudge.reset();
  feedHasBottom = false;
  if (pageType() !== "shorts") shortsSeenOnThisVisit = 0;
  document.getElementById("sm-sidebar-label")?.remove();
}

function checkPage() {
  // Checked on every page, not just at startup: "Back to studying" may only go
  // back to another YouTube page, which mustn't skip the question.
  if (settings.youtube.intention && !session.get("intentionAsked", false)) {
    showIntentionScreen(INTENTION);
  }
  if (pageType() === "watch") handleWatchPage();
  if (pageType() === "shorts") onShortsVisit();
}

function onActive() {
  if (settings.youtube.hideMetrics) explainMetricsOnce();
  renderIntentionBadge(INTENTION);
}

// --- Startup ---

// YouTube is a single-page app, and Shorts swipes don't always fire its own
// navigation event, so the URL is polled as well.
// "auto" follows YouTube's own dark theme ([dark] on <html>).
startSite({
  site: "youtube",
  spa: true,
  navigationEvent: "yt-navigate-finish",
  applyClasses: applyPageClasses,
  onUrlChange: resetPage,
  checkPage,
  onActive,
  isDark: () => document.documentElement.hasAttribute("dark")
});
