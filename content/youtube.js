// Content script for YouTube.

// YouTube renames things constantly, so every selector the script uses is here
const SELECTORS = {
  autoplayToggle: ".ytp-autonav-toggle-button",
  sidebar: "#secondary-inner, #secondary",
  mainVideo: "#movie_player video"
};

// Reset on navigation
let feedHasBottom = false; // Block mode stopped the feed
let shortsSeenOnThisVisit = 0;
let lastCountedShort = null; // so a settings change doesn't double count

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
  const video = /** @type {HTMLVideoElement} */ (document.querySelector(SELECTORS.mainVideo));
  video?.play().catch(() => {});
}

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

// Most metrics get matched by their text ("1.2M views") instead of a selector. There
// are several card components and their markup keeps changing, but the text doesn't.
// "1.2M views • 2 days ago" gets hidden whole, CSS can't hide part of a text node.
//
// Using a data attribute because YouTube overwrites class when it re-renders.

const METRIC_PART =
  /^(no|[\d.,]+\s*([KMB]|thousand|million|billion)?)\s+(views?|subscribers?|watching|videos?)$/i;
// Cheap check before reading the parent's full text
const METRIC_WORD = /\b(views?|subscribers?|watching|videos?)\b/i;
// Anything longer is a container or a title
const METRIC_MAX_LENGTH = 80;

function isMetricText(text) {
  if (!text || text.length > METRIC_MAX_LENGTH) return false;
  return text.split(/\s*[•·]\s*/).some((part) => METRIC_PART.test(part));
}

// Compact cards show "1M" next to a play icon, the unit is only in the aria-label
function evaluateMetric(element) {
  const isMetric =
    isMetricText(element.textContent.trim()) ||
    isMetricText(element.getAttribute("aria-label")?.trim());
  element.toggleAttribute("data-sm-metric", isMetric);
}

// Walks up a few levels since a metric can be split across spans
// ("<span>1.2M</span><span> views</span>"). Re-checks tagged ancestors because
// YouTube recycles cards with new text.
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

// Observer callbacks run before paint, so counts never flash
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

// Not throttled on purpose, counts have to be tagged before paint
const setMetricTagging = createPageObserver(onMetricMutations, {
  observe: { childList: true, characterData: true, subtree: true },
  onStart: () => tagMetricsIn(document.body)
});

function explainMetricsOnce() {
  explainOnce(STORAGE_KEYS.YOUTUBE_METRICS_EXPLAINED, {
    title: "I hid YouTube's scoreboard",
    body: "Now you can pick videos based on if they'll actually help.",
    technique: TECHNIQUES.socialProof
  });
}

// Block mode hides the continuation element that loads more (youtube.css)
const scrollNudge = createScrollNudge({
  siteName: "YouTube",
  isFeed: () => pageType() === "feed",
  stopFeed: () => {
    feedHasBottom = true;
    applyPageClasses();
  }
});

// Shorts don't scroll the page, each swipe is a new URL, so count visits
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
          ? "YouTube would've kept these coming forever, so Shorts are done for now."
          : "YouTube would've kept these coming forever. Any of them for class?",
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

async function disableAutoplay() {
  const toggle = await waitFor(SELECTORS.autoplayToggle);
  if (!toggle) return;
  // Click the real toggle so YouTube remembers the preference
  if (toggle.getAttribute("aria-checked") === "true") {
    toggle.click();
    if (!session.get("autoplayExplained", false)) {
      session.set("autoplayExplained", true);
      showToast({ title: "Killed autoplay", technique: TECHNIQUES.autoplay });
    }
  }
}

// Hint and Pause keep the sidebar but label it
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

  // Counted even with the guard off, the popup shows it
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
  // Checked on every page: "Back to studying" might only land on another YouTube
  // page and that shouldn't skip the question
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

// Shorts swipes don't always fire yt-navigate-finish, so the URL gets polled too.
// "auto" follows YouTube's dark theme ([dark] on <html>).
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
