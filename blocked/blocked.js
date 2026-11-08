// Shown in place of a blocked site. The redirect rule in background.js passes
// the original URL in the hash.

const UNLOCK_COUNTDOWN = 15; // seconds before the unlock button works, in Pause mode

const BODY = {
  hint: `You can still open it, and it'll stay open for ${UNLOCK_MINUTES} minutes.`,
  pause: `If you still need it after a short wait, you can open it for ${UNLOCK_MINUTES} minutes.`,
  block: "It opens again when you turn Attention Sentry off."
};

const blockedUrl = parseBlockedUrl(location.hash.slice(1));
const prefersDark = matchMedia("(prefers-color-scheme: dark)");

let settings;

// This page is web-accessible, so any site can open it with any hash.
// Only ever send the user on to an ordinary web page.
function parseBlockedUrl(raw) {
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

async function isUnlocked(site) {
  const { unlocks = {} } = await chrome.storage.session.get("unlocks");
  return unlocks[site.id] > Date.now();
}

function applyTheme() {
  applyAppearance(document, settings.appearance, prefersDark.matches, "sm-");
}

async function render() {
  applyTheme();

  const site = blockedUrl && siteForHost(chosenSites(settings), blockedUrl.hostname);

  // Blocking was turned off or the site unlocked (maybe from another tab): carry on to it.
  if (blockedUrl && (!site || !isBlockingOn(settings) || (await isUnlocked(site)))) {
    location.replace(blockedUrl.href);
    return;
  }

  const label = site?.label ?? "This site";
  document.title = `${label} blocked · Attention Sentry`;

  closeOverlay();
  showOverlay({
    title: `${label} is blocked while you study`,
    body: BODY[settings.mode],
    content: blockedUrl ? el("p", { class: "sm-url", text: blockedUrl.href }) : null,
    buttons: buttons(site),
    pauseVideos: false
  });
}

function buttons(site) {
  const list = [{ label: "Back to studying", primary: true, onClick: leave }];
  if (site && settings.mode !== "block") {
    list.unshift({
      label: settings.mode === "hint" ? "Open anyway" : `Open for ${UNLOCK_MINUTES} minutes`,
      countdown: settings.mode === "pause" ? UNLOCK_COUNTDOWN : 0,
      onClick: () => unlock(site)
    });
  }
  return list;
}

function leave() {
  if (history.length > 1) history.back();
  else chrome.runtime.sendMessage({ type: "closeTab" });
}

async function unlock(site) {
  const unlocked = await chrome.runtime.sendMessage({ type: "unlockSite", siteId: site.id });
  if (unlocked) location.replace(blockedUrl.href);
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) settings = mergeSettings(changes.settings.newValue);
  if (settings && (changes.settings || changes.unlocks)) render();
});

prefersDark.addEventListener("change", () => settings && applyTheme());

loadSettings().then((loaded) => {
  settings = loaded;
  render();
});
