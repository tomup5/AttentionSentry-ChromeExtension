// Content script for Wikipedia (all languages, desktop and mobile).

const SELECTORS = {
  heading: "#firstHeading",
  // hrefs can be absolute, root-relative or "./Title" depending on the renderer, so
  // isArticleLink() checks the resolved URL and filters out File:, Help:, etc.
  articleLinks: "#mw-content-text a[href]:not(.new, .external, .mw-file-description)",
  // Vector (desktop) and Minerva (mobile) search, including typeahead
  search:
    "#searchform, #vector-sticky-search-form, .vector-search-box, .cdx-typeahead-search, .minerva-search-form"
};

// Trimmed from the middle, the first page always stays
const TRAIL_MAX = 50;
const SAVED_MAX = 100;
// How long a clicked link or search still counts for the next page load
const NAVIGATION_WINDOW_MS = 60000;

function isArticle() {
  const body = document.body.classList;
  return body.contains("ns-0") && body.contains("action-view") && !body.contains("page-Main_Page");
}

function pageUrl(href = location.href) {
  const url = new URL(href, location.origin);
  return url.origin + url.pathname;
}

// throws on malformed escapes like "%E0%A4"
function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function articleTitle() {
  const heading = document.querySelector(SELECTORS.heading)?.textContent.trim();
  if (heading) return heading;
  return safeDecode(location.pathname.split("/wiki/")[1] ?? "").replace(/_/g, " ");
}

function isArticleLink(link) {
  const path = safeDecode(link.pathname);
  return (
    link.origin === location.origin && path.startsWith("/wiki/") && !path.slice(6).includes(":")
  );
}

// Trail of articles reached by following links from where you started. Searching,
// typing a URL or coming from another site starts over. Going back shortens it.

function recentNavigation(key) {
  const entry = session.get(key, null);
  return entry && Date.now() - entry.at < NAVIGATION_WINDOW_MS ? entry : null;
}

// Each page stores its own hop number because long trails lose their middle pages,
// so trail.length stops being the real distance.
function advanceTrail(trail, here, followedLink) {
  const onTrail = trail.findIndex((page) => page.url === here.url);
  if (onTrail !== -1) return { trail: trail.slice(0, onTrail + 1), moved: false }; // back, or reload
  if (!followedLink) return { trail: [{ ...here, hop: 0 }], moved: false };

  const next = [...trail, { ...here, hop: hopsAlong(trail) + 1 }];
  if (next.length > TRAIL_MAX) next.splice(1, next.length - TRAIL_MAX);
  return { trail: next, moved: true };
}

function hopsAlong(trail) {
  return trail[trail.length - 1]?.hop ?? 0;
}

// Block: every link past the limit. Hint/Pause: every limit-th link.
function isCheckInDue(hops, limit, mode) {
  if (hops < limit) return false;
  return mode === "block" || (hops - limit) % limit === 0;
}

function updateTrail() {
  const here = { title: articleTitle(), url: pageUrl() };
  const trail = session.get("trail", []);
  const last = trail[trail.length - 1];

  // Wikipedia usually only sends its origin as the referrer, so the recorded click is
  // the main signal and a full referrer is the backup
  const clicked = recentNavigation("clickedLink");
  const followedLink = Boolean(
    last &&
    !recentNavigation("searched") &&
    ((clicked && clicked.from === last.url) || pageUrl(document.referrer || "/") === last.url)
  );

  const result = advanceTrail(trail, here, followedLink);
  session.set("trail", result.trail);
  session.set("clickedLink", null);
  session.set("searched", null);
  return result;
}

function trailElement(trail) {
  const titles = trail.map((page) => page.title);
  const shown = titles.length > 6 ? [...titles.slice(0, 2), "…", ...titles.slice(-3)] : titles;
  const last = shown.pop();
  return el(
    "p",
    { class: "sm-trail" },
    shown.map((t) => `${t} → `).join(""),
    el("strong", { text: last })
  );
}

