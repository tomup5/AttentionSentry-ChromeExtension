// Wikipedia content script (every language, desktop and mobile).
// Depends on globals from settings.js, techniques.js, ui.js, and common.js (see manifest load order).

// --- Selectors ---
// Selectors used only for hiding live in wikipedia.css.
const SELECTORS = {
  heading: "#firstHeading",
  // Links in the article text. Their href may be absolute, root-relative, or
  // "./Title" depending on the renderer, so isArticleLink() checks the resolved
  // URL and drops namespaced pages (File:, Help:, Special:...).
  articleLinks: "#mw-content-text a[href]:not(.new, .external, .mw-file-description)",
  // Desktop (Vector) and mobile (Minerva) search boxes, including typeahead suggestions.
  search: "#searchform, #vector-sticky-search-form, .vector-search-box, .cdx-typeahead-search, .minerva-search-form"
};

// The trail keeps its first page and the most recent ones.
const TRAIL_MAX = 50;
const SAVED_MAX = 100;
// A clicked link or a search counts for the page load that follows it within this long.
const NAVIGATION_WINDOW_MS = 60000;

// --- Helpers ---

function isArticle() {
  const body = document.body.classList;
  return body.contains("ns-0") && body.contains("action-view") && !body.contains("page-Main_Page");
}

function pageUrl(href = location.href) {
  const url = new URL(href, location.origin);
  return url.origin + url.pathname;
}

// decodeURIComponent throws on malformed escapes like "%E0%A4".
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
  return link.origin === location.origin && path.startsWith("/wiki/") && !path.slice(6).includes(":");
}

// --- Feature: rabbit-hole tracker ---
// Each tab keeps a trail of the articles reached by following links from the
// page you started on. Searching, typing a URL, or arriving from another site
// starts a new trail. Going back to a page on the trail shortens it.

function recentNavigation(key) {
  const entry = session.get(key, null);
  return entry && Date.now() - entry.at < NAVIGATION_WINDOW_MS ? entry : null;
}

function updateTrail() {
  const here = { title: articleTitle(), url: pageUrl() };
  let trail = session.get("trail", []);
  const last = trail[trail.length - 1];
  const onTrail = trail.findIndex((page) => page.url === here.url);

  // Wikipedia usually sends only its origin as the referrer, so a recorded
  // link click is the main signal; a full referrer is used when there is one.
  const clicked = recentNavigation("clickedLink");
  const followedLink =
    last &&
    !recentNavigation("searched") &&
    ((clicked && clicked.from === last.url) || pageUrl(document.referrer || "/") === last.url);

  let moved = false;
  if (onTrail !== -1) {
    trail = trail.slice(0, onTrail + 1); // went back, or reloaded
  } else if (followedLink) {
    trail.push(here);
    if (trail.length > TRAIL_MAX) trail.splice(1, trail.length - TRAIL_MAX);
    moved = true;
  } else {
    trail = [here];
  }

  session.set("trail", trail);
  session.set("clickedLink", null);
  session.set("searched", null);
  return { trail, moved };
}

function trailElement(trail) {
  const titles = trail.map((page) => page.title);
  const shown = titles.length > 6 ? [...titles.slice(0, 2), "…", ...titles.slice(-3)] : titles;
  const last = shown.pop();
  return el("p", { class: "sm-trail" }, shown.map((t) => `${t} → `).join(""), el("strong", { text: last }));
}

function goTo(url) {
  closeOverlay();
  location.href = url;
}

function startNewTopic() {
  const trail = session.get("trail", []);
  session.set("trail", trail.slice(-1));
  closeOverlay();
  renderTopicBadge();
}