function goTo(url) {
  closeOverlay();
  location.href = url;
}

function startNewTopic() {
  const trail = session.get("trail", []);
  session.set(
    "trail",
    trail.slice(-1).map((page) => ({ ...page, hop: 0 }))
  );
  closeOverlay();
  renderTopicBadge();
}

function nudge(trail) {
  const hops = hopsAlong(trail);
  const start = trail[0];
  const here = trail[trail.length - 1];
  const reminder = intentionText() ?? `You started at "${start.title}".`;

  if (settings.mode === "hint") {
    showToast({
      title: `${hops} links away from "${start.title}"`,
      body: reminder,
      technique: TECHNIQUES.linkHopping
    });
    return;
  }

  const buttons = [];
  if (settings.wikipedia.saveTangents) {
    buttons.push({
      label: "Save for later and go back",
      onClick: async () => {
        await saveTangent(here);
        goTo(start.url);
      }
    });
  }
  buttons.push({
    label: `Back to "${start.title}"`,
    primary: true,
    onClick: () => goTo(start.url)
  });
  // Block only lets you through if you say this is what you're studying
  buttons.push(
    settings.mode === "pause"
      ? { label: "Keep reading", countdown: SHORT_COUNTDOWN_S, onClick: (close) => close() }
      : { label: "This is my new topic", onClick: startNewTopic }
  );

  showOverlay({
    title: `${hops} links from where you started`,
    body: "Is this still part of what you're studying?",
    technique: TECHNIQUES.linkHopping,
    content: trailElement(trail),
    buttons,
    pauseVideos: false
  });
}

function handleArticle() {
  if (!isArticle()) return;
  const { trail, moved } = updateTrail();
  renderTopicBadge();

  if (!settings.wikipedia.rabbitHole || !moved || isOverlayOpen()) return;
  if (isCheckInDue(hopsAlong(trail), settings.wikipedia.hopLimit, settings.mode)) nudge(trail);
}

// Bottom-left link back to the start of the trail
function renderTopicBadge() {
  removeBadge();
  const trail = session.get("trail", []);
  const wp = settings.wikipedia;
  if (!siteActive() || !wp.rabbitHole || !wp.topicBadge || trail.length < 2) return;
  showBadge({
    label: "Topic",
    text: trail[0].title,
    title: "Back to where you started",
    onClick: () => goTo(trail[0].url)
  });
}

// updateTrail() reads these on the next page. Capture phase so Wikipedia's own
// handlers can't stop it.
function watchNavigation() {
  document.addEventListener(
    "click",
    /** @param {any} event */ (event) => {
      if (!siteActive()) return;
      const link = event.target.closest?.("a[href]");
      if (!link) return;
      if (event.target.closest(SELECTORS.search)) {
        session.set("searched", { at: Date.now() });
      } else if (isArticleLink(link)) {
        session.set("clickedLink", { from: pageUrl(), at: Date.now() });
      }
    },
    true
  );
  document.addEventListener(
    "submit",
    /** @param {any} event */ (event) => {
      if (siteActive() && event.target.closest?.(SELECTORS.search)) {
        session.set("searched", { at: Date.now() });
      }
    },
    true
  );
}

// Saved links go in local storage and show up in the popup's Wikipedia section

const SAVE_DELAY_MS = 300;
const HIDE_DELAY_MS = 400;
const SAVED_TOAST_MS = 4000;
const SAVE_BUTTON_HEIGHT = 30;
const SAVE_BUTTON_GAP = 4;
const VIEWPORT_MARGIN = 8;

let saveButton = null;
let hoveredLink = null;
let showTimer = null;
let hideTimer = null;