function nudge(trail) {
  const hops = trail.length - 1;
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
  buttons.push({ label: `Back to "${start.title}"`, primary: true, onClick: () => goTo(start.url) });
  // Block mode, like YouTube's, lets you through only by saying this is what you're studying.
  buttons.push(
    settings.mode === "pause"
      ? { label: "Keep reading", countdown: 5, onClick: (close) => close() }
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

  const hops = trail.length - 1;
  const limit = settings.wikipedia.hopLimit;
  if (!settings.wikipedia.rabbitHole || !moved || hops < limit || isOverlayOpen()) return;
  // Block checks in on every link past the limit; Hint and Pause every `limit` links.
  if (settings.mode === "block" || (hops - limit) % limit === 0) nudge(trail);
}

// Bottom-left link back to the first page of the trail, once you've left it.
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

// Remember which link was clicked and whether a search was made, for updateTrail()
// on the next page. Capture phase, so Wikipedia's own handlers can't stop it.
function watchNavigation() {
  document.addEventListener(
    "click",
    (event) => {
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
    (event) => {
      if (siteActive() && event.target.closest?.(SELECTORS.search)) {
        session.set("searched", { at: Date.now() });
      }
    },
    true
  );
}

// --- Feature: save tangents ---
// Hovering an article link shows a "Save for later" button. Saved links are
// kept in chrome.storage.local and listed in the popup's Wikipedia section.

const SAVE_DELAY_MS = 300;
const HIDE_DELAY_MS = 400;

let saveButton = null;
let hoveredLink = null;
let showTimer = null;
let hideTimer = null;

async function saveTangent({ title, url }) {
  const { savedTangents = [] } = await chrome.storage.local.get("savedTangents");
  const from = session.get("trail", [])[0]?.title ?? articleTitle();
  const saved = [
    { title, url, from, savedAt: Date.now() },
    ...savedTangents.filter((item) => item.url !== url)
  ].slice(0, SAVED_MAX);
  await chrome.storage.local.set({ savedTangents: saved });
}

async function onSaveClick() {
  const link = hoveredLink;
  hideSaveButton();
  if (!link) return;
  const title = link.title || link.textContent.trim();
  await saveTangent({ title, url: pageUrl(link.href) });

  // The explanation shows once per tab; after that a short confirmation is enough.
  const first = !session.get("tangentExplained", false);
  session.set("tangentExplained", true);
  showToast({
    title: `Saved "${title}" for later`,
    body: "Find it in the Attention Sentry popup when you're done studying.",
    technique: first ? TECHNIQUES.saveForLater : null,
    duration: first ? 12000 : 4000
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
  // Above the link, where it won't cover Wikipedia's own preview popup below it.
  const top = rect.top > 34 ? rect.top - 30 : rect.bottom + 4;
  saveButton.style.top = `${top}px`;
  saveButton.style.left = `${Math.max(8, rect.left)}px`;
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
  document.addEventListener("mouseover", (event) => {
    if (!siteActive() || !settings.wikipedia.saveTangents) return;
    const link = event.target.closest?.(SELECTORS.articleLinks);
    if (!link || !isArticleLink(link) || pageUrl(link.href) === pageUrl()) return;
    clearTimeout(hideTimer);
    if (link === hoveredLink) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => showSaveButton(link), SAVE_DELAY_MS);
  });
  document.addEventListener("mouseout", (event) => {
    if (event.target.closest?.(SELECTORS.articleLinks)) scheduleHide();
  });
  // The button is fixed-position, so it would drift away from its link.
  window.addEventListener("scroll", hideSaveButton, { passive: true });
}

// --- Applying settings ---

function applyPageClasses() {
  const on = siteActive();
  document.documentElement.classList.toggle(
    "sm-hide-main-page",
    on && settings.wikipedia.hideMainPage
  );
}

let articleHandled = false;

// Runs at startup and on every settings change.
function applyAll() {
  applyPageClasses();

  if (!siteActive()) {
    clearAllUI();
    removeBadge();
    hideSaveButton();
    return;
  }
  if (!settings.wikipedia.saveTangents) hideSaveButton();

  // The trail is updated once per page load; settings changes only redraw the badge.
  if (articleHandled) {
    renderTopicBadge();
  } else {
    articleHandled = true;
    handleArticle();
  }
}

// --- Startup ---

// Pages restored from the back/forward cache count as a new page load for the trail.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) articleHandled = false;
});

watchNavigation();
watchLinkHover();

// Wikipedia does full page loads, so there's no navigation to poll for.
// "auto" follows Wikipedia's own dark mode setting.
startSite({
  site: "wikipedia",
  apply: applyAll,
  isDark: () => {
    const html = document.documentElement.classList;
    if (html.contains("skin-theme-clientpref-night")) return true;
    if (html.contains("skin-theme-clientpref-day")) return false;
    return matchMedia("(prefers-color-scheme: dark)").matches;
  }
});