async function saveTangent({ title, url }) {
  /** @type {Record<string, any>} */
  const { [STORAGE_KEYS.SAVED_TANGENTS]: savedTangents = [] } = await chrome.storage.local.get(
    STORAGE_KEYS.SAVED_TANGENTS
  );
  const from = session.get("trail", [])[0]?.title ?? articleTitle();
  const saved = [
    { title, url, from, savedAt: Date.now() },
    ...savedTangents.filter((item) => item.url !== url)
  ].slice(0, SAVED_MAX);
  await chrome.storage.local.set({ [STORAGE_KEYS.SAVED_TANGENTS]: saved });
}

async function onSaveClick() {
  const link = hoveredLink;
  hideSaveButton();
  if (!link) return;
  const title = link.title || link.textContent.trim();
  await saveTangent({ title, url: pageUrl(link.href) });

  // Full explanation once per tab, short confirmation after that
  const first = !session.get("tangentExplained", false);
  session.set("tangentExplained", true);
  showToast({
    title: `Saved "${title}" for later`,
    body: "Find it in the Attention Sentry popup when you're done studying.",
    technique: first ? TECHNIQUES.saveForLater : null,
    duration: first ? TOAST_DURATION_MS : SAVED_TOAST_MS
  });
}

function showSaveButton(link) {
  hoveredLink = link;
  if (!saveButton) {
    saveButton = el("button", { id: "sm-save-link", text: "Save for later", onclick: onSaveClick });
    saveButton.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    saveButton.addEventListener("mouseleave", scheduleHide);
  }
  const rect = link.getBoundingClientRect();
  // Above the link so it doesn't cover Wikipedia's preview popup
  const fitsAbove = rect.top > SAVE_BUTTON_HEIGHT + SAVE_BUTTON_GAP;
  const top = fitsAbove ? rect.top - SAVE_BUTTON_HEIGHT : rect.bottom + SAVE_BUTTON_GAP;
  saveButton.style.top = `${top}px`;
  saveButton.style.left = `${Math.max(VIEWPORT_MARGIN, rect.left)}px`;
  document.body.append(saveButton);
}

function hideSaveButton() {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  saveButton?.remove();
  hoveredLink = null;
}

function scheduleHide() {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideSaveButton, HIDE_DELAY_MS);
}

function watchLinkHover() {
  document.addEventListener(
    "mouseover",
    /** @param {any} event */ (event) => {
      if (!siteActive() || !settings.wikipedia.saveTangents) return;
      const link = event.target.closest?.(SELECTORS.articleLinks);
      if (!link || !isArticleLink(link) || pageUrl(link.href) === pageUrl()) return;
      clearTimeout(hideTimer);
      if (link === hoveredLink) return;
      clearTimeout(showTimer);
      showTimer = setTimeout(() => showSaveButton(link), SAVE_DELAY_MS);
    }
  );
  document.addEventListener(
    "mouseout",
    /** @param {any} event */ (event) => {
      if (event.target.closest?.(SELECTORS.articleLinks)) scheduleHide();
    }
  );
  // Button is fixed-position and would drift away from the link
  window.addEventListener("scroll", hideSaveButton, { passive: true });
}

function applyPageClasses() {
  const on = siteActive();
  document.documentElement.classList.toggle(
    "sm-hide-main-page",
    on && settings.wikipedia.hideMainPage
  );
}

let articleHandled = false;

function resetPage() {
  articleHandled = false;
}

// Only update the trail once per page load, settings changes just redraw the badge
function checkPage() {
  if (articleHandled) {
    renderTopicBadge();
  } else {
    articleHandled = true;
    handleArticle();
  }
}

function onActive() {
  if (!settings.wikipedia.saveTangents) hideSaveButton();
}

watchNavigation();
watchLinkHover();

// "auto" follows Wikipedia's own dark mode
startSite({
  site: "wikipedia",
  applyClasses: applyPageClasses,
  onUrlChange: resetPage,
  checkPage,
  onActive,
  onInactive: hideSaveButton,
  isDark: () => {
    const html = document.documentElement.classList;
    if (html.contains("skin-theme-clientpref-night")) return true;
    if (html.contains("skin-theme-clientpref-day")) return false;
    return systemPrefersDark();
  }
});
